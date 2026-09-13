import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createOverviewBatch} from '../src/overview-batch.js';

const round=value=>Math.round(value*10000)/10000;
function records(roots){
  const result=[],matrix=new THREE.Matrix4(),instance=new THREE.Matrix4(),v=new THREE.Vector3(),n=new THREE.Vector3(),normal=new THREE.Matrix3();
  for(const root of roots){root.updateWorldMatrix(true,true);root.traverse(object=>{
    if(!object.isMesh)return;const geometry=object.geometry,position=geometry.attributes.position,solid=object.userData.solid??object.material;
    const partitions=Array.isArray(solid)?geometry.groups:[{start:0,count:geometry.index?.count??position.count,materialIndex:0}];
    for(const part of partitions){
      const material=Array.isArray(solid)?solid[part.materialIndex]:solid,start=Math.max(part.start,geometry.drawRange.start),end=Math.min(part.start+part.count,geometry.drawRange.start+geometry.drawRange.count,geometry.index?.count??position.count);
      for(let i=0;i<(object.isInstancedMesh?object.count:1);i++){
        matrix.copy(object.matrixWorld);if(object.isInstancedMesh){object.getMatrixAt(i,instance);matrix.multiply(instance);}normal.getNormalMatrix(matrix);
        for(let j=start;j<end;j++){
          const index=geometry.index?geometry.index.getX(j):j;v.fromBufferAttribute(position,index).applyMatrix4(matrix);
          const row=[material.uuid,...v.toArray().map(round)];
          if(geometry.attributes.normal){n.fromBufferAttribute(geometry.attributes.normal,index).applyMatrix3(normal).normalize();row.push(...n.toArray().map(round));}
          if(geometry.attributes.uv)row.push(round(geometry.attributes.uv.getX(index)),round(geometry.attributes.uv.getY(index)));
          if(geometry.attributes.color)row.push(...[0,1,2].map(c=>round(geometry.attributes.color.getComponent(index,c))));
          row.push(...[0,1,2].map(c=>round(object.instanceColor?object.instanceColor.getComponent(i,c):1)));result.push(JSON.stringify(row));
        }
      }
    }
  });}return result.sort();
}

test('static proxy preserves world vertices, normals, UVs, vertex color and canonical material',()=>{
  const scene=new THREE.Scene();scene.position.set(2,3,-4);scene.rotation.y=.2;
  const material=new THREE.MeshStandardMaterial({color:'#ead1a3',vertexColors:true,alphaTest:.3,side:THREE.DoubleSide});
  const groups=[];
  for(let i=0;i<3;i++){
    const group=new THREE.Group();group.position.set(i*3,1-i,2+i);group.rotation.set(.12*i,.32*i,.07*i);group.scale.set(i===2?-1.2:1.2,.7,1.4);scene.add(group);groups.push(group);
    const geometry=new THREE.BoxGeometry(1,2,3),colors=new Uint8Array(geometry.attributes.position.count*3);for(let j=0;j<colors.length;j++)colors[j]=j%3===0?188:j%3===1?217:132;
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3,true));const mesh=new THREE.Mesh(geometry,material);mesh.position.set(.31,.2,-.42);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);
    if(i===1){mesh.userData.solid=material;mesh.material=material.clone();mesh.material.opacity=.1;mesh.material.transparent=true;}
  }
  scene.updateMatrixWorld(true);const before=records(groups),sources=groups.map(g=>g.children[0].geometry.attributes.position.array.slice());
  const overview=createOverviewBatch({scene,groups});assert.equal(overview.group.visible,false);assert.equal(overview.stats.originalDrawCalls,3);assert.equal(overview.stats.proxyDrawCalls,1);assert.ok(overview.stats.reduction>.6);
  assert.deepEqual(records([overview.group]),before);
  groups.forEach((g,i)=>assert.deepEqual(g.children[0].geometry.attributes.position.array,sources[i]));
  const proxy=overview.group.children[0];assert.equal(proxy.material,material);assert.equal(proxy.castShadow,true);assert.equal(proxy.receiveShadow,true);assert.equal(proxy.material.side,THREE.DoubleSide);assert.equal(proxy.material.alphaTest,.3);assert.equal(proxy.geometry.attributes.color.normalized,true);assert.ok(proxy.geometry.attributes.color.array instanceof Uint8Array);
  const p=proxy.geometry.attributes.position,n=proxy.geometry.attributes.normal,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),face=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);face.crossVectors(b.sub(a),c.sub(a));assert.ok(face.dot(new THREE.Vector3().fromBufferAttribute(n,i))>0,'mirrored source faces retain correct front winding');}
});

test('identical leaf geometries merge instances while preserving per-instance color and transforms',()=>{
  const scene=new THREE.Scene(),material=new THREE.MeshStandardMaterial({alphaTest:.5,side:THREE.DoubleSide}),groups=[];
  for(let i=0;i<3;i++){
    const group=new THREE.Group();group.position.set(i*4,2,-i);group.rotation.y=.4*i;if(i===2)group.scale.x=-1;scene.add(group);groups.push(group);
    const mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,2);mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);const temporary=new THREE.Object3D();
    for(let j=0;j<2;j++){temporary.position.set(j*.6,1+j,.4);temporary.rotation.set(.2*j,.3,.4*j);temporary.scale.set(.5+j*.2,.9,.8);temporary.updateMatrix();mesh.setMatrixAt(j,temporary.matrix);if(i!==1)mesh.setColorAt(j,new THREE.Color().setRGB(.2+i*.15,.4+j*.2,.8));}
  }
  const before=records(groups),matrixCopies=groups.map(g=>g.children[0].instanceMatrix.array.slice()),colorCopies=groups.map(g=>g.children[0].instanceColor?.array.slice());
  const overview=createOverviewBatch({scene,groups});assert.deepEqual(records([overview.group]),before);assert.equal(overview.stats.originalDrawCalls,3);assert.equal(overview.stats.instancedMeshes,2,'normal and mirrored leaf geometry each share a batch');assert.equal(overview.stats.sourceInstances,6);
  assert.equal(overview.group.children.reduce((sum,m)=>sum+m.count,0),6);assert.ok(overview.group.children.every(m=>m.isInstancedMesh&&m.material===material));
  groups.forEach((g,i)=>{assert.deepEqual(g.children[0].instanceMatrix.array,matrixCopies[i]);assert.deepEqual(g.children[0].instanceColor?.array,colorCopies[i]);});
});

test('indexed material groups and draw ranges are rendered exactly once without incompatible index merging',()=>{
  const scene=new THREE.Scene(),group=new THREE.Group();scene.add(group);
  const first=new THREE.MeshStandardMaterial({color:'#8a9873'}),second=new THREE.MeshStandardMaterial({color:'#b0926c'}),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0,3,0,0,4,0,0,3,1,0,6,0,0,7,0,0,6,1,0],3));geometry.setIndex([0,1,2,3,4,5,6,7,8]);geometry.addGroup(0,6,0);geometry.addGroup(6,3,1);geometry.setDrawRange(3,6);group.add(new THREE.Mesh(geometry,[first,second]));
  const extra=new THREE.Mesh(new THREE.BoxGeometry(1,1,1).toNonIndexed(),first);extra.position.set(10,1,1);group.add(extra);
  const before=records([group]),indices=geometry.index.array.slice(),groupsBefore=structuredClone(geometry.groups),rangeBefore={...geometry.drawRange};
  const overview=createOverviewBatch({scene,groups:[group]});assert.deepEqual(records([overview.group]),before);assert.equal(overview.stats.originalDrawCalls,3);assert.equal(overview.stats.proxyDrawCalls,3,'different attribute layouts remain separate');
  assert.deepEqual(geometry.index.array,indices);assert.deepEqual(geometry.groups,groupsBefore);assert.deepEqual(geometry.drawRange,rangeBefore);
  assert.ok(overview.group.children.every(m=>!m.geometry.index&&m.geometry.groups.length===0));
});

test('overview toggling hides only selected source roots on every enable and never restores caller-owned visibility',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group(),nested=new THREE.Group(),other=new THREE.Group(),actor=new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial());
  root.add(nested);nested.add(new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial()));scene.add(root,other,actor);root.visible=false;actor.position.set(2,0,3);scene.updateMatrixWorld(true);const actorMatrix=actor.matrixWorld.clone();
  const overview=createOverviewBatch({scene,groups:[root,root,nested]});assert.equal(overview.stats.sourceGroups,1);assert.equal(overview.stats.sourceMeshes,1);
  assert.equal(root.visible,false);assert.equal(nested.visible,true);assert.equal(other.visible,true);assert.equal(actor.visible,true);
  root.visible=true;overview.setEnabled(true);assert.equal(overview.group.visible,true);assert.equal(root.visible,false);
  root.visible=true;overview.setEnabled(true);assert.equal(root.visible,false,'an external culling pass must not revive originals in overview');
  overview.setEnabled(false);assert.equal(overview.group.visible,false);assert.equal(root.visible,false,'only caller restores original visibility');
  root.visible=true;overview.setEnabled(false);assert.equal(root.visible,true);assert.equal(other.visible,true);assert.equal(actor.visible,true);assert.deepEqual(actor.matrixWorld,actorMatrix);
  assert.equal(root.parent,scene);assert.equal(nested.parent,root);assert.equal(actor.parent,scene);
});

test('different shadow flags remain separate and static interleaved attributes retain their values',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);const material=new THREE.MeshStandardMaterial();
  for(let i=0;i<2;i++){
    const data=new THREE.InterleavedBuffer(new Float32Array([0,0,0,0,0,1,0,0,1,0,0,1,0,0,1]),5),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));geometry.setAttribute('uv',new THREE.InterleavedBufferAttribute(data,2,3));
    const mesh=new THREE.Mesh(geometry,material);mesh.position.x=i*2;mesh.castShadow=Boolean(i);mesh.receiveShadow=!i;root.add(mesh);
  }
  const before=records([root]),overview=createOverviewBatch({scene,groups:[root]});assert.deepEqual(records([overview.group]),before);assert.equal(overview.stats.proxyDrawCalls,2);
  assert.deepEqual(overview.group.children.map(m=>[m.castShadow,m.receiveShadow]),[[false,true],[true,false]]);
  assert.ok(overview.group.children.every(m=>!m.geometry.attributes.position.isInterleavedBufferAttribute));
});
