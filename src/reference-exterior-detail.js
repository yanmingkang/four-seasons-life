import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Keep one named architectural part for inspection; combine repeated opaque
// parts by material. World-scaled UVs remain intact across differently sized
// pieces. Glazing keeps separate draws so Three can depth-sort transparency.
export function batchExteriorDetails(root) {
  root.updateMatrixWorld(true);
  const inverse=new THREE.Matrix4().copy(root.matrixWorld).invert(),buckets=new Map(),identities=new Set();
  let sourceMeshes=0;
  root.traverse(node=>{
    if(!node.isMesh||node.isInstancedMesh)return;sourceMeshes++;
    if(node.material.transparent)return;
    if(!node.userData.exteriorDetail&&!identities.has(node.name)){identities.add(node.name);return;}
    const key=node.material.uuid,bucket=buckets.get(key)||[];
    bucket.push(node);buckets.set(key,bucket);
  });
  let details=0,batches=0;
  for(const nodes of buckets.values()) {
    details+=nodes.length;
    if(nodes.length<2)continue;
    const pieces=nodes.map(node=>{const geometry=node.geometry.index?node.geometry.toNonIndexed():node.geometry.clone();geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,node.matrixWorld));geometry.clearGroups();return geometry;});
    const geometry=mergeGeometries(pieces,false);for(const piece of pieces)piece.dispose();
    geometry.userData={ownedExteriorBatch:true};
    const batch=new THREE.Mesh(geometry,nodes[0].material);
    batch.name=`exterior-detail-batch-${batches++}`;
    batch.castShadow=batch.receiveShadow=true;
    batch.userData={exteriorDetailBatch:true,detailNames:[...new Set(nodes.map(node=>node.name))],sourceMeshCount:nodes.length,ownedExteriorBatch:true};
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    for(const node of nodes)node.removeFromParent();
    root.add(batch);
  }
  root.userData.exteriorDetailStats={details,batches,sourceMeshes};
  return root.userData.exteriorDetailStats;
}

export function disposeExteriorDetailInstances(root) {
  root.traverse(node=>{if(node.isMesh&&node.userData.ownedExteriorBatch)node.geometry.dispose();});
}
