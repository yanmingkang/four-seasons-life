import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,land,choose,advance,previewChoice,snapshot,restore} from '../src/engine.js';
import {LEGACY_KEY,loadLegacy,claimLegacy,journeyFingerprint} from '../src/life-legacy.js';

function memory(){const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value),data};}
function finish(legacy){let state=newGame('full',{enriched:true,legacy});while(!state.ended){state=land(state,1);const best=state.active.options.map((option,index)=>({index,p:previewChoice(state,option)})).filter(option=>!option.p.disabled).sort((a,b)=>b.p.mood-a.p.mood||b.p.exp-a.p.exp)[0].index;state=advance(choose(state,best));}return state;}

test('legacy uses a separate key, only completed final screens settle, and one journal claims once',()=>{
  const storage=memory(),state=finish();storage.setItem('four-seasons-life-v4','untouched');
  assert.equal(loadLegacy(storage).completed,false);assert.equal(claimLegacy({...state,phase:'feedback'},storage).claimed,false);
  const result=claimLegacy(state,storage);assert.equal(result.claimed,true);assert.ok(storage.getItem(LEGACY_KEY));assert.equal(storage.getItem('four-seasons-life-v4'),'untouched');
  assert.equal(claimLegacy(state,storage).alreadyClaimed,true);assert.equal(loadLegacy(storage).claimedIds.length,1);
  assert.equal(journeyFingerprint(snapshot(state)),journeyFingerprint(snapshot(restore(snapshot(state)))));
});

test('inheritance is a fixed verified bonus and does not trust balances or compound across runs',()=>{
  const storage=memory();claimLegacy(finish(),storage);const legacy=loadLegacy(storage),state=newGame('full',{enriched:true,legacy});
  assert.equal(state.exp,15);assert.equal(state.moodMax,105);assert.equal(state.mood,105);assert.deepEqual(restore(snapshot(state)),state);
  const fake=newGame('full',{enriched:true,legacy:{expBonus:90000,moodMaxBonus:90000}});assert.equal(fake.exp,10);assert.equal(fake.moodMax,100);
  const second=finish(legacy);assert.equal(claimLegacy(second,storage).claimed,true);
  const again=newGame('full',{enriched:true,legacy:loadLegacy(storage)});assert.equal(again.exp,15);assert.equal(again.moodMax,105);
  assert.ok(new TextEncoder().encode(storage.getItem(LEGACY_KEY)).length<=8192);
});

test('legacy refuses forged finished states, unsupported proofs, corrupt storage and write failures',()=>{
  const storage=memory(),forged={...newGame('full',{enriched:true}),phase:'finished',ended:'complete',money:10000000};
  assert.equal(claimLegacy(forged,storage).claimed,false);
  for(const raw of ['{','x'.repeat(8193),JSON.stringify({schema:1,proof:snapshot(forged),claimedIds:[]})]){storage.setItem(LEGACY_KEY,raw);assert.equal(loadLegacy(storage).completed,false);}
  const blocked={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};assert.equal(loadLegacy(blocked).completed,false);assert.equal(claimLegacy(finish(),blocked).claimed,false);
  const legal=finish();storage.setItem(LEGACY_KEY,JSON.stringify({schema:1,proof:snapshot(legal),claimedIds:['untrusted']}));assert.equal(loadLegacy(storage).completed,false);
});

function fail(legacy){
  let state=newGame('full',{enriched:true,talent:'ambitious',legacy});
  while(!state.ended){
    state=land(state,1);
    const choice=state.active.options.map((option,index)=>({index,p:previewChoice(state,option),raw:option.mood,fill:option.fillMood})).filter(entry=>!entry.p.disabled).sort((a,b)=>(!!a.fill)-(!!b.fill)||a.raw-b.raw||a.p.mood-b.p.mood)[0].index;
    state=advance(choose(state,choice));
  }
  assert.equal(state.ended,'mood');return state;
}

test('a verified mood ending grants a fixed ten-point resilience inheritance with no professional bonus',()=>{
  const storage=memory(),ended=fail(),result=claimLegacy(ended,storage);
  assert.equal(result.claimed,true);assert.match(result.reason,/受挫抗体/);
  assert.equal(result.legacy.available,true);assert.equal(result.legacy.completed,false);assert.equal(result.legacy.failed,true);
  const state=newGame('full',{enriched:true,legacy:loadLegacy(storage)});
  assert.equal(state.exp,10);assert.equal(state.moodMax,110);assert.equal(state.mood,110);assert.deepEqual(state.life.legacyBonus,{exp:0,moodMax:10});
  assert.deepEqual(restore(snapshot(state)),state);
  assert.equal(claimLegacy(ended,storage).alreadyClaimed,true);
  assert.equal(claimLegacy(fail(loadLegacy(storage)),storage).claimed,true);
  assert.equal(newGame('full',{enriched:true,legacy:loadLegacy(storage)}).moodMax,110);
});

test('success and failure inheritance upgrades preserve both rewards in either order without nesting',()=>{
  for(const first of ['mood','complete']){
    const storage=memory();claimLegacy(first==='mood'?fail():finish(),storage);
    const second=first==='mood'?finish(loadLegacy(storage)):fail(loadLegacy(storage));
    const upgraded=claimLegacy(second,storage);assert.equal(upgraded.claimed,true,upgraded.reason);
    const legacy=loadLegacy(storage);assert.equal(legacy.completed,true);assert.equal(legacy.failed,true);
    assert.equal(legacy.expBonus,5);assert.equal(legacy.moodMaxBonus,10);assert.ok(legacy.upgrade);
    assert.equal(legacy.proof.extension.legacy,undefined);assert.equal(legacy.upgrade.proof.extension.legacy,undefined);
    const next=newGame('full',{enriched:true,legacy});assert.equal(next.exp,15);assert.equal(next.moodMax,110);assert.deepEqual(restore(snapshot(next)),next);
    assert.equal(claimLegacy(finish(legacy),storage).claimed,true);assert.equal(claimLegacy(fail(legacy),storage).claimed,true);
    assert.equal(loadLegacy(storage).expBonus,5);assert.equal(loadLegacy(storage).moodMaxBonus,10);
    assert.ok(new TextEncoder().encode(storage.getItem(LEGACY_KEY)).length<=8192);
  }
});

test('independent completed journeys combine with an existing failure proof and original schema-one records load',()=>{
  const storage=memory();claimLegacy(fail(),storage);assert.equal(claimLegacy(finish(),storage).claimed,true);
  assert.equal(loadLegacy(storage).upgrade.fromBase,false);assert.equal(loadLegacy(storage).completed,true);
  const next=newGame('full',{enriched:true,legacy:loadLegacy(storage)});assert.equal(next.moodMax,110);assert.equal(next.exp,15);assert.deepEqual(restore(snapshot(next)),next);
  let old=newGame('full',{enriched:true,lifeSchema:1});
  while(!old.ended){old=land(old,1);const best=old.active.options.map((o,index)=>({index,p:previewChoice(old,o)})).filter(e=>!e.p.disabled).sort((a,b)=>b.p.mood-a.p.mood)[0].index;old=advance(choose(old,best));}
  const proof=snapshot(old);storage.setItem(LEGACY_KEY,JSON.stringify({schema:1,proof,claimedIds:[journeyFingerprint(proof)]}));
  assert.equal(loadLegacy(storage).completed,true);assert.equal(loadLegacy(storage).moodMaxBonus,5);
  const inheritedOld=newGame('full',{enriched:true,lifeSchema:1,legacy:loadLegacy(storage)});assert.equal(inheritedOld.moodMax,105);assert.deepEqual(restore(snapshot(inheritedOld)),inheritedOld);
});

test('forged bonuses, invalid or nested upgrade dependencies and mismatched outcomes cannot grant inheritance',()=>{
  const storage=memory();claimLegacy(fail(),storage);claimLegacy(finish(loadLegacy(storage)),storage);
  const record=JSON.parse(storage.getItem(LEGACY_KEY));
  for(const mutate of [
    value=>{value.proof.phase='ready';},
    value=>{value.upgrade.proof.extension.legacy={proof:value.proof};},
    value=>{value.upgrade.proof.extension.actions=[['c',0]];},
    value=>{value.upgrade.fromBase='true';},
    value=>{value.upgrade.proof=structuredClone(value.proof);value.upgrade.fromBase=false;},
  ]){
    const invalid=structuredClone(record);mutate(invalid);storage.setItem(LEGACY_KEY,JSON.stringify(invalid));assert.equal(loadLegacy(storage).available,false);
    const state=newGame('full',{enriched:true,legacy:invalid});assert.equal(state.exp,10);assert.equal(state.moodMax,100);
  }
  const falsified={...fail(),ended:'complete'};assert.equal(claimLegacy(falsified,memory()).claimed,false);
});

test('a finishing schema-one inherited run can add a failure reward without changing its replay rules',()=>{
  const storage=memory();claimLegacy(finish(),storage);
  let state=newGame('full',{enriched:true,lifeSchema:1,talent:'ambitious',legacy:loadLegacy(storage)});
  while(!state.ended){state=land(state,1);const choice=state.active.options.map((o,index)=>({index,p:previewChoice(state,o),raw:o.mood,fill:o.fillMood})).filter(e=>!e.p.disabled).sort((a,b)=>(!!a.fill)-(!!b.fill)||a.raw-b.raw||a.p.mood-b.p.mood)[0].index;state=advance(choose(state,choice));}
  assert.equal(state.ended,'mood');assert.equal(state.life.schema,1);assert.deepEqual(restore(snapshot(state)),state);
  const result=claimLegacy(state,storage);assert.equal(result.claimed,true,result.reason);assert.equal(loadLegacy(storage).completed,true);assert.equal(loadLegacy(storage).failed,true);
  const next=newGame('full',{enriched:true,legacy:loadLegacy(storage)});assert.equal(next.life.schema,4);assert.equal(next.exp,15);assert.equal(next.moodMax,110);assert.deepEqual(restore(snapshot(next)),next);
});
