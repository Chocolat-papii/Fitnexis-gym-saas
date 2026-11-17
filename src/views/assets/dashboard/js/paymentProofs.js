(() => {
 const loading=window.FitnexisLoading,csrf=document.querySelector('meta[name="billing-csrf"]')?.content;
 for(const form of document.querySelectorAll('[data-proof-upload]'))form.addEventListener('submit',event=>{
  event.preventDefault();if(!form.reportValidity()||form.getAttribute('aria-busy')==='true')return;
  const file=form.elements.proof.files[0],status=form.querySelector('[data-proof-status]'),progress=form.querySelector('progress');
  if(file&&file.size>5*1024*1024){status.textContent='Choose a document up to 5 MB.';return;}
  const data=new FormData(form),button=event.submitter||form.querySelector('button[type="submit"], button:not([type])'),stop=loading.start(button,{disable:true,form});
  status.setAttribute('role','status');status.textContent='Uploading your payment proof...';progress.hidden=false;progress.value=0;
  const xhr=new XMLHttpRequest();xhr.open('POST',form.getAttribute('action'));xhr.setRequestHeader('x-billing-csrf',csrf);xhr.setRequestHeader('Accept','application/json');xhr.timeout=60000;
  xhr.upload.onprogress=e=>{if(e.lengthComputable){progress.value=Math.round(e.loaded/e.total*100);status.textContent=progress.value===100?'Upload complete. Saving your submission...':'Uploading document: '+progress.value+'%';}};
  const fail=message=>{status.setAttribute('role','alert');status.textContent=message;progress.hidden=true;stop();};
  xhr.onerror=xhr.ontimeout=()=>fail('Could not confirm the submission. Refresh this page to check its status before trying again.');
  xhr.onload=()=>{let result;try{result=JSON.parse(xhr.responseText);}catch{return fail('Could not read the response. Refresh to check whether your submission was saved.');}if(xhr.status<200||xhr.status>=300)return fail(result.error||'Could not submit your proof. Please try again.');status.textContent=result.message;location.reload();};
  xhr.onloadend=()=>{if(xhr.status>=200&&xhr.status<300)stop();};xhr.send(data);
 });
 for(const form of document.querySelectorAll('[data-proof-action]')){
  if(form.matches('[data-proof-review]')){
   const sync=()=>{form.elements.funds_confirmed.required=form.elements.action.value==='approved';};form.elements.action.addEventListener('change',sync);sync();
  }
  form.addEventListener('submit',loading.wrap(async event=>{
   event.preventDefault();if(!form.reportValidity())return;
   if(form.matches('[data-proof-reverse]')&&!confirm('Reverse this accounting entry? No money will be returned. The invoice balance will be recalculated.'))return;
   const button=event.submitter||form.querySelector('button[type="submit"], button:not([type])'),status=form.querySelector('[data-proof-status]');button.disabled=true;status.setAttribute('role','status');status.textContent='Saving...';
   try{const data=Object.fromEntries(new FormData(form));if(data.version)data.version=Number(data.version);if(form.elements.funds_confirmed)data.funds_confirmed=form.elements.funds_confirmed.checked;
    const response=await fetch(form.getAttribute('action'),{method:'POST',headers:{'Content-Type':'application/json','x-billing-csrf':csrf},body:JSON.stringify(data),signal:AbortSignal.timeout(30000)});const result=await response.json();if(!response.ok)throw Error(result.error||'Could not save this action.');status.textContent=result.message;location.reload();
   }catch(error){status.setAttribute('role','alert');status.textContent=error.message;}finally{button.disabled=false;}
  }));
 }
 document.addEventListener('click',loading.wrap(async event=>{
  const link=event.target.closest('[data-proof-download]');if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button!==0)return;event.preventDefault();
  const response=await fetch(link.href,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Document unavailable');const contentType=response.headers.get('Content-Type')||'';
  if(!['application/pdf','image/jpeg','image/png'].some(type=>contentType.startsWith(type)))throw Error('Invalid document response');
  const url=URL.createObjectURL(await response.blob()),download=document.createElement('a');download.href=url;download.download=response.headers.get('Content-Disposition')?.match(/filename="?([^";]+)/i)?.[1]||'payment-proof';download.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 },{selector:'[data-proof-download]'}));
})();
