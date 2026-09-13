// Real workerd HTTP/storage checks, with an empty provider secret. Local only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {newGame,land,choose,advance,snapshot} from '../src/engine.js';
import {CINEMATIC_MANIFEST} from '../src/cinematic-manifest.js';

const base=process.env.CLOUD_LOCAL_BASE||'http://127.0.0.1:8789';
const target=new URL(base);
assert.ok(['127.0.0.1','localhost'].includes(target.hostname)&&target.protocol==='http:','This check must not hit a public deployment');
const report={passed:false,base,realModelCalls:0,realSearchCalls:0,transport:'local-workerd',checks:[]};
const out=new URL('../test-results/cloud-local/runtime.json',import.meta.url);
let cookie='';
async function send(path,body){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Origin:target.origin,...(cookie?{Cookie:cookie}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(10000)});
  const result=await response.json();assert.equal(response.status,200,`${path}: ${JSON.stringify(result)}`);return result;
}
try{
  const home=await fetch(base);assert.equal(home.status,200);cookie=home.headers.get('Set-Cookie')?.split(';')[0];assert.ok(cookie);
  assert.match(home.headers.get('Content-Security-Policy'),/connect-src 'self'/);
  const status=await send('/api/ai/status');assert.equal(status.configured,false,'Refuse to test a runtime containing a live provider secret');
  report.checks.push({name:'first-page-cookie-and-unconfigured-backend',passed:true});
  for(const clip of CINEMATIC_MANIFEST){
    const video=await fetch(base+clip.src,{headers:{Range:'bytes=0-4095'}});
    assert.ok([200,206].includes(video.status));assert.match(video.headers.get('Content-Type'),/video\/mp4/);
    const size=(await video.arrayBuffer()).byteLength;
    if(video.status===206){assert.match(video.headers.get('Content-Range'),/^bytes 0-4095\//);assert.equal(size,4096);}
    else assert.ok(size>4096,'Local static runtime may return the full short film; do not call this range support');
    const poster=await fetch(base+clip.poster,{method:'HEAD'});assert.equal(poster.status,200);
    report.checks.push({name:`cell-${clip.cell}-video-and-poster`,passed:true,rangeSupported:video.status===206,status:video.status,bytes:size});
  }
  for(let cell=1;cell<=40;cell++){
    const response=await fetch(`${base}/art/memories/cell-${String(cell).padStart(2,'0')}.webp`,{method:'HEAD'});assert.equal(response.status,200);assert.match(response.headers.get('Content-Type'),/image\/webp/);
  }
  report.checks.push({name:'all-40-memory-images',passed:true});
  for(const path of ['/.env','/server.mjs','/auth.json','/test-results/cloud-release.json','/RELEASE.json','/api/missing'])assert.equal((await fetch(base+path)).status,404,path);
  const cross=await fetch(base+'/api/practice',{method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json'},body:'{}'});assert.equal(cross.status,403);
  report.checks.push({name:'private-paths-and-cross-origin-blocked',passed:true});
  let state=newGame('full',{name:'云端隔离验收旅人',talent:'defense',enriched:true,lifeSchema:4}),eventGame;
  const moves=[[6,2],[6,0],[1,0],[6,0],[6,2],[6,1],[6,1],[6,0]];
  for(const [index,[die,choice]] of moves.entries()){
    state=choose(land(state,die),choice);if(index===2)eventGame=snapshot(state);state=advance(state);
  }
  assert.equal(state.ended,'complete');
  for(const [kind,game] of [['event',eventGame],['summary',snapshot(state)]]){
    const result=await send('/api/narrate',{kind,game});assert.equal(result.mode,'fallback');assert.ok(result.text.length>0);
    report.checks.push({name:`${kind}-real-backend-fallback`,passed:true,mode:result.mode});
  }
  const one={game:eventGame,clientId:randomUUID(),turn:1,message:'我们先共同核对已确认的交付记录，再约定下一步。'};
  const first=await send('/api/practice',one);assert.equal(first.mode,'fallback');assert.equal(first.turn,1);assert.equal(first.done,false);
  const repeat=await send('/api/practice',one);assert.deepEqual(repeat,first);
  const second=await send('/api/practice',{...one,turn:2,sessionId:first.sessionId,message:'我先整理待确认事项，请两边各安排一位同事一起核对，可以吗？'});
  assert.equal(second.mode,'fallback');assert.equal(second.turn,2);assert.equal(second.done,true);assert.ok(second.tip);
  report.checks.push({name:'two-round-practice-and-idempotence',passed:true,mode:second.mode});
  const experience=await send('/api/experience?source=records');assert.equal(experience.mode,'curated');assert.ok(experience.items.length>0);
  report.checks.push({name:'search-curated-fallback',passed:true,mode:experience.mode});
  const auth=await send('/api/auth/status');assert.equal(auth.enabled,false);assert.equal(auth.callbackUrl,target.origin+'/api/auth/zhihu/callback');
  const callback=await fetch(auth.callbackUrl+'?authorization_code=do-not-reflect&state=do-not-reflect');assert.equal(callback.status,503);assert.doesNotMatch(await callback.text(),/do-not-reflect/);
  report.checks.push({name:'callback-reserved-not-pretending-oauth-success',passed:true});
  report.passed=true;
}catch(error){report.error=error.message;process.exitCode=1;}
finally{await fs.mkdir(new URL('.',out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
