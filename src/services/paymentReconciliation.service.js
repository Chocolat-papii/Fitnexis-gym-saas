import {db} from '../config/db.js';
import {transaction,audit,notify} from './audit.service.js';
import {paystackRequest,paystackMode} from './paystackClient.js';
import {commercialError as fail} from './commission.service.js';
export async function reconcileSettlement(actor,gymId,settlementId) {
  if(!/^\d+$/.test(String(settlementId)))throw fail('Enter a valid provider settlement ID.');
  const {rows:[settings]}=await db.query('SELECT paystack_subaccount,provider_mode FROM gym_payment_settings WHERE gym_id=$1',[gymId]);
  if(!settings?.paystack_subaccount||settings.provider_mode!==paystackMode())throw fail('Payment account is not available in this environment.',409);
  const subaccount=await paystackRequest(`/subaccount/${encodeURIComponent(settings.paystack_subaccount)}`);
  if(subaccount.subaccount_code!==settings.paystack_subaccount||subaccount.domain!==paystackMode())throw fail('Payment account verification mismatch.',409);
  // Settlement membership must come from Paystack, never a browser-supplied list of transactions.
  const settlements=await paystackRequest(`/settlement?subaccount=${encodeURIComponent(subaccount.id)}&perPage=100`);
  const settlement=Array.isArray(settlements)?settlements.find(s=>String(s.id)===String(settlementId)):null;
  if(!settlement)throw fail('Settlement not found for this gym in the latest provider records.',404);
  if(settlement.status!=='success')throw fail('The provider has not completed this settlement.',409);
  let matched=0;
  for(let page=1;page<=100;page++){
    const rows=await paystackRequest(`/settlement/${settlementId}/transactions?perPage=100&page=${page}`);
    if(!Array.isArray(rows))throw fail('Invalid settlement transaction response.',502);
    for(const remote of rows){
      const {rows:[attempt]}=await db.query("SELECT id,amount,provider_mode FROM payments WHERE reference=$1 AND gym_id=$2 AND provider='paystack' AND status='succeeded'",[remote.reference,gymId]);
      if(!attempt)continue;
      if(remote.currency!=='ZAR'||remote.domain!==attempt.provider_mode||Number(remote.amount)!==Math.round(Number(attempt.amount)*100))throw fail('Settlement amount or environment mismatch.',409);
      await transaction(async client=>{
        await client.query("UPDATE payments SET settlement_status=CASE WHEN refunded_cents>0 THEN 'needs_review' ELSE 'settled' END,settlement_id=$2 WHERE id=$1 AND gym_id=$3",[attempt.id,String(settlementId),gymId]);
        await audit(client,actor,'settlement.reconciled',gymId,remote.reference,{settlement_id:String(settlementId)});
      });matched++;
    }
    if(rows.length<100)return {matched,settlement_id:String(settlementId)};
  }
  throw fail('Large settlement requires another reconciliation pass.',409);
}
export async function reconcileDispute(disputeId) {
  if(!/^\d+$/.test(String(disputeId)))throw fail('Invalid dispute ID.');
  const remote=await paystackRequest(`/dispute/${disputeId}`);
  const reference=remote.transaction?.reference;
  if(!reference)throw fail('Dispute transaction could not be identified.',409);
  return transaction(async client=>{
    const {rows:[payment]}=await client.query("SELECT * FROM payments WHERE reference=$1 AND provider='paystack' FOR UPDATE",[reference]);
    if(!payment)throw fail('Payment not found.',404);
    if(remote.transaction.currency!=='ZAR'||remote.transaction.domain!==payment.provider_mode||String(remote.transaction.id)!==payment.provider_transaction_id)throw fail('Dispute verification mismatch.',409);
    const status=remote.status==='resolved'?'resolved':'open';
    await client.query("UPDATE payments SET dispute_status=$2,settlement_status='needs_review' WHERE id=$1",[payment.id,status]);
    await audit(client,{scope:'gateway'},'payment.dispute_updated',payment.gym_id,reference,{dispute_id:String(disputeId),status});
    await notify(client,{gymId:payment.gym_id,kind:'dispute',key:`dispute:${disputeId}:${status}`,message:'A member payment dispute needs review. Contact Fitnexis support for details.'});
    await notify(client,{audience:'platform',kind:'dispute',key:`platform-dispute:${disputeId}:${status}`,message:`Payment dispute ${disputeId} is ${status}.`});
    return {status};
  });
}
