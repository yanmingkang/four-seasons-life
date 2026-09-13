import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createLiuKanshan,animateLiuKanshan,resetLiuKanshan} from '../src/mascot-3d.js';

test('Liu Kanshan has dimensional white and black reference features from every angle',()=>{
  const actor=createLiuKanshan(),rig=actor.userData.rig;
  const names=[];actor.traverse(part=>{names.push(part.name);assert.ok(!part.isSprite);if(part.isMesh)assert.ok(part.geometry.attributes.position.count>10);});
  for(const name of ['pear-body','large-black-nose','pointed-ear--1','pointed-ear-1','black-arm--1','black-boot-1','round-white-tail'])assert.ok(names.includes(name),name);
  assert.ok(rig.nose.scale.x>.3);assert.ok(rig.nose.position.z>.7);
  assert.equal(actor.userData.throwArm,rig.arms.find(arm=>arm.sign===1).joint);
  const bounds=new THREE.Box3().setFromObject(actor);
  assert.ok(Math.abs(bounds.min.y)<1e-6,'boots sit on the actor ground plane');
  assert.ok(bounds.max.y>3&&bounds.max.y<3.4);
  assert.ok(bounds.max.z-bounds.min.z>1.5,'character has real depth');
  actor.userData.dispose();
});

test('idle breathing, blinking, looking and greeting move while both feet remain planted',()=>{
  const actor=createLiuKanshan(),rig=actor.userData.rig;
  const feet=rig.legs.map(({joint})=>joint.getObjectByName(`black-boot-${joint.name.endsWith('--1')?-1:1}`));
  const originFeet=feet.map(foot=>foot.getWorldPosition(new THREE.Vector3()));
  const breath=[],look=[],greeting=[],eyes=[];
  for(const time of [0,800,2100,3050,3840,6200]){
    animateLiuKanshan(actor,time);breath.push(rig.torso.scale.y);look.push(rig.head.rotation.y);greeting.push(rig.arms[1].joint.rotation.z);eyes.push(rig.eyes[0].scale.y);
    feet.forEach((foot,index)=>assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(originFeet[index])<1e-12));
    assert.deepEqual(actor.position.toArray(),[0,0,0]);assert.equal(actor.rotation.z,0);
  }
  assert.ok(Math.max(...breath)-Math.min(...breath)>.02);
  assert.ok(Math.max(...look)-Math.min(...look)>.1);
  assert.ok(Math.max(...greeting)>1.7);
  assert.ok(Math.min(...eyes)<.01,'blink compresses eyes briefly');
  const handBefore=rig.arms[1].joint.rotation.clone();actor.userData.diceThrowing=true;animateLiuKanshan(actor,9999);assert.ok(rig.arms[1].joint.rotation.equals(handBefore),'dice exclusively owns the throw pose');
  delete actor.userData.diceThrowing;animateLiuKanshan(actor,500,{walking:true,stepPhase:Math.PI/2});assert.ok(Math.abs(rig.legs[0].joint.rotation.x)>.4);
  resetLiuKanshan(actor);assert.equal(rig.legs[0].joint.rotation.x,0);assert.equal(rig.torso.scale.y,1);actor.userData.dispose();
});
