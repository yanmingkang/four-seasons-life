import * as THREE from 'three';
import {REFERENCE_BUILDING_SPECS} from './reference-buildings-3d.js';
import {LANDMARK_BUILDINGS,pointToFootprint,footprintCorners,footprintsOverlap} from './pastoral-buildings.js';

// Legacy shortcuts remain usable; each actual station now has its own building.
export const referenceLandmarkId=cell=>({1:'library',2:'stadium',3:'village'}[cell]||`reference-cell-${String(cell).padStart(2,'0')}`);

export function planReferenceBuildings(curve,events,{canalX=67,roadClearance=3.85}={}){
  const samples=curve.getSpacedPoints(2400),plans=[];
  function place(spec,{required=true}={}){
    const u=spec.routeU??(.045+spec.stationIndex/Math.max(1,events.length-1)*.9);
    const anchor=curve.getPointAt(u),tangent=curve.getTangentAt(u).setY(0).normalize(),normal=new THREE.Vector3(-tangent.z,0,tangent.x);
    // Modest plot scaling at bends preserves every stop, never road clearance.
    for(const scale of [1,.92,.84,.76]){
      const width=spec.width*scale,front=spec.front*scale,back=spec.back*scale;
      for(const distance of [front+4.9,front+6.5,front+8.5,front+10.8,front+13])for(const side of [spec.preferredSide||1,-(spec.preferredSide||1)])for(const shift of [0,-2.6,2.6,-5,5,-7.4,7.4]){
        const position=anchor.clone().addScaledVector(normal,side*distance).addScaledVector(tangent,shift);
        const plan={...spec,id:spec.cell?referenceLandmarkId(spec.cell):spec.id,referenceId:spec.id,x:position.x,z:position.z,rotation:Math.atan2(-normal.x*side,-normal.z*side),width,depth:front+back,front,back,scale,season:events[spec.stationIndex].season};
        if(footprintCorners(plan,.25).some(p=>p.x>canalX-5.4||Math.abs(p.x)>76||Math.abs(p.z+5)>68))continue;
        if(samples.some(p=>pointToFootprint(p.x,p.z,plan)<roadClearance))continue;
        if(plans.some(other=>footprintsOverlap(other,plan,.9)))continue;
        plans.push(plan);return;
      }
    }
    if(required)throw new Error(`无法为第 ${spec.cell} 格分配安全的建筑位置`);
  }
  for(const spec of REFERENCE_BUILDING_SPECS)place(spec);
  // Keep the original café/book stall and departure cottage in the town.
  place({...LANDMARK_BUILDINGS.find(p=>p.id==='bookstall')},{required:true});
  place({id:'cottage',name:'启程小屋',stationIndex:0,routeU:.008,width:6,depth:6.1,front:3.45,back:2.6,preferredSide:1},{required:false});
  return plans;
}
