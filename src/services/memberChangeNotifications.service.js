import {db} from '../config/db.js';
import {transaction,audit} from './audit.service.js';
import {emailDelivery} from './email.service.js';

// Called inside the member mutation transaction: the action, immutable audit and mail queue commit together.
export async function recordMemberChange(client,actor,gymId,member,action,{summary,details={},recipients=[member.email]}){
  const {rows:[gym]}=await client.query('SELECT name FROM gyms WHERE id=$1',[gymId]);
  const {rows:[staff]}=await client.query('SELECT firstname,lastname FROM users WHERE id=$1 AND gym_id=$2',[actor.id,gymId]);
  const actorName=staff?[staff.firstname,staff.lastname].join(' '):'Gym team';
  const {rows:[event]}=await client.query(`INSERT INTO audit_events(actor_scope,actor_id,gym_id,action,resource,details) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,created_at`,
    [actor.scope,actor.id,gymId,action,String(member.id),JSON.stringify({...details,summary,member_name:[member.firstname,member.lastname].join(' '),actor_name:actorName})]);
  const when=new Date(event.created_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'});
  const message={subject:`${gym.name}: member account update`,text:`Hi ${member.firstname},\n\n${summary}\n\nGym: ${gym.name}\nUpdated by: ${actorName}\nWhen: ${when} (South Africa)\n\nIf you did not expect this change, contact your gym directly.\n\nFitnexis never includes passwords or verification codes in account-change notices.`};
  for(const recipient of [...new Set(recipients.map(email=>email.trim().toLowerCase()))])await client.query(`INSERT INTO member_change_emails(event_id,gym_id,user_id,recipient,message) VALUES($1,$2,$3,$4,$5)`,[event.id,gymId,member.id,recipient,JSON.stringify(message)]);
  return event.id;
}

export async function deliverMemberChangeEmails({eventId=null,gymId=null,limit=10}={}){
  // A lease and SKIP LOCKED allow more than one app process without simultaneous sends of the same notice.
  const {rows:jobs}=await db.query(`UPDATE member_change_emails SET status='sending',lease_until=NOW()+INTERVAL '10 minutes',attempts=attempts+1
    WHERE id IN (SELECT id FROM member_change_emails WHERE
      ((status='pending' AND next_attempt_at<=NOW()) OR (status='sending' AND lease_until<NOW()))
      AND ($1::bigint IS NULL OR event_id=$1) AND ($2::uuid IS NULL OR gym_id=$2)
      ORDER BY id LIMIT $3 FOR UPDATE SKIP LOCKED) RETURNING *`,[eventId,gymId,limit]);
  for(const job of jobs){
    try{
      await emailDelivery.sendMessage({to:job.recipient,...job.message,messageId:`<fitnexis-member-change-${job.id}@fitnexis.app>`});
      await db.query("UPDATE member_change_emails SET status='sent',sent_at=NOW(),lease_until=NULL,last_error=NULL WHERE id=$1 AND attempts=$2 AND status='sending'",[job.id,job.attempts]);
    }catch{
      await db.query(`UPDATE member_change_emails SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
        next_attempt_at=NOW()+make_interval(mins=>LEAST(60,POWER(2,attempts)::int)),lease_until=NULL,last_error='Email provider unavailable or message rejected'
        WHERE id=$1 AND attempts=$2 AND status='sending'`,[job.id,job.attempts]);
    }
  }
  return jobs.length;
}

export async function completeMemberChange(result){
  if(!result.notification_event_id)return result;
  try{
    await deliverMemberChangeEmails({eventId:result.notification_event_id,limit:2});
    const {rows}=await db.query('SELECT status FROM member_change_emails WHERE event_id=$1',[result.notification_event_id]);
    const sent=rows.length>0&&rows.every(row=>row.status==='sent');
    return {...result,notification_status:sent?'sent':'pending',message:result.message+(sent?' Member notified by email.':' Email notification queued for retry; view the action log for delivery status.')};
  }catch{
    // The change has already committed. An email worker will pick up its durable queue entry.
    return {...result,notification_status:'pending',message:result.message+' Email notification is queued.'};
  }
}

let running=false,timer;
export function startMemberChangeEmailJobs(){
  if(timer)return;
  const run=async()=>{if(running)return;running=true;try{await deliverMemberChangeEmails();}catch(error){console.error('Member email worker unavailable:',error.code||error.name);}finally{running=false;}};
  timer=setInterval(()=>void run(),60000);timer.unref();void run();
}

export async function retryMemberChangeEmail(gymId,id,actor){
  return transaction(async client=>{
    const {rows:[job]}=await client.query(`UPDATE member_change_emails SET status='pending',attempts=0,next_attempt_at=NOW(),last_error=NULL
      WHERE id=$1 AND gym_id=$2 AND status='failed' RETURNING id,event_id`,[id,gymId]);
    if(!job)throw Object.assign(new Error('Failed notification not found.'),{status:404});
    await audit(client,actor,'notification.retry_requested',gymId,String(job.id));return job;
  });
}
