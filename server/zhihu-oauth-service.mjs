import {createHash,randomBytes} from 'node:crypto';

export const ZHIHU_OAUTH_STORAGE_PREFIX='zhihu-oauth:v1:';
export const ZHIHU_OAUTH_LIMITS=Object.freeze({stateTtlMs:600_000,sessionTtlSeconds:3600,rateWindowMs:600_000,visitorStartsPerWindow:5,ipStartsPerWindow:30,maxStorageEntries:2048});
const PREFIX=ZHIHU_OAUTH_STORAGE_PREFIX,INDEX=`${PREFIX}expiry`;
const {stateTtlMs,sessionTtlSeconds,rateWindowMs,visitorStartsPerWindow,ipStartsPerWindow,maxStorageEntries}=ZHIHU_OAUTH_LIMITS;
const hex48=/^[a-f0-9]{48}$/,hex64=/^[a-f0-9]{64}$/;
const hash=value=>createHash('sha256').update(value).digest('hex');
const opaque=()=>randomBytes(32).toString('hex');
const own=(value,key)=>Object.hasOwn(value,key);
const safeText=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max&&!/[\u0000-\u001f\u007f]/u.test(value);
const messages=Object.freeze({invalid_visitor:'浏览器会话无效，请重新打开登录。',invalid_state:'登录请求已失效，请重新发起登录。',
  invalid_code:'登录回调无效，请重新发起登录。',rate_limited:'登录尝试过于频繁，请稍后再试。',capacity:'当前登录人数较多，请稍后再试。',
  authentication_unavailable:'知乎登录暂不可用，请稍后重试。',authentication_failed:'知乎登录未能完成，请重新发起登录。',
  invalid_profile:'未能确认知乎账号信息，请重新发起登录。',invalid_session_lifetime:'知乎登录已失效，请重新发起登录。',
  login_cancelled:'这次登录已取消，请重新发起登录。',storage_unavailable:'登录服务暂不可用，请稍后再试。'});

// Only fixed codes/messages cross this boundary; never retain an upstream error,
// cause, response body, authorization code, or provider credential.
export class ZhihuOAuthServiceError extends Error {
  constructor(status,code){super(messages[code]||messages.storage_unavailable);this.name='ZhihuOAuthServiceError';this.status=status;this.code=own(messages,code)?code:'storage_unavailable';}
}
const fail=(status,code)=>{throw new ZhihuOAuthServiceError(status,code);};
const requireVisitor=visitorId=>{if(typeof visitorId!=='string'||!hex48.test(visitorId))fail(401,'invalid_visitor');};
const sessionKey=sessionId=>typeof sessionId==='string'&&hex64.test(sessionId)?`session:${hash(sessionId)}`:null;

// The edge must validate the visitor's HMAC cookie and supply its 48-hex ID plus
// an already-hashed IP. All state lives in transactional shared storage. A fresh
// service instance can finish a pending login or inspect/revoke any live session.
export function createZhihuOAuthService({storage,now=Date.now,authenticate}={}) {
  if(!storage||!['get','put','delete','transaction'].every(name=>typeof storage[name]==='function'))throw new TypeError('Persistent transactional storage is required.');
  if(typeof now!=='function'||(authenticate!==undefined&&typeof authenticate!=='function'))throw new TypeError('Invalid OAuth service dependencies.');

  async function transaction(work){
    try{return await storage.transaction(async raw=>{
      const time=now();
      if(!Number.isSafeInteger(time)||time<0)fail(503,'storage_unavailable');
      const saved=await raw.get(INDEX),index=saved===undefined?{}:saved;
      if(!index||typeof index!=='object'||Array.isArray(index)||Object.keys(index).length>maxStorageEntries-1)fail(503,'storage_unavailable');
      let changed=false;
      for(const [key,expiresAt] of Object.entries(index)){
        if(!key.startsWith(PREFIX)||key===INDEX||!Number.isSafeInteger(expiresAt))fail(503,'storage_unavailable');
        if(expiresAt<=time){await raw.delete(key);delete index[key];changed=true;}
      }
      const tx={time,
        async get(key){
          const full=`${PREFIX}${key}`,value=await raw.get(full);
          if(value===undefined)return null;
          if(!value||typeof value!=='object'||!Number.isSafeInteger(value.expiresAt)||index[full]!==value.expiresAt)fail(503,'storage_unavailable');
          if(value.expiresAt<=time){await this.delete(key);return null;}
          return value;
        },
        async put(key,value){
          const full=`${PREFIX}${key}`;
          if(!own(index,full)&&Object.keys(index).length>=maxStorageEntries-1)fail(503,'capacity');
          if(!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=time||value.expiresAt>time+sessionTtlSeconds*1000)fail(503,'storage_unavailable');
          await raw.put(full,value);index[full]=value.expiresAt;changed=true;
        },
        async delete(key){const full=`${PREFIX}${key}`;await raw.delete(full);if(own(index,full)){delete index[full];changed=true;}},
        next(){const deadlines=Object.values(index);return deadlines.length?Math.min(...deadlines):null;},
      };
      const result=await work(tx);
      if(changed){if(Object.keys(index).length)await raw.put(INDEX,index);else await raw.delete(INDEX);}
      return result;
    });}catch(error){if(error instanceof ZhihuOAuthServiceError)throw error;fail(503,'storage_unavailable');}
  }

  async function removeOwnedSession(tx,key,visitorId){
    if(!key)return;
    const session=await tx.get(key);
    if(session?.visitorId===visitorId)await tx.delete(key);
  }
  async function activeSession(tx,visitorId,visitor){
    const key=visitor?.activeSession;
    if(typeof key!=='string')return null;
    const session=await tx.get(key);
    return session?.phase==='active'&&session.visitorId===visitorId?{key,expiresAt:session.expiresAt}:null;
  }
  async function retainActive(tx,visitorId,visitor){
    const active=await activeSession(tx,visitorId,visitor);
    if(active)await tx.put(`visitor:${visitorId}`,{phase:'active',activeSession:active.key,expiresAt:active.expiresAt});
    else await tx.delete(`visitor:${visitorId}`);
  }
  async function abandon(visitorId,ticket,reservedKey){
    await transaction(async tx=>{
      await removeOwnedSession(tx,reservedKey,visitorId);
      const visitor=await tx.get(`visitor:${visitorId}`);
      if(visitor?.attempt===ticket)await retainActive(tx,visitorId,visitor);
    });
  }

  async function start({visitorId,ip}={}){
    requireVisitor(visitorId);
    if(typeof ip!=='string'||!hex64.test(ip))fail(401,'invalid_visitor');
    if(!authenticate)fail(503,'authentication_unavailable');
    const state=opaque(),attempt=opaque();
    await transaction(async tx=>{
      const rates=[];
      for(const [key,limit] of [[`rate:visitor:${visitorId}`,visitorStartsPerWindow],[`rate:ip:${ip}`,ipStartsPerWindow]]){
        const previous=await tx.get(key);
        if(previous&&(!Array.isArray(previous.times)||previous.times.some(time=>!Number.isSafeInteger(time)||time>tx.time)))fail(503,'storage_unavailable');
        const times=(previous?.times||[]).filter(time=>time>tx.time-rateWindowMs);
        if(times.length>=limit)fail(429,'rate_limited');
        rates.push({key,times:[...times,tx.time]});
      }
      const visitor=await tx.get(`visitor:${visitorId}`),active=await activeSession(tx,visitorId,visitor);
      await removeOwnedSession(tx,visitor?.exchangeSession,visitorId);
      const attemptExpires=tx.time+stateTtlMs;
      await tx.put(`visitor:${visitorId}`,{phase:'pending',attempt,stateHash:hash(state),attemptExpires,
        ...(active?{activeSession:active.key}:{}),expiresAt:Math.max(attemptExpires,active?.expiresAt||0)});
      for(const {key,times} of rates)await tx.put(key,{times,expiresAt:tx.time+rateWindowMs});
    });
    return {state};
  }

  async function callback({visitorId,state,code,sessionId}={}){
    requireVisitor(visitorId);
    if(typeof state!=='string'||!hex64.test(state))fail(400,'invalid_state');
    if(!safeText(code,4096))fail(400,'invalid_code');
    if(!authenticate)fail(503,'authentication_unavailable');
    const nextSessionId=opaque(),reservedKey=sessionKey(nextSessionId);
    // Reserve capacity and consume the browser-bound state in the SAME durable
    // transaction. No provider call takes place inside a retryable transaction.
    const {ticket,startedAt}=await transaction(async tx=>{
      const visitor=await tx.get(`visitor:${visitorId}`);
      if(visitor?.phase!=='pending'||visitor.attemptExpires<=tx.time||visitor.stateHash!==hash(state))fail(400,'invalid_state');
      await tx.put(reservedKey,{phase:'pending',visitorId,expiresAt:visitor.attemptExpires});
      const {stateHash,...consumed}=visitor;
      await tx.put(`visitor:${visitorId}`,{...consumed,phase:'exchanging',exchangeSession:reservedKey});
      return {ticket:visitor.attempt,startedAt:tx.time};
    });

    let profile,expiresIn,expiresBy;
    try{
      let result;
      try{result=await authenticate(code);}catch{fail(502,'authentication_failed');}
      if(!safeText(result?.profile?.id,256)||!safeText(result?.profile?.name,128))fail(502,'invalid_profile');
      if(typeof result.expiresIn!=='number'||!Number.isFinite(result.expiresIn)||result.expiresIn<1)fail(502,'invalid_session_lifetime');
      profile={id:result.profile.id.trim(),name:result.profile.name.trim()};
      // The provider may report the token's ORIGINAL expires_in after spending
      // time fetching the profile. Count from before exchange, and subtract all
      // elapsed time again inside the committing transaction.
      expiresBy=startedAt+Math.min(sessionTtlSeconds,Math.floor(result.expiresIn))*1000;
      // Result is deliberately not retained: extra token/contact fields must
      // never reach persistence, browser data, diagnostics, or exception causes.
    }catch(error){
      await abandon(visitorId,ticket,reservedKey);
      if(error instanceof ZhihuOAuthServiceError)throw error;
      fail(502,'authentication_failed');
    }

    try{
      await transaction(async tx=>{
        const visitor=await tx.get(`visitor:${visitorId}`),reservation=await tx.get(reservedKey);
        if(visitor?.phase!=='exchanging'||visitor.attempt!==ticket||visitor.attemptExpires<=tx.time||visitor.exchangeSession!==reservedKey||reservation?.phase!=='pending'||reservation.visitorId!==visitorId)fail(409,'login_cancelled');
        expiresIn=Math.floor((expiresBy-tx.time)/1000);
        if(expiresIn<1)fail(502,'invalid_session_lifetime');
        const expiresAt=tx.time+expiresIn*1000;
        await tx.put(reservedKey,{phase:'active',visitorId,profile,expiresAt});
        for(const oldKey of new Set([visitor.activeSession,sessionKey(sessionId)])){
          if(oldKey&&oldKey!==reservedKey)await removeOwnedSession(tx,oldKey,visitorId);
        }
        await tx.put(`visitor:${visitorId}`,{phase:'active',activeSession:reservedKey,expiresAt});
      });
    }catch(error){await abandon(visitorId,ticket,reservedKey);throw error;}
    return {sessionId:nextSessionId,expiresIn};
  }

  async function status({sessionId}={}){
    const key=sessionKey(sessionId);
    if(!key)return {authenticated:false};
    return transaction(async tx=>{
      const session=await tx.get(key);
      if(session?.phase!=='active')return {authenticated:false};
      const visitor=await tx.get(`visitor:${session.visitorId}`);
      if(visitor?.activeSession!==key)return {authenticated:false};
      if(!safeText(session.profile?.id,256)||!safeText(session.profile?.name,128))fail(503,'storage_unavailable');
      return {authenticated:true,profile:{name:session.profile.name}};
    });
  }

  async function logout({visitorId,sessionId}={}){
    requireVisitor(visitorId);
    await transaction(async tx=>{
      const presentedKey=sessionKey(sessionId),presented=presentedKey?await tx.get(presentedKey):null;
      const visitors=new Set([visitorId]);
      // Possession of the opaque account cookie (with edge CSRF validation) can
      // revoke that session even if the visitor cookie was lost or rotated.
      // A stale/orphaned session must not remove a newer owner's login ticket.
      if(presented?.phase==='active'&&hex48.test(presented.visitorId)){
        const owner=await tx.get(`visitor:${presented.visitorId}`);
        if(owner?.activeSession===presentedKey)visitors.add(presented.visitorId);
        await tx.delete(presentedKey);
      }
      for(const ownerId of visitors){
        const visitor=await tx.get(`visitor:${ownerId}`);
        for(const key of new Set([visitor?.activeSession,visitor?.exchangeSession]))await removeOwnedSession(tx,key,ownerId);
        await tx.delete(`visitor:${ownerId}`);
      }
      // Deleting the generation ticket invalidates any exchange already outside
      // this transaction. A subsequent start uses a new independent ticket.
    });
    return {authenticated:false};
  }

  // The Durable Object owner schedules an alarm for the returned timestamp,
  // including while nobody is visiting; null means no OAuth records remain.
  const cleanup=()=>transaction(tx=>tx.next());
  return {start,callback,status,logout,cleanup};
}
