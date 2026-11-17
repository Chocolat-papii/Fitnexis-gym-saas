(() => {
  if (window.FitnexisLoading) return;
  const active = new Map();
  const forms = new Map();
  const controlFor = event => event.submitter || (event.type === 'submit'
    ? event.target?.querySelector?.('button:not([type="button"]):not([type="reset"]), input[type="submit"]')
    : event.target?.closest?.('button, input[type="submit"], input[type="image"], a[href]'));

  function start(button, { disable = false, form = null } = {}) {
    if (!button || active.has(button)) return () => {};
    const original = {
      busy: button.getAttribute('aria-busy'), disabled: button.getAttribute('aria-disabled'),
      nativeDisabled: button.disabled, form, formBusy: form?.getAttribute('aria-busy'),
    };
    const spinner = document.createElement('span');
    spinner.className = 'fitnexis-spinner';
    spinner.setAttribute('aria-hidden', 'true');
    // Preserve the label, icons, focus and event listeners on the original control.
    if (button.tagName !== 'INPUT') button.appendChild(spinner);
    button.classList.add('fitnexis-loading');
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-disabled', 'true');
    if (disable) button.disabled = true;
    if (form) { forms.set(form, button); form.setAttribute('aria-busy', 'true'); }
    const restore = (element, name, value) => value === null ? element.removeAttribute(name) : element.setAttribute(name, value);
    let finished = false;
    const stop = () => {
      if (finished) return;
      finished = true;
      spinner.remove();
      button.classList.remove('fitnexis-loading');
      restore(button, 'aria-busy', original.busy);
      restore(button, 'aria-disabled', original.disabled);
      if (disable) button.disabled = original.nativeDisabled;
      if (form && forms.get(form) === button) {
        forms.delete(form); restore(form, 'aria-busy', original.formBusy);
      }
      active.delete(button);
    };
    active.set(button, stop);
    return stop;
  }

  function wrap(handler, { selector } = {}) {
    return function (event, ...args) {
      // Delegated handlers must never reserve unrelated buttons on the page.
      if (selector && !event.target?.closest?.(selector)) return handler.call(this, event, ...args);
      const button = controlFor(event);
      const form = event.type === 'submit' ? event.target : null;
      if (active.has(button) || forms.has(form)) { event.preventDefault(); return; }
      // Run synchronous validation/confirmation and payload construction first.
      // Existing handlers may check disabled or rely on an unchanged FormData.
      const result = handler.call(this, event, ...args);
      if (!result || typeof result.then !== 'function') return result;
      const stop = start(button, { form });
      return Promise.resolve(result).catch(() => {
        const message = document.createElement('p');
        message.className = 'fitnexis-loading-error';
        message.setAttribute('role', 'alert');
        message.textContent = 'Could not complete this action. Check your connection and try again.';
        (form || button?.parentElement)?.appendChild(message);
      }).finally(stop);
    };
  }

  // Native submissions keep the clicked button's name/value in the request.
  // Capture blocks duplicates before any page-specific handler runs.
  document.addEventListener('submit', event => {
    if (forms.has(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('submit', event => {
    queueMicrotask(() => {
      if (event.defaultPrevented || event.target.method === 'dialog' || (event.target.target && event.target.target !== '_self')) return;
      const button = event.submitter || event.target.querySelector('button:not([type="button"]):not([type="reset"]), input[type="submit"]');
      start(button, { form: event.target });
    });
  });
  document.addEventListener('click', event => {
    if (active.has(controlFor(event))) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('click', wrap(async event => {
    const link = event.target?.closest?.('a[data-loading-download]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const response = await fetch(link.href, { credentials: 'same-origin', signal: AbortSignal.timeout(30000) });
    if (!response.ok || !response.headers.get('Content-Type')?.includes('text/csv')) throw new Error('Download failed');
    const url = URL.createObjectURL(await response.blob());
    const download = document.createElement('a');
    download.href = url;
    download.download = response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)/i)?.[1] || 'fitnexis-export.csv';
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, { selector: 'a[data-loading-download]' }));
  document.addEventListener('click', event => {
    const link = event.target?.closest?.('a[href]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol) || /\.(csv|pdf)$/i.test(url.pathname) || (url.pathname === location.pathname && url.search === location.search)) return;
    queueMicrotask(() => { if (!event.defaultPrevented) start(link); });
  });
  window.addEventListener('pageshow', () => { for (const stop of active.values()) stop(); });
  window.FitnexisLoading = { start, wrap };
})();
