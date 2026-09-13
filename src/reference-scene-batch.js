import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const activeBatches=new WeakMap();
const arrayOf=attribute=>attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array;
const layout=geometry=>Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>`${name}/${a.itemSize}/${a.normalized}/${arrayOf(a).constructor.name}/${a.gpuType??''}`).join('|');

function canBake(mesh){
  const geometry=mesh.geometry,material=mesh.material;
  // Blended surfaces keep their own depth sorting. Existing instances and
  // inspection anchors must never become another copy of the same dressing.
  if(!mesh.isMesh||mesh.isInstancedMesh||mesh.isSkinnedMesh||mesh.children.length||Array.isArray(material)||!material?.visible||material.transparent||material.transmission>0)return false;
  if(!geometry?.attributes.position||Object.keys(geometry.morphAttributes).length||mesh.morphTargetInfluences?.length)return false;
  if(mesh.onBeforeRender!==THREE.Object3D.prototype.onBeforeRender||mesh.onAfterRender!==THREE.Object3D.prototype.onAfterRender)return false;
  const count=geometry.index?.count??geometry.attributes.position.count;
  // Nonstandard ranges stay on their original mesh rather than silently
  // revealing triangles that its author deliberately omitted.
  return geometry.drawRange.start===0&&geometry.drawRange.count>=count&&!Object.values(geometry.attributes).some(a=>a.isInterleavedBufferAttribute);
}

function reverseWinding(geometry){
  if(geometry.index){
    const index=geometry.index;
    for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}
  }else for(const attribute of Object.values(geometry.attributes)){
    for(let i=0;i<attribute.count;i+=3)for(let c=0;c<attribute.itemSize;c++){
      const b=attribute.getComponent(i+1,c);attribute.setComponent(i+1,c,attribute.getComponent(i+2,c));attribute.setComponent(i+2,c,b);
    }
  }
}

/**
 * Bake immutable environment dressing only. Pass the `environment` group from
 * buildReferenceSceneEnvironment; actors and story props belong outside it.
 * A subtree can opt out with userData.referenceBatchDynamic=true or
 * userData.referenceStatic=false. Original named meshes remain hidden anchors.
 * The returned disposer owns only new geometry, never source geometry/materials.
 */
export function batchReferenceSceneEnvironment(environment){
  if(!environment?.isObject3D)throw new TypeError('A reference environment group is required.');
  if(activeBatches.has(environment))return activeBatches.get(environment);
  const group=new THREE.Group();group.name='reference-environment-static-batch';
  const stats={sourceMeshes:0,batchedMeshes:0,mergedMeshes:0,savedDrawCalls:0};
  const buckets=new Map(),originals=[],ownedGeometries=new Set(),orderGroups=new Map();
  environment.updateWorldMatrix(true,true);
  const inverse=environment.matrixWorld.clone().invert();
  const visit=(object,groupOrder=0)=>{
    if(!object.visible||object.userData.referenceBatchDynamic||object.userData.referenceStatic===false||object.animations.length)return;
    if(object.isGroup)groupOrder=object.renderOrder;
    if(object.isMesh){
      stats.sourceMeshes++;
      if(canBake(object)){
        const geometry=object.geometry,key=[object.material.uuid,object.castShadow,object.receiveShadow,object.renderOrder,groupOrder,object.layers.mask,object.frustumCulled,object.customDepthMaterial?.uuid??'',object.customDistanceMaterial?.uuid??'',Boolean(geometry.index),layout(geometry)].join(':');
        if(!buckets.has(key))buckets.set(key,{source:object,parts:[],groupOrder});
        buckets.get(key).parts.push(object);
      }
    }
    for(const child of object.children)visit(child,groupOrder);
  };
  visit(environment);
  for(const {source,parts,groupOrder} of buckets.values()){
    if(parts.length<2)continue;
    const pieces=parts.map(part=>{
      const matrix=new THREE.Matrix4().multiplyMatrices(inverse,part.matrixWorld),geometry=part.geometry.clone();
      geometry.applyMatrix4(matrix);if(matrix.determinant()<0)reverseWinding(geometry);return geometry;
    });
    let geometry;
    try{geometry=mergeGeometries(pieces,false);}finally{for(const piece of pieces)piece.dispose();}
    if(!geometry)continue;
    geometry.computeBoundingBox();geometry.computeBoundingSphere();ownedGeometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,source.material);mesh.name=`batched-environment-${source.name}`;
    for(const key of ['castShadow','receiveShadow','renderOrder','frustumCulled','customDepthMaterial','customDistanceMaterial'])mesh[key]=source[key];
    mesh.layers.mask=source.layers.mask;mesh.userData.referenceStaticSources=parts.map(part=>part.name);
    if(!orderGroups.has(groupOrder)){const ordered=new THREE.Group();ordered.name=`reference-batch-order-${groupOrder}`;ordered.renderOrder=groupOrder;group.add(ordered);orderGroups.set(groupOrder,ordered);}
    orderGroups.get(groupOrder).add(mesh);
    for(const part of parts){part.visible=false;originals.push(part);}
    stats.batchedMeshes+=parts.length;stats.mergedMeshes++;stats.savedDrawCalls+=parts.length-1;
  }
  group.userData.stats=stats;environment.add(group);
  let disposed=false;
  const result={group,stats,dispose(){
    if(disposed)return;disposed=true;
    group.removeFromParent();for(const geometry of ownedGeometries)geometry.dispose();
    for(const part of originals)part.visible=true;
    activeBatches.delete(environment);
  }};
  activeBatches.set(environment,result);return result;
}
