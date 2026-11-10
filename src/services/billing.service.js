import { db } from '../config/db.js';
import { billingToday, dateOnly } from './billingDates.js';
import { billingCycles, normalizeBillingCycle, nextBillingDate } from './billingCycles.js';
import { confirmPaidSessionBooking } from './sessionBilling.service.js';

export const billingError = (message, status = 400) => Object.assign(new Error(message), { status });
export const positiveId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
export function amountValue(value, { allowZero = false } = {}) {
  const str = String(value ?? '');
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(str)) throw billingError('Invalid amount');
  const cents = Math.round(Number(str) * 100);
  if ((!allowZero && cents < 1) || cents > 9_999_999_999) throw billingError('Amount out of range');
  return (cents / 100).toFixed(2);
}
export const cents = value => Math.round(Number(value || 0) * 100);
const isoDate = value => {
  const str = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str) || Number.isNaN(Date.parse(`${str}T00:00:00Z`)) ||
      new Date(`${str}T00:00:00Z`).toISOString().slice(0, 10) !== str) throw billingError('Invalid date');
  return str;
};
export const advancePeriod = nextBillingDate;

const invoiceSql = `SELECT i.id,i.user_id,i.membership_id,i.invoice_number,i.description,i.amount,i.currency,i.status,
  i.issued_at,i.due_at,i.period_start,u.firstname,u.lastname,u.email,
  COALESCE(pay.paid,0)::numeric(10,2) AS paid_amount,
  CASE WHEN i.status='void' THEN 0 ELSE GREATEST(i.amount-COALESCE(pay.paid,0),0) END::numeric(10,2) AS balance,
  CASE WHEN i.status='void' THEN 'void' WHEN i.amount<=COALESCE(pay.paid,0) THEN 'paid'
    WHEN (i.due_at AT TIME ZONE 'Africa/Johannesburg')::date < (NOW() AT TIME ZONE 'Africa/Johannesburg')::date THEN 'overdue' ELSE 'due' END AS display_status
  FROM invoices i JOIN users u ON u.id=i.user_id AND u.gym_id=i.gym_id
  LEFT JOIN LATERAL (SELECT SUM(amount) AS paid FROM payments WHERE invoice_id=i.id AND gym_id=i.gym_id AND status='succeeded') pay ON true`;

export async function memberBilling(gymId, userId) {
  const { rows: memberships } = await db.query(`SELECT m.*,p.name AS plan_name,p.price AS plan_price,p.billing_cycle
    FROM memberships m JOIN plans p ON p.id=m.plan_id AND p.gym_id=m.gym_id
    WHERE m.gym_id=$1 AND m.user_id=$2 ORDER BY (m.status='active') DESC,m.id DESC LIMIT 1`, [gymId, userId]);
  const { rows: invoices } = await db.query(`${invoiceSql} WHERE i.gym_id=$1 AND i.user_id=$2 ORDER BY i.id DESC LIMIT 200`, [gymId, userId]);
  const { rows: plans } = await db.query('SELECT id,name,price,billing_cycle FROM plans WHERE gym_id=$1 AND is_active=true ORDER BY price,name', [gymId]);
  const { rows: payments } = await db.query(`SELECT p.id,p.invoice_id,p.reference,p.amount,p.provider,p.status,p.paid_at,p.created_at,
    i.invoice_number FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.gym_id=p.gym_id
    WHERE p.gym_id=$1 AND i.user_id=$2 ORDER BY p.id DESC LIMIT 200`, [gymId, userId]);
  const { rows: requests } = await db.query(`SELECT r.id,r.status,r.created_at,p.name AS plan_name
    FROM billing_plan_requests r JOIN plans p ON p.id=r.plan_id AND p.gym_id=r.gym_id
    WHERE r.gym_id=$1 AND r.user_id=$2 ORDER BY r.id DESC LIMIT 20`, [gymId, userId]);
  const { rows: [settings] } = await db.query('SELECT paystack_subaccount FROM gym_payment_settings WHERE gym_id=$1', [gymId]);
  const { rows: [summary] } = await db.query(`SELECT
    COALESCE(SUM(GREATEST(i.amount-COALESCE(p.paid,0),0)),0)::numeric(12,2) AS outstanding,
    MIN(i.due_at) FILTER (WHERE i.amount>COALESCE(p.paid,0)) AS next_due
    FROM invoices i LEFT JOIN LATERAL (SELECT SUM(amount) AS paid FROM payments
      WHERE invoice_id=i.id AND gym_id=i.gym_id AND status='succeeded') p ON true
    WHERE i.gym_id=$1 AND i.user_id=$2 AND i.status<>'void'`, [gymId, userId]);
  return { membership: memberships[0] || null, invoices, plans, payments, requests, summary,
    onlinePaymentsEnabled: Boolean(process.env.PAYSTACK_SECRET_KEY && (settings?.paystack_subaccount || process.env.ALLOW_PLATFORM_COLLECTION === 'true')) };
}

export async function billingOverview(gymId) {
  const { rows: [stats] } = await db.query(`SELECT COUNT(*) FILTER (WHERE status='active')::int AS active_memberships,
    COUNT(*) FILTER (WHERE status='paused')::int AS paused_memberships FROM memberships WHERE gym_id=$1`, [gymId]);
  const { rows: [invoices] } = await db.query(`SELECT COUNT(*)::int AS invoice_count,
    COALESCE(SUM(amount) FILTER (WHERE status<>'void'),0)::numeric(12,2) AS total_billed,
    COALESCE(SUM(GREATEST(amount-COALESCE(paid,0),0)) FILTER (WHERE status<>'void'),0)::numeric(12,2) AS outstanding,
    COALESCE(SUM(GREATEST(amount-COALESCE(paid,0),0)) FILTER (WHERE status<>'void' AND
      (due_at AT TIME ZONE 'Africa/Johannesburg')::date<(NOW() AT TIME ZONE 'Africa/Johannesburg')::date),0)::numeric(12,2) AS overdue_amount,
    COUNT(*) FILTER (WHERE status<>'void' AND (due_at AT TIME ZONE 'Africa/Johannesburg')::date<(NOW() AT TIME ZONE 'Africa/Johannesburg')::date AND amount>COALESCE(paid,0))::int AS overdue_count
    FROM (SELECT i.*, (SELECT SUM(p.amount) FROM payments p WHERE p.invoice_id=i.id AND p.gym_id=i.gym_id AND p.status='succeeded') AS paid
      FROM invoices i WHERE i.gym_id=$1) x`, [gymId]);
  const { rows: [revenue] } = await db.query(`SELECT COALESCE(SUM(amount),0)::numeric(12,2) AS month_collected,
    COALESCE(SUM(amount) FILTER (WHERE provider='cash'),0)::numeric(12,2) AS month_cash,
    COALESCE(SUM(amount) FILTER (WHERE provider='eft'),0)::numeric(12,2) AS month_eft,
    COALESCE(SUM(amount) FILTER (WHERE provider='paystack'),0)::numeric(12,2) AS month_paystack
    FROM payments WHERE gym_id=$1 AND status='succeeded'
    AND paid_at>=(date_trunc('month', NOW() AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'Africa/Johannesburg')`, [gymId]);
  const { rows: [pending] } = await db.query(`SELECT COUNT(*)::int AS pending_payments,
    COALESCE(SUM(amount),0)::numeric(12,2) AS pending_payment_amount FROM payments
    WHERE gym_id=$1 AND provider='paystack' AND status='pending'`, [gymId]);
  const { rows: [requests] } = await db.query(`SELECT COUNT(*)::int AS pending_requests
    FROM billing_plan_requests WHERE gym_id=$1 AND status='pending'`, [gymId]);
  return { ...stats, ...invoices, ...revenue, ...pending, ...requests };
}

export async function listInvoices(gymId, { user_id = null, limit = 200 } = {}) {
  const userId = user_id == null || user_id === '' ? null : positiveId(user_id);
  if (user_id && !userId) throw billingError('Invalid member');
  const result = await db.query(`${invoiceSql} WHERE i.gym_id=$1 AND ($2::int IS NULL OR i.user_id=$2)
    ORDER BY i.id DESC LIMIT $3`, [gymId, userId, Math.min(Math.max(Number(limit) || 200, 1), 500)]);
  return result.rows;
}

export async function invoiceDetail(gymId, invoiceId, userId = null) {
  const id = positiveId(invoiceId);
  if (!id) throw billingError('Invalid invoice');
  const { rows: [invoice] } = await db.query(`${invoiceSql} WHERE i.id=$1 AND i.gym_id=$2 AND ($3::int IS NULL OR i.user_id=$3)`, [id, gymId, userId]);
  if (!invoice) throw billingError('Invoice not found', 404);
  const { rows: payments } = await db.query(`SELECT id,provider,reference,amount,currency,status,paid_at FROM payments
    WHERE invoice_id=$1 AND gym_id=$2 AND status='succeeded' ORDER BY id`, [id, gymId]);
  return { invoice, payments };
}

export async function createInvoice(gymId, { user_id, membership_id, amount, due_at, description }) {
  const userId = positiveId(user_id), membershipId = membership_id ? positiveId(membership_id) : null;
  if (!userId || (membership_id && !membershipId)) throw billingError('Invalid member or membership');
  const sum = amountValue(amount, { allowZero: true });
  const due = due_at ? isoDate(due_at) : null;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [member] } = await client.query("SELECT id FROM users WHERE id=$1 AND gym_id=$2 AND role='member'", [userId, gymId]);
    if (!member) throw billingError('Member not found', 404);
    if (membershipId) {
      const { rows: [membership] } = await client.query('SELECT id FROM memberships WHERE id=$1 AND user_id=$2 AND gym_id=$3', [membershipId, userId, gymId]);
      if (!membership) throw billingError('Membership not found', 404);
    }
    const { rows: [invoice] } = await client.query(`INSERT INTO invoices(user_id,membership_id,amount,currency,status,due_at,description,gym_id)
      VALUES ($1,$2,$3,'ZAR',$4,($5::date::timestamp AT TIME ZONE 'Africa/Johannesburg'),$6,$7) RETURNING *`, [userId, membershipId, sum, cents(sum) === 0 ? 'paid' : 'due', due, String(description || 'Gym charges').slice(0, 500), gymId]);
    const number = `INV-${String(invoice.id).padStart(8, '0')}`;
    await client.query('UPDATE invoices SET invoice_number=$1 WHERE id=$2 AND gym_id=$3', [number, invoice.id, gymId]);
    await client.query('COMMIT');
    return { ...invoice, invoice_number: number };
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function recordManualPayment(gymId, adminId, { invoice_id, amount, provider, reference }) {
  const invoiceId = positiveId(invoice_id);
  if (!invoiceId || !['cash', 'eft'].includes(provider)) throw billingError('Invalid invoice or payment method');
  const sum = amountValue(amount);
  const ref = String(reference || '').trim();
  if (!ref || ref.length > 200) throw billingError('Unique payment reference is required');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [invoice] } = await client.query('SELECT * FROM invoices WHERE id=$1 AND gym_id=$2 FOR UPDATE', [invoiceId, gymId]);
    if (!invoice || invoice.status === 'void') throw billingError('Invoice not payable', 404);
    if (invoice.currency !== 'ZAR') throw billingError('Unsupported invoice currency');
    const { rows: [pending] } = await client.query("SELECT id FROM payments WHERE invoice_id=$1 AND gym_id=$2 AND provider='paystack' AND status='pending'", [invoiceId, gymId]);
    if (pending) throw billingError('Verify the pending online payment before recording another receipt for this invoice', 409);
    const { rows: [settled] } = await client.query(`SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE invoice_id=$1 AND gym_id=$2 AND status='succeeded'`, [invoiceId, gymId]);
    if (cents(sum) > cents(invoice.amount) - cents(settled.total)) throw billingError('Payment exceeds outstanding balance');
    const { rows: [payment] } = await client.query(`INSERT INTO payments(invoice_id,gym_id,provider,amount,reference,status,currency,recorded_by,paid_at)
      VALUES ($1,$2,$3,$4,$5,'succeeded','ZAR',$6,NOW()) RETURNING *`, [invoiceId, gymId, provider, sum, ref, adminId]);
    if (cents(sum) === cents(invoice.amount) - cents(settled.total)) {
      await client.query("UPDATE invoices SET status='paid',updated_at=NOW() WHERE id=$1 AND gym_id=$2", [invoiceId, gymId]);
      await confirmPaidSessionBooking(client, gymId, invoiceId);
    }
    await client.query('COMMIT'); return payment;
  } catch (error) { await client.query('ROLLBACK'); if (error.code === '23505') throw billingError('Payment reference already used', 409); throw error; }
  finally { client.release(); }
}

export async function createPlan(gymId, { name, price, billing_cycle = 'monthly', description = '' }) {
  const planName = String(name || '').trim();
  billing_cycle = normalizeBillingCycle(billing_cycle);
  if (!planName || planName.length > 100 || !billingCycles.includes(billing_cycle)) throw billingError('Invalid plan');
  const amount = amountValue(price, { allowZero: true });
  try {
    const { rows: [plan] } = await db.query(`INSERT INTO plans(name,price,billing_cycle,description,gym_id)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`, [planName, amount, billing_cycle, String(description).slice(0, 500), gymId]);
    return plan;
  } catch (error) { if (error.code === '23505') throw billingError('Plan already exists', 409); throw error; }
}

export async function updatePlan(gymId, planId, { price, is_active }) {
  const id = positiveId(planId);
  if (!id) throw billingError('Invalid plan');
  if (price === undefined && typeof is_active !== 'boolean') throw billingError('Nothing to update');
  const amount = price === undefined ? null : amountValue(price, { allowZero: true });
  const { rows: [plan] } = await db.query(`UPDATE plans SET price=COALESCE($3,price),is_active=COALESCE($4,is_active)
    WHERE id=$1 AND gym_id=$2 RETURNING *`, [id, gymId, amount, typeof is_active === 'boolean' ? is_active : null]);
  if (!plan) throw billingError('Plan not found', 404);
  return plan;
}

export async function assignMembership(gymId, { user_id, plan_id, start_date }) {
  const userId = positiveId(user_id), planId = positiveId(plan_id);
  if (!userId || !planId) throw billingError('Invalid member or plan');
  const start = start_date ? isoDate(start_date) : billingToday();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [member] } = await client.query("SELECT id FROM users WHERE id=$1 AND gym_id=$2 AND role='member' FOR UPDATE", [userId, gymId]);
    const { rows: [plan] } = await client.query('SELECT id FROM plans WHERE id=$1 AND gym_id=$2 AND is_active=true', [planId, gymId]);
    if (!member || !plan) throw billingError('Member or active plan not found', 404);
    await client.query("UPDATE memberships SET status='replaced',updated_at=NOW() WHERE user_id=$1 AND gym_id=$2 AND status IN ('active','paused')", [userId, gymId]);
    const { rows: [membership] } = await client.query(`INSERT INTO memberships(user_id,plan_id,gym_id,start_date,status,next_bill_on,auto_invoice)
      VALUES ($1,$2,$3,$4,'active',$4,true) RETURNING *`, [userId, planId, gymId, start]);
    await client.query('COMMIT'); return membership;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function setMembershipStatus(gymId, membershipId, status) {
  if (!['active', 'paused', 'cancelled'].includes(status)) throw billingError('Invalid status');
  const id = positiveId(membershipId);
  if (!id) throw billingError('Invalid membership');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [owner] } = await client.query('SELECT user_id FROM memberships WHERE id=$1 AND gym_id=$2', [id, gymId]);
    if (!owner) throw billingError('Membership not found', 404);
    await client.query('SELECT id FROM users WHERE id=$1 AND gym_id=$2 FOR UPDATE', [owner.user_id, gymId]);
    const { rows: [membership] } = await client.query(`UPDATE memberships SET status=$1::varchar,updated_at=NOW(),
      next_bill_on=CASE WHEN status='paused' AND $1::varchar='active' AND auto_invoice THEN GREATEST(next_bill_on,$4::date) ELSE next_bill_on END
      WHERE id=$2 AND gym_id=$3 AND status IN ('active','paused') RETURNING *`, [status, id, gymId, billingToday()]);
    if (!membership) throw billingError('Cancelled or replaced memberships cannot be changed', 409);
    await client.query('COMMIT');
    return membership;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function requestPlanChange(gymId, userId, { plan_id, reason = '' }) {
  const planId = positiveId(plan_id);
  if (!planId) throw billingError('Invalid plan');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [member] } = await client.query("SELECT id FROM users WHERE id=$1 AND gym_id=$2 AND role='member' FOR UPDATE", [userId, gymId]);
    if (!member) throw billingError('Member not found', 404);
    const { rows: [pending] } = await client.query("SELECT id FROM billing_plan_requests WHERE gym_id=$1 AND user_id=$2 AND status='pending'", [gymId, userId]);
    if (pending) throw billingError('You already have a plan change awaiting review', 409);
    const { rows: [request] } = await client.query(`INSERT INTO billing_plan_requests(gym_id,user_id,plan_id,reason)
      SELECT $1,$2,p.id,$4 FROM plans p WHERE p.id=$3 AND p.gym_id=$1 AND p.is_active=true RETURNING *`,
      [gymId, userId, planId, String(reason).slice(0, 500)]);
    if (!request) throw billingError('Plan not found', 404);
    await client.query('COMMIT');
    return request;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function resolvePlanChange(gymId, requestId, status) {
  if (!['approved', 'rejected'].includes(status)) throw billingError('Invalid decision');
  const id = positiveId(requestId);
  if (!id) throw billingError('Invalid request');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [request] } = await client.query(`SELECT * FROM billing_plan_requests WHERE id=$1 AND gym_id=$2 FOR UPDATE`, [id, gymId]);
    if (!request) throw billingError('Request not found', 404);
    if (request.status !== 'pending') throw billingError('Request already resolved', 409);
    if (status === 'approved') {
      await client.query('SELECT id FROM users WHERE id=$1 AND gym_id=$2 FOR UPDATE', [request.user_id, gymId]);
      const { rows: [plan] } = await client.query('SELECT id FROM plans WHERE id=$1 AND gym_id=$2 AND is_active=true', [request.plan_id, gymId]);
      if (!plan) throw billingError('Plan is inactive', 409);
      await client.query("UPDATE memberships SET status='replaced',updated_at=NOW() WHERE gym_id=$1 AND user_id=$2 AND status IN ('active','paused')", [gymId, request.user_id]);
      await client.query(`INSERT INTO memberships(gym_id,user_id,plan_id,status,next_bill_on)
        VALUES($1,$2,$3,'active',$4)`, [gymId, request.user_id, request.plan_id, billingToday()]);
    }
    const { rows: [updated] } = await client.query('UPDATE billing_plan_requests SET status=$1,resolved_at=NOW() WHERE id=$2 RETURNING *', [status, id]);
    await client.query('COMMIT'); return updated;
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}

export async function listPlanRequests(gymId) {
  const { rows } = await db.query(`SELECT r.*,p.name AS plan_name,u.firstname,u.lastname FROM billing_plan_requests r
    JOIN plans p ON p.id=r.plan_id AND p.gym_id=r.gym_id
    JOIN users u ON u.id=r.user_id AND u.gym_id=r.gym_id
    WHERE r.gym_id=$1 ORDER BY r.id DESC LIMIT 100`, [gymId]);
  return rows;
}

/** Idempotent recurring invoice generation. Each membership is locked and unique per period. */
export async function runBillingCycle(gymId, today = billingToday()) {
  const date = isoDate(today);
  const { rows: due } = await db.query(`SELECT m.id FROM memberships m JOIN plans p ON p.id=m.plan_id AND p.gym_id=m.gym_id
    WHERE m.gym_id=$1 AND m.status='active' AND m.auto_invoice=true AND m.next_bill_on<=$2 AND p.is_active=true
    AND (m.end_date IS NULL OR m.next_bill_on<=m.end_date)
    ORDER BY m.next_bill_on,m.id LIMIT 200`, [gymId, date]);
  let created = 0;
  for (const row of due) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [membership] } = await client.query(`SELECT m.*,p.price,p.name,p.billing_cycle FROM memberships m
        JOIN plans p ON p.id=m.plan_id AND p.gym_id=m.gym_id
        WHERE m.id=$1 AND m.gym_id=$2 AND m.status='active' AND p.is_active=true FOR UPDATE OF m`, [row.id, gymId]);
      // Catch up missed periods in one run, with a bounded transaction for old accounts.
      let periods = 0;
      while (membership?.auto_invoice && membership.next_bill_on && dateOnly(membership.next_bill_on) <= date
        && (!membership.end_date || dateOnly(membership.next_bill_on) <= dateOnly(membership.end_date)) && periods++ < 120) {
        const period = dateOnly(membership.next_bill_on);
        const next = advancePeriod(period, membership.billing_cycle, dateOnly(membership.start_date));
        const { rows: [invoice] } = await client.query(`INSERT INTO invoices(gym_id,user_id,membership_id,amount,currency,status,due_at,period_start,description)
          VALUES($1,$2,$3,$4,'ZAR',$5,($6::date::timestamp AT TIME ZONE 'Africa/Johannesburg'),$7,$8)
          ON CONFLICT (gym_id,membership_id,period_start) WHERE membership_id IS NOT NULL AND period_start IS NOT NULL DO NOTHING RETURNING id`,
          [gymId, membership.user_id, membership.id, membership.price, cents(membership.price) === 0 ? 'paid' : 'due', period, period, `Membership: ${membership.name}`]);
        if (invoice) {
          await client.query("UPDATE invoices SET invoice_number='INV-' || LPAD(id::text,8,'0') WHERE id=$1 AND gym_id=$2", [invoice.id, gymId]);
          created++;
        }
        await client.query('UPDATE memberships SET next_bill_on=$1,auto_invoice=($1::date IS NOT NULL),updated_at=NOW() WHERE id=$2 AND gym_id=$3', [next, membership.id, gymId]);
        membership.next_bill_on = next;
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  }
  await queueReminders(gymId, date);
  return { scanned: due.length, created };
}

export async function queueReminders(gymId, today = billingToday()) {
  const date = isoDate(today);
  const { rowCount } = await db.query(`INSERT INTO billing_reminders(gym_id,invoice_id,kind)
    SELECT i.gym_id,i.id,CASE WHEN (i.due_at AT TIME ZONE 'Africa/Johannesburg')::date < $2::date THEN 'overdue' ELSE 'upcoming' END
    FROM invoices i WHERE i.gym_id=$1 AND i.status NOT IN ('paid','void')
      AND i.due_at IS NOT NULL AND (i.due_at AT TIME ZONE 'Africa/Johannesburg')::date < ($2::date + INTERVAL '7 days')
      AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id=i.id AND p.gym_id=i.gym_id AND p.status='succeeded'
        GROUP BY p.invoice_id HAVING SUM(p.amount)>=i.amount)
    ON CONFLICT (gym_id,invoice_id,kind) DO NOTHING`, [gymId, date]);
  return rowCount;
}

export async function listReminders(gymId) {
  const { rows } = await db.query(`SELECT r.*,i.invoice_number,u.firstname,u.lastname,u.email
    FROM billing_reminders r JOIN invoices i ON i.id=r.invoice_id AND i.gym_id=r.gym_id
    JOIN users u ON u.id=i.user_id AND u.gym_id=r.gym_id
    WHERE r.gym_id=$1 AND i.status<>'void' AND i.amount>(SELECT COALESCE(SUM(p.amount),0)
      FROM payments p WHERE p.invoice_id=i.id AND p.gym_id=i.gym_id AND p.status='succeeded')
    ORDER BY r.id DESC LIMIT 100`, [gymId]);
  return rows;
}

export async function setPaystackSubaccount(gymId, code) {
  const val = String(code || '').trim();
  if (!/^ACCT_[a-zA-Z0-9]{6,80}$/.test(val)) throw billingError('Invalid Paystack subaccount code');
  const { rows: [settings] } = await db.query(`INSERT INTO gym_payment_settings(gym_id,paystack_subaccount)
    VALUES($1,$2) ON CONFLICT(gym_id) DO UPDATE SET paystack_subaccount=$2,updated_at=NOW() RETURNING gym_id,paystack_subaccount`, [gymId, val]);
  return settings;
}

export async function listPayments(gymId) {
  const { rows } = await db.query(`SELECT p.id,p.invoice_id,p.amount,p.currency,p.provider,p.reference,p.status,p.paid_at,
    i.invoice_number,u.firstname,u.lastname FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.gym_id=p.gym_id
    JOIN users u ON u.id=i.user_id AND u.gym_id=p.gym_id WHERE p.gym_id=$1 ORDER BY p.id DESC LIMIT 200`, [gymId]);
  return rows;
}
