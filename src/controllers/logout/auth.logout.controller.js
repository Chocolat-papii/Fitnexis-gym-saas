
import jwt from 'jsonwebtoken';
import {db} from '../../config/db.js';
export const logoutMember = async (req, res, next) => {
  try {
    const claims=jwt.verify(req.cookies?.token||'',process.env.JWT_SECRET,{audience:'fitnexis-gym',issuer:'fitnexis',algorithms:['HS256']});
    if(claims.gymId===req.gymId)await db.query('UPDATE gym_auth_sessions SET revoked_at=NOW() WHERE id=$1 AND user_id=$2 AND gym_id=$3',[claims.jti,claims.sub,req.gymId]);
  } catch(error) { if(!['JsonWebTokenError','TokenExpiredError'].includes(error.name))return next(error); }
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });

  return res.redirect("/home");
};
