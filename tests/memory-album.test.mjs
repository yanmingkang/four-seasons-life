import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {getMemoryAlbum,memoryShareData,memoryImage} from '../src/memory-album.js';
import {completeMemoryFixture,earlyMemoryFixture,titleMemoryFixture} from './memory-fixtures.mjs';
import {EVENTS} from '../src/events.js';
import {newGame,land,choose,advance,snapshot,restore,getLifeReport} from '../src/engine.js';
import {getEventGrounding} from '../src/event-grounding.js';
import {getTenDecisionReview} from '../src/life-report-view.js';
import {loadMemoryImage} from '../src/memory-share.js';

test('full ending produces 8 pages from actual stops, not all 40 squares',()=>{
  const s=completeMemoryFixture(),before=JSON.stringify(s),a=getMemoryAlbum(s);
  assert.equal(a.pages.length,8);assert.equal(a.count,12);assert.equal(a.complete,true);
  for(const page of a.pages){if(page.moment)assert.ok(s.history.some(h=>h.eventId===page.moment.eventId&&h.choiceLabel===page.moment.choice));}
  for(const season of a.seasons)assert.equal(season.count,s.history.filter(h=>h.season===season.index).length);
  assert.equal(a.dilemma.eventId,'cell-13');assert.deepEqual(a.hero,a.coverMoment);
  assert.ok(a.titleEvidence.some(proof=>proof.eventId===a.hero.eventId&&proof.turn===a.hero.turn));
  assert.equal(JSON.stringify(s),before);assert.equal(getTenDecisionReview(s).length,10);
});
test('early ending keeps all recap functions, no pictures or stories for unvisited seasons',()=>{
  const s=earlyMemoryFixture(),a=getMemoryAlbum(s);
  assert.equal(a.complete,false);assert.ok(s.position<39);
  const visited=new Set(s.history.map(h=>h.season));
  assert.equal(a.pages.length,visited.size+4);
  for(const season of a.seasons)if(!visited.has(season.index)){assert.equal(season.moment,null);assert.equal(season.count,0);}
  assert.deepEqual(a.pages.slice(-3).map(p=>p.kind),['choice','method','share']);
});
test('one settled moment still makes a complete five-page memory, pending records excluded',()=>{
  let s=advance(choose(land(newGame('full',{enriched:true}),3),0));s=land(s,3);
  const a=getMemoryAlbum({...s,ended:'mood'});assert.equal(a.pages.length,5);assert.equal(a.count,1);
  assert.equal(a.dilemma.eventId,'cell-03');assert.ok(!JSON.stringify(a).includes('cell-06'));
});
test('demo uses original event id, never short-route position, and remains replayable',()=>{
  const s=completeMemoryFixture('demo'),a=getMemoryAlbum(s);
  assert.equal(a.mode,'快速体验');assert.equal(restore(snapshot(s)).ended,'complete');
  for(const page of a.pages){if(page.moment)assert.equal(page.moment.image,`/art/memories/${page.moment.eventId}.webp`);}
});
test('method is a curated matching actual source, never a stored previous-run practice',()=>{
  const s=completeMemoryFixture(),a=getMemoryAlbum(s),h=s.history.find(h=>h.eventId===a.method.moment.eventId);
  assert.ok(h.sources.includes(a.method.source.id));
  assert.ok(getEventGrounding(h).considerations.some(c=>c.sourceId===a.method.source.id&&c.idea===a.method.text));
  assert.equal(a.method.attribution,'相关讨论整理，非答主原话');assert.ok(a.method.boundary);
});
test('historical choices and outcomes preserved without re-evaluating modern options',()=>{
  const s=completeMemoryFixture();s.history.find(h=>h.eventId==='cell-13').choiceLabel='旧版当时的选择';s.history.find(h=>h.eventId==='cell-13').result='旧版结果：没有与对方达成一致。';
  const a=getMemoryAlbum(s);assert.equal(a.dilemma.choice,'旧版当时的选择');assert.equal(a.dilemma.result,'旧版结果：没有与对方达成一致。');
});

test('the cover and title receipt use this run’s matching evidence and canonical event names',()=>{
  const state=completeMemoryFixture(),album=getMemoryAlbum(state);
  assert.equal(album.title,album.journeyTitle.name);assert.equal(album.titleReason,album.journeyTitle.reason);
  for(const title of [album.journeyTitle,...album.commemorations]){
    for(const moment of title.moments){
      const proof=title.evidence.find(proof=>proof.eventId===moment.eventId&&proof.turn===moment.turn);
      assert.ok(proof);
      assert.ok(state.history.some(record=>record.eventId===moment.eventId&&record.turn===proof.turn&&record.choice===proof.choice&&record.choiceLabel===moment.choice));
      assert.equal(moment.title,EVENTS.find(event=>event.id===moment.eventId).title);
    }
  }
  const other=album.journeyTitle.moments.find(moment=>moment.eventId!==album.dilemma.eventId);
  if(other)assert.notEqual(album.coverMoment.eventId,album.dilemma.eventId);
  const changed=structuredClone(state),record=changed.history.find(record=>record.eventId===album.coverMoment.eventId);
  record.title='UNVERIFIED TITLE';record.choiceLabel='当时已保存的选择';
  const updated=getMemoryAlbum(changed);
  assert.notEqual(updated.coverMoment.title,'UNVERIFIED TITLE');
  assert.equal(updated.coverMoment.choice,'当时已保存的选择');
});

test('public share includes the daily title reason and earned commemorations without sharing the collection',()=>{
  const state=completeMemoryFixture(),album=getMemoryAlbum(state),shared=memoryShareData(state);
  assert.equal(shared.titleReason,album.titleReason);assert.deepEqual(shared.titleEvidence,album.titleEvidence);
  assert.deepEqual(shared.commemorations,album.commemorations);assert.equal(shared.titles,undefined);
  for(const commemoration of shared.commemorations){assert.ok(commemoration.reason);assert.ok(commemoration.evidence.length);}
  const report=getLifeReport(state);
  assert.deepEqual(shared.commemorations.map(item=>item.id),report.titles.filter(item=>item.unlocked).map(item=>item.id));
  assert.ok(shared.commemorations.length>0,'this route earns a separate special commemoration');
  assert.ok(shared.commemorations.every(item=>item.id!==shared.titleId));
});

test('the same daily title keeps different real cover pictures and sentences for different routes',()=>{
  const route=stops=>{
    let state=newGame('full',{enriched:true});
    for(const [cell,choice] of stops)state=advance(choose(land(state,cell-1-state.position),choice));
    return getMemoryAlbum(state);
  };
  const first=route([[4,0],[8,0]]),second=route([[2,0],[7,1]]);
  assert.equal(first.titleId,'clarify');assert.equal(first.title,second.title);
  assert.notEqual(first.titleReason,second.titleReason);
  assert.notEqual(first.hero.image,second.hero.image);
  assert.ok(['cell-04','cell-08'].includes(first.hero.eventId));
  assert.ok(['cell-02','cell-07'].includes(second.hero.eventId));
  assert.deepEqual(first.commemorations,[]);assert.deepEqual(second.commemorations,[]);
});

test('a mixed title keeps four supporting actions but pictures an action named in its sentence',()=>{
  const album=getMemoryAlbum(titleMemoryFixture('mixed'));
  assert.equal(album.titleId,'mixed');assert.equal(album.titleEvidence.length,4);
  assert.match(album.titleReason,/故障排查.*休假安排/);
  assert.equal(album.coverMoment.eventId,'cell-19');
  assert.equal(album.hero.eventId,'cell-19');
});
test('missing source and empty histories are honestly omitted',()=>{
  const s=completeMemoryFixture();s.history.forEach(h=>{h.sources=[];});assert.equal(getMemoryAlbum(s).method,null);
  const a=getMemoryAlbum(newGame('full'));assert.equal(a.count,0);assert.equal(a.hero,null);assert.equal(a.method,null);assert.equal(a.pages.length,2);
  assert.throws(()=>memoryShareData(newGame('full')),/先走过/);assert.equal(memoryImage({eventId:'unknown'}),null);
});
test('share whitelist excludes names, practice text, credentials, storage and URL secrets',()=>{
  const s=completeMemoryFixture();Object.assign(s,{name:'PRIVATE_NAME',practice:{text:'PRIVATE_PRACTICE'},journal:'PRIVATE_JOURNAL',apiKey:'PRIVATE_KEY'});
  const before=JSON.stringify(s),data=memoryShareData(s,'https://game.example.com/play?password=PRIVATE_URL#PRIVATE_FRAGMENT');
  assert.equal(data.publicUrl,'https://game.example.com/play');assert.equal(data.qrText,data.publicUrl);
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE_/);assert.equal(JSON.stringify(s),before);
});
test('local QR is only the real experienced question, never a public-play claim',()=>{
  const s=completeMemoryFixture();for(const url of ['http://127.0.0.1:4174','https://localhost/','https://192.168.1.5/','https://[::1]/']){
    const data=memoryShareData(s,url);assert.equal(data.publicUrl,null);assert.equal(data.qrLabel,'扫码读这道题');assert.ok(data.qrText.includes(data.dilemma.title));assert.doesNotMatch(data.qrText,/127.0.0.1|PRIVATE/);
  }
});
test('all 40 memory assets are local WebP files, not source-document comparison images',async()=>{
  let size=0;for(const e of EVENTS){const file=await fs.readFile(new URL(`../public/art/memories/${e.id}.webp`,import.meta.url));assert.equal(file.subarray(8,12).toString(),'WEBP');assert.ok(file.length>1000);size+=file.length;}
  assert.ok(size<5_000_000,`bounded scene asset payload ${size}`);
});
test('share image loader handles errors and timeout, refuses untrusted URL',async()=>{
  let created=0;class Failing{constructor(){created++;}set src(value){queueMicrotask(()=>this.onerror?.());}}
  assert.equal(await loadMemoryImage('/art/memories/cell-03.webp',{defaultView:{Image:Failing}}),null);
  assert.equal(await loadMemoryImage('https://external.example.com/private.png',{defaultView:{Image:Failing}}),null);assert.equal(created,1);
  class Stalled{set src(value){}}
  assert.equal(await loadMemoryImage('/art/memories/cell-03.webp',{defaultView:{Image:Stalled}},{timeout:10}),null);
});
