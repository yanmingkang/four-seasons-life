import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,land,choose,advance,snapshot} from '../src/engine.js';
import {PRACTICE_SCENES,getPracticeScene,practiceForState,practiceOpening} from '../src/practice-scenes.js';
import {createPracticeSession,practiceEntryMarkup,practiceModeLabel,validatePracticeResponse} from '../src/practice-ui.js';
function example(){return choose(land(advance(choose(land(newGame(),6),1)),5),1);}
test('exactly two opt-in scenes, each opening reflects the settled choice without changing rules',()=>{
  assert.deepEqual(Object.keys(PRACTICE_SCENES),['cell-11','cell-13']);assert.equal(getPracticeScene('__proto__'),null);assert.equal(practiceForState(newGame()),null);
  const state=example(),before=snapshot(state),scene=practiceForState(state);assert.equal(scene.id,'cell-11');
  assert.equal(practiceForState({...state,phase:'choice'}),null);assert.equal(practiceForState(advance(state)),null);
  assert.equal(new Set(scene.openings).size,3);for(let choice=0;choice<3;choice++)assert.equal(practiceOpening(scene,{choice}),scene.openings[choice]);
  const a=createPracticeSession(snapshot(state),state.history.at(-1),scene),b=createPracticeSession(snapshot(state),state.history.at(-1),scene);
  assert.notEqual(a.clientId,b.clientId);assert.equal(a.turn,0);assert.equal(a.done,false);assert.deepEqual(snapshot(state),before);
});
test('practice invite is compact escaped copy; no resource outcome preview or automatic input',()=>{
  assert.equal(practiceEntryMarkup(null),'');const html=practiceEntryMarkup({title:'<img onerror=alert(1)>练习'});assert.doesNotMatch(html,/<img|data-choice|textarea|[+−-]\d/);assert.match(html,/&lt;img/);assert.match(html,/可选/);assert.match(html,/不计分/);
});
test('client accepts only the exact expected round and known live model, one final tip',()=>{
  const first={mode:'live',model:'zhida-fast-1p5',sessionId:'a'.repeat(32),turn:1,done:false,npc:'先确认哪一项？'};
  assert.equal(validatePracticeResponse(first,1),true);assert.equal(validatePracticeResponse(first,2),false);
  for(const bad of [{...first,model:'unknown'},{...first,mode:'thinking'},{...first,tip:'提前提示'},{...first,done:true},{...first,npc:''},{...first,sessionId:''}])assert.equal(validatePracticeResponse(bad,1),false);
  assert.equal(validatePracticeResponse({...first,turn:2,done:true,tip:'约一个核对时间。'},2),true);
  assert.equal(validatePracticeResponse({...first,turn:2,done:true},2),false);assert.match(practiceModeLabel('fallback'),/非实时 AI/);
});
