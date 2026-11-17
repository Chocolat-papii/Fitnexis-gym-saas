(() => {
  const gymForm = document.querySelector('[data-gym-form]');
  const confirmation = document.querySelector('[data-platform-reauth]');
  const status = document.querySelector('[data-reauth-status]');
  const gymStatus = document.querySelector('[data-gym-status]');
  if (!gymForm || !confirmation || !status) return;
  const createButton = gymForm.querySelector('button[type="submit"]');
  const createLabel = createButton.textContent;
  let confirmedUntil = Number(gymForm.dataset.reauthUntil) || 0;
  let busy = false;
  let creating = false;

  gymForm.addEventListener('submit', event => {
    if (creating) { event.preventDefault(); return; }
    if (confirmedUntil > Date.now()) {
      creating = true;
      createButton.disabled = true;
      createButton.textContent = 'Creating gym…';
      createButton.classList.add('is-loading');
      gymForm.setAttribute('aria-busy', 'true');
      gymStatus.textContent = 'Creating your gym and its administrator. Please wait…';
      return;
    }
    event.preventDefault();
    confirmation.open = true;
    status.textContent = 'Confirm your identity first. Your gym details are kept on this page.';
    confirmation.scrollIntoView({ behavior: 'smooth', block: 'center' });
    confirmation.querySelector('button')?.focus();
  });

  window.addEventListener('pageshow', () => {
    creating = false;
    createButton.disabled = false;
    createButton.textContent = createLabel;
    createButton.classList.remove('is-loading');
    gymForm.removeAttribute('aria-busy');
    gymStatus.textContent = '';
  });

  confirmation.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy) return;
      busy = true;
      const button = form.querySelector('button');
      const label = button.textContent;
      button.disabled = true;
      button.textContent = form.dataset.reauthAction === 'code' ? 'Sending code…' : 'Confirming…';
      status.textContent = form.dataset.reauthAction === 'code' ? 'Sending a confirmation code to your email…' : 'Checking your password and email code…';
      try {
        const response = await fetch(form.action, {
          method: 'POST', credentials: 'same-origin', redirect: 'error',
          signal: AbortSignal.timeout(20000),
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(Object.fromEntries(new FormData(form))),
        });
        let result;
        try { result = await response.json(); }
        catch { throw new Error('Confirmation could not be completed. Keep your gym details on this page and try again, or sign in again if your session has expired.'); }
        if (!response.ok || !result.ok) throw new Error(result.error || 'Could not confirm identity. Please try again.');
        if (form.dataset.reauthAction === 'confirm') {
          confirmedUntil = Number(result.reauthUntil) || 0;
          form.reset();
        }
        status.textContent = result.message;
      } catch (error) {
        status.textContent = error.message === 'Failed to fetch' || error.name === 'TimeoutError'
          ? 'Could not reach the server. Your gym details are kept; please try again.' : error.message;
      } finally {
        button.disabled = false;
        button.textContent = label;
        busy = false;
      }
    });
  });
})();
