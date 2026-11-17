import {Router} from 'express';
import {db} from '../config/db.js';
import {requireAuth} from '../middleware/requireAuth.js';
import {requirePermission} from '../security/roles.js';
import {billingCsrf,csrfToken} from '../middleware/billingCsrf.js';
import {sameOrigin} from '../middleware/sameOrigin.js';
import {rateLimit} from '../middleware/rateLimit.js';
import {uploadPaymentProof} from '../middleware/uploadPaymentProof.js';
import {requireRecentAuth} from './security.routes.js';
import {transaction,audit,actorFrom} from '../services/audit.service.js';
import * as proofs from '../services/paymentProofs.service.js';
const fail=(res,e)=>{if(!e.status)console.error('Payment proof operation:',e.code||e.name);return res.status(e.status||500).json({error:e.status?e.message:'Payment proof operation failed. Please try again.'});};
const action=fn=>async(req,res)=>{try{res.json(await fn(req));}catch(e){fail(res,e);}};
const page=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(e){if(e.status)return res.status(e.status).send(e.message);next(e);}};
const privatePage=(req,res,next)=>{res.set('Cache-Control','private, no-store');next();};
const file=member=>page(async(req,res)=>{
 const data=await proofs.proofAttachment(req.gymId,req.params.id,req.params.version,member?Number(req.user.sub):null);
 res.set({'Content-Security-Policy':"default-src 'none'; sandbox",'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}).attachment(data.file_name).type(data.mime).send(data.buffer);
});
const receipt=member=>page(async(req,res)=>res.render('billing/receipt',{gym:req.gym,payment:await proofs.receiptDetail(req.gymId,req.params.id,member?Number(req.user.sub):null),isMember:member,canReverse:!member&&req.user.role==='gym_super_admin',csrf:csrfToken(req)}));
export const memberPaymentProofRoutes=Router();
memberPaymentProofRoutes.use(requireAuth,privatePage,(req,res,next)=>req.user.role==='member'?next():res.sendStatus(403));
memberPaymentProofRoutes.get('/invoices/:invoiceId/proof',page(async(req,res)=>res.render('billing/member-proof',{...await proofs.memberProofPage(req.gymId,Number(req.user.sub),req.params.invoiceId),gym:req.gym,csrf:csrfToken(req),isMember:true,activePage:'billing',newPayment:req.query.new==='1'})));
memberPaymentProofRoutes.post('/invoices/:invoiceId/proof',sameOrigin,billingCsrf,rateLimit('payment-proof-uploads',10,15),uploadPaymentProof,action(req=>proofs.submitPaymentProof(req.gymId,Number(req.user.sub),req.params.invoiceId,req.body,req.file)));
memberPaymentProofRoutes.get('/payment-proofs/:id',page(async(req,res)=>{
 const detail=await proofs.proofDetail(req.gymId,req.params.id,Number(req.user.sub));
 res.render('billing/member-proof',{...await proofs.memberProofPage(req.gymId,Number(req.user.sub),detail.submission.invoice_id),detail,gym:req.gym,csrf:csrfToken(req),isMember:true,activePage:'billing'});
}));
memberPaymentProofRoutes.get('/payment-proofs/:id/files/:version',file(true));
memberPaymentProofRoutes.get('/receipts/:id',receipt(true));
export const adminPaymentProofRoutes=Router();
adminPaymentProofRoutes.use(requireAuth,requirePermission('gym','billing.read'),privatePage);
adminPaymentProofRoutes.get('/payment-proofs',page(async(req,res)=>{
 const {rows:[settings]}=await db.query('SELECT manual_payment_instructions FROM gym_payment_settings WHERE gym_id=$1',[req.gymId]);
 res.render('billing/proof-queue',{...await proofs.listPaymentProofs(req.gymId,req.query),instructions:settings?.manual_payment_instructions||'',canConfigure:req.user.role==='gym_super_admin',gym:req.gym,csrf:csrfToken(req),isMember:false,activePage:'billing'});
}));
adminPaymentProofRoutes.post('/payment-proofs/instructions',requirePermission('gym','payments.configure'),billingCsrf,requireRecentAuth,action(req=>transaction(async client=>{
 const text=req.body.instructions;if(typeof text!=='string'||text.length>4000)throw Object.assign(Error('Keep payment instructions under 4000 characters'),{status:400});
 await client.query(`INSERT INTO gym_payment_settings(gym_id,manual_payment_instructions) VALUES($1,$2) ON CONFLICT(gym_id) DO UPDATE SET manual_payment_instructions=EXCLUDED.manual_payment_instructions,updated_at=NOW()`,[req.gymId,text.trim()]);
 await audit(client,actorFrom(req),'payment.instructions_updated',req.gymId);return {ok:true,message:'Member payment instructions saved.'};
})));
adminPaymentProofRoutes.get('/payment-proofs/:id',page(async(req,res)=>res.render('billing/proof-review',{...await proofs.proofDetail(req.gymId,req.params.id),gym:req.gym,csrf:csrfToken(req),isMember:false,activePage:'billing'})));
adminPaymentProofRoutes.post('/payment-proofs/:id/review',requirePermission('gym','billing.write'),billingCsrf,rateLimit('payment-proof-reviews',30,15),action(req=>proofs.reviewPaymentProof(req.gymId,Number(req.user.sub),req.params.id,req.body)));
adminPaymentProofRoutes.get('/payment-proofs/:id/files/:version',file(false));
adminPaymentProofRoutes.get('/receipts/:id',receipt(false));
adminPaymentProofRoutes.post('/receipts/:id/reverse',requirePermission('gym','gym.manage'),billingCsrf,requireRecentAuth,action(req=>proofs.reverseManualPayment(req.gymId,Number(req.user.sub),req.params.id,req.body.reason)));
