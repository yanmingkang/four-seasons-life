import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPixelSceneCamera} from '../src/scene-preview.js';

function fit(camera,aspect){const {horizontal,vertical}=camera.userData.pixelFrame,half=Math.max(vertical,horizontal/aspect)*1.075;camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;camera.updateProjectionMatrix();}
test('pixel diorama frames visible room geometry at wide and narrow aspects without hidden-shell padding',()=>{
  const scene=new THREE.Scene(),visible=new THREE.Mesh(new THREE.BoxGeometry(12,7,9));visible.position.y=3.5;scene.add(visible);
  const hidden=new THREE.Group();hidden.visible=false;const offscreen=new THREE.Mesh(new THREE.BoxGeometry(100,100,100));offscreen.position.set(100,100,100);hidden.add(offscreen);scene.add(hidden);
  const {camera,target}=createPixelSceneCamera(scene);assert.equal(camera.isOrthographicCamera,true);assert.deepEqual(target.toArray(),[0,3.5,0]);
  for(const aspect of [16/9,4/3,4]){fit(camera,aspect);for(const x of [-6,6])for(const y of [0,7])for(const z of [-4.5,4.5]){const p=new THREE.Vector3(x,y,z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,`clipped room corner at ${aspect}`);}}
  visible.geometry.dispose();offscreen.geometry.dispose();visible.material.dispose();offscreen.material.dispose();
});
test('pixel diorama fitting includes visible static instances with real instance transforms',()=>{
  const scene=new THREE.Scene(),mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial(),2);mesh.setMatrixAt(0,new THREE.Matrix4().makeTranslation(-4,1,0));mesh.setMatrixAt(1,new THREE.Matrix4().makeTranslation(4,6,-2));scene.add(mesh);
  const {camera,target}=createPixelSceneCamera(scene);assert.deepEqual(target.toArray(),[0,3.5,-1]);fit(camera,16/9);
  for(const p of [new THREE.Vector3(-4,1,0),new THREE.Vector3(4,6,-2)]){p.project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1);}
  mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();
});
