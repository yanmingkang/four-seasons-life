import test from 'node:test';
import assert from 'node:assert/strict';
import {CINEMATIC_MANIFEST,getCinematic} from '../src/cinematic-manifest.js';

test('meeting manifest includes exactly the eight commissioned clips, excluding the stairwell',()=>{
  assert.deepEqual(CINEMATIC_MANIFEST.map(item=>item.cell),[6,11,13,15,18,22,27,31]);
  assert.equal(new Set(CINEMATIC_MANIFEST.map(item=>item.id)).size,8);
  assert.equal(new Set(CINEMATIC_MANIFEST.map(item=>item.theme)).size,8);
  assert.equal(getCinematic({cell:8}),null);
});

test('undelivered clips have no network source and bounded four-second storyboards',()=>{
  for(const item of CINEMATIC_MANIFEST){
    assert.equal(item.src,null);assert.equal(item.poster,null);
    assert.equal(item.durationMs,4000);assert.equal(item.beat.length,3);
    assert.ok(item.beat.every(beat=>typeof beat==='string'&&beat.length>0));
    assert.ok(Object.isFrozen(item));assert.ok(Object.isFrozen(item.beat));
  }
});

test('lookup accepts documented event identifiers without accepting arbitrary video URLs',()=>{
  const first=CINEMATIC_MANIFEST[0];
  assert.equal(getCinematic('cell-06'),first);
  assert.equal(getCinematic({cinematicId:'cell-06'}),first);
  assert.equal(getCinematic({cinematicId:'cell-11',cell:6}),CINEMATIC_MANIFEST[1]);
  assert.equal(getCinematic({cinematicId:'unknown',cell:6}),null);
  assert.equal(getCinematic({id:'cell-06'}),first);
  assert.equal(getCinematic({cell:6}),first);
  assert.equal(getCinematic(6),first);
  for(const value of [undefined,null,{},0,40,'https://example.com/video.mp4',{src:'/cinematics/arbitrary.mp4'}])assert.equal(getCinematic(value),null);
});
