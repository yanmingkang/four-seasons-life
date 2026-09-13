import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,land,choose,advance,previewChoice,snapshot,restore,feedbackSnapshot,settledFeedback,useItem,interactCompanion,purchaseHome,getHome,getBusiness,interactBusiness,getInventory,getCompanion,summarize} from '../src/engine.js';
import {narrationKey} from '../src/ai-client.js';
import {MAX_BODY_BYTES,createNarrator,narrativePrompt,validateNarrativeInput,lifeNarrativeContext} from '../server/ai-core.mjs';
import {practicePrompt,validatePracticeInput} from '../server/practice.mjs';
import {claimLegacy,loadLegacy} from '../src/life-legacy.js';

const answer=JSON.stringify({choices:[{message:{content:'刘看山记下这次已经发生的取舍，也提醒你把能承担的安排说具体。'}}]});
const best=state=>state.active.options.map((option,index)=>({index,p:previewChoice(state,option)})).filter(entry=>!entry.p.disabled).sort((a,b)=>b.p.mood-a.p.mood||b.p.exp-a.p.exp)[0].index;
function journey(legacy){
  let state=newGame('full',{enriched:true,legacy});
  while(!state.ended){
    state=land(state,1);
    if(getCompanion(state).canInteract)state=interactCompanion(state,'promise');
    if([4,13,27,31].includes(state.active.number))for(const id of ['memo','earplugs','mentor','legal'])if(getInventory(state).find(item=>item.id===id).usable)state=useItem(state,id);
    state=choose(state,({10:0,20:0,27:0,29:0,30:0})[state.active.number]??best(state));
    if(getHome(state).canBuy)state=purchaseHome(state);
    if(getBusiness(state).canTest)state=interactBusiness(state,'test');else if(getBusiness(state).canLaunch)state=interactBusiness(state,'launch');
    if(!state.ended)for(const item of getInventory(state))if(item.usable && ['coffee','onsen','communication'].includes(item.id))state=useItem(state,item.id);
    state=advance(state);
  }
  return state;
}

test('finished scene reconstruction removes only final advance and preserves all life actions',()=>{
  const state=journey(),feedback=settledFeedback(state),saved=feedbackSnapshot(state);
  assert.equal(feedback.phase,'feedback');assert.equal(feedback.active.id,'cell-40');assert.equal(feedback.money,state.money);assert.deepEqual(feedback.life.loan,state.life.loan);assert.deepEqual(feedback.life.business,state.life.business);
  assert.equal(saved.extension.actions.length,snapshot(state).extension.actions.length-1);
  assert.deepEqual(feedback.life.usedItems,state.life.usedItems);assert.deepEqual(feedback.life.companion,state.life.companion);
  assert.ok(narrativePrompt('event',state).includes(state.history.at(-1).result));
});

test('independent life actions reconcile all resource changes without becoming fictitious stops',()=>{
  const state=journey(),records=[...state.history,...state.life.transactions];
  for(const [key,initial] of [['money',5000],['mood',100],['exp',10]])assert.equal(initial+records.reduce((sum,record)=>sum+record[`${key}Delta`],0),state[key],key);
  assert.equal(state.history.length,state.turn);assert.ok(state.history.includes(summarize(state).highestCost));
  assert.equal(state.life.transactions.filter(record=>record.moneyDelta<0).sort((a,b)=>a.moneyDelta-b.moneyDelta)[0].moneyDelta,-60000);
  assert.ok(state.life.transactions.some(record=>record.kind==='business' && record.moneyDelta===-8000));assert.ok(state.life.transactions.some(record=>record.kind==='item' && record.moneyDelta===-10000));
  assert.deepEqual(restore(snapshot(state)).life.transactions,state.life.transactions);
});

test('both browser and server narration caches distinguish tool and companion commands',async()=>{
  const before=choose(land(newGame('full',{enriched:true}),4),0),after=useItem(before,'coffee');
  assert.notEqual(narrationKey('event',snapshot(before)),narrationKey('event',snapshot(after)));
  const talking=interactCompanion(after,'share');assert.notEqual(narrationKey('event',snapshot(after)),narrationKey('event',snapshot(talking)));
  let calls=0;const ai=createNarrator({execute:async()=>{calls++;return answer;}});
  assert.equal((await ai.narrate({kind:'event',game:snapshot(before)})).mode,'live');
  assert.equal((await ai.narrate({kind:'event',game:snapshot(after)})).mode,'live');assert.equal(calls,2);
  const ended=journey();
  assert.equal(narrationKey('summary',snapshot(ended)),narrationKey('summary',feedbackSnapshot(ended)));
  assert.equal((await ai.narrate({kind:'summary',game:snapshot(ended)})).mode,'live');
  assert.equal((await ai.narrate({kind:'summary',game:feedbackSnapshot(ended)})).mode,'cache');assert.equal(calls,3);
});

test('narration receives bounded verified causes, asset facts and no invented early memories',()=>{
  const state=journey(),game=snapshot(state);game.money=999999999;game.life={flags:{spring:{choice:99}},companion:{name:'INJECTED_PERSON'},loan:{remaining:0}};
  const verified=validateNarrativeInput({kind:'summary',game}),context=lifeNarrativeContext(verified,'summary');
  assert.equal(context.home.purchased,true);assert.ok(context.home.remaining>0);assert.equal(context.business.stage,'operating');assert.equal(context.rememberedDecisions.length,3);
  assert.ok(context.causes.length<=6);assert.ok(Buffer.byteLength(JSON.stringify(context),'utf8')<6000);
  const prompt=narrativePrompt('summary',verified);assert.doesNotMatch(prompt,/INJECTED_PERSON|999999999/);assert.match(prompt,/只可说规划/);
  const skipped=choose(land(newGame('full',{enriched:true}),6),1);assert.deepEqual(lifeNarrativeContext(skipped,'event').rememberedDecisions,[]);assert.deepEqual(lifeNarrativeContext(skipped,'event').causes,[]);
});

test('the 8192-byte request envelope accommodates a fully used inherited route',()=>{
  const storage={raw:null,getItem(){return this.raw;},setItem(key,value){this.raw=value;}};
  assert.equal(claimLegacy(journey(),storage).claimed,true);
  const state=journey(loadLegacy(storage));assert.ok(state.life.legacyProof);
  const body=JSON.stringify({kind:'summary',game:snapshot(state)});
  assert.ok(Buffer.byteLength(body,'utf8')<=MAX_BODY_BYTES,`request was ${Buffer.byteLength(body,'utf8')} bytes`);
  assert.ok(restore(snapshot(state)));
});

test('failure and combined inheritance reach the narrator with replay-verified initial resources',async()=>{
  const storage={raw:null,getItem(){return this.raw;},setItem(key,value){this.raw=value;}};
  let failed=newGame('full',{enriched:true,talent:'ambitious'});
  while(!failed.ended){
    failed=land(failed,1);
    const choice=failed.active.options.map((option,index)=>({index,p:previewChoice(failed,option),mood:option.mood,fill:option.fillMood})).filter(entry=>!entry.p.disabled).sort((a,b)=>(!!a.fill)-(!!b.fill)||a.mood-b.mood||a.p.mood-b.p.mood)[0].index;
    failed=advance(choose(failed,choice));
  }
  assert.equal(failed.ended,'mood');assert.equal(claimLegacy(failed,storage).claimed,true);
  const failureLegacy=loadLegacy(storage);assert.equal(failureLegacy.completed,false);assert.equal(failureLegacy.failed,true);
  const successAfterFailure=journey(failureLegacy);
  assert.equal(claimLegacy(successAfterFailure,storage).claimed,true);
  const combinedLegacy=loadLegacy(storage);assert.equal(combinedLegacy.completed,true);assert.equal(combinedLegacy.failed,true);
  for(const [legacy,expectedExp] of [[failureLegacy,10],[combinedLegacy,15]]){
    for(const kind of ['event','summary']){
      const state=kind==='summary'?journey(legacy):choose(land(newGame('full',{enriched:true,legacy}),1),0);
      const game=snapshot(state);
      // Client resource claims are never authority for the model's initial values.
      game.life={legacyBonus:{exp:9000,moodMax:9000}};game.exp=9000;game.mood=9000;
      const verified=validateNarrativeInput({kind,game});
      assert.deepEqual(verified,restore(snapshot(state)));
      assert.deepEqual(verified.life.legacyBonus,{exp:expectedExp-10,moodMax:10});
      const initial={money:5000,mood:110,exp:expectedExp};
      const parse=prompt=>JSON.parse(prompt.slice(prompt.lastIndexOf('游戏记录：')+'游戏记录：'.length));
      assert.deepEqual(parse(narrativePrompt(kind,verified)).initial,initial);
      const records=[...verified.history,...verified.life.transactions];
      for(const resource of ['money','mood','exp'])assert.equal(initial[resource]+records.reduce((sum,record)=>sum+record[`${resource}Delta`],0),verified[resource]);
      let sent;
      const narrator=createNarrator({execute:async prompt=>{sent=parse(prompt);return answer;}});
      assert.equal((await narrator.narrate({kind,game})).mode,'live');
      assert.deepEqual(sent.initial,initial);assert.equal(sent.life.inherited,true);
      assert.deepEqual(sent.current,{money:verified.money,mood:verified.mood,moodMax:verified.moodMax,exp:verified.exp});
    }
  }
});

test('existing communication practice accepts enriched replayed scenes and preserves canonical context',()=>{
  let state=newGame('full',{enriched:true});
  for(const die of [6,6,1]){state=land(state,die);state=choose(state,best(state));if(state.active.number!==13)state=advance(state);}
  const input={game:snapshot(state),clientId:'a'.repeat(24),turn:1,message:'我想先核对已经确认的时间线。'};
  const validated=validatePracticeInput(input);assert.equal(validated.last.eventId,'cell-13');
  assert.match(practicePrompt(validated.state,[],input.message),/大群里的责任争执/);
});
