import {randomUUID} from 'node:crypto';
import {db} from '../config/db.js';
import {transaction,audit,notify} from './audit.service.js';
import {commercialError as fail,integer} from './commission.service.js';
import {paystackRequest,paystackKey,paystackMode} from './paystackClient.js';
import {encryptSecret,decryptSecret} from '../security/crypto.js';
export const PAID_FEATURES=['financial_reports','online_payments','classes','branches','staff'];
export function nextSaasPeriod(value,interval,anchor=value) {
  const start=new Date(value),next=new Date(start);const day=new Date(anchor).getUTCDate();
  next.setUTCDate(1);next.setUTCMonth(next.getUTCMonth()+(interval==='annual'?12:1));
  const last=new Date(Date.UTC(next.getUTCFullYear(),next.getUTCMonth()+1,0)).getUTCDate();next.setUTCDate(Math.min(day,last));return next;
}
export async function createSaasPlan(actor,input) {
  const name=String(input.name||'').trim();if(name.length<2||name.length>100)throw fail('Enter a plan name (2–100 characters).');
  const price=integer(input.price_cents,0,100000000);
  if(price>0&&price<100)throw fail('Paid SaaS plans must cost at least R1.');
  if(!['monthly','annual'].includes(input.interval))throw fail('Choose a monthly or annual interval.');
  const features=Array.isArray(input.features)?input.features:typeof input.features==='string'?input.features.split(',').map(x=>x.trim()).filter(Boolean):[];
  if(features.some(x=>!PAID_FEATURES.includes(x)))throw fail('Unknown plan feature.');
  const limits={};for(const key of ['members','staff','branches'])if(input[key]!==''&&input[key]!=null)limits[key]=integer(input[key],1,1000000);
  return transaction(async client=>{
    const {rows:[plan]}=await client.query(`INSERT INTO saas_plans(name,price_cents,interval,features,limits,is_active) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [name,price,input.interval,JSON.stringify([...new Set(features)]),JSON.stringify(limits),input.is_active===true||input.is_active==='on']);
    await audit(client,actor,'saas.plan_created',null,String(plan.id),{name,price_cents:price,interval:input.interval});return plan;
  });
}
export async function setPlanPublished(actor,id,isActive) {
  return transaction(async client=>{
    const {rows:[plan]}=await client.query('UPDATE saas_plans SET is_active=$2 WHERE id=$1 RETURNING id',[integer(id,1),isActive===true||isActive==='true']);
    if(!plan)throw fail('Plan not found.',404);await audit(client,actor,'saas.plan_publication',null,String(id),{active:isActive});return plan;
  });
}
export async function subscriptionAccess(gymId,client=db) {
  const {rows:[row]}=await client.query(`SELECT s.*,p.features,p.limits,c.grace_days FROM gym_subscriptions s
    LEFT JOIN saas_plans p ON p.id=s.plan_id CROSS JOIN platform_billing_config c WHERE s.gym_id=$1 AND c.id=1`,[gymId]);
  if(!row)return {allowed:false,features:[],limits:{},status:'expired'};
  const now=Date.now(),end=new Date(row.period_end).getTime();
  const trial=row.status==='trialing'&&now<end;
  const active=['active','overdue'].includes(row.status)&&now<end+Number(row.grace_days)*86400000;
  return {...row,allowed:trial||active,features:trial?PAID_FEATURES:(active?row.features||[]:[]),limits:row.limits||{}};
}
export const requireFeature=feature=>async(req,res,next)=>{
  try{const access=await subscriptionAccess(req.gymId);if(!access.allowed||!access.features.includes(feature))return res.status(402).json({error:'subscription_required',message:'This feature requires an active Fitnexis subscription.',manage_url:'/admin/settings#subscription'});req.subscriptionAccess=access;next();}catch(error){next(error);}
};
export async function enforceLimit(client,gymId,kind) {
  const access=await subscriptionAccess(gymId,client);const max=access.limits[kind];if(!max)return;
  const queries={members:"SELECT COUNT(*) AS count FROM users WHERE gym_id=$1 AND role='member' AND is_active=true",staff:"SELECT COUNT(*) AS count FROM users WHERE gym_id=$1 AND role<>'member' AND is_active=true",branches:'SELECT COUNT(*) AS count FROM gym_branches WHERE gym_id=$1'};
  const {rows:[count]}=await client.query(queries[kind],[gymId]);if(Number(count.count)>=max)throw fail(`Your plan's ${kind} limit has been reached.`,402);
}
async function invoiceFor(client,subscription,plan,start) {
  const end=nextSaasPeriod(start,plan.interval,subscription.billing_anchor||start);
  const {rows:[invoice]}=await client.query(`INSERT INTO saas_invoices(gym_id,plan_id,amount_cents,interval,period_start,period_end)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(gym_id,period_start) DO UPDATE SET gym_id=EXCLUDED.gym_id RETURNING *`,
    [subscription.gym_id,plan.id,plan.price_cents,plan.interval,start,end]);
  return invoice;
}
export async function selectSaasPlan(gymId,actor,id) {
  return transaction(async client=>{
    await client.query('SELECT id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);
    const {rows:[plan]}=await client.query('SELECT * FROM saas_plans WHERE id=$1 AND is_active=true',[integer(id,1)]);
    if(!plan)throw fail('Choose an available plan.',404);
    await client.query('INSERT INTO gym_subscriptions(gym_id) VALUES($1) ON CONFLICT DO NOTHING',[gymId]);
    const {rows:[subscription]}=await client.query('SELECT * FROM gym_subscriptions WHERE gym_id=$1 FOR UPDATE',[gymId]);
    const {rows:[unpaid]}=await client.query("SELECT id FROM saas_invoices WHERE gym_id=$1 AND status='due' LIMIT 1",[gymId]);
    if(unpaid)throw fail('Resolve the existing subscription invoice before changing plans.',409);
    let invoice;
    if(subscription.plan_id&&subscription.status==='active'&&new Date(subscription.period_end)>new Date()){
      await client.query('UPDATE gym_subscriptions SET pending_plan_id=$2,cancel_at_period_end=false,updated_at=NOW() WHERE gym_id=$1',[gymId,plan.id]);
    }else{
      invoice=await invoiceFor(client,subscription,plan,new Date());
      if(Number(plan.price_cents)===0){await activateInvoice(client,invoice);}
    }
    await audit(client,actor,'saas.plan_selected',gymId,String(plan.id),{scheduled:!invoice});return {invoice,scheduled:!invoice};
  });
}
async function activateInvoice(client,invoice) {
  await client.query("UPDATE saas_invoices SET status='paid' WHERE id=$1",[invoice.id]);
  await client.query(`UPDATE gym_subscriptions SET plan_id=$2,pending_plan_id=NULL,status='active',period_start=$3,period_end=$4,billing_anchor=COALESCE(billing_anchor,$3),updated_at=NOW() WHERE gym_id=$1`,
    [invoice.gym_id,invoice.plan_id,invoice.period_start,invoice.period_end]);
  await notify(client,{gymId:invoice.gym_id,kind:'subscription_active',key:`saas-active:${invoice.id}`,message:'Your Fitnexis subscription payment is confirmed.'});
}
export async function cancelSubscription(gymId,actor) {
  return transaction(async client=>{
    const {rows:[subscription]}=await client.query(`UPDATE gym_subscriptions SET cancel_at_period_end=true,auto_renew=false,pending_plan_id=NULL,updated_at=NOW() WHERE gym_id=$1 RETURNING gym_id`,[gymId]);
    if(!subscription)throw fail('Subscription not found.',404);
    await audit(client,actor,'saas.cancellation_scheduled',gymId);return subscription;
  });
}
export async function initializeSaasCheckout(gymId,invoiceId,{autoRenew=false}={}) {
  paystackKey();
  const {rows:[old]}=await db.query("SELECT reference FROM saas_payments WHERE gym_id=$1 AND invoice_id=$2 AND status='pending'",[gymId,integer(invoiceId,1)]);
  if(old)await verifySaasPayment(old.reference,gymId);
  const payment=await transaction(async client=>{
    await client.query('SELECT id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);
    const {rows:[invoice]}=await client.query(`SELECT i.*,u.email FROM saas_invoices i JOIN gyms g ON g.id=i.gym_id JOIN users u ON u.id=g.owner_id AND u.gym_id=g.id WHERE i.id=$1 AND i.gym_id=$2 FOR UPDATE OF i`,[invoiceId,gymId]);
    if(!invoice||invoice.status!=='due'||Number(invoice.amount_cents)<100)throw fail('Subscription invoice is not payable.',409);
    const {rows:[pending]}=await client.query("SELECT * FROM saas_payments WHERE invoice_id=$1 AND status='pending'",[invoiceId]);
    if(pending){if(pending.checkout_url)return {...pending,reused:true};throw fail('This payment needs verification before another checkout can start.',409);}
    const reference=`fns-${randomUUID()}`;
    const {rows:[created]}=await client.query(`INSERT INTO saas_payments(gym_id,invoice_id,reference,provider_mode,auto_renew_requested) VALUES($1,$2,$3,$4,$5) RETURNING *`,[gymId,invoiceId,reference,paystackMode(),autoRenew===true]);
    return {...created,email:invoice.email,amount:Number(invoice.amount_cents)};
  });
  if(payment.reused)return {reference:payment.reference,authorization_url:payment.checkout_url};
  try{
    const callback=process.env.PAYSTACK_SAAS_CALLBACK_URL;
    if(callback&&(!callback.startsWith('https://')||new URL(callback).username))throw fail('Invalid SaaS callback URL.',503);
    const remote=await paystackRequest('/transaction/initialize',{method:'POST',body:{email:payment.email,amount:payment.amount,currency:'ZAR',reference:payment.reference,
      ...(callback?{callback_url:callback}:{}),metadata:JSON.stringify({purpose:'fitnexis_subscription',gym_id:gymId,invoice_id:invoiceId})}});
    if(remote.reference!==payment.reference||!/^https:\/\/checkout\.paystack\.com\//.test(remote.authorization_url))throw fail('Invalid checkout response.',502);
    await db.query('UPDATE saas_payments SET checkout_url=$2 WHERE id=$1',[payment.id,remote.authorization_url]);
    return {reference:payment.reference,authorization_url:remote.authorization_url};
  }catch(error){if(error.initializationRejected)await db.query("UPDATE saas_payments SET status='failed' WHERE id=$1 AND status='pending'",[payment.id]);throw error;}
}
export async function verifySaasPayment(reference,gymId=null) {
  if(!/^fns-[a-f0-9-]{36}$/.test(reference||''))throw fail('Invalid subscription payment reference.');
  const {rows:[attempt]}=await db.query('SELECT * FROM saas_payments WHERE reference=$1',[reference]);
  if(!attempt||(gymId&&attempt.gym_id!==gymId))throw fail('Payment not found.',404);
  if(attempt.status==='succeeded')return {status:'succeeded'};
  if(attempt.provider_mode!==paystackMode())throw fail('Payment environment mismatch.',409);
  const remote=await paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
  return transaction(async client=>{
    await client.query('SELECT id FROM gyms WHERE id=$1 FOR UPDATE',[attempt.gym_id]);
    const {rows:[invoice]}=await client.query('SELECT * FROM saas_invoices WHERE id=$1 AND gym_id=$2 FOR UPDATE',[attempt.invoice_id,attempt.gym_id]);
    const {rows:[payment]}=await client.query('SELECT * FROM saas_payments WHERE id=$1 FOR UPDATE',[attempt.id]);
    if(payment.status==='succeeded')return {status:'succeeded'};
    if(remote.reference!==reference||remote.currency!=='ZAR'||remote.domain!==payment.provider_mode||!Number.isSafeInteger(remote.amount)||remote.amount!==Number(invoice.amount_cents))throw fail('Subscription payment verification mismatch.',409);
    if(remote.status==='success'){
      await client.query("UPDATE saas_payments SET status='succeeded',paid_at=NOW() WHERE id=$1",[payment.id]);
      if(invoice.status!=='due')throw fail('Subscription invoice is no longer payable. Reconciliation is required.',409);
      await activateInvoice(client,invoice);
      if(payment.auto_renew_requested&&remote.authorization?.reusable===true&&typeof remote.authorization.authorization_code==='string'){
        const encrypted=encryptSecret(remote.authorization.authorization_code,`saas:${invoice.gym_id}`);
        await client.query('UPDATE gym_subscriptions SET auto_renew=true,authorization_secret=$2,billing_email=$3,authorized_amount_cents=$4 WHERE gym_id=$1 AND cancel_at_period_end=false',
          [invoice.gym_id,encrypted,remote.customer?.email,invoice.amount_cents]);
      }
      await audit(client,{scope:'gateway'},'saas.payment_verified',invoice.gym_id,reference,{amount_cents:remote.amount});
    }else if(['failed','abandoned','reversed'].includes(remote.status)){
      await client.query("UPDATE saas_payments SET status='failed' WHERE id=$1 AND status='pending'",[payment.id]);
      await notify(client,{gymId:invoice.gym_id,kind:'subscription_failed',key:`saas-failed:${reference}`,message:'Your Fitnexis subscription payment failed. Please review your billing settings.'});
    }
    return {status:remote.status==='success'?'succeeded':remote.status};
  });
}
async function renewAutomatically(gymId,invoice) {
  if(process.env.PAYSTACK_RECURRING_ENABLED!=='true')return;
  const payment=await transaction(async client=>{
    await client.query('SELECT id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);
    const {rows:[locked]}=await client.query('SELECT * FROM saas_invoices WHERE id=$1 AND gym_id=$2 FOR UPDATE',[invoice.id,gymId]);
    const {rows:[sub]}=await client.query('SELECT * FROM gym_subscriptions WHERE gym_id=$1',[gymId]);
    if(locked.status!=='due'||!sub.auto_renew||!sub.authorization_secret||!sub.billing_email||Number(locked.amount_cents)>Number(sub.authorized_amount_cents)||sub.cancel_at_period_end)return null;
    const {rows:[previous]}=await client.query('SELECT reference FROM saas_payments WHERE invoice_id=$1 LIMIT 1',[invoice.id]);
    if(previous)return null; // Do not retry an automatic debit without fresh customer authorization.
    const {rows:[created]}=await client.query(`INSERT INTO saas_payments(gym_id,invoice_id,reference,provider_mode) VALUES($1,$2,$3,$4) RETURNING *`,[gymId,invoice.id,`fns-${randomUUID()}`,paystackMode()]);
    return {...created,email:sub.billing_email,authorization:decryptSecret(sub.authorization_secret,`saas:${gymId}`),amount:Number(locked.amount_cents)};
  });
  if(!payment)return;
  await paystackRequest('/transaction/charge_authorization',{method:'POST',body:{authorization_code:payment.authorization,email:payment.email,amount:payment.amount,reference:payment.reference,currency:'ZAR'}});
  await verifySaasPayment(payment.reference,gymId);
}
export async function runSaasRenewals(now=new Date()) {
  const {rows:upcoming}=await db.query(`SELECT gym_id,period_end FROM gym_subscriptions WHERE status='active' AND cancel_at_period_end=false AND period_end>$1 AND period_end<=$1::timestamptz+INTERVAL '7 days'`,[now]);
  for(const row of upcoming)await notify(db,{gymId:row.gym_id,kind:'subscription_renewal_upcoming',key:`saas-upcoming:${row.gym_id}:${new Date(row.period_end).toISOString()}`,message:'Your Fitnexis subscription renews within seven days. Review your plan and billing settings.'});
  const {rows}=await db.query("SELECT gym_id FROM gym_subscriptions WHERE period_end<=$1 AND status NOT IN ('cancelled','expired') ORDER BY period_end LIMIT 200",[now]);
  for(const row of rows){
    try{
      const invoice=await transaction(async client=>{
        await client.query('SELECT id FROM gyms WHERE id=$1 FOR UPDATE',[row.gym_id]);
        const {rows:[sub]}=await client.query('SELECT * FROM gym_subscriptions WHERE gym_id=$1 FOR UPDATE',[row.gym_id]);
        if(new Date(sub.period_end)>now)return null;
        if(sub.cancel_at_period_end){await client.query("UPDATE gym_subscriptions SET status='cancelled',auto_renew=false WHERE gym_id=$1",[row.gym_id]);return null;}
        const {rows:[plan]}=await client.query('SELECT * FROM saas_plans WHERE id=$1',[sub.pending_plan_id||sub.plan_id]);
        if(!plan){await client.query("UPDATE gym_subscriptions SET status='expired' WHERE gym_id=$1",[row.gym_id]);return null;}
        const due=await invoiceFor(client,sub,plan,sub.period_end);
        if(Number(due.amount_cents)===0){await activateInvoice(client,due);return null;}
        await client.query(`UPDATE gym_subscriptions SET status=CASE WHEN period_end+(SELECT grace_days FROM platform_billing_config WHERE id=1)*INTERVAL '1 day'<$2 THEN 'expired' ELSE 'overdue' END WHERE gym_id=$1`,[row.gym_id,now]);
        await notify(client,{gymId:row.gym_id,kind:'subscription_due',key:`saas-due:${due.id}`,message:'Your Fitnexis subscription renewal is due. Paid features remain available only during your grace period.'});return due;
      });
      if(invoice)await renewAutomatically(row.gym_id,invoice);
    }catch(error){console.error('Subscription renewal failed:',error.status?error.message:error.code||error.name);}
  }
}
