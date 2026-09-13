import test from 'node:test';
import assert from 'node:assert/strict';
import {CINEMATIC_THEMES,CELL_SCENE_PROPS,createCinematicScene3D,resolveCinematicTheme} from '../src/cinematic-scenes-3d.js';
import {EVENTS} from '../src/events.js';

test('eight rooms use geometry, the existing character, and distinct undecided scene objects',()=>{
  const signatures=new Set();
  for(const theme of CINEMATIC_THEMES){
    const cinematic=createCinematicScene3D({theme}),names=[];let meshes=0;
    cinematic.scene.traverse(o=>{names.push(o.name);assert.ok(!o.isSprite);if(o.isMesh)meshes++;});
    assert.ok(meshes>75);assert.equal(cinematic.actors.length,1);assert.ok(cinematic.actors[0].userData.rig);
    for(const n of ['pear-body','large-black-nose','pointed-ear--1','black-boot-1'])assert.ok(names.includes(n));
    signatures.add(names.join('|'));
    cinematic.update(0);const start=cinematic.camera.position.clone();const hand=cinematic.actors[0].userData.rig.arms[1].joint.rotation.clone();
    cinematic.update(3.5);assert.ok(start.distanceTo(cinematic.camera.position)>.7);assert.ok(!hand.equals(cinematic.actors[0].userData.rig.arms[1].joint.rotation)||theme==='home');
    cinematic.dispose();cinematic.dispose();assert.equal(cinematic.scene.children.length,0);
  }
  assert.equal(signatures.size,8);
});

test('forty event slots resolve stable room themes without invalid identifiers',()=>{
  for(let number=1;number<=40;number++)assert.ok(CINEMATIC_THEMES.includes(resolveCinematicTheme({number})));
  assert.equal(resolveCinematicTheme({number:18}),'care');assert.equal(resolveCinematicTheme('cell-27'),'offer');
  assert.equal(resolveCinematicTheme({location:'合租小楼'}),'home');
});

test('all forty actual events contain their story-specific dimensional props',()=>{
  assert.equal(Object.keys(CELL_SCENE_PROPS).length,40);const signatures=new Set();
  for(const event of EVENTS){
    const expected=CELL_SCENE_PROPS[event.number];assert.equal(expected.length,2);
    const room=createCinematicScene3D({theme:resolveCinematicTheme(event),cell:event.number,seed:event.number});
    for(const name of expected){const prop=room.scene.getObjectByName(name);assert.ok(prop,`${event.number} ${event.location}: ${name}`);let meshes=0;prop.traverse(node=>{if(node.isMesh)meshes++;assert.ok(!node.isSprite);});assert.ok(meshes>0,`${name} must contain actual geometry`);}
    // These legacy procedural room compositions are independent of the new
    // team-film playlist; changing delivery must not reshape existing rooms.
    signatures.add(expected.join('|'));assert.equal(room.scene.getObjectByName(`event-${event.number}-specific-props`)!==undefined,![6,11,13,15,18,22,27,31].includes(event.number),'eight original film scenes must not gain preview props');
    room.update(1.7);room.dispose();
  }
  assert.equal(signatures.size,40);
});
