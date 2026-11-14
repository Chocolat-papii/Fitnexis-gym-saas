import {Router} from 'express';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {db} from '../config/db.js';
import {createPlatformGym,gymFormValues} from '../services/platformGyms.service.js';
import {rateLimit} from '../middleware/rateLimit.js';
const router=Router(),cookieName=process.env.NODE_ENV==='production'?'__Host-fitnexis_registration':'fitnexis_registration';
router.use((req,res,next)=>{if(req.gym)return res.sendStatus(404);res.set('Cache-Control','no-store');res.set('X-Frame-Options','DENY');res.set('Content-Security-Policy',"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; form-action 'self'; frame-ancestors 'none'");next();});
const render=async(req,res,error=null,status=200)=>{let csrf=req.cookies[cookieName];if(!/^[a-f0-9]{64}$/.test(csrf||'')){csrf=randomBytes(32).toString('hex');res.cookie(cookieName,csrf,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/',maxAge:3600000});}
  const {rows:plans}=await db.query('SELECT id,name,price_cents,interval FROM saas_plans WHERE is_active=true ORDER BY price_cents,id');res.status(status).render('marketing/register',{plans,values:gymFormValues(req.body),csrf,error});};
router.get('/',(req,res,next)=>render(req,res).catch(next));
router.post('/',rateLimit('gym-registration',5,60),async(req,res,next)=>{try{
  const expected=req.cookies[cookieName],supplied=req.body?._csrf;
  if(!/^[a-f0-9]{64}$/.test(expected||'')||typeof supplied!=='string'||!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(expected),Buffer.from(supplied)))return res.sendStatus(403);
  await createPlatformGym(req.body,{scope:'registration'},{pending:true,planId:req.body.plan_id?Number(req.body.plan_id):null});
  res.clearCookie(cookieName,{path:'/'});res.status(201).render('marketing/registered');
}catch(error){if([400,409].includes(error.status))return render(req,res,error.message,error.status);next(error);}});
export default router;
