import { verifyWebhookSignature, verifyAndSettle } from '../services/paystack.service.js';
import {verifySaasPayment} from '../services/saasBilling.service.js';
import {reconcileRefund} from '../services/refunds.service.js';
import {reconcileDispute} from '../services/paymentReconciliation.service.js';

export async function paystackWebhook(req, res) {
  if (!verifyWebhookSignature(req.body, req.get('x-paystack-signature'))) return res.sendStatus(401);
  let event;
  try { event = JSON.parse(req.body.toString('utf8')); }
  catch { return res.sendStatus(400); }
  try {
    if(event?.event==='charge.success'){
      if(typeof event.data?.reference!=='string')return res.sendStatus(400);
      if(event.data.reference.startsWith('fns-'))await verifySaasPayment(event.data.reference);
      else if(event.data.reference.startsWith('fnx-'))await verifyAndSettle(event.data.reference);
    }else if(event?.event?.startsWith('refund.'))await reconcileRefund(event.data?.id);
    else if(event?.event?.startsWith('charge.dispute.'))await reconcileDispute(event.data?.id);
    return res.sendStatus(200);
  } catch (error) {
    console.error('Paystack reconciliation:', error.status ? error.message : error);
    return res.sendStatus(error.status === 404 ? 200 : 503);
  }
}
