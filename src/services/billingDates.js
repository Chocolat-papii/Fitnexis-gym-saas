/** Billing follows the gym's South African calendar, independently of server timezone. */
export const billingToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit'
}).format(now);

// pg returns DATE columns at local midnight. Preserve their calendar date.
export const dateOnly = value => value instanceof Date
  ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  : String(value).slice(0, 10);
