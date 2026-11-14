import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {db} from '../config/db.js';
import {requirePermission,PLATFORM_ROLES,hasPermission} from '../security/roles.js';
import {requireRecentAuth} from './security.routes.js';
import {audit,actorFrom,transaction} from '../services/audit.service.js';
import {reauthenticate,beginMfa} from '../services/mfa.service.js';
import {mfaCookieName,gymCookieOptions} from '../services/authSessions.service.js';
import {rateLimit} from '../middleware/rateLimit.js';
import {financialSummary,financialCsv} from '../services/financialReporting.service.js';
import {createSaasPlan,setPlanPublished,runSaasRenewals} from '../services/saasBilling.service.js';
import {updateCommission} from '../services/commission.service.js';
import {setGymStatus,managePlatformAdmin,designateOwner} from '../services/platformManagement.service.js';
import {requestRefund,reconcileRefund} from '../services/refunds.service.js';
import {refreshSubaccount,recoverSubaccount} from '../services/paymentOnboarding.service.js';
import {reconcileSettlement} from '../services/paymentReconciliation.service.js';

export function platformCommercialRoutes(csrfCheck) {
  const router=Router(),can=permission=>requirePermission('platform',permission);
  const run=(fn,redirect='/platform/billing')=>async(req,res,next)=>{try{const data=await fn(req);if(req.is('application/json'))return res.json(data||{ok:true});res.redirect(303,redirect);}catch(error){if(error.code==='23505')return res.status(409).send('That record already exists.');if(error.status)return res.status(error.status).send(error.message);next(error);}};
  router.post('/reauthenticate/code',rateLimit('platform-reauth-code',5),csrfCheck,async(req,res,next)=>{
    try{const token=await beginMfa('platform',req.platformAdmin,'reauth');
      res.cookie(mfaCookieName('platform-reauth'),token,{...gymCookieOptions,sameSite:'strict',maxAge:300000});
      res.redirect(303,'/platform/billing?code=sent');
    }catch(error){if(error.status)return res.status(error.status).send(error.message);next(error);}
  });
  router.post('/reauthenticate',rateLimit('platform-reauth'),csrfCheck,run(async req=>{
    await reauthenticate('platform',req.platformAdmin.id,req.body.password,req.body.code,req.cookies[mfaCookieName('platform-reauth')]);
    await db.query("UPDATE platform_sessions SET reauth_until=NOW()+INTERVAL '5 minutes' WHERE id=$1",[req.platformAdmin.session_id]);
    await audit(db,actorFrom(req),'security.reauthenticated');
  }));
  router.get('/billing',can('billing.read'),async(req,res,next)=>{try{
    const [finance,{rows:plans},{rows:[config]},{rows:invoices},{rows:refunds}]=await Promise.all([
      financialSummary(),db.query('SELECT * FROM saas_plans ORDER BY id DESC'),db.query('SELECT * FROM platform_billing_config WHERE id=1'),
      db.query('SELECT i.*,g.name AS gym_name FROM saas_invoices i JOIN gyms g ON g.id=i.gym_id ORDER BY i.id DESC LIMIT 200'),
      db.query('SELECT * FROM payment_refunds ORDER BY id DESC LIMIT 100')]);
    res.render('platform/billing',{section:'billing',...finance,plans,config:config||{},invoices,refunds,reference:`fnr-${randomUUID()}`,can:permission=>hasPermission('platform',req.platformAdmin.role,permission)});
  }catch(error){next(error);}});
  router.post('/billing/config',can('commission.manage'),csrfCheck,requireRecentAuth,run(req=>updateCommission(actorFrom(req),req.body)));
  router.post('/gyms/:id/commission',can('commission.manage'),csrfCheck,requireRecentAuth,run(req=>updateCommission(actorFrom(req),req.body,req.params.id)));
  router.post('/billing/plans',can('billing.manage'),csrfCheck,requireRecentAuth,run(req=>createSaasPlan(actorFrom(req),req.body)));
  router.post('/billing/plans/:id/publish',can('billing.manage'),csrfCheck,requireRecentAuth,run(req=>setPlanPublished(actorFrom(req),req.params.id,req.body.is_active)));
  router.post('/billing/renewals',can('billing.manage'),csrfCheck,requireRecentAuth,run(()=>runSaasRenewals()));
  router.post('/gyms/:id/status',can('gyms.manage'),csrfCheck,requireRecentAuth,run(req=>setGymStatus(actorFrom(req),req.params.id,req.body)));
  router.post('/gyms/:id/owner',can('admins.manage'),csrfCheck,requireRecentAuth,run(req=>designateOwner(actorFrom(req),req.params.id,req.body.user_id,req.body.reason)));
  router.post('/gyms/:id/subaccount/refresh',can('billing.manage'),csrfCheck,requireRecentAuth,run(req=>refreshSubaccount(req.params.id,actorFrom(req))));
  router.post('/gyms/:id/subaccount/recover',can('billing.manage'),csrfCheck,requireRecentAuth,run(req=>recoverSubaccount(req.params.id,actorFrom(req),req.body.subaccount_code)));
  router.post('/gyms/:id/refunds',can('billing.manage'),csrfCheck,requireRecentAuth,run(req=>requestRefund(req.params.id,actorFrom(req),req.body)));
  router.post('/billing/refunds',can('billing.manage'),csrfCheck,requireRecentAuth,run(req=>requestRefund(req.body.gym_id,actorFrom(req),req.body)));
  router.post('/billing/settlements',can('billing.manage'),csrfCheck,requireRecentAuth,run(req=>reconcileSettlement(actorFrom(req),req.body.gym_id,req.body.settlement_id)));
  router.post('/refunds/:id/refresh',can('billing.manage'),csrfCheck,requireRecentAuth,run(req=>reconcileRefund(req.params.id)));
  router.get('/billing/export.csv',can('billing.read'),async(req,res,next)=>{try{const data=await financialSummary();res.type('text/csv').set('Content-Disposition','attachment; filename="fitnexis-platform-finances.csv"').send(financialCsv(data.gyms));}catch(error){next(error);}});
  router.get('/administrators',can('admins.manage'),async(req,res,next)=>{try{const {rows:administrators}=await db.query('SELECT id,name,email,role,is_active,email_verified_at IS NOT NULL AS mfa_enrolled FROM platform_admins ORDER BY id');res.render('platform/administrators',{section:'administrators',administrators,roles:PLATFORM_ROLES});}catch(error){next(error);}});
  router.post('/administrators',can('admins.manage'),csrfCheck,requireRecentAuth,run(req=>managePlatformAdmin(actorFrom(req),req.body),'/platform/administrators'));
  router.post('/administrators/:id',can('admins.manage'),csrfCheck,requireRecentAuth,run(req=>managePlatformAdmin(actorFrom(req),req.body,req.params.id),'/platform/administrators'));
  router.get('/audit',can('audit.read'),async(req,res,next)=>{try{
    const action=typeof req.query.action==='string'?req.query.action.slice(0,100):'';
    const page=Math.max(1,Math.min(100000,parseInt(req.query.page,10)||1));
    const {rows:events}=await db.query('SELECT * FROM audit_events WHERE action ILIKE $1 ORDER BY id DESC LIMIT 100 OFFSET $2',[`%${action}%`,(page-1)*100]);
    const {rows:notifications}=await db.query("SELECT * FROM platform_notifications WHERE audience='platform' ORDER BY id DESC LIMIT 50");
    res.render('platform/audit',{section:'audit',events,action,page,notifications});
  }catch(error){next(error);}});
  // Support sees a read-only, time-limited view. No gym JWT or owner identity is issued.
  router.get('/support/:id',can('support.read'),async(req,res,next)=>{try{
    const {rows:[grant]}=await db.query('SELECT * FROM support_grants WHERE id=$1 AND platform_admin_id=$2 AND revoked_at IS NULL AND expires_at>NOW()',[req.params.id,req.platformAdmin.id]);
    if(!grant)return res.status(403).send('A current gym-owner authorization is required.');
    const finance=await financialSummary(grant.gym_id);await audit(db,actorFrom(req),'support.accessed',grant.gym_id,grant.id);
    res.render('platform/support',{section:'support',grant,...finance});
  }catch(error){next(error);}});
  return router;
}
