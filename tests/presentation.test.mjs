import test from 'node:test';
import assert from 'node:assert/strict';
import {narrationKey} from '../src/ai-client.js';
import {welcomeMarkup,talentDetailsMarkup,resumePromptMarkup,eventMarkup,feedbackMarkup,compactScene} from '../src/presentation.js';
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
  assert.ok(welcome.includes('把知乎经验，走成自己的四季。'));assert.ok(welcome.includes('3D 田园版 · v4'));
});
function nicknameInput(markup){
  const input=markup.match(/<input\b[^>]*\bid="character-name"[^>]*>/)?.[0];
  assert.ok(input,'the welcome form contains its nickname input');
  return input;
}

test('empty or missing setup names leave the welcome nickname blank with an optional player-facing prompt',()=>{
  for(const setup of [{name:'',talent:'defense'},{name:undefined,talent:'defense'},{talent:'defense'}]){
    const input=nicknameInput(welcomeMarkup(setup,null));
    assert.match(input,/\bvalue=""/);
    assert.match(input,/\bplaceholder="昵称（选填）"/);
    assert.doesNotMatch(input,/\b(?:value|placeholder)="(?:刘看山|undefined|null)"/);
  }
});

test('the welcome nickname preserves a custom draft and escapes attribute-breaking player text',()=>{
  const input=nicknameInput(welcomeMarkup({name:'小雨的四季',talent:'defense'},null));
  assert.match(input,/\bvalue="小雨的四季"/);
  const escaped=nicknameInput(welcomeMarkup({name:'小雨"<&\'的旅程',talent:'defense'},null));
  assert.match(escaped,/\bvalue="小雨&quot;&lt;&amp;&#39;的旅程"/);
  assert.doesNotMatch(escaped,/<script|onerror=|onfocus=/);
});

test('an existing journey does not add a homepage resume button or overwrite a separate new-game nickname',()=>{
  const saved={game:snapshot(newGame('full',{name:'旧旅程玩家'})),seconds:36};
  const beforeSaved=structuredClone(saved);
  for(const name of ['',undefined,'新旅程玩家']){
    const setup={name,talent:'optimistic'},beforeSetup=structuredClone(setup);
    const markup=welcomeMarkup(setup,saved),input=nicknameInput(markup);
    assert.equal(input.match(/\bvalue="([^"]*)"/)?.[1],name??'');
    assert.doesNotMatch(input,/旧旅程玩家/);
    assert.doesNotMatch(markup,/id="resume"/);
    assert.deepEqual(setup,beforeSetup);
    assert.deepEqual(saved,beforeSaved);
  }
});

test('the welcome page has one journey entry with or without a saved game',()=>{
  const saved={game:snapshot(newGame('full',{name:'旧旅程玩家'})),seconds:36};
  for(const record of [undefined,null,saved]){
    const markup=welcomeMarkup({name:'',talent:'defense'},record);
    assert.equal((markup.match(/<button\b/g)||[]).length,2,'One journey entry plus a non-starting explanation button');
    assert.match(markup,/<button type="button" id="talent-details" aria-haspopup="dialog"/);
    assert.equal((markup.match(/id="start-full"/g)||[]).length,1);
    assert.match(markup,/走进我的四季/);
    assert.doesNotMatch(markup,/id="(?:start-demo|start-sample|resume)"/);
    assert.equal((markup.match(/type="radio"/g)||[]).length,3,'talent choices remain intact');
    assert.match(markup,/value="defense" checked/);
    assert.match(nicknameInput(markup),/value=""/);
    assert.match(markup,/5,000/);
  }
});

test('compact talent cards reuse the same complete rules without duplicate inputs',()=>{
  for(const selected of ['defense','ambitious','optimistic']){
    const setup={name:'小雨',talent:selected},before=structuredClone(setup);
    const markup=welcomeMarkup(setup,null),details=talentDetailsMarkup();
    assert.equal((markup.match(/id="character-name"/g)||[]).length,1);
    assert.equal((markup.match(/type="radio"/g)||[]).length,3);
    assert.equal((markup.match(/ checked/g)||[]).length,1);
    assert.match(markup,new RegExp(`value="${selected}" checked`));
    for(const label of ['稳健防守型','锐意进取型','乐天知命型'])assert.ok(markup.includes(label)&&details.includes(label));
    for(const rule of ['首次甩锅抵挡事件本身的消耗','累积疲惫仍需休息','事件专业收益 +20%','负面事件情绪消耗 +10%','自动恢复 15 点情绪','不超过情绪上限'])assert.ok(markup.includes(rule)&&details.includes(rule));
    assert.doesNotMatch(details,/<input|id="start|<script/);
    assert.deepEqual(setup,before);
  }
});

test('resume confirmation displays the saved player and actual settled count without mutating the state',()=>{
  const game=choose(land(newGame('full',{name:'旧旅程玩家'}),2),0),before=structuredClone(game);
  const markup=resumePromptMarkup(game);
  assert.match(markup,/<h2 id="resume-heading">你的旅程还在这里<\/h2>/);
  assert.match(markup,/<strong>旧旅程玩家<\/strong>/);
  assert.match(markup,/<b>1<\/b> 段经历/);
  assert.match(markup,/id="resume"[^>]*>继续上次旅程<\/button>/);
  assert.match(markup,/id="start-new-journey"[^>]*>开启新旅程<\/button>/);
  assert.equal((markup.match(/<button\b/g)||[]).length,2);
  assert.match(markup,/开启新旅程将替换当前存档/);
  assert.deepEqual(game,before);
});

test('resume confirmation escapes saved nicknames and uses memory wording for either ending',()=>{
  for(const ended of ['complete','mood']){
    const state={...newGame('full'),name:'旧玩家"<&\'的旅程',turn:7,ended};
    const before=structuredClone(state),markup=resumePromptMarkup(state);
    assert.match(markup,/<strong>旧玩家&quot;&lt;&amp;&#39;的旅程<\/strong>/);
    assert.match(markup,/<b>7<\/b> 段经历/);
    assert.match(markup,/id="resume"[^>]*>翻开上次回忆<\/button>/);
    assert.doesNotMatch(markup,/继续上次旅程|<script|onerror=/);
    assert.match(markup,/开启新旅程将替换当前存档/);
    assert.deepEqual(state,before);
  }
  for(const turn of [undefined,-1,Infinity,NaN,'<img src=x onerror=alert(1)>']){
    const markup=resumePromptMarkup({name:'',turn});
    assert.match(markup,/<strong>旅人<\/strong>/);
    assert.match(markup,/<b>0<\/b> 段经历/);
    assert.doesNotMatch(markup,/<img|onerror=|undefined|NaN|Infinity/);
  }
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
