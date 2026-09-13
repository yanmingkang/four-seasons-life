import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{GameService,visitorIdentity} from '../server/cloudflare-worker.mjs';
import {createZhihuAuthRoutes,oauthConfiguration,AUTH_SESSION_COOKIE,readAuthSession} from '../server/zhihu-auth-routes.mjs';
import pages from '../server/pages-entry.mjs';

const origin='https://zhihu-four-seasons.pages.dev',path='/api/auth/zhihu/callback';
const env={PUBLIC_ORIGIN:origin,ZHIHU_OAUTH_APP_ID:'mock-app',ZHIHU_OAUTH_APP_KEY:'MOCK-APP-KEY-NOT-REAL',
  ZHIHU_OAUTH_REDIRECT_URI:origin+path,ZHIHU_OAUTH_REGISTERED:'true',VISITOR_SIGNING_KEY:'mock-visitor-signing-secret-not-real-12345678'};
const req=(p,options={})=>new Request(origin+p,options);
const post=(p,cookie='')=>req(p,{method:'POST',headers:{Origin:origin,Cookie:cookie}});
class Storage{
  constructor(){this.data=new Map();this.tail=Promise.resolve();this.alarm=null;}
  async get(k){return structuredClone(this.data.get(k));}
  async put(k,v){this.data.set(k,structuredClone(v));}
  async delete(k){return this.data.delete(k);}
  async setAlarm(value){this.alarm=value;}
  async deleteAlarm(){this.alarm=null;}
  transaction(fn){const work=this.tail.then(async()=>{
    const data=structuredClone(this.data);
    const result=await fn({get:async k=>structuredClone(data.get(k)),put:async(k,v)=>data.set(k,structuredClone(v)),delete:async k=>data.delete(k)});
    this.data=data;return result;
  });this.tail=work.catch(()=>{});return work;}
}
function setup(){
  const storage=new Storage(),calls=[],objects=[],forwarded=[];let time=Date.now();
  const auth=createZhihuAuthRoutes({storage,env,now:()=>time,authenticate:async code=>{
    calls.push(code);return {profile:{id:'969570047710216200',name:'测试旅人'},expiresIn:3600};
  }});
  const binding={idFromName:name=>name,get:name=>{objects.push(name);return {fetch:r=>{
    forwarded.push(r);return name==='four-seasons-oauth-v1'?auth.handle(r):Response.json({ok:true});
  }};}};
  const config={...env,GAME_SERVICE:binding};
  const send=r=>worker.fetch(r,config);
  return {storage,calls,objects,forwarded,auth,config,send,setTime:value=>{time=value;}};
}
function cookies(response){return response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');}
async function begin(t){
  const response=await t.send(post('/api/auth/zhihu/start'));
  assert.equal(response.status,200);const {authorizationUrl}=await response.json(),url=new URL(authorizationUrl);
  return {state:url.searchParams.get('state'),cookie:cookies(response),url};
}

test('OAuth is gated by credentials, explicit registration and exact public HTTPS callback',()=>{
  assert.equal(oauthConfiguration(env).enabled,true);
  for(const patch of [{ZHIHU_OAUTH_APP_ID:''},{ZHIHU_OAUTH_APP_KEY:''},{ZHIHU_OAUTH_REGISTERED:'false'},
    {ZHIHU_OAUTH_REDIRECT_URI:origin+path+'/'},{PUBLIC_ORIGIN:'http://localhost'},{PUBLIC_ORIGIN:origin+'/'},
    {ZHIHU_OAUTH_REDIRECT_URI:origin+path+'?other=1'},{ZHIHU_OAUTH_APP_KEY:'bad\nkey'}])assert.equal(oauthConfiguration({...env,...patch}).enabled,false);
  assert.equal(oauthConfiguration({PUBLIC_ORIGIN:origin,ZHIHU_ACCESS_SECRET:'not-an-app-key'}).enabled,false);
});
test('public edge carries a browser-bound state, sets opaque session, returns only nickname, logs out',async()=>{
  const t=setup(),start=await begin(t);
  assert.equal(start.url.origin,'https://openapi.zhihu.com');assert.equal(start.url.pathname,'/authorize');
  assert.equal(start.url.searchParams.get('redirect_uri'),origin+path);assert.equal(start.url.searchParams.get('app_key'),null);
  assert.equal(t.objects[0],'four-seasons-oauth-v1');
  assert.match(start.cookie,/__Host-four-seasons-visitor=/);
  const done=await t.send(req(`${path}?authorization_code=mock-once&state=${start.state}`,{headers:{Cookie:start.cookie,'Sec-Fetch-Site':'cross-site'}}));
  assert.equal(done.status,303);assert.equal(done.headers.get('Location'),'/?auth=success');assert.deepEqual(t.calls,['mock-once']);
  const session=done.headers.get('Set-Cookie');assert.match(session,/HttpOnly; Secure; SameSite=Lax; Max-Age=3600/);
  const jar=start.cookie+'; '+cookies(done);
  const status=await t.send(req('/api/auth/status',{headers:{Cookie:jar}}));
  assert.deepEqual(await status.json(),{enabled:true,provider:'zhihu',callbackUrl:origin+path,authenticated:true,profile:{name:'测试旅人'}});
  const out=await t.send(post('/api/auth/logout',jar));assert.equal(out.status,200);assert.match(out.headers.get('Set-Cookie'),/Max-Age=0/);
  assert.equal((await (await t.send(req('/api/auth/status',{headers:{Cookie:jar}}))).json()).authenticated,false);
  assert.doesNotMatch(JSON.stringify([...t.storage.data]),/mock-once|MOCK-APP-KEY/);
});
test('missing, duplicate, cross-browser, expired and replay callbacks never create a session',async()=>{
  const t=setup(),start=await begin(t);
  const invalid=[`?authorization_code=x`,`?authorization_code=x&state=bad`,
    `?authorization_code=x&state=${start.state}&state=${start.state}`,
    `?authorization_code=x&code=y&state=${start.state}`,`?error=denied&state=${start.state}`,
    `?authorization_code=x&authorization_code=y&state=${start.state}`];
  for(const query of invalid){const res=await t.send(req(path+query,{headers:{Cookie:start.cookie}}));assert.ok(res.status>=400);assert.doesNotMatch(await res.text(),/state=|authorization_code=/);}
  const stolen=await t.send(req(`${path}?code=x&state=${start.state}`));assert.ok(stolen.status>=400);assert.equal(t.calls.length,0);
  const good=await t.send(req(`${path}?code=x&state=${start.state}`,{headers:{Cookie:start.cookie}}));assert.equal(good.status,303);
  const replay=await t.send(req(`${path}?code=x&state=${start.state}`,{headers:{Cookie:start.cookie}}));assert.ok(replay.status>=400);assert.equal(t.calls.length,1);
  const next=await begin(t);t.setTime(Date.now()+11*60*1000);
  const expired=await t.send(req(`${path}?code=x&state=${next.state}`,{headers:{Cookie:next.cookie}}));assert.ok(expired.status>=400);assert.equal(t.calls.length,1);
});
test('OAuth mutating routes reject CSRF, wrong method and alternate host',async()=>{
  const t=setup();
  for(const p of ['/api/auth/zhihu/start','/api/auth/logout']){
    assert.equal((await t.send(req(p,{method:'POST'}))).status,403);
    assert.equal((await t.send(req(p,{method:'POST',headers:{Origin:'https://evil.example'}}))).status,403);
    assert.equal((await t.send(req(p))).status,405);
  }
  assert.equal((await t.send(req('/api/auth/status',{headers:{'Sec-Fetch-Site':'cross-site'}}))).status,403);
  assert.equal((await t.send(new Request('https://other.example/api/auth/status'))).status,421);
  assert.equal(t.calls.length,0);
});
test('edge never trusts a spoofed auth session header or forwards OAuth cookie to game AI',async()=>{
  const t=setup();
  const anonymous=await t.send(req('/api/auth/status',{headers:{'X-Game-Auth-Session':'f'.repeat(64),Authorization:'private',Cookie:'unrelated=private'}}));
  assert.equal((await anonymous.json()).authenticated,false);
  let forwarded=t.forwarded.at(-1);
  assert.equal(forwarded.redirect,'manual');
  assert.equal(forwarded.headers.get('X-Game-Auth-Session'),'');assert.equal(forwarded.headers.get('Cookie'),null);assert.equal(forwarded.headers.get('Authorization'),null);
  const fake=await t.send(req('/api/ai/status',{headers:{'X-Game-Auth-Session':'f'.repeat(64),Cookie:`${AUTH_SESSION_COOKIE}=${'a'.repeat(64)}`}}));
  assert.equal(fake.status,401);assert.ok(t.objects.every(name=>name==='four-seasons-oauth-v1'));
  const start=await begin(t);
  const callback=await t.send(req(`${path}?code=mock&state=${start.state}`,{headers:{Cookie:start.cookie}}));
  const valid=await t.send(req('/api/ai/status',{headers:{'X-Game-Auth-Session':'f'.repeat(64),Cookie:start.cookie+'; '+cookies(callback)}}));
  assert.equal(valid.status,200);assert.equal(t.objects.at(-1),'four-seasons-life-service-v1');
  forwarded=t.forwarded.at(-1);
  assert.equal(forwarded.headers.get('X-Game-Auth-Session'),null);assert.equal(forwarded.headers.get('Cookie'),null);
  assert.equal(readAuthSession(req('/',{headers:{Cookie:`${AUTH_SESSION_COOKIE}=${'a'.repeat(64)}; ${AUTH_SESSION_COOKIE}=${'b'.repeat(64)}`}})),'');
});
test('Pages service binding preserves redirect and multiple secure cookies',async()=>{
  const t=setup(),start=await begin(t);
  const response=await pages.fetch(req(`${path}?code=mock&state=${start.state}`,{headers:{Cookie:start.cookie}}),{GAME_BACKEND:{fetch:t.send}});
  assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'/?auth=success');assert.equal(response.headers.getSetCookie().length,1);
  const forwarded=await pages.fetch(req('/api/auth/status'),{GAME_BACKEND:{fetch:async()=>new Response(null,{headers:[['Set-Cookie','a=1; Secure; HttpOnly'],['Set-Cookie','b=2; Secure; HttpOnly']]})}});
  assert.equal(forwarded.headers.getSetCookie().length,2);
});
test('OAuth bypasses the AI queue and combines expiry alarms',async()=>{
  const object=Object.create(GameService.prototype);object.waiting=3;object.queue=new Promise(()=>{});let cleaned=0;
  object.auth={handle:async()=>Response.json({ok:true}),cleanup:async()=>Date.now()+10000};
  object.service={cleanup:async()=>null};object.state={storage:{setAlarm:async()=>{cleaned++;},deleteAlarm:async()=>{throw Error('must not clear live OAuth');}}};
  assert.equal((await object.fetch(req('/api/auth/status'))).status,200);assert.equal(cleaned,1);
});
