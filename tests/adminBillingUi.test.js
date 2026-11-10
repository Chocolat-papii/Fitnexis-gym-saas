import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Create Plan remains usable and submits when an unrelated dashboard request fails', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', disabled: false, dataset: {}, handlers: {}, selectedOptions: [],
      addEventListener(event, handler) { this.handlers[event] = handler; },
      querySelector() { return element(`${id}-submit`); },
      querySelectorAll() { return []; }, reset() {}, removeAttribute() {}
    });
    return elements.get(id);
  };
  const formNames = ['planForm', 'membershipForm', 'invoiceForm', 'manualPaymentForm', 'accountForm'];
  const posts = [];
  const messages = [];
  let saveFails = false, hidden = 0, resets = 0;
  const modal = {};
  element('planForm').closest = () => modal;
  element('planForm').reset = () => { resets++; element('planName').value = ''; };
  let resolveSubmission;
  const submitted = new Promise(resolve => { resolveSubmission = resolve; });
  const context = {
    document: { getElementById: element, querySelectorAll: () => formNames.map(element) },
    Intl, Date, FormData: class {
      *[Symbol.iterator]() { yield* Object.entries({ name: 'Weekly training', price: '150', billing_cycle: 'weekly' }); }
    },
    window: { bootstrap: { Modal: { getInstance: () => ({ hide() { hidden++; } }) } }, FitnexisBilling: {
      money: String, cycleLabel: String, date: String, safe: String, status: String,
      message: text => messages.push(text), paymentMessage: String,
      async api(path, method, body) {
        if (method === 'POST') { if (saveFails) throw Error('Plan already exists'); posts.push({ path, body }); return { plan: { id: 1 } }; }
        throw Error('Reminders are unavailable');
      },
      async busy(button, work) {
        if (button.disabled) return;
        button.disabled = true;
        try { await work(); } catch (error) { messages.push(error.message); }
        finally { button.disabled = false; resolveSubmission(); }
      }
    } }
  };
  vm.runInNewContext(await readFile('src/views/assets/dashboard/js/adminBilling.js', 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(element('planForm-submit').disabled, false);
  assert.equal(element('membershipForm-submit').disabled, true, 'Forms that require loaded members stay disabled');
  element('planForm').handlers.submit({ preventDefault() {}, target: element('planForm'), submitter: element('planForm-submit') });
  await submitted;
  assert.equal(posts.length, 1);
  assert.equal(posts[0].path, '/admin/billing/plans');
  assert.equal(posts[0].body.billing_cycle, 'weekly');
  assert.ok(messages.includes('Saved successfully.'));
  assert.equal(hidden, 1, 'A successful save closes the form modal even if refreshing another section fails');
  assert.equal(resets, 1);
  await new Promise(resolve => setImmediate(resolve));
  saveFails = true;
  element('planName').value = 'Keep my draft';
  element('planForm').handlers.submit({ preventDefault() {}, target: element('planForm'), submitter: element('planForm-submit') });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(hidden, 1, 'Failed saves leave the modal open');
  assert.equal(resets, 1, 'Failed saves do not clear the form');
  assert.equal(element('planName').value, 'Keep my draft');
  assert.ok(messages.includes('Plan already exists'));
});

test('Session form sends paid prices, restores edit values and resets new sessions to free', async () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: '', checked: false, disabled: false, required: false, dataset: {}, handlers: {},
      classList: { toggle() {} },
      addEventListener(name, handler) { this.handlers[name] = handler; },
      reportValidity() { return true; }, reset() { element('sessionIsPaid').checked = false; }
    });
    return elements.get(id);
  };
  const requests = [];
  let reloads = 0;
  const context = {
    document: { getElementById: element, querySelector: () => ({ content: 'csrf-test' }), addEventListener() {} },
    fetch: async (url, options) => { requests.push({ url, ...options, payload: JSON.parse(options.body) }); return { ok: true, json: async () => ({ success: true }) }; },
    location: { reload() { reloads++; } }, showPopup: message => assert.fail(message), confirm: () => true
  };
  vm.runInNewContext(await readFile('src/views/assets/dashboard/js/classSessionHandler.js', 'utf8'), context);
  assert.equal(element('sessionPrice').disabled, true);
  element('sessionIsPaid').checked = true;
  element('sessionIsPaid').handlers.change();
  element('sessionPrice').value = '45.50';
  element('sessionClassName').value = '5';
  element('sessionDate').value = '2099-01-01';
  element('sessionTime').value = '10:30';
  element('sessionCapacity').value = '20';
  element('sessionStatus').value = 'scheduled';
  assert.equal(element('sessionPrice').required, true);
  await element('sessionForm').handlers.submit({ preventDefault() {} });
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].payload.is_paid, true);
  assert.equal(requests[0].payload.price, '45.50');
  assert.equal(requests[0].headers['x-billing-csrf'], 'csrf-test');
  element('activityModal').handlers['show.bs.modal']({ relatedTarget: { closest: () => ({ dataset: {
    id: '12', class: '5', date: '2099-01-01', time: '10:30', capacity: '20', status: 'scheduled', paid: 'true', price: '75.00', duration: '60', waitlist: 'true', deadline: '0'
  } }) } });
  assert.equal(element('sessionIsPaid').checked, true);
  assert.equal(element('sessionPrice').value, '75.00');
  await element('sessionForm').handlers.submit({ preventDefault() {} });
  assert.equal(requests[1].url, '/admin/api/class-sessions/12');
  assert.equal(requests[1].method, 'PUT');
  assert.equal(requests[1].payload.cancellation_deadline_hours, 0);
  element('activityModal').handlers['show.bs.modal']({ relatedTarget: { closest: () => null } });
  assert.equal(element('sessionIsPaid').checked, false);
  assert.equal(element('sessionPrice').disabled, true);
  assert.equal(element('saveSessionBtn').dataset.editId, undefined);
  assert.equal(reloads, 2);
});

test('Billing overview renders real insights and attention links filter the record tabs', async () => {
  const elements = new Map();
  const errors = [], tabs = [];
  const selectIds = ['memberForPlan', 'invoiceMember', 'membershipPlan', 'paymentInvoice'];
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, tagName: selectIds.includes(id) ? 'SELECT' : 'DIV', value: id.endsWith('Filter') ? 'all' : '',
      options: [], selectedOptions: [], dataset: {}, handlers: {}, innerHTML: '', textContent: '',
      addEventListener(name, handler) { this.handlers[name] = handler; },
      closest() { return { querySelectorAll: () => Array(8).fill({}) }; },
      querySelector() { return element(`${id}-submit`); }, querySelectorAll() { return []; },
      scrollIntoView() {}, removeAttribute() {}
    });
    return elements.get(id);
  };
  const payloads = {
    '/overview': { overview: { active_memberships: 12, paused_memberships: 2, month_collected: '100', month_eft: '60', month_cash: '40', month_paystack: '0', outstanding: '50', overdue_count: 1, overdue_amount: '50', pending_payments: 1, pending_payment_amount: '20', pending_requests: 3 } },
    '/plans': { plans: [] }, '/members': { members: [] }, '/memberships': { memberships: [] },
    '/invoices': { invoices: [
      { id: 1, invoice_number: 'INV-OVERDUE', firstname: 'Ana', lastname: 'Member', amount: 50, paid_amount: 0, balance: 50, display_status: 'overdue', status: 'due' },
      { id: 2, invoice_number: 'INV-PAID', firstname: 'Ben', lastname: 'Member', amount: 100, paid_amount: 100, balance: 0, display_status: 'paid', status: 'paid' }
    ] },
    '/payments': { payments: [{ id: 1, reference: 'pending-reference', provider: 'paystack', status: 'pending', amount: 20 }, { id: 2, reference: 'settled-reference', provider: 'eft', status: 'succeeded', amount: 60 }] },
    '/requests': { requests: [] }, '/reminders': { reminders: [] }, '/settings': { settings: {} }
  };
  const context = {
    Intl, Date,
    document: { getElementById: element, querySelectorAll: selector => selector === '#billingModals form' ? ['planForm','membershipForm','invoiceForm','manualPaymentForm','accountForm'].map(element) : [] },
    window: {
      bootstrap: { Tab: { getOrCreateInstance: tab => ({ show() { tabs.push(tab.id); } }) } },
      FitnexisBilling: { money: value => `R${Number(value || 0).toFixed(2)}`, cycleLabel: String, date: String, safe: value => String(value || ''), status: String, message: error => errors.push(error), paymentMessage: String, api: async path => payloads[path.replace('/admin/billing', '')] }
    }
  };
  vm.runInNewContext(await readFile('src/views/assets/dashboard/js/adminBilling.js', 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(errors, []);
  assert.equal(element('monthCollected').textContent, 'R100.00');
  assert.equal(element('requestsBadge').textContent, 3);
  assert.ok(element('overdueInsight').textContent.includes('R50.00'));
  assert.ok(element('collectionMethods').innerHTML.includes('R60.00'));
  element('viewOverdue').handlers.click();
  assert.ok(element('billingInvoices').innerHTML.includes('INV-OVERDUE'));
  assert.ok(!element('billingInvoices').innerHTML.includes('INV-PAID'));
  element('viewPending').handlers.click();
  assert.ok(element('billingPayments').innerHTML.includes('pending-reference'));
  assert.ok(!element('billingPayments').innerHTML.includes('settled-reference'));
  assert.deepEqual(tabs, ['invoicesTab', 'paymentsTab']);
});
