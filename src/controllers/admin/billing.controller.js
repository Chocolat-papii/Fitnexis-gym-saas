import { db } from '../../config/db.js';
import { csrfToken } from '../../middleware/billingCsrf.js';
import * as billing from '../../services/billing.service.js';
import { verifyAndSettle } from '../../services/paystack.service.js';

const respond = (res, error) => {
  if (error.code === '23505') return res.status(409).json({ error: 'Duplicate billing record' });
  if (error.code === '23503') return res.status(400).json({ error: 'Related record not found' });
  console.error('Billing:', error.status ? error.message : error);
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'Billing operation failed' });
};
const action = fn => async (req, res) => {
  try { const data = await fn(req); return res.json(data); } catch (error) { return respond(res, error); }
};

export async function billingPage(req, res, next) {
  try {
    res.render('admin/admin-billing', { gym: req.gym, activePage: 'billing', csrf: csrfToken(req) });
  } catch (error) { next(error); }
}
export const getOverview = action(async req => ({ overview: await billing.billingOverview(req.gymId) }));
export const getPlans = action(async req => {
  const { rows } = await db.query('SELECT * FROM plans WHERE gym_id=$1 ORDER BY id DESC', [req.gymId]);
  return { plans: rows };
});
export const addPlan = action(async req => ({ plan: await billing.createPlan(req.gymId, req.body) }));
export const editPlan = action(async req => ({ plan: await billing.updatePlan(req.gymId, req.params.id, req.body) }));
export const getMemberships = action(async req => {
  const { rows } = await db.query(`SELECT m.id,m.user_id,m.status,m.start_date,m.next_bill_on,m.plan_id,
    p.name AS plan_name,u.firstname,u.lastname FROM memberships m JOIN plans p ON p.id=m.plan_id AND p.gym_id=m.gym_id
    JOIN users u ON u.id=m.user_id AND u.gym_id=m.gym_id WHERE m.gym_id=$1 ORDER BY m.id DESC LIMIT 200`, [req.gymId]);
  return { memberships: rows };
});
export const addMembership = action(async req => ({ membership: await billing.assignMembership(req.gymId, req.body) }));
export const changeMembership = action(async req => ({ membership: await billing.setMembershipStatus(req.gymId, req.params.id, req.body.status) }));
export const getMembers = action(async req => {
  const { rows } = await db.query("SELECT id,firstname,lastname,email FROM users WHERE gym_id=$1 AND role='member' ORDER BY firstname,lastname LIMIT 500", [req.gymId]);
  return { members: rows };
});
export const getInvoices = action(async req => ({ invoices: await billing.listInvoices(req.gymId, req.query) }));
export const addInvoice = action(async req => ({ invoice: await billing.createInvoice(req.gymId, req.body) }));
export const getPayments = action(async req => ({ payments: await billing.listPayments(req.gymId) }));
export const verifyPayment = action(async req => verifyAndSettle(req.params.reference, { gymId: req.gymId }));
export const addManualPayment = action(async req => ({ payment: await billing.recordManualPayment(req.gymId, req.user.sub, req.body) }));
export const runRecurringBilling = action(async req => ({ job: await billing.runBillingCycle(req.gymId) }));
export const getPlanRequests = action(async req => ({ requests: await billing.listPlanRequests(req.gymId) }));
export const decidePlanRequest = action(async req => ({ request: await billing.resolvePlanChange(req.gymId, req.params.id, req.body.status) }));
export const getReminders = action(async req => ({ reminders: await billing.listReminders(req.gymId) }));
export const savePaystackAccount = action(async req => ({ settings: await billing.setPaystackSubaccount(req.gymId, req.body.paystack_subaccount) }));
export const getPaystackAccount = action(async req => {
  const { rows: [settings] } = await db.query('SELECT paystack_subaccount FROM gym_payment_settings WHERE gym_id=$1', [req.gymId]);
  return { settings: settings || { paystack_subaccount: null } };
});
export const downloadBillingCsv = async (req, res) => {
  try {
    const invoices = await billing.listInvoices(req.gymId, { limit: 500 });
    const esc = value => {
      const text = String(value ?? '');
      return `"${(/^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`;
    };
    const lines = [ ['Invoice','Member','Amount','Paid','Balance','Status','Due'], ...invoices.map(x => [x.invoice_number, `${x.firstname} ${x.lastname}`,x.amount,x.paid_amount,x.balance,x.display_status,x.due_at]) ];
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="fitnexis-billing.csv"');
    res.send(lines.map(row => row.map(esc).join(',')).join('\r\n'));
  } catch (error) { respond(res, error); }
};
export async function adminInvoice(req, res, next) {
  try {
    const { invoice, payments } = await billing.invoiceDetail(req.gymId, req.params.id);
    res.render('billing/invoice', { invoice, payments, gym: req.gym, member: res.locals.member });
  } catch (error) { if (error.status) res.status(error.status).send(error.message); else next(error); }
}
