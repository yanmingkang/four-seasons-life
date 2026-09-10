import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENTS} from '../src/events.js';
import {SOURCES} from '../src/sources.js';
import {EVENT_GROUNDING,getEventGrounding} from '../src/event-grounding.js';
import {zhihuEchoMarkup} from '../src/zhihu-context.js';

test('eight cinematic cells have bounded grounding with real mapped references',()=>{
  assert.deepEqual(Object.keys(EVENT_GROUNDING),EVENTS.filter(e=>e.cinematicId).map(e=>e.id));
  for(const [id,grounding] of Object.entries(EVENT_GROUNDING)){
    const event=EVENTS.find(e=>e.id===id);
    assert.deepEqual(event.sources,grounding.sourceIds);
    assert.equal(event.options.length,3);
    assert.ok(grounding.boundary);
    assert.ok(Object.isFrozen(grounding));
    for(const ref of grounding.sourceIds)assert.ok(Object.hasOwn(SOURCES,ref));
    for(const condition of grounding.considerations){
      assert.ok(condition.when&&condition.idea);
      assert.ok(grounding.sourceIds.includes(condition.sourceId));
    }
    assert.equal(getEventGrounding({eventId:id}),grounding);
  }
  assert.equal(getEventGrounding({id:'__proto__'}),null);
  assert.equal(getEventGrounding(null),null);
});

test('unverified topics and missing attribution stay visibly distinct from authored advice',()=>{
  const care=EVENTS.find(e=>e.id==='cell-18'),handover=EVENTS.find(e=>e.id==='cell-31');
  assert.deepEqual(EVENT_GROUNDING['cell-18'].considerations,[]);
  assert.match(zhihuEchoMarkup(care),/知乎同题讨论/);
  assert.match(zhihuEchoMarkup(care),/经验待补核/);
  assert.match(zhihuEchoMarkup(handover),/具体作者仍待核对/);
  assert.match(zhihuEchoMarkup(handover),/公开搜索返回问题页回答片段/);
});

test('source detail starts collapsed, keeps context and never borrows unmapped references',()=>{
  for(const id of Object.keys(EVENT_GROUNDING)){
    const markup=zhihuEchoMarkup(EVENTS.find(e=>e.id===id));
    assert.match(markup,/<details class="zhihu-echo-context">/);
    assert.doesNotMatch(markup,/<details[^>]+\bopen\b/);
    assert.doesNotMatch(markup,/<blockquote|\d+%|标准答案/);
  }
  const old=zhihuEchoMarkup({eventId:'cell-11',sources:['rest']});
  assert.ok(old.includes(SOURCES.rest.url));
  assert.ok(!old.includes(SOURCES.incident.url));
});
