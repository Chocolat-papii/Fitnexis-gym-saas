import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('Member billing modals preserve invoice selection, checkout safety, plan drafts and deep links', async () => {
  const elements = new Map(), jobs = [], calls = [], redirects = [], messages = [], tabs = [];
  let mode = 'success', hidden = 0;
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      id, value: '', disabled: false, dataset: {}, handlers: {}, classList: { add() {} },
      addEventListener(name, handler) { (this.handlers[name] ||= []).push(handler); },
      fire(name, event = {}) { for (const handler of this.handlers[name] || []) handler(event); },
      querySelector(selector) { return selector === '[type="submit"]' ? element(id + '-submit') : null; },
      scrollIntoView() {}
    });
    return elements.get(id);
  };
  const invoiceSelect = element('memberPaymentInvoice');
  invoiceSelect.value = '7';
  Object.defineProperty(invoiceSelect, 'selectedOptions', { get: () => [{ dataset: { balance: invoiceSelect.value === '8' ? '25.00' : '70.00' } }] });
  element('verifyPayment').dataset.verify = 'fnx-reference';
  const context = {
    URLSearchParams,
    document: {
      getElementById: element,
      querySelectorAll: selector => ({ '.billing-modal': [element('memberPaymentModal'), element('memberPlanModal')], '[data-view-payments]': [element('viewPayments')], '[data-verify]': [element('verifyPayment')] })[selector] || []
    },
    FormData: class { *[Symbol.iterator]() { yield* Object.entries({ plan_id: '3', reason: element('changeReason').value }); } },
    window: {
      location: { search: '', hash: '#invoice-7', assign(url) { redirects.push(url); } },
      bootstrap: { Tab: { getOrCreateInstance: tab => ({ show() { tabs.push(tab.id); } }) }, Modal: { getInstance: () => ({ hide() { hidden++; } }) } },
      FitnexisBilling: {
        money: value => 'R' + Number(value || 0).toFixed(2), paymentMessage: value => value,
        message: (text, error) => messages.push({ text, error }),
        api: async (path, method, body) => {
          calls.push({ path, method, body });
          if (mode === 'request-error') throw Error('Request could not be saved');
          if (path.endsWith('/verify')) return { status: mode === 'pending' ? 'pending' : 'succeeded' };
          return { authorization_url: mode === 'bad-url' ? 'https://untrusted.example/checkout' : 'https://checkout.paystack.com/member-test' };
        },
        busy(button, operation) {
          const job = (async () => {
            if (button.disabled) return;
            button.disabled = true;
            try { await operation(); } catch (error) { messages.push({ text: error.message, error: true }); }
            finally { button.disabled = false; }
          })();
          jobs.push(job);
          return job;
        }
      }
    }
  };
  vm.runInNewContext(await readFile('src/views/assets/dashboard/js/memberBilling.js', 'utf8'), context);
  assert.deepEqual(tabs, ['memberInvoicesTab'], 'Session invoice links open the invoices tab');
  element('memberPaymentModal').fire('show.bs.modal', { relatedTarget: { dataset: { invoice: '8' } } });
  assert.equal(invoiceSelect.value, '8');
  assert.equal(element('memberPaymentBalance').textContent, 'R25.00');
  assert.equal(calls.length, 0, 'Opening a payment modal does not start checkout');
  const pay = () => element('memberPayForm').fire('submit', { preventDefault() {}, target: element('memberPayForm') });
  pay();
  await Promise.all(jobs.splice(0));
  assert.equal(calls[0].path, '/member/billing/pay/8');
  assert.equal(redirects.at(-1), 'https://checkout.paystack.com/member-test');
  mode = 'bad-url';
  pay();
  await Promise.all(jobs.splice(0));
  assert.equal(redirects.length, 1, 'Invalid checkout origins are rejected');
  assert.equal(messages.at(-1).text, 'Invalid checkout URL');
  element('changeReason').value = 'Keep this reason';
  const request = () => element('changePlan').fire('submit', { preventDefault() {}, target: element('changePlan') });
  mode = 'request-error';
  request();
  await Promise.all(jobs.splice(0));
  assert.equal(hidden, 0);
  assert.equal(element('changeReason').value, 'Keep this reason');
  mode = 'success';
  request();
  await Promise.all(jobs.splice(0));
  assert.equal(hidden, 1);
  assert.equal(redirects.at(-1), '/member/billing?result=request-sent');
  element('viewPayments').fire('click');
  assert.equal(tabs.at(-1), 'memberPaymentsTab');
  mode = 'pending';
  element('verifyPayment').fire('click');
  await Promise.all(jobs.splice(0));
  assert.equal(messages.at(-1).text, 'pending');
});
