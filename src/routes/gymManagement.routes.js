import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {db} from '../config/db.js';
import {requirePermission,hasPermission} from '../security/roles.js';
import {billingCsrf,csrfToken} from '../middleware/billingCsrf.js';
import {requireRecentAuth} from './security.routes.js';
import {actorFrom,audit,transaction} from '../services/audit.service.js';
import * as management from '../services/gymManagement.service.js';
import {paymentSetup,listSouthAfricanBanks,onboardSubaccount,refreshSubaccount} from '../services/paymentOnboarding.service.js';
import {subscriptionAccess,selectSaasPlan,cancelSubscription,initializeSaasCheckout,verifySaasPayment,requireFeature} from '../services/saasBilling.service.js';
import {financialSummary,financialCsv} from '../services/financialReporting.service.js';
import {requestRefund,reconcileRefund} from '../services/refunds.service.js';
import {effectiveCommission} from '../services/commission.service.js';

const router=Router(),can=p=>requirePermission('gym',p);
const action=(fn,redirect='/admin/settings')=>async(req,res,next)=>{try{const data=await fn(req);if(req.is('application/json'))return res.json(data||{ok:true});res.redirect(303,redirect);}catch(error){if(error.code==='23505')return res.status(409).send('That record already exists.');if(error.status)return res.status(error.status).send(error.message);next(error);}};
router.get('/training',async(req,res,next)=>{try{
  if(req.user.role!=='gym_trainer'&&!hasPermission('gym',req.user.role,'staff.manage'))return res.sendStatus(403);
  const {rows:members}=await db.query(`SELECT u.id,u.firstname,u.lastname,p.primary_goal
    FROM trainer_assignments a JOIN users u ON u.id=a.member_id AND u.gym_id=a.gym_id
    LEFT JOIN member_health_records h ON h.user_id=u.id AND h.gym_id=u.gym_id
    LEFT JOIN member_physique_lifestyle p ON p.user_id=u.id AND p.gym_id=u.gym_id AND h.consent_share_trainer=true
    WHERE a.gym_id=$1 AND a.trainer_id=$2 AND u.is_active=true ORDER BY u.firstname,u.lastname`,[req.gymId,req.user.sub]);
  const {rows:sessions}=await db.query(`SELECT starts_at,location FROM class_sessions WHERE gym_id=$1 AND trainer_id=$2 AND status='scheduled' AND starts_at>NOW() ORDER BY starts_at LIMIT 50`,[req.gymId,req.user.sub]);
  res.render('admin/training',{gym:req.gym,members,sessions});
}catch(error){next(error);}});
router.post('/settings/trainer-assignments',can('staff.manage'),billingCsrf,requireRecentAuth,requireFeature('staff'),action(req=>transaction(async client=>{
  const trainer=Number(req.body.trainer_id),member=Number(req.body.member_id);if(!Number.isSafeInteger(trainer)||!Number.isSafeInteger(member))throw Object.assign(new Error('Choose a trainer and a member.'),{status:400});
  const {rows:people}=await client.query("SELECT id,role FROM users WHERE gym_id=$1 AND id=ANY($2::int[]) AND is_active=true",[req.gymId,[trainer,member]]);
  if(!people.some(p=>p.id===trainer&&p.role==='gym_trainer')||!people.some(p=>p.id===member&&p.role==='member'))throw Object.assign(new Error('Trainer or member does not belong to this gym.'),{status:404});
  if(req.body.remove==='true')await client.query('DELETE FROM trainer_assignments WHERE gym_id=$1 AND trainer_id=$2 AND member_id=$3',[req.gymId,trainer,member]);
  else await client.query('INSERT INTO trainer_assignments(gym_id,trainer_id,member_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[req.gymId,trainer,member]);
  await audit(client,actorFrom(req),'trainer.assignment_changed',req.gymId,String(member),{trainer_id:trainer,removed:req.body.remove==='true'});
})));
router.get('/settings',async(req,res,next)=>{
  try{
    res.locals.reauthCodeSent=req.query.code==='sent';
    const owner=hasPermission('gym',req.user.role,'gym.manage');
    const staffReadable=owner||hasPermission('gym',req.user.role,'staff.read');
    const [setup,subscription,{rows:plans},{rows:invoices},{rows:payments},{rows:staff},{rows:branches},{rows:transfers},{rows:grants},{rows:notifications}]=await Promise.all([
      owner?paymentSetup(req.gymId):null,owner?subscriptionAccess(req.gymId):null,
      owner?db.query('SELECT * FROM saas_plans WHERE is_active=true ORDER BY price_cents,id'):{rows:[]},
      owner?db.query('SELECT * FROM saas_invoices WHERE gym_id=$1 ORDER BY id DESC LIMIT 100',[req.gymId]):{rows:[]},
      owner?db.query('SELECT * FROM saas_payments WHERE gym_id=$1 ORDER BY id DESC LIMIT 100',[req.gymId]):{rows:[]},
      staffReadable?db.query("SELECT id,firstname,lastname,email,role,is_active,email_verified_at IS NOT NULL AS mfa_enrolled,ARRAY(SELECT a.branch_id FROM staff_branch_access a WHERE a.user_id=users.id AND a.gym_id=users.gym_id ORDER BY a.branch_id) AS branch_ids FROM users WHERE gym_id=$1 AND role<>'member' ORDER BY id",[req.gymId]):{rows:[]},
      owner?db.query('SELECT * FROM gym_branches WHERE gym_id=$1 ORDER BY id',[req.gymId]):{rows:[]},
      db.query('SELECT * FROM ownership_transfers WHERE gym_id=$1 AND (from_user_id=$2 OR to_user_id=$2) AND accepted_at IS NULL AND expires_at>NOW()',[req.gymId,req.user.sub]),
      owner?db.query('SELECT * FROM support_grants WHERE gym_id=$1 AND revoked_at IS NULL AND expires_at>NOW()',[req.gymId]):{rows:[]},
      owner?db.query("SELECT * FROM platform_notifications WHERE gym_id=$1 AND audience='owner' ORDER BY id DESC LIMIT 50",[req.gymId]):{rows:[]}
    ]);
    let banks=[],bankError=null;
    const commission=owner?await effectiveCommission(db,req.gymId):null;
    if(owner){try{banks=await listSouthAfricanBanks();}catch{bankError='The bank list is unavailable. Configure Paystack test credentials or try again shortly.';}}
    res.render('admin/settings',{activePage:'settings',gym:req.gym,identity:req.user,owner,csrf:csrfToken(req),setup,subscription,plans,invoices,payments,staff,branches,transfers,grants,notifications,banks,bankError,commission,reference:`fnr-${randomUUID()}`});
  }catch(error){next(error);}
});
router.post('/settings/profile',can('gym.manage'),billingCsrf,requireRecentAuth,action(req=>management.saveBusiness(req.gymId,actorFrom(req),req.body)));
router.post('/settings/staff',can('staff.manage'),billingCsrf,requireRecentAuth,requireFeature('staff'),action(req=>management.createStaff(req.gymId,actorFrom(req),req.body)));
router.post('/settings/staff/:id',can('staff.manage'),billingCsrf,requireRecentAuth,requireFeature('staff'),action(req=>management.updateStaff(req.gymId,actorFrom(req),req.params.id,req.body)));
router.post('/settings/branches',can('gym.manage'),billingCsrf,requireRecentAuth,requireFeature('branches'),action(req=>management.addBranch(req.gymId,actorFrom(req),req.body)));
router.post('/settings/branches/:id',can('gym.manage'),billingCsrf,requireRecentAuth,requireFeature('branches'),action(req=>management.addBranch(req.gymId,actorFrom(req),req.body,req.params.id)));
router.post('/settings/payments',can('payments.configure'),billingCsrf,requireRecentAuth,action(req=>onboardSubaccount(req.gymId,actorFrom(req),req.body)));
router.post('/settings/payments/refresh',can('payments.configure'),billingCsrf,requireRecentAuth,action(req=>refreshSubaccount(req.gymId,actorFrom(req))));
router.post('/settings/subscription',can('subscription.manage'),billingCsrf,requireRecentAuth,action(req=>selectSaasPlan(req.gymId,actorFrom(req),req.body.plan_id)));
router.post('/settings/subscription/cancel',can('subscription.manage'),billingCsrf,requireRecentAuth,action(req=>cancelSubscription(req.gymId,actorFrom(req))));
router.post('/settings/subscription/checkout',can('subscription.manage'),billingCsrf,async(req,res,next)=>{try{const data=await initializeSaasCheckout(req.gymId,req.body.invoice_id,{autoRenew:req.body.auto_renew==='on'||req.body.auto_renew===true});if(req.is('application/json'))return res.json(data);res.redirect(303,data.authorization_url);}catch(error){if(error.status)return res.status(error.status).send(error.message);next(error);}});
router.post('/settings/subscription/verify',can('subscription.manage'),billingCsrf,action(req=>verifySaasPayment(req.body.reference,req.gymId)));
router.get('/settings/subscription/invoices/:id',can('subscription.manage'),async(req,res,next)=>{try{const {rows:[invoice]}=await db.query('SELECT * FROM saas_invoices WHERE id=$1 AND gym_id=$2',[req.params.id,req.gymId]);if(!invoice)return res.sendStatus(404);const {rows:payments}=await db.query('SELECT reference,status,paid_at FROM saas_payments WHERE invoice_id=$1 AND gym_id=$2 ORDER BY id',[invoice.id,req.gymId]);res.render('billing/saas-invoice',{gym:req.gym,invoice,payments});}catch(error){next(error);}});
router.post('/settings/ownership',can('ownership.manage'),billingCsrf,requireRecentAuth,action(req=>management.initiateOwnershipTransfer(req.gymId,actorFrom(req),req.body.to_user_id)));
router.post('/settings/ownership/:id/accept',billingCsrf,requireRecentAuth,action(req=>management.acceptOwnershipTransfer(req.gymId,actorFrom(req),req.params.id)));
router.post('/settings/support',can('support.authorize'),billingCsrf,requireRecentAuth,action(req=>management.grantSupport(req.gymId,actorFrom(req),req.body)));
router.post('/settings/support/:id/revoke',can('support.authorize'),billingCsrf,requireRecentAuth,action(req=>transaction(async client=>{const result=await client.query('UPDATE support_grants SET revoked_at=NOW() WHERE id=$1 AND gym_id=$2 RETURNING id',[req.params.id,req.gymId]);if(!result.rows.length)throw Object.assign(new Error('Grant not found.'),{status:404});await audit(client,actorFrom(req),'support.revoked',req.gymId,req.params.id);})));
router.post('/settings/refunds',can('billing.write'),billingCsrf,requireRecentAuth,action(req=>requestRefund(req.gymId,actorFrom(req),req.body)));
router.post('/settings/refunds/:id/refresh',can('billing.write'),billingCsrf,requireRecentAuth,action(async req=>{const {rows:[refund]}=await db.query('SELECT provider_id FROM payment_refunds WHERE id=$1 AND gym_id=$2',[req.params.id,req.gymId]);if(!refund)throw Object.assign(new Error('Refund not found.'),{status:404});return reconcileRefund(refund.provider_id);}));
router.get('/financials',can('reports.read'),requireFeature('financial_reports'),async(req,res,next)=>{try{const data=await financialSummary(req.gymId);res.render('admin/financials',{activePage:'financials',gym:req.gym,...data});}catch(error){next(error);}});
router.get('/financials/export.csv',can('reports.read'),requireFeature('financial_reports'),async(req,res,next)=>{try{const data=await financialSummary(req.gymId);res.type('text/csv').set('Content-Disposition','attachment; filename="gym-finances.csv"').send(financialCsv(data.gyms));}catch(error){next(error);}});
router.get('/settings/audit',can('audit.read'),async(req,res,next)=>{try{const {rows}=await db.query('SELECT * FROM audit_events WHERE gym_id=$1 ORDER BY id DESC LIMIT 200',[req.gymId]);res.json({events:rows});}catch(error){next(error);}});
export default router;
