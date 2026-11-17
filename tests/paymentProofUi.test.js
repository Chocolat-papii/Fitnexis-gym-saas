import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile('src/views/assets/dashboard/js/paymentProofs.js','utf8');
function setup(ok){
 const handlers={},button={disabled:false},status={textContent:'',setAttribute(){}},calls=[];let reloads=0;
 const form={action:{name:'action',value:'approved'},elements:{action:{value:'approved',addEventListener(){}},funds_confirmed:{checked:true}},getAttribute:name=>name==='action'?'/admin/billing/payment-proofs/42/review':null,matches:selector=>selector==='[data-proof-review]',querySelector:selector=>selector==='[data-proof-status]'?status:button,reportValidity:()=>true,addEventListener:(name,fn)=>{handlers[name]=fn;}};
 const context={document:{querySelector:()=>({content:'test-csrf'}),querySelectorAll:selector=>selector==='[data-proof-action]'?[form]:[],addEventListener(){}},window:{FitnexisLoading:{wrap:fn=>fn}},FormData:class {constructor(){return [['action','approved'],['version','2'],['message','Matched bank entry']];}},AbortSignal,JSON,confirm:()=>true,location:{reload(){reloads++;}},fetch:async(url,options)=>{calls.push({url,options});return {ok,json:async()=>ok?{message:'Saved'}:{error:'Please verify this transaction again'}};}};
 vm.runInNewContext(source,context);return {handlers,button,status,calls,reloads:()=>reloads};
}
test('review submission uses the action attribute despite a named action field and supports missing submitters',async()=>{
 const fixture=setup(false);await fixture.handlers.submit({preventDefault(){},submitter:null});
 assert.equal(fixture.calls[0].url,'/admin/billing/payment-proofs/42/review');const body=JSON.parse(fixture.calls[0].options.body);assert.equal(body.action,'approved');assert.equal(body.version,2);assert.equal(body.funds_confirmed,true);assert.equal(fixture.calls[0].options.headers['x-billing-csrf'],'test-csrf');assert.equal(fixture.button.disabled,false);assert.match(fixture.status.textContent,/verify/);assert.equal(fixture.reloads(),0);
});
test('successful review reloads the updated record and restores the submit control',async()=>{
 const fixture=setup(true);await fixture.handlers.submit({preventDefault(){},submitter:fixture.button});assert.equal(fixture.reloads(),1);assert.equal(fixture.button.disabled,false);
});
