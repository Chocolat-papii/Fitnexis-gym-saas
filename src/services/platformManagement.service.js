import bcrypt from 'bcrypt';
import {db} from '../config/db.js';
import {audit,notify,transaction} from './audit.service.js';
import {PLATFORM_ROLES} from '../security/roles.js';
import {commercialError as fail,integer} from './commission.service.js';
export async function setGymStatus(actor,gymId,input) {
  const reason=String(input.reason||'').trim();if(!['active','pending','suspended','inactive'].includes(input.status)||reason.length<8||reason.length>500)throw fail('Choose an account status and give an audit reason (8–500 characters).');
  return transaction(async client=>{
    const {rows:[gym]}=await client.query('SELECT account_status FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);if(!gym)throw fail('Gym not found.',404);
    await client.query('UPDATE gyms SET account_status=$2,updated_at=NOW() WHERE id=$1',[gymId,input.status]);
    if(gym.account_status==='pending'&&input.status==='active')await client.query("UPDATE gym_subscriptions SET period_start=NOW(),period_end=NOW()+INTERVAL '14 days',status='trialing' WHERE gym_id=$1 AND plan_id IS NULL",[gymId]);
    if(input.status!=='active')await client.query('UPDATE gym_auth_sessions SET revoked_at=NOW() WHERE gym_id=$1 AND revoked_at IS NULL',[gymId]);
    await audit(client,actor,'gym.status_changed',gymId,gymId,{before:gym.account_status,after:input.status,reason});
    await notify(client,{gymId,kind:'account_status',key:`gym-status:${gymId}:${Date.now()}`,message:`Your gym account is ${input.status}. Contact Fitnexis if you need assistance.`});
  });
}
export async function managePlatformAdmin(actor,input,id=null) {
  if(!PLATFORM_ROLES.includes(input.role))throw fail('Choose a platform role.');
  const isActive=input.is_active===true||input.is_active==='true'||input.is_active==='on';
  let hash;
  if(!id){if(typeof input.password!=='string'||input.password.length<12||Buffer.byteLength(input.password)>72)throw fail('Use a password of at least 12 characters (maximum 72 bytes).');hash=await bcrypt.hash(input.password,12);}
  return transaction(async client=>{
    // A common lock serializes concurrent demotions of the final super administrator.
    await client.query('SELECT id FROM platform_billing_config WHERE id=1 FOR UPDATE');
    const {rows:admins}=await client.query('SELECT id,role,is_active FROM platform_admins ORDER BY id FOR UPDATE');
    let resource;
    if(id){
      id=integer(id,1);const current=admins.find(a=>a.id===id);if(!current)throw fail('Administrator not found.',404);
      if(id===actor.id)throw fail('Another super administrator must change your own access.',403);
      if(current.role==='fitnexis_super_admin'&&current.is_active&&(!isActive||input.role!=='fitnexis_super_admin')&&admins.filter(a=>a.is_active&&a.role==='fitnexis_super_admin').length<=1)throw fail('The platform must retain an active super administrator.',409);
      await client.query('UPDATE platform_admins SET role=$2,is_active=$3 WHERE id=$1',[id,input.role,isActive]);
      await client.query('UPDATE platform_sessions SET logged_out_at=NOW() WHERE admin_id=$1 AND logged_out_at IS NULL',[id]);resource=id;
    }else{
      const email=String(input.email||'').trim().toLowerCase(),name=String(input.name||'').trim();
      if(!/^\S+@\S+\.\S+$/.test(email)||email.length>255||!name||name.length>150)throw fail('Enter a valid name and email.');
      const {rows:[created]}=await client.query('INSERT INTO platform_admins(email,name,password,role,is_active) VALUES($1,$2,$3,$4,$5) RETURNING id',[email,name,hash,input.role,isActive]);resource=created.id;
    }
    await audit(client,actor,id?'platform_admin.updated':'platform_admin.created',null,String(resource),{role:input.role,is_active:isActive});return {id:resource};
  });
}
export async function designateOwner(actor,gymId,userId,reason) {
  if(String(reason||'').trim().length<8)throw fail('Give a reason for designating the authorized owner.');
  return transaction(async client=>{
    const {rows:[gym]}=await client.query('SELECT owner_id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);
    if(!gym||gym.owner_id)throw fail('Use the verified ownership-transfer process for a gym that already has an owner.',409);
    const {rows:[user]}=await client.query("SELECT id FROM users WHERE id=$1 AND gym_id=$2 AND role<>'member' AND is_active=true FOR UPDATE",[integer(userId,1),gymId]);if(!user)throw fail('Authorized staff member not found in this gym.',404);
    await client.query("UPDATE users SET role='gym_super_admin',auth_version=auth_version+1 WHERE id=$1 AND gym_id=$2",[user.id,gymId]);
    await client.query('UPDATE gyms SET owner_id=$2 WHERE id=$1',[gymId,user.id]);await audit(client,actor,'ownership.designated',gymId,String(user.id),{reason:String(reason).slice(0,500)});
  });
}
