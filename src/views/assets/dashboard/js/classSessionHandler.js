(() => {
  const form = document.getElementById('sessionForm');
  const save = document.getElementById('saveSessionBtn');
  const toggle = document.getElementById('sessionIsPaid');
  const price = document.getElementById('sessionPrice');
  const csrf = document.querySelector('meta[name="billing-csrf"]').content;
  function paymentFields() {
    document.getElementById('sessionPriceField').classList.toggle('d-none', !toggle.checked);
    price.disabled = !toggle.checked;
    price.required = toggle.checked;
    if (!toggle.checked) price.value = '';
  }
  toggle.addEventListener('change', paymentFields);
  document.getElementById('activityModal').addEventListener('show.bs.modal', event => {
    const button = event.relatedTarget?.closest('.edit-session');
    form.reset();
    delete save.dataset.editId;
    if (button) {
      const data = button.dataset;
      save.dataset.editId = data.id;
      for (const [id, value] of Object.entries({
        sessionClassName: data.class, sessionDate: data.date, sessionTime: data.time,
        sessionCapacity: data.capacity, sessionLocation: data.location, sessionStatus: data.status,
        sessionDuration: data.duration, waitlistSession: data.waitlist === 'true' ? 'Yes' : 'No',
        cancellationSession: data.deadline
      })) document.getElementById(id).value = value || '';
      toggle.checked = data.paid === 'true';
      price.value = data.price || '';
    } else {
      document.getElementById('waitlistSession').value = 'No';
      document.getElementById('cancellationSession').value = '24';
    }
    paymentFields();
    save.textContent = button ? 'Save changes' : 'Create session';
  });
  document.getElementById('sessionClassName').addEventListener('change', event => {
    const option = event.target.selectedOptions[0];
    document.getElementById('sessionDuration').value = option?.dataset.duration || '';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (save.disabled || !form.reportValidity()) return;
    const payload = {
      class_type_id: Number(document.getElementById('sessionClassName').value),
      date: document.getElementById('sessionDate').value,
      time: document.getElementById('sessionTime').value,
      duration: document.getElementById('sessionDuration').value || undefined,
      capacity: Number(document.getElementById('sessionCapacity').value),
      location: document.getElementById('sessionLocation').value,
      status: document.getElementById('sessionStatus').value,
      waitlist_enabled: document.getElementById('waitlistSession').value === 'Yes',
      cancellation_deadline_hours: Number(document.getElementById('cancellationSession').value || 0),
      is_paid: toggle.checked,
      price: toggle.checked ? price.value : '0.00'
    };
    save.disabled = true;
    try {
      const editId = save.dataset.editId;
      const response = await fetch(editId ? '/admin/api/class-sessions/' + editId : '/admin/api/class-sessions', {
        method: editId ? 'PUT' : 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'x-billing-csrf': csrf },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw Error(data.message || data.error || 'Could not save the session');
      location.reload();
    } catch (error) { showPopup(error.message, 'error'); }
    finally { save.disabled = false; }
  });
  document.addEventListener('click', async event => {
    const button = event.target.closest('.delete-session');
    if (!button || button.disabled || !confirm('Delete this session?')) return;
    button.disabled = true;
    try {
      const response = await fetch('/admin/api/class-sessions/' + button.dataset.id, {
        method: 'DELETE', credentials: 'same-origin', headers: { 'x-billing-csrf': csrf }
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.message || data.error || 'Could not delete session');
      location.reload();
    } catch (error) { showPopup(error.message, 'error'); }
    finally { button.disabled = false; }
  });
  paymentFields();
})();
