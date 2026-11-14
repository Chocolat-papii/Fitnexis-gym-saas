import jwt from 'jsonwebtoken';
import {db} from '../config/db.js';
import {canonicalRole,requiresGymMfa} from '../security/roles.js';
export async function requireAuth(req,res,next) {
  let claims;
  try {claims=jwt.verify(req.cookies?.token||'',process.env.JWT_SECRET,{algorithms:['HS256'],audience:'fitnexis-gym',issuer:'fitnexis'});}
  catch {return res.status(401).json({error:'Please sign in again.'});}
  if(!req.gymId||claims.gymId!==req.gymId)return res.status(403).json({error:'Access denied: wrong gym context'});
  try {
    const {rows:[user]}=await db.query(`SELECT u.id,u.role,u.auth_version,u.gym_id,s.id AS session_id,s.mfa_verified,s.reauth_until
      FROM users u JOIN gym_auth_sessions s ON s.user_id=u.id AND s.gym_id=u.gym_id
      WHERE u.id=$1 AND u.gym_id=$2 AND u.is_active=true AND s.id=$3 AND s.revoked_at IS NULL AND s.expires_at>NOW()`,[claims.sub,req.gymId,claims.jti]);
    if(!user||Number(user.auth_version)!==Number(claims.version))return res.status(401).json({error:'Session expired. Please sign in again.'});
    if(requiresGymMfa(user.role)&&!user.mfa_verified)return res.status(401).json({error:'Email verification is required.'});
    req.user={...user,sub:String(user.id),role:canonicalRole(user.role),gymId:user.gym_id};next();
  } catch(error){next(error);}
}
