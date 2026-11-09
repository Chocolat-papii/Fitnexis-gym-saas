import { verifyWebhookSignature, verifyAndSettle } from '../services/paystack.service.js';

export async function paystackWebhook(req, res) {
  if (!verifyWebhookSignature(req.body, req.get('x-paystack-signature'))) return res.sendStatus(401);
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); }
  catch { return res.sendStatus(400); }
  if (event?.event !== 'charge.success') return res.sendStatus(200);
  if (typeof event.data?.reference !== 'string') return res.sendStatus(400);
  try {
    await verifyAndSettle(event.data.reference);
    return res.sendStatus(200);
  } catch (error) {
    console.error('Paystack reconciliation:', error.status ? error.message : error);
    return res.sendStatus(error.status === 404 ? 200 : 503);
  }
}
