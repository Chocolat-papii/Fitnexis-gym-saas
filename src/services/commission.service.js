import {db} from '../config/db.js';
import {audit,transaction} from './audit.service.js';
export const commercialError=(message,status=400)=>Object.assign(new Error(message),{status});
export function integer(value,min=0,max=Number.MAX_SAFE_INTEGER) {
  if(typeof value==='string'&&!/^\d+$/.test(value))throw commercialError('Enter a valid integer.');
  const n=Number(value);if(!Number.isSafeInteger(n)||n<min||n>max)throw commercialError('Number is outside the allowed range.');return n;
}
export function commissionCents(gross,bps=200) {
  integer(gross,1);integer(bps,0,10000);
  return Number((BigInt(gross)*BigInt(bps)+5000n)/10000n);
}
export function commissionReversal(originalCommission,gross,totalRefunded) {
  integer(originalCommission);integer(gross,1);integer(totalRefunded,0,gross);
  return Number((BigInt(originalCommission)*BigInt(totalRefunded)+BigInt(Math.floor(gross/2)))/BigInt(gross));
}
export async function effectiveCommission(client,gymId) {
  const {rows:[row]}=await client.query(`SELECT COALESCE(g.commission_bps,c.commission_bps) AS commission_bps,c.fee_bearer
    FROM gyms g CROSS JOIN platform_billing_config c WHERE g.id=$1 AND c.id=1`,[gymId]);
  if(!row)throw commercialError('Gym billing configuration unavailable.',503);
  return {bps:integer(row.commission_bps,0,10000),bearer:row.fee_bearer};
}
export async function updateCommission(actor,input,gymId=null) {
  const reason=String(input.reason||'').trim();if(reason.length<8||reason.length>500)throw commercialError('Give an audit reason (8–500 characters).');
  return transaction(async client=>{
    if(gymId){
      const bps=input.commission_bps===''||input.commission_bps===null?null:integer(input.commission_bps,0,10000);
      const {rows:[before]}=await client.query('SELECT commission_bps FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);
      if(!before)throw commercialError('Gym not found.',404);
      await client.query('UPDATE gyms SET commission_bps=$2,updated_at=NOW() WHERE id=$1',[gymId,bps]);
      await audit(client,actor,'commission.override',gymId,gymId,{before:before.commission_bps,after:bps,reason});
    }else{
      const bps=integer(input.commission_bps,0,10000),grace=integer(input.grace_days,0,60);
      if(!['account','subaccount'].includes(input.fee_bearer))throw commercialError('Choose who pays gateway fees.');
      const {rows:[before]}=await client.query('SELECT * FROM platform_billing_config WHERE id=1 FOR UPDATE');
      await client.query('UPDATE platform_billing_config SET commission_bps=$1,fee_bearer=$2,grace_days=$3 WHERE id=1',[bps,input.fee_bearer,grace]);
      await audit(client,actor,'commission.default_changed',null,'platform',{before,after:{bps,fee_bearer:input.fee_bearer,grace_days:grace},reason});
    }
  });
}
