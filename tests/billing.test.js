import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { amountValue, advancePeriod, positiveId, createPlan, recordManualPayment } from '../src/services/billing.service.js';
import { csrfToken, billingCsrf } from '../src/middleware/billingCsrf.js';
import { verifyWebhookSignature, verifyAndSettle, newPaymentReference } from '../src/services/paystack.service.js';
import { db } from '../src/config/db.js';

const ENV_SECRET = process.env.JWT_SECRET;
test('Amount validation requires integer cents and blocks injection', () => {
  assert.equal(amountValue('399.90'), '399.90');
  assert.equal(amountValue(0, { allowZero: true }), '0.00');
  for (const amount of ['-1', '1.999', '1e5', 'NaN', '12;DROP', '0']) assert.throws(() => amountValue(amount));
  assert.equal(positiveId('7'), 7);
  assert.equal(positiveId('-4'), null);
  assert.equal(positiveId('Infinity'), null);
});

test('Recurring dates clamp at month end, preserve the original billing anchor', () => {
  assert.equal(advancePeriod('2026-01-31', 'monthly'), '2026-02-28');
  assert.equal(advancePeriod('2026-02-28', 'monthly', '2026-01-31'), '2026-03-31');
  assert.equal(advancePeriod('2026-02-10', 'quarterly'), '2026-05-10');
  assert.equal(advancePeriod('2024-02-29', 'annual'), '2025-02-28');
});

test('Paystack webhook signature requires exact signed raw bytes', () => {
  const secret = 'sk_test_dummy';
  const raw = Buffer.from('{"event":"charge.success","data":{"reference":"abc"}}');
  const signed = createHmac('sha512', secret).update(raw).digest('hex');
  assert.equal(verifyWebhookSignature(raw, signed, secret), true);
  assert.equal(verifyWebhookSignature(Buffer.concat([raw, Buffer.from(' ')]), signed, secret), false);
  assert.equal(verifyWebhookSignature(raw, 'garbage', secret), false);
  assert.equal(newPaymentReference().startsWith('fnx-'), true);
});

test('Billing mutations require a token bound to the login cookie', () => {
  process.env.JWT_SECRET = 'billing-test-key';
  const req = { cookies: { token: 'session-A' }, body: {}, get: () => '' };
  const expected = csrfToken(req);
  assert.equal(expected.length, 64);
  let code = null; let continued = false;
  const res = { status(n) { code = n; return this; }, json() { return this; } };
  billingCsrf(req, res, () => { continued = true; });
  assert.equal(code, 403);
  assert.equal(continued, false);
  req.get = () => expected;
  billingCsrf(req, res, () => { continued = true; });
  assert.equal(continued, true);
  process.env.JWT_SECRET = ENV_SECRET;
});

test('Plan creation always scopes writes to the gym', async () => {
  const original = db.query;
  try {
    let seen;
    db.query = async (sql, params) => { seen = { sql, params }; return { rows: [{ id: 9, gym_id: params[4] }] }; };
    const result = await createPlan('gym-123', { name: 'Bronze', price: '300', billing_cycle: 'monthly' });
    assert.equal(result.gym_id, 'gym-123');
    assert.equal(seen.params[4], 'gym-123');
    assert.equal(seen.params[1], '300.00');
  } finally { db.query = original; }
});

test('Manual payment refuses balance overpayment without writing', async () => {
  const original = db.connect;
  const queries = [];
  try {
    db.connect = async () => ({
      async query(sql) {
        queries.push(sql);
        if (sql.includes('SELECT * FROM invoices')) return { rows: [{ id: 7, amount: '100.00', currency: 'ZAR', status: 'due' }] };
        if (sql.includes('SELECT COALESCE(SUM(amount)')) return { rows: [{ total: '30.00' }] };
        return { rows: [] };
      }, release() {}
    });
    await assert.rejects(() => recordManualPayment('gym-123', 1, { invoice_id: 7, amount: '71', provider: 'cash', reference: 'test' }), /exceeds/);
    assert.equal(queries.some(sql => sql.includes('INSERT INTO payments')), false);
    assert.equal(queries.includes('ROLLBACK'), true);
  } finally { db.connect = original; }
});

test('Paystack verification rejects mismatched amounts and rolls back', async () => {
  const originalQuery = db.query, originalConnect = db.connect, originalFetch = globalThis.fetch;
  let committed = false, rolledBack = false;
  try {
    db.query = async () => ({ rows: [{ id: 1, invoice_id: 5, gym_id: 'gym-1', user_id: 9, status: 'pending' }] });
    db.connect = async () => ({ async query(sql) {
      if (sql.startsWith('SELECT * FROM invoices')) return { rows: [{ id: 5, gym_id: 'gym-1', amount: '100.00' }] };
      if (sql.startsWith('SELECT * FROM payments')) return { rows: [{ id: 1, amount: '100.00' }] };
      if (sql === 'ROLLBACK') rolledBack = true;
      if (sql === 'COMMIT') committed = true;
      return { rows: [] };
    }, release() {} });
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_fake';
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ status: true, data: { reference: 'fnx-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', currency: 'ZAR', amount: 9000, status: 'success' } }) });
    await assert.rejects(() => verifyAndSettle('fnx-aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', { gymId: 'gym-1', userId: 9 }), /amount mismatch/);
    assert.equal(rolledBack, true);
    assert.equal(committed, false);
  } finally { db.query = originalQuery; db.connect = originalConnect; globalThis.fetch = originalFetch; delete process.env.PAYSTACK_SECRET_KEY; }
});
