import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const arrayOf=attribute=>attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array;
const attributeLayout=geometry=>Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>`${name}/${a.itemSize}/${a.normalized}/${arrayOf(a).constructor.name}/${a.gpuType??''}`).join('|');

// Bake only the rendered index range. Geometry groups are rendering partitions,
// not independent vertex arrays, and mergeGeometries does not apply drawRange.
function fragmentGeometry(source,start,count){
  const total=source.index?.count??source.attributes.position.count,end=Math.min(total,start+count),length=Math.floor(Math.max(0,end-start)/3)*3;
  if(!length)return null;
  const geometry=new THREE.BufferGeometry();
  for(const [name,sourceAttribute] of Object.entries(source.attributes)){
    const ArrayType=arrayOf(sourceAttribute).constructor,attribute=new THREE.BufferAttribute(new ArrayType(length*sourceAttribute.itemSize),sourceAttribute.itemSize,sourceAttribute.normalized);
    if(sourceAttribute.gpuType!==undefined)attribute.gpuType=sourceAttribute.gpuType;
    for(let i=0;i<length;i++){
      const vertex=source.index?source.index.getX(start+i):start+i;
      for(let component=0;component<sourceAttribute.itemSize;component++)attribute.setComponent(i,component,sourceAttribute.getComponent(vertex,component));
    }
    geometry.setAttribute(name,attribute);
  }
  return geometry;
}

function fragments(mesh,material){
  const geometry=mesh.geometry;if(!geometry?.attributes.position)return [];
  const total=geometry.index?.count??geometry.attributes.position.count,drawStart=Math.max(0,geometry.drawRange.start),drawEnd=Math.min(total,drawStart+geometry.drawRange.count);
  const groups=Array.isArray(material)?geometry.groups:[{start:0,count:total,materialIndex:0}],parts=[];
  for(const group of groups){
    const selected=Array.isArray(material)?material[group.materialIndex]:material;if(!selected?.visible)continue;
    const start=Math.max(drawStart,group.start),end=Math.min(drawEnd,group.start+group.count),part=fragmentGeometry(geometry,start,Math.max(0,end-start));
    if(part)parts.push({geometry:part,material:selected});
  }
  return parts;
}

function reverseWinding(geometry){
  for(const attribute of Object.values(geometry.attributes))for(let i=0;i<attribute.count;i+=3)for(let c=0;c<attribute.itemSize;c++){
    const value=attribute.getComponent(i+1,c);attribute.setComponent(i+1,c,attribute.getComponent(i+2,c));attribute.setComponent(i+2,c,value);
  }
}

function geometryHash(geometry){
  let hash=2166136261;
  for(const [,attribute] of Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b))){
    const array=arrayOf(attribute),bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
    for(const byte of bytes)hash=Math.imul(hash^byte,16777619)>>>0;
  }
  return `${attributeLayout(geometry)}:${geometry.attributes.position.count}:${hash}`;
}

function sameGeometry(a,b){
  if(attributeLayout(a)!==attributeLayout(b))return false;
  for(const name of Object.keys(a.attributes)){
    const aa=arrayOf(a.attributes[name]),bb=arrayOf(b.attributes[name]);if(aa.length!==bb.length)return false;
    for(let i=0;i<aa.length;i++)if(aa[i]!==bb[i])return false;
  }
  return true;
}

function renderingKey(mesh,material,geometry){
  return [material.uuid,mesh.castShadow,mesh.receiveShadow,mesh.renderOrder,mesh.layers.mask,mesh.customDepthMaterial?.uuid??'',mesh.customDistanceMaterial?.uuid??'',attributeLayout(geometry)].join(':');
}

function copyRenderingFlags(target,source){
  target.castShadow=source.castShadow;target.receiveShadow=source.receiveShadow;target.renderOrder=source.renderOrder;target.layers.mask=source.layers.mask;
  target.customDepthMaterial=source.customDepthMaterial;target.customDistanceMaterial=source.customDistanceMaterial;
}

/** A static overview-only proxy; original groups remain owned by Scenery. */
export function createOverviewBatch({scene,groups=[]}={}){
  const unique=[...new Set(groups.filter(group=>group?.isObject3D))],selected=new Set(unique);
  const roots=unique.filter(group=>{for(let parent=group.parent;parent;parent=parent.parent)if(selected.has(parent))return false;return true;});
  const group=new THREE.Group();group.name='overview-static-batch';group.visible=false;group.userData.overviewOnly=true;
  const stats={sourceGroups:roots.length,sourceMeshes:0,sourceInstances:0,originalDrawCalls:0,proxyDrawCalls:0,mergedMeshes:0,instancedMeshes:0,triangles:0,reduction:0};
  const regular=new Map(),instanced=new Map(),instance=new THREE.Matrix4(),world=new THREE.Matrix4(),reflection=new THREE.Matrix4().makeScale(-1,1,1);
  const color=new THREE.Color();
  for(const root of roots){
    root.updateWorldMatrix(true,true);
    const visit=(object,isRoot=false)=>{
      if(!isRoot&&!object.visible)return;
      if(object.isMesh){
        if(object.isSkinnedMesh||object.morphTargetInfluences?.length||object.morphTexture)throw new Error('Overview batching accepts only static meshes without skinning or morph targets.');
        stats.sourceMeshes++;
        const solid=object.userData.solid??object.material,parts=fragments(object,solid);
        for(const part of parts){
          stats.originalDrawCalls++;
          if(object.isInstancedMesh){
            const count=Math.max(0,Math.min(object.count,object.instanceMatrix.count));
            stats.sourceInstances+=count;
            // Reflected parent transforms need a reflected local geometry so
            // each combined instance retains the renderer's front-face winding.
            const mirrored=object.matrixWorld.determinant()<0;
            if(mirrored){part.geometry.applyMatrix4(reflection);reverseWinding(part.geometry);}
            const key=`${renderingKey(object,part.material,part.geometry)}:${geometryHash(part.geometry)}`;
            const candidates=instanced.get(key)??[];let batch=candidates.find(candidate=>sameGeometry(candidate.geometry,part.geometry));
            if(!batch){batch={geometry:part.geometry,material:part.material,source:object,items:[],hasColor:false};candidates.push(batch);instanced.set(key,candidates);}else part.geometry.dispose();
            for(let i=0;i<count;i++){
              object.getMatrixAt(i,instance);world.multiplyMatrices(object.matrixWorld,instance);if(mirrored)world.multiply(reflection);
              let instanceColor=null;
              if(object.instanceColor){color.setRGB(object.instanceColor.getX(i),object.instanceColor.getY(i),object.instanceColor.getZ(i));instanceColor=color.clone();batch.hasColor=true;}
              batch.items.push({matrix:world.clone(),color:instanceColor});
            }
          }else{
            part.geometry.applyMatrix4(object.matrixWorld);if(object.matrixWorld.determinant()<0)reverseWinding(part.geometry);
            const key=renderingKey(object,part.material,part.geometry);
            if(!regular.has(key))regular.set(key,{source:object,material:part.material,pieces:[]});regular.get(key).pieces.push(part.geometry);
          }
        }
      }
      for(const child of object.children)visit(child);
    };
    visit(root,true);
  }
  for(const {source,material,pieces} of regular.values()){
    const geometry=pieces.length===1?pieces[0]:mergeGeometries(pieces,false);
    if(!geometry)throw new Error('Incompatible static geometry reached an overview batch.');
    if(pieces.length>1)pieces.forEach(piece=>piece.dispose());
    geometry.computeBoundingBox();geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,material);mesh.name='overview-merged-mesh';copyRenderingFlags(mesh,source);group.add(mesh);
    stats.proxyDrawCalls++;stats.mergedMeshes++;stats.triangles+=geometry.attributes.position.count/3;
  }
  for(const candidates of instanced.values())for(const batch of candidates){
    const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.items.length);mesh.name='overview-merged-instances';copyRenderingFlags(mesh,batch.source);
    batch.items.forEach((item,i)=>{mesh.setMatrixAt(i,item.matrix);if(batch.hasColor)mesh.setColorAt(i,item.color??color.setRGB(1,1,1));});
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingBox();mesh.computeBoundingSphere();group.add(mesh);
    stats.proxyDrawCalls++;stats.instancedMeshes++;stats.triangles+=batch.geometry.attributes.position.count/3*mesh.count;
  }
  stats.reduction=stats.originalDrawCalls?1-stats.proxyDrawCalls/stats.originalDrawCalls:0;group.userData.stats=stats;
  // The proxy's vertex/instance coordinates are world-space, including any
  // transform on the containing scene; no original parent is reparented.
  if(scene){scene.updateWorldMatrix(true,false);group.matrix.copy(scene.matrixWorld).invert();group.matrixAutoUpdate=false;scene.add(group);}
  const setEnabled=enabled=>{
    group.visible=Boolean(enabled);
    // Scenery's visibility pass may have re-enabled originals this frame.
    if(group.visible)for(const root of roots)root.visible=false;
  };
  return {group,stats,setEnabled};
}
