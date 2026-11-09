import test from 'node:test';
import assert from 'node:assert/strict';
import knex from 'knex';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import ejs from 'ejs';
import jwt from 'jsonwebtoken';
import memberRoutes from '../src/routes/dashboardPageRoutes.js';
import adminRoutes from '../src/routes/admin.routes.js';
import { requireAuth } from '../src/middleware/requireAuth.js';
import { requireAdmin } from '../src/middleware/requireAdmin.js';
import { hydrateMember } from '../src/middleware/hydrateMember.js';
import { db } from '../src/config/db.js';
import * as billing from '../src/services/billing.service.js';
import { initiatePaystackCheckout, verifyAndSettle } from '../src/services/paystack.service.js';

const connection = process.env.BILLING_TEST_DATABASE_URL;

test('PostgreSQL migrations and complete gym billing lifecycle', { skip: !connection }, async () => {
  const url = new URL(connection);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname), 'Integration tests require an isolated local database');
  assert.match(url.pathname, /^\/fitnexis_billing_test(?:_[a-z0-9]+)?$/);
  const sql = knex({ client: 'pg', connection });
  const pool = new pg.Pool({ connectionString: connection, options: '-c timezone=UTC' });
  const originalQuery = db.query, originalConnect = db.connect, originalFetch = globalThis.fetch;
  const originalKey = process.env.PAYSTACK_SECRET_KEY, originalCollection = process.env.ALLOW_PLATFORM_COLLECTION;
  const originalJwtSecret = process.env.JWT_SECRET;
  db.query = pool.query.bind(pool);
  db.connect = pool.connect.bind(pool);
  let gymId;
  let server;
  try {
    await sql.migrate.latest({ directory: './migrations' });
    const { rows: [gym] } = await pool.query("INSERT INTO gyms(name,slug) VALUES('Billing test',$1) RETURNING id", [`billing-${Date.now()}`]);
    gymId = gym.id;
    const { rows: [user] } = await pool.query("INSERT INTO users(firstname,lastname,phone,email,gym_id) VALUES('Test','Member','000','member@example.invalid',$1) RETURNING id", [gymId]);
    const { rows: [admin] } = await pool.query("INSERT INTO users(firstname,lastname,phone,email,role,gym_id) VALUES('Test','Admin','001','admin@example.invalid','admin',$1) RETURNING id", [gymId]);
    const plan = await billing.createPlan(gymId, { name: 'Monthly', price: '100', billing_cycle: 'monthly' });
    const membership = await billing.assignMembership(gymId, { user_id: user.id, plan_id: plan.id, start_date: '2026-01-31' });
    const cycle = await billing.runBillingCycle(gymId, '2026-03-31');
    assert.equal(cycle.created, 3, 'All three missed periods are invoiced in one run');
    assert.equal((await billing.runBillingCycle(gymId, '2026-03-31')).created, 0, 'Rerunning billing does not duplicate invoices');
    assert.equal((await pool.query('SELECT next_bill_on::text FROM memberships WHERE id=$1', [membership.id])).rows[0].next_bill_on, '2026-04-30');
    const invoice = (await billing.listInvoices(gymId))[0];
    assert.equal(new Date(invoice.due_at).toISOString(), '2026-03-30T22:00:00.000Z', 'Invoice deadlines use South African midnight even on a UTC database');
    await billing.recordManualPayment(gymId, admin.id, { invoice_id: invoice.id, amount: '30', provider: 'eft', reference: 'receipt-1' });
    assert.equal((await billing.invoiceDetail(gymId, invoice.id)).invoice.balance, '70.00');
    await assert.rejects(() => billing.recordManualPayment(gymId, admin.id, { invoice_id: invoice.id, amount: '71', provider: 'cash', reference: 'overpayment' }), /exceeds/);
    await assert.rejects(() => billing.invoiceDetail('00000000-0000-0000-0000-000000000000', invoice.id), /not found/);
    await assert.rejects(() => billing.invoiceDetail(gymId, invoice.id, admin.id), /not found/);

    process.env.PAYSTACK_SECRET_KEY = 'sk_test_placeholder';
    process.env.ALLOW_PLATFORM_COLLECTION = 'true';
    let initializedReference, verifyStatus = 'success', verifyAmount = 7000;
    globalThis.fetch = async (path, options) => {
      if (path.endsWith('/initialize')) {
        const body = JSON.parse(options.body);
        assert.equal(body.amount, 7000, 'Checkout charges the remaining balance in cents');
        initializedReference = body.reference;
        return { ok: true, json: async () => ({ status: true, data: { reference: body.reference, authorization_url: 'https://checkout.paystack.com/test-checkout' } }) };
      }
      return { ok: true, json: async () => ({ status: true, data: { reference: path.split('/').at(-1), amount: verifyAmount, currency: 'ZAR', status: verifyStatus } }) };
    };
    const checkout = await initiatePaystackCheckout(gymId, user.id, invoice.id);
    assert.equal(checkout.reference, initializedReference);
    verifyStatus = 'pending';
    assert.equal((await initiatePaystackCheckout(gymId, user.id, invoice.id)).reference, checkout.reference, 'Retrying a pending checkout reuses its reference');
    verifyStatus = 'success';
    await assert.rejects(() => billing.recordManualPayment(gymId, admin.id, { invoice_id: invoice.id, amount: '1', provider: 'cash', reference: 'during-checkout' }), /pending online payment/);
    await assert.rejects(() => verifyAndSettle(checkout.reference, { gymId, userId: admin.id }), /not found/);
    verifyAmount = 6900;
    await assert.rejects(() => verifyAndSettle(checkout.reference), /amount mismatch/);
    verifyAmount = 7000;
    const settled = await Promise.all([verifyAndSettle(checkout.reference), verifyAndSettle(checkout.reference)]);
    assert.ok(settled.every(result => result.status === 'succeeded'));
    assert.equal((await billing.invoiceDetail(gymId, invoice.id)).invoice.balance, '0.00');
    assert.equal((await billing.invoiceDetail(gymId, invoice.id)).payments.length, 2, 'Repeated settlement records only one online payment');
    await assert.rejects(() => initiatePaystackCheckout(gymId, user.id, invoice.id), /No payable balance/);

    const voided = await billing.createInvoice(gymId, { user_id: user.id, amount: '900', description: 'Voided charge' });
    await pool.query("UPDATE invoices SET status='void' WHERE id=$1", [voided.id]);
    assert.equal((await billing.invoiceDetail(gymId, voided.id)).invoice.balance, '0.00');
    assert.equal((await billing.billingOverview(gymId)).outstanding, '200.00');
    const pageData = await billing.memberBilling(gymId, user.id);
    assert.equal(pageData.payments.length, 2);
    assert.equal(pageData.summary.outstanding, '200.00');
    assert.ok((await billing.listReminders(gymId)).every(reminder => reminder.invoice_id !== invoice.id), 'Settled invoices leave the follow-up queue');
    assert.equal(pageData.onlinePaymentsEnabled, true);

    await billing.setMembershipStatus(gymId, membership.id, 'paused');
    const requests = await Promise.allSettled([
      billing.requestPlanChange(gymId, user.id, { plan_id: plan.id }),
      billing.requestPlanChange(gymId, user.id, { plan_id: plan.id })
    ]);
    assert.equal(requests.filter(result => result.status === 'fulfilled').length, 1, 'Concurrent requests cannot create duplicate pending changes');
    const request = requests.find(result => result.status === 'fulfilled').value;
    assert.equal((await billing.listPlanRequests(gymId)).length, 1);
    await billing.resolvePlanChange(gymId, request.id, 'approved');
    await assert.rejects(() => billing.setMembershipStatus(gymId, membership.id, 'active'), /cannot be changed/);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM memberships WHERE gym_id=$1 AND status IN ('active','paused')", [gymId])).rows[0].count, 1);
    const active = (await pool.query("SELECT id FROM memberships WHERE gym_id=$1 AND status='active'", [gymId])).rows[0];
    await pool.query("UPDATE memberships SET next_bill_on='2026-01-31',start_date='2026-01-31',end_date='2026-02-28' WHERE id=$1", [active.id]);
    assert.equal((await billing.runBillingCycle(gymId, '2026-05-01')).created, 2, 'Membership end dates cap recurring charges');
    assert.equal((await billing.runBillingCycle(gymId, '2026-05-01')).created, 0);
    await billing.setMembershipStatus(gymId, active.id, 'cancelled');
    await assert.rejects(() => billing.setMembershipStatus(gymId, active.id, 'active'), /cannot be changed/);

    const unpaid = (await billing.listInvoices(gymId)).find(row => Number(row.balance) === 100);
    globalThis.fetch = async () => ({ ok: false, status: 401 });
    await assert.rejects(() => initiatePaystackCheckout(gymId, user.id, unpaid.id), /rejected/);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM payments WHERE invoice_id=$1 AND status='pending'", [unpaid.id])).rows[0].count, 0, 'Definitively rejected initialization releases its reservation');
    globalThis.fetch = async () => { throw new Error('provider timeout'); };
    await assert.rejects(() => initiatePaystackCheckout(gymId, user.id, unpaid.id), /unavailable/);
    assert.equal((await pool.query("SELECT COUNT(*)::int AS count FROM payments WHERE invoice_id=$1 AND status='pending'", [unpaid.id])).rows[0].count, 1, 'Unknown initialization outcome retains the reservation to prevent double charging');

    // Exercise the real routers and authentication, without app startup/seeding.
    process.env.JWT_SECRET = 'billing-integration-only';
    const app = express();
    app.engine('html', ejs.renderFile);
    app.set('views', 'src/views');
    app.set('view engine', 'html');
    app.use(cookieParser(), express.json());
    app.use((req, res, next) => { req.gymId = gymId; req.gym = gym; next(); });
    app.use('/member', requireAuth, hydrateMember, memberRoutes);
    app.use('/admin', requireAuth, requireAdmin, hydrateMember, adminRoutes);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const memberToken = jwt.sign({ sub: String(user.id), gymId, role: 'member' }, process.env.JWT_SECRET);
    const adminToken = jwt.sign({ sub: String(admin.id), gymId, role: 'admin' }, process.env.JWT_SECRET);
    const headers = { cookie: `token=${memberToken}` };
    assert.equal((await originalFetch(`${base}/member/billing`)).status, 401);
    const memberPage = await originalFetch(`${base}/member/billing`, { headers });
    assert.equal(memberPage.status, 200);
    const memberHtml = await memberPage.text();
    assert.ok(memberHtml.includes('Payment history'));
    const csrf = memberHtml.match(/name="billing-csrf" content="([a-f0-9]+)"/)[1];
    assert.equal((await originalFetch(`${base}/admin/billing`, { headers })).status, 403);
    assert.equal((await originalFetch(`${base}/admin/billing`, { headers: { cookie: `token=${adminToken}` } })).status, 200);
    assert.equal((await originalFetch(`${base}/member/billing/requests`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ plan_id: plan.id }) })).status, 403);
    assert.equal((await originalFetch(`${base}/member/billing/requests`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'x-billing-csrf': csrf }, body: JSON.stringify({ plan_id: plan.id }) })).status, 201);
    const wrongGymToken = jwt.sign({ sub: String(user.id), gymId: 'another-gym', role: 'member' }, process.env.JWT_SECRET);
    assert.equal((await originalFetch(`${base}/member/billing`, { headers: { cookie: `token=${wrongGymToken}` } })).status, 403);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (gymId) await pool.query('DELETE FROM gyms WHERE id=$1', [gymId]);
    db.query = originalQuery; db.connect = originalConnect; globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.PAYSTACK_SECRET_KEY; else process.env.PAYSTACK_SECRET_KEY = originalKey;
    if (originalCollection === undefined) delete process.env.ALLOW_PLATFORM_COLLECTION; else process.env.ALLOW_PLATFORM_COLLECTION = originalCollection;
    if (originalJwtSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = originalJwtSecret;
    await pool.end();
    await sql.destroy();
  }
});
