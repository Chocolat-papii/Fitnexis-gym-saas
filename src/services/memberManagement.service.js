import bcrypt from 'bcrypt';
import {db} from '../config/db.js';
import {transaction} from './audit.service.js';
import {recordMemberChange,completeMemberChange} from './memberChangeNotifications.service.js';
import {billingError,positiveId,listInvoices} from './billing.service.js';
import {billingToday,dateOnly} from './billingDates.js';
import {getMemberWithProfile} from './member.service.js';

const latest=`LEFT JOIN LATERAL (SELECT m.id,m.status,m.plan_id FROM memberships m WHERE m.user_id=u.id AND m.gym_id=u.gym_id ORDER BY m.id DESC LIMIT 1) lm ON true`;
const state=`CASE WHEN NOT u.is_active THEN 'inactive' WHEN lower(u.status)='suspended' THEN 'suspended' WHEN lower(u.status)='paused' OR lm.status='paused' THEN 'paused' ELSE lower(u.status) END`;
const month="date_trunc('month',NOW() AT TIME ZONE 'Africa/Johannesburg')::date";
const joined="COALESCE(u.joindate,(u.created_at AT TIME ZONE 'Africa/Johannesburg')::date)";
const changeTransaction=fn=>transaction(fn).then(completeMemberChange);
const idFor=id=>{const n=positiveId(id);if(!n)throw billingError('Invalid member id');return n;};
async function lockMember(client,gymId,id){
  const {rows:[member]}=await client.query("SELECT * FROM users WHERE id=$1 AND gym_id=$2 AND role='member' FOR UPDATE",[idFor(id),gymId]);
  if(!member)throw billingError('Member not found',404);return member;
}
export async function memberDirectory(gymId,query={}){
  const page=Number(query.page??1),limit=Number(query.limit??10),search=String(query.search||'').trim().slice(0,150),status=String(query.status||'');
  if(!Number.isSafeInteger(page)||page<1||page>100000||!Number.isSafeInteger(limit)||limit<1||limit>100)throw billingError('Invalid page');
  if(!['','active','paused','suspended','inactive','expired','new'].includes(status))throw billingError('Invalid status filter');
  const filter=`u.gym_id=$1 AND u.role='member' AND ($2='' OR CONCAT_WS(' ',u.firstname,u.lastname,u.email,u.phone) ILIKE '%'||$2||'%')
    AND ($3='' OR ($3='new' AND ${joined}>=${month} AND ${joined}<(${month}+INTERVAL '1 month')::date) OR ${state}=$3)`;
  const [members,count,stats]=await Promise.all([
    db.query(`SELECT u.id,u.firstname,u.lastname,u.email,u.phone,u.joindate,${state} AS status,mp.display_name
      FROM users u ${latest} LEFT JOIN member_profile mp ON mp.user_id=u.id AND mp.gym_id=u.gym_id
      WHERE ${filter} ORDER BY u.joindate DESC NULLS LAST,u.id DESC LIMIT $4 OFFSET $5`,[gymId,search,status,limit,(page-1)*limit]),
    db.query(`SELECT COUNT(*)::int AS total FROM users u ${latest} WHERE ${filter}`,[gymId,search,status]),
    db.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE ${state}='suspended')::int AS suspended,
      COUNT(*) FILTER(WHERE ${state}='paused')::int AS paused,
      COUNT(*) FILTER(WHERE ${joined}>=${month} AND ${joined}<(${month}+INTERVAL '1 month')::date)::int AS new_this_month
      FROM users u ${latest} WHERE u.gym_id=$1 AND u.role='member'`,[gymId])
  ]);
  return {members:members.rows,total:count.rows[0].total,page,totalPages:Math.max(1,Math.ceil(count.rows[0].total/limit)),stats:stats.rows[0]};
}
export async function managedMember(gymId,id,{billing=false,privateDetails=false}={}){
  id=idFor(id);
  const {rows:[account]}=await db.query("SELECT id,is_active,status FROM users WHERE id=$1 AND gym_id=$2 AND role='member'",[id,gymId]);
  if(!account)throw billingError('Member not found',404);
  const profile=await getMemberWithProfile(id,gymId);
  const [attendance,contacts,memberships,plans,dietary,physique,invoices]=await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total_visits,COUNT(*) FILTER(WHERE (check_in_time AT TIME ZONE 'Africa/Johannesburg')::date>=${month})::int AS visits_this_month,MAX(check_in_time) AS last_visit FROM attendance WHERE user_id=$1 AND gym_id=$2`,[id,gymId]),
    db.query('SELECT id,ecname,relationship,phone,ems_notes,priority FROM member_emergency_contacts WHERE user_id=$1 AND gym_id=$2 ORDER BY id',[id,gymId]),
    db.query(`SELECT m.*,p.name AS plan_name,p.price,p.billing_cycle FROM memberships m JOIN plans p ON p.id=m.plan_id AND p.gym_id=m.gym_id WHERE m.user_id=$1 AND m.gym_id=$2 ORDER BY m.id DESC LIMIT 12`,[id,gymId]),
    billing?db.query('SELECT id,name,price,billing_cycle FROM plans WHERE gym_id=$1 AND is_active=true ORDER BY name',[gymId]):{rows:[]},
    privateDetails?db.query('SELECT * FROM member_dietary_info WHERE user_id=$1 AND gym_id=$2',[id,gymId]):{rows:[]},
    privateDetails?db.query('SELECT * FROM member_physique_lifestyle WHERE user_id=$1 AND gym_id=$2',[id,gymId]):{rows:[]},
    billing?listInvoices(gymId,{user_id:id,limit:5}):[]
  ]);
  if(!privateDetails)for(const key of ['medical_conditions','injuries','health_notes','medication','consent_share_trainer'])delete profile[key];
  return {profile:{...profile,...account,status:account.status.toLowerCase(),...attendance.rows[0]},contacts:contacts.rows,memberships:memberships.rows,plans:plans.rows,dietary:dietary.rows[0]||{},physique:physique.rows[0]||{},invoices};
}
const text=(data,key,max=255,required=false)=>{
  if(typeof data[key]!=='string')throw billingError('Invalid '+key.replaceAll('_',' '));
  const value=data[key].trim();if((required&&!value)||value.length>max)throw billingError('Check '+key.replaceAll('_',' '));return value;
};
export async function saveManagedMember(gymId,id,actor,data){
  const first=text(data,'firstname',100,true),last=text(data,'lastname',100,true),email=text(data,'email',255,true).toLowerCase(),phone=text(data,'phone',50,true);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw billingError('Enter a valid email');
  const birth=text(data,'birthdate',10),join=text(data,'joindate',10,true);
  for(const value of [birth,join].filter(Boolean))if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(new Date(value+'T00:00:00Z').getTime())||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw billingError('Enter valid dates');
  if(birth&&birth>billingToday())throw billingError('Birth date cannot be in the future');
  const contactKeys=['gender','street_address','city','province','postal_code','whatsapp_number','alt_phone','notes'];
  const contact=contactKeys.map(key=>text(data,key,key==='notes'?3000:255));
  const display=text(data,'display_name',255),bio=text(data,'bio',3000);
  return changeTransaction(async client=>{
    const member=await lockMember(client,gymId,id);
    const {rows:[before]}=await client.query(`SELECT c.*,p.display_name,p.bio FROM users u
      LEFT JOIN member_contact_details c ON c.user_id=u.id AND c.gym_id=u.gym_id
      LEFT JOIN member_profile p ON p.user_id=u.id AND p.gym_id=u.gym_id WHERE u.id=$1 AND u.gym_id=$2`,[member.id,gymId]);
    const labels={firstname:'first name',lastname:'last name',email:'email address',phone:'phone number',joindate:'join date',birthdate:'birth date',gender:'gender',street_address:'street address',city:'city',province:'province',postal_code:'postal code',whatsapp_number:'WhatsApp number',alt_phone:'alternative phone',notes:'contact notes',display_name:'display name',bio:'profile introduction'};
    const previous={...before,firstname:member.firstname,lastname:member.lastname,email:member.email,phone:member.phone,joindate:member.joindate?dateOnly(member.joindate):'',birthdate:before.birthdate?dateOnly(before.birthdate):''};
    const proposed={firstname:first,lastname:last,email,phone,joindate:join,birthdate:birth,display_name:display,bio,...Object.fromEntries(contactKeys.map((key,i)=>[key,contact[i]]))};
    const changed=Object.keys(proposed).filter(key=>(previous[key]??'')!==proposed[key]);
    if(!changed.length)return {message:'No profile changes to save.'};
    await client.query(`UPDATE users SET firstname=$3,lastname=$4,email=$5::varchar,phone=$6,joindate=$7,
      auth_version=auth_version+CASE WHEN email<>$5::varchar THEN 1 ELSE 0 END,updated_at=NOW() WHERE id=$1 AND gym_id=$2`,[member.id,gymId,first,last,email,phone,join]);
    await client.query(`INSERT INTO member_contact_details(user_id,gym_id,birthdate,${contactKeys.join(',')})
      VALUES($1,$2,$3,${contactKeys.map((_,i)=>'$'+(i+4)).join(',')}) ON CONFLICT(user_id,gym_id) DO UPDATE SET birthdate=EXCLUDED.birthdate,${contactKeys.map(key=>`${key}=EXCLUDED.${key}`).join(',')},updated_at=NOW()`,[member.id,gymId,birth||null,...contact]);
    await client.query(`INSERT INTO member_profile(user_id,gym_id,display_name,bio) VALUES($1,$2,$3,$4)
      ON CONFLICT(user_id,gym_id) DO UPDATE SET display_name=EXCLUDED.display_name,bio=EXCLUDED.bio,updated_at=NOW()`,[member.id,gymId,display,bio]);
    const notification_event_id=await recordMemberChange(client,actor,gymId,{...member,firstname:first,lastname:last},'member.profile_updated',{
      summary:'Your gym updated your profile: '+changed.map(key=>labels[key]).join(', ')+'.',
      details:{fields:changed.map(key=>labels[key]),email_changed:member.email!==email},recipients:[member.email,email]});
    return {message:'Member profile saved.',notification_event_id};
  });
}
export async function setMemberAccount(gymId,id,actor,action){
  if(!['suspend','restore','deactivate','reactivate'].includes(action))throw billingError('Invalid account action');
  return changeTransaction(async client=>{
    const member=await lockMember(client,gymId,id);
    const active=action==='deactivate'?false:action==='reactivate'?true:member.is_active;
    const status=action==='suspend'?'suspended':action==='restore'?'active':member.status;
    if(!member.is_active&&['suspend','restore'].includes(action))throw billingError('Reactivate this account first',409);
    if(active===member.is_active&&status===member.status)return {message:'Member account is already in that state.'};
    await client.query('UPDATE users SET status=$3,is_active=$4,auth_version=auth_version+1,updated_at=NOW() WHERE id=$1 AND gym_id=$2',[member.id,gymId,status,active]);
    const summaries={suspend:'Your gym access has been suspended. Membership billing has not been changed.',restore:'Your gym access has been restored. Any paused membership remains paused.',deactivate:'Your member account has been deactivated and sign-in is disabled. Membership billing is managed separately by your gym.',reactivate:'Your member account has been reactivated. Existing membership and gym access restrictions still apply.'};
    const notification_event_id=await recordMemberChange(client,actor,gymId,member,'member.'+action,{summary:summaries[action],details:{before:{status:member.status,is_active:member.is_active},after:{status,is_active:active}}});
    return {message:'Member account updated.',notification_event_id};
  });
}
export async function resetManagedPassword(gymId,id,actor,password){
  if(typeof password!=='string'||password.length<12||Buffer.byteLength(password)>72)throw billingError('Use at least 12 characters, up to 72 bytes.');
  const hash=await bcrypt.hash(password,10);
  return changeTransaction(async client=>{
    const member=await lockMember(client,gymId,id);
    await client.query('UPDATE users SET password=$3,auth_version=auth_version+1,updated_at=NOW() WHERE id=$1 AND gym_id=$2',[member.id,gymId,hash]);
    const notification_event_id=await recordMemberChange(client,actor,gymId,member,'member.password_reset',{summary:'Your gym reset your Fitnexis password and signed out your previous sessions. Contact your gym directly for your temporary password.'});
    return {message:'Password reset. Previous sessions have been signed out.',notification_event_id};
  });
}
export async function changeManagedPlan(gymId,id,actor,{plan_id,action}){
  if(action!==undefined&&!['pause','resume'].includes(action))throw billingError('Invalid membership action');
  return changeTransaction(async client=>{
    const member=await lockMember(client,gymId,id);
    const {rows:[current]}=await client.query('SELECT m.*,p.name AS plan_name FROM memberships m JOIN plans p ON p.id=m.plan_id AND p.gym_id=m.gym_id WHERE m.user_id=$1 AND m.gym_id=$2 ORDER BY m.id DESC LIMIT 1 FOR UPDATE OF m',[member.id,gymId]);
    let summary,changeDetails;
    if(action==='pause'||action==='resume'){
      if(!current||current.status!==(action==='pause'?'active':'paused'))throw billingError('Membership state changed. Reload this profile.',409);
      await client.query(`UPDATE memberships SET status=$3::varchar,next_bill_on=CASE WHEN $3::varchar='active' AND auto_invoice THEN GREATEST(next_bill_on,$4::date) ELSE next_bill_on END,updated_at=NOW() WHERE id=$1 AND gym_id=$2`,[current.id,gymId,action==='pause'?'paused':'active',billingToday()]);
      if(action==='resume')await client.query("UPDATE users SET status='active' WHERE id=$1 AND gym_id=$2 AND status='paused'",[member.id,gymId]);
      summary=action==='pause'?`Your ${current.plan_name} membership has been paused. New recurring invoices are paused; existing invoices remain due.`:`Your ${current.plan_name} membership has been resumed. Recurring invoicing will continue from ${billingToday()}.`;
      changeDetails={action,plan_name:current.plan_name,before_status:current.status,after_status:action==='pause'?'paused':'active'};
    }else{
      const planId=positiveId(plan_id);if(!planId)throw billingError('Choose a plan');
      const {rows:[plan]}=await client.query('SELECT id,name,price,billing_cycle FROM plans WHERE id=$1 AND gym_id=$2 AND is_active=true',[planId,gymId]);
      if(!plan)throw billingError('Active plan not found',404);
      const {rows:[pending]}=await client.query("SELECT id FROM memberships WHERE user_id=$1 AND gym_id=$2 AND status='awaiting_payment' LIMIT 1",[member.id,gymId]);
      if(pending)throw billingError('Resolve the pending membership payment before changing plans.',409);
      if(current?.status==='active'&&current.plan_id===planId)throw billingError('This member already has that plan.',409);
      await client.query("UPDATE memberships SET status='replaced',updated_at=NOW() WHERE user_id=$1 AND gym_id=$2 AND status IN ('active','paused')",[member.id,gymId]);
      await client.query(`INSERT INTO memberships(user_id,gym_id,plan_id,start_date,next_bill_on,status,auto_invoice) VALUES($1,$2,$3,$4,$4,'active',true)`,[member.id,gymId,planId,billingToday()]);
      summary=`Your membership plan has changed from ${current?.plan_name||'no assigned plan'} to ${plan.name}, effective ${billingToday()}. The plan price is ZAR ${plan.price} per ${plan.billing_cycle.replaceAll('_',' ')}. Existing invoices and payments are unchanged. This change does not charge a card.`;
      changeDetails={action:'change_plan',from_plan:current?.plan_name||null,to_plan:plan.name,price:plan.price,billing_cycle:plan.billing_cycle,effective_on:billingToday()};
    }
    const notification_event_id=await recordMemberChange(client,actor,gymId,member,'member.membership_changed',{summary,details:changeDetails});
    return {message:action==='pause'?'Membership paused.':action==='resume'?'Membership resumed.':'Plan changed. Existing invoices and payments are unchanged.',notification_event_id};
  });
}
