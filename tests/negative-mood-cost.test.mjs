import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {EVENTS} from '../src/events.js';
import {newGame,land,choose,advance,previewChoice,snapshot,restore,interactBusiness} from '../src/engine.js';
import {LIFE_SCHEMA,LIFE_SCHEMAS} from '../src/life-systems.js';
import {resolveRhythmOption,settleStrain} from '../src/journey-rhythm.js';
import {validateNarrativeInput} from '../server/ai-core.mjs';
import {validatePracticeInput} from '../server/practice.mjs';
import {eventMarkup} from '../src/presentation.js';

const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Captured before schema 4 existed, using the exact legal command walk below.
// These freeze resources, full historical text, branches, drops and protection,
// not merely a self-consistent new-engine snapshot round trip.
const FROZEN=[
  {enriched:true,talent:'defense',state:'a421eeb396be38a4f811bd35590c3d2ee356608c4483795fa7c47c7c9ca8854a',save:'91b853ef2c323903d8989b02425e3577fee4faf08f8b68f771a1df513d14a91c'},
  {enriched:true,talent:'ambitious',state:'fe20e399721737a0d136cfd9a645c74b147775313da0c07bb1c5409ad0ce2126',save:'d7b5f11bae96208f35d53807623639a7dbdbda56a00797106d4e569aa18f3343'},
  {enriched:true,talent:'optimistic',state:'76ed6ddbd00ea5fc480cb8dad9b2b585a1e5f916e5ecc0f4c495adbd7182d544',save:'bd4a2af29241b569b5592a55b96f7fc92696457cf8c6fd3e14131ce184bab81a'},
  {enriched:false,talent:'defense',state:'08ab05cf3c8a0637f4521a83e532e4d3755d92049bb282848729cd3d349360c2',save:'24f1a987eac821b8fd1e77eb4b728f4790ad4c5092a6c76b429c9da2c4a1f0b4'},
  {enriched:false,talent:'ambitious',state:'168f418f56156f7d3f75889407f1b86f76a324e60ad3fc027f48be1c2f0c7b00',save:'ac16b9670406af472037c61c1f298fdbc9a79cd9cd34363ed23ec80e90e23ff5'},
  {enriched:false,talent:'optimistic',state:'fd4818fb5216bbcf2e2b442bd2c8a348d68c86aeb29c921d6197755ef05508d0',save:'ca5038677b949320cb7967e766a99786c885a31c7261b6e7e856ba00e3a8df6c'},
];
const EVENTS_HASH='cb707a9f608479df0f98fade051f26dcebf6c9e335178b2b678904949f411f3a';
function legalIndex(state){
  let index=state.active.number%3;
  for(let tries=0;tries<3;tries++,index=(index+1)%3)if(!previewChoice(state,state.active.options[index]).disabled)return index;
  assert.fail('Every visited event needs an affordable option');
}
function completeCommands(options,onState=()=>{}){
  let state=newGame('full',options);onState(state);
  while(!state.ended){
    assert.ok(state.turn<40);state=land(state,1);onState(state);
    state=choose(state,legalIndex(state));onState(state);
    state=advance(state);onState(state);
  }
  return state;
}
// Isolated arithmetic fixture, not a claimed playable saved journey. Extra
// reserve avoids clamps/rescue obscuring the exact base-cost comparison.
function at(number,schema=4,{talent='defense',exp=999,mood=200,moodMax=1000,money=1000000,fatigue=0,streak=0}={}){
  const state=newGame('full',{enriched:true,lifeSchema:schema,talent});
  for(const id of Object.keys(state.life.inventory))state.life.inventory[id]=0;
  state.life.treeholeUsed=true;state.life.strain={fatigue,streak};state.memoUsed=true;
  return land({...state,position:number-2,season:EVENTS[number-1].season,money,mood,moodMax,exp},1);
}
const resolvedBranch=(option,kind)=>kind?{...option,...option.threshold[kind]}:option;

test('schema 4 is only the new enriched default, not a rewrite of base/old saved shapes',()=>{
  assert.equal(LIFE_SCHEMA,4);assert.deepEqual(LIFE_SCHEMAS,[1,2,3,4]);
  assert.equal(newGame('full',{enriched:true}).life.schema,4);
  for(const lifeSchema of [1,2,3,4]){
    const state=newGame('full',{enriched:true,lifeSchema});assert.equal(state.life.schema,lifeSchema);
    assert.deepEqual(restore(snapshot(state)),state);
    if(lifeSchema<3)assert.equal(state.life.strain,undefined);
  }
  const base=newGame();assert.equal(base.life,undefined);assert.equal(snapshot(base).extension,undefined);
  assert.throws(()=>newGame('full',{enriched:true,lifeSchema:5}));
});

for(const frozen of FROZEN)test(`pre-change full journal stays identical: ${frozen.enriched?'schema 3':'base'}, ${frozen.talent}`,()=>{
  const state=completeCommands({enriched:frozen.enriched,lifeSchema:3,talent:frozen.talent});
  assert.equal(state.turn,40);assert.equal(state.ended,'complete');
  assert.equal(hash(state),frozen.state);assert.equal(hash(snapshot(state)),frozen.save);
  assert.deepEqual(restore(snapshot(state)),state);
});

test('all 120 authored base options change only negative mood by exactly five',()=>{
  let total=0,negative=0;
  for(const event of EVENTS)for(const [index,option] of event.options.entries()){
    const original=structuredClone(option),old=resolveRhythmOption(at(event.number,3),option,index);
    const next=resolveRhythmOption(at(event.number,4),option,index),decrement=old.mood<0?5:0;
    assert.deepEqual(next,{...old,mood:old.mood-decrement},`base ${event.number}.${index}`);
    assert.deepEqual(option,original,'Resolver must not mutate shared event data');
    total++;if(decrement)negative++;
  }
  assert.equal(total,120);assert.equal(negative,45);assert.equal(hash(EVENTS),EVENTS_HASH);
});

test('every threshold success/failure resolves first; only the two negative failure branches change',()=>{
  let branches=0;const negative=[];
  for(const event of EVENTS)for(const [index,option] of event.options.entries())if(option.threshold){
    for(const kind of ['success','failure']){
      const exp=kind==='success'?option.threshold.exp:option.threshold.exp-1;
      const oldState=at(event.number,3,{exp}),newState=at(event.number,4,{exp});
      const branch=resolvedBranch(option,kind),oldResolved=resolveRhythmOption(oldState,branch,index);
      const decrement=oldResolved.mood<0?5:0;
      assert.deepEqual(resolveRhythmOption(newState,branch,index),{...oldResolved,mood:oldResolved.mood-decrement},`${event.number}.${index} ${kind}`);
      const old=previewChoice(oldState,oldState.active.options[index]),next=previewChoice(newState,newState.active.options[index]);
      assert.equal(old.eligible,kind==='success');assert.equal(next.eligible,old.eligible);
      assert.equal(next.mood,old.mood-decrement);assert.equal(next.money,old.money);assert.equal(next.exp,old.exp);
      assert.equal(next.conditionNote,old.conditionNote);assert.equal(next.result,old.result);assert.equal(next.lesson,old.lesson);
      branches++;if(decrement)negative.push([event.number,index,kind]);
    }
  }
  assert.equal(branches,10);assert.deepEqual(negative,[[6,0,'failure'],[8,0,'failure']]);
});

test('all real preview branches preserve money, professional gains, recovery, text, fatigue and availability',()=>{
  let branches=0;
  for(const event of EVENTS)for(const [index,option] of event.options.entries())for(const kind of option.threshold?['success','failure']:[null]){
    const exp=kind==='failure'?option.threshold.exp-1:999;
    const oldState=at(event.number,3,{exp}),newState=at(event.number,4,{exp});
    const branch=resolvedBranch(option,kind),base=resolveRhythmOption(oldState,branch,index);
    const old=previewChoice(oldState,oldState.active.options[index]),next=previewChoice(newState,newState.active.options[index]);
    const label=`preview ${event.number}.${index} ${kind||'ordinary'}`;
    assert.equal(next.mood,old.mood-(base.mood<0?5:0),label);
    for(const key of ['money','moneyDelta','exp','expDelta','moodMax','disabled','disabledReason','eligible','result','lesson','conditionNote'])assert.deepEqual(next[key],old[key],`${label} ${key}`);
    assert.deepEqual(next.lifePreview.strain,old.lifePreview.strain,`${label} fatigue`);branches++;
  }
  assert.equal(branches,125);assert.equal(hash(EVENTS),EVENTS_HASH);
});

test('zero base mood does not acquire a penalty merely because fatigue later consumes mood',()=>{
  const old=at(2,3,{fatigue:8,streak:3}),next=at(2,4,{fatigue:8,streak:3});
  assert.equal(next.active.options[0].mood,0);
  const before=previewChoice(old,old.active.options[0]),after=previewChoice(next,next.active.options[0]);
  assert.equal(after.moodDelta,-14);assert.equal(after.mood,before.mood);
  assert.deepEqual(after.lifePreview.strain,before.lifePreview.strain);
});

test('the extra base cost precedes talent multipliers, including the existing rounding',()=>{
  // 13.0 has a -10 threshold-independent base. Ambitious -10 becomes -11;
  // the updated -15 becomes -17, so the net difference can be 6, not always 5.
  for(const talent of ['defense','ambitious','optimistic']){
    const old=at(13,3,{talent}),next=at(13,4,{talent});
    assert.equal(next.active.options[0].mood,-10);
    const before=previewChoice(old,old.active.options[0]),after=previewChoice(next,next.active.options[0]);
    assert.equal(before.moodDelta,talent==='ambitious'?-11:-10);
    assert.equal(after.moodDelta,talent==='ambitious'?-17:-15);
    assert.equal(after.exp,before.exp);
  }
});

test('memo and long-term protection still act on the adjusted incident; fatigue is added once afterward',()=>{
  const protectedState=at(13,4,{fatigue:8,streak:3});protectedState.life.buffs.memo=true;
  const memo=previewChoice(protectedState,protectedState.active.options[0]);
  assert.equal(memo.moodDelta,-14);assert.equal(memo.lifePreview.buffs.memo,false);
  assert.deepEqual(memo.lifePreview.strain,{fatigue:10,streak:4});
  assert.equal(protectedState.life.buffs.memo,true,'Preview leaves inventory protection untouched');
  const old=at(13,3,{fatigue:8,streak:3}),next=at(13,4,{fatigue:8,streak:3});
  old.life.buffs.longTerm=true;next.life.buffs.longTerm=true;
  const before=previewChoice(old,old.active.options[0]),after=previewChoice(next,next.active.options[0]);
  assert.equal(before.moodDelta,-8-14);assert.equal(after.moodDelta,-12-14);
  assert.deepEqual(after.lifePreview.strain,before.lifePreview.strain);
});

test('normal recovery and the rare full holiday are unchanged from schema 3',()=>{
  for(const number of [12,24,35,38,39]){
    const old=at(number,3,{mood:35,moodMax:100,fatigue:8,streak:3}),next=at(number,4,{mood:35,moodMax:100,fatigue:8,streak:3});
    const before=previewChoice(old,old.active.options[0]),after=previewChoice(next,next.active.options[0]);
    assert.equal(after.mood,before.mood);assert.equal(after.moodMax,before.moodMax);
    assert.deepEqual(after.lifePreview.strain,before.lifePreview.strain);
  }
  assert.deepEqual(settleStrain({fatigue:8,streak:3},2),{strain:{fatigue:10,streak:4},cost:14,change:2});
});

test('independent business actions are not event options and keep their existing costs',()=>{
  const old=at(29,3),next=at(29,4);
  old.life.business.stage='idea';next.life.business.stage='idea';
  const before=interactBusiness(old,'test'),after=interactBusiness(next,'test');
  assert.equal(after.mood,next.mood-5);assert.equal(after.money,next.money-2000);
  for(const key of ['money','mood','exp'])assert.equal(after[key],before[key]);
  assert.deepEqual(after.life.strain,before.life.strain);
});

test('repeated previews never compound the new debit or mutate either state or event data',()=>{
  const state=land(newGame('full',{enriched:true,lifeSchema:4}),6),saved=structuredClone(state),option=state.active.options[0];
  const expected=previewChoice(state,option);
  for(let n=0;n<25;n++)assert.deepEqual(previewChoice(state,option),expected);
  assert.deepEqual(state,saved);assert.equal(hash(EVENTS),EVENTS_HASH);
  const settled=choose(state,0);assert.equal(settled.mood,expected.mood);assert.equal(settled.history.at(-1).moodDelta,expected.moodDelta);
  assert.deepEqual(choose(settled,0),settled);assert.deepEqual(restore(snapshot(settled)),settled);
  const card=eventMarkup(state);assert.equal((card.match(/data-choice=/g)||[]).length,3);
  assert.doesNotMatch(card,/choice-effects|condition-note/);
});

for(const talent of ['defense','ambitious','optimistic'])test(`schema 4 legal command replay agrees with server validation: ${talent}`,()=>{
  const final=completeCommands({enriched:true,lifeSchema:4,talent},state=>{
    assert.deepEqual(restore(snapshot(state)),state);
    if(state.phase==='feedback')assert.deepEqual(validateNarrativeInput({kind:'event',game:snapshot(state)}),state);
  });
  assert.deepEqual(validateNarrativeInput({kind:'summary',game:snapshot(final)}),final);
  assert.equal(final.life.schema,4);assert.ok(['complete','mood'].includes(final.ended));
});

test('schema 4 communication practice validates the same genuine settled game, without a request',()=>{
  let state=newGame('full',{enriched:true,lifeSchema:4});
  state=advance(choose(land(state,6),1));state=choose(land(state,5),0);
  const input={game:snapshot(state),clientId:'negative_mood_regression_123456',turn:1,message:'我们先一起确认交付范围和分工，好吗？'};
  const checked=validatePracticeInput(input);assert.deepEqual(checked.state,state);assert.equal(checked.state.life.schema,4);
  assert.equal(restore({...input.game,extension:{...input.game.extension,schema:5}}),null);
});

test('schema 4 may inherit a verified schema 3 journey without rewriting its proof',()=>{
  const old=completeCommands({enriched:true,lifeSchema:3,talent:'defense'}),proof=snapshot(old),frozen=structuredClone(proof);
  const next=newGame('full',{enriched:true,lifeSchema:4,legacy:{proof}});
  assert.deepEqual(proof,frozen);assert.equal(next.life.legacyProof.extension.schema,3);
  assert.equal(next.exp,15);assert.equal(next.moodMax,105);assert.equal(next.mood,105);
  assert.deepEqual(restore(snapshot(next)),next);
});
