(() => {
  const body=document.getElementById('membersTbody');if(!body)return;
  const status=document.getElementById('membersStatus'),search=document.getElementById('searchInput'),filter=document.getElementById('statusFilter');
  const previous=document.getElementById('membersPrevious'),next=document.getElementById('membersNext');
  const csrf=document.querySelector('meta[name="billing-csrf"]').content;
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date=value=>value?new Date(value).toLocaleDateString('en-ZA',{timeZone:'Africa/Johannesburg',day:'2-digit',month:'short',year:'numeric'}):'Not recorded';
  let page=1,pages=1,request=0,timer;
  async function load(wanted=1){
    const sequence=++request;status.textContent='Loading members…';status.setAttribute('role','status');
    try{
      const response=await fetch('/admin/api/members?'+new URLSearchParams({page:wanted,limit:10,search:search.value,status:filter.value}),{cache:'no-store'});
      const data=await response.json();if(sequence!==request)return;if(!response.ok)throw Error(data.message||data.error||'Could not load members.');
      page=data.page;pages=data.totalPages;
      body.innerHTML=data.members.map(m=>'<tr data-profile="/admin/member-details/'+Number(m.id)+'"><td><a class="member-name-link" href="/admin/member-details/'+Number(m.id)+'"><span class="member-avatar" aria-hidden="true">'+safe((m.firstname?.[0]||'')+(m.lastname?.[0]||''))+'</span><span><strong>'+safe(m.firstname+' '+m.lastname)+'</strong>'+(m.display_name?'<small>'+safe(m.display_name)+'</small>':'')+'</span></a></td><td><span class="d-block">'+safe(m.email)+'</span><span class="small-note">'+safe(m.phone)+'</span></td><td><span class="member-state state-'+safe(m.status)+'">'+safe(m.status==='inactive'?'Deactivated':m.status)+'</span></td><td class="text-nowrap">'+safe(date(m.joindate))+'</td><td class="text-end text-nowrap">'+(body.dataset.canCheckin==='true'?'<button class="btn btn-sm btn-outline-primary me-2" type="button" data-checkin="'+Number(m.id)+'" '+(m.status==='active'?'':'disabled')+'>Check in</button>':'')+'<a class="btn btn-sm btn-outline-secondary" href="/admin/member-details/'+Number(m.id)+'">View profile</a></td></tr>').join('');
      for(const element of document.querySelectorAll('[data-stat]'))element.textContent=Number(data.stats[element.dataset.stat]||0).toLocaleString('en-ZA');
      status.textContent=data.members.length?'':'No members match your search.';
      document.getElementById('memberCount').textContent=data.total+' member'+(data.total===1?'':'s');
      document.getElementById('membersPage').textContent='Page '+page+' of '+pages;
      previous.disabled=page<=1;next.disabled=page>=pages;
      for(const button of document.querySelectorAll('[data-filter]'))button.setAttribute('aria-pressed',String(button.dataset.filter===filter.value));
    }catch(error){if(sequence===request){status.setAttribute('role','alert');status.textContent=error.message;}}
  }
  document.getElementById('memberSearch').addEventListener('submit',event=>{event.preventDefault();clearTimeout(timer);load(1);});
  search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>load(1),250);});filter.addEventListener('change',()=>load(1));
  previous.addEventListener('click',()=>load(page-1));next.addEventListener('click',()=>load(page+1));
  for(const button of document.querySelectorAll('[data-filter]'))button.addEventListener('click',()=>{filter.value=button.dataset.filter;load(1);});
  body.addEventListener('click',async event=>{
    const checkin=event.target.closest('[data-checkin]');
    if(checkin){
      checkin.disabled=true;
      try{const response=await fetch('/admin/checkin',{method:'POST',headers:{'Content-Type':'application/json','x-billing-csrf':csrf},body:JSON.stringify({user_id:checkin.dataset.checkin})});const data=await response.json();if(!response.ok)throw Error(data.message||data.error||'Check-in failed.');status.textContent=data.message;checkin.textContent=data.ok?'Checked in':'Already checked in';}
      catch(error){status.setAttribute('role','alert');status.textContent=error.message;checkin.disabled=false;}
      return;
    }
    if(event.target.closest('a,button'))return;
    const row=event.target.closest('[data-profile]');if(row)window.location.assign(row.dataset.profile);
  });
  const dialog=document.getElementById('addMemberDialog'),form=document.getElementById('addMemberForm');
  document.getElementById('openAddMember')?.addEventListener('click',()=>{form.elements.joindate.value=new Date().toLocaleDateString('en-CA',{timeZone:'Africa/Johannesburg'});dialog.showModal();});
  for(const close of dialog.querySelectorAll('[data-close]'))close.addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',async event=>{
    event.preventDefault();const button=event.submitter,message=document.getElementById('addMemberStatus');button.disabled=true;message.textContent='Creating member…';
    try{
      const response=await fetch('/admin/api/members',{method:'POST',headers:{'Content-Type':'application/json','x-billing-csrf':csrf},body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      const data=await response.json();if(!response.ok)throw Error(data.message||'Could not create member.');window.location.assign('/admin/member-details/'+Number(data.data.id));
    }catch(error){message.textContent=error.message;}finally{button.disabled=false;}
  });
  load();
})();
