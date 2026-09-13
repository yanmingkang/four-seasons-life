import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {newGame,land,choose,interactCompanion,getInventory} from '../src/engine.js';
import {inventoryMarkup,companionMarkup,lifeBadgeMarkup,lifeReportMarkup,itemIcon} from '../src/life-ui.js';

const fresh=()=>newGame('full',{enriched:true});
const itemIds=['memo','earplugs','coffee','onsen','mentor','legal','communication','oden'];
const buttonTags=(markup,attribute)=>[...markup.matchAll(new RegExp(`<button\\b[^>]*${attribute}="([^"]+)"[^>]*>`,'g'))].map(match=>({id:match[1],disabled:/\bdisabled\b/.test(match[0])}));

test('inventory renders all eight distinct items, actual availability and reasons without changing state',()=>{
  const state=fresh(),before=structuredClone(state),markup=inventoryMarkup(state),buttons=buttonTags(markup,'data-use-item');
  assert.deepEqual(buttons.map(button=>button.id),itemIds);
  assert.equal((markup.match(/<article class="inventory-item/g)||[]).length,8);
  for(const item of getInventory(state)){
    assert.ok(markup.includes(item.name));
    assert.equal(buttons.find(button=>button.id===item.id).disabled,!item.usable);
    if(!item.usable)assert.ok(markup.includes(item.disabledReason));
    assert.match(itemIcon(item.id),/<svg[^>]*aria-hidden="true"/);
  }
  assert.equal(new Set(itemIds.map(itemIcon)).size,8);
  assert.deepEqual(state,before);
  const finished={...state,ended:'complete',phase:'finished'};
  assert.ok(buttonTags(inventoryMarkup(finished),'data-use-item').every(button=>button.disabled));
});

test('companion offers exactly three actions and disables all three after this seasons interaction',()=>{
  const state=fresh(),before=structuredClone(state),buttons=buttonTags(companionMarkup(state),'data-companion');
  assert.deepEqual(buttons.map(button=>button.id),['listen','share','promise']);
  assert.ok(buttons.every(button=>!button.disabled));
  assert.match(companionMarkup(state),/听你说说/);
  assert.match(companionMarkup(state),/聊聊我的今天/);
  assert.match(companionMarkup(state),/约好下一次/);
  assert.match(lifeBadgeMarkup(state),/看雨/);
  assert.deepEqual(state,before);
  const after=interactCompanion(state,'listen'),markup=companionMarkup(after);
  assert.ok(buttonTags(markup,'data-companion').every(button=>button.disabled));
  assert.match(markup,/本季已经进行过一次专心交流/);
  assert.ok(buttonTags(companionMarkup({...after,season:1}),'data-companion').every(button=>!button.disabled));
  assert.equal(companionMarkup(newGame()),'');
  assert.equal(lifeBadgeMarkup(newGame()),'');
});

test('mentor text is replaced with neutral questions; other player text is escaped',()=>{
  const attack='<img src=x onerror="alert(1)"> & <script>bad()</script>';
  const state=choose(land(fresh(),6),1);
  state.life.mentorQuestion=attack;
  state.life.companion.lastMessage=attack;
  Object.assign(state.history[0],{title:attack,choiceLabel:attack,result:attack});
  state.life.chains.push({to:state.history[0].eventId,reason:attack});
  assert.doesNotMatch(inventoryMarkup(state),/onerror|bad\(\)|<script>/);
  assert.match(inventoryMarkup(state),/哪些条件已经确认/);
  for(const markup of [companionMarkup(state),lifeReportMarkup(state)]){
    assert.ok(markup.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &lt;script&gt;bad()&lt;/script&gt;'));
    assert.doesNotMatch(markup,/<img src=x|<script>/);
  }
  assert.doesNotMatch(lifeReportMarkup(state,{compact:true}),/ten-decision-review/);
  assert.equal(lifeReportMarkup(newGame()),'');
});

test('achievement and title labels and description attributes are escaped by the real report renderer',()=>{
  // Native module mocking runs in an isolated process because this test suite
  // otherwise imports the real engine; no production file or catalog is edited.
  const uiUrl=new URL('../src/life-ui.js',import.meta.url).href;
  const engineUrl=new URL('../src/engine.js',import.meta.url).href;
  const script=`
    import {mock} from 'node:test';
    import assert from 'node:assert/strict';
    const hostile='"><img src=x onerror=alert(1)> & <script>bad()</script>';
    const report={title:hostile,timeline:[],titles:[{name:hostile,description:hostile,unlocked:true}],
      achievements:[{name:hostile,description:hostile,unlocked:true}],companion:{status:'一起生活',relationship:55},
      assets:{home:{owned:false,planned:false}},treehole:{used:false}};
    mock.module(${JSON.stringify(engineUrl)},{namedExports:{getInventory:()=>[],getCompanion:()=>null,getHome:()=>({}),getBusiness:()=>({}),getLifeReport:()=>report}});
    const {lifeReportMarkup}=await import(${JSON.stringify(uiUrl)});
    const markup=lifeReportMarkup({});
    assert.ok(markup.includes('title="&quot;&gt;&lt;img src=x onerror=alert(1)&gt; &amp; &lt;script&gt;bad()&lt;/script&gt;"'));
    assert.ok(markup.includes('✦ &quot;&gt;&lt;img'));
    assert.ok(markup.includes('<h4>&quot;&gt;&lt;img'));
    assert.doesNotMatch(markup,/<img src=x|<script>/);
  `;
  assert.doesNotThrow(()=>execFileSync(process.execPath,['--experimental-test-module-mocks','--input-type=module','-e',script],{encoding:'utf8',stdio:'pipe'}));
});
