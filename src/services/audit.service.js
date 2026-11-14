import {db} from '../config/db.js';
export function actorFrom(req) {
  return req.platformAdmin ? {scope:'platform',id:req.platformAdmin.id} : {scope:'gym',id:Number(req.user?.sub)};
}
export async function audit(client=db, actor, action, gymId=null, resource=null, details={}) {
  // Callers pass explicit, non-sensitive fields; passwords, tokens and bank numbers never enter this log.
  await client.query(`INSERT INTO audit_events(actor_scope,actor_id,gym_id,action,resource,details) VALUES($1,$2,$3,$4,$5,$6)`,
    [actor.scope,actor.id||null,gymId,action,resource,JSON.stringify(details)]);
}
export async function notify(client=db,{gymId=null,userId=null,audience='owner',kind,key,message}) {
  await client.query(`INSERT INTO platform_notifications(gym_id,user_id,audience,kind,dedupe_key,message)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(dedupe_key) DO NOTHING`,[gymId,userId,audience,kind,key,message]);
}
export async function transaction(fn) {
  const client=await db.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
