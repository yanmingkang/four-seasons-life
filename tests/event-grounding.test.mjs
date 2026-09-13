import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENTS} from '../src/events.js';
import {SOURCES} from '../src/sources.js';
import {EVENT_GROUNDING,getEventGrounding} from '../src/event-grounding.js';
import {CELL_SOURCE_MAP} from '../src/cell-source-map.js';
import {zhihuEchoMarkup} from '../src/zhihu-context.js';

test('all forty cells have scene-specific bounded grounding with mapped references',()=>{
  assert.deepEqual(Object.keys(EVENT_GROUNDING),EVENTS.map(e=>e.id));
  assert.deepEqual(Object.keys(CELL_SOURCE_MAP),EVENTS.map(e=>e.id));
  for(const [id,grounding] of Object.entries(EVENT_GROUNDING)){
    const event=EVENTS.find(e=>e.id===id);
    assert.deepEqual(event.sources,grounding.sourceIds);
    assert.deepEqual(event.sources,CELL_SOURCE_MAP[id]);
    assert.equal(event.options.length,3);
    assert.ok(grounding.boundary);
    assert.ok(Object.isFrozen(grounding));
    assert.ok(grounding.considerations.length>0);
    assert.ok(grounding.echo.length<=65);
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

test('care and departure now use named answers while old records keep their original limits',()=>{
  const care=EVENTS.find(e=>e.id==='cell-18'),handover=EVENTS.find(e=>e.id==='cell-31');
  assert.match(zhihuEchoMarkup(care),/萧澄/);
  assert.match(zhihuEchoMarkup(handover),/侃大山/);
  for(const event of [care,handover]){
    assert.equal(EVENT_GROUNDING[event.id].status,'excerpt');
    assert.match(zhihuEchoMarkup(event),/未读取完整原文/);
    assert.doesNotMatch(zhihuEchoMarkup(event),/经验待补核|作者待核对/);
  }
  const oldCare=zhihuEchoMarkup({eventId:'cell-18',sources:['care_topic']});
  assert.match(oldCare,/知乎同题讨论/);
  assert.match(oldCare,/经验待补核/);
  assert.doesNotMatch(oldCare,/萧澄|2071259121635140487/);
  const oldHandover=zhihuEchoMarkup({eventId:'cell-31',sources:['handover']});
  assert.match(oldHandover,/作者待核对/);
  assert.doesNotMatch(oldHandover,/侃大山|1930915999596643377/);
});

test('current distance scenes use named replacements without upgrading old saved evidence',()=>{
  for(const id of ['cell-10','cell-20','cell-23','cell-30']){
    const markup=zhihuEchoMarkup(EVENTS.find(event=>event.id===id));
    assert.equal(EVENT_GROUNDING[id].status,'excerpt');
    assert.doesNotMatch(markup,/作者待核对|作者字段为空|作者仍待核对/);
    assert.match(markup,/未读取完整原文/);
    assert.match(markup,/本轮核对片段/);
    const [visible,details]=markup.split('<details');
    assert.doesNotMatch(visible,/作者待核对|作者字段|https:/);
    assert.match(details,/知乎作者/);
    const oldMarkup=zhihuEchoMarkup({eventId:id,sources:['distance_planning']});
    assert.match(oldMarkup,/作者字段为空|作者待核对/);
    assert.ok(oldMarkup.includes(SOURCES.distance_planning.url));
    for(const sourceId of EVENT_GROUNDING[id].sourceIds)assert.ok(!oldMarkup.includes(SOURCES[sourceId].url));
  }
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
