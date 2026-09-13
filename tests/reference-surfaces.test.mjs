import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyReferenceSurface} from '../src/reference-surfaces.js';
import {createOverviewBatch} from '../src/overview-batch.js';
import {pastoralMaterial,pixelTexture,pixelSurfaceTexture} from '../src/pastoral-buildings.js';

test('brick units retain physical size on differently proportioned faces without mutating shared geometry',()=>{
  const source=new THREE.BoxGeometry(1,1,1),original=source.attributes.uv.array.slice();
  const small=new THREE.Mesh(source,pastoralMaterial('#b56542','brick'));small.scale.set(2,4,6);
  const large=new THREE.Mesh(source,small.material);large.scale.set(4,8,12);
  applyReferenceSurface(small,'brick');applyReferenceSurface(large,'brick');
  assert.deepEqual(source.attributes.uv.array,original);assert.notEqual(small.geometry,large.geometry);
  for(let i=0;i<small.geometry.attributes.uv.array.length;i++)assert.equal(large.geometry.attributes.uv.array[i],small.geometry.attributes.uv.array[i]*2);
  // The +X face is 6m wide and 4m high: three by two 2m texture repeats.
  const uv=small.geometry.attributes.uv;assert.equal(uv.getX(1),3);assert.equal(uv.getY(0),2);
  const clone=new THREE.Mesh(source,small.material);clone.scale.copy(small.scale);applyReferenceSurface(clone,'brick');assert.equal(clone.geometry,small.geometry);
});

test('corrected UVs persist through a material clone and overview batching',()=>{
  const scene=new THREE.Scene(),root=new THREE.Group();scene.add(root);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(3,2,4),pastoralMaterial('#bc7649','wood').clone());root.add(mesh);
  applyReferenceSurface(mesh,'wood',{shared:false});const expected=mesh.geometry.toNonIndexed().attributes.uv.array;
  const batch=createOverviewBatch({scene,groups:[root]});assert.equal(batch.group.children.length,1);
  assert.deepEqual(batch.group.children[0].geometry.attributes.uv.array,expected);
  assert.ok(mesh.material.bumpMap);assert.equal(mesh.material.userData.referencePattern,'wood');
});

test('color, height and roughness use distinct reusable data with the correct color spaces',()=>{
  for(const pattern of ['wood','brick','roof','stone','plaster','fabric']){
    const color=pixelTexture(pattern),height=pixelSurfaceTexture(pattern),rough=pixelSurfaceTexture(pattern,'roughness');
    assert.equal(color.colorSpace,THREE.SRGBColorSpace);
    for(const map of [height,rough]){
      assert.equal(map.colorSpace,THREE.NoColorSpace);assert.equal(map.generateMipmaps,true);
      assert.notEqual(map.image.data,color.image.data);assert.notDeepEqual(map.image.data,color.image.data);
      assert.ok(new Set(map.image.data.filter((_,i)=>i%4===0)).size>1,'surface channel must contain meaningful variation');
    }
    assert.equal(height,pixelSurfaceTexture(pattern));assert.equal(rough,pixelSurfaceTexture(pattern,'roughness'));
  }
});

test('wood grain follows the long side of upright joinery and long floor boards',()=>{
  const source=new THREE.BoxGeometry(1,1,1),material=pastoralMaterial('#9d764e','wood');
  const upright=new THREE.Mesh(source,material);upright.scale.set(.15,3,.3);applyReferenceSurface(upright,'wood');
  const floor=new THREE.Mesh(source,material);floor.scale.set(.5,.04,4);applyReferenceSurface(floor,'wood');
  // Front-face U is grain direction; tall vertical framing rotates it by 90°.
  const uv=upright.geometry.attributes.uv;assert.ok(Math.abs(uv.getX(16)-uv.getX(18))>1);
  const floorUV=floor.geometry.attributes.uv;assert.ok(Math.abs(floorUV.getX(8)-floorUV.getX(10))>1);
});
