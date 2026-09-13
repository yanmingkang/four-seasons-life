import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/cloudflare-worker.mjs';
import {createZhihuAuthRoutes,AUTH_SESSION_COOKIE,OAUTH_CALLBACK_PATH} from '../server/zhihu-auth-routes.mjs';
import {createCloudGameService} from '../server/cloud-service.mjs';
import {newGame,land,choose,snapshot} from '../src/engine.js';

// Real edge, OAuth persistence/expiry and game service; only external providers
// and the private DO binding are mocked. No network, credentials or user data.
const origin='https://game.example.com';
const config={PUBLIC_ORIGIN:origin,ZHIHU_OAUTH_APP_ID:'test-app',ZHIHU_OAUTH_APP_KEY:'MOCK-NOT-A-REAL-KEY',
  ZHIHU_OAUTH_REDIRECT_URI:origin+OAUTH_CALLBACK_PATH,ZHIHU_OAUTH_REGISTERED:'true',
  VISITOR_SIGNING_KEY:'test-only-visitor-signing-secret-123456789'};
const required={code:'AUTH_REQUIRED',error:'请先登录知乎账号再开始游戏'};
class Storage{
  constructor(){this.data=new Map();this.tail=Promise.resolve();this.transactions=0;this.fail=false;}
  async get(key){return structuredClone(this.data.get(key));}
  async put(key,value){this.data.set(key,structuredClone(value));}
  async delete(key){return this.data.delete(key);}
  transaction(fn){
    this.transactions++;
    const work=this.tail.then(async()=>{
      if(this.fail)throw Error('PRIVATE_STORAGE_FAILURE');
      const data=structuredClone(this.data);
      const result=await fn({get:async key=>structuredClone(data.get(key)),
        put:async(key,value)=>data.set(key,structuredClone(value)),delete:async key=>data.delete(key)});
      this.data=data;return result;
    });
    this.tail=work.catch(()=>{});return work;
  }
}
const completion=content=>JSON.stringify({choices:[{finish_reason:'stop',message:{content}}]});
function setup(){
  const oauthStorage=new Storage(),gameStorage=new Storage(),calls={auth:0,game:0,model:0,search:0,exchange:0};
  const forwarded=[];let time=Date.now();
  const auth=createZhihuAuthRoutes({storage:oauthStorage,env:config,now:()=>time,authenticate:async()=>{
    calls.exchange++;return {profile:{id:'969570047710216200',name:'仅用于验证的昵称'},expiresIn:3600};
  }});
  const game=createCloudGameService({storage:gameStorage,now:()=>time,
    execute:async prompt=>{
      calls.model++;
      return completion(prompt.includes('"userTurn":')
        ? JSON.stringify({npc:'我们先把卡点说具体，你希望从哪一个交付节点开始核对？'})
        : '你给这次沟通留出了一点空间，可以带着已经做出的选择继续前行。');
    },
    search:async()=>{calls.search++;return JSON.stringify({Code:0,Data:{Items:[{
      Title:'测试讨论',AuthorName:'测试作者',Url:'https://www.zhihu.com/question/123/answer/456',ContentText:'测试摘要。',
    }]}});},
  });
  const env={...config,ASSETS:{fetch:async()=>new Response('<!doctype html><title>登录封面</title>')},
    GAME_SERVICE:{idFromName:name=>name,get:name=>({fetch:async request=>{
      if(name==='four-seasons-oauth-v1'){
        calls.auth++;assert.equal(request.redirect,'manual');return auth.handle(request);
      }
      assert.equal(name,'four-seasons-life-service-v1');calls.game++;forwarded.push(request);
      return game.handle(request);
    }})},
  };
  return {calls,env,oauthStorage,gameStorage,forwarded,setTime:value=>{time=value;},time:()=>time,
    send:request=>worker.fetch(request,env)};
}
function request(path,{cookie='',input,headers={},method=input===undefined?'GET':'POST'}={}){
  return new Request(origin+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),
    ...(input===undefined?{}:{'Content-Type':'application/json'}),...headers},
    ...(input===undefined?{}:{body:JSON.stringify(input)})});
}
const cookie=response=>response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
async function login(t){
  const start=await t.send(request('/api/auth/zhihu/start',{method:'POST'}));assert.equal(start.status,200);
  const browser=cookie(start),url=new URL((await start.json()).authorizationUrl);
  const callback=await t.send(request(`${OAUTH_CALLBACK_PATH}?code=mock-once&state=${url.searchParams.get('state')}`,{cookie:browser}));
  assert.equal(callback.status,303);return browser+'; '+cookie(callback);
}
const event=()=>({kind:'event',game:snapshot(choose(land(newGame('full',{name:'模拟旅人',enriched:true,lifeSchema:4}),6),2))});
const practice=()=>({game:snapshot(choose(land(newGame('demo',{name:'模拟旅人',enriched:true,lifeSchema:4}),5),0)),
  clientId:'test-mandatory-client-aaaaaaaaaaaa',turn:1,message:'能否先共同核对一个交接节点？'});
function business(cookieValue='',headers={}){
  return [request('/api/narrate',{cookie:cookieValue,input:event(),headers}),
    request('/api/practice',{cookie:cookieValue,input:practice(),headers}),
    request('/api/experience?source=records',{cookie:cookieValue,headers}),
    request('/api/ai/status',{cookie:cookieValue,headers})];
}
async function denied(t,requests){
  for(const req of requests){
    const response=await t.send(req);assert.equal(response.status,401);
    assert.deepEqual(await response.json(),required);assert.equal(response.headers.get('Cache-Control'),'no-store');
    assert.equal(req.bodyUsed,false,'authorization must precede reading the player input');
  }
}

test('anonymous and client-forged identities cannot reach any business API or consume quota',async()=>{
  const t=setup();
  t.gameStorage.data.set('existing-player-record',{private:'not read by anonymous request'});
  const prior=structuredClone(t.gameStorage.data);
  await denied(t,business());
  await denied(t,business('',{'X-Game-Auth-Session':'a'.repeat(64),'X-Game-Visitor':'b'.repeat(48),
    'X-Game-Ip':'c'.repeat(64),'X-Game-Authenticated':'true',Authorization:'Bearer fake'}));
  for(const value of ['invalid','a'.repeat(64),`${'a'.repeat(64)}; ${AUTH_SESSION_COOKIE}=${'b'.repeat(64)}`]){
    await denied(t,business(`${AUTH_SESSION_COOKIE}=${value}`));
  }
  assert.equal(t.calls.game,0);assert.equal(t.calls.model,0);assert.equal(t.calls.search,0);assert.equal(t.calls.exchange,0);
  assert.equal(t.gameStorage.transactions,0);assert.deepEqual(t.gameStorage.data,prior);
});

test('homepage, assets, health and OAuth routes remain reachable without a login redirect loop',async()=>{
  const t=setup();
  for(const path of ['/','/index.html','/assets/test.js','/api/health'])assert.equal((await t.send(request(path))).status,200);
  const status=await t.send(request('/api/auth/status'));
  assert.deepEqual(await status.json(),{enabled:true,provider:'zhihu',callbackUrl:origin+OAUTH_CALLBACK_PATH,authenticated:false});
  assert.equal((await t.send(request(OAUTH_CALLBACK_PATH))).status,400);
  assert.equal((await t.send(request('/api/auth/logout',{method:'POST'}))).status,200);
  assert.equal((await t.send(request('/api/missing'))).status,404);
  assert.equal(t.calls.game,0);assert.equal(t.calls.model,0);assert.equal(t.calls.search,0);
  const jar=await login(t);
  assert.equal((await (await t.send(request('/api/auth/status',{cookie:jar}))).json()).authenticated,true);
  assert.equal(t.calls.exchange,1);
});

test('only a persisted valid OAuth session permits all four real game API handlers',async()=>{
  const t=setup(),jar=await login(t);
  for(const req of business(jar,{'X-Game-Auth-Session':'f'.repeat(64),'X-Game-Visitor':'forged',
    'X-Game-Ip':'forged','X-Game-Authenticated':'true',Authorization:'Bearer do-not-forward'})){
    const response=await t.send(req);assert.equal(response.status,200);
    const body=await response.json();assert.doesNotMatch(JSON.stringify(body),/仅用于验证的昵称|969570047710216200|MOCK-NOT-A-REAL-KEY/);
    if(new URL(req.url).pathname!=='/api/ai/status')assert.equal(body.mode,'live');
  }
  assert.equal(t.calls.exchange,1);assert.equal(t.calls.game,4);assert.equal(t.calls.model,2);assert.equal(t.calls.search,1);
  assert.ok([...t.gameStorage.data.keys()].some(key=>key.includes('budget:model:')));
  for(const req of t.forwarded){
    assert.match(req.headers.get('X-Game-Visitor'),/^[a-f0-9]{48}$/);assert.match(req.headers.get('X-Game-Ip'),/^[a-f0-9]{64}$/);
    for(const name of ['Cookie','Authorization','X-Game-Auth-Session','X-Game-Authenticated'])assert.equal(req.headers.get(name),null);
  }
});

test('expired and logged-out sessions return the fixed 401 before game history or quota reads',async()=>{
  for(const action of ['expire','logout']){
    const t=setup(),jar=await login(t);
    if(action==='expire')t.setTime(t.time()+3600_001);
    else assert.equal((await t.send(request('/api/auth/logout',{cookie:jar,method:'POST'}))).status,200);
    await denied(t,business(jar));
    const response=await t.send(request('/api/ai/status',{cookie:jar}));
    assert.match(response.headers.get('Set-Cookie'),/Max-Age=0/);
    assert.equal(t.calls.game,0);assert.equal(t.gameStorage.transactions,0);
    assert.equal(t.calls.model,0);assert.equal(t.calls.search,0);assert.equal(t.calls.exchange,1);
  }
});

test('unregistered OAuth and failed session verification fail closed without exposing storage errors',async()=>{
  const t=setup(),jar=await login(t);
  t.env.ZHIHU_OAUTH_REGISTERED='false';await denied(t,business(jar));
  t.env.ZHIHU_OAUTH_REGISTERED='true';t.oauthStorage.fail=true;
  const response=await t.send(request('/api/ai/status',{cookie:jar}));
  assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PRIVATE_|profile|session|969570047710216200/);
  assert.equal(t.calls.game,0);assert.equal(t.gameStorage.transactions,0);assert.equal(t.calls.model,0);assert.equal(t.calls.search,0);
});

test('a malformed, redirecting or non-boolean private status response never authorizes business work',async()=>{
  const t=setup();
  for(const makeResponse of [()=>Response.json({enabled:true,authenticated:'true'}),()=>Response.json({authenticated:true}),
    ()=>new Response('invalid-json'),()=>new Response(null,{status:303,headers:{Location:origin+'/'}})]){
    let gameCalls=0;
    t.env.GAME_SERVICE={idFromName:name=>name,get:name=>({fetch:async()=>{
      if(name==='four-seasons-oauth-v1')return makeResponse();gameCalls++;return Response.json({ok:true});
    }})};
    const response=await t.send(request('/api/ai/status',{cookie:`${AUTH_SESSION_COOKIE}=${'a'.repeat(64)}`}));
    assert.ok([401,503].includes(response.status));assert.equal(gameCalls,0);
  }
});
