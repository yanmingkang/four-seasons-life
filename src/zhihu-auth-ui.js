const CALLBACK_PATH='/api/auth/zhihu/callback';
const AUTHORIZE_KEYS=['app_id','response_type','redirect_uri','state'];
export const ZHIHU_LOGIN_DRAFT_KEY='four-seasons-login-setup-draft-v1';
const TALENTS=['defense','ambitious','optimistic'];

// This one-use draft contains only the name and mindset already typed by the
// player. Tokens, authorization URLs and OAuth state never enter web storage.
export function saveZhihuLoginDraft(storage,setup,now=Date.now()){
  try{
    if(typeof setup?.name!=='string'||setup.name.length>16||!TALENTS.includes(setup.talent))return false;
    storage.setItem(ZHIHU_LOGIN_DRAFT_KEY,JSON.stringify({name:setup.name,talent:setup.talent,expires:now+10*60*1000}));
    return true;
  }catch{return false;}
}

export function restoreZhihuLoginDraft(storage,location,now=Date.now()){
  try{
    const raw=storage.getItem(ZHIHU_LOGIN_DRAFT_KEY);if(!raw)return null;
    if(raw.length>512){storage.removeItem(ZHIHU_LOGIN_DRAFT_KEY);return null;}
    const draft=JSON.parse(raw),valid=typeof draft?.name==='string'&&draft.name.length<=16&&TALENTS.includes(draft.talent)&&Number.isSafeInteger(draft.expires)&&draft.expires>now&&draft.expires<=now+10*60*1000;
    const auth=new URL(location.href).searchParams.getAll('auth');
    if(!valid||auth.length){storage.removeItem(ZHIHU_LOGIN_DRAFT_KEY);}
    if(!valid||auth.length!==1||!['success','failed'].includes(auth[0]))return null;
    return {name:draft.name,talent:draft.talent};
  }catch{try{storage.removeItem(ZHIHU_LOGIN_DRAFT_KEY);}catch{}return null;}
}

// Treat even a server-returned navigation target as untrusted. In particular,
// never turn the account control into a general-purpose redirect.
export function safeZhihuAuthorizationUrl(value,origin){
  if(typeof value!=='string'||value.length>4096)return null;
  try{
    const url=new URL(value),site=new URL(origin);
    if(url.protocol!=='https:'||url.hostname!=='openapi.zhihu.com'||url.port||url.username||url.password||url.pathname!=='/authorize'||url.hash)return null;
    if([...url.searchParams.keys()].some(key=>!AUTHORIZE_KEYS.includes(key)))return null;
    if(AUTHORIZE_KEYS.some(key=>url.searchParams.getAll(key).length!==1))return null;
    if(!url.searchParams.get('app_id')||url.searchParams.get('response_type')!=='code')return null;
    if(!/^[A-Za-z0-9_-]{16,256}$/.test(url.searchParams.get('state')))return null;
    if(url.searchParams.get('redirect_uri')!==site.origin+CALLBACK_PATH)return null;
    return url.href;
  }catch{return null;}
}

export function consumeZhihuAuthNotice(location,history){
  try{
    const url=new URL(location.href),values=url.searchParams.getAll('auth');
    if(!values.length)return null;
    url.searchParams.delete('auth');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    return values.length===1&&['success','failed'].includes(values[0])?values[0]:null;
  }catch{return null;}
}

// The server cookie is the sole source of account identity. Local game saves
// are intentionally never read, changed or deleted by this controller.
export function createZhihuAuthUI({fetchImpl=globalThis.fetch.bind(globalThis),windowImpl=window,notify=()=>{},beforeNavigate=()=>{},navigate=url=>windowImpl.location.assign(url),requestTimeoutMs=8000,timers=globalThis}={}){
  let status={known:false,loading:false,error:null,enabled:false,authenticated:false,profile:null,operation:null};
  let disposed=false,checking=null,ensuring=null,action=null,stateRevision=0,logoutPending=false,statusCheckSequence=0;
  let notice=consumeZhihuAuthNotice(windowImpl.location,windowImpl.history);
  const mounts=new Set(),requests=new Set(),subscribers=new Set();
  const timeoutMs=Number.isFinite(requestTimeoutMs)?Math.max(1,Math.min(30000,requestTimeoutMs)):8000;
  const say=text=>{try{notify(text);}catch{}};
  const snapshot=()=>Object.freeze({...status,profile:status.profile?Object.freeze({...status.profile}):null});
  if(notice==='failed'){say('知乎登录未完成，请重新登录后开始旅程。');notice=null;}

  async function api(path,method='GET'){
    const controller=new AbortController();requests.add(controller);
    const timeout=timers.setTimeout(()=>controller.abort(),timeoutMs);
    try{
      // Fresh status URLs avoid the repeated-URL HTTP/2 body stall reproduced
      // on the public Pages path. This counter is not OAuth state or identity,
      // is never persisted, and does not change the registered callback.
      const target=path==='/api/auth/status'?`${path}?check=${Date.now().toString(36)}-${++statusCheckSequence}`:path;
      const response=await fetchImpl(target,{method,credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json'},signal:controller.signal});
      if(!response.ok)throw new Error('auth_unavailable');
      const text=await response.text();if(text.length>8192)throw new Error('invalid_auth_response');
      const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('invalid_auth_response');
      return body;
    }finally{timers.clearTimeout(timeout);requests.delete(controller);}
  }

  function render(){
    for(const host of mounts){
      if(!host.isConnected){mounts.delete(host);continue;}
      const focused=host.contains(host.ownerDocument.activeElement)?host.ownerDocument.activeElement?.dataset.authAction:null;
      host.hidden=!status.authenticated;host.replaceChildren();host.setAttribute('aria-busy',String(status.loading));
      // The main journey action owns the only login entry. Anonymous users
      // must never receive an alternative account button in this slot.
      if(!status.authenticated)continue;
      const doc=host.ownerDocument,name=doc.createElement('span');name.className='zhihu-account-name';
      name.textContent=`知乎 · ${status.profile.name}`;name.title=name.textContent;host.append(name);
      const button=doc.createElement('button');button.type='button';button.className='zhihu-account-button';button.disabled=Boolean(action);
      button.dataset.authAction='logout';button.textContent='退出';button.setAttribute('aria-label','退出知乎账号');button.onclick=logout;host.append(button);
      if(focused==='logout'&&!action)button.focus({preventScroll:true});
    }
  }

  function publish(patch){
    status={...status,...patch};render();
    for(const listener of [...subscribers])try{listener(snapshot());}catch{}
  }

  function validatedStatus(body){
    if(typeof body.enabled!=='boolean'||body.provider!=='zhihu'||body.callbackUrl!==windowImpl.location.origin+CALLBACK_PATH)throw new Error('invalid_auth_response');
    if(!body.enabled)return {known:true,enabled:false,authenticated:false,profile:null,error:'not_configured'};
    if(typeof body.authenticated!=='boolean')throw new Error('invalid_auth_response');
    const name=typeof body.profile?.name==='string'?body.profile.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,60):'';
    if(body.authenticated&&!name)throw new Error('invalid_auth_response');
    return {known:true,enabled:true,authenticated:body.authenticated,profile:body.authenticated?{name}:null,error:null};
  }

  function refresh(){
    if(disposed||action||logoutPending)return Promise.resolve(snapshot());
    if(checking)return checking;
    const revision=stateRevision;
    let complete;
    const task=new Promise(resolve=>{complete=resolve;});checking=task;
    // Background verification keeps the last identity while loading, but
    // ensureAuthenticated always awaits its fresh result before allowing entry.
    publish({loading:true,operation:'status'});
    void (async()=>{
      try{
        const body=await api('/api/auth/status');if(disposed||revision!==stateRevision)return snapshot();
        publish({...validatedStatus(body),loading:false,operation:null});
        if(notice==='success'){say(status.authenticated?'知乎账号已连接。':'登录尚未完成，请重新登录。');notice=null;}
      }catch{
        if(disposed||revision!==stateRevision)return snapshot();
        publish({known:true,loading:false,authenticated:false,profile:null,error:'status_unavailable',operation:null});
        if(notice){say('暂时无法确认登录，请重试后开始旅程。');notice=null;}
      }finally{if(checking===task)checking=null;complete(snapshot());}
    })();
    return task;
  }

  async function beginLogin(){
    if(disposed||action||!status.known||status.error||!status.enabled||status.authenticated)return false;
    stateRevision++;action='login';publish({loading:true,error:null,authenticated:false,profile:null,operation:'login'});
    try{
      const body=await api('/api/auth/zhihu/start','POST');if(disposed)return false;
      const target=safeZhihuAuthorizationUrl(body.authorizationUrl,windowImpl.location.origin);
      if(!target)throw new Error('invalid_authorization_url');
      const canNavigate=await beforeNavigate();if(disposed)return false;
      if(canNavigate===false){action=null;publish({loading:false,operation:null,error:'navigation_blocked'});return false;}
      action='redirect';publish({loading:true,operation:'redirect'});navigate(target);return true;
    }catch{
      if(!disposed){action=null;publish({known:true,loading:false,authenticated:false,profile:null,error:'login_failed',operation:null});say('暂时无法打开知乎登录，请稍后重试。');}
      return false;
    }
    // Successful navigation remains locked until this page is replaced or
    // restored from BFCache, preventing duplicate clicks/redirect loops.
  }

  async function login(){
    if(disposed||action)return false;
    if(logoutPending&&!await logout())return false;
    const current=await refresh();
    if(disposed||current.loading||current.error||!current.enabled)return false;
    if(current.authenticated)return true;
    return beginLogin();
  }

  function ensureAuthenticated(){
    if(disposed||action)return Promise.resolve(false);
    if(ensuring)return ensuring;
    let complete;
    const task=new Promise(resolve=>{complete=resolve;});ensuring=task;
    void (async()=>{
      let allowed=false;
      try{
        if(logoutPending&&!await logout())return false;
        const current=await refresh();
        if(disposed||current.loading||current.error||!current.enabled)return false;
        if(current.authenticated){allowed=true;return;}
        // This is called only by a user's entry/resume action, never by the
        // periodic/focus checks or callback handling. A redirect is not login.
        await beginLogin();return false;
      }finally{if(ensuring===task)ensuring=null;complete(allowed);}
    })();
    return task;
  }

  async function logout(){
    if(disposed||action||(!status.authenticated&&!logoutPending))return false;
    stateRevision++;action='logout';logoutPending=true;
    // Pause immediately, even when the network fails before the server can
    // acknowledge logout. A stale status response may not restore this user.
    publish({known:true,loading:true,error:null,authenticated:false,profile:null,operation:'logout'});
    try{
      const body=await api('/api/auth/logout','POST');if(disposed)return false;
      if(body.ok!==true)throw new Error('logout_not_confirmed');
      logoutPending=false;action=null;publish({known:true,loading:false,authenticated:false,profile:null,error:null,operation:null});say('已退出知乎账号，旅程已保留。');return true;
    }catch{
      if(!disposed){action=null;publish({known:true,loading:false,authenticated:false,profile:null,error:'logout_failed',operation:null});say('旅程已暂停，退出尚未确认，请重试。');}
      return false;
    }
  }

  const visible=()=>windowImpl.document?.visibilityState!=='hidden';
  const onFocus=()=>{if(visible()&&!action&&!logoutPending)void refresh();};
  const onPageShow=event=>{if(event.persisted){if(action==='redirect'){action=null;publish({loading:false,operation:null});}onFocus();}};
  windowImpl.addEventListener('focus',onFocus);windowImpl.addEventListener('pageshow',onPageShow);
  const poll=timers.setInterval(onFocus,60000);poll?.unref?.();
  return {
    snapshot,getStatus:snapshot,refresh,ensureAuthenticated,login,logout,
    subscribe(listener){if(disposed||typeof listener!=='function')return()=>{};subscribers.add(listener);try{listener(snapshot());}catch{}return()=>subscribers.delete(listener);},
    mount(host){if(disposed||!host)return()=>{};host.classList.add('zhihu-account');mounts.add(host);render();return()=>{mounts.delete(host);host.replaceChildren();host.hidden=true;};},
    dispose(){if(disposed)return;disposed=true;stateRevision++;timers.clearInterval(poll);windowImpl.removeEventListener('focus',onFocus);windowImpl.removeEventListener('pageshow',onPageShow);for(const request of requests)request.abort();requests.clear();status={...status,known:false,loading:false,authenticated:false,profile:null,error:'disposed',operation:null};for(const host of mounts){host.replaceChildren();host.hidden=true;}mounts.clear();subscribers.clear();},
  };
}
