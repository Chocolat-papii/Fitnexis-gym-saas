import test from 'node:test';
import assert from 'node:assert/strict';
import knex from 'knex';
import pg from 'pg';
import express from 'express';
import cookieParser from 'cookie-parser';
import ejs from 'ejs';
import jwt from 'jsonwebtoken';
import {randomUUID,createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {db} from '../src/config/db.js';
import {createPlatformGym} from '../src/services/platformGyms.service.js';
import {beginMfa,mfaEnrollment,completeMfa} from '../src/services/mfa.service.js';
import {emailDelivery} from '../src/services/email.service.js';
import {createStaff,updateStaff,addBranch,grantSupport,initiateOwnershipTransfer,acceptOwnershipTransfer} from '../src/services/gymManagement.service.js';
import {createSaasPlan,selectSaasPlan,initializeSaasCheckout,verifySaasPayment,subscriptionAccess,runSaasRenewals,cancelSubscription} from '../src/services/saasBilling.service.js';
import {onboardSubaccount,refreshSubaccount,recoverSubaccount} from '../src/services/paymentOnboarding.service.js';
import {createPlan,createInvoice,recordManualPayment} from '../src/services/billing.service.js';
import {initiatePaystackCheckout,verifyAndSettle} from '../src/services/paystack.service.js';
import {requestRefund,reconcileRefund} from '../src/services/refunds.service.js';
import {updateCommission} from '../src/services/commission.service.js';
import {financialSummary} from '../src/services/financialReporting.service.js';
import {requireAuth} from '../src/middleware/requireAuth.js';
import {requireAdmin} from '../src/middleware/requireAdmin.js';
import {hydrateMember} from '../src/middleware/hydrateMember.js';
import adminRoutes from '../src/routes/admin.routes.js';
import platformRoutes from '../src/routes/platform.routes.js';
import securityRoutes from '../src/routes/security.routes.js';
import registrationRoutes from '../src/routes/gymRegistration.routes.js';
import {paystackWebhook} from '../src/controllers/paystackWebhook.controller.js';
import {purchaseMembership} from '../src/services/membershipCheckout.service.js';
import {createBooking} from '../src/services/classBooking.service.js';

const connection=process.env.COMMERCIAL_TEST_DATABASE_URL;
test('commercial platform: real migrations, MFA, RBAC, bank onboarding, subscriptions, commission snapshots, refunds and audit trails',{skip:!connection},async()=>{
  const url=new URL(connection);assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.match(url.pathname,/^\/fitnexis_billing_test_[a-z0-9_]+$/);
  const sql=knex({client:'pg',connection}),pool=new pg.Pool({connectionString:connection});
  const sentCodes=new Map(),originalSend=emailDelivery.sendCode;emailDelivery.sendCode=async(email,code)=>{sentCodes.set(email,code);};
  const previous={query:db.query,connect:db.connect,fetch:globalThis.fetch,env:{...process.env}};
  db.query=pool.query.bind(pool);db.connect=pool.connect.bind(pool);
  Object.assign(process.env,{JWT_SECRET:'commercial-integration-test-only',SECURITY_ENCRYPTION_KEY:Buffer.alloc(32,9).toString('base64'),PAYSTACK_MODE:'test',PAYSTACK_TEST_SECRET_KEY:'sk_test_commercial_fixture'});
  const suffix=Date.now(),createdGyms=[],planIds=[];let platformId,server;
  let remoteVerified=true,failCreate=false,subaccountCalls=0,saasMismatch=false,refundCalls=0,recoveryMetadata;
  const remoteTransactions=new Map(),remoteRefunds=new Map();
  const ownerInput={name:'Commercial gym',slug:`commercial-${suffix}`,gymMail:'gym@example.invalid',address:'1 Main Road',firstname:'Original',lastname:'Owner',phone:'000',email:'owner@example.invalid',password:'test-owner-password-123'};
  const gatewayFetch=async(url,options={})=>{
    const path=String(url).replace('https://api.paystack.co',''),body=options.body?JSON.parse(options.body):{};
    let data;
    if(path.startsWith('/bank?'))data=[{name:'Test bank',code:'632005',active:true}];
    else if(path==='/bank/validate')data={verified:true,accountHolderMatch:true,accountAcceptsCredits:true};
    else if(path==='/subaccount'&&options.method==='POST'){
      subaccountCalls++;if(failCreate){recoveryMetadata=JSON.parse(body.metadata);throw new Error('provider accepted then timed out');}
      data={id:20,subaccount_code:'ACCT_commercial123',active:true,is_verified:remoteVerified,currency:'ZAR',domain:'test'};
    }else if(path.startsWith('/subaccount/'))data={id:20,subaccount_code:path.endsWith('ACCT_recovered123')?'ACCT_recovered123':'ACCT_commercial123',active:true,is_verified:remoteVerified,currency:'ZAR',domain:'test',metadata:path.endsWith('ACCT_recovered123')?recoveryMetadata:null};
    else if(path==='/transaction/initialize'){
      const id=remoteTransactions.size+100;remoteTransactions.set(body.reference,{id,reference:body.reference,amount:body.amount,currency:'ZAR',domain:'test',status:'success',fees:150,
        authorization:{reusable:true,authorization_code:'AUTH_secret'},customer:{email:body.email},request:body});
      data={reference:body.reference,authorization_url:'https://checkout.paystack.com/commercial-test'};
    }else if(path.startsWith('/transaction/verify/')){
      data=remoteTransactions.get(decodeURIComponent(path.split('/').at(-1)));
      if(saasMismatch&&data?.reference.startsWith('fns-'))data={...data,amount:data.amount+1};
    }else if(path==='/refund'){
      refundCalls++;const payment=remoteTransactions.get(body.transaction);
      let old=[...remoteRefunds.values()].find(x=>x.reference===body.reference);
      data=old||{id:remoteRefunds.size+50,reference:body.reference,transaction:payment.id,currency:'ZAR',domain:'test',amount:body.amount,status:'processed'};
      remoteRefunds.set(String(data.id),data);
    }else if(path.startsWith('/refund/'))data=remoteRefunds.get(path.split('/').at(-1));
    else throw new Error('Unexpected provider path '+path);
    return {ok:true,status:200,json:async()=>({status:true,data})};
  };
  globalThis.fetch=gatewayFetch;
  try{
    await sql.migrate.latest({directory:'./migrations'});
    const gym=await createPlatformGym(ownerInput,{scope:'platform',id:999});createdGyms.push(gym.id);
    const other=await createPlatformGym({...ownerInput,slug:`other-${suffix}`},{scope:'platform',id:999});createdGyms.push(other.id);
    const {rows:[owner]}=await pool.query('SELECT * FROM users WHERE gym_id=$1',[gym.id]);
    assert.equal(owner.role,'gym_super_admin');assert.equal((await pool.query('SELECT owner_id FROM gyms WHERE id=$1',[gym.id])).rows[0].owner_id,owner.id);
    const actor={scope:'gym',id:owner.id};
    const challenge=await beginMfa('gym',owner),enrollment=await mfaEnrollment(challenge,'gym');
    assert.ok(enrollment.email);assert.ok(!owner.mfa_secret);
    await assert.rejects(()=>completeMfa(challenge,'gym','wrong'),{status:401});
    await completeMfa(challenge,'gym',sentCodes.get(owner.email));
    await assert.rejects(()=>completeMfa(challenge,'gym',sentCodes.get(owner.email)),{status:401});
    const {rows:[securedOwner]}=await pool.query('SELECT email_verified_at FROM users WHERE id=$1',[owner.id]);assert.ok(securedOwner.email_verified_at);

    const staff=await createStaff(gym.id,actor,{firstname:'Front',lastname:'Desk',email:'desk@example.invalid',phone:'001',password:'front-desk-password-123',role:'gym_receptionist'});
    const branch=await addBranch(gym.id,actor,{name:'Main branch',hours:{Monday:'06:00–21:00'},facilities:['Studio']});
    const otherBranch=await addBranch(other.id,{scope:'system'},{name:'Other branch'});
    await assert.rejects(()=>updateStaff(gym.id,actor,staff.id,{role:'gym_admin',is_active:true,branch_ids:[otherBranch.id]}),/does not belong/);
    await updateStaff(gym.id,actor,staff.id,{role:'gym_receptionist',is_active:true,branch_ids:[branch.id]});
    await assert.rejects(()=>updateStaff(gym.id,actor,owner.id,{role:'gym_admin',is_active:true}),{status:403});

    const bank={business_name:'Commercial Gym',bank_code:'632005',account_number:'1234567890',account_name:'Commercial Gym',account_type:'business',document_type:'businessRegistrationNumber',document_number:'REG123456'};
    remoteVerified=false;await onboardSubaccount(gym.id,actor,bank);
    assert.equal((await pool.query('SELECT payout_eligible FROM gym_payment_settings WHERE gym_id=$1',[gym.id])).rows[0].payout_eligible,false);
    remoteVerified=true;await refreshSubaccount(gym.id,actor);
    const savedBank=(await pool.query('SELECT * FROM gym_payment_settings WHERE gym_id=$1',[gym.id])).rows[0];assert.equal(savedBank.bank_last4,'7890');assert.ok(!JSON.stringify(savedBank).includes('1234567890'));
    failCreate=true;await assert.rejects(()=>onboardSubaccount(other.id,{scope:'system'},bank),/temporarily unavailable/);failCreate=false;
    const calls=subaccountCalls;await assert.rejects(()=>onboardSubaccount(other.id,{scope:'system'},bank),/needs reconciliation/);assert.equal(subaccountCalls,calls,'Unknown creation outcomes cannot generate a duplicate subaccount');
    await assert.rejects(()=>recoverSubaccount(other.id,{scope:'platform',id:999},'ACCT_commercial123'),/does not match/);
    await recoverSubaccount(other.id,{scope:'platform',id:999},'ACCT_recovered123');
    assert.equal((await pool.query('SELECT payout_eligible FROM gym_payment_settings WHERE gym_id=$1',[other.id])).rows[0].payout_eligible,true);

    const plan=await createSaasPlan({scope:'platform',id:999},{name:`Dynamic plan ${suffix}`,price_cents:25000,interval:'monthly',features:['financial_reports','online_payments','staff','branches'],is_active:true});planIds.push(plan.id);
    const selected=await selectSaasPlan(gym.id,actor,plan.id);assert.equal(Number(selected.invoice.amount_cents),25000);
    const checkout=await initializeSaasCheckout(gym.id,selected.invoice.id,{autoRenew:true});assert.equal(remoteTransactions.get(checkout.reference).request.subaccount,undefined,'SaaS revenue goes to the main account without a gym split');
    saasMismatch=true;await assert.rejects(()=>verifySaasPayment(checkout.reference,gym.id),/mismatch/);saasMismatch=false;
    await Promise.all([verifySaasPayment(checkout.reference,gym.id),verifySaasPayment(checkout.reference,gym.id)]);
    const access=await subscriptionAccess(gym.id);assert.equal(access.status,'active');assert.ok(access.features.includes('online_payments'));
    assert.equal((await pool.query('SELECT COUNT(*) AS n FROM saas_payments WHERE invoice_id=$1 AND status=\'succeeded\'',[selected.invoice.id])).rows[0].n,'1');
    const sub=(await pool.query('SELECT * FROM gym_subscriptions WHERE gym_id=$1',[gym.id])).rows[0];assert.equal(sub.auto_renew,true);assert.ok(!sub.authorization_secret.includes('AUTH_secret'));
    await assert.rejects(()=>verifySaasPayment(checkout.reference,other.id),{status:404});

    const {rows:[member]}=await pool.query("INSERT INTO users(firstname,lastname,email,phone,gym_id) VALUES('Paid','Member','member@example.invalid','002',$1) RETURNING id",[gym.id]);
    const invoice=await createInvoice(gym.id,{user_id:member.id,amount:'500',description:'Membership'});
    const memberCheckout=await initiatePaystackCheckout(gym.id,member.id,invoice.id);
    const request=remoteTransactions.get(memberCheckout.reference).request;assert.equal(request.transaction_charge,1000);assert.equal(request.bearer,'subaccount');
    await updateCommission({scope:'platform',id:999},{commission_bps:300,reason:'Negotiated commercial exception'},gym.id);
    await Promise.all([verifyAndSettle(memberCheckout.reference),verifyAndSettle(memberCheckout.reference)]);
    const payment=(await pool.query('SELECT * FROM payments WHERE reference=$1',[memberCheckout.reference])).rows[0];assert.equal(Number(payment.commission_cents),1000,'Pending payments retain their commission snapshot');assert.equal(payment.commission_bps,200);assert.equal(Number(payment.gateway_fee_cents),150);
    const manualInvoice=await createInvoice(gym.id,{user_id:member.id,amount:'50'});const manual=await recordManualPayment(gym.id,owner.id,{invoice_id:manualInvoice.id,amount:'50',provider:'cash',reference:`cash-${suffix}`});assert.equal(Number(manual.commission_cents),0);
    const customPlan=await createPlan(gym.id,{name:'Custom 10 days',price:'80',billing_cycle:'custom',custom_days:10});
    const purchased=await purchaseMembership(gym.id,member.id,customPlan.id);
    assert.equal((await purchaseMembership(gym.id,member.id,customPlan.id)).invoice_id,purchased.invoice_id,'Repeated purchase returns the same invoice');
    assert.equal((await pool.query('SELECT status FROM memberships WHERE id=$1',[purchased.membership_id])).rows[0].status,'awaiting_payment');
    await recordManualPayment(gym.id,owner.id,{invoice_id:purchased.invoice_id,amount:'80',provider:'eft',reference:`purchase-${suffix}`});
    assert.equal((await pool.query('SELECT status FROM memberships WHERE id=$1',[purchased.membership_id])).rows[0].status,'active','Only confirmed settlement activates a purchased membership');
    const refundInput={payment_id:payment.id,amount_cents:25000,reference:`fnr-${randomUUID()}`,reason:'Member requested partial refund'};
    await requestRefund(gym.id,{scope:'platform',id:999},refundInput);await requestRefund(gym.id,{scope:'platform',id:999},refundInput);
    assert.equal(refundCalls,1,'Completed refunds do not call the provider again');
    let adjusted=(await pool.query('SELECT * FROM payments WHERE id=$1',[payment.id])).rows[0];assert.equal(Number(adjusted.refunded_cents),25000);assert.equal(Number(adjusted.commission_refunded_cents),500);
    await assert.rejects(()=>requestRefund(gym.id,actor,{...refundInput,reference:`fnr-${randomUUID()}`,amount_cents:25001}),/exceeds/);
    const finance=await financialSummary(gym.id);assert.equal(Number(finance.totals.commission_cents),500);assert.equal(Number(finance.totals.saas_cents),25000);
    await assert.rejects(()=>pool.query('UPDATE audit_events SET action=\'tampered\' WHERE gym_id=$1',[gym.id]),/append-only/);

    const {rows:[platform]}=await pool.query("INSERT INTO platform_admins(name,email,password,role,email_verified_at) VALUES('Test super admin',$1,$2,'fitnexis_super_admin',$3) RETURNING id",[`super-${suffix}@example.invalid`,owner.password,securedOwner.email_verified_at]);platformId=platform.id;
    const {rows:[platformSession]}=await pool.query("INSERT INTO platform_sessions(admin_id,mfa_verified,expires_at,reauth_until) VALUES($1,true,NOW()+INTERVAL '1 hour',NOW()+INTERVAL '5 minutes') RETURNING id",[platformId]);
    const tokenFor=async(userId,role,mfa=false)=>{const {rows:[s]}=await pool.query("INSERT INTO gym_auth_sessions(user_id,gym_id,mfa_verified,expires_at,reauth_until) VALUES($1,$2,$3,NOW()+INTERVAL '1 hour',NOW()+INTERVAL '5 minutes') RETURNING id",[userId,gym.id,mfa]);const {rows:[u]}=await pool.query('SELECT auth_version FROM users WHERE id=$1',[userId]);return jwt.sign({sub:String(userId),gymId:gym.id,role,version:u.auth_version},process.env.JWT_SECRET,{audience:'fitnexis-gym',issuer:'fitnexis',jwtid:s.id});};
    const ownerToken=await tokenFor(owner.id,'gym_super_admin',true),staffToken=await tokenFor(staff.id,'gym_super_admin');
    const app=express();app.engine('html',ejs.renderFile);app.set('view engine','html');app.set('views',fileURLToPath(new URL('../src/views',import.meta.url)));
    app.post('/webhook',express.raw({type:'application/json'}),paystackWebhook);app.use(cookieParser(),express.urlencoded({extended:false}),express.json());
    app.use('/platform',platformRoutes);app.use('/join',registrationRoutes);
    app.use((req,res,next)=>{req.gymId=gym.id;req.gym={id:gym.id,name:'Commercial gym'};next();});
    app.use('/security',securityRoutes);app.use('/admin',requireAuth,requireAdmin,hydrateMember,adminRoutes);
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
    const http=(route,options={})=>previous.fetch(base+route,{redirect:'manual',...options});
    const ownerHeaders={cookie:`token=${ownerToken}`},staffHeaders={cookie:`token=${staffToken}`};
    const registration=await http('/join');assert.equal(registration.status,200);const registrationCookie=registration.headers.getSetCookie()[0].split(';')[0];
    const newSlug=`public-${suffix}`;
    const registered=await http('/join',{method:'POST',headers:{cookie:registrationCookie,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...ownerInput,slug:newSlug,authorized_owner:'yes',plan_id:plan.id,_csrf:registrationCookie.split('=')[1]})});
    assert.equal(registered.status,201,await registered.text());
    const publicGym=(await pool.query('SELECT * FROM gyms WHERE slug=$1',[newSlug])).rows[0];createdGyms.push(publicGym.id);assert.equal(publicGym.account_status,'pending');assert.ok(publicGym.owner_id);
    const settingsPage=await http('/admin/settings',{headers:ownerHeaders});assert.equal(settingsPage.status,200);
    if(process.env.COMMERCIAL_CAPTURE_HTML==='true')await writeFile('tmp/commercial-settings.html',await settingsPage.text());
    assert.equal((await http('/admin/financials',{headers:ownerHeaders})).status,200);
    assert.equal((await http('/admin/billing',{headers:staffHeaders})).status,403,'Forged role claims cannot override the persisted receptionist role');
    const platformToken=jwt.sign({},process.env.JWT_SECRET,{subject:String(platformId),jwtid:platformSession.id,audience:'fitnexis-platform',issuer:'fitnexis',expiresIn:'1h'});
    const platformCookie=`fitnexis_platform=${platformToken}; fitnexis_platform_csrf=${'b'.repeat(64)}`;
    for(const route of ['/platform','/platform/billing','/platform/administrators','/platform/audit']){const response=await http(route,{headers:{cookie:platformCookie}});assert.equal(response.status,200,route+': '+(response.status===200?'':await response.text()));if(process.env.COMMERCIAL_CAPTURE_HTML==='true'&&route==='/platform/billing')await writeFile('tmp/commercial-billing.html',await response.text());}
    const support=await grantSupport(gym.id,actor,{platform_admin_id:platformId,minutes:5,reason:'Owner requested billing help'});
    assert.equal((await http(`/platform/support/${support.id}`,{headers:{cookie:platformCookie}})).status,200);
    await pool.query('UPDATE support_grants SET expires_at=NOW()-INTERVAL \'1 second\' WHERE id=$1',[support.id]);assert.equal((await http(`/platform/support/${support.id}`,{headers:{cookie:platformCookie}})).status,403);
    const event=Buffer.from(JSON.stringify({event:'charge.success',data:{reference:memberCheckout.reference}}));
    assert.equal((await http('/webhook',{method:'POST',headers:{'content-type':'application/json','x-paystack-signature':createHmac('sha512',process.env.PAYSTACK_TEST_SECRET_KEY).update(event).digest('hex')},body:event})).status,200);
    assert.equal((await http('/webhook',{method:'POST',headers:{'content-type':'application/json','x-paystack-signature':'bad'},body:event})).status,401);
    await pool.query('UPDATE gym_auth_sessions SET revoked_at=NOW() WHERE user_id=$1',[owner.id]);assert.equal((await http('/admin/settings',{headers:ownerHeaders})).status,401);
    const staffAccount=(await pool.query('SELECT * FROM users WHERE id=$1',[staff.id])).rows[0];const staffChallenge=await beginMfa('gym',staffAccount);const staffEnrollment=await mfaEnrollment(staffChallenge,'gym');await completeMfa(staffChallenge,'gym',sentCodes.get(staffAccount.email));
    const transfer=await initiateOwnershipTransfer(gym.id,actor,staff.id);await acceptOwnershipTransfer(gym.id,{scope:'gym',id:staff.id},transfer.id);
    assert.equal((await pool.query('SELECT owner_id FROM gyms WHERE id=$1',[gym.id])).rows[0].owner_id,staff.id);
    assert.equal((await pool.query('SELECT role FROM users WHERE id=$1',[owner.id])).rows[0].role,'gym_admin');
    await assert.rejects(()=>acceptOwnershipTransfer(gym.id,{scope:'gym',id:staff.id},transfer.id),{status:409});
    await cancelSubscription(gym.id,actor);await pool.query('UPDATE gym_subscriptions SET period_end=NOW()-INTERVAL \'1 day\' WHERE gym_id=$1',[gym.id]);await runSaasRenewals();assert.equal((await subscriptionAccess(gym.id)).allowed,false);
  }finally{
    if(server)await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
    for(const gymId of createdGyms)await pool.query('DELETE FROM gyms WHERE id=$1',[gymId]);
    if(platformId)await pool.query('DELETE FROM platform_admins WHERE id=$1',[platformId]);
    if(planIds.length)await pool.query('DELETE FROM saas_plans WHERE id=ANY($1::int[])',[planIds]);
    emailDelivery.sendCode=originalSend;db.query=previous.query;db.connect=previous.connect;globalThis.fetch=previous.fetch;
    for(const key of ['JWT_SECRET','SECURITY_ENCRYPTION_KEY','PAYSTACK_MODE','PAYSTACK_TEST_SECRET_KEY'])if(previous.env[key]===undefined)delete process.env[key];else process.env[key]=previous.env[key];
    await pool.end();await sql.destroy();
  }
});
