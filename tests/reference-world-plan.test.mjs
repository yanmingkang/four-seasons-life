import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EVENTS} from '../src/events.js';
import {WORLD_ROUTE_NODES} from '../src/journey-world.js';
import {groundPoint,CANAL_CENTER_X} from '../src/scenery.js';
import {planReferenceBuildings,referenceLandmarkId} from '../src/reference-world-plan.js';
import {pointToFootprint,footprintsOverlap,footprintCorners} from '../src/pastoral-buildings.js';

const curve=new THREE.CatmullRomCurve3(WORLD_ROUTE_NODES.map(([x,z])=>groundPoint(x,z)),false,'centripetal');
test('all forty reference scenes receive a deterministic real map plot without replacing the route',()=>{
  const plans=planReferenceBuildings(curve,EVENTS),cells=plans.filter(p=>p.cell);
  assert.deepEqual(plans,planReferenceBuildings(curve,EVENTS));
  assert.deepEqual(cells.map(p=>p.cell),EVENTS.map(e=>e.number));
  assert.equal(new Set(cells.map(p=>p.id)).size,40);
  assert.ok(plans.some(p=>p.id==='bookstall'),'retain the original coffee bookstall');
  for(const plan of cells){
    assert.equal(plan.stationIndex,plan.cell-1);assert.equal(plan.season,EVENTS[plan.cell-1].season);
    assert.equal(plan.id,referenceLandmarkId(plan.cell));assert.ok(plan.scale>=.76&&plan.scale<=1);
    const anchor=curve.getPointAt(.045+plan.stationIndex/(EVENTS.length-1)*.9);
    assert.ok(Math.hypot(plan.x-anchor.x,plan.z-anchor.z)<24,`${plan.cell} remains near its event`);
  }
});
test('reference building plots preserve safe road and canal clearance, without building collisions',()=>{
  const plans=planReferenceBuildings(curve,EVENTS),samples=curve.getSpacedPoints(4800);
  for(const [i,plan] of plans.entries()){
    for(const point of samples)assert.ok(pointToFootprint(point.x,point.z,plan)>=3.72,`${plan.id} encroaches on the route`);
    for(const point of footprintCorners(plan))assert.ok(point.x<CANAL_CENTER_X-5.4,`${plan.id} enters the canal`);
    for(const other of plans.slice(0,i))assert.equal(footprintsOverlap(plan,other,.8),false,`${plan.id} collides with ${other.id}`);
  }
});
