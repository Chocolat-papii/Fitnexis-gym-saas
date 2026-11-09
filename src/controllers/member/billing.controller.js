import { db } from '../../config/db.js';
import { csrfToken } from '../../middleware/billingCsrf.js';
import * as billing from '../../services/billing.service.js';
import { initiatePaystackCheckout, verifyAndSettle } from '../../services/paystack.service.js';

const fail = (res, error) => {
  console.error('Member billing:', error.status ? error.message : error);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Billing operation failed' });
};

export async function viewMemberBlling(req, res, next) {
  try {
    const { rows: [member] } = await db.query(`SELECT id,firstname,lastname,email,phone,tier,joindate,role,gym_id
      FROM users WHERE id=$1 AND gym_id=$2`, [req.user.sub, req.gymId]);
    if (!member) return res.status(404).send('Member not found');
    const data = await billing.memberBilling(req.gymId, member.id);
    return res.render('dashboard/member-billing', { member: { ...res.locals.member, ...member }, gym: req.gym, billing: data, activePage: 'billing', csrf: csrfToken(req), result: req.query.result || null });
  } catch (error) { next(error); }
}
export async function memberInvoice(req, res, next) {
  try {
    const { invoice, payments } = await billing.invoiceDetail(req.gymId, req.params.id, Number(req.user.sub));
    res.render('billing/invoice', { invoice, payments, gym: req.gym, member: res.locals.member });
  } catch (error) { if (error.status) res.status(error.status).send(error.message); else next(error); }
}
export async function startCheckout(req, res) {
  try {
    const data = await initiatePaystackCheckout(req.gymId, Number(req.user.sub), req.params.id);
    res.json(data);
  } catch (error) { fail(res, error); }
}
export async function requestChange(req, res) {
  try {
    const request = await billing.requestPlanChange(req.gymId, Number(req.user.sub), req.body);
    res.status(201).json({ request });
  } catch (error) { fail(res, error); }
}
export async function verifyPayment(req, res) {
  try {
    res.json(await verifyAndSettle(req.params.reference, { gymId: req.gymId, userId: Number(req.user.sub) }));
  } catch (error) { fail(res, error); }
}
/** Callback is only informational; server verifies the transaction before recording success. */
export async function returnFromPaystack(req, res) {
  const reference = String(req.query.reference || '');
  try {
    const result = await verifyAndSettle(reference, { gymId: req.gymId, userId: Number(req.user.sub) });
    res.redirect(`/member/billing?result=${encodeURIComponent(result.status)}`);
  } catch (error) {
    console.error('Paystack callback:', error);
    res.redirect('/member/billing?result=verification-pending');
  }
}
