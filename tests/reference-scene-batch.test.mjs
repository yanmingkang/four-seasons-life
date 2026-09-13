import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {batchReferenceSceneEnvironment} from '../src/reference-scene-batch.js';
import {createCinematicScene3D,resolveCinematicTheme} from '../src/cinematic-scenes-3d.js';

const rounded=n=>Math.round(n*1000)/1000;
function visibleVertices(root){
  const records=[],position=new THREE.Vector3(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3(),matrix=new THREE.Matrix4(),instance=new THREE.Matrix4();
  root.updateWorldMatrix(true,true);
  root.traverseVisible(object=>{
    if(!object.isMesh)return;
    const geometry=object.geometry,attributes=geometry.attributes,count=geometry.index?.count??attributes.position.count;
    for(let i=0;i<(object.isInstancedMesh?object.count:1);i++){
      matrix.copy(object.matrixWorld);if(object.isInstancedMesh){object.getMatrixAt(i,instance);matrix.multiply(instance);}normalMatrix.getNormalMatrix(matrix);
      for(let j=geometry.drawRange.start;j<Math.min(count,geometry.drawRange.start+geometry.drawRange.count);j++){
        const vertex=geometry.index?geometry.index.getX(j):j;
        position.fromBufferAttribute(attributes.position,vertex).applyMatrix4(matrix);
        const row=[object.material.uuid,...position.toArray().map(rounded)];
        if(attributes.normal){normal.fromBufferAttribute(attributes.normal,vertex).applyMatrix3(normalMatrix).normalize();row.push(...normal.toArray().map(rounded));}
        if(attributes.uv)row.push(rounded(attributes.uv.getX(vertex)),rounded(attributes.uv.getY(vertex)));
        records.push(JSON.stringify(row));
      }
    }
  });return records.sort();
}

test('environment batching preserves world-space shapes, normals, physical UVs and named anchors under transformed parents',()=>{
  const scene=new THREE.Scene(),environment=new THREE.Group(),nested=new THREE.Group();scene.position.set(2,3,-4);scene.rotation.y=.23;scene.add(environment);environment.position.set(-1,2,3);environment.rotation.y=-.1;environment.add(nested);nested.position.set(3,1,2);nested.rotation.y=.2;
  const material=new THREE.MeshStandardMaterial({color:'#b69871'}),sources=[];
  for(let i=0;i<3;i++){
    const geometry=new THREE.BoxGeometry(1+i*.2,.2,2),uv=geometry.attributes.uv;
    for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*.17,uv.getY(j)*.32);
    const mesh=new THREE.Mesh(geometry,material);mesh.name=`timber-board-${i}`;mesh.position.set(i*2,.5,0);mesh.scale.set(i===2?-1:1,.7,1.3);mesh.castShadow=mesh.receiveShadow=true;nested.add(mesh);sources.push(mesh);
  }
  const before=visibleVertices(environment),positions=sources.map(m=>m.geometry.attributes.position.array.slice()),uvs=sources.map(m=>m.geometry.attributes.uv.array.slice()),result=batchReferenceSceneEnvironment(environment);
  assert.deepEqual(visibleVertices(environment),before);assert.equal(result.stats.batchedMeshes,3);assert.equal(result.stats.mergedMeshes,1);assert.equal(result.stats.savedDrawCalls,2);
  sources.forEach((mesh,i)=>{assert.equal(environment.getObjectByName(mesh.name),mesh);assert.equal(mesh.parent,nested);assert.equal(mesh.visible,false);assert.deepEqual(mesh.geometry.attributes.position.array,positions[i]);assert.deepEqual(mesh.geometry.attributes.uv.array,uvs[i]);});
  const merged=result.group.children[0].children[0];assert.equal(merged.material,material);assert.equal(merged.castShadow,true);assert.equal(merged.receiveShadow,true);
  const p=merged.geometry.attributes.position,n=merged.geometry.attributes.normal,index=merged.geometry.index,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  for(let i=0;i<index.count;i+=3){const first=index.getX(i);a.fromBufferAttribute(p,first);b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));assert.ok(b.sub(a).cross(c.sub(a)).dot(new THREE.Vector3().fromBufferAttribute(n,first))>0,'reflected boards retain front face winding');}
  result.dispose();assert.deepEqual(visibleVertices(environment),before);
});

test('hidden ancestors, existing instances, transparency, animated subtrees and point lights keep their exact rendering ownership',()=>{
  const environment=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,1),material=new THREE.MeshStandardMaterial(),hidden=new THREE.Group(),dynamic=new THREE.Group();hidden.visible=false;dynamic.userData.referenceBatchDynamic=true;environment.add(hidden,dynamic);
  const mesh=(name,parent=environment,selectedMaterial=material)=>{const object=new THREE.Mesh(geometry,selectedMaterial);object.name=name;parent.add(object);return object;};
  mesh('static-1');mesh('static-2');mesh('hidden-parent-anchor',hidden);mesh('animated-prop',dynamic);
  const hiddenAnchor=mesh('already-instanced-anchor');hiddenAnchor.visible=false;
  const existing=new THREE.InstancedMesh(geometry,material,2);existing.name='existing-detail-instances';existing.setMatrixAt(0,new THREE.Matrix4().makeTranslation(3,0,0));existing.setMatrixAt(1,new THREE.Matrix4().makeTranslation(5,0,0));environment.add(existing);
  const glass=mesh('glass',environment,new THREE.MeshStandardMaterial({transparent:true,opacity:.4}));glass.renderOrder=5;
  const ranged=mesh('partial-geometry');ranged.geometry=geometry.clone();ranged.geometry.setDrawRange(0,6);
  const callbackMesh=mesh('custom-render-hook');callbackMesh.onBeforeRender=()=>{};
  const light=new THREE.PointLight('#ffd39d',5,8);environment.add(light);
  const before=visibleVertices(environment),instanceMatrices=existing.instanceMatrix.array.slice(),result=batchReferenceSceneEnvironment(environment);
  assert.deepEqual(visibleVertices(environment),before);assert.equal(result.stats.batchedMeshes,2);
  for(const object of [existing,glass,ranged,callbackMesh,light]){assert.equal(object.parent,environment);assert.equal(object.visible,true);}
  assert.equal(hidden.visible,false);assert.equal(hiddenAnchor.visible,false);assert.equal(dynamic.children[0].visible,true);assert.equal(glass.renderOrder,5);assert.deepEqual(existing.instanceMatrix.array,instanceMatrices);
  assert.equal(batchReferenceSceneEnvironment(environment),result,'calling twice cannot re-batch existing proxy geometry');
  result.dispose();assert.equal(hiddenAnchor.visible,false);assert.equal(hidden.visible,false);
});

test('different shadow/layer flags stay separate and only new GPU geometry is disposed exactly once',()=>{
  const environment=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,1),texture=new THREE.DataTexture(new Uint8Array(4),1,1),material=new THREE.MeshStandardMaterial({map:texture});
  for(let i=0;i<4;i++){const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=i<2;mesh.layers.set(i<2?0:1);mesh.position.x=i*2;environment.add(mesh);}
  const originals=environment.children.slice(),result=batchReferenceSceneEnvironment(environment),owned=[];result.group.traverse(o=>{if(o.geometry)owned.push(o.geometry);});assert.equal(result.stats.mergedMeshes,2);
  const counts=new Map();for(const resource of [geometry,material,texture,...owned])resource.addEventListener('dispose',()=>counts.set(resource,(counts.get(resource)||0)+1));
  result.dispose();result.dispose();for(const resource of owned)assert.equal(counts.get(resource),1);for(const resource of [geometry,material,texture])assert.equal(counts.has(resource),false);
  assert.equal(result.group.parent,null);assert.ok(originals.every(m=>m.visible));assert.equal(environment.children.length,4);
});

test('busy reference rooms reduce static draw calls while story actor animation continues independently',()=>{
  for(const cell of [23,25,26]){
    const room=createCinematicScene3D({cell,theme:resolveCinematicTheme(cell)}),environment=room.scene.getObjectByName(`reference-space-${room.environment.name}`);
    const batch=batchReferenceSceneEnvironment(environment);
    try{
      assert.ok(batch.stats.savedDrawCalls>200,`${cell}: repeated room dressing must save over 200 draws`);
      assert.ok(batch.stats.savedDrawCalls/batch.stats.sourceMeshes>.6,`${cell}: static environment draw calls should fall by more than 60%`);
      const actor=room.actors[0],head=actor.userData.rig.head,before=head.rotation.y;room.update(2.4);assert.notEqual(head.rotation.y,before);assert.ok(actor.visible);assert.notEqual(actor.parent,environment);
    }finally{batch.dispose();room.dispose();}
  }
});
