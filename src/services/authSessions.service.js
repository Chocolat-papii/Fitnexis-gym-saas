import jwt from 'jsonwebtoken';
import {db} from '../config/db.js';
import {canonicalRole,gymHomeForRole} from '../security/roles.js';
export const gymCookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'};
export const platformCookieName=process.env.NODE_ENV==='production'?'__Host-fitnexis_platform':'fitnexis_platform';
export const mfaCookieName=scope=>process.env.NODE_ENV==='production'?`__Host-fitnexis_mfa_${scope}`:`fitnexis_mfa_${scope}`;
export async function issueGymSession(res,user,mfaVerified=false) {
  const {rows:[session]}=await db.query(`INSERT INTO gym_auth_sessions(user_id,gym_id,mfa_verified,expires_at)
    VALUES($1,$2,$3,NOW()+INTERVAL '2 hours') RETURNING id`,[user.id,user.gym_id,mfaVerified]);
  const token=jwt.sign({sub:String(user.id),role:canonicalRole(user.role),gymId:user.gym_id,version:user.auth_version},process.env.JWT_SECRET,
    {algorithm:'HS256',jwtid:session.id,audience:'fitnexis-gym',issuer:'fitnexis',expiresIn:'2h'});
  res.cookie('token',token,{...gymCookieOptions,maxAge:7200000});
  return gymHomeForRole(user.role);
}
export async function issuePlatformSession(res,admin) {
  const {rows:[session]}=await db.query(`INSERT INTO platform_sessions(admin_id,expires_at,mfa_verified)
    VALUES($1,NOW()+INTERVAL '2 hours',true) RETURNING id`,[admin.id]);
  const token=jwt.sign({},process.env.JWT_SECRET,{algorithm:'HS256',subject:String(admin.id),jwtid:session.id,audience:'fitnexis-platform',issuer:'fitnexis',expiresIn:'2h'});
  res.cookie(platformCookieName,token,{...gymCookieOptions,sameSite:'strict',maxAge:7200000});
}
