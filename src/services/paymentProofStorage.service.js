import {randomUUID,createHash} from 'node:crypto';
import {createSupabaseAdminClient} from '../config/supabaseAdmin.js';
export const MAX_PROOF_BYTES=5*1024*1024;
export const PROOF_MIMES=['application/pdf','image/jpeg','image/png'];
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function proofFile(file) {
  const b=file?.buffer;if(!Buffer.isBuffer(b)||!b.length||b.length>MAX_PROOF_BYTES)throw fail('Choose a PDF, JPG or PNG up to 5 MB');
  let mime,ext;
  if(b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){mime='image/png';ext='png';}
  else if(b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255){mime='image/jpeg';ext='jpg';}
  else if(b.toString('ascii',0,5)==='%PDF-'&&b.subarray(Math.max(0,b.length-1024)).includes(Buffer.from('%%EOF'))){mime='application/pdf';ext='pdf';}
  else throw fail('The document contents do not match a supported PDF, JPG or PNG');
  if(mime!==file.mimetype)throw fail('The document type does not match its contents');
  const stem=String(file.originalname||'payment-proof').split(/[\\/]/).at(-1).replace(/[\x00-\x1f\x7f"<>:*?|]/g,'').replace(/\.[^.]*$/,'').replace(/^\.+/,'').slice(0,160)||'payment-proof';
  const name=stem+'.'+ext;
  return {mime,ext,file_name:name,file_size:b.length,sha256:createHash('sha256').update(b).digest('hex')};
}
export function createPaymentProofStorage({client,env=process.env}={}) {
  const storage=()=> (client||createSupabaseAdminClient({env})).storage.from(env.SUPABASE_PAYMENT_PROOF_BUCKET||'fitnexis-payment-proofs');
  function scope(gymId,userId,invoiceId){if(!/^[a-f\d-]{36}$/i.test(String(gymId))||![userId,invoiceId].every(v=>/^[1-9]\d*$/.test(String(v))))throw fail('Invalid document owner',403);return `${gymId}/${userId}/${invoiceId}/`;}
  function valid(path,g,u,i){const prefix=scope(g,u,i);if(typeof path!=='string'||!path.startsWith(prefix)||!/^[a-f\d-]{36}\.(pdf|jpg|png)$/i.test(path.slice(prefix.length)))throw fail('Document not found',404);return path;}
  return {
    async upload(file,g,u,i){const info=proofFile(file),object_path=scope(g,u,i)+randomUUID()+'.'+info.ext;try{const {error}=await storage().upload(object_path,file.buffer,{contentType:info.mime,upsert:false,cacheControl:'0'});if(error)throw error;return {...info,object_path};}catch{throw fail('Document storage is unavailable. Please try again.',503);}},
    async download(path,g,u,i){valid(path,g,u,i);try{const {data,error}=await storage().download(path);if(error||!data||data.size>MAX_PROOF_BYTES)throw error;return Buffer.from(await data.arrayBuffer());}catch{throw fail('Could not retrieve the document. Please try again.',503);}},
    async remove(path,g,u,i){valid(path,g,u,i);const {error}=await storage().remove([path]);if(error)throw fail('Could not remove the unsubmitted document',503);}
  };
}
export const paymentProofStorage=createPaymentProofStorage();
