import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

// Actual workerd + SQLite Durable Object + production edge, not Node-only
// storage mocks. ALL outbound traffic is replaced; zero live OAuth/model calls.
test('real workerd Pages binding, OAuth cookies, SQLite state, profile exchange, replay and logout',async()=>{
  const origin='https://zhihu-four-seasons.pages.dev',callback='/api/auth/zhihu/callback';
  const compiled=await build({entryPoints:[fileURLToPath(new URL('../server/cloudflare-entry.mjs',import.meta.url))],
    bundle:true,write:false,platform:'neutral',format:'esm',target:'es2022',external:['node:*']});
  const pages=await build({entryPoints:[fileURLToPath(new URL('../server/pages-worker.mjs',import.meta.url))],bundle:true,write:false,platform:'neutral',format:'esm',target:'es2022'});
  let calls=0,refuse=false;
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{
    name:'pages',modules:true,script:pages.outputFiles[0].text,compatibilityDate:'2026-09-01',serviceBindings:{GAME_BACKEND:'game'},
  },{name:'game',modules:true,script:compiled.outputFiles[0].text,
    compatibilityDate:'2026-09-01',compatibilityFlags:['nodejs_compat'],
    durableObjects:{GAME_SERVICE:{className:'GameService',useSQLite:true}},
    bindings:{PUBLIC_ORIGIN:origin,ZHIHU_OAUTH_APP_ID:'synthetic-oauth-app',ZHIHU_OAUTH_APP_KEY:'synthetic-oauth-app-key',
      ZHIHU_OAUTH_REGISTERED:'true',ZHIHU_OAUTH_REDIRECT_URI:origin+callback,VISITOR_SIGNING_KEY:'synthetic-visitor-signing-key-no-real-credential'},
    outboundService:async request=>{
      calls++;const url=new URL(request.url);assert.equal(url.origin,'https://openapi.zhihu.com');
      if(refuse)return Response.json({code:404,data:'PRIVATE-UPSTREAM-ERROR'},{status:401});
      if(url.pathname==='/access_token'){
        assert.equal(request.method,'POST');const form=new URLSearchParams(await request.text());
        assert.equal(form.get('grant_type'),'authorization_code');assert.equal(form.get('redirect_uri'),origin+callback);
        assert.equal(form.get('app_key'),'synthetic-oauth-app-key');assert.equal(form.get('code'),'synthetic-code');
        return Response.json({code:20000,data:{access_token:'synthetic-token',token_type:'Bearer',expires_in:3600}});
      }
      assert.equal(url.pathname,'/user');assert.equal(request.method,'GET');
      assert.equal(request.headers.get('Authorization'),'Bearer synthetic-token');assert.equal(request.headers.get('X-OAuth-Token'),null);
      return new Response('{"code":20000,"data":{"uid":969570047710216201,"fullname":"合成旅人","email":"PRIVATE-EMAIL"}}',{headers:{'Content-Type':'application/json'}});
    },
  }]}));
  const send=(path,options={})=>mf.dispatchFetch(origin+path,{redirect:'manual',...options});
  const cookieOf=response=>response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
  try{
    let response=await send('/api/auth/zhihu/start',{method:'POST',headers:{Origin:origin}});
    assert.equal(response.status,200);const visitor=cookieOf(response);assert.match(visitor,/__Host-four-seasons-visitor/);
    const authorize=new URL((await response.json()).authorizationUrl),state=authorize.searchParams.get('state');
    response=await send(callback+'?authorization_code=synthetic-code&state='+state);
    assert.equal(response.status,400);assert.equal(calls,0,'Wrong browser never reaches provider');
    response=await send(callback+'?authorization_code=synthetic-code&state='+state,{headers:{Cookie:visitor,'Sec-Fetch-Site':'cross-site'}});
    assert.equal(response.status,303);assert.equal(response.headers.get('Location'),'/?auth=success');assert.equal(calls,2);
    const account=cookieOf(response),jar=visitor+'; '+account;
    response=await send('/api/auth/status',{headers:{Cookie:jar}});
    assert.deepEqual((await response.json()).profile,{name:'合成旅人'});
    response=await send(callback+'?authorization_code=synthetic-code&state='+state,{headers:{Cookie:visitor}});
    assert.equal(response.status,400);assert.equal(calls,2);
    response=await send('/api/auth/logout',{method:'POST',headers:{Origin:'https://foreign.example',Cookie:jar}});
    assert.equal(response.status,403);
    response=await send('/api/auth/logout',{method:'POST',headers:{Origin:origin,Cookie:jar}});
    assert.equal(response.status,200);assert.match(response.headers.get('Set-Cookie'),/Max-Age=0/);
    response=await send('/api/auth/status',{headers:{Cookie:jar}});assert.equal((await response.json()).authenticated,false);
    response=await send('/api/auth/zhihu/start',{method:'POST',headers:{Origin:origin,Cookie:visitor}});
    const again=new URL((await response.json()).authorizationUrl).searchParams.get('state');refuse=true;
    response=await send(callback+'?code=synthetic-code&state='+again,{headers:{Cookie:visitor}});
    assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/PRIVATE|synthetic-token|synthetic-code/);
    assert.equal(calls,3,'No automatic retry or profile read after invalid token response');
    response=await send('/api/auth/status',{headers:{Cookie:jar}});assert.equal((await response.json()).authenticated,false);
  }finally{await mf.dispose();}
});
