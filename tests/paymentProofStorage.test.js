import test from 'node:test';import assert from 'node:assert/strict';import {createPaymentProofStorage,proofFile,MAX_PROOF_BYTES} from '../src/services/paymentProofStorage.service.js';
const gym='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const document={buffer:Buffer.from('%PDF-1.7\nPayment fixture\n%%EOF'),mimetype:'application/pdf',originalname:'../receipt.pdf'};
test('payment document validation enforces file bytes, MIME, size and safe filenames',()=>{
 assert.equal(proofFile(document).file_name,'receipt.pdf');assert.equal(proofFile(document).sha256.length,64);
 assert.equal(proofFile({...document,originalname:'receipt.exe'}).file_name,'receipt.pdf','Download extensions follow verified content, not an executable filename');
 for(const file of [{...document,buffer:Buffer.from('<script>bad</script>')},{...document,mimetype:'image/png'},{...document,buffer:Buffer.alloc(MAX_PROOF_BYTES+1)},{...document,buffer:Buffer.from('%PDF-1.7 incomplete')},{...document,buffer:Buffer.alloc(0)}])assert.throws(()=>proofFile(file),{status:400});
 const png={buffer:Buffer.from([137,80,78,71,13,10,26,10,0]),mimetype:'image/png',originalname:'proof.png'};assert.equal(proofFile(png).mime,'image/png');
});
test('payment documents use a private owner/invoice scope and refuse cross-scope reads and deletes',async()=>{
 const calls=[];const client={storage:{from(bucket){assert.equal(bucket,'fitnexis-payment-proofs');return {upload:async(path,bytes,options)=>{calls.push({path,options});return {error:null};},download:async path=>{calls.push({path});return {data:new Blob([document.buffer]),error:null};},remove:async paths=>{calls.push({paths});return {error:null};}};}}};
 const storage=createPaymentProofStorage({client,env:{}}),saved=await storage.upload(document,gym,7,42);
 assert.ok(saved.object_path.startsWith(gym+'/7/42/'));assert.equal(calls[0].options.upsert,false);assert.equal(calls[0].options.contentType,'application/pdf');
 assert.deepEqual(await storage.download(saved.object_path,gym,7,42),document.buffer);
 const before=calls.length;for(const args of [[other,7,42],[gym,8,42],[gym,7,43]]){await assert.rejects(storage.download(saved.object_path,...args),{status:404});await assert.rejects(storage.remove(saved.object_path,...args),{status:404});}
 await assert.rejects(storage.download(gym+'/7/42/../../secret.pdf',gym,7,42),{status:404});assert.equal(calls.length,before);await storage.remove(saved.object_path,gym,7,42);
});
test('storage failures surface a safe retry message without provider details',async()=>{
 const storage=createPaymentProofStorage({env:{},client:{storage:{from:()=>({upload:async()=>{throw Error('private storage credentials');}})}}});
 await assert.rejects(storage.upload(document,gym,7,42),e=>e.status===503&&!e.message.includes('credentials'));
});
