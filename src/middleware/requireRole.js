import {canonicalRole} from '../security/roles.js';
export const requireRole=role=>(req,res,next)=>req.user&&canonicalRole(req.user.role)===canonicalRole(role)
  ?next():res.status(403).json({error:'permission_denied'});
