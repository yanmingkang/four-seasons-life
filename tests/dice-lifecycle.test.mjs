import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {SceneDice,upwardFace} from '../src/dice.js';

test('dialog/portrait pause freezes the current die and cancellation cannot revive it on restart',async()=>{
  const previousRaf=globalThis.requestAnimationFrame,previousCancel=globalThis.cancelAnimationFrame;
  const frames=new Map();let serial=0,paused=false;
  globalThis.requestAnimationFrame=callback=>{const id=++serial;frames.set(id,callback);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
  const tick=time=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time));};
  const actor=new THREE.Group(),arm=new THREE.Group();arm.position.set(.55,1.3,0);actor.add(arm);actor.userData.throwArm=arm;
  const dice=new SceneDice(new THREE.Scene()),began=performance.now();
  try{
    const first=dice.throw({actor,value:4,isPaused:()=>paused});tick(began+350);
    const pose={arm:arm.rotation.toArray(),dice:dice.mesh.position.toArray(),elapsed:dice.active.elapsed};
    paused=true;tick(began+1000);tick(began+9000);assert.deepEqual({arm:arm.rotation.toArray(),dice:dice.mesh.position.toArray(),elapsed:dice.active.elapsed},pose);
    paused=false;tick(began+10000);assert.equal(dice.active.elapsed,pose.elapsed,'resume excludes the paused gap');
    const stale=[...frames.values()];dice.cancel();assert.equal(await first,null);assert.equal(dice.active,null);assert.equal(frames.size,0);assert.equal(actor.userData.diceThrowing,undefined);assert.equal(arm.rotation.x,0);assert.equal(dice.mesh.visible,false);
    assert.equal(await dice.throw({actor,value:2,reduceMotion:true}),2);assert.equal(upwardFace(dice.mesh.quaternion),2);
    stale.forEach(callback=>callback(began+20000));assert.equal(upwardFace(dice.mesh.quaternion),2);assert.equal(dice.mesh.userData.value,2);assert.equal(frames.size,0);
    dice.cancel();dice.dispose();dice.dispose();
  }finally{
    dice.dispose();if(previousRaf===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=previousRaf;if(previousCancel===undefined)delete globalThis.cancelAnimationFrame;else globalThis.cancelAnimationFrame=previousCancel;
  }
});
