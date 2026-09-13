import test from 'node:test';
import assert from 'node:assert/strict';
import {createZhihuAuthUI} from '../src/zhihu-auth-ui.js';

const ORIGIN='https://zhihu-four-seasons.pages.dev';
const profileStatus=(authenticated=true)=>({enabled:true,authenticated,provider:'zhihu',callbackUrl:ORIGIN+'/api/auth/zhihu/callback',...(authenticated?{profile:{name:'测试知友'}}:{})});
const authorize=()=>`https://openapi.zhihu.com/authorize?${new URLSearchParams({app_id:'mock-app',response_type:'code',redirect_uri:ORIGIN+'/api/auth/zhihu/callback',state:'a'.repeat(64)})}`;
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const deferred=()=>{let resolve,reject;return {promise:new Promise((res,rej)=>{resolve=res;reject=rej;}),get resolve(){return resolve;},get reject(){return reject;}};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

function setup(t,handler=()=>json(profileStatus()),{query='',requestTimeoutMs=8000,beforeNavigate=()=>{}}={}){
  const windowImpl=new EventTarget();windowImpl.location=new URL(ORIGIN+'/'+query);windowImpl.document={visibilityState:'visible'};
  windowImpl.history={state:null,replaceState(_state,_title,path){windowImpl.location=new URL(path,ORIGIN);}};
  Object.defineProperties(windowImpl,{localStorage:{get(){throw Error('Do not touch saves');}},sessionStorage:{get(){throw Error('Do not touch credentials');}}});
  const intervals=new Map(),calls=[],rawTargets=[],notifications=[],navigations=[];let before=0,nextId=0;
  const timers={setTimeout,clearTimeout,setInterval(fn,ms){const id=++nextId;intervals.set(id,{fn,ms});return id;},clearInterval(id){intervals.delete(id);}};
  const auth=createZhihuAuthUI({windowImpl,requestTimeoutMs,timers,fetchImpl:async(target,options)=>{rawTargets.push(target);const path=new URL(target,ORIGIN).pathname;calls.push({path,options});return handler(path,options);},notify:text=>notifications.push(text),navigate:url=>navigations.push(url),beforeNavigate:()=>{before++;return beforeNavigate();}});
  t.after(()=>auth.dispose());
  return {auth,windowImpl,calls,rawTargets,notifications,navigations,intervals,get before(){return before;},tick(){for(const interval of intervals.values())interval.fn();}};
}

function fakeHost(){
  const doc={activeElement:null,createElement(tagName){return {tagName,children:[],dataset:{},attributes:{},append(...nodes){this.children.push(...nodes);},setAttribute(k,v){this.attributes[k]=v;},focus(){doc.activeElement=this;}};}};
  return {ownerDocument:doc,isConnected:true,children:[],attributes:{},classList:{add(){}},contains(node){return this.children.includes(node);},replaceChildren(...nodes){this.children=nodes;},append(...nodes){this.children.push(...nodes);},setAttribute(k,v){this.attributes[k]=v;}};
}

test('initial state is unknown and subscribers get independent immutable snapshots',async t=>{
  const run=setup(t);const states=[];const unsubscribe=run.auth.subscribe(value=>states.push(value));
  assert.deepEqual(run.auth.snapshot(),{known:false,loading:false,error:null,enabled:false,authenticated:false,profile:null,operation:null});
  assert.equal(states.length,1);assert.ok(Object.isFrozen(states[0]));
  const result=await run.auth.refresh();assert.equal(result.authenticated,true);assert.equal(result.known,true);assert.equal(result.loading,false);assert.equal(result.error,null);assert.ok(Object.isFrozen(result.profile));
  assert.throws(()=>{result.profile.name='overwrite';},TypeError);assert.equal(run.auth.getStatus().profile.name,'测试知友');
  assert.equal(states[1].loading,true);assert.equal(states.at(-1).authenticated,true);
  unsubscribe();const count=states.length;await run.auth.refresh();assert.equal(states.length,count);
});

test('every entry fresh-validates; stale cached login never grants after expiry',async t=>{
  let signedIn=true;const run=setup(t,()=>json(profileStatus(signedIn)));
  assert.equal(await run.auth.ensureAuthenticated(),true);assert.equal(await run.auth.ensureAuthenticated(),true);assert.equal(run.calls.length,2);
  signedIn=false;const anon=await run.auth.refresh();assert.equal(anon.authenticated,false);assert.deepEqual(run.navigations,[],'Passive checks must never redirect');
  assert.equal(run.auth.snapshot().profile,null);
});

test('status requests have distinct non-sensitive check values while authorization start remains query-free',async t=>{
  const run=setup(t,path=>json(path.endsWith('/start')?{authorizationUrl:authorize()}:profileStatus(false)));
  await run.auth.refresh();await run.auth.ensureAuthenticated();
  assert.equal(run.rawTargets.length,3);
  const targets=run.rawTargets.map(target=>new URL(target,ORIGIN));
  for(const target of targets.slice(0,2)){
    assert.equal(target.origin,ORIGIN);assert.equal(target.pathname,'/api/auth/status');
    assert.deepEqual([...target.searchParams.keys()],['check']);assert.equal(target.hash,'');assert.equal(target.username,'');assert.equal(target.password,'');
    assert.match(target.searchParams.get('check'),/^[0-9a-z]+-[1-9][0-9]*$/);
    assert.ok(!/token|secret|state|code|session|name|profile/i.test(target.searchParams.toString().split('=')[0]));
  }
  assert.notEqual(targets[0].searchParams.get('check'),targets[1].searchParams.get('check'));
  assert.equal(targets[0].searchParams.get('check').split('-')[1],'1');assert.equal(targets[1].searchParams.get('check').split('-')[1],'2');
  assert.equal(run.rawTargets[2],'/api/auth/zhihu/start');assert.equal(targets[2].search,'');assert.equal(run.calls[2].options.method,'POST');
});

test('anonymous user entry starts one authorization, returns false and locks repeats',async t=>{
  const run=setup(t,path=>json(path.endsWith('/start')?{authorizationUrl:authorize()}:profileStatus(false)));
  const results=await Promise.all([run.auth.ensureAuthenticated(),run.auth.ensureAuthenticated(),run.auth.ensureAuthenticated()]);
  assert.deepEqual(results,[false,false,false]);assert.deepEqual(run.calls.map(call=>call.path),['/api/auth/status','/api/auth/zhihu/start']);
  assert.equal(run.calls[1].options.method,'POST');assert.equal(run.calls[1].options.credentials,'same-origin');assert.equal(run.calls[1].options.redirect,'error');
  assert.equal(run.navigations.length,1);assert.equal(run.before,1);assert.equal(run.auth.snapshot().operation,'redirect');assert.equal(run.auth.snapshot().authenticated,false);
  assert.equal(await run.auth.ensureAuthenticated(),false);await run.auth.refresh();run.windowImpl.dispatchEvent(new Event('focus'));run.tick();await flush();assert.equal(run.calls.length,2);assert.equal(run.navigations.length,1);
});

test('failed save before navigation blocks redirect without granting access and permits explicit retry',async t=>{
  let canLeave=false;
  const run=setup(t,path=>json(path.endsWith('/start')?{authorizationUrl:authorize()}:profileStatus(false)),{beforeNavigate:()=>canLeave});
  assert.equal(await run.auth.ensureAuthenticated(),false);
  assert.equal(run.auth.snapshot().authenticated,false);assert.equal(run.auth.snapshot().error,'navigation_blocked');
  assert.equal(run.auth.snapshot().loading,false);assert.equal(run.auth.snapshot().operation,null);
  assert.equal(run.before,1);assert.deepEqual(run.navigations,[]);
  canLeave=true;
  assert.equal(await run.auth.ensureAuthenticated(),false,'A successful retry only navigates; it does not establish authentication');
  assert.equal(run.before,2);assert.equal(run.navigations.length,1);assert.equal(run.auth.snapshot().authenticated,false);
  assert.equal(run.auth.snapshot().operation,'redirect');assert.equal(run.auth.snapshot().error,null);
  assert.deepEqual(run.calls.map(call=>call.path),['/api/auth/status','/api/auth/zhihu/start','/api/auth/status','/api/auth/zhihu/start']);
});

test('HTTP failure, malformed schema and unavailable configuration fail closed without authorization',async t=>{
  for(const [id,response]of [
    ['http',()=>json({error:'mock'},503)],
    ['ambiguous-auth',()=>json({...profileStatus(),authenticated:'true'})],
    ['missing-name',()=>json({...profileStatus(),profile:{}})],
    ['bad-provider',()=>json({...profileStatus(),provider:'other'})],
    ['bad-callback',()=>json({...profileStatus(),callbackUrl:'https://elsewhere.invalid/callback'})],
    ['disabled',()=>json({enabled:false,provider:'zhihu',callbackUrl:ORIGIN+'/api/auth/zhihu/callback'})],
    ['not-json',()=>new Response('<html>not json</html>')],
  ]){
    const run=setup(t,response);assert.equal(await run.auth.ensureAuthenticated(),false,id);const state=run.auth.snapshot();assert.equal(state.known,true);assert.equal(state.loading,false);assert.equal(state.authenticated,false);assert.ok(state.error);assert.deepEqual(run.navigations,[]);assert.equal(run.calls.length,1);run.auth.dispose();
  }
});

test('status timeout clears previously validated identity and may be retried manually',async t=>{
  let slow=false;const run=setup(t,(_path,{signal})=>slow?new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true})):json(profileStatus()),{requestTimeoutMs:10});
  assert.equal(await run.auth.ensureAuthenticated(),true);slow=true;assert.equal(await run.auth.ensureAuthenticated(),false);
  assert.equal(run.auth.snapshot().error,'status_unavailable');assert.equal(run.auth.snapshot().authenticated,false);assert.equal(run.auth.snapshot().profile,null);assert.deepEqual(run.navigations,[]);
  slow=false;assert.equal(await run.auth.ensureAuthenticated(),true);
});

test('malicious start URL and rejected start preserve lock and do not navigate',async t=>{
  for(const response of [()=>json({authorizationUrl:'javascript:alert(1)'}),()=>json({authorizationUrl:'https://evil.invalid/login'}),()=>json({error:'unavailable'},503)]){
    const run=setup(t,path=>path.endsWith('/start')?response():json(profileStatus(false)));
    assert.equal(await run.auth.ensureAuthenticated(),false);assert.equal(run.auth.snapshot().error,'login_failed');assert.equal(run.auth.snapshot().authenticated,false);assert.equal(run.auth.snapshot().loading,false);
    assert.deepEqual(run.navigations,[]);assert.equal(run.before,0);assert.equal(run.notifications.some(text=>/游客|可选|不登录也能/.test(text)),false);run.auth.dispose();
  }
});

test('logout pauses immediately; a stale pending status response cannot restore identity',async t=>{
  const statusWait=deferred(),logoutWait=deferred();let checks=0;
  const run=setup(t,path=>path==='/api/auth/logout'?logoutWait.promise:++checks===1?json(profileStatus()):statusWait.promise);
  await run.auth.refresh();const pending=run.auth.refresh();const logout=run.auth.logout();assert.equal(run.auth.snapshot().authenticated,false);assert.equal(run.auth.snapshot().operation,'logout');
  statusWait.resolve(json(profileStatus()));await pending;assert.equal(run.auth.snapshot().authenticated,false);
  logoutWait.resolve(json({ok:true}));assert.equal(await logout,true);assert.equal(run.auth.snapshot().loading,false);assert.equal(run.auth.snapshot().error,null);assert.deepEqual(run.navigations,[]);
});

test('logout failure stays paused through background checks until explicit retry succeeds',async t=>{
  let fail=true,signedIn=true;
  const run=setup(t,path=>{
    if(path==='/api/auth/logout'){if(fail)return json({error:'mock'},503);signedIn=false;return json({ok:true});}
    if(path.endsWith('/start'))return json({authorizationUrl:authorize()});
    return json(profileStatus(signedIn));
  });
  await run.auth.refresh();assert.equal(await run.auth.logout(),false);assert.equal(run.auth.snapshot().authenticated,false);assert.equal(run.auth.snapshot().error,'logout_failed');const callCount=run.calls.length;
  run.tick();run.windowImpl.dispatchEvent(new Event('focus'));await run.auth.refresh();await flush();assert.equal(run.calls.length,callCount);assert.equal(run.auth.snapshot().authenticated,false);
  fail=false;assert.equal(await run.auth.ensureAuthenticated(),false);assert.deepEqual(run.calls.slice(-3).map(call=>call.path),['/api/auth/logout','/api/auth/status','/api/auth/zhihu/start']);assert.equal(run.navigations.length,1);
});

test('visible focus and 60 second interval verify expiry, hidden pages do not poll',async t=>{
  let signedIn=true;const run=setup(t,()=>json(profileStatus(signedIn)));await run.auth.refresh();assert.deepEqual([...run.intervals.values()].map(value=>value.ms),[60000]);
  run.windowImpl.document.visibilityState='hidden';run.tick();run.windowImpl.dispatchEvent(new Event('focus'));await flush();assert.equal(run.calls.length,1);
  signedIn=false;run.windowImpl.document.visibilityState='visible';run.tick();await run.auth.refresh();assert.equal(run.calls.length,2);assert.equal(run.auth.snapshot().authenticated,false);assert.deepEqual(run.navigations,[]);
});

test('BFCache return unlocks a completed redirect and validates, without another authorization',async t=>{
  let signedIn=false;const run=setup(t,path=>json(path.endsWith('/start')?{authorizationUrl:authorize()}:profileStatus(signedIn)));
  await run.auth.ensureAuthenticated();signedIn=true;const event=new Event('pageshow');Object.defineProperty(event,'persisted',{value:true});run.windowImpl.dispatchEvent(event);await run.auth.refresh();
  assert.equal(run.auth.snapshot().authenticated,true);assert.equal(run.auth.snapshot().loading,false);assert.equal(run.navigations.length,1);
});

test('callback success text never substitutes for server validation, failure mentions required login',async t=>{
  const run=setup(t,()=>json(profileStatus(false)),{query:'?auth=success&view=map'});await run.auth.refresh();assert.equal(run.auth.snapshot().authenticated,false);assert.deepEqual(run.navigations,[]);assert.equal(run.windowImpl.location.search,'?view=map');assert.match(run.notifications[0],/尚未完成/);
  const failed=setup(t,()=>json(profileStatus(false)),{query:'?auth=failed'});assert.match(failed.notifications[0],/重新登录后/);assert.equal(failed.notifications.some(text=>/游客|可选/.test(text)),false);
});

test('mount is account-only: anonymous has no second entry, authenticated profile stays plain text',async t=>{
  let signedIn=false;const run=setup(t,()=>json(signedIn?{...profileStatus(),profile:{name:'<img onerror=alert(1)>'}}:profileStatus(false))),host=fakeHost();run.auth.mount(host);
  assert.equal(host.hidden,true);assert.deepEqual(host.children,[]);await run.auth.refresh();assert.equal(host.hidden,true);assert.deepEqual(host.children,[]);
  signedIn=true;await run.auth.refresh();assert.equal(host.hidden,false);assert.equal(host.children.length,2);assert.equal(host.children[0].textContent,'知乎 · <img onerror=alert(1)>');assert.equal(host.children[1].dataset.authAction,'logout');assert.equal(host.children[1].textContent,'退出');
});

test('reentrant subscriber status reads are coalesced, and unsubscribe/dispose clear work',async t=>{
  const wait=deferred();const run=setup(t,(_path,{signal})=>{signal.addEventListener('abort',()=>wait.reject(Error('disposed')),{once:true});return wait.promise;});
  let callbackCount=0;run.auth.subscribe(state=>{callbackCount++;if(state.loading)void run.auth.refresh();});
  const pending=run.auth.refresh();assert.equal(run.calls.length,1);assert.equal(callbackCount,2);run.auth.dispose();await pending;
  assert.equal(run.intervals.size,0);assert.equal(run.auth.snapshot().authenticated,false);assert.equal(run.auth.snapshot().error,'disposed');
  run.windowImpl.dispatchEvent(new Event('focus'));assert.equal(await run.auth.ensureAuthenticated(),false);await flush();assert.equal(run.calls.length,1);assert.equal(callbackCount,2);
});
