// Shared shell behavior, independent of page data and chart libraries.
(() => {
  const root = document.documentElement;
  const themeButton = document.getElementById('themeToggle');
  const themeIcon = document.getElementById('themeIcon');
  function setTheme(theme) {
    root.dataset.bsTheme = theme;
    if (themeIcon) themeIcon.className = theme === 'dark' ? 'bi bi-sun' : 'bi bi-moon';
    themeButton?.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    try { localStorage.setItem('theme', theme); } catch { /* Storage may be disabled. */ }
  }
  let saved;
  try { saved = localStorage.getItem('theme'); } catch { /* Use the default theme. */ }
  setTheme(saved === 'light' ? 'light' : 'dark');
  themeButton?.addEventListener('click', () => setTheme(root.dataset.bsTheme === 'dark' ? 'light' : 'dark'));

  const toggle = document.getElementById('toggleSidebar');
  const sidebar = document.querySelector('.sidebar');
  if (!toggle || !sidebar) return;
  sidebar.id ||= 'dashboardSidebar';
  toggle.setAttribute('aria-controls', sidebar.id);
  toggle.setAttribute('aria-label', 'Toggle navigation');
  const backdrop = document.createElement('div');
  backdrop.className = 'backdrop';
  document.body.append(backdrop);
  function setOpen(open) {
    sidebar.classList.toggle('open', open);
    backdrop.classList.toggle('show', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (window.innerWidth < 992) sidebar.inert = !open;
    else sidebar.inert = false;
  }
  toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && sidebar.classList.contains('open')) { setOpen(false); toggle.focus(); }
  });
  sidebar.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setOpen(false)));
  window.addEventListener('resize', () => setOpen(false));
  setOpen(false);
})();
