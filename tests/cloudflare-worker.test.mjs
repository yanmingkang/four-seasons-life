import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{visitorIdentity,allowedSameOrigin,OAUTH_CALLBACK_PATH,GameService} from '../server/cloudflare-worker.mjs';
import {AUTH_SESSION_COOKIE} from '../server/zhihu-auth-routes.mjs';

const origin='https://game.example.com',secret='test-only-signing-key-not-a-real-credential-123456';
function request(path,options={}){return new Request(`${origin}${path}`,options);}
test('visitor cookies are signed, expire and use secure browser attributes',async()=>{
  const now=Date.now(),one=await visitorIdentity(request('/api/ai/status'),secret,now);
  for(const flag of ['HttpOnly','Secure','SameSite=Lax','Path=/'])assert.ok(one.cookie.includes(flag));
  const cookie=one.cookie.split(';')[0];
  const reused=await visitorIdentity(request('/api/ai/status',{headers:{Cookie:cookie}}),secret,now+1000);
  assert.equal(reused.id,one.id);assert.equal(reused.cookie,undefined);
  const tampered=await visitorIdentity(request('/api/ai/status',{headers:{Cookie:cookie.slice(0,-1)+(cookie.endsWith('0')?'1':'0')}}),secret,now+1000);
  assert.notEqual(tampered.id,one.id);
  const expired=await visitorIdentity(request('/api/ai/status',{headers:{Cookie:cookie}}),secret,now+86401000);
  assert.notEqual(expired.id,one.id);
});
test('mutations require exact same origin, not just a sibling subdomain',()=>{
  assert.equal(allowedSameOrigin(request('/api/practice',{method:'POST'}),origin),false);
  assert.equal(allowedSameOrigin(request('/api/practice',{method:'POST',headers:{Origin:origin}}),origin),true);
  assert.equal(allowedSameOrigin(request('/api/practice',{method:'POST',headers:{Origin:'https://evil.example.com'}}),origin),false);
  assert.equal(allowedSameOrigin(request('/api/experience',{headers:{'Sec-Fetch-Site':'cross-site'}}),origin),false);
});
test('the first HTML response establishes a visitor before concurrent API requests',async()=>{
  const response=await worker.fetch(request('/'),{VISITOR_SIGNING_KEY:secret,ASSETS:{fetch:async()=>new Response('<!doctype html><title>游戏</title>',{headers:{'Content-Type':'text/html'}})}});
  assert.equal(response.status,200);assert.ok(response.headers.get('Set-Cookie'));assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('edge replaces spoofed internal identities and never forwards browser credentials',async()=>{
  let forwarded;
  // This focused forwarding test supplies a verified private OAuth status;
  // zhihu-oauth-mandatory.test.mjs exercises actual persisted sessions/expiry.
  const env={PUBLIC_ORIGIN:origin,VISITOR_SIGNING_KEY:secret,ZHIHU_OAUTH_APP_ID:'test-app',ZHIHU_OAUTH_APP_KEY:'MOCK-NOT-REAL',
    ZHIHU_OAUTH_REDIRECT_URI:origin+OAUTH_CALLBACK_PATH,ZHIHU_OAUTH_REGISTERED:'true',
    GAME_SERVICE:{idFromName:name=>name,get:name=>({async fetch(req){
      if(name==='four-seasons-oauth-v1')return Response.json({enabled:true,authenticated:true});
      forwarded=req;return Response.json({mode:'fallback'});
    }})}};
  const response=await worker.fetch(request('/api/practice',{method:'POST',headers:{Origin:origin,Cookie:`${AUTH_SESSION_COOKIE}=${'a'.repeat(64)}`,'X-Game-Visitor':'forged','X-Game-Ip':'forged','Authorization':'do-not-forward','Content-Type':'application/json'},body:'{}'}),env);
  assert.equal(response.status,200);assert.match(forwarded.headers.get('X-Game-Visitor'),/^[a-f0-9]{48}$/);assert.match(forwarded.headers.get('X-Game-Ip'),/^[a-f0-9]{64}$/);
  assert.equal(forwarded.headers.get('Authorization'),null);assert.ok(response.headers.get('Set-Cookie'));
});
test('callback has a fixed path, fails closed until OAuth is implemented, and never echoes codes',async()=>{
  const status=await worker.fetch(request('/api/auth/status'),{PUBLIC_ORIGIN:origin});
  assert.deepEqual(await status.json(),{enabled:false,provider:'zhihu',callbackUrl:origin+OAUTH_CALLBACK_PATH,reason:'oauth_registration_pending'});
  const response=await worker.fetch(request(`${OAUTH_CALLBACK_PATH}?authorization_code=secret-code&state=private-state`),{});
  assert.equal(response.status,503);const html=await response.text();assert.match(html,/知乎登录尚未开放/);assert.doesNotMatch(html,/secret-code|private-state/);
  assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
});
test('fixed origin and unknown API paths do not silently fall through to the game HTML',async()=>{
  const response=await worker.fetch(request('/api/health'),{PUBLIC_ORIGIN:'https://different.example.com'});assert.equal(response.status,421);
  const missing=await worker.fetch(request('/api/missing'),{});assert.equal(missing.status,404);
  const health=await worker.fetch(request('/api/health'),{});assert.equal(health.status,200);
});
test('Durable Object bounds queued work rather than accepting unbounded simultaneous generations',async()=>{
  const object=Object.create(GameService.prototype);object.queue=Promise.resolve();object.waiting=0;
  object.scheduleCleanup=async()=>{};
  let release;const hold=new Promise(resolve=>{release=resolve;});object.service={handle:async()=>{await hold;return Response.json({ok:true});}};
  const pending=[object.fetch(request('/api/practice')),object.fetch(request('/api/practice')),object.fetch(request('/api/practice'))];
  assert.equal((await object.fetch(request('/api/practice'))).status,503);release();for(const work of pending)assert.equal((await work).status,200);assert.equal(object.waiting,0);
});
test('Durable Object alarms clean idle conversations and schedule the next expiry',async()=>{
  const object=Object.create(GameService.prototype);object.queue=Promise.resolve();
  let scheduled=null,cleared=0,cleaned=0,next=Date.now()+600000;
  object.state={storage:{setAlarm:async time=>{scheduled=time;},deleteAlarm:async()=>{cleared++;}}};
  object.service={cleanup:async()=>{cleaned++;return next;}};
  await object.alarm();assert.equal(scheduled,next);assert.equal(cleaned,1);
  next=null;await object.alarm();assert.equal(cleared,1);assert.equal(cleaned,2);
});
test('expired or cancelled queued requests never start a paid upstream call',async()=>{
  const object=Object.create(GameService.prototype);object.queue=Promise.resolve();object.waiting=0;object.maxQueueWaitMs=15;object.scheduleCleanup=async()=>{};
  let release,calls=0;const hold=new Promise(resolve=>{release=resolve;});
  object.service={handle:async()=>{calls++;await hold;return Response.json({ok:true});}};
  const active=object.fetch(request('/api/practice'));
  const queued=object.fetch(request('/api/practice'));
  assert.equal((await queued).status,503);assert.equal(calls,1);assert.equal(object.waiting,2);
  release();assert.equal((await active).status,200);await object.queue;assert.equal(calls,1);assert.equal(object.waiting,0);
  const controller=new AbortController();controller.abort();
  assert.equal((await object.fetch(request('/api/practice',{signal:controller.signal}))).status,503);assert.equal(calls,1);
});
