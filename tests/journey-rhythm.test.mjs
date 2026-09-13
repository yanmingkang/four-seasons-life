import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {newGame,land,choose,advance,previewChoice,restore,snapshot,useItem,getInventory} from '../src/engine.js';
import {EVENTS} from '../src/events.js';
import {CHOICE_EFFORT,effortFor,settleStrain,resolveRhythmOption,fatigueStatus} from '../src/journey-rhythm.js';
import {eventCopy,feedbackShort,KEY_DETAILS} from '../src/event-copy.js';
import {eventMarkup,feedbackMarkup} from '../src/presentation.js';
import {mentorAdviceMarkup,inventoryNudge,inventoryNudgeMarkup} from '../src/rhythm-ui.js';
import {inventoryMarkup,companionMarkup} from '../src/life-ui.js';
import {validateNarrativeInput} from '../server/ai-core.mjs';
import {validatePracticeInput} from '../server/practice.mjs';

// Keep the existing workload/recovery regression on its original rules.
// Schema 4's extra base incident cost has a separate exhaustive test suite.
const fresh=(options={})=>newGame('full',{enriched:true,lifeSchema:3,...options});
const at=(number,resources={},lifeSchema=3)=>land({...fresh({lifeSchema}),position:number-2,season:Math.floor((number-1)/10),...resources},1);
const replay=s=>assert.deepEqual(restore(snapshot(s)),s);
const legal=s=>s.active.options.map((o,i)=>({i,p:previewChoice(s,o)})).filter(x=>!x.p.disabled);

test('forty explicit effort rows cover three choices; care is not mistaken for rest',()=>{
  assert.equal(CHOICE_EFFORT.length,40);assert.ok(CHOICE_EFFORT.every(row=>row.length===3&&row.every(Number.isInteger)));
  assert.equal(effortFor(18,0),2);assert.equal(effortFor(11,0),2);assert.ok(effortFor(7,0)<0);assert.equal(effortFor(40,0),0);
});
test('schema 3 workload journeys and older base journals keep their original shape',()=>{
  assert.equal(fresh().life.schema,3);assert.deepEqual(fresh().life.strain,{fatigue:0,streak:0});
  for(const lifeSchema of [1,2]){const s=fresh({lifeSchema});assert.equal(s.life.strain,undefined);replay(s);}
  assert.equal(newGame().life,undefined);assert.throws(()=>fresh({lifeSchema:99}));
});
// Frozen before this implementation; includes every actual resource, record,
// protection, branch, item drop and ending, not merely a snapshot round trip.
const legacyHashes=[
  [1,'defense','dbe98dd9658223dcb322c0e39ee9f3b3e470c197652bad59ef14116a31d85dc0'],
  [1,'ambitious','f8093592350c3d8f08c746d738a9522bc83260b810a96c72e87872976f58c522'],
  [1,'optimistic','3047bb960620718905888943da8c980aa22920ae385e42b1ef4a5c15f29515ca'],
  [2,'defense','bd55d4375c4d2db474af2e587350e78881edf13357081c2de73ac500c22b9f36'],
  [2,'ambitious','df5b2b062e03cd54dd5bd62e6ae336ddfda84dc595238d1548768994e5a48a36'],
  [2,'optimistic','1b830a9b3c2d1ee4741bfad6fb8a454badbdfe83ed3e7cc1c2b0402e6e581124'],
];
for(const [lifeSchema,talent,hash]of legacyHashes)test(`frozen pre-update journal: schema ${lifeSchema}, ${talent}`,()=>{
  let s=fresh({lifeSchema,talent});while(!s.ended){s=land(s,1);let i=s.active.number%3;while(previewChoice(s,s.active.options[i]).disabled)i=(i+1)%3;s=advance(choose(s,i));}
  assert.equal(createHash('sha256').update(JSON.stringify(s)).digest('hex'),hash);replay(s);
});
test('consecutive pressure accumulates; a real break reduces fatigue and resets streak',()=>{
  let p={fatigue:0,streak:0};const values=[];
  for(let i=0;i<5;i++){const next=settleStrain(p,2);p=next.strain;values.push([p.fatigue,next.cost]);}
  assert.deepEqual(values,[[2,0],[5,4],[8,10],[10,14],[10,14]]);
  const rested=settleStrain(p,-3);assert.deepEqual(rested,{strain:{fatigue:7,streak:0},cost:0,change:-3});
  assert.equal(settleStrain(rested.strain,2).strain.fatigue,9);assert.equal(settleStrain(p,-10).strain.fatigue,0);
});
test('ordinary positive recovery cannot wipe accumulated effort; holiday remains rare',()=>{
  for(const [n,gain]of [[12,20],[24,20],[35,25],[39,15]]){
    const s=at(n,{mood:30});assert.equal(previewChoice(s,s.active.options[0]).mood,30+gain);
    for(const schema of [1,2]){const old=at(n,{mood:30},schema);assert.equal(previewChoice(old,old.active.options[0]).mood,100);}
  }
  const full=EVENTS.filter(e=>resolveRhythmOption(at(e.number),e.options[0],0).fillMood).map(e=>e.number);
  assert.deepEqual(full,[38]);const h=at(38,{mood:30});h.life.strain={fatigue:10,streak:4};const after=choose(h,0);
  assert.equal(after.mood,110);assert.equal(after.life.strain.fatigue,0);
});
test('landing, skipped cells, preview and duplicate actions do not accumulate fatigue',()=>{
  const s=land(fresh(),6),before=structuredClone(s);assert.equal(s.life.strain.fatigue,0);
  for(let i=0;i<10;i++)for(const o of s.active.options)previewChoice(s,o);
  eventMarkup(s);inventoryMarkup(s);assert.deepEqual(s,before);replay(s);
  const once=choose(s,0);assert.equal(once.life.strain.fatigue,2);assert.deepEqual(choose(once,0),once);
  const ready=advance(once);assert.deepEqual(advance(ready),ready);assert.deepEqual(ready.life.strain,once.life.strain);
});
test('a memo protects the incident, not fatigue already accumulated',()=>{
  const s=at(13,{mood:70});s.life.strain={fatigue:8,streak:3};
  const p=previewChoice(s,s.active.options[0]);assert.equal(p.mood,56);assert.equal(p.lifePreview.inventory.memo,0);
  assert.match(p.talentNote,/累积疲惫/);assert.equal(s.life.inventory.memo,1);
});
test('coffee and an affordable autumn holiday relieve fatigue, once per turn',()=>{
  const s=at(24,{mood:100,money:13000});s.life.strain={fatigue:8,streak:3};
  const coffee=useItem(s,'coffee');assert.equal(coffee.life.strain.fatigue,6);assert.equal(coffee.mood,100);assert.equal(coffee.money,12900);
  assert.throws(()=>useItem(coffee,'coffee'),/本回合/);
  const holiday=useItem(coffee,'onsen');assert.equal(holiday.life.strain.fatigue,0);assert.equal(holiday.life.strain.streak,0);assert.equal(holiday.money,2900);
  assert.equal(s.life.strain.fatigue,8);assert.throws(()=>useItem(fresh(),'coffee'),/已满/);
});
test('actual pressure can end a run early; rest can complete; every phase replays',()=>{
  const endings=[];
  for(const strategy of ['pressure','rest'])for(const talent of ['defense','ambitious','optimistic']){
    let s=fresh({talent});replay(s);
    while(!s.ended){
      s=land(s,1);replay(s);
      const choices=legal(s).sort((a,b)=>(strategy==='rest'?1:-1)*(effortFor(s.active.number,a.i)-effortFor(s.active.number,b.i)));
      s=choose(s,choices[0].i);replay(s);assert.ok(s.money>=0&&s.mood>=0&&s.mood<=s.moodMax);
      s=advance(s);replay(s);
    }
    endings.push(s);if(strategy==='rest')assert.equal(s.ended,'complete');
  }
  assert.ok(endings.some(s=>s.ended==='mood'&&s.position<39));
});
test('strain is derived from commands and cannot be forged in a journal',()=>{
  const s=choose(land(fresh(),6),0),saved=snapshot(s);assert.equal(saved.extension.strain,undefined);
  assert.equal(restore({...saved,extension:{...saved.extension,strain:{fatigue:0}}}),null);
  assert.deepEqual(restore({...saved,strain:{fatigue:0},mood:999}),s);
});
test('server narration and communication practice accept the same schema 3 replay',()=>{
  let s=advance(choose(land(fresh(),6),0));s=choose(land(s,5),0);
  assert.deepEqual(validateNarrativeInput({kind:'event',game:snapshot(s)}),s);
  const checked=validatePracticeInput({game:snapshot(s),clientId:'rhythm_test_client_1234567890',turn:1,message:'先一起确认需要谁来支持，可以吗？'});
  assert.deepEqual(checked.state,s);assert.equal(checked.state.life.schema,3);
});
test('nine key scenes enrich intent independently of the eight clips; ordinary cards retain full backgrounds',()=>{
  assert.deepEqual(Object.keys(KEY_DETAILS).map(Number),[6,8,11,13,15,18,22,27,31]);
  for(const e of EVENTS){const s=at(e.number),card=eventMarkup(s),copy=eventCopy(e);
    assert.equal((card.match(/data-choice=/g)||[]).length,3);
    if(Object.hasOwn(KEY_DETAILS,e.number)){assert.ok(copy.detail);assert.equal((card.match(/class="choice-intention"/g)||[]).length,3);}
    else{assert.ok(copy.scene.length<e.scene.length,`${e.number}: concise scene`);assert.ok(card.includes(e.scene));assert.doesNotMatch(card,/class="choice-intention"/);}
  }
});
test('compact feedback retains actual full results and threshold branches',()=>{
  for(const e of EVENTS)for(let i=0;i<3;i++){
    const s=at(e.number,{money:1000000});const done=choose(s,i),h=done.history.at(-1),short=feedbackShort(h),card=feedbackMarkup(done,'',false);
    if(e.options[i].threshold)assert.equal(short,'');
    if(short){assert.ok(card.includes(h.result));assert.ok(short.length<h.result.length||short.length<=32,`${e.number}.${i}: concise feedback`);}
    assert.ok(card.includes(h.lesson));assert.match(card,/知乎经验回声/);
  }
});
test('mentor never reveals option outcomes, even in old journals or inventory',()=>{
  for(const lifeSchema of [1,2,3]){
    const s=useItem(at(13,{},lifeSchema),'mentor');
    const advice=mentorAdviceMarkup(s);assert.match(advice,/哪些条件已经确认/);
    for(const marker of ['资金','情绪','专业','将暂歇','条件已满足','+','%'])assert.ok(!advice.includes(marker));
    for(const o of s.active.options){assert.ok(!advice.includes(o.result));assert.ok(!advice.includes(o.lesson));}
    assert.doesNotMatch(inventoryMarkup(s),/mentor-options|按当前资源选择后|先比较下方/);
  }
  assert.doesNotMatch(companionMarkup(fresh()).match(/<div class="companion-actions">[\s\S]*?<\/div>/)[0],/\+\d/);
});
test('nudge is quiet, only for usable current items, with a two-turn cooldown',()=>{
  assert.equal(inventoryNudge(at(1)),null);
  const s=at(8);assert.equal(inventoryNudge(s).id,'earplugs');assert.equal(inventoryNudge(s,0),null);
  const low=at(11,{mood:40});assert.equal(inventoryNudge(low).id,'coffee');
  assert.equal(inventoryNudge(at(11)),null,'do not imply earplugs protect the old module');
  for(const id of Object.keys(low.life.inventory))low.life.inventory[id]=0;
  assert.equal(inventoryNudge(low),null);assert.equal(inventoryNudge({...s,ended:'mood'}),null);
  const hint=inventoryNudge(s);assert.ok(getInventory(s).find(x=>x.id===hint.id).usable);
  assert.match(inventoryNudgeMarkup(hint),/data-open-inventory/);assert.doesNotMatch(inventoryNudgeMarkup(hint),/\+\d|最佳|安全/);
  assert.equal(fatigueStatus(fresh({lifeSchema:2})),null);
});
