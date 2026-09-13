import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EVENTS} from '../src/events.js';
// Existing rare-experience regressions remain against the unchanged evaluator;
// the composed two-layer contract is covered separately below.
import {getExperienceTitleReport as getLifeTitleReport,getLifeTitleReport as getTwoLayerReport,LIFE_TITLES} from '../src/life-titles.js';
import {newGame,land,choose,advance,useItem,interactCompanion,getLifeReport,snapshot,restore} from '../src/engine.js';

// Small classifier fixtures deliberately isolate evidence boundaries. Reachable
// positives below and life-reachability.test.mjs separately use real game rules.
function record(cell,turn,before=80,after=80,choice=0){
  const event=EVENTS[cell-1],option=event.options[choice];
  return {eventId:event.id,turn,choice,title:event.title,choiceLabel:option.label,tile:cell-1,season:event.season,before:{mood:before},after:{mood:after},expDelta:0,result:option.result,talentNote:''};
}
function finished(history,extra={}){
  const state=newGame('full',{enriched:true});
  return {...state,history,mood:history.at(-1)?.after.mood??100,ended:'complete',phase:'finished',...extra};
}
function talk(state,turn,phase='feedback'){
  const order=state.life.actions.length;
  state.life.actions.push(['r','listen']);
  state.life.transactions.push({kind:'companion',turn,phase,order,before:{mood:20},after:{mood:26}});
  return state;
}
const unlocked=(state,id)=>getLifeTitleReport(state).titles.find(title=>title.id===id).unlocked;

test('an ordinary complete journey has a neutral title and one real, private-safe memory',()=>{
  const state=finished([record(6,1),record(11,2),record(40,3)]);
  state.history[0].choiceLabel='PRIVATE PLAYER TEXT';state.life.companion.lastMessage='PRIVATE CHAT';
  const before=structuredClone(state),report=getLifeTitleReport(state);
  assert.equal(report.title,'四季行路人');
  assert.ok(report.titles.every(title=>!title.unlocked));
  assert.match(report.titleReason,/主讲人缺席/);
  assert.deepEqual(report.titleEvidence,[{kind:'event',eventId:'cell-06',turn:1,choice:0}]);
  assert.doesNotMatch(JSON.stringify(report),/PRIVATE/);
  assert.deepEqual(state,before);
});

test('high salary, professional points, partner meter and completion alone award no special title',()=>{
  const state=finished([record(6,1),record(11,2),record(40,3)],{money:300000,exp:300});
  state.life.companion.relationship=100;
  assert.equal(getLifeTitleReport(state).titleId,'traveler');
});

test('together needs multiple actual shared or companion actions and professional experience',()=>{
  const state=finished([record(3,1),record(10,2,80,80,1),record(16,3),record(25,4)],{exp:180});
  state.life.companion.relationship=80;
  assert.equal(unlocked(state,'together'),false);
  state.history[2].expDelta=10;state.history[3].expDelta=15;
  assert.equal(unlocked(state,'together'),true);
  state.life.companion.coldWar=true;
  assert.equal(unlocked(state,'together'),false);
});

test('a colleague and old friend cannot be relabelled as Liu Kanyu support',()=>{
  const state=finished([record(5,1),record(35,2,80,80,2),record(16,3),record(25,4)],{exp:180});
  state.life.companion.relationship=80;
  state.history[2].expDelta=10;state.history[3].expDelta=15;
  assert.equal(unlocked(state,'together'),false);
});

test('local residence flags alone are insufficient and rest must actually have happened',()=>{
  const state=finished([record(16,1,70,80,2),record(22,2,80,90,0),record(40,3)]);
  state.life.flags.spring={choice:1};
  assert.equal(unlocked(state,'balanced'),false);
  state.history.unshift(record(10,0,80,80,1));
  assert.equal(unlocked(state,'balanced'),false,'invalid zero turn cannot prove a choice');
  state.history=state.history.slice(1).map(r=>({...r,turn:r.turn+1}));
  state.history.unshift(record(10,1,80,80,1));
  assert.equal(unlocked(state,'balanced'),true);
  const afterLocal=state.history;
  state.history=[record(16,1,70,80,2),record(22,2,80,90,0),record(10,3,90,90,1)];
  assert.equal(unlocked(state,'balanced'),false,'the reason promises repeated arrangements after the local choice');
  state.history=afterLocal;
  state.history=state.history.filter(r=>r.eventId==='cell-10');
  assert.equal(unlocked(state,'balanced'),false,'one local choice is not a repeated rhythm');
});

test('a comeback without interval partner support has a neutral derived title, not the partner badge',()=>{
  const state=finished([record(11,1,80,20),record(19,2,20,65),record(40,3,65,65)]);
  const report=getLifeTitleReport(state);
  assert.equal(report.title,'重新出发的行路人');
  assert.equal(unlocked(state,'resilient'),false);
  assert.deepEqual(report.titleEvidence.map(e=>e.eventId),['cell-11','cell-19']);
});

test('support before the low or after the first recovery cannot be claimed as support through that low',()=>{
  for(const turn of [0,3]){
    const state=talk(finished([record(11,1,80,20),record(19,2,20,65),record(40,3,65,65)]),turn);
    // The support transaction itself must not introduce an unrelated low.
    state.life.transactions[0].before.mood=70;state.life.transactions[0].after.mood=76;
    assert.equal(unlocked(state,'resilient'),false,`unrelated support at turn ${turn}`);
  }
});

test('a real interval support action plus later recovery can award the partner title',()=>{
  const state=talk(finished([record(11,1,80,20),record(19,2,26,65),record(40,3,65,65)]),1,'choice');
  const report=getLifeTitleReport(state);
  assert.equal(report.titleId,'resilient');
  assert.equal(report.titleEvidence[1].action,'r');
  state.life.companion.coldWar=true;
  assert.equal(getLifeTitleReport(state).titleId,'restarted');
});

test('an unbacked companion transaction or an interactions counter cannot award support',()=>{
  const state=talk(finished([record(11,1,80,20),record(19,2,26,65)]),1);
  state.life.actions=[];
  state.life.companion.interactions=[{turn:1,choice:'listen'}];
  assert.equal(unlocked(state,'resilient'),false);
  state.life.actions=[['i','coffee']];
  assert.equal(unlocked(state,'resilient'),false);
});

test('ending while still low or actually exhausted cannot be called a comeback',()=>{
  for(const mood of [0,28,49]){
    const state=talk(finished([record(11,1,80,20),record(19,2,26,65),record(40,3,65,mood)],{mood,ended:mood?'complete':'mood'}),1);
    assert.equal(getLifeTitleReport(state).titleId,'traveler');
  }
});

test('treehole and automatic food flags without timestamped settlement proof are not a low or support',()=>{
  const state=finished([record(11,1,80,80),record(40,2,80,90)]);
  state.life.treeholeUsed=true;
  state.life.usedItems=[{id:'oden',automatic:true,turn:0}];
  assert.equal(getLifeTitleReport(state).titleId,'traveler');
});

test('a matching automatic rescue preserves a low hidden by protection but requires a later recovery',()=>{
  const guarded=record(11,1,80,52);guarded.talentNote='深夜一盒温热关东煮自动守护：刘看雨把热食递到你手里';
  const state=finished([guarded]);
  state.life.usedItems=[{id:'oden',automatic:true,turn:0}];
  assert.equal(getLifeTitleReport(state).titleId,'traveler','the one automatic heal is not an entire comeback');
  state.history.push(record(40,2,52,65));state.mood=65;
  assert.equal(getLifeTitleReport(state).titleId,'resilient');
  state.life.usedItems[0].turn=1;
  assert.equal(getLifeTitleReport(state).titleId,'traveler','another turn cannot prove this guarded low');
});

test('business status, cash and an unlaunched idea cannot replace the four recorded business steps',()=>{
  const state=finished([record(29,1),record(40,2)],{money:500000});
  state.life.business={stage:'operating',earned:12000};
  assert.equal(unlocked(state,'explorer'),false);
  assert.equal(LIFE_TITLES.find(t=>t.id==='explorer').name,'小步经营探索者');
});

test('a business title needs ordered test and launch transactions plus later actual settlement, not wealth',()=>{
  const paid=record(31,3);paid.result='此前的小样试运营完成了本局约定的交付';paid.talentNote='小样试运营结算：收入 12,000 元';
  const state=finished([record(29,1),record(30,2,80,80,2),paid,record(40,4)],{money:2000});
  state.life.business={stage:'operating',earned:12000};
  state.life.actions=[['b','test'],['b','launch']];
  state.life.transactions=[
    {kind:'business',turn:1,phase:'feedback',order:0,before:{mood:80},after:{mood:75}},
    {kind:'business',turn:2,phase:'choice',order:1,before:{mood:75},after:{mood:75}},
  ];
  assert.equal(getLifeTitleReport(state).titleId,'explorer','actual small business is not gated on a large bank balance');
  state.life.business.stage='awaiting';
  assert.equal(unlocked(state,'explorer'),false);
  state.life.business.stage='operating';paid.talentNote='';
  assert.equal(unlocked(state,'explorer'),false);
  paid.talentNote='小样试运营结算：收入 12,000 元';
  state.life.transactions[1].turn=0;
  assert.equal(unlocked(state,'explorer'),false,'launch before test cannot count');
  state.life.transactions[1].turn=4;
  assert.equal(unlocked(state,'explorer'),false,'an earlier receipt cannot count as revenue after launch');
});

test('missing and malformed old history degrades safely, without inventing a past',()=>{
  for(const history of [undefined,null,[],[null,{},record(40,-1),{...record(40,1),eventId:'not-a-place'}]]){
    const state=finished([],{history,money:500000,exp:500});
    state.life.treeholeUsed=true;state.life.companion.relationship=100;
    const report=getLifeTitleReport(state);
    assert.equal(report.titleId,'traveler');
    assert.deepEqual(report.titleEvidence,[]);
  }
  assert.equal(getLifeReport(finished([],{history:undefined})).title,'旅途留白');
  assert.equal(getLifeTitleReport().titleId,'traveler');
});

test('ongoing play and a short-route position do not fabricate an ending or a local choice',()=>{
  const history=[record(10,1,80,80,1),record(16,2,80,90,2),record(22,3,90,100,0)];
  assert.ok(getLifeTitleReport(finished(history,{ended:null})).titles.every(t=>!t.unlocked));
  const state=finished([record(32,1,80,95),record(40,2,95,100)]);
  state.history[0].position=9;state.life.flags.spring={choice:1};
  assert.equal(unlocked(state,'balanced'),false);
});

function step(state,cell,choice){
  const die=cell-state.position-1;
  assert.ok(die>=1 && die<=6);
  const next=advance(choose(land(state,die),choice));
  assert.deepEqual(restore(snapshot(next)),next);
  return next;
}

test('a legal replayable low-support-recovery journey earns the partner title, including schema-one saves',()=>{
  let state=newGame('full',{enriched:true,talent:'ambitious',lifeSchema:1});
  for(const [cell,choice] of [[4,0],[7,0],[10,0],[11,0],[13,0]])state=step(state,cell,choice);
  assert.equal(state.mood,10);
  state=interactCompanion(state,'listen');
  state=useItem(state,'oden');
  for(const [cell,choice] of [[18,2],[20,1],[26,2],[32,0],[38,0],[40,1]])state=step(state,cell,choice);
  assert.equal(state.ended,'complete');
  const report=getLifeReport(state);
  const badge=report.commemorations.find(item=>item.id==='resilient');
  assert.ok(badge);
  assert.equal(badge.evidence[1].action,'r');
  assert.equal(getLifeReport(restore(snapshot(state))).titleReason,report.titleReason);
  assert.equal(snapshot(state).extension.schema,1);
});

test('a legal self-supported recovery is not retroactively attributed to later partner plans',()=>{
  let state=newGame('full',{enriched:true,talent:'ambitious',lifeSchema:1});
  for(const [cell,choice] of [[4,0],[7,0],[10,0],[11,0],[13,0]])state=step(state,cell,choice);
  state=useItem(state,'oden');state=useItem(state,'coffee');
  for(const [cell,choice] of [[18,2],[20,1],[26,2],[32,0],[38,0],[40,1]])state=step(state,cell,choice);
  assert.equal(state.ended,'complete');
  assert.ok(getLifeReport(state).commemorations.some(item=>item.id==='restarted'));
  assert.equal(unlocked(state,'resilient'),false);
});

test('everyday cover title and strict rare keepsakes are independent layers',()=>{
  const state=talk(finished([record(11,1,80,20),record(19,2,26,65),record(40,3,65,65)]),1,'choice');
  const old=getLifeTitleReport(state),report=getTwoLayerReport(state);
  assert.equal(old.titleId,'resilient');
  assert.notEqual(report.titleId,'resilient');
  assert.equal(report.title,report.journeyTitle.name);
  assert.deepEqual(report.titles,old.titles);
  assert.deepEqual(report.commemorations.find(item=>item.id==='resilient').evidence,old.titleEvidence);
  state.life.companion.coldWar=true;
  const cold=getTwoLayerReport(state);
  assert.equal(cold.title,report.title);
  assert.ok(!cold.commemorations.some(item=>item.id==='resilient'));
  assert.ok(cold.commemorations.some(item=>item.id==='restarted'));
});
