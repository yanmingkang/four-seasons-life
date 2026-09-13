import test from 'node:test';
import assert from 'node:assert/strict';
import {CELL_SOURCE_MAP} from '../src/cell-source-map.js';
import {SOURCES} from '../src/sources.js';
import {SOURCE_ADDITIONS} from '../src/source-additions-2026-09-11.js';
import {readFileSync} from 'node:fs';
import {EVENT_GROUNDING} from '../src/event-grounding.js';
import {zhihuEchoMarkup,collectJourneySources} from '../src/zhihu-context.js';

test('source additions preserve old references and only map canonical Zhihu destinations',()=>{
  for(const id of ['records','teamwork','structure','rest','friends','transition','skills','impromptu','incident','household','care_topic','offer_questions','handover','clients'])assert.ok(Object.hasOwn(SOURCES,id));
  assert.equal(SOURCES.care_topic.url,'https://www.zhihu.com/question/614409286');
  assert.equal(SOURCES.handover.url,'https://www.zhihu.com/question/634352417');
  for(const [cell,ids] of Object.entries(CELL_SOURCE_MAP)){
    assert.ok(Object.isFrozen(ids));
    assert.equal(new Set(ids).size,ids.length);
    for(const id of ids){
      const source=SOURCES[id];assert.ok(source,`${cell}: missing ${id}`);
      const url=new URL(source.url);
      assert.equal(url.protocol,'https:');
      assert.ok(['www.zhihu.com','zhuanlan.zhihu.com'].includes(url.hostname));
      assert.equal(url.search,'');assert.equal(url.username,'');assert.equal(url.password,'');
      assert.ok(EVENT_GROUNDING[cell].considerations.some(item=>item.sourceId===id),`${cell}: ${id} has no stated applicability`);
    }
  }
});

test('new named evidence stays bounded and mixed journals collect only visited references',()=>{
  for(const id of ['care_coordination','care_budget','handover_checklist','listening','offscreen','microbreak']){
    assert.equal(SOURCES[id].checkedAt,'2026-09-11');
    assert.equal(SOURCES[id].evidenceLevel,'excerpt');
    assert.doesNotMatch(SOURCES[id].author,/待核对/);
    assert.match(SOURCES[id].evidence,/片段.*未读取完整原文/);
  }
  const history=[{eventId:'cell-18',sources:['care_topic'],turn:1,title:'旧记录'},{eventId:'cell-31',sources:CELL_SOURCE_MAP['cell-31'],turn:2,title:'新记录'}];
  const book=collectJourneySources(history);
  assert.deepEqual(book.map(source=>source.id),['care_topic','handover_checklist','records']);
  const stale=zhihuEchoMarkup({eventId:'cell-25',sources:['skills']});
  assert.ok(stale.includes(SOURCES.skills.url));
  assert.ok(!stale.includes(SOURCES.handover_checklist.url));
});

test('expanded mapped evidence has named authors and an auditable minimal excerpt',()=>{
  const mapped=[...new Set(Object.values(CELL_SOURCE_MAP).flat())];
  assert.ok(mapped.length>=33);
  assert.ok(!mapped.includes('distance_planning'));
  assert.equal(SOURCES.distance_planning.author,'作者待核对');
  for(const id of mapped){
    assert.ok(SOURCES[id].author);
    assert.doesNotMatch(SOURCES[id].author,/待核对/);
  }
  const audit=JSON.parse(readFileSync(new URL('../references/zhihu-evidence-2026-09-11.json',import.meta.url),'utf8'));
  assert.equal(audit.records.length,Object.keys(SOURCE_ADDITIONS).length);
  for(const source of Object.values(SOURCE_ADDITIONS)){
    const record=audit.records.find(item=>item.id===source.id);
    assert.ok(record,source.id);
    for(const field of ['author','title','url','excerpt','accessedAt','evidenceLevel'])assert.equal(record[field],source[field]);
    assert.match(record.returnedTextSha256,/^[a-f0-9]{64}$/);
    assert.deepEqual(record.excerptSegments.join('\n……\n'),record.excerpt);
    assert.ok(record.excerptSegments.every(text=>text.length>0));
    assert.ok(record.returnedTextLength>=record.excerpt.length);
    assert.equal(source.evidenceLevel,'excerpt');
    assert.ok(mapped.includes(source.id));
    assert.match(source.evidence,/未读取完整原文/);
  }
});
