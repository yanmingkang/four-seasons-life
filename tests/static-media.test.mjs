import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import fs from 'node:fs/promises';
import net from 'node:net';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

test('production media sends correct MIME, exact length, HEAD and missing-file errors',async t=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const parent=path.join(root,'test-results');await fs.mkdir(parent,{recursive:true});
  const fixture=await fs.mkdtemp(path.join(parent,'static-media-'));
  await fs.mkdir(path.join(fixture,'cinematics'));await fs.mkdir(path.join(fixture,'models'));
  await fs.writeFile(path.join(fixture,'index.html'),'<!doctype html><title>Test fixture</title>');
  const bytes=Buffer.from([0,1,2,3,4,5,6,7]);
  // Byte fixtures test transport, not whether these are playable media.
  for(const ext of ['mp4','webm','jpg','webp']) await fs.writeFile(path.join(fixture,'cinematics','cell-06.'+ext),bytes);
  await fs.writeFile(path.join(fixture,'models','fixture.bin'),bytes);
  const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['server.mjs','--production'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,PORT:String(port),GAME_DIST_ROOT:fixture,ZHIHU_CLI_PATH:path.join(fixture,'absent.exe')}});
  t.after(async()=>{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}});
  const base='http://127.0.0.1:'+port;let ready=false;
  for(let i=0;i<100;i++){try{ready=(await fetch(base+'/api/health')).ok;}catch{}if(ready)break;await delay(30);}assert.ok(ready);
  for(const [ext,type] of [['mp4','video/mp4'],['webm','video/webm'],['jpg','image/jpeg'],['webp','image/webp']]){
    const response=await fetch(base+'/cinematics/cell-06.'+ext);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),type);assert.equal(response.headers.get('content-length'),'8');assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes);
    const head=await fetch(base+'/cinematics/cell-06.'+ext,{method:'HEAD'});assert.equal(head.headers.get('content-length'),'8');assert.equal((await head.arrayBuffer()).byteLength,0);
  }
  const binary=await fetch(base+'/models/fixture.bin');assert.equal(binary.headers.get('content-length'),'8');assert.deepEqual(Buffer.from(await binary.arrayBuffer()),bytes);
  const missing=await fetch(base+'/cinematics/cell-11.mp4');assert.equal(missing.status,404);assert.equal(await missing.text(),'Not found');
  assert.equal((await fetch(base+'/an-optional-client-route')).status,200);
});
