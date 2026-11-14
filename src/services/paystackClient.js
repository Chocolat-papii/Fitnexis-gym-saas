import {commercialError} from './commission.service.js';
export function paystackMode() {
  const mode=process.env.PAYSTACK_MODE||'test';
  if(!['test','live'].includes(mode))throw commercialError('Invalid Paystack mode.',503);
  return mode;
}
export function paystackKey() {
  const mode=paystackMode();
  const key=process.env[mode==='live'?'PAYSTACK_LIVE_SECRET_KEY':'PAYSTACK_TEST_SECRET_KEY']||process.env.PAYSTACK_SECRET_KEY;
  if(!key?.startsWith(`sk_${mode}_`))throw commercialError(`Paystack ${mode} credentials are not configured.`,503);
  if(mode==='live'&&process.env.PAYSTACK_LIVE_ENABLED!=='true')throw commercialError('Live payments have not been activated.',503);
  return key;
}
export async function paystackRequest(path,{method='GET',body}={}) {
  const key=paystackKey();
  let response;
  try {response=await fetch(`https://api.paystack.co${path}`,{method,headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});}
  catch {throw commercialError('Payment provider is temporarily unavailable.',502);}
  const rejected=response.status>=400&&response.status<500&&![408,429].includes(response.status);
  if(!response.ok)throw Object.assign(commercialError('Payment provider rejected the request.',502),{initializationRejected:rejected});
  let result;try{result=await response.json();}catch{throw commercialError('Invalid payment provider response.',502);}
  if(!result.status||result.data==null)throw Object.assign(commercialError('Invalid payment provider response.',502),{initializationRejected:result.status===false});
  return result.data;
}
