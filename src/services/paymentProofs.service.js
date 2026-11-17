import {db} from '../config/db.js';
import {transaction,audit,notify} from './audit.service.js';
import {amountValue,cents,billingError as fail,positiveId,manualReferenceKey,manualReceivedDate,settleManualPayment,invoiceDetail} from './billing.service.js';
import {paymentProofStorage} from './paymentProofStorage.service.js';
const idFor=value=>{const id=positiveId(value);if(!id)throw fail('Invalid record');return id;};
function text(value,max=2000){if(typeof value!=='string'||value.trim().length>max)throw fail('Check the supplied payment details');return value.trim();}
export async function memberProofPage(gymId,userId,invoiceId) {
  const data=await invoiceDetail(gymId,idFor(invoiceId),userId);
  const {rows:submissions}=await db.query('SELECT id FROM payment_submissions WHERE gym_id=$1 AND invoice_id=$2 AND user_id=$3 ORDER BY id DESC LIMIT 25',[gymId,invoiceId,userId]);
  const detail=submissions.length?await proofDetail(gymId,submissions[0].id,userId):null;
  const {rows:[settings]}=await db.query('SELECT manual_payment_instructions FROM gym_payment_settings WHERE gym_id=$1',[gymId]);
  return {...data,detail,submissions,instructions:settings?.manual_payment_instructions||''};
}
export async function proofDetail(gymId,id,userId=null) {
  const {rows:[submission]}=await db.query(`SELECT s.*,u.firstname,u.lastname,i.invoice_number FROM payment_submissions s JOIN invoices i ON i.id=s.invoice_id AND i.gym_id=s.gym_id JOIN users u ON u.id=s.user_id AND u.gym_id=s.gym_id
    WHERE s.id=$1 AND s.gym_id=$2 AND ($3::int IS NULL OR s.user_id=$3)`,[idFor(id),gymId,userId]);
  if(!submission)throw fail('Payment submission not found',404);
  const [{rows:versions},{rows:reviews},invoice]=await Promise.all([
    db.query('SELECT * FROM payment_submission_versions WHERE submission_id=$1 AND gym_id=$2 ORDER BY version DESC',[id,gymId]),
    db.query(`SELECT r.*,u.firstname,u.lastname FROM payment_submission_reviews r LEFT JOIN users u ON u.id=r.reviewed_by AND u.gym_id=r.gym_id WHERE r.submission_id=$1 AND r.gym_id=$2 ORDER BY r.id DESC`,[id,gymId]),
    invoiceDetail(gymId,submission.invoice_id,userId)
  ]);
  return {submission,versions,reviews,...invoice};
}
export async function submitPaymentProof(gymId,userId,invoiceId,input,file) {
  invoiceId=idFor(invoiceId);const amount=amountValue(input.amount),reference=text(input.reference,200),notes=text(input.notes||'');
  const paidOn=manualReceivedDate(input.paid_on),method=input.method;
  if(!['eft','cash'].includes(method)||!reference)throw fail('Choose a payment method and reference');
  const previousId=input.submission_id?idFor(input.submission_id):null,expected=Number(input.version||0);
  // Check ownership before uploading; the transaction rechecks the current balance and review state.
  await invoiceDetail(gymId,invoiceId,userId);
  let attachment,uploaded=false;
  if(file){attachment=await paymentProofStorage.upload(file,gymId,userId,invoiceId);uploaded=true;}
  else if(previousId){const old=await proofDetail(gymId,previousId,userId);if(old.submission.invoice_id!==invoiceId)throw fail('Submission does not belong to this invoice',404);attachment=old.versions[0];}
  else throw fail('Attach your payment proof or cash receipt');
  try {
    return await transaction(async client=>{
      const {rows:[invoice]}=await client.query('SELECT * FROM invoices WHERE id=$1 AND gym_id=$2 AND user_id=$3 FOR UPDATE',[invoiceId,gymId,userId]);
      if(!invoice||invoice.status==='void')throw fail('Invoice not payable',404);
      const {rows:[totals]}=await client.query("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE gym_id=$1 AND invoice_id=$2 AND status='succeeded'",[gymId,invoiceId]);
      if(cents(amount)>cents(invoice.amount)-cents(totals.total))throw fail('The amount exceeds the current invoice balance',409);
      let submission,version=1;
      if(previousId){
        const {rows:[old]}=await client.query('SELECT * FROM payment_submissions WHERE id=$1 AND gym_id=$2 AND user_id=$3 AND invoice_id=$4 FOR UPDATE',[previousId,gymId,userId,invoiceId]);
        if(!old)throw fail('Payment submission not found',404);
        if(!['rejected','info_requested'].includes(old.status)||old.version!==expected)throw fail('This submission changed. Reload before resubmitting.',409);
        if(old.method!==method)throw fail('Keep the original payment method when resubmitting');
        version=old.version+1;
        const {rows:[saved]}=await client.query("UPDATE payment_submissions SET reference_key=$2,status='pending',version=$3,updated_at=NOW() WHERE id=$1 RETURNING *",[old.id,manualReferenceKey(reference),version]);submission=saved;
      }else{
        const {rows:[saved]}=await client.query('INSERT INTO payment_submissions(gym_id,user_id,invoice_id,method,reference_key) VALUES($1,$2,$3,$4,$5) RETURNING *',[gymId,userId,invoiceId,method,manualReferenceKey(reference)]);submission=saved;
      }
      await client.query(`INSERT INTO payment_submission_versions(submission_id,gym_id,version,amount,paid_on,reference,notes,object_path,file_name,mime,file_size,sha256)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[submission.id,gymId,version,amount,paidOn,reference,notes,attachment.object_path,attachment.file_name,attachment.mime,attachment.file_size,attachment.sha256]);
      await audit(client,{scope:'gym',id:userId},previousId?'payment.proof_resubmitted':'payment.proof_submitted',gymId,String(submission.id),{invoice_id:invoiceId,version,method,amount});
      await notify(client,{gymId,audience:'billing',kind:'payment_proof_submitted',key:`proof:${submission.id}:v${version}:submitted`,message:`Payment proof for ${invoice.invoice_number} needs review.`,url:`/admin/billing/payment-proofs/${submission.id}`});
      return {id:submission.id,status:'pending',version,message:'Payment proof submitted. Your invoice stays payable until the gym confirms receipt of funds.'};
    });
  }catch(error){
    if(uploaded)try{await paymentProofStorage.remove(attachment.object_path,gymId,userId,invoiceId);}catch{console.error('Unsubmitted payment document cleanup needs retry');}
    if(error.code==='23505')throw fail('This invoice already has a submission awaiting review, or that reference is already in use.',409);
    throw error;
  }
}
export async function listPaymentProofs(gymId,{status='pending',page=1}={}) {
  page=Number(page);if(!['pending','info_requested','rejected','approved','all'].includes(status)||!Number.isSafeInteger(page)||page<1||page>10000)throw fail('Invalid review filter');
  const {rows}=await db.query(`SELECT s.id,s.invoice_id,s.method,s.status,s.version,s.updated_at,u.firstname,u.lastname,i.invoice_number,v.amount,v.paid_on,v.reference,
    COUNT(*) OVER()::int AS total FROM payment_submissions s JOIN users u ON u.id=s.user_id AND u.gym_id=s.gym_id
    JOIN invoices i ON i.id=s.invoice_id AND i.gym_id=s.gym_id JOIN payment_submission_versions v ON v.submission_id=s.id AND v.version=s.version AND v.gym_id=s.gym_id
    WHERE s.gym_id=$1 AND ($2='all' OR s.status=$2) ORDER BY s.updated_at DESC,s.id DESC LIMIT 30 OFFSET $3`,[gymId,status,(page-1)*30]);
  return {submissions:rows,status,page,hasMore:rows.length===30};
}
export async function reviewPaymentProof(gymId,adminId,id,input) {
  const action=input.action,message=text(input.message||''),version=Number(input.version);
  if(!['approved','rejected','info_requested'].includes(action)||!Number.isSafeInteger(version)||version<1||message.length<8)throw fail('Choose a decision and give a clear explanation (at least 8 characters)');
  if(action==='approved'&&input.funds_confirmed!==true)throw fail('Confirm that funds were actually received before approval');
  try{return await transaction(async client=>{
    const {rows:[target]}=await client.query('SELECT invoice_id FROM payment_submissions WHERE id=$1 AND gym_id=$2',[idFor(id),gymId]);if(!target)throw fail('Payment submission not found',404);
    // All manual settlement paths lock invoice first, then the submission/payment.
    await client.query('SELECT id FROM invoices WHERE id=$1 AND gym_id=$2 FOR UPDATE',[target.invoice_id,gymId]);
    const {rows:[submission]}=await client.query('SELECT * FROM payment_submissions WHERE id=$1 AND gym_id=$2 FOR UPDATE',[id,gymId]);
    if(submission.status!=='pending'||submission.version!==version)throw fail('This submission has already changed. Reload the review.',409);
    if(Number(submission.user_id)===Number(adminId))throw fail('You cannot review your own payment',403);
    const {rows:[proof]}=await client.query('SELECT * FROM payment_submission_versions WHERE submission_id=$1 AND gym_id=$2 AND version=$3',[id,gymId,version]);
    let payment=null;
    if(action==='approved')payment=await settleManualPayment(client,gymId,adminId,{invoice_id:submission.invoice_id,provider:submission.method,amount:proof.amount,reference:proof.reference,received_on:proof.paid_on instanceof Date?proof.paid_on.toISOString().slice(0,10):proof.paid_on,confirmation_note:message,notification:false});
    await client.query('UPDATE payment_submissions SET status=$3,payment_id=$4,updated_at=NOW() WHERE id=$1 AND gym_id=$2',[id,gymId,action,payment?.id||null]);
    await client.query('INSERT INTO payment_submission_reviews(submission_id,gym_id,version,reviewed_by,action,message) VALUES($1,$2,$3,$4,$5,$6)',[id,gymId,version,adminId,action,message]);
    await audit(client,{scope:'gym',id:adminId},'payment.proof_'+action,gymId,String(id),{invoice_id:submission.invoice_id,version,payment_id:payment?.id||null});
    await notify(client,{gymId,userId:submission.user_id,audience:'member',kind:'payment_proof_'+action,key:`proof:${id}:v${version}:${action}`,message:action==='approved'?'Your payment proof was approved and the payment was recorded.':action==='info_requested'?'Your gym needs more information about your payment.':'Your gym could not approve your payment proof. View the explanation and resubmit.',url:`/member/billing/invoices/${submission.invoice_id}/proof`});
    return {ok:true,message:action==='approved'?'Payment confirmed and receipt issued.':'Decision saved and member notified.',payment_id:payment?.id||null};
  });}catch(error){if(error.code==='23505')throw fail('This payment reference has already been recorded',409);throw error;}
}
export async function proofAttachment(gymId,id,version,userId=null) {
  const detail=await proofDetail(gymId,id,userId),file=detail.versions.find(v=>v.version===Number(version));if(!file)throw fail('Document not found',404);
  return {...file,buffer:await paymentProofStorage.download(file.object_path,gymId,detail.submission.user_id,detail.submission.invoice_id)};
}
export async function receiptDetail(gymId,paymentId,userId=null) {
  const {rows:[payment]}=await db.query(`SELECT p.*,i.invoice_number,i.user_id,u.firstname,u.lastname,r.reason AS reversal_reason FROM payments p JOIN invoices i ON i.id=p.invoice_id AND i.gym_id=p.gym_id JOIN users u ON u.id=i.user_id AND u.gym_id=i.gym_id
    LEFT JOIN manual_payment_reversals r ON r.payment_id=p.id AND r.gym_id=p.gym_id WHERE p.id=$1 AND p.gym_id=$2 AND p.provider IN ('cash','eft') AND p.status IN ('succeeded','reversed') AND ($3::int IS NULL OR i.user_id=$3)`,[idFor(paymentId),gymId,userId]);
  if(!payment)throw fail('Receipt not found',404);return payment;
}
export async function reverseManualPayment(gymId,adminId,paymentId,reason) {
  reason=text(reason);if(reason.length<8)throw fail('Give a reversal reason of at least 8 characters');
  return transaction(async client=>{
    const {rows:[target]}=await client.query("SELECT invoice_id FROM payments WHERE id=$1 AND gym_id=$2 AND provider IN ('cash','eft')",[idFor(paymentId),gymId]);if(!target)throw fail('Manual payment not found',404);
    const {rows:[invoice]}=await client.query('SELECT * FROM invoices WHERE id=$1 AND gym_id=$2 FOR UPDATE',[target.invoice_id,gymId]);
    const {rows:[payment]}=await client.query('SELECT * FROM payments WHERE id=$1 AND gym_id=$2 FOR UPDATE',[paymentId,gymId]);
    if(payment.status!=='succeeded')throw fail('Only a confirmed payment can be reversed',409);
    await client.query('INSERT INTO manual_payment_reversals(payment_id,gym_id,reversed_by,reason) VALUES($1,$2,$3,$4)',[paymentId,gymId,adminId,reason]);
    await client.query("UPDATE payments SET status='reversed' WHERE id=$1 AND gym_id=$2",[paymentId,gymId]);
    const {rows:[paid]}=await client.query("SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE invoice_id=$1 AND gym_id=$2 AND status='succeeded'",[invoice.id,gymId]);
    if(invoice.status!=='void')await client.query("UPDATE invoices SET status=$3,updated_at=NOW() WHERE id=$1 AND gym_id=$2",[invoice.id,gymId,cents(paid.total)>=cents(invoice.amount)?'paid':'due']);
    await audit(client,{scope:'gym',id:adminId},'payment.manual_reversed',gymId,String(paymentId),{invoice_id:invoice.id,reason});
    await notify(client,{gymId,userId:invoice.user_id,audience:'member',kind:'payment_reversed',key:`manual-reversed:${paymentId}`,message:'Your gym corrected a recorded payment. Review your invoice and contact the gym for details.',url:`/member/billing/receipts/${paymentId}`});
    return {ok:true,message:'Payment reversed in the accounts. No money was transferred or refunded. Review membership access separately.'};
  });
}
