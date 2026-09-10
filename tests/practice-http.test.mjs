// Isolated local production HTTP + gateway acceptance. The CLI path is
// deliberately nonexistent, so neither this test nor a fallback can call a model.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {newGame,land,choose,advance,snapshot} from '../src/engine.js';
import {PRACTICE_SCENES} from '../src/practice-scenes.js';
import {MAX_BODY_BYTES} from '../server/ai.mjs';
import {createShareGateway} from '../server/share-gateway.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
async function unusedPort(){
  const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));return port===4173?unusedPort():port;
}
const settled=(die=4,choice=0)=>choose(land(newGame('demo'),die),choice);

test('optional practice HTTP and password gateway work with official CLI disabled',async t=>{
  const port=await unusedPort(),base=`http://127.0.0.1:${port}`;
  const child=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(port),ZHIHU_CLI_PATH:path.join(root,'test-results','intentionally-missing-cli-for-practice-http.exe')}});
  let output='',failure='',gateway;
  child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{failure+=chunk;});child.on('error',error=>{failure+=error.message;});
  const post=input=>fetch(base+'/api/practice',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});
  try{
    for(let i=0;i<100&&!output.includes(base);i++){if(child.exitCode!==null)throw new Error(`Isolated practice server exited: ${failure}`);await delay(20);}
    assert.ok(output.includes(base),`Isolated practice server did not start: ${failure}`);
    const status=await(await fetch(base+'/api/ai/status')).json();assert.equal(status.configured,false);assert.equal(status.available,false);

    await t.test('methods, media types, malformed JSON and large bodies reject explicitly',async()=>{
      for(const method of ['GET','PUT','DELETE'])assert.equal((await fetch(base+'/api/practice',{method})).status,405);
      assert.equal((await fetch(base+'/api/practice',{method:'POST',body:'{}'})).status,415);
      assert.equal((await fetch(base+'/api/practice',{method:'POST',headers:{'content-type':'application/json'},body:'{broken'})).status,400);
      assert.equal((await post({padding:'x'.repeat(MAX_BODY_BYTES)})).status,413);
      const chunked=await new Promise((resolve,reject)=>{
        const request=http.request(base+'/api/practice',{method:'POST',headers:{'content-type':'application/json','transfer-encoding':'chunked'}},response=>{response.resume();response.on('end',()=>resolve(response.statusCode));});
        request.on('error',reject);request.write('x'.repeat(MAX_BODY_BYTES+1));request.end();
      });
      assert.equal(chunked,413);
      for(const suffix of ['/extra','.json','s','/'])assert.equal((await fetch(base+'/api/practice'+suffix,{method:'POST'})).status,404);
    });

    await t.test('only replayed settled practice scenes and bounded messages are accepted',async()=>{
      const clientId=randomUUID(),game=snapshot(settled());
      for(const invalid of [null,[],{},
        {game,clientId,message:''},{game,clientId,message:'   '},{game,clientId,message:'字'.repeat(241)},
        {game,clientId,message:'内容\u0000被截断'}, {game,message:'请先确认记录。'},
        {game,clientId:'short',message:'请先确认记录。'},
        {game:{...game,version:3},clientId,message:'请先确认记录。'},
        {game:snapshot(newGame('demo')),clientId,message:'请先确认记录。'},
        {game:snapshot(land(newGame('demo'),4)),clientId,message:'请先确认记录。'},
        {game:snapshot(advance(settled())),clientId,message:'请先确认记录。'},
        {game:snapshot(settled(1)),clientId,message:'请先确认记录。'},
        {game:{...game,moves:[{die:7,choice:0}]},clientId,message:'请先确认记录。'},
      ])assert.equal((await post(invalid&&typeof invalid==='object'&&!Array.isArray(invalid)?{turn:1,...invalid}:invalid)).status,400,JSON.stringify(invalid));
      for(const turn of [undefined,0,3,'1',null])assert.equal((await post({game,clientId,message:'我先核对记录。',...(turn===undefined?{}:{turn})})).status,400,'Required numeric turn must be 1 or 2');
    });

    await t.test('two fallback turns are idempotent, nonce-isolated and never change gameplay resources',async()=>{
      const state=settled(),game=snapshot(state),before=JSON.stringify(game),clientId=randomUUID(),message='我能先定位故障，后续安排需要一起确认。';
      const firstResponse=await post({game,clientId,message,turn:1});assert.equal(firstResponse.status,200);assert.match(firstResponse.headers.get('cache-control'),/no-store/);
      const first=await firstResponse.json();assert.equal(first.mode,'fallback');assert.equal(first.model,'zhida-fast-1p5');assert.equal(first.turn,1);assert.equal(first.done,false);assert.equal(first.tip,undefined);
      assert.match(first.sessionId,/^[A-Za-z0-9_-]{32}$/);assert.equal(first.npc,PRACTICE_SCENES['cell-11'].localReplies[0]);
      assert.deepEqual(await(await post({game,clientId,message,turn:1})).json(),first);
      const other=await(await post({game,clientId:randomUUID(),message,turn:1})).json();assert.notEqual(other.sessionId,first.sessionId,'Independent clients do not share a conversation token');
      for(const bad of [
        {game,clientId:randomUUID(),sessionId:first.sessionId,message:'请核对记录。'},
        {game:snapshot(settled(4,1)),clientId,sessionId:first.sessionId,message:'请核对记录。'},
        {game,clientId,sessionId:'x'.repeat(32),message:'请核对记录。'},
        {game,clientId,message:'无会话标识不能用另一句话重新开始。'},
      ])assert.equal((await post({turn:bad.sessionId?2:1,...bad})).status,400);
      const next={game,clientId,sessionId:first.sessionId,turn:2,message:'我会列出未完成项，并约定交接时一起确认。'};
      const second=await(await post(next)).json();assert.equal(second.mode,'fallback');assert.equal(second.sessionId,first.sessionId);assert.equal(second.turn,2);assert.equal(second.done,true);
      assert.equal(second.npc,PRACTICE_SCENES['cell-11'].localReplies[1]);assert.equal(second.tip,PRACTICE_SCENES['cell-11'].localTip);
      assert.deepEqual(await(await post(next)).json(),second);
      assert.equal((await post({...next,message:'第三轮不应再发起。'})).status,400);
      assert.equal((await post({...next,turn:3,message:'第三轮不应再发起。'})).status,400);
      assert.equal(JSON.stringify(game),before);for(const response of [first,second]){
        for(const key of ['money','mood','exp','game','score','grade','reasoning_content'])assert.equal(response[key],undefined,key);
        assert.doesNotMatch(JSON.stringify(response),/intentionally-missing-cli|TEST_ONLY|127\.0\.0\.1|\.exe/);
        assert.doesNotMatch(`${response.npc} ${response.tip||''}`,/[+−-]\s*\d/);
      }
    });

    await t.test('the second numbered turn can repeat the first message without replaying turn one',async()=>{
      const game=snapshot(settled(5)),clientId=randomUUID(),message='我们先核对已经确认的记录。';
      const first=await(await post({game,clientId,turn:1,message})).json();assert.equal(first.turn,1);assert.equal(first.done,false);
      const request={game,clientId,sessionId:first.sessionId,turn:2,message};
      const secondResponse=await post(request);assert.equal(secondResponse.status,200);
      const second=await secondResponse.json();assert.equal(second.turn,2);assert.equal(second.done,true);assert.equal(second.sessionId,first.sessionId);assert.equal(second.tip,PRACTICE_SCENES['cell-13'].localTip);
      assert.deepEqual(await(await post(request)).json(),second);
      assert.deepEqual(await(await post({game,clientId,turn:1,message})).json(),first);
      assert.equal((await post({...request,message:'改写已完成轮次应被拒绝。'})).status,400);
    });

    await t.test('client supplied stories, balances and NPC records are not trusted',async()=>{
      const game={...snapshot(settled(5)),money:999999,history:[{eventId:'cell-11',result:'UNTRUSTED_PRACTICE_HISTORY'}],npc:'UNTRUSTED_PRACTICE_NPC',scene:'UNTRUSTED_PRACTICE_SCENE'};
      const response=await post({game,clientId:randomUUID(),turn:1,message:'我们先看已确认的时间记录。'});assert.equal(response.status,200);
      const result=await response.json();assert.equal(result.npc,PRACTICE_SCENES['cell-13'].localReplies[0]);assert.doesNotMatch(JSON.stringify(result),/UNTRUSTED_PRACTICE|999999/);
    });

    await t.test('real production practice survives gateway cookie stripping with its explicit nonce and token',async()=>{
      const passcode='test-only-practice-gateway';gateway=createShareGateway({passcode,upstream:base,secureCookies:false});gateway.listen(0,'127.0.0.1');await once(gateway,'listening');
      const publicOrigin=`http://127.0.0.1:${gateway.address().port}`;
      assert.equal((await fetch(publicOrigin+'/api/practice',{method:'POST'})).status,401);
      const login=await fetch(publicOrigin+'/__share/login',{method:'POST',headers:{origin:publicOrigin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:passcode}),redirect:'manual'});
      assert.equal(login.status,303);const cookie=login.headers.get('set-cookie').split(';')[0];
      assert.equal((await fetch(publicOrigin+'/api/practice',{headers:{cookie}})).status,405);
      assert.equal((await fetch(publicOrigin+'/api/practice',{method:'POST',headers:{cookie,origin:'https://evil.test','content-type':'application/json'},body:'{}'})).status,403);
      const game=snapshot(settled(5)),clientId=randomUUID();
      const forwarded=async body=>{
        const response=await fetch(publicOrigin+'/api/practice',{method:'POST',headers:{cookie,origin:publicOrigin,'content-type':'application/json',authorization:'Bearer TEST_ONLY_NOT_FORWARDED'},body:JSON.stringify(body)});
        assert.equal(response.status,200);assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('cache-control'),'no-store');return response.json();
      };
      const first=await forwarded({game,clientId,turn:1,message:'我想先核对两边确认过的记录。'});
      const second=await forwarded({game,clientId,sessionId:first.sessionId,turn:2,message:'我们把未确认的事项单列，约个时间一起看。'});
      assert.equal(first.mode,'fallback');assert.equal(first.turn,1);assert.equal(second.mode,'fallback');assert.equal(second.turn,2);assert.equal(second.done,true);assert.equal(second.sessionId,first.sessionId);
    });
  }finally{
    if(gateway){gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
    if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill();await exited;}
  }
});
