import test from 'node:test';
import assert from 'node:assert/strict';
import {createEndingMemoryScene,ENDING_ART_THEMES} from '../src/ending-memory-scene.js';

test('ending illustrations retain the actual dimensional game mascot and distinct scenery',()=>{
  const signatures=new Set();
  for(const theme of ENDING_ART_THEMES){
    const room=createEndingMemoryScene({theme,textured:false});
    assert.equal(room.scene.userData.artRole,'symbolic-ending-illustration');
    const actor=room.scene.getObjectByName('liu-kanshan-3d');assert.ok(actor);assert.ok(actor.getObjectByName('large-black-nose'));assert.ok(actor.getObjectByName('pointed-ear--1'));
    const names=[];let meshCount=0;room.scene.traverse(o=>{if(o.isMesh){meshCount++;names.push(o.name);assert.ok(o.geometry);assert.ok(!o.isSprite);}});assert.ok(meshCount>80);signatures.add(names.join(','));
    assert.ok(room.scene.children.some(o=>o.isDirectionalLight&&o.castShadow));room.dispose();assert.equal(room.scene.children.length,0);
  }
  assert.equal(signatures.size,5);
});

test('a request for unreviewed ending art fails closed',()=>{assert.throws(()=>createEndingMemoryScene({theme:'hospital',textured:false}),RangeError);});
