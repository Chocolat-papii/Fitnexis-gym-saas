export const billingCycles = ['once_off', 'weekly', 'monthly', 'yearly', 'quarterly'];
export const normalizeBillingCycle = value => ({ 'once-off': 'once_off', onceoff: 'once_off', annual: 'yearly' })[value] || value;

export function nextBillingDate(date, cycle, anchor = date) {
  cycle = normalizeBillingCycle(cycle);
  if (cycle === 'once_off') return null;
  const current = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (cycle === 'weekly') {
    current.setUTCDate(current.getUTCDate() + 7);
    return current.toISOString().slice(0, 10);
  }
  const months = { monthly: 1, quarterly: 3, yearly: 12 }[cycle];
  if (!months) throw Object.assign(new Error('Invalid billing cycle'), { status: 400 });
  const first = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(Number(String(anchor).slice(8, 10)), lastDay));
  return first.toISOString().slice(0, 10);
}
