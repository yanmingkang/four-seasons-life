import * as THREE from 'three';

// Texture coordinates follow metres of the modeled surface, not one stretched
// copy per object. UVs survive cloning and static batching without shader hooks.
const copies=new Map();
const PERIOD={wood:2,brick:2,roof:2.4,stone:2,plaster:3,glass:2,fabric:.6};
export function applyReferenceSurface(mesh,pattern,{shared=true}={}){
  if(!pattern||!mesh?.geometry?.attributes.uv||mesh.geometry.type!=='BoxGeometry')return mesh;
  const source=mesh.geometry,scale=mesh.scale;
  const key=`${source.uuid}:${pattern}:${scale.x}:${scale.y}:${scale.z}`;
  let geometry=shared?copies.get(key):null;
  if(!geometry){
    geometry=shared?source.clone():source;
    const positions=geometry.attributes.position,normals=geometry.attributes.normal,uv=geometry.attributes.uv;
    geometry.computeBoundingBox();const size=geometry.boundingBox.getSize(new THREE.Vector3()).multiply(scale);
    const period=PERIOD[pattern]||2;
    for(let i=0;i<uv.count;i++){
      const nx=Math.abs(normals.getX(i)),ny=Math.abs(normals.getY(i));
      const width=nx>.5?size.z:size.x,height=ny>.5?size.z:size.y;
      const u=uv.getX(i),v=uv.getY(i);
      // The grain runs along the long dimension of joinery and floor boards.
      if(pattern==='wood'&&height>width)uv.setXY(i,v*Math.abs(height)/period,u*Math.abs(width)/period);
      else uv.setXY(i,u*Math.abs(width)/period,v*Math.abs(height)/period);
    }
    uv.needsUpdate=true;geometry.userData.referenceSurface={pattern,period};
    if(shared){geometry.userData.sharedReferenceResource=true;copies.set(key,geometry);}
  }
  mesh.geometry=geometry;mesh.userData.surfacePattern=pattern;return mesh;
}
