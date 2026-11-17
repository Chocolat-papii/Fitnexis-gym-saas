var fitnexisLoading = globalThis.FitnexisLoading || { start: () => () => {}, wrap: handler => handler };
(() => {
  const root=document.getElementById('managedMember');if(!root)return;
  const base='/admin/api/members/'+root.dataset.memberId,csrf=document.querySelector('meta[name="billing-csrf"]').content;
  const message=document.getElementById('memberActionStatus');
  async function api(path,body,method='POST'){
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','x-billing-csrf':csrf},body:JSON.stringify(body)});
    const data=await response.json();if(!response.ok)throw Object.assign(Error(data.message||data.error||'Could not save this change.'),{status:response.status});return data;
  }
  function error(target,problem){
    target.setAttribute('role','alert');target.textContent=problem.message;
    if(problem.status===428){const link=document.createElement('a');link.href='/admin/settings';link.target='_blank';link.rel='noopener';link.textContent=' Confirm your identity in gym settings, then retry.';target.appendChild(link);}
  }
  async function change(button,fn){
    if(button?.disabled)return;
    const stopLoading=fitnexisLoading.start(button);
    button.disabled=true;message.setAttribute('role','status');message.textContent='Saving…';
    try{const data=await fn();sessionStorage.setItem('fitnexis-member-message',data.message);location.reload();}catch(problem){error(message,problem);button.disabled=false;}
    finally{stopLoading();}
  }
  const saved=sessionStorage.getItem('fitnexis-member-message');if(saved){message.textContent=saved;sessionStorage.removeItem('fitnexis-member-message');}
  document.getElementById('memberProfileForm').addEventListener('submit',event=>{event.preventDefault();change(event.submitter,()=>api('',Object.fromEntries(new FormData(event.target)),'PATCH'));});
  for(const button of root.querySelectorAll('[data-account]'))button.addEventListener('click',()=>{
    const action=button.dataset.account;
    const prompt=action==='deactivate'?'Deactivate this account? Sign-in will be disabled. Records and membership billing are retained; pause membership separately if needed.':action==='suspend'?'Suspend gym access for this member? Membership billing stays unchanged.':'Restore this member’s account access?';
    if(confirm(prompt))change(button,()=>api('/account',{action}));
  });
  document.getElementById('memberPlanForm')?.addEventListener('submit',event=>{
    event.preventDefault();if(!confirm('Apply this plan from today? Existing invoices and payments stay unchanged. Future billing follows the selected plan.'))return;
    change(event.submitter,()=>api('/membership',{plan_id:event.target.elements.plan_id.value}));
  });
  for(const button of root.querySelectorAll('[data-membership]'))button.addEventListener('click',()=>{if(confirm(button.dataset.membership==='pause'?'Pause this membership and recurring invoice generation? Existing invoices remain due.':'Resume this membership from today?'))change(button,()=>api('/membership',{action:button.dataset.membership}));});
  document.getElementById('memberCheckin')?.addEventListener('click',fitnexisLoading.wrap(async event=>{
    const button=event.currentTarget;button.disabled=true;
    try{const response=await fetch('/admin/checkin',{method:'POST',headers:{'Content-Type':'application/json','x-billing-csrf':csrf},body:JSON.stringify({user_id:root.dataset.memberId})});const data=await response.json();if(!response.ok)throw Error(data.message||data.error||'Check-in failed.');message.textContent=data.message;if(data.ok)location.reload();}
    catch(problem){error(message,problem);button.disabled=false;}
  }));
  const dialog=document.getElementById('memberPasswordDialog');
  document.getElementById('openPasswordReset')?.addEventListener('click',()=>dialog.showModal());
  for(const close of dialog.querySelectorAll('[data-close]'))close.addEventListener('click',()=>dialog.close());
  document.getElementById('memberPasswordForm').addEventListener('submit',fitnexisLoading.wrap(async event=>{
    event.preventDefault();const form=event.target,button=event.submitter,status=document.getElementById('passwordResetStatus');
    if(form.elements.password.value!==form.elements.confirm_password.value){status.textContent='Passwords must match.';return;}
    button.disabled=true;status.textContent='Resetting password…';
    try{const data=await api('/password',{password:form.elements.password.value});form.reset();dialog.close();message.textContent=data.message;}
    catch(problem){error(status,problem);}finally{button.disabled=false;}
  }));
})();
