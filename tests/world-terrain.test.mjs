import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {surfaceY,groundPoint} from '../src/scenery.js';
import {WORLD_ROUTE_NODES} from '../src/journey-world.js';
import {createWorldTerrain,scenicHeight,blendSeasonWeights,WORLD_TERRAIN_RADIUS} from '../src/world-terrain.js';

test('expanded landscape preserves every playable ground sample and blends four readable seasons',()=>{
  for(const x of [-72,-51.3,-12,0,27.1,72])for(const z of [-60,-43.7,-8,0,24.2,55])assert.equal(scenicHeight(x,z,surfaceY),surfaceY(x,z));
  const curve=new THREE.CatmullRomCurve3(WORLD_ROUTE_NODES.map(([x,z])=>groundPoint(x,z)),false,'centripetal');
  for(const p of curve.getSpacedPoints(300))assert.equal(scenicHeight(p.x,p.z,surfaceY),surfaceY(p.x,p.z));
  for(let coordinate=-700;coordinate<=700;coordinate+=14)for(const sign of [-1,1])assert.ok(Number.isFinite(scenicHeight(coordinate,sign*coordinate,surfaceY)),'diagonal sector seams remain finite after floating-point rounding');
  for(const x of [-700,-72,0,45,230,900])for(const z of [-900,-40,-22,-10,0,12,19,40,700]){
    const weights=blendSeasonWeights(x,z);assert.equal(weights.length,4);assert.ok(weights.every(w=>Number.isFinite(w)&&w>=0&&w<=1));assert.ok(Math.abs(weights.reduce((a,b)=>a+b,0)-1)<1e-12);
    const nearby=blendSeasonWeights(x+.001,z+.001);assert.ok(weights.every((w,i)=>Math.abs(w-nearby[i])<.001));
  }
  [40,12,-12,-40].forEach((z,season)=>assert.equal(blendSeasonWeights(0,z)[season],1));
});

test('multiring terrain has no internal open edges and scenicHeight grounds props on actual LOD faces',()=>{
  const {mesh,stats}=createWorldTerrain({scene:new THREE.Scene(),surfaceY}),geometry=mesh.geometry,positions=geometry.attributes.position,normals=geometry.attributes.normal;
  assert.equal(stats.radius,1000);assert.equal(stats.coreStep,1);assert.ok(stats.vertices<60000&&stats.triangles<120000,'outer landscape must remain cheaper than an expanded dense grid');
  for(let i=0;i<positions.count;i++){assert.ok(Number.isFinite(positions.getY(i)));assert.ok(normals.getY(i)>.4,'all landscape faces point up');}
  const edges=new Map(),index=geometry.index.array;
  for(let i=0;i<index.length;i+=3)for(const [a,b] of [[index[i],index[i+1]],[index[i+1],index[i+2]],[index[i+2],index[i]]]){const key=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(key,(edges.get(key)||0)+1);}
  let boundaryEdges=0;for(const [key,count] of edges){assert.ok(count===1||count===2);if(count===1){boundaryEdges++;for(const vertex of key.split(':').map(Number))assert.ok(Math.abs(Math.hypot(positions.getX(vertex),positions.getZ(vertex))-WORLD_TERRAIN_RADIUS)<.001,'the only open boundary is the far circular perimeter');}}
  assert.equal(boundaryEdges,640);
  for(const [x,z] of [[75.3,67.8],[85,40],[-103,-80],[100.2,92.5],[157,-103],[220,12],[437,253],[750,300],[-444,87],[-680,-444]]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,500,z),new THREE.Vector3(0,-1,0)),hit=ray.intersectObject(mesh)[0];assert.ok(hit,`terrain exists beneath ${x},${z}`);assert.ok(Math.abs(hit.point.y-scenicHeight(x,z,surfaceY))<.0001,'props use the same triangle elevation as visible ground');
  }
  geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();
});
