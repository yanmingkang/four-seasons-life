import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EVENTS,SEASONS} from '../src/events.js';
import {routeFor} from '../src/route.js';
import {WORLD_ROUTE_NODES,stationU,stationName,cinematicStation,WALK_STEP_MS} from '../src/journey-world.js';
import {Scenery,CANAL_CENTER_X,groundPoint,surfaceY} from '../src/scenery.js';

const curve=new THREE.CatmullRomCurve3(WORLD_ROUTE_NODES.map(([x,z])=>groundPoint(x,z)),false,'centripetal');

test('the landscape map is one open journey with every event represented once',()=>{
  assert.equal(EVENTS.length,40);
  assert.deepEqual(routeFor('full'),EVENTS.map((_,index)=>index));
  assert.equal(curve.closed,false);
  const xs=WORLD_ROUTE_NODES.map(p=>p[0]),zs=WORLD_ROUTE_NODES.map(p=>p[1]);
  assert.ok(Math.max(...xs)-Math.min(...xs)>Math.max(...zs)-Math.min(...zs));
  assert.equal(stationU(0),.045);
  assert.ok(Math.abs(stationU(EVENTS.length-1)-.945)<1e-10);
  assert.equal(WALK_STEP_MS,1800);
});

test('forty physical stations neither overlap nor enter the canal',()=>{
  const points=EVENTS.map((_,i)=>curve.getPointAt(stationU(i)));
  points.forEach((p,i)=>{
    assert.ok([p.x,p.y,p.z].every(Number.isFinite));
    assert.ok(Math.abs(p.x-CANAL_CENTER_X)>7,`station ${i+1} enters river bank`);
    if(i)assert.ok(stationU(i)>stationU(i-1));
    for(let j=0;j<i;j++)assert.ok(points[j].distanceTo(p)>3.5,`stations ${j+1} and ${i+1} overlap`);
  });
  for(const z of [-61,-40,0,30,51])assert.ok(surfaceY(CANAL_CENTER_X,z)<-.05);
});

test('seasonal scenery, compact place signs and eight cinematic cells match event data',()=>{
  const scenery=new Scenery(new THREE.Scene(),curve,null);
  EVENTS.forEach((event,i)=>{
    const p=curve.getPointAt(stationU(i));
    assert.equal(scenery.seasonAt(p.x,p.z),event.season,`station ${i+1} biome mismatch`);
    assert.equal(stationName(event),event.location||event.title);
  });
  assert.deepEqual(SEASONS.map((_,s)=>EVENTS.filter(e=>e.season===s).length),[10,10,10,10]);
  assert.deepEqual(EVENTS.flatMap((e,i)=>cinematicStation(e,i)?[i+1]:[]),[6,8,11,15,18,22,27,31]);
  assert.equal(cinematicStation(EVENTS[12],12),false,'cell 13 has no movie pennant');
  assert.equal(cinematicStation(EVENTS[7],1),true,'film identity does not depend on a short-route position');
  assert.equal(cinematicStation({...EVENTS[12],cinematicId:null},5),false,'old positional fallbacks cannot revive a movie pennant');
});
