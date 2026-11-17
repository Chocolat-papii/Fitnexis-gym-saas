import {db} from '../config/db.js';
import {hasPermission,canonicalRole} from '../security/roles.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function notificationScope(gymId,user) {
  const id=Number(user?.sub); if(!gymId||!Number.isSafeInteger(id)||id<1)throw fail('Authentication required',401);
  return [gymId,id,canonicalRole(user.role)==='member',hasPermission('gym',user.role,'billing.write'),canonicalRole(user.role)==='gym_super_admin'];
}
const visible=`n.gym_id=$1 AND (n.user_id IS NULL OR n.user_id=$2) AND
 ((n.audience='member' AND n.user_id=$2 AND $3::boolean) OR (n.audience='billing' AND $4::boolean) OR (n.audience='owner' AND $5::boolean))`;
export async function notifications(gymId,user,page=1,limit=20) {
  page=Number(page);limit=Number(limit);if(!Number.isSafeInteger(page)||page<1||page>10000||![20,30].includes(limit))throw fail('Invalid notification page');
  const args=notificationScope(gymId,user),base=user.role==='member'?'/member':'/admin';
  const [items,count]=await Promise.all([
    db.query(`SELECT n.id,n.audience,n.kind,n.message,n.action_url,n.created_at,r.read_at FROM platform_notifications n
      LEFT JOIN notification_reads r ON r.notification_id=n.id AND r.user_id=$2 AND r.gym_id=$1
      WHERE ${visible} ORDER BY n.id DESC LIMIT $6 OFFSET $7`,[...args,limit,(page-1)*limit]),
    db.query(`SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM notification_reads r WHERE r.notification_id=n.id AND r.user_id=$2 AND r.gym_id=$1))::int AS unread FROM platform_notifications n WHERE ${visible}`,args)
  ]);
  return {notifications:items.rows.map(n=>({...n,url:typeof n.action_url==='string'&&n.action_url.startsWith(base+'/')&&!n.action_url.includes('\\')?n.action_url:base+(n.audience==='owner'?'/settings':'/billing'),action_url:undefined})),...count.rows[0],page,pages:Math.max(1,Math.ceil(count.rows[0].total/limit))};
}
export async function readNotifications(gymId,user,id=null) {
  const args=notificationScope(gymId,user);
  if(id!==null&&!/^[1-9]\d{0,15}$/.test(String(id)))throw fail('Invalid notification');
  const result=await db.query(`INSERT INTO notification_reads(notification_id,user_id,gym_id)
    SELECT n.id,$2,$1 FROM platform_notifications n WHERE ${visible} AND ($6::bigint IS NULL OR n.id=$6)
    ON CONFLICT(notification_id,user_id) DO NOTHING RETURNING notification_id`,[...args,id]);
  return {ok:true,marked:result.rowCount};
}
