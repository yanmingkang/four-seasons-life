import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {CharacterContrast,CONTACT_SHADOW_OFFSET} from '../src/character-contrast.js';
import {createLiuKanshan,animateLiuKanshan} from '../src/mascot-3d.js';
import {JourneyWorld} from '../src/journey-world.js';
import {surfaceY} from '../src/scenery.js';

function canvas(){return {getContext(){return {createRadialGradient(){return {addColorStop(){}};},clearRect(){},fillRect(){}};}};}
function make(surfaceHeight=(x,z)=>.05*x+.03*z){const scene=new THREE.Scene(),actor=createLiuKanshan();scene.add(actor);return {scene,actor,contrast:new CharacterContrast(scene,actor,{surfaceHeight,canvas})};}

test('contact shadow is a small depth-tested feathered surface, never an emissive ring or actor child',()=>{
  const {scene,actor,contrast:c}=make();c.update({winter:1});
  assert.equal(c.shadow.parent,scene);assert.notEqual(c.shadow.parent,actor);assert.equal(c.material.depthTest,true);assert.equal(c.material.depthWrite,false);assert.equal(c.material.blending,THREE.NormalBlending);assert.equal(c.material.isMeshBasicMaterial,true);assert.equal(c.material.emissive,undefined);assert.equal(c.geometry.type,'PlaneGeometry');assert.ok(c.geometry.parameters.width<2&&c.geometry.parameters.height<2);assert.ok(c.material.opacity<.4);assert.equal(c.texture.image.width,128);
  c.dispose();actor.userData.dispose();
});

test('all contact vertices follow sloped surfaces while body bob/rig poses cannot lift or steer them',()=>{
  const height=(x,z)=>.05*x+.03*z,{actor,contrast:c}=make(height);actor.position.set(11,8,-7);actor.rotation.y=1.2;c.update({winter:1});
  const check=()=>{const p=c.geometry.attributes.position;for(let i=0;i<p.count;i++){const world=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(c.shadow.matrixWorld);assert.ok(Math.abs(world.y-height(world.x,world.z)-CONTACT_SHADOW_OFFSET)<1e-6);}};
  check();const shape=Array.from(c.geometry.attributes.position.array),pose=actor.position.clone(),yaw=actor.rotation.y;
  actor.position.y+=2;animateLiuKanshan(actor,2500,{walking:true,stepPhase:1});c.update();assert.deepEqual(Array.from(c.geometry.attributes.position.array),shape);assert.equal(actor.rotation.y,yaw);assert.equal(actor.position.x,pose.x);assert.equal(actor.position.z,pose.z);
  actor.position.x+=.7;actor.position.z-=.2;actor.rotation.y-=.25;c.update({winter:1});check();c.dispose();actor.userData.dispose();
});

test('winter shading preserves the IP base colour, changes only shader edge shading, and returns to normal in spring',()=>{
  const {actor,contrast:c}=make(),mat=actor.userData.rig.belly.material,color=mat.color.clone();
  const shader={uniforms:{},fragmentShader:'#include <opaque_fragment>'};mat.onBeforeCompile(shader,{});assert.match(shader.fragmentShader,/kanshanGrazing/);assert.equal(shader.uniforms.uKanshanWinterContour,c.contour);
  c.update({winter:0});assert.equal(c.contour.value,0);c.update({winter:1,daylightBlend:0});assert.equal(c.contour.value,.55);c.update({winter:1,daylightBlend:1});assert.equal(c.contour.value,.42);assert.ok(mat.color.equals(color));assert.equal(mat.color.getHexString(),'fffdf4');assert.equal(mat.emissive.getHex(),0);
  c.enabled=false;c.update({winter:1});assert.equal(c.shadow.visible,false);assert.equal(c.contour.value,0);c.enabled=true;c.update({winter:0});assert.equal(c.contour.value,0);c.dispose();actor.userData.dispose();
});

test('contact sampling uses actual road and visible station plate height, not an elevated smoothed walking ramp',()=>{
  const w=Object.create(JourneyWorld.prototype);w.tiles=[{position:new THREE.Vector3(0,surfaceY(0,0)+.13,0),group:{visible:true,rotation:{y:.6}}}];
  assert.ok(Math.abs(w.contactSurfaceY(0,0)-(w.tiles[0].position.y+.134))<1e-12);
  assert.ok(Math.abs(w.contactSurfaceY(1.3,0)-(w.tiles[0].position.y+.1275))<1e-12);
  assert.equal(w.contactSurfaceY(4,3),surfaceY(4,3)+.055);w.tiles[0].group.visible=false;assert.equal(w.contactSurfaceY(0,0),surfaceY(0,0)+.055);
});

test('one owned texture/material/geometry are reused and disposed exactly once; original shader hooks are restored',()=>{
  const scene=new THREE.Scene(),actor=createLiuKanshan(),mat=actor.userData.rig.belly.material,compile=mat.onBeforeCompile,key=mat.customProgramCacheKey;
  const c=new CharacterContrast(scene,actor,{surfaceHeight:()=>0,canvas}),resources=[c.geometry,c.material,c.texture],counts=[0,0,0];resources.forEach((resource,i)=>resource.addEventListener('dispose',()=>counts[i]++));
  const uuids=resources.map(r=>r.uuid);for(let i=0;i<50;i++){actor.position.x=i*.13;c.update({winter:i%2,daylightBlend:i%3/2});}assert.deepEqual(resources.map(r=>r.uuid),uuids);assert.equal(scene.children.filter(n=>n.name==='liukanshan-contact-shadow').length,1);
  c.dispose();c.dispose();assert.deepEqual(counts,[1,1,1]);assert.equal(c.shadow.parent,null);assert.equal(mat.onBeforeCompile,compile);assert.equal(mat.customProgramCacheKey,key);actor.userData.dispose();
});

test('winter uniforms do not rebuild shader programs or leak into a separately created mascot',()=>{
  const first=make(),second=make(),unmodified=createLiuKanshan(),a=first.contrast,b=second.contrast;
  const key=a.bodyMaterial.customProgramCacheKey();assert.equal(b.bodyMaterial.customProgramCacheKey(),key);
  for(const winter of [0,.3,1,0]){a.update({winter,daylightBlend:.5});assert.equal(a.bodyMaterial.customProgramCacheKey(),key);assert.equal(b.contour.value,0);}
  assert.notEqual(a.bodyMaterial,unmodified.userData.rig.belly.material);assert.ok(!unmodified.userData.rig.belly.material.customProgramCacheKey().includes('liukanshan-winter-contour-v1'));
  a.dispose();b.dispose();first.actor.userData.dispose();second.actor.userData.dispose();unmodified.userData.dispose();
});
