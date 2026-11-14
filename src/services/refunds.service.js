import {db} from '../config/db.js';
import {transaction,audit,notify} from './audit.service.js';
import {commercialError as fail,integer,commissionReversal} from './commission.service.js';
import {paystackRequest,paystackMode} from './paystackClient.js';

export async function requestRefund(gymId,actor,input) {
  const paymentId=integer(input.payment_id,1),amount=integer(input.amount_cents,1);
  const reference=String(input.reference||''),reason=String(input.reason||'').trim();
  if(!/^fnr-[a-f0-9-]{36}$/.test(reference)||reason.length<8||reason.length>500)throw fail('Provide a refund reference and a reason (8–500 characters).');
  const reserved=await transaction(async client=>{
    const {rows:[payment]}=await client.query("SELECT * FROM payments WHERE id=$1 AND gym_id=$2 AND provider='paystack' AND status='succeeded' FOR UPDATE",[paymentId,gymId]);
    if(!payment||payment.provider_mode!==paystackMode())throw fail('Verified Paystack payment not found in this environment.',404);
    const {rows:[old]}=await client.query('SELECT * FROM payment_refunds WHERE reference=$1',[reference]);
    if(old){if(old.payment_id!==paymentId||old.gym_id!==gymId||Number(old.amount_cents)!==amount)throw fail('Refund reference is already in use.',409);return {refund:old,payment};}
    const {rows:[sum]}=await client.query("SELECT COALESCE(SUM(amount_cents),0) AS total FROM payment_refunds WHERE payment_id=$1 AND status<>'failed'",[paymentId]);
    if(amount+Number(sum.total)>Math.round(Number(payment.amount)*100))throw fail('Refund exceeds the available payment balance.',409);
    if(payment.dispute_status&&payment.dispute_status!=='resolved')throw fail('Resolve the payment dispute before requesting a refund.',409);
    const {rows:[refund]}=await client.query('INSERT INTO payment_refunds(gym_id,payment_id,reference,amount_cents,reason) VALUES($1,$2,$3,$4,$5) RETURNING *',[gymId,paymentId,reference,amount,reason]);
    await audit(client,actor,'refund.requested',gymId,reference,{payment_id:paymentId,amount_cents:amount,reason});return {refund,payment};
  });
  if(reserved.refund.status==='processed')return reserved.refund;
  const remote=await paystackRequest('/refund',{method:'POST',body:{transaction:reserved.payment.reference,amount,currency:'ZAR',reference,merchant_note:reason}});
  if(remote.reference&&remote.reference!==reference)throw fail('Refund reference mismatch.',409);
  await db.query('UPDATE payment_refunds SET provider_id=$2 WHERE id=$1',[reserved.refund.id,String(remote.id)]);
  return reconcileRefund(remote.id);
}
export async function reconcileRefund(providerId) {
  if(!/^\d+$/.test(String(providerId)))throw fail('Invalid refund ID.');
  const remote=await paystackRequest(`/refund/${encodeURIComponent(providerId)}`);
  const {rows:[attempt]}=await db.query('SELECT * FROM payment_refunds WHERE provider_id=$1',[String(providerId)]);
  if(!attempt)throw fail('Refund not found.',404);
  return transaction(async client=>{
    const {rows:[payment]}=await client.query('SELECT * FROM payments WHERE id=$1 AND gym_id=$2 FOR UPDATE',[attempt.payment_id,attempt.gym_id]);
    const {rows:[refund]}=await client.query('SELECT * FROM payment_refunds WHERE id=$1 FOR UPDATE',[attempt.id]);
    const transactionId=typeof remote.transaction==='object'?remote.transaction.id:remote.transaction;
    if(String(remote.id)!==String(providerId)||remote.currency!=='ZAR'||remote.domain!==payment.provider_mode||Number(remote.amount)!==Number(refund.amount_cents)||
      !payment.provider_transaction_id||String(transactionId)!==payment.provider_transaction_id)throw fail('Refund verification mismatch.',409);
    if(refund.status==='processed')return refund;
    const status=['pending','processing','needs-attention','processed','failed'].includes(remote.status)?remote.status:'pending';
    await client.query('UPDATE payment_refunds SET status=$2 WHERE id=$1',[refund.id,status]);
    if(status==='processed'){
      const refunded=Number(payment.refunded_cents)+Number(refund.amount_cents),gross=Math.round(Number(payment.amount)*100);
      if(refunded>gross)throw fail('Refund reconciliation exceeds the payment amount.',409);
      const reversal=commissionReversal(Number(payment.commission_cents),gross,refunded);
      await client.query('UPDATE payments SET refunded_cents=$2,commission_refunded_cents=$3,settlement_status=\'needs_review\' WHERE id=$1',[payment.id,refunded,reversal]);
      await audit(client,{scope:'gateway'},'refund.processed',refund.gym_id,refund.reference,{amount_cents:Number(refund.amount_cents),commission_reversed_cents:reversal-Number(payment.commission_refunded_cents)});
      const {rows:[invoice]}=await client.query('SELECT user_id FROM invoices WHERE id=$1 AND gym_id=$2',[payment.invoice_id,payment.gym_id]);
      await notify(client,{gymId:payment.gym_id,userId:invoice.user_id,audience:'member',kind:'refund_processed',key:`refund:${refund.id}`,message:'A refund has been processed for your payment. Your gym can provide the refund details.'});
    }
    return {...refund,status};
  });
}
