import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EVENTS} from '../src/events.js';
import {WORLD_ROUTE_NODES} from '../src/journey-world.js';
import {Scenery,groundPoint,CANAL_CENTER_X,batchStatic} from '../src/scenery.js';
import {LANDMARK_BUILDINGS,createPastoralBuilding,planPastoralBuildings,pointToFootprint,footprintsOverlap,footprintCorners,pixelTexture} from '../src/pastoral-buildings.js';

const curve=new THREE.CatmullRomCurve3(WORLD_ROUTE_NODES.map(([x,z])=>groundPoint(x,z)),false,'centripetal');

test('all building styles keep their 3D trim without creating facade lettering',t=>{
  const previous=globalThis.document;
  globalThis.document={createElement(){assert.fail('Building models must not allocate name canvases or decals');}};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  for(const id of [...LANDMARK_BUILDINGS.map(b=>b.id),'cottage','cafe','workshop'])for(let season=0;season<4;season++){
    const model=createPastoralBuilding(id,{season});
    assert.equal(model.userData.real3D,true);
    model.traverse(object=>{if(object.isMesh)for(const material of [].concat(object.material))assert.ok(!material.map?.isCanvasTexture,`${id}: no painted name decal`);});
  }
});

test('all reference landmarks are real volumes with side faces, shadows and identifiable geometry',()=>{
  for(const spec of LANDMARK_BUILDINGS){
    const model=createPastoralBuilding(spec.id),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
    assert.ok(size.x>3&&size.y>2&&size.z>3,`${spec.id} must occupy X/Y/Z`);
    assert.equal(model.userData.real3D,true);assert.equal(model.name,`pastoral-${spec.id}`);
    let sideFaces=0,roofFaces=0;
    model.traverse(m=>{if(!m.isMesh)return;assert.ok(m.castShadow&&m.receiveShadow);const normals=m.geometry.attributes.normal;for(let i=0;i<normals.count;i++){if(Math.abs(normals.getX(i))>.5)sideFaces++;if(normals.getY(i)>.5)roofFaces++;}});
    assert.ok(sideFaces>50&&roofFaces>30);
    assert.ok(bounds.min.x>=-spec.width/2&&bounds.max.x<=spec.width/2,`${spec.id} X outside reserved plot`);
    assert.ok(bounds.min.z>=-spec.back&&bounds.max.z<=spec.front,`${spec.id} Z outside reserved plot`);
  }
  const stadium=createPastoralBuilding('stadium'),roof=stadium.getObjectByName('elliptical-open-roof');assert.ok(roof);
  stadium.updateMatrixWorld(true);const ray=new THREE.Raycaster(new THREE.Vector3(0,10,0),new THREE.Vector3(0,-1,0));
  assert.equal(ray.intersectObject(roof).length,0,'the stadium roof must have an actual central opening');
  assert.ok(ray.intersectObject(stadium,true).some(hit=>hit.point.y<.4),'green pitch must remain visible through the opening');
});

test('landmarks sit at the first three actual stations and all building footprints avoid road, water and each other',()=>{
  const plans=planPastoralBuildings(curve,EVENTS),samples=curve.getSpacedPoints(4800);
  assert.deepEqual(plans,planPastoralBuildings(curve,EVENTS),'placement is deterministic');
  assert.deepEqual(plans.slice(0,4).map(p=>[p.id,p.stationIndex]),[['library',0],['stadium',1],['village',2],['bookstall',0]]);
  assert.equal(plans[3].decorative,true);assert.ok(plans.length>=25);
  assert.deepEqual([...new Set(plans.map(p=>p.season))].sort(),[0,1,2,3]);
  assert.ok(['cottage','workshop','cafe'].every(id=>plans.some(p=>p.id===id)));
  plans.forEach((plan,i)=>{
    const station=curve.getPointAt(plan.routeU??(.045+plan.stationIndex/(EVENTS.length-1)*.9));
    assert.ok(Math.hypot(plan.x-station.x,plan.z-station.z)<23,`${plan.name} too far from its station`);
    for(const p of samples)assert.ok(pointToFootprint(p.x,p.z,plan)>=3.7,`${plan.name} overlaps road or station frontage`);
    for(const corner of footprintCorners(plan))assert.ok(corner.x<CANAL_CENTER_X-5.4,`${plan.name} enters water`);
    for(let j=0;j<i;j++)assert.equal(footprintsOverlap(plan,plans[j],.8),false,`${plan.name} overlaps ${plans[j].name}`);
  });
});

test('pixel patterns retain crisp closeups with mipmaps at distance and static batching preserves landmark volume',()=>{
  for(const pattern of ['wood','brick','roof','plaster','stone']){
    const texture=pixelTexture(pattern);assert.equal(texture,pixelTexture(pattern));assert.equal(texture.magFilter,THREE.NearestFilter);assert.equal(texture.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(texture.generateMipmaps,true);assert.equal(texture.image.width,128);
  }
  for(const {id} of LANDMARK_BUILDINGS){
    const model=createPastoralBuilding(id),before=new THREE.Box3().setFromObject(model);let count=0;model.traverse(m=>{if(m.isMesh)count++;});batchStatic(model);
    let afterCount=0;model.traverse(m=>{if(m.isMesh)afterCount++;});assert.ok(afterCount<22,`${id} has ${afterCount} draw groups`);assert.ok(afterCount<count/2);
    const after=new THREE.Box3().setFromObject(model);assert.ok(before.min.distanceTo(after.min)<1e-5&&before.max.distanceTo(after.max)<1e-5);
  }
});

test('four season weather follows the supplied pausable game clock and active season',()=>{
  const scenery=new Scenery(new THREE.Scene(),curve,null);scenery.createWeather();assert.equal(scenery.weather.length,4);
  for(let season=0;season<4;season++){
    scenery.setSeason(season);scenery.update(1200);assert.deepEqual(scenery.weather.map(w=>w.mesh.visible),[0,1,2,3].map(i=>i===season));
    const selected=scenery.weather[season].mesh.geometry.attributes.position,previous=Array.from(selected.array);
    scenery.update(1200);assert.deepEqual(Array.from(selected.array),previous,'paused clock leaves weather untouched');
    scenery.update(2400);assert.notDeepEqual(Array.from(selected.array),previous);
    assert.ok(Array.from(selected.array).every(Number.isFinite));
  }
  scenery.setView(new THREE.PerspectiveCamera(),true);assert.ok(scenery.weather.every(w=>!w.mesh.visible));scenery.dispose();
});
