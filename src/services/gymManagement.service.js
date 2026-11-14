import bcrypt from 'bcrypt';
import {db} from '../config/db.js';
import {transaction,audit} from './audit.service.js';
import {commercialError as fail,integer} from './commission.service.js';
import {enforceLimit} from './saasBilling.service.js';

const staffRoles=['gym_admin','gym_manager','gym_receptionist','gym_trainer'];
export async function createStaff(gymId,actor,input) {
  const first=String(input.firstname||'').trim(),last=String(input.lastname||'').trim(),email=String(input.email||'').trim().toLowerCase();
  if(!first||!last||first.length>100||last.length>100||!/^\S+@\S+\.\S+$/.test(email)||email.length>255||!staffRoles.includes(input.role))throw fail('Enter valid staff details and a delegated gym role.');
  if(typeof input.password!=='string'||input.password.length<12||Buffer.byteLength(input.password)>72)throw fail('Use a password of 12 characters or more (maximum 72 bytes).');
  const hash=await bcrypt.hash(input.password,12);
  return transaction(async client=>{
    await client.query('SELECT id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);await enforceLimit(client,gymId,'staff');
    const {rows:[user]}=await client.query(`INSERT INTO users(firstname,lastname,email,phone,password,role,gym_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,email,role`,[first,last,email,String(input.phone||'').slice(0,50),hash,input.role,gymId]);
    await audit(client,actor,'staff.created',gymId,String(user.id),{role:user.role});return user;
  });
}
export async function updateStaff(gymId,actor,id,input) {
  const userId=integer(id,1);if(!staffRoles.includes(input.role))throw fail('Choose a delegated staff role.');
  const active=input.is_active===true||input.is_active==='true';
  const branchIds=input.branch_ids==null?[]:(Array.isArray(input.branch_ids)?input.branch_ids:String(input.branch_ids).split(',').filter(Boolean)).map(x=>integer(x,1));
  return transaction(async client=>{
    await client.query('SELECT id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);
    const {rows:[user]}=await client.query('SELECT id,role,is_active FROM users WHERE id=$1 AND gym_id=$2 FOR UPDATE',[userId,gymId]);
    if(!user||user.role==='member'||user.role==='gym_super_admin'||userId===actor.id)throw fail('The owner, members and your own account cannot be changed here.',403);
    if(active&&!user.is_active)await enforceLimit(client,gymId,'staff');
    if(branchIds.length){const branches=await client.query('SELECT id FROM gym_branches WHERE gym_id=$1 AND id=ANY($2::int[])',[gymId,branchIds]);if(branches.rows.length!==new Set(branchIds).size)throw fail('A branch does not belong to this gym.');}
    await client.query('UPDATE users SET role=$3,is_active=$4,auth_version=auth_version+1 WHERE id=$1 AND gym_id=$2',[userId,gymId,input.role,active]);
    await client.query('DELETE FROM staff_branch_access WHERE user_id=$1 AND gym_id=$2',[userId,gymId]);
    for(const branchId of new Set(branchIds))await client.query('INSERT INTO staff_branch_access(user_id,branch_id,gym_id) VALUES($1,$2,$3)',[userId,branchId,gymId]);
    await audit(client,actor,'staff.updated',gymId,String(userId),{before:user.role,role:input.role,is_active:active,branches:branchIds});
  });
}
export async function saveBusiness(gymId,actor,input) {
  const name=String(input.name||'').trim(),address=String(input.address||'').trim(),phone=String(input.phone||'').trim();
  if(!name||name.length>150||address.length>2000||phone.length>50)throw fail('Invalid gym profile.');
  return transaction(async client=>{await client.query('UPDATE gyms SET name=$2,address=$3,phone=$4,updated_at=NOW() WHERE id=$1',[gymId,name,address,phone]);await audit(client,actor,'gym.profile_updated',gymId);});
}
export async function addBranch(gymId,actor,input,id=null) {
  const name=String(input.name||'').trim();if(!name||name.length>150)throw fail('Enter a branch name.');
  let hours,facilities;try{hours=typeof input.hours==='string'?JSON.parse(input.hours):input.hours||{};facilities=typeof input.facilities==='string'?input.facilities.split(',').map(x=>x.trim()).filter(Boolean):input.facilities||[];}catch{throw fail('Enter valid opening hours.');}
  if(!hours||Array.isArray(hours)||typeof hours!=='object'||JSON.stringify(hours).length>4000||!Array.isArray(facilities)||facilities.length>50||facilities.some(x=>typeof x!=='string'||x.length>100))throw fail('Invalid opening hours or facilities.');
  return transaction(async client=>{
    await client.query('SELECT id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);if(!id)await enforceLimit(client,gymId,'branches');
    const values=[gymId,name,String(input.address||'').slice(0,2000),JSON.stringify(hours),JSON.stringify(facilities)];
    const {rows:[branch]}=id?await client.query('UPDATE gym_branches SET name=$2,address=$3,hours=$4,facilities=$5 WHERE gym_id=$1 AND id=$6 RETURNING *',[...values,integer(id,1)]):await client.query('INSERT INTO gym_branches(gym_id,name,address,hours,facilities) VALUES($1,$2,$3,$4,$5) RETURNING *',values);
    if(!branch)throw fail('Branch not found.',404);
    await audit(client,actor,id?'gym.branch_updated':'gym.branch_created',gymId,String(branch.id));return branch;
  });
}
export async function initiateOwnershipTransfer(gymId,actor,toUserId) {
  return transaction(async client=>{
    const {rows:[gym]}=await client.query('SELECT owner_id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);
    if(gym?.owner_id!==actor.id)throw fail('Only the current gym owner can transfer ownership.',403);
    const {rows:[target]}=await client.query("SELECT id FROM users WHERE id=$1 AND gym_id=$2 AND role<>'member' AND is_active=true AND email_verified_at IS NOT NULL",[integer(toUserId,1),gymId]);
    if(!target||target.id===actor.id)throw fail('Choose an active staff member who has verified their email.');
    await client.query('DELETE FROM ownership_transfers WHERE gym_id=$1 AND accepted_at IS NULL',[gymId]);
    const {rows:[transfer]}=await client.query(`INSERT INTO ownership_transfers(gym_id,from_user_id,to_user_id,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '24 hours') RETURNING id,expires_at`,[gymId,actor.id,target.id]);
    await audit(client,actor,'ownership.transfer_requested',gymId,transfer.id,{to:target.id});return transfer;
  });
}
export async function acceptOwnershipTransfer(gymId,actor,id) {
  return transaction(async client=>{
    const {rows:[gym]}=await client.query('SELECT owner_id FROM gyms WHERE id=$1 FOR UPDATE',[gymId]);
    const {rows:[transfer]}=await client.query('SELECT * FROM ownership_transfers WHERE id=$1 AND gym_id=$2 FOR UPDATE',[id,gymId]);
    if(!transfer||transfer.to_user_id!==actor.id||transfer.from_user_id!==gym.owner_id||transfer.accepted_at||new Date(transfer.expires_at)<=new Date())throw fail('Ownership transfer is unavailable.',409);
    const {rows:[target]}=await client.query('SELECT email_verified_at FROM users WHERE id=$1 AND gym_id=$2 AND is_active=true',[actor.id,gymId]);
    if(!target?.email_verified_at)throw fail('Verify your email before accepting ownership.',403);
    await client.query("UPDATE users SET role=CASE WHEN id=$2 THEN 'gym_super_admin' ELSE 'gym_admin' END,auth_version=auth_version+1 WHERE gym_id=$1 AND id=ANY($3::int[])",[gymId,actor.id,[actor.id,gym.owner_id]]);
    await client.query('UPDATE gyms SET owner_id=$2 WHERE id=$1',[gymId,actor.id]);
    await client.query('UPDATE ownership_transfers SET accepted_at=NOW() WHERE id=$1',[id]);
    await audit(client,actor,'ownership.transferred',gymId,id,{from:gym.owner_id,to:actor.id});
  });
}
export async function grantSupport(gymId,actor,input) {
  const minutes=integer(input.minutes,1,60),adminId=integer(input.platform_admin_id,1),reason=String(input.reason||'').trim();
  if(reason.length<8||reason.length>500)throw fail('Give a support reason (8–500 characters).');
  return transaction(async client=>{
    const {rows:[admin]}=await client.query('SELECT id FROM platform_admins WHERE id=$1 AND is_active=true',[adminId]);if(!admin)throw fail('Platform administrator not found.',404);
    const {rows:[grant]}=await client.query(`INSERT INTO support_grants(gym_id,platform_admin_id,approved_by,reason,expires_at) VALUES($1,$2,$3,$4,NOW()+$5*INTERVAL '1 minute') RETURNING id,expires_at`,[gymId,adminId,actor.id,reason,minutes]);
    await audit(client,actor,'support.authorized',gymId,grant.id,{platform_admin_id:adminId,minutes,reason});return grant;
  });
}
