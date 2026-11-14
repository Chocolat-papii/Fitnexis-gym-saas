import {randomUUID} from 'node:crypto';
import {db} from '../config/db.js';
import {audit,notify,transaction} from './audit.service.js';
import {paystackRequest,paystackMode,paystackKey} from './paystackClient.js';
import {effectiveCommission,commercialError} from './commission.service.js';

export const listSouthAfricanBanks=()=>paystackRequest('/bank?country=south%20africa&currency=ZAR&perPage=100');
export async function paymentSetup(gymId) {
  const {rows:[settings]}=await db.query(`SELECT paystack_subaccount,onboarding_status,provider_mode,bank_last4,bank_code,payout_eligible,verified_at,last_error
    FROM gym_payment_settings WHERE gym_id=$1`,[gymId]);
  return settings||{onboarding_status:'not_started',payout_eligible:false};
}
export function eligibleSubaccount(remote,mode=paystackMode()) {
  return remote?.active===true&&remote.is_verified===true&&remote.currency==='ZAR'&&remote.domain===mode;
}
async function storeRemote(gymId,actor,remote,operationId=null) {
  if(!/^ACCT_[a-zA-Z0-9]{6,80}$/.test(remote.subaccount_code||''))throw commercialError('Invalid subaccount response.',502);
  return transaction(async client=>{
    const eligible=eligibleSubaccount(remote);
    const {rows:[settings]}=await client.query(`UPDATE gym_payment_settings SET paystack_subaccount=$2,provider_mode=$3,payout_eligible=$4,
      onboarding_status=$5,verified_at=CASE WHEN $4 THEN NOW() ELSE NULL END,operation_id=NULL,last_error=NULL,updated_at=NOW()
      WHERE gym_id=$1 AND ($6::text IS NULL OR operation_id=$6) RETURNING gym_id,onboarding_status,payout_eligible,paystack_subaccount`,
      [gymId,remote.subaccount_code,paystackMode(),eligible,eligible?'ready':'requires_review',operationId]);
    if(!settings)throw commercialError('Payment setup changed. Refresh and try again.',409);
    await audit(client,actor,'payments.subaccount_verified',gymId,remote.subaccount_code,{eligible,status:settings.onboarding_status});
    await notify(client,{gymId,kind:'payment_setup',key:`subaccount:${gymId}:${remote.subaccount_code}:${settings.onboarding_status}`,message:eligible?'Online payment setup is complete.':'Your payment account needs verification before online payments can begin.'});
    return settings;
  });
}
export async function onboardSubaccount(gymId,actor,input) {
  paystackKey();
  if(paystackMode()==='live'&&process.env.PAYSTACK_ZA_SPLITS_APPROVED!=='true')throw commercialError('South African split settlement must be approved before live onboarding.',503);
  const bank=String(input.bank_code||'').trim(),account=String(input.account_number||'').trim();
  const business=String(input.business_name||'').trim();
  if(!/^[\w-]{2,30}$/.test(bank)||!/^\d{5,20}$/.test(account)||business.length<2||business.length>150)throw commercialError('Enter a valid business name, bank code and account number.');
  const banks=await listSouthAfricanBanks();
  if(!Array.isArray(banks)||!banks.some(b=>b.code===bank&&b.active!==false))throw commercialError('Choose a supported South African bank.');
  const accountName=String(input.account_name||'').trim(),document=String(input.document_number||'').trim();
  if(accountName.length<2||accountName.length>150||!['personal','business'].includes(input.account_type)||
    !['identityNumber','passportNumber','businessRegistrationNumber'].includes(input.document_type)||document.length<5||document.length>50)throw commercialError('Complete the account-holder verification fields.');
  const validation=await paystackRequest('/bank/validate',{method:'POST',body:{country_code:'ZA',bank_code:bank,account_number:account,
    account_name:accountName,account_type:input.account_type,document_type:input.document_type,document_number:document}});
  if(validation.verified!==true||validation.accountHolderMatch!==true||validation.accountAcceptsCredits!==true)throw commercialError('Bank account verification did not pass. Check the account-holder details before continuing.',409);
  const operation=randomUUID();
  const existing=await transaction(async client=>{
    const {rows:[gym]}=await client.query('SELECT id,email FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);
    if(!gym)throw commercialError('Gym not found.',404);
    await client.query('INSERT INTO gym_payment_settings(gym_id) VALUES($1) ON CONFLICT DO NOTHING',[gymId]);
    const {rows:[settings]}=await client.query('SELECT * FROM gym_payment_settings WHERE gym_id=$1 FOR UPDATE',[gymId]);
    if(settings.operation_id)throw commercialError('An earlier setup request needs reconciliation before another can be sent.',409);
    if(settings.provider_mode&&settings.provider_mode!==paystackMode())throw commercialError('An administrator must reconcile the existing account before changing payment environments.',409);
    await client.query(`UPDATE gym_payment_settings SET operation_id=$2,onboarding_status='processing',payout_eligible=false,bank_code=$3,bank_last4=$4,updated_at=NOW() WHERE gym_id=$1`,[gymId,operation,bank,account.slice(-4)]);
    await audit(client,actor,'payments.bank_change_requested',gymId,settings.paystack_subaccount,{bank_code:bank,last4:account.slice(-4),operation});
    return {code:settings.paystack_subaccount,email:gym.email,...await effectiveCommission(client,gymId)};
  });
  try {
    const remote=await paystackRequest(existing.code?`/subaccount/${encodeURIComponent(existing.code)}`:'/subaccount',{
      method:existing.code?'PUT':'POST',body:{business_name:business,...(existing.code?{bank_code:bank}:{settlement_bank:bank}),account_number:account,percentage_charge:existing.bps/100,primary_contact_email:existing.email,metadata:JSON.stringify({gym_id:gymId,fitnexis_operation:operation})}});
    return await storeRemote(gymId,actor,remote,operation);
  }catch(error){
    await db.query(`UPDATE gym_payment_settings SET onboarding_status='requires_review',last_error=$3,
      operation_id=CASE WHEN $4 THEN NULL ELSE operation_id END,updated_at=NOW() WHERE gym_id=$1 AND operation_id=$2`,
      [gymId,operation,'Payment setup needs attention. Review the provider account before retrying.',error.initializationRejected===true]);
    await notify(db,{gymId,audience:'platform',kind:'payment_integration_failure',key:`onboarding-failed:${operation}`,message:`Payment onboarding needs review for gym ${gymId}.`});
    throw error;
  }
}
export async function refreshSubaccount(gymId,actor) {
  const {rows:[settings]}=await db.query('SELECT paystack_subaccount,provider_mode FROM gym_payment_settings WHERE gym_id=$1',[gymId]);
  if(!settings?.paystack_subaccount)throw commercialError('No linked payment account. Contact platform support if an earlier creation timed out.',409);
  if(settings.provider_mode&&settings.provider_mode!==paystackMode())throw commercialError('Payment account environment mismatch.',409);
  const remote=await paystackRequest(`/subaccount/${encodeURIComponent(settings.paystack_subaccount)}`);
  if(remote.subaccount_code!==settings.paystack_subaccount)throw commercialError('Subaccount verification mismatch.',409);
  return storeRemote(gymId,actor,remote);
}
export async function recoverSubaccount(gymId,actor,code) {
  if(!/^ACCT_[a-zA-Z0-9]{6,80}$/.test(code||''))throw commercialError('Enter a valid provider subaccount code.');
  const {rows:[settings]}=await db.query('SELECT operation_id,paystack_subaccount FROM gym_payment_settings WHERE gym_id=$1',[gymId]);
  if(!settings?.operation_id||settings.paystack_subaccount)throw commercialError('There is no unresolved creation request for this gym.',409);
  const remote=await paystackRequest(`/subaccount/${encodeURIComponent(code)}`);
  let metadata=remote.metadata;
  if(typeof metadata==='string'){try{metadata=JSON.parse(metadata);}catch{metadata=null;}}
  if(remote.subaccount_code!==code||remote.domain!==paystackMode()||metadata?.gym_id!==gymId||metadata?.fitnexis_operation!==settings.operation_id)throw commercialError('This provider account does not match the gym onboarding request.',409);
  return storeRemote(gymId,actor,remote,settings.operation_id);
}
