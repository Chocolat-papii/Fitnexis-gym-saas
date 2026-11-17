import {db} from '../config/db.js';
export const memberActionLabels={
  'member.profile_updated':'Profile updated','member.suspend':'Access suspended','member.restore':'Access restored',
  'member.deactivate':'Account deactivated','member.reactivate':'Account reactivated','member.password_reset':'Password reset',
  'member.membership_changed':'Membership changed','member.created':'Member created'
};
export async function gymMemberActivity(gymId,query={}){
  const page=Number(query.page||1),member=query.member_id?Number(query.member_id):null,action=String(query.action||'');
  if(!Number.isSafeInteger(page)||page<1||page>100000||(member!==null&&(!Number.isSafeInteger(member)||member<1))||(action&&!Object.hasOwn(memberActionLabels,action)))throw Object.assign(new Error('Invalid activity filter.'),{status:400});
  const filter="e.gym_id=$1 AND e.action LIKE 'member.%' AND ($2='' OR e.action=$2) AND ($3::text IS NULL OR e.resource=$3)";
  const [events,count]=await Promise.all([
    db.query(`SELECT e.id,e.action,e.resource,e.created_at,e.details,
      COALESCE(e.details->>'actor_name',NULLIF(CONCAT_WS(' ',staff.firstname,staff.lastname),''),'Gym team') AS actor_name,
      COALESCE(e.details->>'member_name',NULLIF(CONCAT_WS(' ',member.firstname,member.lastname),''),'Member record') AS member_name,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',n.id,'recipient',n.recipient,'status',n.status,'attempts',n.attempts,'sent_at',n.sent_at,'last_error',n.last_error) ORDER BY n.id)
        FROM member_change_emails n WHERE n.event_id=e.id AND n.gym_id=e.gym_id),'[]'::jsonb) AS notifications
      FROM audit_events e LEFT JOIN users staff ON staff.id=e.actor_id AND staff.gym_id=e.gym_id AND e.actor_scope='gym'
      LEFT JOIN users member ON member.id::text=e.resource AND member.gym_id=e.gym_id AND member.role='member'
      WHERE ${filter} ORDER BY e.id DESC LIMIT 25 OFFSET $4`,[gymId,action,member===null?null:String(member),(page-1)*25]),
    db.query(`SELECT COUNT(*)::int AS total FROM audit_events e WHERE ${filter}`,[gymId,action,member===null?null:String(member)])
  ]);
  const total=count.rows[0].total;
  return {events:events.rows,total,page,pages:Math.max(1,Math.ceil(total/25)),action,memberId:member,labels:memberActionLabels};
}
