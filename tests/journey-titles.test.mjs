import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENTS} from '../src/events.js';
import {routeFor} from '../src/route.js';
import {newGame,land,choose,advance,snapshot,restore} from '../src/engine.js';
import {JOURNEY_TITLES,JOURNEY_TITLE_CHOICE_RULES,getJourneyTitleReport} from '../src/journey-titles.js';

const eventId=number=>`cell-${String(number).padStart(2,'0')}`;
const record=(number,choice,turn)=>({eventId:eventId(number),choice,turn});
const history=choices=>choices.map(([number,choice],index)=>record(number,choice,index+1));
const report=choices=>getJourneyTitleReport({history:history(choices)});
const fixtures={
  forward:[[5,1],[16,1]],
  clarify:[[4,0],[8,0]],
  boundary:[[16,2],[36,2]],
  companionship:[[3,0],[32,2]],
  rest:[[5,2],[14,0]],
  mixed:[[5,1],[7,0],[16,1],[19,2]],
};

function assertRealEvidence(result,source) {
  const evidence=result.titleEvidence;
  assert.equal(new Set(evidence.map(item=>item.eventId)).size,evidence.length);
  for(const item of evidence) {
    assert.deepEqual(Object.keys(item).sort(),['choice','eventId','kind','turn']);
    assert.equal(item.kind,'event');
    assert.ok(source.some(row=>row.eventId===item.eventId && row.choice===item.choice && row.turn===item.turn));
    assert.ok(EVENTS.find(event=>event.id===item.eventId)?.options[item.choice]);
    assert.notEqual(item.eventId,'cell-01');
    assert.notEqual(item.eventId,'cell-40');
  }
  assert.equal(result.journeyTitle.id,result.titleId);
  assert.equal(result.journeyTitle.name,result.title);
  assert.equal(result.journeyTitle.reason,result.titleReason);
  assert.deepEqual(result.journeyTitle.evidence,evidence);
}

for(const title of JOURNEY_TITLES) {
  test(`${title.name} needs choices at different real events`,()=>{
    const source=history(fixtures[title.id]);
    const result=getJourneyTitleReport({history:source,ended:'mood'});
    assert.equal(result.titleId,title.id);
    assert.equal(result.title,title.name);
    assert.equal(result.titleEvidence.length,title.id==='mixed'?4:2);
    assertRealEvidence(result,source);
    assert.equal((result.titleReason.match(/。/g)||[]).length,1,'one short sentence');
    assert.ok(result.titleReason.length<70);
    const mentioned=result.titleEvidence.filter(item=>result.titleReason.includes(JOURNEY_TITLE_CHOICE_RULES[item.eventId][item.choice].phrase));
    assert.equal(mentioned.length,2,'the sentence describes two actual, distinct choices');
  });
}

test('ordinary scenes award all five main titles without golden or cinematic cells',()=>{
  const ordinary={...fixtures,clarify:[[4,0],[28,1]]};
  for(const id of ['forward','clarify','boundary','companionship','rest']) {
    for(const [number] of ordinary[id]) {
      assert.equal(EVENTS[number-1].golden,false);
      assert.equal(EVENTS[number-1].cinematicId,null);
    }
    assert.equal(report(ordinary[id]).titleId,id);
  }
});

test('opening and terminal choices cannot award or tip a title in either route',()=>{
  for(const mode of ['full','demo']) {
    const route=routeFor(mode);
    assert.equal(EVENTS[route[0]].id,'cell-01');
    assert.equal(EVENTS[route.at(-1)].id,'cell-40');
    for(let choice=0;choice<3;choice++) {
      const ignored=[record(1,choice,1),record(40,choice,20)];
      const result=getJourneyTitleReport({mode,history:ignored,ended:'complete'});
      assert.equal(result.titleId,'traveler');
      assert.deepEqual(result.titleEvidence,[]);
      const base=history([[5,1],[16,1]]);
      assert.deepEqual(getJourneyTitleReport({mode,history:[...base,...ignored]}),getJourneyTitleReport({mode,history:base}));
    }
  }
});

test('one event, or scattered single actions, keeps a neutral title and one factual memory',()=>{
  for(const choices of [[[5,1]],[[5,1],[4,0],[16,2],[3,0],[14,0]]]) {
    const result=report(choices);
    assert.equal(result.titleId,'traveler');
    assert.equal(result.title,'旅途留白');
    assert.equal(result.titleEvidence.length,1);
    assertRealEvidence(result,history(choices));
    assert.match(result.titleReason,/这一程，你/);
    assert.equal(result.journeyTitle.rule,'insufficient-history');
  }
  const first=report([[18,0]]),second=report([[18,1]]);
  assert.equal(first.titleId,second.titleId);
  assert.notEqual(first.titleReason,second.titleReason);
  assert.notDeepEqual(first.titleEvidence,second.titleEvidence);
  const neutral=report([[14,1]]);
  assert.equal(neutral.titleId,'traveler');
  assert.match(neutral.titleReason,/给邻居也带一份早饭/);
});

test('the same event cannot supply repeated evidence, and its earliest identical record is stable',()=>{
  const repeated=[record(5,1,4),record(5,1,2),record(5,1,6)];
  assert.equal(getJourneyTitleReport({history:repeated}).titleId,'traveler');
  const result=getJourneyTitleReport({history:[...repeated,record(16,1,7)]});
  assert.equal(result.titleId,'forward');
  assert.equal(result.journeyTitle.counts.forward,2);
  assert.equal(result.titleEvidence[0].turn,2);
  assert.deepEqual(getJourneyTitleReport({history:[...repeated,record(16,1,7)].reverse()}),result);
});

test('contradictory choices at one event are excluded, including a neutral choice',()=>{
  for(const choices of [
    [record(5,1,1),record(5,2,2),record(16,1,3)],
    [record(8,0,1),record(8,1,2),record(4,0,3)],
  ]) {
    const result=getJourneyTitleReport({history:choices});
    assert.equal(result.titleId,'traveler');
    assert.deepEqual(getJourneyTitleReport({history:[...choices].reverse()}),result);
  }
});

test('malformed history and nonexistent choices degrade without inventing facts',()=>{
  const invalid=[null,{},record(4,-1,1),record(4,3,1),record(4,0,-1),record(4,0,0),
    record(4,0,1.5),record(4,0,NaN),record(4,'0',1),record(4,Infinity,1),
    {eventId:'missing',choice:0,turn:1},{eventId:'cell-04-return',choice:0,turn:1}];
  for(const value of [undefined,null,{},[],{history:null},{history:'bad'},{history:invalid}]) {
    const result=getJourneyTitleReport(value);
    assert.equal(result.titleId,'traveler');
    assert.deepEqual(result.titleEvidence,[]);
  }
  const valid=history(fixtures.clarify);
  assert.deepEqual(getJourneyTitleReport({history:[...invalid,...valid]}),getJourneyTitleReport({history:valid}));
});

test('the title never depends on resources, lifecycle, talent, position or side-system flags',()=>{
  const source=history(fixtures.companionship);
  const base=getJourneyTitleReport({history:source});
  for(const ended of ['mood','complete',null]) {
    const result=getJourneyTitleReport({
      history:source.map(row=>({...row,position:39,tile:0,before:{money:0,mood:100,exp:0},after:{money:999999,mood:0,exp:999},moneyDelta:999999,expDelta:999})),
      money:999999,mood:0,exp:999,talent:'ambitious',mode:'demo',position:0,ended,phase:'finished',
      life:{companion:{relationship:0,coldWar:true},home:{owned:true},business:{stage:'operating'},treeholeUsed:true},
    });
    assert.deepEqual(result,base);
  }
});

test('actual event choices override fabricated style, labels and outcome descriptions',()=>{
  const source=history(fixtures.clarify).map(row=>({...row,style:'rest',choiceLabel:'陪刘看雨买下房屋',result:'赚了百万后开心休息'}));
  const result=getJourneyTitleReport({history:source});
  assert.equal(result.titleId,'clarify');
  assert.doesNotMatch(result.titleReason,/百万|买下|开心休息/);
  assert.equal(report([[26,2],[35,1]]).titleId,'forward','a rest-styled learning choice is learning');
  assert.equal(report([[25,2],[32,1]]).titleId,'rest','boundary/evidence styles can describe active rest');
  assert.equal(report([[13,1],[13,2]]).titleId,'traveler','different options at a repeated event cannot count twice');
  assert.equal(report([[13,1],[28,1]]).titleId,'clarify','a connect or boundary label does not replace its factual action');
});

test('socialising with colleagues, neighbours and friends is not misnamed family companionship',()=>{
  const result=report([[7,2],[14,1],[21,2],[22,0],[22,1],[39,0],[39,1]]);
  assert.equal(result.titleId,'traveler');
  assert.equal(result.journeyTitle.counts.companionship,0);
  assert.equal(result.journeyTitle.counts.rest,0);
});

test('a highest event count wins, with recent action then fixed metadata order resolving ties',()=>{
  const tied=history([[4,0],[5,1],[8,0],[16,1]]);
  const recent=getJourneyTitleReport({history:tied});
  assert.equal(recent.titleId,'forward');
  assert.equal(recent.journeyTitle.rule,'latest-action');
  assert.deepEqual(getJourneyTitleReport({history:[...tied].reverse()}),recent);
  const clarifyLatest=tied.map(row=>row.eventId==='cell-08'?{...row,turn:5}:row);
  assert.equal(getJourneyTitleReport({history:clarifyLatest}).titleId,'clarify');
  const sameTurn=[record(4,0,1),record(5,1,2),record(8,0,5),record(16,1,5)];
  const fixed=getJourneyTitleReport({history:sameTurn});
  assert.equal(fixed.titleId,'forward');
  assert.equal(fixed.journeyTitle.rule,'fixed-order');
  assert.deepEqual(getJourneyTitleReport({history:sameTurn.reverse()}),fixed);
  const dominant=getJourneyTitleReport({history:[...tied,record(28,0,6),record(3,0,7)]});
  assert.equal(dominant.titleId,'clarify');
  assert.equal(dominant.journeyTitle.rule,'most-events');
});

test('mixed requires at least two distinct forward and two distinct rest actions',()=>{
  assert.equal(report([[5,1],[7,0]]).titleId,'traveler');
  assert.equal(report([[5,1],[7,0],[19,2]]).titleId,'rest');
  assert.equal(report([[5,1],[16,1],[7,0]]).titleId,'forward');
  const mixed=report(fixtures.mixed);
  assert.equal(mixed.titleId,'mixed');
  assert.deepEqual(mixed.journeyTitle.counts,{forward:2,clarify:0,boundary:0,companionship:0,rest:2});
  assert.equal(new Set(mixed.titleEvidence.map(item=>item.eventId)).size,4);
});

test('mixed never overrides a leading main theme or an unequal investment/rest rhythm',()=>{
  assert.equal(report([...fixtures.mixed,[26,0]]).titleId,'forward');
  assert.equal(report([...fixtures.mixed,[32,0]]).titleId,'rest');
  for(const id of ['clarify','boundary','companionship']) {
    const extra={clarify:[[4,0],[28,0]],boundary:[[27,1],[36,2]],companionship:[[3,0],[32,2]]}[id];
    const result=report([...fixtures.mixed,...extra]);
    assert.equal(result.titleId,id,'a third equally frequent theme keeps ordinary stable tie-breaking');
    assert.notEqual(result.journeyTitle.rule,'balanced-leading-actions');
  }
});

test('same-title journeys use their own two latest choices, without claiming skipped events',()=>{
  const first=report([[4,0],[8,0]]);
  const second=report([[4,1],[28,1]]);
  assert.equal(first.titleId,second.titleId);
  assert.notEqual(first.titleReason,second.titleReason);
  assert.match(first.titleReason,/遗漏日期/);
  assert.match(second.titleReason,/回听会议录音/);
  const longer=report([[4,0],[8,0],[28,1]]);
  assert.deepEqual(longer.titleEvidence.map(item=>item.eventId),['cell-08','cell-28']);
  assert.doesNotMatch(longer.titleReason,/遗漏日期|公开澄清|病房|买房/);
});

test('gated choices describe attempts without fabricating successful delivery or rewards',()=>{
  const failed=history([[5,1],[6,0]]).map(row=>({...row,result:'准备不足，未能完成',eligible:false,expDelta:0}));
  const result=getJourneyTitleReport({history:failed,exp:0,money:0});
  assert.equal(result.titleId,'forward');
  assert.match(result.titleReason,/尝试接过临时的上台讲解/);
  assert.doesNotMatch(result.titleReason,/成功|完成交付|奖励|买下|晋升/);
});

test('every interior option is explicitly mapped or intentionally neutral, with broad real-event support',()=>{
  const supported=Object.fromEntries(JOURNEY_TITLES.filter(title=>title.id!=='mixed').map(title=>[title.id,new Set()]));
  assert.equal(Object.keys(JOURNEY_TITLE_CHOICE_RULES).length,38);
  assert.ok(Object.isFrozen(JOURNEY_TITLE_CHOICE_RULES));
  for(const event of EVENTS) {
    const choices=JOURNEY_TITLE_CHOICE_RULES[event.id];
    if([1,40].includes(event.number)){assert.equal(choices,undefined);continue;}
    assert.equal(choices.length,event.options.length,event.id);
    assert.ok(Object.isFrozen(choices));
    for(const [index,rule] of choices.entries()) {
      assert.ok(event.options[index]?.label);
      assert.ok(Object.isFrozen(rule));
      if(rule.type===null){assert.ok(rule.reason);continue;}
      assert.ok(supported[rule.type],`${event.id}:${index} has an unknown category`);
      assert.ok(rule.phrase.length>0 && rule.phrase.length<=25);
      supported[rule.type].add(event.id);
    }
  }
  for(const [type,events] of Object.entries(supported))assert.ok(events.size>=2,`${type} needs broad support`);
});

test('semantically ambiguous style examples are pinned to the actual option, not its style keyword',()=>{
  const anchors=[
    [5,0,'喝口热饮，把方法记下来','forward'],
    [13,1,'私下对齐：先找协调人沟通','clarify'],
    [16,2,'暂停接新任务，把当前范围写清楚','boundary'],
    [25,2,'只整理最常用的清单，早点合上电脑','rest'],
    [26,2,'只旁听感兴趣的小组，带走新的问题','forward'],
    [32,1,'把未完事项录成语音，明早再处理','rest'],
    [32,2,'叫上家人到楼下吃一顿热饭','companionship'],
    [33,2,'调整自己的日程，参与轮班照料','companionship'],
    [36,2,'说明自己能帮到哪里，推荐咨询入口','boundary'],
    [38,2,'把假期留给一直想参加的手作课','forward'],
  ];
  for(const [number,choice,label,type] of anchors) {
    assert.equal(EVENTS[number-1].options[choice].label,label);
    assert.equal(JOURNEY_TITLE_CHOICE_RULES[eventId(number)][choice].type,type);
  }
});

test('the report is pure and cannot mutate the input history through returned evidence',()=>{
  const source=Object.freeze(history(fixtures.clarify).map(Object.freeze));
  const state=Object.freeze({history:source});
  const expected=getJourneyTitleReport(state);
  const result=getJourneyTitleReport(state);
  result.titleEvidence[0].eventId='altered';
  result.journeyTitle.counts.clarify=999;
  assert.deepEqual(getJourneyTitleReport(state),expected);
  assert.equal(source[0].eventId,'cell-04');
});

test('legal engine histories and save restoration preserve ordinary and early-ended titles',()=>{
  let state=newGame('full');
  for(const die of [4,4])state=advance(choose(land(state,die),0));
  assert.equal(state.ended,null);
  assert.equal(getJourneyTitleReport(state).titleId,'clarify');
  assert.deepEqual(getJourneyTitleReport(restore(snapshot(state))),getJourneyTitleReport(state));
  let early=newGame('full',{talent:'ambitious'});
  for(const [die,choice] of [[4,0],[3,0],[3,0],[1,0],[2,0],[2,0]])early=advance(choose(land(early,die),choice));
  assert.equal(early.ended,'mood');
  const result=getJourneyTitleReport(early);
  assert.equal(result.titleId,'clarify');
  assertRealEvidence(result,early.history);
  assert.deepEqual(getJourneyTitleReport(restore(snapshot(early))),result);
});
