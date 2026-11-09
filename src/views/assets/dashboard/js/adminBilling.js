(() => {
  const { money, date, safe, status, message, api: request, busy, paymentMessage } = window.FitnexisBilling;
  const api = (path, method, body) => request(`/admin/billing${path}`, method, body);
  let loaded = false;
  function rows(id, data, render, empty = 'No records yet.') {
    const element = document.getElementById(id);
    if (element.tagName === 'SELECT') {
      const selected = element.value;
      element.innerHTML = data.length ? data.map(render).join('') : `<option value="">${safe(empty)}</option>`;
      if ([...element.options].some(option => option.value === selected)) element.value = selected;
      element.disabled = !data.length;
    } else {
      const count = element.closest('table').querySelectorAll('thead th').length;
      element.innerHTML = data.length ? data.map(render).join('') : `<tr><td class="billing-empty" colspan="${count}">${safe(empty)}</td></tr>`;
    }
  }
  function setFormAvailability() {
    document.querySelectorAll('#billingAdmin form').forEach(form => {
      form.querySelector('[type="submit"]').disabled = !loaded || [...form.querySelectorAll('select[required]')].some(select => !select.value);
    });
    document.getElementById('runBilling').disabled = !loaded;
  }
  async function loadBilling() {
    const [s, p, m, ms, inv, pm, req, rem, account] = await Promise.all([
      '/overview', '/plans', '/members', '/memberships', '/invoices', '/payments', '/requests', '/reminders', '/settings'
    ].map(path => api(path)));
    document.getElementById('monthCollected').textContent = money(s.overview.month_collected);
    document.getElementById('outstanding').textContent = money(s.overview.outstanding);
    document.getElementById('overdueCount').textContent = s.overview.overdue_count;
    document.getElementById('activeMemberships').textContent = s.overview.active_memberships;
    rows('memberForPlan', m.members, u => `<option value="${Number(u.id)}">${safe(u.firstname)} ${safe(u.lastname)} (${safe(u.email)})</option>`, 'No members available');
    rows('invoiceMember', m.members, u => `<option value="${Number(u.id)}">${safe(u.firstname)} ${safe(u.lastname)}</option>`, 'No members available');
    rows('membershipPlan', p.plans.filter(x => x.is_active), x => `<option value="${Number(x.id)}">${safe(x.name)} · ${money(x.price)} / ${safe(x.billing_cycle)}</option>`, 'Create an active plan first');
    rows('paymentInvoice', inv.invoices.filter(x => Number(x.balance) > 0 && x.status !== 'void'), x => `<option value="${Number(x.id)}" data-balance="${Number(x.balance)}">${safe(x.invoice_number)} · ${safe(x.firstname)} ${safe(x.lastname)} · ${money(x.balance)} due</option>`, 'No unpaid invoices');
    rows('billingPlans', p.plans, x => `<tr><td>${safe(x.name)}</td><td>${money(x.price)}</td><td>${safe(x.billing_cycle)}</td><td>${status(x.is_active ? 'active' : 'inactive')}</td><td><button class="btn btn-outline-light btn-sm" data-plan="${Number(x.id)}" data-active="${!x.is_active}">${x.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>`, 'Create your first membership plan above.');
    rows('billingMemberships', ms.memberships, x => `<tr><td>${safe(x.firstname)} ${safe(x.lastname)}</td><td>${safe(x.plan_name)}</td><td>${date(x.next_bill_on)}</td><td>${status(x.status)}</td><td>${['active', 'paused'].includes(x.status) ? `<button class="btn btn-outline-light btn-sm" data-membership="${Number(x.id)}" data-status="${x.status === 'paused' ? 'active' : 'paused'}">${x.status === 'paused' ? 'Resume' : 'Pause'}</button> <button class="btn btn-outline-danger btn-sm" data-membership="${Number(x.id)}" data-status="cancelled">Cancel</button>` : ''}</td></tr>`, 'No memberships assigned yet.');
    rows('billingInvoices', inv.invoices, x => `<tr><td>${safe(x.invoice_number)}</td><td>${safe(x.firstname)} ${safe(x.lastname)}</td><td>${money(x.amount)}</td><td>${money(x.paid_amount)}</td><td>${money(x.balance)}</td><td>${date(x.due_at)}</td><td>${status(x.display_status)}</td><td><a class="btn btn-outline-light btn-sm" target="_blank" rel="noopener" href="/admin/billing/invoices/${Number(x.id)}">View / print</a></td></tr>`, 'No invoices yet. Assign a membership and generate due invoices, or create a one-off invoice.');
    rows('billingPayments', pm.payments, x => `<tr><td>${safe(x.reference)}</td><td>${safe(x.firstname)} ${safe(x.lastname)}</td><td>${money(x.amount)}</td><td>${safe(x.provider.toUpperCase())}</td><td>${status(x.status)}</td><td>${date(x.paid_at)}</td><td>${x.provider === 'paystack' && x.status === 'pending' ? `<button class="btn btn-outline-light btn-sm" data-verify="${safe(x.reference)}">Check status</button>` : ''}</td></tr>`, 'No payments recorded yet.');
    rows('planRequests', req.requests, x => `<tr><td>${safe(x.firstname)} ${safe(x.lastname)}</td><td>${safe(x.plan_name)}<div class="billing-note">${safe(x.reason)}</div></td><td>${status(x.status)}</td><td>${x.status === 'pending' ? `<button class="btn btn-sm btn-success" data-decision="approved" data-id="${Number(x.id)}">Approve</button> <button class="btn btn-sm btn-outline-danger" data-decision="rejected" data-id="${Number(x.id)}">Reject</button>` : ''}</td></tr>`, 'No plan changes requested.');
    rows('billingReminders', rem.reminders, x => `<tr><td>${safe(x.invoice_number)}</td><td>${safe(x.firstname)} ${safe(x.lastname)}</td><td>${status(x.kind)}</td><td>${date(x.created_at)}</td></tr>`, 'No payment reminders queued.');
    document.getElementById('paystackAccount').value = account.settings.paystack_subaccount || '';
    loaded = true;
    updatePaymentAmount();
  }
  function updatePaymentAmount() {
    const amount = document.getElementById('paymentInvoice').selectedOptions[0]?.dataset.balance;
    const input = document.getElementById('paymentAmount');
    input.value = amount || '';
    if (amount) input.max = amount;
    else input.removeAttribute('max');
  }
  document.getElementById('paymentInvoice').addEventListener('change', updatePaymentAmount);
  const forms = { planForm: '/plans', membershipForm: '/memberships', invoiceForm: '/invoices', manualPaymentForm: '/payments/manual', accountForm: '/settings' };
  Object.entries(forms).forEach(([id, path]) => document.getElementById(id).addEventListener('submit', event => {
    event.preventDefault();
    void mutate(event.submitter || event.target.querySelector('[type="submit"]'), async () => {
      await api(path, 'POST', Object.fromEntries(new FormData(event.target)));
      message('Saved successfully.');
      if (id !== 'accountForm') event.target.reset();
      setDates();
    });
  }));
  async function mutate(button, operation) {
    await busy(button, async () => {
      await operation();
      try { await loadBilling(); }
      catch { loaded = false; throw Error('The change was saved, but the refreshed data could not load. Refresh before making another change.'); }
    });
    setFormAvailability();
  }
  document.getElementById('runBilling').addEventListener('click', event => void mutate(event.currentTarget, async () => {
    const data = await api('/run', 'POST', {});
    message(`${data.job.created} due invoices generated.`);
  }));
  document.getElementById('billingAdmin').addEventListener('click', event => {
    const button = event.target.closest('[data-plan], [data-membership], [data-decision], [data-verify]');
    if (!button || !loaded) return;
    void mutate(button, async () => {
      if (button.dataset.plan) await api(`/plans/${button.dataset.plan}`, 'PATCH', { is_active: button.dataset.active === 'true' });
      else if (button.dataset.membership) await api(`/memberships/${button.dataset.membership}`, 'PATCH', { status: button.dataset.status });
      else if (button.dataset.decision) await api(`/requests/${button.dataset.id}`, 'POST', { status: button.dataset.decision });
      else {
        const result = await api(`/payments/${encodeURIComponent(button.dataset.verify)}/verify`, 'POST', {});
        message(paymentMessage(result.status));
        return;
      }
      message('Updated successfully.');
    });
  });
  function setDates() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    for (const id of ['membershipStart', 'invoiceDue']) if (!document.getElementById(id).value) document.getElementById(id).value = today;
  }
  setDates();
  setFormAvailability();
  void loadBilling().catch(error => message(error.message, true)).finally(setFormAvailability);
})();
