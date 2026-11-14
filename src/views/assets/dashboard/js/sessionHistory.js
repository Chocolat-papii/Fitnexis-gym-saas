(() => {
  const list=document.getElementById('sessionHistoryList');
  if(!list)return;
  const detail=document.getElementById('sessionHistoryDetail'),status=document.getElementById('sessionHistoryStatus');
  const previous=document.getElementById('sessionHistoryPrevious'),next=document.getElementById('sessionHistoryNext');
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const when=value=>value?new Date(value).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'Not recorded';
  const money=value=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(Number(value||0));
  const datePart=(value,options)=>new Date(value).toLocaleDateString('en-ZA',{timeZone:'Africa/Johannesburg',...options});
  const time=value=>value?new Date(value).toLocaleTimeString('en-ZA',{timeZone:'Africa/Johannesburg',hour:'2-digit',minute:'2-digit'}):'Not recorded';
  const label=value=>({booked:'Confirmed',awaiting_payment:'Awaiting payment',cancelled:'Cancelled',scheduled:'Scheduled',completed:'Completed',waitlisted:'Waitlisted'}[value]||value||'Not recorded');
  const badge=value=>'<span class="history-badge '+({completed:'is-complete',booked:'is-complete',cancelled:'is-cancelled',awaiting_payment:'is-pending'}[value]||'')+'">'+escape(label(value))+'</span>';
  const field=(name,value)=>'<div class="history-field"><dt>'+escape(name)+'</dt><dd>'+escape(value)+'</dd></div>';
  let page=1,busy=false,selection=0;
  async function api(path){
    const response=await fetch('/api/sessions/history'+path,{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw Error(response.status===401?'Your sign-in has expired. Sign in again.':'Could not load session history. Please try again.');
    return response.json();
  }
  function errorState(target,error,retry){
    target.textContent=error.message;target.setAttribute('role','alert');
    const button=document.createElement('button');button.type='button';button.className='btn btn-sm btn-outline-secondary ms-2';button.textContent='Retry';button.addEventListener('click',retry);target.appendChild(button);
  }
  async function load(requested=1){
    if(busy)return;busy=true;selection++;previous.disabled=true;next.disabled=true;
    status.setAttribute('role','status');status.textContent='Loading session history...';
    detail.hidden=true;
    try{
      const data=await api('?page='+requested);
      if(!Array.isArray(data.sessions))throw Error('Could not load session history. Please try again.');
      page=data.page;list.replaceChildren();
      for(const session of data.sessions){
        const button=document.createElement('button');button.type='button';button.className='history-item';
        button.dataset.sessionId=session.id;button.setAttribute('aria-controls','sessionHistoryDetail');button.setAttribute('aria-expanded','false');
        button.innerHTML='<strong class="history-item-name" title="'+escape(session.class_name)+'">'+escape(session.class_name)+'</strong><span class="history-item-time">'+escape(datePart(session.starts_at,{day:'2-digit',month:'short',year:'numeric'}))+'<span class="history-row-time"> &middot; '+escape(time(session.starts_at))+'</span></span><span class="history-item-meta"><span class="history-price '+(!session.is_paid?'is-free':'')+'">'+escape(session.is_paid?money(session.price):'Free')+'</span>'+badge(session.status)+'</span><span class="history-item-action" aria-hidden="true">&#8250;</span>';
        button.setAttribute('aria-label','View details: '+session.class_name+', '+when(session.starts_at));
        button.addEventListener('click',()=>show(session.id));list.appendChild(button);
      }
      status.textContent=data.sessions.length?data.sessions.length+' session'+(data.sessions.length===1?'':'s')+' on this page · Most recent first':'No session history yet. Your past sessions will appear here.';
      document.getElementById('sessionHistoryPage').textContent='Page '+page;
      previous.disabled=page<=1;next.disabled=!data.has_more;
    }catch(error){errorState(status,error,()=>load(requested));previous.disabled=page<=1;}
    finally{busy=false;}
  }
  async function show(id){
    const request=++selection;detail.hidden=false;detail.textContent='Loading session details...';detail.setAttribute('role','status');
    for(const button of list.children)button.setAttribute('aria-expanded',String(String(button.dataset.sessionId)===String(id)));
    detail.scrollIntoView({behavior:'smooth',block:'start'});detail.focus({preventScroll:true});
    try{
      const data=await api('/'+encodeURIComponent(id));if(request!==selection)return;
      const s=data.session;
      let signups='';
      if(data.can_view_signups){
        const people=s.signups||[];
        signups='<section class="history-signups"><div class="history-section-heading"><h4>Who signed up</h4><span class="history-count">'+people.length+' signup'+(people.length===1?'':'s')+'</span></div>'+(people.length?'<ul class="history-people">'+people.map(person=>'<li><span class="history-avatar" aria-hidden="true">'+escape((person.firstname?.[0]||'')+(person.lastname?.[0]||''))+'</span><span class="history-person"><strong>'+escape([person.firstname,person.lastname].filter(Boolean).join(' '))+'</strong><span>Signed up '+escape(when(person.booked_at))+'</span></span>'+badge(person.booking_status)+'</li>').join('')+'</ul>':'<p class="history-empty">No signups recorded for this session.</p>')+'</section>';
      }
      const overview='<dl class="history-overview">'+field('Date',datePart(s.starts_at,{day:'2-digit',month:'short',year:'numeric'}))+field('Time',time(s.starts_at)+(s.ends_at?' – '+time(s.ends_at):''))+field(s.is_paid?'Price per member':'Session price',s.is_paid?money(s.price):'Free')+'</dl>';
      let fields=field('Location',s.location||'Not recorded'),extra='';
      if(data.can_view_signups){
        const duration=s.ends_at?Math.round((new Date(s.ends_at)-new Date(s.starts_at))/60000)+' minutes':'Not recorded';
        fields+=field('Trainer',s.trainer_name||'Not assigned')+field('Branch',s.branch_name||'Not assigned')+field('Duration',duration)+field('Capacity',s.capacity+' places');
        extra='<details class="history-record"><summary>Booking rules & record details</summary><dl class="history-fields">'+field('Waitlist',s.waitlist_enabled?'Enabled':'Disabled')+field('Cancellation deadline',s.cancellation_deadline_hours+' hours before the session')+field('Session reference','#'+s.id)+field('Created',when(s.created_at))+field('Last updated',when(s.updated_at))+'</dl></details>';
      }else fields+=field('Your signup',label(s.my_booking_status))+field('Signed up on',when(s.booked_at));
      detail.setAttribute('role','region');
      detail.innerHTML='<header class="history-detail-heading"><div><p class="history-eyebrow">SELECTED SESSION</p><h3>'+escape(s.class_name)+'</h3><div class="history-detail-badges">'+badge(s.status)+'<span class="history-payment-label">'+(s.is_paid?'Paid session':'Free session')+'</span></div></div><button type="button" class="history-close" aria-label="Close session details">Close <span aria-hidden="true">×</span></button></header>'+signups+overview+'<section class="history-about"><h4>About this session</h4><p>'+escape(s.description||'No description available.')+'</p><dl class="history-fields">'+fields+'</dl></section>'+extra;
      detail.querySelector('.history-close').addEventListener('click',()=>{
        selection++;detail.hidden=true;
        const selected=Array.from(list.children).find(button=>String(button.dataset.sessionId)===String(id));
        selected?.setAttribute('aria-expanded','false');selected?.focus({preventScroll:true});selected?.scrollIntoView({behavior:'smooth',block:'center'});
      });
    }catch(error){if(request===selection)errorState(detail,error,()=>show(id));}
  }
  previous.addEventListener('click',()=>load(page-1));next.addEventListener('click',()=>load(page+1));
  load();
})();
