// Cloud-only transport. The existing local Node/CLI server remains unchanged.
import { createCloudGameService } from './cloud-service.mjs';
import {AUTH_PATHS,OAUTH_CALLBACK_PATH,oauthConfiguration,unavailableAuth,readAuthSession,createZhihuAuthRoutes} from './zhihu-auth-routes.mjs';

const COOKIE='__Host-four-seasons-visitor',DAY=86400,encoder=new TextEncoder();
export {OAUTH_CALLBACK_PATH};
const API_PATHS=new Set(['/api/narrate','/api/practice','/api/experience','/api/ai/status']);
const SECURITY={
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Cache-Control':'no-store',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...SECURITY,'Content-Type':'application/json; charset=utf-8'}});
const loginRequired=()=>json({code:'AUTH_REQUIRED',error:'请先登录知乎账号再开始游戏'},401);
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
const bytes=hexValue=>Uint8Array.from(hexValue.match(/../g)||[],x=>parseInt(x,16));
async function hmacKey(secret){
  if(typeof secret!=='string'||secret.length<32||secret.length>512)throw Error('Unavailable signing key');
  return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
async function sign(key,text){return hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(text))));}

export async function visitorIdentity(request,secret,now=Date.now()){
  const key=await hmacKey(secret),seconds=Math.floor(now/1000);
  const raw=(request.headers.get('Cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
  const match=/^v1\.([a-f0-9]{48})\.(\d{10})\.([a-f0-9]{64})$/.exec(raw||'');
  let id,expires,cookie;
  if(match&&Number(match[2])>seconds&&Number(match[2])<=seconds+DAY&&await crypto.subtle.verify('HMAC',key,bytes(match[3]),encoder.encode(`v1.${match[1]}.${match[2]}`))){
    id=match[1];expires=Number(match[2]);
  }else{
    id=hex(crypto.getRandomValues(new Uint8Array(24)));expires=seconds+DAY;
    const prefix=`v1.${id}.${expires}`,signature=await sign(key,prefix);
    cookie=`${COOKIE}=${prefix}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAY}`;
  }
  // Cloudflare supplies this header; never trust an incoming X-Game-Ip or XFF.
  const ip=await sign(key,`ip:${request.headers.get('CF-Connecting-IP')||'unknown'}`);
  return {id,ip,cookie};
}

export function allowedSameOrigin(request,origin){
  const sentOrigin=request.headers.get('Origin'),site=request.headers.get('Sec-Fetch-Site');
  if(sentOrigin&&sentOrigin!==origin)return false;
  if(site==='cross-site'||site==='same-site')return false;
  if(request.method==='POST'&&sentOrigin!==origin)return false;
  return true;
}

export default {
  async fetch(request,env){
    try{
      const url=new URL(request.url);
      const origin=env.PUBLIC_ORIGIN||url.origin;
      if(env.PUBLIC_ORIGIN&&url.origin!==env.PUBLIC_ORIGIN)return json({error:'请使用正式试玩地址'},421);
      if(AUTH_PATHS.has(url.pathname)){
        const callback=url.pathname===OAUTH_CALLBACK_PATH;
        if(!callback&&!allowedSameOrigin(request,origin))return json({error:'请从游戏页面发起请求'},403);
        if(!oauthConfiguration(env).enabled)return unavailableAuth(request,origin);
        if(!env.GAME_SERVICE||!env.VISITOR_SIGNING_KEY)return json({error:'登录服务暂不可用'},503);
        const visitor=await visitorIdentity(request,env.VISITOR_SIGNING_KEY);
        const headers=new Headers();
        headers.set('X-Game-Visitor',visitor.id);headers.set('X-Game-Ip',visitor.ip);
        headers.set('X-Game-Auth-Session',readAuthSession(request));
        // Separate object instance: login must not queue behind an AI response.
        // No browser Authorization, cookies, body or spoofed X-Game-* forwarded.
        const service=env.GAME_SERVICE.get(env.GAME_SERVICE.idFromName('four-seasons-oauth-v1'));
        // Binding fetch also follows redirects by default: preserve the 303 and
        // Set-Cookie for the browser instead of following it inside the object.
        const response=await service.fetch(new Request(request.url,{method:request.method,headers,redirect:'manual'}));
        const safeHeaders=new Headers(response.headers);
        for(const [key,value] of Object.entries(SECURITY))safeHeaders.set(key,value);
        if(visitor.cookie)safeHeaders.append('Set-Cookie',visitor.cookie);
        return new Response(response.body,{status:response.status,headers:safeHeaders});
      }
      if(url.pathname==='/api/health'){
        if(request.method!=='GET')return json({error:'只支持 GET'},405);
        return json({ok:true,game:'four-seasons-life',deployment:'cloudflare-free'});
      }
      if(!url.pathname.startsWith('/api/')){
        if(!['GET','HEAD'].includes(request.method))return json({error:'只支持读取'},405);
        const asset=await env.ASSETS.fetch(request);
        // Establish the visitor before the page can issue parallel API calls.
        // Large media files bypass this Worker and retain free static delivery.
        if(['/', '/index.html'].includes(url.pathname)&&env.VISITOR_SIGNING_KEY){
          const visitor=await visitorIdentity(request,env.VISITOR_SIGNING_KEY);
          const headers=new Headers(asset.headers);
          headers.set('Cache-Control','private, no-store');
          if(visitor.cookie)headers.set('Set-Cookie',visitor.cookie);
          return new Response(asset.body,{status:asset.status,headers});
        }
        return asset;
      }
      if(!API_PATHS.has(url.pathname))return json({error:'接口不存在'},404);
      if(!allowedSameOrigin(request,origin))return json({error:'请从游戏页面发起请求'},403);
      // The cloud game requires a real account session. A signed visitor cookie
      // identifies a browser for quotas, but is not proof of Zhihu login.
      const sessionId=readAuthSession(request);
      if(!sessionId||!oauthConfiguration(env).enabled)return loginRequired();
      if(!env.GAME_SERVICE||!env.VISITOR_SIGNING_KEY)return json({error:'登录验证暂不可用，请稍后重试'},503);
      const visitor=await visitorIdentity(request,env.VISITOR_SIGNING_KEY);
      const authHeaders=new Headers({'X-Game-Visitor':visitor.id,'X-Game-Ip':visitor.ip,'X-Game-Auth-Session':sessionId});
      const authService=env.GAME_SERVICE.get(env.GAME_SERVICE.idFromName('four-seasons-oauth-v1'));
      // Only the isolated OAuth object can validate its persisted session and
      // expiry. This runs before touching the game queue, history or budgets.
      const authResponse=await authService.fetch(new Request(new URL('/api/auth/status',origin),{
        method:'GET',headers:authHeaders,redirect:'manual',
      }));
      if(authResponse.status!==200){
        await authResponse.body?.cancel();
        return json({error:'登录验证暂不可用，请稍后重试'},503);
      }
      const status=await authResponse.json();
      if(status?.enabled!==true||status?.authenticated!==true){
        const response=loginRequired(),expiredCookie=authResponse.headers.get('Set-Cookie');
        if(expiredCookie)response.headers.append('Set-Cookie',expiredCookie);
        return response;
      }
      const headers=new Headers(request.headers);
      for(const name of [...headers.keys()])if(name.startsWith('x-game-'))headers.delete(name);
      headers.delete('cookie');headers.delete('authorization');headers.delete('x-forwarded-for');
      headers.set('X-Game-Visitor',visitor.id);headers.set('X-Game-Ip',visitor.ip);
      const internal=new Request(request,{headers});
      const service=env.GAME_SERVICE.get(env.GAME_SERVICE.idFromName('four-seasons-life-service-v1'));
      const response=await service.fetch(internal),safeHeaders=new Headers(response.headers);
      for(const [key,value] of Object.entries(SECURITY))safeHeaders.set(key,value);
      if(visitor.cookie)safeHeaders.set('Set-Cookie',visitor.cookie);
      return new Response(response.body,{status:response.status,headers:safeHeaders});
    }catch{return json({error:'服务暂不可用，请稍后重试'},503);}
  },
};

// One SQLite-backed object coordinates quota and short-lived conversations.
// A bounded queue prevents a burst of players from waiting indefinitely.
export class GameService {
  constructor(state,env){
    this.state=state;this.queue=Promise.resolve();this.waiting=0;this.maxQueueWaitMs=2000;
    this.service=createCloudGameService({storage:state.storage,secret:env.ZHIHU_ACCESS_SECRET});
    this.auth=createZhihuAuthRoutes({storage:state.storage,env});
  }
  async fetch(request){
    if(AUTH_PATHS.has(new URL(request.url).pathname)&&this.auth){
      try{return await this.auth.handle(request);}finally{await this.scheduleCleanup();}
    }
    const busy=()=>json({error:'当前练习人数较多，可稍后重试或继续预设体验'},503);
    if(this.waiting>=3)return busy();
    this.waiting++;
    let expired=false,timer;
    const timeout=new Promise(resolve=>{timer=setTimeout(()=>{expired=true;resolve(busy());},this.maxQueueWaitMs??2000);});
    const work=this.queue.then(async()=>{
      clearTimeout(timer);
      // Do not spend a model call after a queued client has already fallen back.
      if(expired||request.signal.aborted)return busy();
      try{return await this.service.handle(request);}
      finally{await this.scheduleCleanup();}
    });
    const finished=work.finally(()=>{clearTimeout(timer);this.waiting--;});
    this.queue=finished.catch(()=>{});
    // Expired placeholders still occupy their bounded slot until the active
    // request completes, preventing a flood from growing the internal queue.
    return Promise.race([finished,timeout]);
  }
  async scheduleCleanup(){
    // Serialize the read-and-set, so an older empty sweep cannot clear an alarm
    // scheduled by a concurrent login that just persisted a new session.
    const work=(this.cleanupQueue||Promise.resolve()).then(async()=>{
      const gameNext=await this.service.cleanup(),authNext=this.auth?await this.auth.cleanup():null;
      const times=[gameNext,authNext].filter(value=>value!==null);
      const next=times.length?Math.min(...times):null;
      if(next===null)await this.state.storage.deleteAlarm();
      else await this.state.storage.setAlarm(Math.max(Date.now()+1000,next));
    });
    this.cleanupQueue=work.catch(()=>{});
    return work;
  }
  async alarm(){
    // Keep expiry deletion running even if no player visits again.
    const work=this.queue.then(()=>this.scheduleCleanup());
    this.queue=work.catch(()=>{});
    await work;
  }
}
