import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {REFERENCE_BUILDING_SPECS,createReferenceBuilding,disposeReferenceBuilding} from '../src/reference-buildings-3d.js';
import {EVENTS} from '../src/events.js';
import {getCellArt} from '../src/reference-art-manifest.js';
import {batchExteriorDetails,disposeExteriorDetailInstances} from '../src/reference-exterior-detail.js';

const tolerance=1e-5;
const near=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} versus ${expected}`);
const meshList=group=>{const out=[];group.traverse(node=>{if(node.isMesh)out.push(node);});return out;};

test('all 40 actual game places have a unique numbered spec with exact original reference mappings',()=>{
  assert.equal(REFERENCE_BUILDING_SPECS.length,40);assert.equal(new Set(REFERENCE_BUILDING_SPECS.map(spec=>spec.id)).size,40);
  for(const spec of REFERENCE_BUILDING_SPECS){
    const art=getCellArt(spec.cell);assert.equal(spec.stationIndex,spec.cell-1);assert.equal(spec.name,EVENTS[spec.stationIndex].location);
    assert.equal(spec.id,`reference-cell-${String(spec.cell).padStart(2,'0')}`);assert.deepEqual(spec.referenceIds,[...new Set([...art.exterior,...art.interior,...art.shared])].sort((a,b)=>a-b));
    assert.ok(spec.width>=6 && spec.width<=11);assert.ok(spec.depth>=5 && spec.depth<=9);near(spec.front+spec.back,spec.depth,'front+back');assert.ok([-1,1].includes(spec.preferredSide));
  }
  assert.deepEqual(REFERENCE_BUILDING_SPECS[6].referenceIds,[9,10]);assert.deepEqual(REFERENCE_BUILDING_SPECS[7].referenceIds,[11]);assert.deepEqual(REFERENCE_BUILDING_SPECS[8].referenceIds,[7,8]);
});

test('all 40 buildings in all four seasons fit their precise planning footprint and have finite vertical volume',()=>{
  for(const spec of REFERENCE_BUILDING_SPECS)for(let season=0;season<4;season++){
    const group=createReferenceBuilding(spec.cell,{season}),bounds=new THREE.Box3().setFromObject(group);
    assert.equal(group.userData.real3D,true);assert.equal(group.userData.cell,spec.cell);assert.equal(group.userData.season,season);assert.deepEqual(group.userData.referenceIds,spec.referenceIds);
    near(bounds.min.x,-spec.width/2,`${spec.id} min x`);near(bounds.max.x,spec.width/2,`${spec.id} max x`);near(bounds.min.z,-spec.back,`${spec.id} min z`);near(bounds.max.z,spec.front,`${spec.id} max z`);
    near(bounds.min.y,0,`${spec.id} ground`);assert.ok(Number.isFinite(bounds.max.y) && bounds.max.y>1.5 && bounds.max.y<16,`${spec.id} height`);
    for(const child of group.children){const box=new THREE.Box3().setFromObject(child);assert.ok(box.min.x>=bounds.min.x-tolerance && box.max.x<=bounds.max.x+tolerance);assert.ok(box.min.z>=bounds.min.z-tolerance && box.max.z<=bounds.max.z+tolerance);}
    disposeReferenceBuilding(group);
  }
});

test('architecture uses spatial meshes and original procedural pixel materials, never source-image planes',()=>{
  let pixelMaterials=0;
  for(const spec of REFERENCE_BUILDING_SPECS){
    const group=createReferenceBuilding(spec.cell),meshes=meshList(group);assert.ok(group.userData.exteriorDetailStats.sourceMeshes>=35,`${spec.id} needs modeled detail before batching`);
    group.traverse(node=>assert.notEqual(node.isSprite,true,`${spec.id} must not be a billboard`));
    for(const item of meshes){
      assert.notEqual(item.geometry.type,'PlaneGeometry');assert.ok(item.geometry.getAttribute('position').count>=8);
      item.geometry.computeBoundingBox();const size=item.geometry.boundingBox.getSize(new THREE.Vector3());assert.ok(size.x>0 && size.y>0 && size.z>0,`${spec.id}/${item.name} needs thickness`);
      assert.ok(item.geometry.userData.sharedReferenceResource||item.geometry.userData.ownedExteriorBatch);assert.equal(item.material.userData.sharedReferenceResource,true);
      if(item.material.map){assert.ok(item.material.map.isDataTexture);assert.match(item.material.map.name,/^original-pixel-/);assert.ok(item.material.map.image.width<=128);pixelMaterials++;}
    }
  }
  assert.ok(pixelMaterials>400,'retain many original pixel wood, stone, roof and brick surfaces');
});

test('hospitals, transit, food stalls, garage, park and star hall have distinct structural identities',()=>{
  for(const [cell,names] of [[2,['stadium-open-canopy','stadium-tiered-seats']],[10,['high-speed-train-body','ticket-gate']],[14,['food-stall-counter','cooking-pan']],[18,['hospital-central-tower','hospital-helipad']],[20,['airport-terminal','airport-control-tower','airplane-wings']],[21,['market-lantern','market-light-string']],[32,['garage-entry-pillar','garage-warning-stripe','garage-lift-barrier']],[38,['onsen-open-water','onsen-lodge-main']],[39,['park-pavilion-column','park-tree-branch']],[40,['star-hall-celestial-dome','star-hall-gold-meridian','star-armillary']]]){
    const group=createReferenceBuilding(cell);for(const name of names)assert.ok(group.getObjectByName(name),`${cell} missing ${name}`);
  }
  const signatures=[14,18,20,32,38,39,40].map(cell=>meshList(createReferenceBuilding(cell)).map(mesh=>`${mesh.name}:${mesh.geometry.type}`).sort().join('|'));
  assert.equal(new Set(signatures).size,signatures.length);
});

test('seasons alter original foliage and snow geometry while disposal preserves other live instances',()=>{
  const spring=createReferenceBuilding(1,{season:0}),winter=createReferenceBuilding(1,{season:3});
  const springLeaves=meshList(spring).filter(mesh=>mesh.name==='seasonal-foliage').map(mesh=>mesh.material.color.getHex());
  const winterLeaves=meshList(winter).filter(mesh=>mesh.name==='seasonal-foliage').map(mesh=>mesh.material.color.getHex());assert.notDeepEqual(springLeaves,winterLeaves);
  assert.ok(winter.getObjectByName('seasonal-snow'));assert.equal(spring.getObjectByName('seasonal-snow'),undefined);
  const mapBuilding=createReferenceBuilding(32),previewBuilding=createReferenceBuilding(32),before=new THREE.Box3().setFromObject(mapBuilding),shared=meshList(mapBuilding)[0];
  let disposed=0;shared.geometry.addEventListener('dispose',()=>disposed++);shared.material.addEventListener('dispose',()=>disposed++);
  const scene=new THREE.Scene();scene.add(mapBuilding,previewBuilding);disposeReferenceBuilding(previewBuilding);disposeReferenceBuilding(previewBuilding);
  assert.equal(disposed,0);assert.equal(previewBuilding.children.length,0);assert.equal(previewBuilding.parent,null);assert.ok(mapBuilding.children.length);assert.deepEqual(new THREE.Box3().setFromObject(mapBuilding),before);
});

test('invalid building inputs are rejected before construction',()=>{
  for(const cell of [0,41,-1,1.5,'1',null,NaN])assert.throws(()=>createReferenceBuilding(cell));
  for(const season of [-1,4,.5,'winter',NaN])assert.throws(()=>createReferenceBuilding(1,{season}));
  assert.doesNotThrow(()=>disposeReferenceBuilding(null));
});

test('opaque detail batching preserves world positions, UVs and triangles while glazing remains sortable',()=>{
  const root=new THREE.Group(),parent=new THREE.Group();root.position.set(8,1,-3);parent.position.set(-2,3,1);parent.rotation.y=.4;root.add(parent);
  const geometry=new THREE.BoxGeometry(1,1,1),opaque=new THREE.MeshStandardMaterial(),glass=new THREE.MeshStandardMaterial({transparent:true,opacity:.5});
  for(let i=0;i<5;i++){
    const piece=new THREE.Mesh(geometry,i===4?glass:opaque);piece.name='ornament';piece.position.set(i,1,i*.3);piece.scale.set(.2+i*.11,.35+i*.13,.4);piece.userData.exteriorDetail=true;parent.add(piece);
  }
  const uvSignature=meshes=>meshes.flatMap(mesh=>{const uv=mesh.geometry.attributes.uv,indices=mesh.geometry.index,out=[];for(let i=0;i<(indices?.count||uv.count);i++){const k=indices?indices.getX(i):i;out.push(`${uv.getX(k)}:${uv.getY(k)}`);}return out;}).sort();
  const before=new THREE.Box3().setFromObject(root),transparent=parent.children[4],expectedUV=uvSignature(meshList(root));
  const expectedTriangles=meshList(root).reduce((sum,m)=>sum+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0);
  batchExteriorDetails(root);const after=new THREE.Box3().setFromObject(root);
  assert.ok(before.min.distanceTo(after.min)<1e-5);assert.ok(before.max.distanceTo(after.max)<1e-5);
  const meshes=meshList(root),batch=meshes.find(m=>m.userData.ownedExteriorBatch);assert.ok(batch);assert.equal(meshes.length,2);assert.equal(transparent.parent,parent);
  assert.equal(meshes.reduce((sum,m)=>sum+(m.geometry.index?.count||m.geometry.attributes.position.count)/3,0),expectedTriangles);
  const uvs=batch.geometry.attributes.uv;for(let i=0;i<uvs.count;i++){assert.ok(Number.isFinite(uvs.getX(i)));assert.ok(Number.isFinite(uvs.getY(i)));}
  assert.deepEqual(uvSignature(meshes),expectedUV,'surface coordinates survive the merged geometry');
  let sourceDisposals=0,batchDisposals=0;geometry.addEventListener('dispose',()=>sourceDisposals++);batch.geometry.addEventListener('dispose',()=>batchDisposals++);
  disposeExteriorDetailInstances(root);assert.equal(batchDisposals,1);assert.equal(sourceDisposals,0);assert.equal(geometry.attributes.position.count,24);
});

test('refined landmarks retain modeled ornament after batching and bound visible mesh count',()=>{
  for(const [cell,names] of [[1,['deep-eave-fascia','projecting-window-sill','layered-canopy-cluster','library-notice-board']],[3,['market-produce','individual-ivy-leaf','air-conditioner-grille']],[29,['factory-glazed-rooftop-studio','factory-external-iron-stair','individual-ivy-leaf']],[38,['fir-needle-bough','onsen-stepping-stone','onsen-water-ripple']],[40,['dome-constellation-star','palace-carved-capital','entry-compass-ray']]]){
    const group=createReferenceBuilding(cell,{season:Math.floor((cell-1)/10)}),meshes=meshList(group),labels=new Set(meshes.flatMap(mesh=>[mesh.name,...(mesh.userData.detailNames||[])]));
    for(const name of names)assert.ok(labels.has(name),`${cell} missing visible ${name}`);
    assert.ok(meshes.length<160,`${cell} has ${meshes.length} unbatched draws`);
    assert.ok(group.userData.exteriorDetailStats.sourceMeshes>meshes.length*3,`${cell} should batch repeated geometry`);
    disposeReferenceBuilding(group);
  }
});

test('disposing refined preview releases its own merged geometry exactly once without affecting another building',()=>{
  const a=createReferenceBuilding(29),b=createReferenceBuilding(29),aOwned=meshList(a).filter(m=>m.userData.ownedExteriorBatch),bOwned=meshList(b).filter(m=>m.userData.ownedExteriorBatch);
  assert.ok(aOwned.length>0);assert.ok(aOwned.every(m=>!bOwned.some(other=>m.geometry===other.geometry)));
  let aDisposed=0,bDisposed=0;for(const m of aOwned)m.geometry.addEventListener('dispose',()=>aDisposed++);for(const m of bOwned)m.geometry.addEventListener('dispose',()=>bDisposed++);
  disposeReferenceBuilding(a);disposeReferenceBuilding(a);assert.equal(aDisposed,aOwned.length);assert.equal(bDisposed,0);assert.ok(b.children.length>0);disposeReferenceBuilding(b);
});
