import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from '../config/db.js';
import { confirmPaidSessionBooking } from './sessionBilling.service.js';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export const newPaymentReference = () => `fnx-${randomUUID()}`;
export const moneyToCents = value => Math.round(Number(value) * 100);

export function verifyWebhookSignature(body, header, secret = process.env.PAYSTACK_SECRET_KEY) {
  if (!secret || !Buffer.isBuffer(body) || typeof header !== 'string' || !/^[a-f0-9]{128}$/i.test(header)) return false;
  const digest = createHmac('sha512', secret).update(body).digest('hex');
  return timingSafeEqual(Buffer.from(digest), Buffer.from(header.toLowerCase()));
}

async function paystack(path, { method = 'GET', body } = {}) {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw fail('Paystack is not configured', 503);
  let response;
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      method, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000)
    });
  } catch { throw fail('Payment provider is temporarily unavailable', 502); }
  if (!response.ok) throw Object.assign(fail('Payment provider rejected the request', 502), {
    initializationRejected: response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429
  });
  let result;
  try { result = await response.json(); }
  catch { throw fail('Invalid response from payment provider', 502); }
  if (!result.status || !result.data) throw Object.assign(fail('Invalid response from payment provider', 502), { initializationRejected: result.status === false });
  return result.data;
}

/** Initialize a hosted Paystack checkout; never trust a browser-supplied amount. */
export async function initiatePaystackCheckout(gymId, userId, invoiceId) {
  if (!Number.isSafeInteger(Number(invoiceId)) || Number(invoiceId) < 1) throw fail('Invalid invoice');
  // Fail before reserving an attempt if checkout configuration is missing.
  if (!process.env.PAYSTACK_SECRET_KEY) throw fail('Online payments are not configured', 503);
  const callback = process.env.PAYSTACK_CALLBACK_URL;
  if (callback) {
    let url;
    try { url = new URL(callback); } catch { throw fail('Invalid Paystack callback configuration', 503); }
    if (url.protocol !== 'https:' || url.username || url.password) throw fail('Invalid Paystack callback configuration', 503);
  }
  // Resolve abandoned/failed attempts before deciding whether an existing link is reusable.
  const { rows: [existing] } = await db.query(`SELECT p.reference FROM payments p
    JOIN invoices i ON i.id=p.invoice_id AND i.gym_id=p.gym_id
    WHERE p.invoice_id=$1 AND p.gym_id=$2 AND i.user_id=$3 AND p.provider='paystack' AND p.status='pending'`, [invoiceId, gymId, userId]);
  if (existing) await verifyAndSettle(existing.reference, { gymId, userId });
  const client = await db.connect();
  let payment;
  try {
    await client.query('BEGIN');
    const { rows: [invoice] } = await client.query(`SELECT i.*, u.email FROM invoices i
      JOIN users u ON u.id=i.user_id AND u.gym_id=i.gym_id
      WHERE i.id=$1 AND i.user_id=$2 AND i.gym_id=$3 FOR UPDATE OF i`, [invoiceId, userId, gymId]);
    if (!invoice || invoice.status === 'void') throw fail('Invoice is not payable', 404);
    if (invoice.currency !== 'ZAR') throw fail('Only ZAR invoices can be paid online');
    const { rows: [settled] } = await client.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments
      WHERE invoice_id=$1 AND gym_id=$2 AND status='succeeded'`, [invoiceId, gymId]);
    const outstanding = moneyToCents(invoice.amount) - moneyToCents(settled.total);
    if (outstanding < 100) throw fail('No payable balance remaining');
    const { rows: [settings] } = await client.query('SELECT paystack_subaccount FROM gym_payment_settings WHERE gym_id=$1', [gymId]);
    if (!settings?.paystack_subaccount && process.env.ALLOW_PLATFORM_COLLECTION !== 'true') {
      throw fail('Online payments are not enabled for this gym yet', 503);
    }
    const { rows: [pending] } = await client.query(`SELECT * FROM payments WHERE invoice_id=$1 AND gym_id=$2 AND provider='paystack' AND status='pending' FOR UPDATE`, [invoiceId, gymId]);
    if (pending) {
      if (moneyToCents(pending.amount) !== outstanding) throw fail('Pending checkout amount differs from the invoice balance. Contact your gym', 409);
      if (pending.checkout_url) { await client.query('COMMIT'); return { authorization_url: pending.checkout_url, reference: pending.reference }; }
      throw fail('A payment is awaiting confirmation. Check its status in payment history before retrying', 409);
    }
    const reference = newPaymentReference();
    const { rows: [created] } = await client.query(`INSERT INTO payments (invoice_id,gym_id,provider,amount,reference,status,currency,paid_at)
      VALUES ($1,$2,'paystack',$3,$4,'pending','ZAR',NULL) RETURNING *`, [invoiceId, gymId, (outstanding / 100).toFixed(2), reference]);
    payment = { ...created, email: invoice.email, subaccount: settings?.paystack_subaccount || null };
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  try {
    const init = await paystack('/transaction/initialize', { method: 'POST', body: {
      email: payment.email, amount: moneyToCents(payment.amount), currency: 'ZAR', reference: payment.reference,
      ...(payment.subaccount ? { subaccount: payment.subaccount } : {}),
      ...(callback ? { callback_url: callback } : {}),
      metadata: JSON.stringify({ invoice_id: Number(invoiceId), gym_id: gymId })
    } });
    if (init.reference !== payment.reference || !/^https:\/\/checkout\.paystack\.com\//.test(init.authorization_url)) {
      throw fail('Invalid checkout response', 502);
    }
    await db.query(`UPDATE payments SET checkout_url=$1 WHERE id=$2 AND reference=$3 AND status='pending'`,
      [init.authorization_url, payment.id, payment.reference]);
    return { authorization_url: init.authorization_url, reference: init.reference };
  } catch (error) {
    // A timeout may follow a successful initialization. Preserve the reservation to
    // prevent a second charge; reconciliation must determine the provider status.
    if (error.initializationRejected) {
      await db.query("UPDATE payments SET status='failed' WHERE id=$1 AND status='pending'", [payment.id]);
    }
    throw error;
  }
}

/** Only a server-to-server verification can turn a pending attempt into succeeded. */
export async function verifyAndSettle(reference, { gymId = null, userId = null } = {}) {
  if (typeof reference !== 'string' || !/^fnx-[a-f0-9-]{36}$/i.test(reference)) throw fail('Invalid reference');
  const { rows: [attempt] } = await db.query(`SELECT p.id,p.invoice_id,p.gym_id,p.status,i.user_id
    FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.gym_id=p.gym_id
    WHERE p.provider='paystack' AND p.reference=$1`, [reference]);
  if (!attempt || (gymId !== null && attempt.gym_id !== gymId) || (userId !== null && Number(attempt.user_id) !== Number(userId))) throw fail('Payment not found', 404);
  if (attempt.status === 'succeeded') return { status: 'succeeded', reference };
  const remote = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`);
  if (remote.reference !== reference || remote.currency !== 'ZAR') throw fail('Payment verification mismatch', 409);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [invoice] } = await client.query('SELECT * FROM invoices WHERE id=$1 AND gym_id=$2 FOR UPDATE', [attempt.invoice_id, attempt.gym_id]);
    const { rows: [payment] } = await client.query("SELECT * FROM payments WHERE id=$1 AND provider='paystack' FOR UPDATE", [attempt.id]);
    if (!invoice || !payment) throw fail('Payment not found', 404);
    if (payment.status === 'succeeded') { await client.query('COMMIT'); return { status: 'succeeded', reference }; }
    if (!Number.isSafeInteger(Number(remote.amount)) || moneyToCents(payment.amount) !== Number(remote.amount)) throw fail('Payment amount mismatch', 409);
    if (remote.status === 'success') {
      const paidAt = remote.paid_at && Number.isFinite(Date.parse(remote.paid_at)) ? new Date(remote.paid_at).toISOString() : null;
      await client.query("UPDATE payments SET status='succeeded', paid_at=COALESCE($2::timestamptz,NOW()) WHERE id=$1", [payment.id, paidAt]);
      const { rows: [totals] } = await client.query("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE invoice_id=$1 AND gym_id=$2 AND status='succeeded'", [invoice.id, invoice.gym_id]);
      if (invoice.status !== 'void' && moneyToCents(totals.total) >= moneyToCents(invoice.amount)) {
        await client.query("UPDATE invoices SET status='paid', updated_at=NOW() WHERE id=$1 AND gym_id=$2", [invoice.id, invoice.gym_id]);
        await confirmPaidSessionBooking(client, invoice.gym_id, invoice.id);
      }
    } else if (['failed', 'abandoned', 'reversed'].includes(remote.status)) {
      await client.query("UPDATE payments SET status='failed' WHERE id=$1 AND status='pending'", [payment.id]);
    }
    await client.query('COMMIT');
    return { status: remote.status === 'success' ? 'succeeded' : remote.status, reference };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
