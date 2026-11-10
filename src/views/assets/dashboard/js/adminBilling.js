(() => {
  const { money, cycleLabel, date, safe, status, message, api: request, busy, paymentMessage } = window.FitnexisBilling;
  const api = (path, method, body) => request(`/admin/billing${path}`, method, body);
  let loaded = false;
  let invoices = [], payments = [];
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
    document.querySelectorAll('#billingModals form').forEach(form => {
      const needsLoadedData = !['planForm', 'accountForm'].includes(form.id);
      const button = form.querySelector('[type="submit"]');
      button.disabled = button.dataset.billingBusy === 'true' || (needsLoadedData && !loaded) || [...form.querySelectorAll('select[required]')].some(select => !select.value);
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
    renderInsights(s.overview);
    rows('memberForPlan', m.members, u => `<option value="${Number(u.id)}">${safe(u.firstname)} ${safe(u.lastname)} (${safe(u.email)})</option>`, 'No members available');
    rows('invoiceMember', m.members, u => `<option value="${Number(u.id)}">${safe(u.firstname)} ${safe(u.lastname)}</option>`, 'No members available');
    rows('membershipPlan', p.plans.filter(x => x.is_active), x => `<option value="${Number(x.id)}">${safe(x.name)} · ${money(x.price)} / ${safe(cycleLabel(x.billing_cycle))}</option>`, 'Create an active plan first');
    rows('paymentInvoice', inv.invoices.filter(x => Number(x.balance) > 0 && x.status !== 'void'), x => `<option value="${Number(x.id)}" data-balance="${Number(x.balance)}">${safe(x.invoice_number)} · ${safe(x.firstname)} ${safe(x.lastname)} · ${money(x.balance)} due</option>`, 'No unpaid invoices');
    rows('billingPlans', p.plans, x => `<tr><td>${safe(x.name)}</td><td>${money(x.price)}</td><td>${safe(cycleLabel(x.billing_cycle))}</td><td>${status(x.is_active ? 'active' : 'inactive')}</td><td><button class="btn btn-outline-light btn-sm" data-plan="${Number(x.id)}" data-active="${!x.is_active}">${x.is_active ? 'Deactivate' : 'Activate'}</button></td></tr>`, 'Create your first membership plan above.');
    rows('billingMemberships', ms.memberships, x => `<tr><td>${safe(x.firstname)} ${safe(x.lastname)}</td><td>${safe(x.plan_name)}</td><td>${date(x.next_bill_on)}</td><td>${status(x.status)}</td><td>${['active', 'paused'].includes(x.status) ? `<button class="btn btn-outline-light btn-sm" data-membership="${Number(x.id)}" data-status="${x.status === 'paused' ? 'active' : 'paused'}">${x.status === 'paused' ? 'Resume' : 'Pause'}</button> <button class="btn btn-outline-danger btn-sm" data-membership="${Number(x.id)}" data-status="cancelled">Cancel</button>` : ''}</td></tr>`, 'No memberships assigned yet.');
    invoices = inv.invoices;
    payments = pm.payments;
    renderInvoices();
    renderPayments();
    rows('planRequests', req.requests, x => `<tr><td>${safe(x.firstname)} ${safe(x.lastname)}</td><td>${safe(x.plan_name)}<div class="billing-note">${safe(x.reason)}</div></td><td>${status(x.status)}</td><td>${x.status === 'pending' ? `<button class="btn btn-sm btn-success" data-decision="approved" data-id="${Number(x.id)}">Approve</button> <button class="btn btn-sm btn-outline-danger" data-decision="rejected" data-id="${Number(x.id)}">Reject</button>` : ''}</td></tr>`, 'No plan changes requested.');
    rows('billingReminders', rem.reminders, x => `<tr><td>${safe(x.invoice_number)}</td><td>${safe(x.firstname)} ${safe(x.lastname)}</td><td>${status(x.kind)}</td><td>${date(x.created_at)}</td></tr>`, 'No payment reminders queued.');
    document.getElementById('paystackAccount').value = account.settings.paystack_subaccount || '';
    loaded = true;
    updatePaymentAmount();
  }
  function renderInsights(summary) {
    document.getElementById('membershipCaption').textContent = `${Number(summary.paused_memberships || 0)} paused memberships`;
    document.getElementById('overdueInsight').textContent = `${money(summary.overdue_amount)} remaining across ${Number(summary.overdue_count || 0)} overdue invoices`;
    document.getElementById('pendingInsight').textContent = `${Number(summary.pending_payments || 0)} awaiting confirmation · ${money(summary.pending_payment_amount)}`;
    document.getElementById('requestsInsight').textContent = `${Number(summary.pending_requests || 0)} requests awaiting your review`;
    document.getElementById('requestsBadge').textContent = Number(summary.pending_requests || 0);
    const total = Number(summary.month_collected || 0);
    document.getElementById('collectionMethods').innerHTML = [['Paystack', summary.month_paystack], ['EFT', summary.month_eft], ['Cash', summary.month_cash]].map(([label, amount]) => {
      const percentage = total ? Math.min(100, Math.max(0, Number(amount || 0) / total * 100)) : 0;
      return `<div class="billing-method"><div class="billing-method-label"><span>${label}</span><strong>${money(amount)}</strong></div><div class="progress" role="progressbar" aria-label="${label} share of collections" aria-valuenow="${Math.round(percentage)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${percentage}%"></div></div></div>`;
    }).join('') + (total ? '' : '<p class="billing-note mt-3 mb-0">No confirmed payments this month yet.</p>');
  }
  function renderInvoices() {
    const filter = document.getElementById('invoiceFilter').value || 'all';
    const search = (document.getElementById('invoiceSearch').value || '').trim().toLowerCase();
    const visible = invoices.filter(invoice => (filter === 'all' || (filter === 'unpaid' ? Number(invoice.balance) > 0 && invoice.status !== 'void' : invoice.display_status === filter))
      && `${invoice.invoice_number} ${invoice.firstname} ${invoice.lastname} ${invoice.description || ''}`.toLowerCase().includes(search));
    rows('billingInvoices', visible, x => `<tr><td>${safe(x.invoice_number)}<div class="billing-note">${safe(x.description)}</div></td><td>${safe(x.firstname)} ${safe(x.lastname)}</td><td>${money(x.amount)}</td><td>${money(x.paid_amount)}</td><td>${money(x.balance)}</td><td>${date(x.due_at)}</td><td>${status(x.display_status)}</td><td><a class="btn btn-outline-light btn-sm" target="_blank" rel="noopener" href="/admin/billing/invoices/${Number(x.id)}">View / print</a></td></tr>`, invoices.length ? 'No invoices match your filters.' : 'No invoices yet. Use Create invoice or Generate due invoices to get started.');
  }
  function renderPayments() {
    const filter = document.getElementById('paymentFilter').value || 'all';
    rows('billingPayments', payments.filter(payment => filter === 'all' || payment.status === filter), x => `<tr><td>${safe(x.reference)}</td><td>${safe(x.firstname)} ${safe(x.lastname)}</td><td>${money(x.amount)}</td><td>${safe(x.provider.toUpperCase())}</td><td>${status(x.status)}</td><td>${date(x.paid_at)}</td><td>${x.provider === 'paystack' && x.status === 'pending' ? `<button class="btn btn-outline-light btn-sm" data-verify="${safe(x.reference)}">Check status</button>` : ''}</td></tr>`, payments.length ? 'No payments match this status.' : 'No payments recorded yet.');
  }
  document.getElementById('invoiceFilter').addEventListener('change', renderInvoices);
  document.getElementById('invoiceSearch').addEventListener('input', renderInvoices);
  document.getElementById('paymentFilter').addEventListener('change', renderPayments);
  document.getElementById('viewOverdue').addEventListener('click', () => {
    document.getElementById('invoiceFilter').value = 'overdue';
    document.getElementById('invoiceSearch').value = '';
    renderInvoices();
    window.bootstrap.Tab.getOrCreateInstance(document.getElementById('invoicesTab')).show();
    document.getElementById('invoicesPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  document.getElementById('viewPending').addEventListener('click', () => {
    document.getElementById('paymentFilter').value = 'pending';
    renderPayments();
    window.bootstrap.Tab.getOrCreateInstance(document.getElementById('paymentsTab')).show();
    document.getElementById('paymentsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
      const modal = event.target.closest?.('.modal');
      if (modal) window.bootstrap?.Modal.getInstance(modal)?.hide();
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
    window.bootstrap?.Modal.getInstance(document.getElementById('generateModal'))?.hide();
    message(`${data.job.created} due invoices generated.`);
  }));
  const handleRecordAction = event => {
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
  };
  document.getElementById('billingAdmin').addEventListener('click', handleRecordAction);
  document.getElementById('billingModals').addEventListener('click', handleRecordAction);
  document.querySelectorAll('.billing-modal').forEach(modal => {
    modal.addEventListener('show.bs.modal', () => modal.querySelector('.billing-modal-message')?.classList.add('d-none'));
    modal.addEventListener('shown.bs.modal', () => modal.querySelector('input:not([disabled]), select:not([disabled])')?.focus());
  });
  function setDates() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    for (const id of ['membershipStart', 'invoiceDue']) if (!document.getElementById(id).value) document.getElementById(id).value = today;
  }
  setDates();
  setFormAvailability();
  void loadBilling().catch(error => message(error.message, true)).finally(setFormAvailability);
})();
