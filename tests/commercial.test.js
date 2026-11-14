import test from 'node:test';
import assert from 'node:assert/strict';
import {commissionCents,commissionReversal} from '../src/services/commission.service.js';
import {hasPermission,requiresGymMfa} from '../src/security/roles.js';
import {base32,totp,totpCounter,encryptSecret,decryptSecret} from '../src/security/crypto.js';
import {nextSaasPeriod} from '../src/services/saasBilling.service.js';
import {paystackKey} from '../src/services/paystackClient.js';
import {eligibleSubaccount} from '../src/services/paymentOnboarding.service.js';

test('commissions and cumulative refund reversals use integer cents, including full reversal',()=>{
  assert.equal(commissionCents(50000,200),1000);
  assert.equal(commissionCents(101,200),2);
  assert.equal(commissionCents(25,200),1);
  assert.equal(commissionCents(50000,0),0);
  assert.equal(commissionReversal(1000,50000,25000),500);
  assert.equal(commissionReversal(1,25,12),0);
  assert.equal(commissionReversal(1,25,25),1);
  for(const bad of [-1,1.2,NaN,Infinity])assert.throws(()=>commissionCents(bad));
  assert.throws(()=>commissionReversal(1000,50000,50001));
});
test('role boundaries exclude platform identities from gym permissions and staff from owner controls',()=>{
  assert.equal(hasPermission('gym','gym_super_admin','ownership.manage'),true);
  assert.equal(hasPermission('gym','admin','billing.write'),true);
  for(const role of ['gym_admin','gym_manager','gym_receptionist','gym_trainer','member','fitnexis_super_admin'])assert.equal(hasPermission('gym',role,'ownership.manage'),false);
  assert.equal(hasPermission('gym','gym_receptionist','checkins.write'),true);
  assert.equal(hasPermission('gym','gym_receptionist','billing.write'),false);
  assert.equal(hasPermission('platform','fitnexis_admin','commission.manage'),false);
  assert.equal(hasPermission('platform','fitnexis_support','billing.read'),false);
  assert.equal(hasPermission('platform','gym_super_admin','admins.manage'),false);
  assert.equal(requiresGymMfa('gym_super_admin'),true);
});
test('TOTP matches RFC 6238 vectors and rejects replayed or invalid codes',()=>{
  const secret=base32(Buffer.from('12345678901234567890'));
  assert.equal(totp(secret,1,8),'94287082');
  assert.equal(totp(secret,37037036,8),'07081804');
  const code=totp(secret,100);
  assert.equal(totpCounter(secret,code,3000000),100);
  assert.equal(totpCounter(secret,code,3000000,100),null);
  assert.equal(totpCounter(secret,'bad',3000000),null);
});
test('encrypted authenticator and debit secrets are bound to the intended account',()=>{
  const previous=process.env.SECURITY_ENCRYPTION_KEY;
  process.env.SECURITY_ENCRYPTION_KEY=Buffer.alloc(32,8).toString('base64');
  try{
    const sealed=encryptSecret('private-secret','gym:4');
    assert.ok(!sealed.includes('private-secret'));
    assert.equal(decryptSecret(sealed,'gym:4'),'private-secret');
    assert.throws(()=>decryptSecret(sealed,'platform:4'));
    const parts=sealed.split('.');parts[2]=Buffer.from('changed').toString('base64');assert.throws(()=>decryptSecret(parts.join('.'),'gym:4'));
  }finally{if(previous===undefined)delete process.env.SECURITY_ENCRYPTION_KEY;else process.env.SECURITY_ENCRYPTION_KEY=previous;}
});
test('subscription periods clamp month ends and leap years',()=>{
  assert.equal(nextSaasPeriod('2026-01-31T12:00:00Z','monthly').toISOString(),'2026-02-28T12:00:00.000Z');
  assert.equal(nextSaasPeriod('2024-02-29T12:00:00Z','annual').toISOString(),'2025-02-28T12:00:00.000Z');
});
test('payment activation requires the correct environment and a verified ZAR subaccount',()=>{
  const remote={active:true,is_verified:true,currency:'ZAR',domain:'test'};
  assert.equal(eligibleSubaccount(remote,'test'),true);
  for(const patch of [{is_verified:false},{active:false},{currency:'NGN'},{domain:'live'}])assert.equal(eligibleSubaccount({...remote,...patch},'test'),false);
  const env={...process.env};
  try{process.env.PAYSTACK_MODE='live';process.env.PAYSTACK_LIVE_SECRET_KEY='sk_live_fake';delete process.env.PAYSTACK_LIVE_ENABLED;assert.throws(()=>paystackKey(),/not been activated/);
    process.env.PAYSTACK_MODE='test';process.env.PAYSTACK_TEST_SECRET_KEY='sk_live_wrong';assert.throws(()=>paystackKey(),/test credentials/);
  }finally{for(const key of ['PAYSTACK_MODE','PAYSTACK_LIVE_SECRET_KEY','PAYSTACK_LIVE_ENABLED','PAYSTACK_TEST_SECRET_KEY'])if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}
});
