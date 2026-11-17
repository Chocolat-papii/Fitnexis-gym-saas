import 'dotenv/config';
import {createSupabaseAdminClient} from '../src/config/supabaseAdmin.js';
import {MAX_PROOF_BYTES,PROOF_MIMES} from '../src/services/paymentProofStorage.service.js';
try{
 const client=createSupabaseAdminClient(),name=process.env.SUPABASE_PAYMENT_PROOF_BUCKET||'fitnexis-payment-proofs';
 const {data,error}=await client.storage.listBuckets();if(error)throw error;
 const existing=data.find(b=>b.id===name);if(existing?.public)throw Error('Choose a new private bucket for payment documents');
 const options={public:false,fileSizeLimit:MAX_PROOF_BYTES,allowedMimeTypes:PROOF_MIMES};
 const result=existing?await client.storage.updateBucket(name,options):await client.storage.createBucket(name,options);if(result.error)throw result.error;
 console.log('Private payment-proof storage ready (5 MB PDF/JPG/PNG).');
}catch(error){console.error('Payment-proof storage setup failed:',error.status||error.statusCode||error.message);process.exitCode=1;}
