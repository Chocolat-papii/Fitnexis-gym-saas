// Keep legacy gym-admin forms on the same session-bound CSRF policy as billing.
(() => {
  const csrf=document.currentScript?.dataset.csrf;
  if(!csrf)return;
  const nativeFetch=window.fetch;
  window.fetch=(input,options={})=>{
    const request=input instanceof Request?input:null;
    const url=new URL(request?.url||input,location.href);
    const method=(options.method||request?.method||'GET').toUpperCase();
    if(url.origin===location.origin&&!['GET','HEAD','OPTIONS'].includes(method)){
      const headers=new Headers(options.headers||request?.headers);headers.set('x-billing-csrf',csrf);options={...options,headers};
    }
    return nativeFetch.call(window,input,options);
  };
})();
