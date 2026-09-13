import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, rollDice, land, choose, advance, previewChoice, snapshot, restore, RULES, SAVE_VERSION, summarize } from '../src/engine.js';
import { routeFor } from '../src/route.js';
import { EVENTS } from '../src/events.js';
import { SOURCES } from '../src/sources.js';

const at=(number,resources={},talent='defense')=>land({...newGame('full',{talent}),position:number-2,...resources},1);
const best=s=>s.active.options.map((o,index)=>({index,p:previewChoice(s,o)})).filter(x=>!x.p.disabled).sort((a,b)=>b.p.mood-a.p.mood || b.p.exp-a.p.exp)[0].index;

test('40 authored places have complete resources, sources, short locations and eight cinematic hooks',()=>{
  assert.equal(EVENTS.length,40); assert.equal(new Set(EVENTS.map(e=>e.id)).size,40);
  assert.deepEqual(EVENTS.filter(e=>e.cinematicId).map(e=>e.number),[6,8,11,15,18,22,27,31]);
  assert.deepEqual(EVENTS.filter(e=>e.golden).map(e=>e.number),[10,20,30]);
  for(const [i,e] of EVENTS.entries()) {
    assert.equal(e.number,i+1); assert.equal(e.season,Math.floor(i/10));
    assert.ok(e.location.length>=3 && e.location.length<=6); assert.ok(e.sources.length);
    assert.equal(e.options.length,3); assert.equal(e.isChoice,true);
    assert.equal(new Set(e.options.map(o=>o.label)).size,3); assert.equal(new Set(e.options.map(o=>o.result)).size,3);
    assert.equal(new Set(e.options.map(o=>JSON.stringify([o.money,o.mood,o.exp,o.fillMood,o.moodMaxBonus,o.threshold]))).size,3);
    for(const id of e.sources) assert.match(SOURCES[id].url,/^https:\/\/(www|zhuanlan)\.zhihu\.com\//);
    for(const o of e.options) for(const key of ['money','mood','exp']) assert.ok(Number.isInteger(o[key]),`${e.id}:${key}`);
    for(const o of e.options) {
      assert.ok(o.result && o.lesson && o.label && o.style && o.description);
      assert.doesNotMatch([e.prompt,o.label,o.description].join(' '),/[+−-]\s*\d|\d+\s*(?:元|点|%|情绪|专业)|归零|提前结束|上限增加|恢复到上限/);
    }
  }
  assert.equal(EVENTS[7].options.length,3); assert.equal(EVENTS[7].cinematicId,'cell-08');
  assert.equal(EVENTS[12].options.length,3); assert.equal(EVENTS[12].cinematicId,null);
});

test('routes are immutable and every event index exists',()=>{
  assert.deepEqual(routeFor('full'),Array.from({length:40},(_,i)=>i));
  assert.deepEqual(routeFor('demo'),[0,5,9,10,12,14,17,19,21,26,30,39]);
  for(const mode of ['full','demo']) {
    const route=routeFor(mode),s=newGame(mode);
    assert.equal(route.at(-1),39); assert.equal(s.position,-1); assert.equal(s.total,route.length);
    assert.deepEqual([s.money,s.mood,s.exp],[5000,100,10]); assert.equal(new Set(route).size,route.length);
    for(const i of route) assert.ok(EVENTS[i]); assert.throws(()=>{route[0]=99;});
  }
  assert.throws(()=>newGame('unknown')); assert.throws(()=>newGame('full',{talent:'cheat'}));
});

test('six equally sized die bins reject invalid input',()=>{
  for(let n=1;n<=6;n++) assert.equal(rollDice(()=>((n-1)+0.5)/6),n);
  for(const n of [-1,1,NaN]) assert.throws(()=>rollDice(()=>n));
  for(const n of [0,7,1.5,NaN]) assert.throws(()=>land(newGame(),n));
});

test('all die targets advance monotonically and clamp to endpoint without missing events',()=>{
  for(const mode of ['full','demo']) for(let position=-1;position<routeFor(mode).length-1;position++) for(let die=1;die<=6;die++) {
    const s=land({...newGame(mode),position},die),target=Math.min(position+die,s.total-1);
    assert.equal(s.position,target); assert.ok(s.position>position); assert.strictEqual(s.active,EVENTS[routeFor(mode)[target]]);
    assert.equal(s.season,s.active.season); assert.equal(s.phase,'choice'); assert.equal(s.ended,null);
  }
});

test('passing cells does not resolve them; no old global living cost or fatigue',()=>{
  const a=land(newGame(),5); assert.equal(a.position,4); assert.equal(a.history.length,0);
  assert.strictEqual(land(a,2),a); assert.equal(a.money,5000); assert.equal(a.exp,10);
  const b=choose(a,0); assert.strictEqual(choose(b,0),b); assert.equal(b.money,5000); assert.equal(b.mood,100); assert.equal(b.exp,20);
  assert.equal(b.history.length,1); assert.equal(b.history[0].tile,4); assert.equal(RULES.livingCost,0); assert.equal(RULES.fatigue,0);
});

test('season boundary does not loop or teleport backwards',()=>{
  const a=advance(choose(at(9,{exp:30}),0)),s=land(a,6);
  assert.equal(a.position,8); assert.equal(s.position,14); assert.equal(s.season,1); assert.equal(s.active.id,'cell-15');
  assert.deepEqual(choose(s,1).history.map(h=>h.tile),[8,14]);
});

test('all available previews settle exactly, including three ledger resources and mood caps',()=>{
  for(const talent of ['defense','ambitious','optimistic']) for(const e of EVENTS) for(let i=0;i<e.options.length;i++) {
    const s=at(e.number,{money:1000000,mood:95,exp:160},talent),p=previewChoice(s,e.options[i]),out=choose(s,i),h=out.history.at(-1);
    for(const key of ['money','mood','exp']) {assert.equal(out[key],p[key]); assert.equal(h[`${key}Delta`],out[key]-s[key]); assert.equal(h.before[key],s[key]);}
    assert.equal(h.result,p.result); assert.ok(out.money>=0 && out.exp>=0 && out.mood>=0 && out.mood<=out.moodMax);
    assert.equal(out.history.length,1);
  }
});

test('zero money can continue but zero mood ends; zero is not a free expensive option',()=>{
  const zero=choose(at(18,{money:5000}),1); assert.equal(zero.money,0); assert.equal(zero.ended,null); assert.equal(advance(zero).phase,'ready');
  for(const number of EVENTS.map(e=>e.number)) {
    const s=at(number,{money:0}); let enabled=0;
    s.active.options.forEach((o,index)=>{const p=previewChoice(s,o); if(o.money<0){assert.ok(p.disabled); assert.match(p.disabledReason,/储备金不足/); assert.throws(()=>choose(s,index));}else enabled++;});
    assert.ok(enabled>0,`no cash route at ${number}`);
  }
  const ended=choose(at(4,{mood:15,money:0}),0); assert.equal(ended.ended,'mood');
  const finished=advance(ended); assert.equal(finished.phase,'finished'); assert.strictEqual(land(finished,6),finished);
});

test('both home-planning and small-scale exploration choices remain affordable from real balances',()=>{
  for(const money of [0,5000,300000]) {
    const state=at(30,{money,mood:50});
    for(const [i,option] of state.active.options.entries()) {
      const p=previewChoice(state,option); assert.equal(p.disabled,false); assert.equal(p.moneyDelta,0);
      assert.equal(choose(state,i).money,money);
    }
    const planning=choose(state,0); assert.equal(planning.mood,75); assert.match(planning.history[0].result,/并没有购买房屋/);
    assert.equal(choose(state,1).exp,30);
  }
});

test('endpoint resolves once, and mood exhaustion takes precedence over completion',()=>{
  for(const mode of ['full','demo']) {
    const arrived=land({...newGame(mode),position:routeFor(mode).length-2,money:0},6);
    assert.equal(arrived.phase,'choice'); assert.equal(arrived.ended,null);
    const done=choose(arrived,0); assert.equal(done.ended,'complete'); assert.equal(done.money,0);
    assert.equal(choose({...arrived,mood:0},0).ended,'mood');
    const finished=advance(done); assert.strictEqual(choose(finished,0),finished);
  }
});

test('professional thresholds have deterministic, disclosed preparation paths',()=>{
  for(const [number,threshold,reward] of [[6,30,25],[8,30,10],[9,30,30],[17,70,35],[34,150,10]]) {
    const low=at(number,{exp:threshold-1}),high=at(number,{exp:threshold});
    const p=previewChoice(low,low.active.options[0]); assert.match(p.conditionNote,/条件未满足/); assert.equal(p.disabled,false);
    assert.equal(previewChoice(high,high.active.options[0]).expDelta,reward);
    assert.deepEqual(choose(low,0),choose(low,0)); assert.equal(advance(choose(low,0)).phase,'ready');
  }
  assert.equal(previewChoice(at(6,{exp:29}),EVENTS[5].options[0]).moodDelta,-10);
  assert.equal(previewChoice(at(8,{exp:29}),EVENTS[7].options[0]).moodDelta,-5);
});

test('three talents are bounded, transparent and leave actual ledger effects',()=>{
  let s=choose(at(13,{mood:60},'defense'),0); assert.equal(s.mood,60); assert.equal(s.memoUsed,true); assert.match(s.history[0].talentNote,/备忘录/);
  s=choose({...at(13,{mood:60},'defense'),memoUsed:true},0); assert.equal(s.mood,50);
  const a=choose(at(11,{mood:100},'ambitious'),0); assert.equal(a.exp,34); assert.equal(a.mood,83);
  const start={...newGame('full',{talent:'optimistic'}),position:8,season:0,mood:50};
  const crossing=land(start,2),p=previewChoice(crossing,crossing.active.options[1]);
  assert.equal(p.moodDelta,20); assert.match(p.talentNote,/跨季恢复/); assert.equal(choose(crossing,1).seasonRecovery,0);
  assert.equal(choose(at(18,{exp:0}),0).exp,0);
});

test('dynamic mood maximum grows only from the settled reward',()=>{
  const s=at(38,{mood:30}),p=previewChoice(s,s.active.options[0]); assert.equal(p.moodMax,110); assert.equal(p.mood,110);
  const a=choose(s,0); assert.equal(a.moodMax,110); assert.strictEqual(choose(a,0),a);
  assert.equal(choose(at(39,{moodMax:110,mood:100}),0).mood,110);
});

test('dice distance controls session length, not a hidden fixed turn count',()=>{
  for(const [mode,rolls] of [['full',7],['demo',2]]) {
    let s=newGame(mode);
    while(!s.ended) {s=land(s,6); s=advance(choose(s,best(s)));}
    assert.equal(s.ended,'complete'); assert.equal(s.turn,rolls); assert.equal(s.position,s.total-1);
  }
});

test('version 4 replays all phases, names, talents and dynamic caps; old records fail closed',()=>{
  for(const mode of ['full','demo']) for(const talent of ['defense','ambitious','optimistic']) {
    let s=newGame(mode,{name:'测试旅人',talent}); const stages=[s];
    while(!s.ended){s=land(s,1);stages.push(s);s=choose(s,best(s));stages.push(s);s=advance(s);stages.push(s);}
    for(const stage of stages) assert.deepEqual(restore(snapshot(stage)),stage);
    assert.equal(s.ended,'complete'); assert.equal(snapshot(s).version,4); assert.equal(SAVE_VERSION,4);
    assert.equal(restore({...snapshot(s),moves:[...snapshot(s).moves,{die:1,choice:0}]}),null);
    for(const version of [1,2,3]) assert.equal(restore({...snapshot(s),version}),null);
  }
  const saved=snapshot(newGame());
  for(const tamper of [{phase:'choice',pendingDie:8},{moves:[{die:1,choice:99}]},{talent:'fake'},{name:'<script>'},{pendingDie:1}]) assert.equal(restore({...saved,...tamper}),null);
});

test('summary contains only landed places and actual choices, plus professional progress',()=>{
  let s=newGame('demo'); for(let i=0;i<2;i++){s=land(s,6);s=advance(choose(s,best(s)));}
  const report=summarize(s); assert.deepEqual(report.seasons,['夏','冬']); assert.ok(report.sourceIds.length);
  assert.deepEqual(s.history.map(h=>h.tile),[14,39]); assert.equal(report.keyChoices.length,2);
  assert.ok(report.professionalTier); assert.equal(report.observations.length,3);
});

test('every v4 decision including formerly fixed scenes contributes to the actual preference record',()=>{
  let s=newGame('full');
  // The first five stops now have alternatives and are real decisions too.
  for(let i=0;i<6;i++){s=land(s,1);s=advance(choose(s,i===5?1:0));}
  const report=summarize(s);
  assert.equal(s.history.length,6); assert.equal(report.keyChoices.length,6);
  assert.deepEqual(report.counts,{evidence:3,connect:2,boundary:1}); assert.equal(report.style,'认真求证');
  assert.equal(report.sourceIds.length,new Set(s.history.flatMap(h=>h.sources)).size);
});

test('before any decision there is no inferred preference; the third option survives save and server replay',()=>{
  const empty=summarize(newGame());
  assert.deepEqual(empty.counts,{}); assert.deepEqual(empty.keyChoices,[]); assert.equal(empty.style,'尚未经历分叉选择');
  for(const mode of ['full','demo']) for(const talent of ['defense','ambitious','optimistic']) {
    let state=newGame(mode,{talent});
    while(!state.ended) {
      state=land(state,1);
      const index=previewChoice(state,state.active.options[2]).disabled?0:2;
      state=choose(state,index);
      assert.deepEqual(restore(snapshot(state)),state);
      assert.equal(state.history.at(-1).choiceLabel,state.active.options[index].label);
      state=advance(state);
      assert.ok(state.turn<=state.total && state.money>=0 && state.exp>=0 && state.mood>=0 && state.mood<=state.moodMax);
    }
    assert.equal(state.phase,'finished');
    assert.equal(summarize(state).keyChoices.length,state.turn);
  }
});
