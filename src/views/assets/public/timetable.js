const timetableEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const sessionMoney = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(Number(value || 0));

function renderTimetable(data, role = 'member') {
  const active=data.filter(session=>(!session.status||session.status==='scheduled')&&new Date(session.ends_at||session.starts_at).getTime()>Date.now());
  for (const day of ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']) {
    const column = document.getElementById(day);
    if (!column) continue;
    column.replaceChildren();
    const sessions = active.filter(session => session.day === day).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    if (!sessions.length) {
      const empty = document.createElement('p');
      empty.className = 'small-note p-2';
      empty.textContent = 'No sessions scheduled.';
      column.appendChild(empty);
    }
    for (const session of sessions) {
      const slot = document.createElement('div');
      slot.className = 'timetable-slot';
      const date = new Date(session.starts_at).toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', day: '2-digit', month: 'short', year: 'numeric' });
      const started = session.has_started || new Date(session.starts_at).getTime() <= Date.now();
      let action = '';
      if (started) {
        action = '<span class="badge text-bg-secondary">' + (new Date(session.ends_at).getTime() <= Date.now() ? 'Past session' : 'Booking closed') + '</span>';
      } else if (role !== 'admin') {
        if (session.enrolled) action = '<button class="btn btn-sm btn-success" disabled>Enrolled</button>';
        else if (session.booking_status === 'awaiting_payment') action = '<a class="btn btn-sm btn-primary" href="/member/billing#invoice-' + Number(session.invoice_id) + '">Pay invoice</a>';
        else action = '<button class="btn btn-sm btn-outline-light enroll-btn" data-id="' + Number(session.id) + '">' + (session.is_paid ? 'Reserve place' : 'Join free') + '</button>';
      }
      slot.innerHTML = '<div class="p-2 rounded-3"><div class="d-flex justify-content-between gap-2"><div><div class="fw-semibold">' +
        timetableEscape(session.class_name) + '</div><div>' + timetableEscape(session.time) + ' ' + timetableEscape(date) +
        '</div><div class="small-note">' + (session.is_paid ? timetableEscape(sessionMoney(session.price)) + ' per member' : 'Free session') +
        '</div></div><div>' + action + '</div></div>' +
        (session.location ? '<div class="small-note border-top mt-2 pt-2">' + timetableEscape(session.location) + '</div>' : '') + '</div>';
      column.appendChild(slot);
    }
  }
}

async function refreshTimetable(role) {
  const status = document.getElementById('timetableStatus');
  if (status) { status.setAttribute('role', 'status'); status.textContent = 'Loading sessions...'; }
  try {
    const response = await fetch('/api/sessions', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 401 ? 'Your sign-in has expired. Sign in again to view your sessions.' : 'Could not load sessions. Please try again.');
    const sessions = await response.json();
    if (!Array.isArray(sessions)) throw new Error('Could not load sessions. Please try again.');
    renderTimetable(sessions, role);
    if (status) status.textContent = sessions.length ? '' : 'No sessions scheduled yet.';
  } catch (error) {
    if (status) {
      status.setAttribute('role', 'alert');
      status.textContent = error.message;
      const retry = document.createElement('button');
      retry.className = 'btn btn-sm btn-outline-secondary ms-2';
      retry.type = 'button';
      retry.textContent = 'Retry';
      retry.addEventListener('click', () => refreshTimetable(role));
      status.appendChild(retry);
    }
  }
}

const timetableRole = document.currentScript?.dataset.role;
if (timetableRole) refreshTimetable(timetableRole);

document.addEventListener('click', async event => {
  const button = event.target.closest('.enroll-btn');
  if (!button || button.disabled) return;
  const token = document.querySelector('meta[name="billing-csrf"]')?.content;
  if (!token) { window.location.assign('/login'); return; }
  button.disabled = true;
  try {
    const response = await fetch('/api/class-bookings/book', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'x-billing-csrf': token },
      body: JSON.stringify({ session_id: button.dataset.id })
    });
    if (response.status === 401) { window.location.assign('/login'); return; }
    const data = await response.json();
    if (!response.ok || !data.success) throw Error(data.message || data.error || 'Booking failed');
    if (data.payment_required) {
      window.location.assign('/member/billing?result=session-payment-required#invoice-' + Number(data.invoice_id));
      return;
    }
    button.classList.remove('btn-outline-light');
    button.classList.add('btn-success');
    button.textContent = 'Enrolled';
  } catch (error) {
    if (typeof showPopup === 'function') showPopup(error.message, 'error');
    else alert(error.message);
    button.disabled = false;
  }
});
