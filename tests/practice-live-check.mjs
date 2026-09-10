// Deliberate manual integration check, never part of npm test. At most 2 calls.
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {newGame,land,choose,advance,previewChoice,snapshot} from '../src/engine.js';
if(process.env.RUN_LIVE_PRACTICE!=='1')throw new Error('This check can consume Zhihu quota. Set RUN_LIVE_PRACTICE=1 only after authorizing a real two-turn check.');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:4173';
let state=newGame('full',{name:'连通演练',talent:'defense'});
while(state.position<12){const located=land(state,Math.min(6,12-state.position));const option=located.active.options.map((o,i)=>({i,p:previewChoice(located,o)})).filter(o=>!o.p.disabled).sort((a,b)=>b.p.mood-a.p.mood)[0].i;state=choose(located,option);if(state.position<12)state=advance(state);}
const game=snapshot(state),clientId=randomUUID(),rounds=[];let sessionId;
const messages=['我不是在判断谁的态度，想先请大家核对已经记录的交付时间，没确认的地方一起补齐。','我可以先整理待确认事项，想请两边各约一位了解情况的同事，明天下午一起核对，可以吗？'];
for(let i=0;i<2;i++){
  const response=await fetch(base+'/api/practice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({game,clientId,turn:i+1,message:messages[i],...(sessionId?{sessionId}:{})}),signal:AbortSignal.timeout(26000)});
  const body=await response.json();rounds.push({turn:i+1,httpStatus:response.status,mode:body.mode||'error',model:body.model||null,npc:body.npc||'',tip:body.tip||null});
  if(!response.ok||!['live','cache'].includes(body.mode)){process.exitCode=1;break;}
  sessionId=body.sessionId;
}
const result={checkedAt:new Date().toISOString(),provider:'知乎直答 / 官方 CLI',fixture:'完全虚构的cell-13沟通演练',rounds,passed:rounds.length===2&&rounds.every(r=>['live','cache'].includes(r.mode))};
await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../test-results/practice-live-check.json',import.meta.url),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
