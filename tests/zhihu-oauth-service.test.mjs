import test from 'node:test';
import assert from 'node:assert/strict';
import {createZhihuOAuthService,ZhihuOAuthServiceError,ZHIHU_OAUTH_STORAGE_PREFIX,ZHIHU_OAUTH_LIMITS} from '../server/zhihu-oauth-service.mjs';

const VISITOR='a'.repeat(48),OTHER='b'.repeat(48),IP='c'.repeat(64),OTHER_IP='d'.repeat(64);
const PREFIX=ZHIHU_OAUTH_STORAGE_PREFIX,MINUTE=60_000;
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const profile={id:'opaque-zhihu-account',name:'旅途测试者'};
const providerResult=()=>({profile:{...profile},expiresIn:3600});
const errorIs=(status,code)=>error=>error instanceof ZhihuOAuthServiceError&&error.status===status&&error.code===code;

// Tests alone use an in-memory stand-in. Separate service objects transact
// against the same durable view; staged writes roll back when work throws.
class MemoryStorage {
  constructor(initial=new Map()){this.data=structuredClone(initial);this.tail=Promise.resolve();this.fail=false;}
  async get(key){return structuredClone(this.data.get(key));}
  async put(key,value){this.data.set(key,structuredClone(value));}
  async delete(key){return this.data.delete(key);}
  transaction(work){
    const next=this.tail.then(async()=>{
      if(this.fail)throw new Error('PRIVATE_STORAGE_CREDENTIAL');
      const staged=structuredClone(this.data);
      const tx={get:async key=>structuredClone(staged.get(key)),put:async(key,value)=>{staged.set(key,structuredClone(value));},delete:async key=>staged.delete(key)};
      const value=await work(tx);this.data=staged;return structuredClone(value);
    });
    this.tail=next.catch(()=>{});return next;
  }
}
function setup(options={}){
  const storage=options.storage||new MemoryStorage(),clock=options.clock||{value:1_800_000_000_000},calls=[];
  const authenticate=options.authenticate||async function(code){calls.push(code);return providerResult();};
  const config={storage,now:()=>clock.value,authenticate};
  return {storage,clock,calls,service:createZhihuOAuthService(config),rebuild:()=>createZhihuOAuthService(config)};
}
async function login(env,{visitorId=VISITOR,ip=IP,sessionId,code='mock-authorization-code'}={}){
  const {state}=await env.service.start({visitorId,ip});
  return env.service.callback({visitorId,state,code,sessionId});
}
const entries=env=>[...env.storage.data.entries()].filter(([key])=>key.startsWith(PREFIX));
const sessions=env=>entries(env).filter(([key])=>key.startsWith(`${PREFIX}session:`));

test('requires shared transactions and verified visitor / hashed IP shapes before any provider call',async()=>{
  assert.throws(()=>createZhihuOAuthService(),/transactional storage/i);
  assert.throws(()=>createZhihuOAuthService({storage:{get(){},put(){},delete(){}}}),/transactional storage/i);
  const env=setup();
  for(const visitorId of [undefined,'','unsigned-browser-id','a'.repeat(47),'G'.repeat(48)]){
    await assert.rejects(env.service.start({visitorId,ip:IP}),errorIs(401,'invalid_visitor'));
    await assert.rejects(env.service.logout({visitorId}),errorIs(401,'invalid_visitor'));
  }
  for(const ip of [undefined,'127.0.0.1','a'.repeat(63)])await assert.rejects(env.service.start({visitorId:VISITOR,ip}),errorIs(401,'invalid_visitor'));
  assert.equal(env.calls.length,0);assert.equal(env.storage.data.size,0);
});

test('state and session are independent random 32-byte opaque values; public status contains only name',async()=>{
  const env=setup(),{state}=await env.service.start({visitorId:VISITOR,ip:IP});
  assert.match(state,/^[a-f0-9]{64}$/);
  const session=await env.service.callback({visitorId:VISITOR,state,code:'mock-code'});
  assert.deepEqual(Object.keys(session).sort(),['expiresIn','sessionId']);
  assert.match(session.sessionId,/^[a-f0-9]{64}$/);assert.notEqual(session.sessionId,state);assert.equal(session.expiresIn,3600);
  assert.deepEqual(await env.service.status(session),{authenticated:true,profile:{name:profile.name}});
  assert.equal(env.calls.length,1);
  const stored=JSON.stringify([...env.storage.data]);
  assert.ok(!stored.includes(state));assert.ok(!stored.includes(session.sessionId));assert.ok(!stored.includes('mock-code'));
});

test('missing, malformed, wrong-browser, unknown, consumed states reject without invoking provider',async()=>{
  const env=setup(),{state}=await env.service.start({visitorId:VISITOR,ip:IP});
  for(const invalid of [undefined,'','abc','f'.repeat(64)])await assert.rejects(env.service.callback({visitorId:VISITOR,state:invalid,code:'code'}),errorIs(400,'invalid_state'));
  await assert.rejects(env.service.callback({visitorId:OTHER,state,code:'code'}),errorIs(400,'invalid_state'));
  assert.equal(env.calls.length,0);
  const result=await env.service.callback({visitorId:VISITOR,state,code:'code'});
  assert.equal((await env.service.status(result)).authenticated,true);
  await assert.rejects(env.rebuild().callback({visitorId:VISITOR,state,code:'replay-code'}),errorIs(400,'invalid_state'));
  assert.equal(env.calls.length,1);
});

test('newest login request replaces older state, with no seed selection or old request revival',async()=>{
  const env=setup(),first=await env.service.start({visitorId:VISITOR,ip:IP}),second=await env.rebuild().start({visitorId:VISITOR,ip:IP});
  assert.notEqual(first.state,second.state);
  await assert.rejects(env.service.callback({visitorId:VISITOR,state:first.state,code:'old'}),errorIs(400,'invalid_state'));
  assert.equal(env.calls.length,0);
  await env.rebuild().callback({visitorId:VISITOR,state:second.state,code:'new'});
  assert.deepEqual(env.calls,['new']);
});

test('two simultaneous callbacks across service instances consume state atomically before provider',async()=>{
  const gate=deferred(),entered=deferred();let calls=0;
  const env=setup({authenticate:async()=>{calls++;entered.resolve();await gate.promise;return providerResult();}});
  const request={visitorId:VISITOR,...await env.service.start({visitorId:VISITOR,ip:IP}),code:'code'};
  const first=env.service.callback(request);await entered.promise;
  await assert.rejects(env.rebuild().callback(request),errorIs(400,'invalid_state'));
  assert.equal(calls,1);
  const pending=sessions(env);assert.equal(pending.length,1);assert.equal(pending[0][1].phase,'pending');
  gate.resolve();const session=await first;
  assert.equal((await env.rebuild().status(session)).authenticated,true);assert.equal(calls,1);
});

test('pending state, active session, and logout survive service reconstruction over the same storage',async()=>{
  const env=setup(),state=await env.service.start({visitorId:VISITOR,ip:IP});
  const session=await env.rebuild().callback({visitorId:VISITOR,...state,code:'code'});
  assert.equal((await env.rebuild().status(session)).authenticated,true);
  assert.deepEqual(await env.rebuild().logout({visitorId:VISITOR,...session}),{authenticated:false});
  assert.deepEqual(await env.rebuild().status(session),{authenticated:false});
  assert.equal(sessions(env).length,0);
});

test('logout during upstream exchange prevents its late completion from creating a new session',async()=>{
  const gate=deferred(),entered=deferred();
  const env=setup({authenticate:async()=>{entered.resolve();await gate.promise;return providerResult();}});
  const state=await env.service.start({visitorId:VISITOR,ip:IP});
  const callback=env.service.callback({visitorId:VISITOR,...state,code:'code'});await entered.promise;
  await env.rebuild().logout({visitorId:VISITOR});
  assert.equal(sessions(env).length,0);
  gate.resolve();await assert.rejects(callback,errorIs(409,'login_cancelled'));
  assert.equal(sessions(env).length,0);assert.equal(await env.storage.get(`${PREFIX}visitor:${VISITOR}`),undefined);
});

test('new start while old exchange is in flight cannot let the older completion overwrite the newer session',async()=>{
  const gate=deferred(),entered=deferred();
  const env=setup({authenticate:async code=>{if(code==='old'){entered.resolve();await gate.promise;}return providerResult();}});
  const firstState=await env.service.start({visitorId:VISITOR,ip:IP});
  const old=env.service.callback({visitorId:VISITOR,...firstState,code:'old'});await entered.promise;
  const freshState=await env.rebuild().start({visitorId:VISITOR,ip:IP});
  const fresh=await env.rebuild().callback({visitorId:VISITOR,...freshState,code:'fresh'});
  gate.resolve();await assert.rejects(old,errorIs(409,'login_cancelled'));
  assert.equal((await env.service.status(fresh)).authenticated,true);assert.equal(sessions(env).length,1);
});

test('logout followed by a new login uses a different generation and rejects a pre-logout inflight result',async()=>{
  const gate=deferred(),entered=deferred();
  const env=setup({authenticate:async code=>{if(code==='before-logout'){entered.resolve();await gate.promise;}return providerResult();}});
  const original=await env.service.start({visitorId:VISITOR,ip:IP});
  const inflight=env.service.callback({visitorId:VISITOR,...original,code:'before-logout'});await entered.promise;
  await env.rebuild().logout({visitorId:VISITOR});
  const current=await login(env,{code:'after-logout'});
  gate.resolve();await assert.rejects(inflight,errorIs(409,'login_cancelled'));
  assert.equal((await env.rebuild().status(current)).authenticated,true);assert.equal(sessions(env).length,1);
});

test('successful replacement rotates session ID and revokes previous session only after upstream success',async()=>{
  const gate=deferred(),entered=deferred();
  const env=setup({authenticate:async code=>{if(code==='replacement'){entered.resolve();await gate.promise;}return providerResult();}});
  const original=await login(env),request=await env.service.start({visitorId:VISITOR,ip:IP});
  const replacement=env.service.callback({visitorId:VISITOR,...request,code:'replacement',sessionId:original.sessionId});await entered.promise;
  assert.equal((await env.rebuild().status(original)).authenticated,true);
  gate.resolve();const next=await replacement;
  assert.notEqual(next.sessionId,original.sessionId);
  assert.deepEqual(await env.service.status(original),{authenticated:false});
  assert.equal((await env.service.status(next)).authenticated,true);assert.equal(sessions(env).length,1);
});

test('failed replacement consumes state and preserves previous authenticated session without leaking upstream errors',async()=>{
  const env=setup({authenticate:async code=>{if(code==='failure')throw new Error('PRIVATE_PROVIDER_ACCESS_TOKEN');return providerResult();}});
  const old=await login(env),state=await env.service.start({visitorId:VISITOR,ip:IP});
  await assert.rejects(env.service.callback({visitorId:VISITOR,...state,code:'failure',sessionId:old.sessionId}),error=>{
    assert.equal(error.code,'authentication_failed');assert.equal(error.status,502);
    assert.doesNotMatch(JSON.stringify(error)+String(error.stack),/PRIVATE_/);return true;
  });
  assert.equal((await env.rebuild().status(old)).authenticated,true);assert.equal(sessions(env).length,1);
  await assert.rejects(env.service.callback({visitorId:VISITOR,...state,code:'replay'}),errorIs(400,'invalid_state'));
});

test('rotation cannot revoke a different visitor session; logout explicitly revokes a possessed account cookie',async()=>{
  const env=setup(),other=await login(env,{visitorId:OTHER,ip:OTHER_IP});
  const own=await login(env,{sessionId:other.sessionId});
  assert.equal((await env.service.status(other)).authenticated,true);
  await env.service.logout({visitorId:VISITOR,sessionId:other.sessionId});
  assert.deepEqual(await env.service.status(other),{authenticated:false});
  assert.deepEqual(await env.service.status(own),{authenticated:false});
});

test('fresh visitor cookie plus valid account cookie revokes its owner and cancels pending owner login',async()=>{
  const env=setup(),session=await login(env),pending=await env.service.start({visitorId:VISITOR,ip:IP});
  await env.rebuild().logout({visitorId:OTHER,sessionId:session.sessionId});
  assert.deepEqual(await env.service.status(session),{authenticated:false});
  await assert.rejects(env.service.callback({visitorId:VISITOR,...pending,code:'late'}),errorIs(400,'invalid_state'));
  assert.equal(sessions(env).length,0);assert.equal(await env.storage.get(`${PREFIX}visitor:${VISITOR}`),undefined);
});

test('logout with a rotated visitor cookie also cancels the account owner replacement already exchanging upstream',async()=>{
  const gate=deferred(),entered=deferred();
  const env=setup({authenticate:async code=>{if(code==='replacement'){entered.resolve();await gate.promise;}return providerResult();}});
  const account=await login(env),state=await env.service.start({visitorId:VISITOR,ip:IP});
  const replacing=env.service.callback({visitorId:VISITOR,...state,code:'replacement',sessionId:account.sessionId});await entered.promise;
  await env.rebuild().logout({visitorId:OTHER,sessionId:account.sessionId});
  gate.resolve();await assert.rejects(replacing,errorIs(409,'login_cancelled'));
  assert.deepEqual(await env.service.status(account),{authenticated:false});assert.equal(sessions(env).length,0);
});

test('unknown session ID cannot be used to log out another visitor or cancel their pending login',async()=>{
  const env=setup(),session=await login(env),pending=await env.service.start({visitorId:VISITOR,ip:IP});
  await env.service.logout({visitorId:OTHER,sessionId:'0'.repeat(64)});
  assert.equal((await env.service.status(session)).authenticated,true);
  const next=await env.service.callback({visitorId:VISITOR,...pending,code:'valid'});
  assert.equal((await env.service.status(next)).authenticated,true);
});

test('ten-minute state expiry includes the exact deadline, and an exchange cannot complete after its ticket expires',async()=>{
  const expired=setup(),state=await expired.service.start({visitorId:VISITOR,ip:IP});
  expired.clock.value+=10*MINUTE;
  await assert.rejects(expired.service.callback({visitorId:VISITOR,...state,code:'expired'}),errorIs(400,'invalid_state'));assert.equal(expired.calls.length,0);
  assert.equal(await expired.service.cleanup(),null);assert.equal(entries(expired).length,0);
  const gate=deferred(),entered=deferred(),env=setup({authenticate:async()=>{entered.resolve();await gate.promise;return providerResult();}});
  const request=await env.service.start({visitorId:VISITOR,ip:IP});
  env.clock.value+=10*MINUTE-1;
  const callback=env.service.callback({visitorId:VISITOR,...request,code:'slow'});await entered.promise;
  env.clock.value++;gate.resolve();await assert.rejects(callback,errorIs(409,'login_cancelled'));
  assert.equal(await env.rebuild().cleanup(),null);assert.equal(entries(env).length,0);
});

test('session lifetime cannot exceed provider lifetime or one hour and expiry deletes account records',async()=>{
  for(const [provided,expected] of [[12.9,12],[1800,1800],[3600,3600],[86400,3600]]){
    const env=setup({authenticate:async()=>({...providerResult(),expiresIn:provided})});
    const start=env.clock.value,session=await login(env);assert.equal(session.expiresIn,expected);
    env.clock.value=start+expected*1000-1;assert.equal((await env.service.status(session)).authenticated,true);
    env.clock.value++;assert.deepEqual(await env.rebuild().status(session),{authenticated:false});
    assert.equal(sessions(env).length,0);assert.equal(await env.storage.get(`${PREFIX}visitor:${VISITOR}`),undefined);
    env.clock.value=Math.max(env.clock.value,start+10*MINUTE);assert.equal(await env.service.cleanup(),null);
  }
});

test('slow profile retrieval is subtracted before issuing a session and already-expired provider lifetimes are rejected',async()=>{
  const clock={value:1_800_000_000_000},initial=clock.value;
  const env=setup({clock,authenticate:async()=>{clock.value+=5500;return {...providerResult(),expiresIn:30};}});
  const session=await login(env);assert.equal(session.expiresIn,24);
  assert.equal(sessions(env)[0][1].expiresAt,initial+29_500);
  clock.value=initial+30_000;assert.deepEqual(await env.service.status(session),{authenticated:false});
  const expiredClock={value:1_800_000_000_000};
  const expired=setup({clock:expiredClock,authenticate:async()=>{expiredClock.value+=30_000;return {...providerResult(),expiresIn:30};}});
  await assert.rejects(login(expired),errorIs(502,'invalid_session_lifetime'));assert.equal(sessions(expired).length,0);
});

test('invalid profiles and lifetimes cannot create sessions or persist any raw provider fields',async()=>{
  const invalidProfiles=[undefined,null,{}, {id:1,name:'name'}, {id:'',name:'name'}, {id:'valid',name:' '},
    {id:'a'.repeat(257),name:'name'},{id:'valid',name:'a'.repeat(129)},{id:'valid',name:'line\nbreak'}];
  for(const invalid of invalidProfiles){
    const env=setup({authenticate:async()=>({profile:invalid,expiresIn:3600,access_token:'PRIVATE_TOKEN'})});
    await assert.rejects(login(env),errorIs(502,'invalid_profile'));assert.equal(sessions(env).length,0);
    assert.doesNotMatch(JSON.stringify([...env.storage.data]),/PRIVATE_TOKEN/);
  }
  for(const expiresIn of [undefined,null,0,-1,.5,'3600',NaN,Infinity]){
    const env=setup({authenticate:async()=>({...providerResult(),expiresIn})});
    await assert.rejects(login(env),errorIs(502,'invalid_session_lifetime'));assert.equal(sessions(env).length,0);
  }
});

test('only minimal id/name are persisted; browser return/status never include provider IDs, tokens or contact fields',async()=>{
  const env=setup({authenticate:async()=>({profile:{...profile,email:'PRIVATE_EMAIL',phone:'PRIVATE_PHONE',avatar:'PRIVATE_AVATAR',access_token:'PRIVATE_PROFILE_TOKEN'},
    expiresIn:3600,access_token:'PRIVATE_ACCESS_TOKEN',refresh_token:'PRIVATE_REFRESH_TOKEN',app_key:'PRIVATE_APP_KEY'})});
  const session=await login(env),status=await env.service.status(session),stored=JSON.stringify([...env.storage.data]),browser=JSON.stringify({session,status});
  assert.doesNotMatch(stored+browser,/PRIVATE_/);assert.ok(stored.includes(profile.id));assert.ok(!browser.includes(profile.id));
  assert.deepEqual(sessions(env)[0][1].profile,profile);
  assert.deepEqual(await env.service.status({sessionId:'not-a-cookie'}),{authenticated:false});
  assert.deepEqual(await env.service.status(),{authenticated:false});
});

test('visitor and hashed-IP sliding rate limits are persistent, atomic, and cannot be reset by logout',async()=>{
  const env=setup();
  const attempts=await Promise.allSettled(Array.from({length:6},()=>env.rebuild().start({visitorId:VISITOR,ip:IP})));
  assert.equal(attempts.filter(result=>result.status==='fulfilled').length,5);
  assert.equal(attempts.filter(result=>result.status==='rejected'&&result.reason.code==='rate_limited').length,1);
  await env.service.logout({visitorId:VISITOR});
  await assert.rejects(env.rebuild().start({visitorId:VISITOR,ip:OTHER_IP}),errorIs(429,'rate_limited'));
  await env.rebuild().start({visitorId:OTHER,ip:IP});
  const deadline=env.clock.value+10*MINUTE;assert.equal(await env.service.cleanup(),deadline);
  env.clock.value=deadline-1;await assert.rejects(env.service.start({visitorId:VISITOR,ip:IP}),errorIs(429,'rate_limited'));
  env.clock.value++;await env.service.start({visitorId:VISITOR,ip:IP});assert.equal(env.calls.length,0);
});

test('shared Wi-Fi permits thirty distinct visitors per ten minutes and rejects the thirty-first atomically',async()=>{
  const env=setup();
  const attempts=await Promise.allSettled(Array.from({length:31},(_,index)=>env.rebuild().start({visitorId:(index+1).toString(16).padStart(48,'0'),ip:IP})));
  assert.equal(attempts.slice(0,6).every(result=>result.status==='fulfilled'),true);
  assert.equal(attempts.filter(result=>result.status==='fulfilled').length,30);
  assert.equal(attempts.filter(result=>result.status==='rejected'&&result.reason.code==='rate_limited').length,1);
  await assert.rejects(env.rebuild().start({visitorId:VISITOR,ip:IP}),errorIs(429,'rate_limited'));
  env.clock.value+=10*MINUTE;await env.rebuild().start({visitorId:VISITOR,ip:IP});
  assert.equal(env.calls.length,0);
});

test('rate window is sliding across start times instead of resetting all five starts at a clock bucket boundary',async()=>{
  const env=setup(),initial=env.clock.value;
  for(let i=0;i<5;i++){env.clock.value=initial+i*2*MINUTE;await env.service.start({visitorId:VISITOR,ip:IP});}
  env.clock.value=initial+10*MINUTE;await env.rebuild().start({visitorId:VISITOR,ip:IP});
  env.clock.value=initial+11*MINUTE;await assert.rejects(env.service.start({visitorId:VISITOR,ip:IP}),errorIs(429,'rate_limited'));
  env.clock.value=initial+12*MINUTE;await env.service.start({visitorId:VISITOR,ip:IP});
  assert.equal(env.calls.length,0);
});

test('global storage cap includes the expiry index and rejects callback before provider if it cannot reserve a session',async()=>{
  const env=setup(),requests=[];
  for(let i=0;i<682;i++){
    const visitorId=(i+1).toString(16).padStart(48,'0'),ip=(i+1).toString(16).padStart(64,'0');
    requests.push({visitorId,...await env.service.start({visitorId,ip}),code:'capacity-test'});
  }
  assert.equal(entries(env).length,2047);
  await env.service.callback(requests[0]);assert.equal(entries(env).length,ZHIHU_OAUTH_LIMITS.maxStorageEntries);
  const before=structuredClone(env.storage.data);
  await assert.rejects(env.rebuild().callback(requests[1]),errorIs(503,'capacity'));
  assert.equal(env.calls.length,1);assert.deepEqual(env.storage.data,before,'capacity failure rolls back state consumption');
  await assert.rejects(env.service.start({visitorId:VISITOR,ip:IP}),errorIs(503,'capacity'));
  assert.deepEqual(env.storage.data,before);assert.ok(entries(env).length<=2048);
});

test('cleanup schedules earliest TTL, removes idle records and never touches the cloud game namespace',async()=>{
  const env=setup();await env.storage.put('cloud-game:v1:unrelated',{private:'existing-game'});
  const initial=env.clock.value;assert.equal(await env.service.cleanup(),null);
  await login(env);assert.equal(await env.service.cleanup(),initial+10*MINUTE);
  env.clock.value+=10*MINUTE;assert.equal(await env.rebuild().cleanup(),initial+60*MINUTE);
  env.clock.value+=50*MINUTE;assert.equal(await env.service.cleanup(),null);
  assert.deepEqual([...env.storage.data],[['cloud-game:v1:unrelated',{private:'existing-game'}]]);
});

test('storage failures expose fixed service errors; unconfigured service permits guest status/logout without networking',async()=>{
  const env=setup();env.storage.fail=true;
  await assert.rejects(env.service.start({visitorId:VISITOR,ip:IP}),error=>{
    assert.equal(error.code,'storage_unavailable');assert.equal(error.status,503);assert.doesNotMatch(String(error.stack)+JSON.stringify(error),/PRIVATE_/);return true;
  });
  const service=createZhihuOAuthService({storage:new MemoryStorage()});
  assert.deepEqual(await service.status(),{authenticated:false});
  assert.deepEqual(await service.logout({visitorId:VISITOR}),{authenticated:false});
  await assert.rejects(service.start({visitorId:VISITOR,ip:IP}),errorIs(503,'authentication_unavailable'));
  assert.equal(await service.cleanup(),null);
});
