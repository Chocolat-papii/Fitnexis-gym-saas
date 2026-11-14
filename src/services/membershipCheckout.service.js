import {transaction,audit} from './audit.service.js';
import {billingToday,dateOnly} from './billingDates.js';
import {nextBillingDate,normalizeBillingCycle} from './billingCycles.js';
import {commercialError as fail,integer} from './commission.service.js';
export async function purchaseMembership(gymId,userId,planId) {
  return transaction(async client=>{
    const {rows:[member]}=await client.query("SELECT id FROM users WHERE id=$1 AND gym_id=$2 AND role='member' AND is_active=true FOR UPDATE",[userId,gymId]);
    const {rows:[plan]}=await client.query('SELECT * FROM plans WHERE id=$1 AND gym_id=$2 AND is_active=true',[integer(planId,1),gymId]);
    if(!member||!plan)throw fail('Member or membership plan not found.',404);
    const {rows:[existing]}=await client.query("SELECT * FROM memberships WHERE gym_id=$1 AND user_id=$2 AND status IN ('active','paused','awaiting_payment') ORDER BY id DESC LIMIT 1",[gymId,userId]);
    if(existing){
      if(existing.plan_id!==plan.id)throw fail('Request a plan change before purchasing a different membership.',409);
      const {rows:[invoice]}=await client.query("SELECT id FROM invoices WHERE gym_id=$1 AND user_id=$2 AND membership_id=$3 AND status='due' ORDER BY id LIMIT 1",[gymId,userId,existing.id]);
      if(invoice)return {membership_id:existing.id,invoice_id:invoice.id};
      throw fail('Your membership is already assigned. Pay its next renewal invoice when it is issued.',409);
    }
    const today=billingToday(),cycle=normalizeBillingCycle(plan.billing_cycle),next=nextBillingDate(today,cycle,today,plan.custom_days);
    const free=Number(plan.price)===0;
    const {rows:[membership]}=await client.query(`INSERT INTO memberships(gym_id,user_id,plan_id,start_date,status,next_bill_on,auto_invoice) VALUES($1,$2,$3,$4,$5,$6,true) RETURNING id`,[gymId,userId,plan.id,today,free?'active':'awaiting_payment',next]);
    const {rows:[invoice]}=await client.query(`INSERT INTO invoices(gym_id,user_id,membership_id,amount,currency,status,due_at,description,period_start)
      VALUES($1,$2,$3,$4,'ZAR',$5,$6::date::timestamp AT TIME ZONE 'Africa/Johannesburg',$7,$6::date) RETURNING id`,[gymId,userId,membership.id,plan.price,free?'paid':'due',today,`Membership: ${plan.name}`]);
    await client.query('UPDATE invoices SET invoice_number=$2 WHERE id=$1',[''+invoice.id,'INV-'+String(invoice.id).padStart(8,'0')]);
    await audit(client,{scope:'gym',id:userId},'membership.purchase_requested',gymId,String(membership.id),{invoice_id:invoice.id,amount:plan.price});
    return {membership_id:membership.id,invoice_id:invoice.id};
  });
}
