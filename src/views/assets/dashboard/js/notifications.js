(() => {
 const root=document.querySelector('[data-notification-root]');if(!root)return;
 const base=root.dataset.base,csrf=root.dataset.csrf,button=root.querySelector('#bellBtn'),panel=root.querySelector('#notificationPanel'),status=root.querySelector('[data-notification-status]'),items=root.querySelector('[data-notification-items]'),badge=root.querySelector('[data-notification-count]');
 const full=document.querySelector('[data-notification-page]'),loading=window.FitnexisLoading;let page=1,inflight=null;
 async function api(path,method='GET'){const r=await fetch(base+'/notifications'+path,{method,headers:method==='POST'?{'x-billing-csrf':csrf}:undefined,cache:'no-store',signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(r.status===401?'Your session expired. Sign in again.':'Could not update notifications. Please try again.');return r.json();}
 function render(target,notifications){target.replaceChildren();if(!notifications.length){const p=document.createElement('p');p.className='notification-feedback';p.textContent='No notifications yet.';target.appendChild(p);return;}
  for(const n of notifications){const link=document.createElement('a');link.className='notification-row'+(n.read_at?'':' is-unread');link.href=n.url;link.dataset.notificationId=n.id;const text=document.createElement('p');text.textContent=n.message;const time=document.createElement('time');time.dateTime=n.created_at;time.textContent=(n.read_at?'Read - ':'Unread - ')+new Date(n.created_at).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'});link.append(text,time);target.appendChild(link);}
 }
 async function refresh(){if(inflight)return inflight;inflight=(async()=>{
  try{const data=await api('/api?page='+page+'&limit='+(full?30:20));badge.hidden=data.unread===0;badge.textContent=data.unread>99?'99+':data.unread;button.setAttribute('aria-label',data.unread?data.unread+' unread notifications':'Notifications');status.setAttribute('role','status');status.textContent=data.unread?data.unread+' unread':'';
   render(items,page===1?data.notifications.slice(0,6):(await api('/api')).notifications.slice(0,6));
   if(full){render(full.querySelector('[data-notification-page-items]'),data.notifications);full.querySelector('[data-notification-page-status]').textContent=data.total+' notifications';full.querySelector('[data-notification-page-number]').textContent='Page '+page+' of '+data.pages;full.querySelector('[data-notification-previous]').disabled=page<=1;full.querySelector('[data-notification-next]').disabled=page>=data.pages;}
  }catch(error){status.setAttribute('role','alert');status.textContent=error.message;if(full)full.querySelector('[data-notification-page-status]').textContent=error.message;}finally{inflight=null;}
 })();return inflight;}
 function close(){panel.hidden=true;button.setAttribute('aria-expanded','false');}
 button.addEventListener('click',loading.wrap(async()=>{if(!panel.hidden){close();return;}panel.hidden=false;button.setAttribute('aria-expanded','true');await refresh();}));
 document.addEventListener('click',event=>{if(!root.contains(event.target))close();});document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){close();button.focus();}});
 document.addEventListener('click',loading.wrap(async event=>{
  const all=event.target.closest('[data-note-read-all]'),note=event.target.closest('[data-notification-id]');if(!all&&!note)return;if(note&&(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey))return;
  event.preventDefault();try{await api(all?'/read-all':'/'+note.dataset.notificationId+'/read','POST');if(note)location.assign(note.href);else {if(inflight)await inflight;await refresh();}}catch(error){status.setAttribute('role','alert');status.textContent=error.message;}
 },{selector:'[data-note-read-all], [data-notification-id]'}));
 if(full){full.querySelector('[data-notification-previous]').addEventListener('click',loading.wrap(async()=>{if(page>1){page--;await refresh();}}));full.querySelector('[data-notification-next]').addEventListener('click',loading.wrap(async()=>{page++;await refresh();}));}
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refresh();});window.addEventListener('focus',()=>void refresh());setInterval(()=>{if(!document.hidden)void refresh();},30000);void refresh();
})();
