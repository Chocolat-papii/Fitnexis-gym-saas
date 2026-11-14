import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import cookieParser from 'cookie-parser';
import ejs from 'ejs';
import {fileURLToPath} from 'node:url';
import {createHash,createHmac} from 'node:crypto';
import {db} from '../src/config/db.js';
import {emailDelivery} from '../src/services/email.service.js';
import {beginMfa,completeMfa,emailCodeHash} from '../src/services/mfa.service.js';
import securityRoutes from '../src/routes/security.routes.js';

test('email codes: hashed storage, cooldown, scope, expiry, bounded attempts, one-time use, reauth isolation and safe page',async()=>{
  const previous={query:db.query,connect:db.connect,send:emailDelivery.sendCode,env:{...process.env}};
  process.env.JWT_SECRET='email-auth-test-only';
  const actor={id:7,gym_id:'gym-a',email:'owner@example.invalid',auth_version:1,is_active:true};
  let challenge,code,failMail=false;
  const query=async(sql,p=[])=>{
    if(sql.includes('SELECT * FROM users'))return {rows:[actor]};
    if(sql.includes('SELECT id FROM users'))return {rows:[actor]};
    if(sql.includes("method='email' AND expires_at>"))return {rows:challenge&&challenge.expires_at>Date.now()+240000?[challenge]:[]};
    if(sql.includes('INSERT INTO mfa_challenges')){
      challenge={id:p[0],scope:p[1],actor_id:p[2],gym_id:p[3],secret:p[4],purpose:p[5],email:p[6],auth_version:p[7],attempts:0,expires_at:new Date(Date.now()+300000)};
    }else if(sql.includes('FROM mfa_challenges')&&sql.includes('FOR UPDATE'))return {rows:[challenge]};
    else if(sql.includes('FROM mfa_challenges'))return {rows:challenge&&p[0]===challenge.id&&p[1]===challenge.scope&&p[2]===challenge.purpose&&!challenge.used_at&&challenge.attempts<5&&challenge.expires_at>Date.now()?[challenge]:[]};
    else if(sql.startsWith('UPDATE mfa_challenges SET attempts')){if(challenge.used_at||challenge.attempts>=5)return {rows:[]};challenge.attempts++;return {rows:[challenge]};}
    else if(sql.startsWith('UPDATE mfa_challenges SET used_at')&&p.length===1){challenge.used_at=new Date();if(sql.includes('expires_at=NOW()'))challenge.expires_at=new Date();}
    return {rows:[]};
  };
  db.query=query;db.connect=async()=>({query,release(){}});
  emailDelivery.sendCode=async(email,value)=>{assert.equal(email,actor.email);if(failMail)throw Object.assign(new Error('delivery failed'),{status:503});code=value;};
  const app=express();app.engine('html',ejs.renderFile);app.set('view engine','html');app.set('views',fileURLToPath(new URL('../src/views',import.meta.url)));
  app.use(cookieParser(),express.urlencoded({extended:false}));app.use((req,res,next)=>{req.gymId='gym-a';next();});app.use('/security',securityRoutes);
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const token=await beginMfa('gym',actor);
    assert.match(code,/^\d{6}$/);assert.equal(challenge.secret,emailCodeHash(challenge.id,code));assert.notEqual(challenge.secret,code);assert.notEqual(token,challenge.id);
    await assert.rejects(()=>beginMfa('gym',actor),{status:429});
    const response=await fetch(base+'/security/mfa/gym',{headers:{cookie:`fitnexis_mfa_gym=${token}`}});
    assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const html=await response.text();assert.match(html,/Check your email/);assert.match(html,/o\*\*\*@example.invalid/);assert.ok(!html.includes(code));assert.ok(!html.includes('<svg'));assert.ok(!html.includes('authenticator'));
    const post=body=>fetch(base+'/security/mfa/gym',{method:'POST',headers:{cookie:`fitnexis_mfa_gym=${token}`,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body),redirect:'manual'});
    assert.equal((await post({code})).status,403);
    const csrf=createHmac('sha256',process.env.JWT_SECRET).update(`mfa:${token}`).digest('hex');
    assert.equal((await post({_csrf:csrf,code:'invalid'})).status,401);
    await assert.rejects(()=>completeMfa(token,'platform',code),{status:401});
    await assert.rejects(()=>completeMfa(token,'gym',code,'reauth',actor.id),{status:401});
    for(let i=challenge.attempts;i<5;i++)await assert.rejects(()=>completeMfa(token,'gym','wrong'),{status:401});
    await assert.rejects(()=>completeMfa(token,'gym',code),{status:401});
    challenge=undefined;const fresh=await beginMfa('gym',actor);await completeMfa(fresh,'gym',code);await assert.rejects(()=>completeMfa(fresh,'gym',code),{status:401});
    challenge=undefined;const expired=await beginMfa('gym',actor);challenge.expires_at=new Date(0);await assert.rejects(()=>completeMfa(expired,'gym',code),{status:401});
    challenge=undefined;const reauth=await beginMfa('gym',actor,'reauth');await assert.rejects(()=>completeMfa(reauth,'gym',code,'reauth',8),{status:401});await completeMfa(reauth,'gym',code,'reauth',7);
    challenge=undefined;failMail=true;await assert.rejects(()=>beginMfa('gym',actor),{status:503});assert.ok(challenge.used_at);
  }finally{await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});db.query=previous.query;db.connect=previous.connect;emailDelivery.sendCode=previous.send;process.env=previous.env;}
});
