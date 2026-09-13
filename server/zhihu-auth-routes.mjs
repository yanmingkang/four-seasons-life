import {buildZhihuAuthorizationUrl,createZhihuOAuthClient} from './zhihu-oauth-http.mjs';
import {createZhihuOAuthService} from './zhihu-oauth-service.mjs';

export const OAUTH_CALLBACK_PATH='/api/auth/zhihu/callback';
export const AUTH_SESSION_COOKIE='__Host-four-seasons-account';
export const AUTH_PATHS=new Set(['/api/auth/status','/api/auth/zhihu/start',OAUTH_CALLBACK_PATH,'/api/auth/logout']);
const headers={
  'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const json=(data,status=200)=>Response.json(data,{status,headers});
const cookie=(id='',age=0)=>`${AUTH_SESSION_COOKIE}=${id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;

// Exact registration is a deliberate deployment gate, not inferred from a key.
// Access Secret is for the game's AI, never a substitute for an OAuth App Key.
export function oauthConfiguration(env){
  const origin=env.PUBLIC_ORIGIN;
  const callbackUrl=`${origin||''}${OAUTH_CALLBACK_PATH}`;
  let https=false;
  try {const url=new URL(origin);https=url.protocol==='https:'&&url.origin===origin&&!url.username&&!url.password;} catch {}
  const appId=env.ZHIHU_OAUTH_APP_ID,appKey=env.ZHIHU_OAUTH_APP_KEY;
  const configured=https&&env.ZHIHU_OAUTH_REGISTERED==='true'&&env.ZHIHU_OAUTH_REDIRECT_URI===callbackUrl
    &&typeof appId==='string'&&/^[A-Za-z0-9_-]{1,256}$/.test(appId)
    &&typeof appKey==='string'&&appKey.length>0&&appKey.length<=4096&&!/[\s\x00-\x1f\x7f]/.test(appKey);
  return {enabled:Boolean(configured),callbackUrl,appId,appKey,redirectUri:callbackUrl};
}
export function readAuthSession(request){
  const values=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim())
    .filter(x=>x.startsWith(`${AUTH_SESSION_COOKIE}=`));
  const value=values.length===1?values[0].slice(AUTH_SESSION_COOKIE.length+1):'';
  return /^[a-f0-9]{64}$/.test(value)?value:'';
}
function callbackPage(status,title,message){
  // Only fixed strings; never reflect authorization codes, state or errors.
  return new Response(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>知乎四时 · 授权入口</title><style>body{font:18px/1.8 sans-serif;max-width:36em;margin:12vh auto;padding:24px;color:#35533e;background:#fff8e8}a{color:inherit}</style><h1>${title}</h1><p>${message}</p><a href="/?auth=failed">返回游戏</a></html>`,{status,headers:{...headers,'Content-Type':'text/html; charset=utf-8'}});
}
export function unavailableAuth(request,origin){
  const path=new URL(request.url).pathname;
  if(request.method!==(path==='/api/auth/zhihu/start'||path==='/api/auth/logout'?'POST':'GET'))return json({error:'请求方式不支持'},405);
  if(path==='/api/auth/status')return json({enabled:false,provider:'zhihu',callbackUrl:origin+OAUTH_CALLBACK_PATH,reason:'oauth_registration_pending'});
  if(path===OAUTH_CALLBACK_PATH)return callbackPage(503,'知乎登录尚未开放','回调入口已就绪，等待应用凭证与赛事后台登记。请稍后返回游戏登录。');
  return json({error:'知乎登录暂未开放，请稍后再试'},503);
}

export function createZhihuAuthRoutes({storage,env,authenticate,now}){
  const config=oauthConfiguration(env);
  const client=config.enabled?(authenticate||createZhihuOAuthClient(config).authenticate):async()=>{throw Error('OAuth disabled');};
  const service=createZhihuOAuthService({storage,authenticate:client,...(now?{now}:{})});
  return {
    cleanup:()=>service.cleanup(),
    async handle(request){
      const url=new URL(request.url),path=url.pathname;
      if(!AUTH_PATHS.has(path))return json({error:'接口不存在'},404);
      if(!config.enabled)return unavailableAuth(request,env.PUBLIC_ORIGIN||url.origin);
      if(request.method!==(path==='/api/auth/zhihu/start'||path==='/api/auth/logout'?'POST':'GET'))return json({error:'请求方式不支持'},405);
      const visitorId=request.headers.get('X-Game-Visitor'),ip=request.headers.get('X-Game-Ip');
      if(!/^[a-f0-9]{48}$/.test(visitorId||'')||!/^[a-f0-9]{64}$/.test(ip||''))return json({error:'请从游戏页面登录'},401);
      const sessionId=request.headers.get('X-Game-Auth-Session')||'';
      try{
        if(path==='/api/auth/status'){
          const status=await service.status({sessionId});
          const response=json({enabled:true,provider:'zhihu',callbackUrl:config.callbackUrl,...status});
          if(sessionId&&!status.authenticated)response.headers.append('Set-Cookie',cookie());
          return response;
        }
        if(path==='/api/auth/zhihu/start'){
          const {state}=await service.start({visitorId,ip});
          return json({authorizationUrl:buildZhihuAuthorizationUrl({...config,state})});
        }
        if(path==='/api/auth/logout'){
          await service.logout({visitorId,sessionId});
          const response=json({ok:true});response.headers.append('Set-Cookie',cookie());return response;
        }
        // Duplicate/ambiguous parameters are rejected rather than choosing one.
        const query=url.searchParams;
        const states=query.getAll('state'),primary=query.getAll('authorization_code'),compat=query.getAll('code');
        const code=primary[0]||compat[0];
        if(url.search.length>8192||states.length!==1||primary.length>1||compat.length>1
          ||(primary.length&&compat.length)||!code||code.length>2048||/[\x00-\x20\x7f]/.test(code)
          ||query.has('error'))return callbackPage(400,'这次登录未完成','请返回游戏，重新点击知乎登录。');
        const result=await service.callback({visitorId,state:states[0],code,sessionId});
        return new Response(null,{status:303,headers:{...headers,Location:'/?auth=success','Set-Cookie':cookie(result.sessionId,result.expiresIn)}});
      }catch(error){
        const status=[400,401,403,409,429].includes(error?.status)?error.status:503;
        if(path===OAUTH_CALLBACK_PATH)return callbackPage(status,'这次登录未完成','授权已过期或暂时无法验证，请返回游戏重新登录。');
        return json({error:status===429?'登录尝试较多，请稍后再试':'登录暂不可用，请稍后重试'},status);
      }
    },
  };
}
