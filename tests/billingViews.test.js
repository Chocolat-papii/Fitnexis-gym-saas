import test from 'node:test';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import { billingToday, dateOnly } from '../src/services/billingDates.js';

test('Billing dates use the South African calendar at UTC day boundaries', () => {
  assert.equal(billingToday(new Date('2026-11-09T22:30:00Z')), '2026-11-10');
  assert.equal(dateOnly(new Date(2026, 0, 31)), '2026-01-31');
});

test('Member billing renders empty and populated states with one navigation toggle', async () => {
  const locals = {
    csrf: 'test', result: null, activePage: 'billing', gym: { name: 'Test gym' },
    member: { firstname: 'Member', profile_picture: '/images/profile-pic.jpg' },
    billing: { membership: null, plans: [], invoices: [], payments: [], requests: [], summary: { outstanding: '0.00', next_due: null }, onlinePaymentsEnabled: false }
  };
  const empty = await ejs.renderFile('src/views/dashboard/member-billing.html', locals);
  assert.equal((empty.match(/id="toggleSidebar"/g) || []).length, 1);
  assert.ok(empty.includes('Online payments are not available yet'));
  assert.ok(empty.includes('No payments recorded yet'));
  assert.ok(!empty.includes('pay-invoice'));
  locals.billing.onlinePaymentsEnabled = true;
  locals.billing.invoices = [{ id: 1, amount: 100, balance: 70, paid_amount: 30, status: 'due', display_status: 'due', description: '<script>injection</script>' }];
  locals.billing.payments = [{ reference: 'fnx-test', provider: 'paystack', status: 'pending', amount: 70 }];
  locals.billing.requests = [{ plan_name: '<script>injection</script>', status: 'pending' }];
  locals.billing.plans = [{ id: 1, name: 'Monthly', price: 100, billing_cycle: 'monthly' }];
  const populated = await ejs.renderFile('src/views/dashboard/member-billing.html', locals);
  assert.ok(populated.includes('pay-invoice'));
  assert.ok(populated.includes('data-verify="fnx-test"'));
  assert.ok(populated.includes('You have a plan change awaiting review'));
  assert.ok(!populated.includes('<script>injection</script>'));
  assert.ok(populated.includes('data-bs-target="#memberPlanModal"'));
  assert.ok(populated.includes('data-bs-target="#memberPaymentModal"'));
  assert.ok(populated.indexOf('id="changePlan"') > populated.indexOf('</main>'), 'The plan-change form is inside a modal outside the main overview');
  assert.ok(populated.includes('id="memberRequestsPanel"'));
  assert.ok(populated.includes('id="invoice-1"'), 'Session invoice deep links remain available');
  const ids = [...populated.replace(/<!--[\s\S]*?-->/g, '').matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
});

test('Admin billing renders the shared shell and payment status action column', async () => {
  const html = await ejs.renderFile('src/views/admin/admin-billing.html', {
    csrf: 'test', activePage: 'billing', gym: { name: 'Test gym' }, member: { firstname: 'Admin' }
  });
  assert.equal((html.match(/id="toggleSidebar"/g) || []).length, 1);
  assert.ok(html.includes('/assets/dashboard/js/dashboardShell.js'));
  assert.ok(html.includes('/assets/dashboard/js/adminBilling.js'));
  assert.ok(!html.includes('table-dark'));
  const ids = [...html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, 'Modal, form and record IDs are unique');
  for (const [modal, form] of [['planModal','planForm'], ['membershipModal','membershipForm'], ['invoiceModal','invoiceForm'], ['paymentModal','manualPaymentForm'], ['accountModal','accountForm']]) {
    assert.ok(html.includes(`data-bs-target="#${modal}"`));
    assert.ok(html.indexOf(`id="${form}"`) > html.indexOf('</main>'), 'Forms live in modals outside the dashboard');
  }
  assert.ok(html.includes('id="collectionMethods"'));
  assert.ok(html.includes('id="invoiceFilter"'));
  assert.ok(html.includes('id="paymentFilter"'));
});
