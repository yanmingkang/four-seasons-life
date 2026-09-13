import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldDaylight, normalizeTimeOfDay, mountDaylightSwitch, DAYLIGHT_STORAGE_KEY} from '../src/world-daylight.js';
import {JourneyWorld} from '../src/journey-world.js';
import {createOverviewBatch} from '../src/overview-batch.js';

function fixture(){
  const world={scene:new THREE.Scene(),fog:new THREE.Fog('#fff',65,360),overviewFog:new THREE.Fog('#fff',250,470),sun:new THREE.DirectionalLight(),hemisphere:new THREE.HemisphereLight(),renderer:{toneMappingExposure:1},art:{activeSeason:3,water:{material:new THREE.MeshStandardMaterial()},ripples:{material:new THREE.LineBasicMaterial()},sunDisk:{material:new THREE.MeshBasicMaterial()}},container:{dataset:{}},currentPosition:31,stage:'idle',camera:new THREE.PerspectiveCamera(),character:new THREE.Group(),mode:'full',cameraMode:'follow'};
  world.scene.background=new THREE.Color();world.daylight=new WorldDaylight(world);return world;
}
const visual=w=>({sun:w.sun.color.toArray(),offset:w.sunOffset.toArray(),hemi:w.hemisphere.color.toArray(),ground:w.hemisphere.groundColor.toArray(),fog:w.fog.color.toArray(),overviewFog:w.overviewFog.color.toArray(),water:w.art.water.material.color.toArray(),ripple:w.art.ripples.material.color.toArray(),exposure:w.renderer.toneMappingExposure,environment:w.scene.environmentIntensity});
test('only two appearance modes; invalid stored values safely default to morning',()=>{
  assert.equal(normalizeTimeOfDay('sunset'),'sunset');for(const v of [null,undefined,'night','rain','__proto__',{},'morning'])assert.equal(normalizeTimeOfDay(v),'morning');
});
test('whole-world colors and direction change without moving camera, character or season; exact round trip',()=>{
  const w=fixture(),original=visual(w),camera=w.camera.matrix.clone(),position=w.character.position.clone();
  w.daylight.setMode('sunset');assert.deepEqual(visual(w),original);
  w.daylight.update(.475);assert.equal(w.daylight.blend,.5);assert.notDeepEqual(visual(w).sun,original.sun);
  w.daylight.update(1);assert.equal(w.daylight.blend,1);const evening=visual(w);
  for(const key of Object.keys(original))assert.notDeepEqual(evening[key],original[key],key);
  assert.equal(w.art.activeSeason,3);assert.equal(w.currentPosition,31);assert.ok(w.camera.matrix.equals(camera));assert.ok(w.character.position.equals(position));
  assert.equal(w.fog.near,65);assert.equal(w.overviewFog.far,470);
  const revision=w.daylight.revision;for(let i=0;i<100;i++)assert.equal(w.daylight.update(.016),false);assert.equal(w.daylight.revision,revision);
  w.daylight.setMode('morning');w.daylight.update(1);assert.deepEqual(visual(w),original);
});
test('quick reversal is continuous and reduced-motion/paused switching settles immediately',()=>{
  const w=fixture(),d=w.daylight;d.setMode('sunset');d.update(.2);const blend=d.blend;
  d.setMode('morning');assert.equal(d.blend,blend);d.update(.1);assert.ok(d.blend<blend&&d.blend>0);
  d.setMode('sunset');d.update(0,{immediate:true});assert.equal(d.blend,1);
  d.setMode('morning',{immediate:true});assert.equal(d.blend,0);d.setMode('sunset');d.update(NaN);assert.equal(d.blend,0);d.update(-1);assert.equal(d.blend,0);
});
test('lights get world-local materials before batching; ordinary warm objects never glow; faded copies stay in sync',()=>{
  const w=fixture(),g=new THREE.Group(),shared=new THREE.MeshStandardMaterial({emissive:'#ffc16a',emissiveIntensity:.24});shared.userData.daylightEmitter=true;shared.userData.sharedReferenceResource=true;
  const geometry=new THREE.BoxGeometry(),first=new THREE.Mesh(geometry,shared),second=new THREE.Mesh(geometry,shared),food=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#ffe0a1'}));g.add(first,second,food);w.scene.add(g);
  w.daylight.prepareEmitters(w.scene);const owned=first.material;assert.notEqual(owned,shared);assert.equal(second.material,owned);assert.equal(w.daylight.emitters.size,1);assert.equal(food.material.emissiveIntensity,1);assert.equal(food.material.emissive.getHex(),0);
  const batch=createOverviewBatch({scene:w.scene,groups:[g]});const proxy=batch.group.children.find(m=>m.material===owned);assert.ok(proxy);
  const faded=owned.clone();w.daylight.registerEmitter(faded);w.daylight.setMode('sunset',{immediate:true});assert.equal(proxy.material.emissiveIntensity,1.35);assert.equal(faded.emissiveIntensity,1.35);assert.equal(shared.emissiveIntensity,.24);
  for(let i=0;i<20;i++){w.daylight.setMode(i%2?'sunset':'morning',{immediate:true});w.daylight.prepareEmitters(g);}
  assert.equal(w.daylight.copies.size,1);assert.equal(w.daylight.emitters.size,2);w.daylight.dispose();assert.equal(w.daylight.emitters.size,0);
});
test('paused world invalidates for a lighting change, then goes back to a frozen backdrop',()=>{
  const w=fixture(),render=()=>JourneyWorld.prototype.shouldRenderPausedFrame.call(w,true);
  assert.equal(render(),true);assert.equal(render(),false);w.daylight.setMode('sunset',{immediate:true});assert.equal(render(),true);assert.equal(render(),false);
});
function controlFixture(){
  const buttons=['morning','sunset'].map(mode=>({dataset:{daylight:mode},attrs:{},setAttribute(k,v){this.attrs[k]=v;},closest(){return this;}}));
  const root=new EventTarget();Object.assign(root,{dataset:{},querySelectorAll:()=>buttons,contains:b=>buttons.includes(b)});
  const click=b=>{const event=new Event('click');Object.defineProperty(event,'target',{value:b});root.dispatchEvent(event);};return {root,buttons,click};
}
test('preference restoration, native button state, storage denial and fallback mode are safe',()=>{
  const {root,buttons,click}=controlFixture(),calls=[],store=new Map([[DAYLIGHT_STORAGE_KEY,'sunset']]);
  const cleanup=mountDaylightSwitch(root,{setTimeOfDay:(...args)=>calls.push(args)},{storage:()=>({getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)})});
  assert.deepEqual(calls[0],['sunset',{immediate:true}]);assert.equal(buttons[1].attrs['aria-pressed'],'true');click(buttons[0]);assert.equal(store.get(DAYLIGHT_STORAGE_KEY),'morning');cleanup();click(buttons[1]);assert.equal(calls.length,2);
  const denied=controlFixture();assert.doesNotThrow(()=>{mountDaylightSwitch(denied.root,{setTimeOfDay(){}},{storage:()=>{throw Error('denied');}});denied.click(denied.buttons[1]);});
  const fallback=controlFixture();mountDaylightSwitch(fallback.root,{}, {storage:()=>null});assert.ok(fallback.buttons.every(b=>b.disabled));
});
