import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WORLD_ROUTE_NODES} from '../src/journey-world.js';
import {Scenery,groundPoint,surfaceY} from '../src/scenery.js';
import {pointToFootprint} from '../src/pastoral-buildings.js';
import {planTownOutskirts,createTownOutskirts} from '../src/town-outskirts.js';

const curve=new THREE.CatmullRomCurve3(WORLD_ROUTE_NODES.map(([x,z])=>groundPoint(x,z)),false,'centripetal');
const scenery=new Scenery(new THREE.Scene(),curve,null);
const input={roadSamples:curve.getSpacedPoints(1200),buildingPlans:scenery.buildingPlans,seasonAt:(x,z)=>scenery.seasonAt(x,z)};

test('outskirts make deterministic coherent clearings without changing roads or station buildings',()=>{
  const before=JSON.stringify({roads:input.roadSamples,buildings:input.buildingPlans});
  const plots=planTownOutskirts(input);assert.deepEqual(plots,planTownOutskirts(input));
  assert.equal(JSON.stringify({roads:input.roadSamples,buildings:input.buildingPlans}),before);
  assert.equal(plots.length,20);assert.equal(new Set(plots.map(p=>p.id)).size,plots.length);
  assert.deepEqual([...new Set(plots.map(p=>p.kind))].sort(),['farm','garden','homestead','market','orchard','village','well-garden','windmill']);
  assert.ok(plots.some(p=>p.x>85&&p.kind==='village'));assert.ok(plots.some(p=>p.region==='town'));
  const denseRoad=curve.getSpacedPoints(4800);
  plots.forEach((plot,i)=>{
    assert.ok(plot.radius>3&&plot.radius<=12);assert.ok(Math.abs(plot.x)+plot.radius<131&&Math.abs(plot.z)+plot.radius<131);
    assert.ok(plot.x+plot.radius<62||plot.x-plot.radius>72,`${plot.id} enters canal strip`);
    assert.equal(plot.season,Math.floor(input.seasonAt(plot.x,plot.z)));
    for(const road of denseRoad)assert.ok(Math.hypot(plot.x-road.x,plot.z-road.z)>=plot.radius+4.85,`${plot.id} encroaches on route clearance`);
    for(const building of input.buildingPlans)assert.ok(pointToFootprint(plot.x,plot.z,building)>=plot.radius+1.5,`${plot.id} encroaches on a station building`);
    for(let j=0;j<i;j++)assert.ok(Math.hypot(plot.x-plots[j].x,plot.z-plots[j].z)>=plot.radius+plots[j].radius+2);
  });
  assert.deepEqual([...new Set(plots.map(p=>p.season))].sort(),[0,1,2,3]);
});

test('every physical scenery instance stays inside its reserved circular plot with bounded draw cost',()=>{
  const originalBuildingCount=input.buildingPlans.length;
  const scene=new THREE.Scene(),result=createTownOutskirts({...input,scene,groundHeight:surfaceY});
  assert.ok(scene.children.includes(result.group));assert.equal(result.group.name,'town-outskirts');assert.equal(result.group.userData.environmentOnly,true);
  assert.deepEqual(result.plots,planTownOutskirts(input));assert.deepEqual(result.occluders,[]);
  assert.equal(result.stats.plots,20);assert.equal(result.stats.homes,14);assert.equal(result.stats.windmills,2);assert.equal(result.stats.marketStalls,3);assert.equal(result.stats.orchardTrees,40);
  assert.ok(result.stats.cropPlants>200&&result.stats.flowerPlants>60);
  assert.ok(result.stats.drawCalls<=55,`draw calls ${result.stats.drawCalls}`);assert.ok(result.stats.triangles<45000);
  const byId=new Map(result.plots.map(p=>[p.id,p])),matrix=new THREE.Matrix4(),vertex=new THREE.Vector3();let drawCalls=0,instances=0;
  result.group.traverse(mesh=>{
    if(!mesh.isMesh)return;drawCalls++;assert.equal(mesh.isInstancedMesh,true);assert.equal(mesh.castShadow,true);assert.equal(mesh.receiveShadow,true);assert.equal(mesh.frustumCulled,true);
    assert.ok(mesh.geometry.boundingSphere||mesh.boundingSphere);assert.equal(mesh.userData.plotIds.length,mesh.count);instances+=mesh.count;
    if(mesh.material.map){assert.equal(mesh.material.map.magFilter,THREE.NearestFilter);assert.equal(mesh.material.map.minFilter,THREE.LinearMipmapLinearFilter);assert.equal(mesh.material.map.generateMipmaps,true);}
    for(let i=0;i<mesh.count;i++){
      mesh.getMatrixAt(i,matrix);assert.ok(matrix.elements.every(Number.isFinite));const plot=byId.get(mesh.userData.plotIds[i]);assert.ok(plot);
      const bounds=new THREE.Box3();
      for(let k=0;k<mesh.geometry.attributes.position.count;k++){
        vertex.fromBufferAttribute(mesh.geometry.attributes.position,k).applyMatrix4(matrix);bounds.expandByPoint(vertex);
        assert.ok(Math.hypot(vertex.x-plot.x,vertex.z-plot.z)<=plot.radius+1e-4,`${plot.id} mesh exceeds plot circle`);
      }
      const size=bounds.getSize(new THREE.Vector3());assert.ok(size.x>0&&size.y>0&&size.z>0,'props are volumetric, not image planes');
    }
  });
  assert.equal(drawCalls,result.stats.drawCalls);assert.equal(instances,result.stats.instances);
  assert.equal(input.buildingPlans.length,originalBuildingCount,'decorative homes must not extend the station building registry');
  assert.equal(input.buildingPlans.filter(p=>p.cell).length,40,'reference buildings remain attached to exactly forty stations');
});

test('all scenery follows the injected terrain height and supplied seasonal choice',()=>{
  const low=createTownOutskirts({...input,groundHeight:(x,z)=>.025*x+.015*z,seasonAt:()=>2});
  const high=createTownOutskirts({...input,groundHeight:(x,z)=>17+.025*x+.015*z,seasonAt:()=>2});
  assert.deepEqual(low.plots,high.plots);assert.ok(low.plots.every(p=>p.season===2));
  const collect=result=>{const meshes=[];result.group.traverse(m=>{if(m.isInstancedMesh)meshes.push(m);});return meshes;};
  const lows=collect(low),highs=collect(high),a=new THREE.Matrix4(),b=new THREE.Matrix4();assert.equal(lows.length,highs.length);
  for(let k=0;k<lows.length;k++)for(let i=0;i<lows[k].count;i++){
    lows[k].getMatrixAt(i,a);highs[k].getMatrixAt(i,b);assert.ok(Math.abs(b.elements[13]-a.elements[13]-17)<3e-6);
    assert.equal(a.elements[12],b.elements[12]);assert.equal(a.elements[14],b.elements[14]);
  }
});
