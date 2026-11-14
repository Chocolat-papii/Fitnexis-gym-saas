(() => {
  const { api, busy, message, paymentMessage, money } = window.FitnexisBilling;
  const invoiceSelect = document.getElementById('memberPaymentInvoice');
  const paymentModal = document.getElementById('memberPaymentModal');
  function updateAmount() {
    document.getElementById('memberPaymentBalance').textContent = money(invoiceSelect.selectedOptions[0]?.dataset.balance);
  }
  invoiceSelect.addEventListener('change', updateAmount);
  paymentModal.addEventListener('show.bs.modal', event => {
    const invoiceId = event.relatedTarget?.dataset.invoice;
    if (invoiceId) invoiceSelect.value = invoiceId;
    updateAmount();
  });
  document.getElementById('memberPayForm').addEventListener('submit', event => {
    event.preventDefault();
    const button = event.target.querySelector('[type="submit"]');
    void busy(button, async () => {
      const invoiceId = Number(invoiceSelect.value);
      if (!Number.isSafeInteger(invoiceId) || invoiceId < 1) throw Error('Choose a payable invoice');
      const data = await api(`/member/billing/pay/${invoiceId}`, 'POST', {});
      if (!/^https:\/\/checkout\.paystack\.com\//.test(data.authorization_url)) throw Error('Invalid checkout URL');
      window.location.assign(data.authorization_url);
    });
  });
  function showTab(id) {
    const tab = document.getElementById(id);
    window.bootstrap.Tab.getOrCreateInstance(tab).show();
  }
  document.querySelectorAll('[data-view-payments]').forEach(button => button.addEventListener('click', () => {
    showTab('memberPaymentsTab');
    document.getElementById('memberPaymentsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  document.querySelectorAll('[data-verify]').forEach(button => button.addEventListener('click', () => busy(button, async () => {
    const result = await api(`/member/billing/payments/${encodeURIComponent(button.dataset.verify)}/verify`, 'POST', {});
    if (['succeeded', 'failed', 'abandoned', 'reversed'].includes(result.status)) {
      window.location.assign(`/member/billing?result=${encodeURIComponent(result.status)}`);
    } else message(paymentMessage(result.status));
  })));
  document.getElementById('changePlan').addEventListener('submit', event => {
    event.preventDefault();
    const button = event.target.querySelector('[type="submit"]');
    void busy(button, async () => {
      await api('/member/billing/requests', 'POST', Object.fromEntries(new FormData(event.target)));
      window.bootstrap.Modal.getInstance(document.getElementById('memberPlanModal'))?.hide();
      window.location.assign('/member/billing?result=request-sent');
    });
  });
  document.querySelectorAll('.billing-modal').forEach(modal => {
    modal.addEventListener('show.bs.modal', () => modal.querySelector('.billing-modal-message')?.classList.add('d-none'));
    modal.addEventListener('shown.bs.modal', () => modal.querySelector('select:not([disabled]), input:not([disabled])')?.focus());
  });
  const result = new URLSearchParams(window.location.search).get('result');
  if (result === 'request-sent') showTab('memberRequestsTab');
  else if (['verification-pending', 'failed', 'abandoned', 'reversed'].includes(result)) showTab('memberPaymentsTab');
  if (/^#invoice-\d+$/.test(window.location.hash)) {
    showTab('memberInvoicesTab');
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
})();
