import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENTS} from '../src/events.js';
import {SOURCES} from '../src/sources.js';
import {getEventGrounding} from '../src/event-grounding.js';
import {newGame,land,choose} from '../src/engine.js';
import {getEventSourceContext,collectJourneySources,zhihuEchoMarkup,journeySourceBookMarkup} from '../src/zhihu-context.js';

test('every event context preserves only mapped, real source identities and labels the fiction boundary',()=>{
  for(const event of EVENTS){
    const context=getEventSourceContext(event);
    assert.equal(context.label,'相关讨论 · 非事件实录');
    assert.equal(context.count,new Set(event.sources).size,event.id);
    assert.deepEqual(context.sources.map(source=>source.id),[...new Set(event.sources)]);
    for(const source of context.sources){
      assert.deepEqual(source,SOURCES[source.id]);
      assert.notEqual(source,SOURCES[source.id],'return value must not expose a mutable source object');
      const url=new URL(source.url);
      assert.equal(url.protocol,'https:');
      assert.ok(['www.zhihu.com','zhuanlan.zhihu.com'].includes(url.hostname));
    }
  }
  assert.deepEqual(getEventSourceContext({sources:['__proto__','missing','rest','rest',null]}).sources.map(source=>source.id),['rest']);
  assert.equal(getEventSourceContext(null).count,0);
});

test('journey collection counts unique sources only from actually settled history',()=>{
  assert.deepEqual(collectJourneySources([]),[]);
  assert.deepEqual(collectJourneySources(null),[]);
  const state=choose(land(newGame('full'),1),0);
  const collection=collectJourneySources(state.history);
  assert.equal(collection.length,1);
  assert.equal(collection[0].id,EVENTS[0].sources[0]);
  assert.equal(collection[0].events[0].title,EVENTS[0].title);
  assert.equal(collection[0].events[0].turn,1);
  assert.deepEqual(collectJourneySources([...state.history,...state.history]),collection);
  const repeated=collectJourneySources([...state.history,{eventId:'cell-02',turn:2,title:'实际第二页',sources:[EVENTS[0].sources[0],'teamwork','missing']}]);
  assert.equal(repeated.length,2);
  assert.equal(repeated[0].events.length,2);
  assert.equal(repeated[1].events.length,1);
  assert.doesNotMatch(journeySourceBookMarkup(state.history),/8 篇|40 篇/);
  assert.match(journeySourceBookMarkup(state.history),/1 条独立来源/);
  assert.match(journeySourceBookMarkup(state.history),/不是每格一篇独立案例/);
  assert.match(journeySourceBookMarkup(state.history),/仅核对搜索片段/);
});

test('experience echo uses a mapped author and source paraphrase without inventing quotation or real-event proof',()=>{
  for(const event of EVENTS){
    const source=SOURCES[event.sources[0]],markup=zhihuEchoMarkup(event);
    assert.ok(markup.includes(source.url));
    assert.ok(markup.includes(source.author));
    assert.ok(markup.includes(getEventGrounding(event)?.echo??source.idea.split('。')[0]));
    assert.match(markup,/相关讨论/);
    assert.match(markup,/不是原文逐字引述/);
    assert.match(markup,/不是本局事件实录/);
    assert.doesNotMatch(markup,/<blockquote|成功率|多数人|%/);
    assert.match(markup,/target="_blank" rel="noopener noreferrer"/);
  }
  assert.equal(zhihuEchoMarkup({sources:['invalid']}),'');
});

test('source book folds optional reading and safely escapes player-controlled historical text',()=>{
  const markup=journeySourceBookMarkup([{eventId:'fake',turn:1,title:'<img src=x onerror=alert(1)> & "故事"',sources:['rest']}]);
  assert.match(markup,/<details class="journey-source-book">/);
  assert.doesNotMatch(markup,/<details[^>]+\bopen\b/);
  assert.match(markup,/&lt;img src=x onerror=alert\(1\)&gt; &amp; &quot;故事&quot;/);
  assert.doesNotMatch(markup,/<img src=x/);
  assert.match(markup,/只收录本局已经历事件/);
  assert.match(journeySourceBookMarkup([]),/作出第一次选择后/);
});
