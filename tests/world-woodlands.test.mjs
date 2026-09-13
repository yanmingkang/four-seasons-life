import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {planWorldWoodlands,createWorldWoodlands} from '../src/world-woodlands.js';
import {WORLD_ROUTE_NODES} from '../src/journey-world.js';
import {groundPoint,surfaceY} from '../src/scenery.js';
import {planPastoralBuildings,pointToFootprint} from '../src/pastoral-buildings.js';
import {planTownOutskirts} from '../src/town-outskirts.js';
import {EVENTS} from '../src/events.js';
const curve=new THREE.CatmullRomCurve3(WORLD_ROUTE_NODES.map(([x,z])=>groundPoint(x,z)),false,'centripetal'),roadSamples=curve.getSpacedPoints(280),buildingPlans=planPastoralBuildings(curve,EVENTS),seasonAt=(x,z)=>z>23?0:z>0?1:z> -25?2:3;
const plots=planTownOutskirts({roadSamples,buildingPlans,seasonAt}),input={roadSamples,buildingPlans,plots,seasonAt};
test('surrounding woodland spans every quadrant, preserves clearings and does not alter the playable route',()=>{
  const original=JSON.stringify(input),plans=planWorldWoodlands(input);assert.deepEqual(plans,planWorldWoodlands(input));assert.equal(JSON.stringify(input),original);assert.ok(plans.length>1200&&plans.length<4000);
  for(const sx of [-1,1])for(const sz of [-1,1])assert.ok(plans.filter(p=>p.x*sx>80&&p.z*sz>80).length>100);
  for(const p of plans){assert.ok(roadSamples.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>=p.radius+7.8));assert.ok(buildingPlans.every(b=>pointToFootprint(p.x,p.z,b)>=p.radius+5.5));assert.ok(plots.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>=q.radius+p.radius+.8));}
});
test('thousands of surrounding trees share a bounded number of volumetric instanced batches',()=>{
  const result=createWorldWoodlands({...input,scene:new THREE.Scene(),groundHeight:surfaceY});assert.ok(result.stats.outerTrees>1000);assert.ok(result.stats.drawGroups<=7);assert.ok(result.group.children.every(mesh=>mesh.isInstancedMesh));
  for(const mesh of result.group.children){assert.ok(mesh.geometry.attributes.position.count>10);assert.ok(mesh.boundingSphere.radius>100);}
});
