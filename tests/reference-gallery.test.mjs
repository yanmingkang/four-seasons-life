import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EVENTS} from '../src/events.js';
import {referenceTownMarkup,referenceIdsForCell,sceneReferenceMarkup} from '../src/reference-gallery.js';

test('four compact town chapters expose all 40 scene entrances and the character entry',()=>{
  const seen=[];
  for(let season=0;season<4;season++){
    const html=referenceTownMarkup(season);
    assert.equal((html.match(/data-town-season=/g)||[]).length,4);
    const cells=[...html.matchAll(/data-visit-cell="(\d+)"/g)].map(m=>Number(m[1]));
    assert.deepEqual(cells,EVENTS.filter(e=>e.season===season).map(e=>e.number));seen.push(...cells);
    assert.doesNotMatch(html,/legacy-landmarks|data-landmark=|最初的小镇地标/);
    assert.match(html,/id="view-character-reference"/);
    assert.doesNotMatch(html,/<img|first-edition\/|data:image/,'gallery must not download the 91 MB source pack');
  }
  assert.deepEqual(seen,EVENTS.map(e=>e.number));
});
test('scene entrances keep references out of the player-facing diorama',()=>{
  for(const event of EVENTS){
    const ids=referenceIdsForCell(event.number);assert.ok(ids.length);assert.equal(ids.length,new Set(ids).size);
    const html=sceneReferenceMarkup(ids);assert.equal(html,'');
  }
  assert.equal(sceneReferenceMarkup([]),'');assert.deepEqual(referenceIdsForCell(99),[]);
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.match(main,/camera|scene-view/);assert.doesNotMatch(main,/mountReferenceImages/);assert.doesNotMatch(main,/拖拽旋转\s*·\s*滚轮缩放/);
});

test('scene dialog omits exterior selection but preserves the scene and real map entry',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const dialog=main.slice(main.indexOf('function openScene('),main.indexOf('async function openShareCard('));
  assert.ok(dialog.length>0);
  assert.doesNotMatch(dialog,/建筑外观|data-scene-view="exterior"/);
  assert.match(dialog,/data-scene-view="scene"[^>]*>走进场景/);
  assert.match(dialog,/id="scene-on-map"[^>]*>地图位置/);
  assert.match(dialog,/focusTownLandmark\(referenceLandmarkId\(event.number\)/);
});
