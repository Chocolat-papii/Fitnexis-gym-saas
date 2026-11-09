window.FitnexisBilling = (() => {
  const token = document.querySelector('meta[name="billing-csrf"]').content;
  const money = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value || 0));
  const date = value => value ? new Date(value).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const status = value => `<span class="billing-status billing-status-${safe(value)}">${safe(value)}</span>`;
  function message(text, isError = false) {
    const box = document.getElementById('billingMessage');
    box.textContent = text;
    box.classList.remove('d-none', 'alert-info', 'alert-danger');
    box.classList.add(isError ? 'alert-danger' : 'alert-info');
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  async function api(path, method = 'GET', body) {
    const response = await fetch(path, {
      method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-billing-csrf': token },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data;
    try { data = await response.json(); }
    catch { throw Error('Could not load billing. Refresh the page and sign in again if needed.'); }
    if (!response.ok) throw Error(data.error || 'Could not process the billing request');
    return data;
  }
  async function busy(button, work) {
    if (button.disabled) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Please wait…';
    try { await work(); }
    catch (error) { message(error.message, true); }
    finally { if (button.isConnected) { button.disabled = false; button.textContent = label; } }
  }
  const paymentMessage = status => ({
    succeeded: 'Payment confirmed. Your invoice balance has been updated.',
    failed: 'The payment was not completed. You can try again.',
    abandoned: 'Checkout was not completed. You can try again.',
    reversed: 'The payment was reversed. Contact your gym for assistance.'
  })[status] || 'Payment is still awaiting confirmation. Check its status again shortly.';
  return { money, date, safe, status, message, api, busy, paymentMessage };
})();
