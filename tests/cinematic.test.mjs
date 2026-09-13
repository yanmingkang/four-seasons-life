import test from 'node:test';
import assert from 'node:assert/strict';
import {CINEMATIC_MANIFEST,getCinematic} from '../src/cinematic-manifest.js';
import {stat,readFile} from 'node:fs/promises';
import {EVENTS} from '../src/events.js';
import {newGame,land,choose,advance,snapshot,restore} from '../src/engine.js';
import {eventCopy,isKeyEvent} from '../src/event-copy.js';
import {eventMarkup,rulesMarkup} from '../src/presentation.js';
import {practiceForState} from '../src/practice-scenes.js';
import {createInvitationProgress,getInvitationPlacement} from '../src/practice-invitation.js';

test('team delivery includes the stairwell and retires only the cell-13 film',()=>{
  assert.deepEqual(CINEMATIC_MANIFEST.map(item=>item.cell),[6,8,11,15,18,22,27,31]);
  assert.deepEqual(EVENTS.filter(e=>e.cinematicId).map(e=>e.number),CINEMATIC_MANIFEST.map(item=>item.cell));
  assert.equal(new Set(CINEMATIC_MANIFEST.map(item=>item.id)).size,8);
  assert.equal(new Set(CINEMATIC_MANIFEST.map(item=>item.theme)).size,8);
  assert.equal(getCinematic({cell:8}).theme,'stairwell');
  assert.equal(getCinematic({cell:13}),null);
  assert.equal(getCinematic({cinematicId:'cell-13'}),null,'old film identifiers do not revive retired clips');
});

test('team films and posters use versioned local sources and full supplied duration metadata',async()=>{
  for(const item of CINEMATIC_MANIFEST){
    const directory=[8,31].includes(item.cell)?'/cinematics/team-20260912-repaired-20260913':'/cinematics/team-20260912';
    assert.equal(item.src,`${directory}/${item.id}.mp4`);
    assert.equal(item.poster,`${directory}/${item.id}-poster.jpg`);
    assert.equal(item.production,'team-supplied');assert.equal(item.hasAudio,item.cell!==8);
    assert.ok((await stat(new URL(`../public${item.src}`,import.meta.url))).size>10000);
    assert.ok((await stat(new URL(`../public${item.poster}`,import.meta.url))).size>500);
    assert.ok(item.durationMs>=5000&&item.durationMs<10000);assert.equal(item.beat.length,3);
    assert.ok(item.beat.every(beat=>typeof beat==='string'&&beat.length>0));
    assert.ok(Object.isFrozen(item));assert.ok(Object.isFrozen(item.beat));
  }
  assert.deepEqual(CINEMATIC_MANIFEST.map(item=>[item.cell,item.durationMs,item.width,item.height,item.fps,item.hasAudio]),[
    [6,5062,1280,720,24,true],[8,5042,1280,720,24,false],[11,5056,1280,720,24,true],[15,5246,1280,720,30,true],
    [18,8080,1280,720,24,true],[22,6083,1280,720,24,true],[27,6083,1280,720,24,true],[31,5056,1280,720,24,true],
  ],'Local repairs switch only two paths, not duration, geometry, frame rate or sound declarations');
  assert.ok(getCinematic(18).durationMs>8000,'the hospital scene is not silently cut to the old 5-second cap');
});

test('lookup accepts documented event identifiers without accepting arbitrary video URLs',()=>{
  const first=CINEMATIC_MANIFEST[0];
  assert.equal(getCinematic('cell-06'),first);
  assert.equal(getCinematic({cinematicId:'cell-06'}),first);
  assert.equal(getCinematic({cinematicId:'cell-11',cell:6}),getCinematic(11));
  assert.equal(getCinematic({cinematicId:'unknown',cell:6}),null);
  assert.equal(getCinematic({id:'cell-06'}),first);
  assert.equal(getCinematic({cell:6}),first);
  assert.equal(getCinematic(6),first);
  for(const value of [undefined,null,{},0,40,'https://example.com/video.mp4',{src:'/cinematics/arbitrary.mp4'}])assert.equal(getCinematic(value),null);
});

test('retiring the cell-13 film preserves its authored scene, three intentions and natural AI practice',()=>{
  const event=EVENTS[12];
  assert.equal(event.cinematicId,null);assert.equal(event.title,'大群里的责任争执');
  assert.equal(event.season,1);assert.equal(event.kind,'挑战');assert.equal(event.location,'跨部评审厅');
  assert.equal(event.scene,'上线延期，协作方把问题归到你身上。完整的沟通记录就在手边。');
  assert.deepEqual(event.options.map(o=>o.label),['公开澄清：发出时间线与证据','私下对齐：先找协调人沟通','整理共同复盘单，约各方逐项核对']);
  assert.deepEqual(event.options.map(o=>[o.money,o.mood,o.exp]),[[0,-10,15],[0,10,5],[0,-5,10]]);
  assert.equal(isKeyEvent(event),true);assert.equal(eventCopy(event).detail,'输入框里的解释写了又删，群里又跳出一条追问。');
  for(const lifeSchema of [1,2,3]){
    let state=newGame('full',{enriched:true,lifeSchema});
    for(const die of [6,6])state=advance(choose(land(state,die),1));
    state=land(state,1);assert.equal(state.active.id,'cell-13');
    const saved=snapshot(state),card=eventMarkup(state);assert.deepEqual(restore(saved),state);
    assert.match(card,/event-key/);assert.equal((card.match(/class="choice-intention"/g)||[]).length,3);
    assert.equal((card.match(/data-choice=/g)||[]).length,3);assert.match(card,/看看每种回应的细节/);
    for(const option of event.options)assert.ok(card.includes(option.description));
    state=choose(state,1);assert.equal(practiceForState(state).id,'cell-13');
    assert.equal(getInvitationPlacement(state,createInvitationProgress()),'natural');
    assert.deepEqual(restore(snapshot(state)),state);
  }
});

test('the stairwell gains rich storytelling while film removal does not change key-event policy',()=>{
  const event=EVENTS[7];assert.equal(event.cinematicId,'cell-08');assert.equal(isKeyEvent(event),true);
  assert.equal(eventCopy(event).scene,event.scene);assert.ok(eventCopy(event).detail);
  assert.equal(isKeyEvent({...EVENTS[12],cinematicId:null}),true);
  assert.equal(isKeyEvent({...EVENTS[0],cinematicId:'cell-06'}),false,'a video identifier is not editorial emphasis');
  assert.doesNotMatch(rulesMarkup(),/4 秒短片|程序制作的3D/);
  assert.match(rulesMarkup(),/团队提供的短片/);
});

test('legacy procedural rendering cannot write into the team delivery directory',async()=>{
  const tool=await readFile(new URL('../tools/render-cinematic-videos.mjs',import.meta.url),'utf8');
  assert.match(tool,/out=new URL\('\.\.\/public\/cinematics\/procedural-preview\//);
  assert.doesNotMatch(tool,/import\s*\{CINEMATIC_MANIFEST\}/);
  assert.doesNotMatch(tool,/out=new URL\('\.\.\/public\/cinematics\/team-/);
});
