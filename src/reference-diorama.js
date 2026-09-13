import * as THREE from 'three';
import {createReferenceBuilding} from './reference-buildings-3d.js';
import {createLiuKanshan,animateLiuKanshan} from './mascot-3d.js';

// An orbitable model, never an image plane. Cloned resources belong only to
// this viewer, so closing it cannot invalidate the live board's shared assets.
export function createReferenceDiorama({cell=1,season=0,character=false}={}){
  const scene=new THREE.Scene();scene.background=new THREE.Color(['#d8e7d0','#d1e7df','#eddfc5','#d9e5ef'][season]);
  const camera=new THREE.PerspectiveCamera(36,16/9,.05,180);
  const model=character?createLiuKanshan():createReferenceBuilding(cell,{season});
  if(!character){
    const geometryCopies=new Map(),materialCopies=new Map();
    model.traverse(node=>{if(!node.isMesh)return;
      if(!node.geometry.userData.ownedExteriorBatch){if(!geometryCopies.has(node.geometry))geometryCopies.set(node.geometry,node.geometry.clone());node.geometry=geometryCopies.get(node.geometry);}
      const copyMaterial=source=>{if(!materialCopies.has(source))materialCopies.set(source,source.clone());return materialCopies.get(source);};
      node.material=Array.isArray(node.material)?node.material.map(copyMaterial):copyMaterial(node.material);
    });
  }
  scene.add(model);model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),target=bounds.getCenter(new THREE.Vector3());
  const radius=Math.max(size.x,size.y,size.z)*.63;
  const ground=new THREE.Mesh(new THREE.CylinderGeometry(radius*1.15,radius*1.2,.18,character?32:8),new THREE.MeshStandardMaterial({color:['#a9bb81','#8eaf7a','#c5a86c','#c9d8dc'][season],roughness:1}));
  ground.position.set(target.x,bounds.min.y-.13,target.z);ground.receiveShadow=true;scene.add(ground);
  scene.add(new THREE.HemisphereLight('#e5efff','#655748',1.0));
  const sun=new THREE.DirectionalLight('#ffe4b6',2.8);sun.position.copy(target).add(new THREE.Vector3(-radius,1.7*radius,1.6*radius));sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-radius*1.2,right:radius*1.2,top:radius*1.2,bottom:-radius*1.2,near:.1,far:radius*8});sun.shadow.bias=-.00012;sun.shadow.normalBias=.012;sun.target.position.copy(target);scene.add(sun,sun.target);
  const fill=new THREE.DirectionalLight('#c4ddf5',.65);fill.position.copy(target).add(new THREE.Vector3(radius,.8*radius,-radius));scene.add(fill);
  const distance=radius/Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*1.22;
  camera.position.copy(target).addScaledVector(new THREE.Vector3(character?.8:1,character?.3:.72,1.4).normalize(),distance);camera.lookAt(target);
  let disposed=false;
  return {scene,camera,target,model,update(seconds){if(character)animateLiuKanshan(model,seconds*1000);},dispose(){if(disposed)return;disposed=true;const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.isMesh){if(o.isInstancedMesh)o.dispose();geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();sun.shadow.map?.dispose();sun.shadow.mapPass?.dispose();scene.clear();}};
}
