import {Router} from 'express';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {beginMfa,getMfaChallenge,mfaEnrollment,completeMfa,reauthenticate} from '../services/mfa.service.js';
import {issueGymSession,issuePlatformSession,mfaCookieName,gymCookieOptions} from '../services/authSessions.service.js';
import {requireAuth} from '../middleware/requireAuth.js';
import {billingCsrf} from '../middleware/billingCsrf.js';
import {db} from '../config/db.js';
import {audit,actorFrom} from '../services/audit.service.js';
import {rateLimit} from '../middleware/rateLimit.js';


const router=Router();
router.use((req,res,next)=>{res.set('Cache-Control','no-store');res.set('X-Frame-Options','DENY');res.set('Content-Security-Policy',"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'");next();});
const tokenCsrf=token=>createHmac('sha256',process.env.JWT_SECRET).update(`mfa:${token}`).digest('hex');
async function renderMfa(res,enrollment,scope,token,error=null,status=200) {
  return res.status(status).render('security/mfa',{...enrollment,scope,csrf:tokenCsrf(token),error});
}
router.post('/mfa/enroll',rateLimit('email-enroll'),requireAuth,billingCsrf,async(req,res,next)=>{try{
  const {rows:[actor]}=await db.query('SELECT id,gym_id FROM users WHERE id=$1 AND gym_id=$2 AND is_active=true',[req.user.sub,req.gymId]);
  const challenge=await beginMfa('gym',actor);res.cookie(mfaCookieName('gym'),challenge,{...gymCookieOptions,sameSite:'strict',maxAge:300000});res.redirect(303,'/security/mfa/gym');
}catch(error){next(error);}});
router.get('/mfa/:scope',async(req,res,next)=>{
  try {const scope=req.params.scope;if(!['gym','platform'].includes(scope))return res.sendStatus(404);
    const token=req.cookies[mfaCookieName(scope)];
    const challenge=await getMfaChallenge(token,scope);if(scope==='gym'&&challenge.gym_id!==req.gymId)return res.sendStatus(403);
    const enrollment=await mfaEnrollment(token,scope);
    await renderMfa(res,enrollment,scope,token);
  }catch(error){if(error.status)return res.status(error.status).send(error.message);next(error);}
});
router.post('/mfa/:scope/resend',rateLimit('email-resend',5),async(req,res,next)=>{
  try {
    const scope=req.params.scope,token=req.cookies[mfaCookieName(scope)];
    if(!['gym','platform'].includes(scope))return res.sendStatus(404);
    if(!token||req.body?._csrf!==tokenCsrf(token))return res.sendStatus(403);
    const challenge=await getMfaChallenge(token,scope);
    if(scope==='gym'&&challenge.gym_id!==req.gymId)return res.sendStatus(403);
    const fresh=await beginMfa(scope,{id:challenge.actor_id,gym_id:challenge.gym_id});
    res.cookie(mfaCookieName(scope),fresh,{...gymCookieOptions,sameSite:'strict',maxAge:300000});
    res.redirect(303,`/security/mfa/${scope}`);
  }catch(error){if(error.status)return res.status(error.status).send(error.message);next(error);}
});
router.post('/mfa/:scope',rateLimit('email-verify',30),async(req,res,next)=>{
  const scope=req.params.scope;if(!['gym','platform'].includes(scope))return res.sendStatus(404);
  const token=req.cookies[mfaCookieName(scope)];
  try {
    const supplied=req.body?._csrf;const expected=token?tokenCsrf(token):'';
    if(typeof supplied!=='string'||!/^[a-f0-9]{64}$/.test(supplied)||!expected||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return res.sendStatus(403);
    const challenge=await getMfaChallenge(token,scope);if(scope==='gym'&&challenge.gym_id!==req.gymId)return res.sendStatus(403);
    const actor=await completeMfa(token,scope,req.body.code);
    let redirect='/platform';
    if(scope==='platform')await issuePlatformSession(res,actor);else redirect=await issueGymSession(res,actor,true);
    res.clearCookie(mfaCookieName(scope),gymCookieOptions);res.redirect(303,redirect);
  }catch(error){if(error.status){try {const enrollment=await mfaEnrollment(token,scope);return await renderMfa(res,enrollment,scope,token,error.message,error.status);}catch{return res.status(401).send('Authentication expired. Sign in again.');}}next(error);}
});
router.post('/reauthenticate/code',rateLimit('gym-reauth-code',5),requireAuth,billingCsrf,async(req,res,next)=>{
  try {
    const token=await beginMfa('gym',{id:req.user.sub,gym_id:req.gymId},'reauth');
    res.cookie(mfaCookieName('gym-reauth'),token,{...gymCookieOptions,sameSite:'strict',maxAge:300000});
    res.redirect(303,'/admin/settings?code=sent');
  }catch(error){if(error.status)return res.status(error.status).send(error.message);next(error);}
});
router.post('/reauthenticate',rateLimit('gym-reauth'),requireAuth,billingCsrf,async(req,res,next)=>{
  try{await reauthenticate('gym',req.user.sub,req.body.password,req.body.code,req.cookies[mfaCookieName('gym-reauth')]);
    await db.query("UPDATE gym_auth_sessions SET reauth_until=NOW()+INTERVAL '5 minutes' WHERE id=$1 AND user_id=$2 AND gym_id=$3",[req.user.session_id,req.user.sub,req.gymId]);
    await audit(db,actorFrom(req),'security.reauthenticated',req.gymId);if(req.is('application/json'))res.json({ok:true});else res.redirect(303,'/admin/settings');
  }catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error);}
});
export const requireRecentAuth=(req,res,next)=>{
  if(new Date((req.platformAdmin||req.user)?.reauth_until||0)>new Date())return next();
  const message='Confirm your password and a fresh email code before continuing.';
  if(req.is('application/json'))return res.status(428).json({error:'reauthentication_required',message});
  return res.status(428).render('security/confirm-identity',{destination:req.platformAdmin?'/platform/billing':'/admin/settings'});
};
export default router;
