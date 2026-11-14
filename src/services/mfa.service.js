import {randomBytes,randomInt,createHash,createHmac,timingSafeEqual} from 'node:crypto';
import bcrypt from 'bcrypt';
import {db} from '../config/db.js';
import {audit,transaction} from './audit.service.js';
import {emailDelivery} from './email.service.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const tableFor=scope=>scope==='platform'?'platform_admins':scope==='gym'?'users':null;
const digest=token=>createHash('sha256').update(token).digest('hex');
export const emailCodeHash=(id,code)=>createHmac('sha256',process.env.JWT_SECRET).update(`email:${id}:${code}`).digest('hex');
export async function beginMfa(scope,actor,purpose='login') {
  if(!tableFor(scope)||!['login','reauth'].includes(purpose))throw fail('Invalid authentication scope');
  const {rows:[current]}=await db.query(`SELECT * FROM ${tableFor(scope)} WHERE id=$1 AND is_active=true`,[actor.id]);
  if(!current?.email||(scope==='gym'&&current.gym_id!==actor.gym_id))throw fail('Account unavailable.',401);
  const token=randomBytes(32).toString('hex'),id=digest(token),code=String(randomInt(0,1000000)).padStart(6,'0');
  await transaction(async client=>{
    await client.query(`SELECT id FROM ${tableFor(scope)} WHERE id=$1 FOR UPDATE`,[actor.id]);
    const {rows:[recent]}=await client.query(`SELECT id FROM mfa_challenges WHERE scope=$1 AND actor_id=$2 AND method='email' AND expires_at>NOW()+INTERVAL '4 minutes' LIMIT 1`,[scope,actor.id]);
    if(recent)throw fail('Please wait one minute before requesting another code.',429);
    await client.query('UPDATE mfa_challenges SET used_at=NOW() WHERE scope=$1 AND actor_id=$2 AND purpose=$3 AND used_at IS NULL',[scope,actor.id,purpose]);
    await client.query(`INSERT INTO mfa_challenges(id,scope,actor_id,gym_id,secret,expires_at,method,purpose,email,auth_version)
      VALUES($1,$2,$3,$4,$5,NOW()+INTERVAL '5 minutes','email',$6,$7,$8)`,[id,scope,actor.id,current.gym_id||null,emailCodeHash(id,code),purpose,current.email,current.auth_version??null]);
  });
  try{await emailDelivery.sendCode(current.email,code,purpose);}catch(error){await db.query('UPDATE mfa_challenges SET used_at=NOW(),expires_at=NOW() WHERE id=$1',[id]);throw error;}
  return token;
}
export async function getMfaChallenge(token,scope,purpose='login') {
  if(!tableFor(scope)||!/^[a-f0-9]{64}$/.test(token||''))throw fail('Sign in again to continue.',401);
  const {rows:[challenge]}=await db.query(`SELECT * FROM mfa_challenges WHERE id=$1 AND scope=$2 AND purpose=$3 AND method='email' AND used_at IS NULL AND attempts<5 AND expires_at>NOW()`,[digest(token),scope,purpose]);
  if(!challenge)throw fail('Authentication request expired. Sign in again.',401);
  return challenge;
}
export async function mfaEnrollment(token,scope) {
  const challenge=await getMfaChallenge(token,scope);
  const [local,domain]=challenge.email.split('@');
  return {email:`${local.slice(0,1)}***@${domain}`};
}
export async function completeMfa(token,scope,code,purpose='login',expectedId=null) {
  const challenge=await getMfaChallenge(token,scope,purpose);
  if(expectedId!==null&&String(challenge.actor_id)!==String(expectedId))throw fail('Invalid confirmation request.',401);
  const attempt=await db.query('UPDATE mfa_challenges SET attempts=attempts+1 WHERE id=$1 AND attempts<5 AND used_at IS NULL RETURNING id',[challenge.id]);
  if(!attempt.rows.length)throw fail('Authentication request expired.',401);
  return transaction(async client=>{
    const {rows:[locked]}=await client.query('SELECT * FROM mfa_challenges WHERE id=$1 FOR UPDATE',[challenge.id]);
    if(locked.used_at||new Date(locked.expires_at)<=new Date())throw fail('Authentication request expired.',401);
    const {rows:[actor]}=await client.query(`SELECT * FROM ${tableFor(scope)} WHERE id=$1 AND is_active=true FOR UPDATE`,[challenge.actor_id]);
    if(!actor||actor.email!==locked.email||(scope==='gym'&&(actor.gym_id!==locked.gym_id||Number(actor.auth_version)!==Number(locked.auth_version))))throw fail('Account changed. Sign in again.',401);
    const hash=emailCodeHash(locked.id,typeof code==='string'?code:'');
    if(!/^[0-9]{6}$/.test(code||'')||typeof locked.secret!=='string'||locked.secret.length!==64||!timingSafeEqual(Buffer.from(hash),Buffer.from(locked.secret)))throw fail('Invalid or already used email code.',401);
    await client.query(`UPDATE ${tableFor(scope)} SET email_verified_at=NOW() WHERE id=$1`,[actor.id]);
    await client.query('UPDATE mfa_challenges SET used_at=NOW() WHERE id=$1',[challenge.id]);
    await audit(client,{scope,id:actor.id},purpose==='reauth'?'security.email_reauthenticated':'security.email_login',actor.gym_id||null);
    return actor;
  });
}
export async function reauthenticate(scope,id,password,code,token) {
  if(typeof password!=='string'||Buffer.byteLength(password)>72)throw fail('Enter your password.',401);
  const {rows:[actor]}=await db.query(`SELECT * FROM ${tableFor(scope)} WHERE id=$1 AND is_active=true`,[id]);
  if(!actor||!await bcrypt.compare(password,actor.password||''))throw fail('Reauthentication failed.',401);
  return completeMfa(token,scope,code,'reauth',id);
}
