import test from 'node:test';
import assert from 'node:assert/strict';
import {narrationKey} from '../src/ai-client.js';
import {welcomeMarkup,eventMarkup,feedbackMarkup,compactScene} from '../src/presentation.js';
import {summaryChart} from '../src/resource-ui.js';
import {newGame,land,choose,snapshot} from '../src/engine.js';
import {EVENTS} from '../src/events.js';

test('client narration cache distinguishes rules, names and talents without transmitting balances',()=>{
  const base=snapshot(newGame('full'));
  for(const change of [{version:2},{name:'另一位玩家'},{talent:'optimistic'},{mode:'demo'}]) assert.notEqual(narrationKey('event',base),narrationKey('event',{...base,...change}));
  assert.equal(narrationKey('event',base),narrationKey('event',{...base,money:999999}));
  assert.notEqual(narrationKey('event',base),narrationKey('summary',base));
});
test('welcome exposes initial resources and safely escapes player text',()=>{
  const welcome=welcomeMarkup({name:'"><img src=x onerror=alert(1)>',talent:'defense'},null);
  assert.ok(!welcome.includes('<img src=x'));assert.ok(welcome.includes('&lt;img'));assert.ok(welcome.includes('5,000'));assert.ok(welcome.includes('40 站'));
  assert.ok(welcome.includes('把知乎经验，走成自己的四季。'));assert.ok(welcome.includes('田园三选版 · v4'));
});
test('all 40 event cards offer exactly three distinct actions without resource or outcome spoilers',()=>{
  assert.equal(EVENTS.length,40);
  for(const event of EVENTS){
    assert.equal(event.options.length,3,event.id);
    assert.equal(new Set(event.options.map(option=>option.label)).size,3,event.id);
    for(const balance of [0,5000,1000000]){
      const state={...land(newGame('full'),1),active:event,position:event.number-1,season:event.season,money:balance};
      const card=eventMarkup(state,'<footer>已核对来源</footer>');
      assert.equal((card.match(/data-choice=/g)||[]).length,3,event.id);
      assert.match(card,/options-3/);
      assert.match(card,/知乎讨论启发 · 虚构情景/);
      assert.doesNotMatch(card,/choice-effects|fatal-hint|条件已满足|条件未满足|需要 [\d,]+ 元/,event.id);
      assert.doesNotMatch(card.replace(/<[^>]*>/g,''),/[+−-]\s*\d/,event.id);
      for(const option of event.options){
        assert.ok(card.includes(option.label),`${event.id}: missing action`);
        for(const branch of [option,option.threshold?.success,option.threshold?.failure]){
          if(branch?.result)assert.ok(!card.includes(branch.result),`${event.id}: leaked result`);
          if(branch?.lesson)assert.ok(!card.includes(branch.lesson),`${event.id}: leaked lesson`);
        }
      }
    }
  }
});
test('feedback and resource chart preserve dynamic mood caps and optional model drawer',()=>{
  const state=choose(land(newGame('full'),1),0);state.moodMax=110;
  const card=feedbackMarkup(state,'<section>回响</section>',false);
  assert.ok(card.includes('/ 110'));assert.ok(card.includes('reflection-drawer'));assert.ok(card.includes('专业'));
  assert.ok(card.includes('知乎经验回声'));assert.ok(card.includes('原文与适用条件'));
  assert.match(card,/<details class="settlement-drawer">/);
  assert.ok(card.includes(state.history.at(-1).lesson));
  assert.doesNotMatch(card,/<details[^>]+\bopen\b/);
  const chart=summaryChart(state);assert.ok(chart.includes('不是人格测评'));assert.ok(chart.includes('绘图刻度'));assert.ok(!chart.includes('NaN'));
});

test('event scene keeps short setups intact and folds long background with accessible native details',()=>{
  assert.deepEqual(compactScene('先确认。再决定。'),{preview:'先确认。再决定。',remainder:''});
  assert.deepEqual(compactScene(''),{preview:'',remainder:''});
  const scene='车站很安静。你尚未答应。<script>这只是背景</script>。';
  const state=land(newGame('full'),1);
  state.active={...state.active,scene};
  const markup=eventMarkup(state);
  assert.match(markup,/<p class="event-scene">车站很安静。你尚未答应。<\/p>/);
  assert.match(markup,/<details class="event-background"><summary>展开故事背景<\/summary>/);
  assert.match(markup,/&lt;script&gt;这只是背景&lt;\/script&gt;/);
  assert.doesNotMatch(markup,/<script>/);
  assert.equal((markup.match(/data-choice=/g)||[]).length,3);
});
