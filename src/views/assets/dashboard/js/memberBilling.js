(() => {
  const { api, busy, message, paymentMessage } = window.FitnexisBilling;
  document.querySelectorAll('.pay-invoice').forEach(button => button.addEventListener('click', () => busy(button, async () => {
    const data = await api(`/member/billing/pay/${button.dataset.id}`, 'POST', {});
    if (!/^https:\/\/checkout\.paystack\.com\//.test(data.authorization_url)) throw Error('Invalid checkout URL');
    window.location.assign(data.authorization_url);
  })));
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
      window.location.assign('/member/billing?result=request-sent');
    });
  });
})();
