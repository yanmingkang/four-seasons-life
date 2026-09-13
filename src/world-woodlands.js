import * as THREE from 'three';
import {pointToFootprint} from './pastoral-buildings.js';

const seeded=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const palettes=[['#759947','#4f7e41','#e6a2b9','#8da751'],['#46763b','#3c6940','#68964a','#82a756'],['#bd7a36','#d0a24b','#a96035','#a6a052'],['#658c7b','#779988','#94b3a1','#507867']];

export function planWorldWoodlands({roadSamples=[],buildingPlans=[],plots=[],seasonAt=()=>0}={}){
  const rand=seeded(940621),plans=[];
  // Clusters span the landscape rather than following the playable curve.
  // Broad clearings leave room for farm/village compositions and visual rest.
  for(let z=-294;z<=282;z+=8)for(let x=-294;x<=294;x+=8){
    const xx=x+(rand()-.5)*6,zz=z+(rand()-.5)*6,r=Math.hypot(xx,zz);
    if(r>310||r<9)continue;
    const cluster=(Math.sin(xx*.036+Math.cos(zz*.047)*1.4)+Math.cos(zz*.042-xx*.014)+2)/4;
    const central=Math.abs(xx)<66&&zz>-58&&zz<55;
    if(rand()>(central?.55:.29+cluster*.57))continue;
    const season=Math.max(0,Math.min(3,Math.floor(seasonAt(xx,zz)))),pine=season===3||rand()<.19;
    const scale=.76+rand()*.56,radius=(pine?1.55:2.45)*scale;
    if(xx>61-radius&&xx<73+radius&&zz>-70&&zz<60)continue;
    if(roadSamples.some(p=>Math.hypot(p.x-xx,p.z-zz)<radius+7.8))continue;
    if(buildingPlans.some(plan=>pointToFootprint(xx,zz,plan)<radius+5.5))continue;
    if(plots.some(plot=>Math.hypot(plot.x-xx,plot.z-zz)<plot.radius+radius+.8))continue;
    plans.push({x:xx,z:zz,season,pine,scale,radius,phase:rand()*Math.PI*2,tint:Math.floor(rand()*4)});
  }
  return plans;
}

function instanceSet(group,geometry,count,{shadow=false}={}){
  if(!count)return null;
  const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,flatShading:true});
  const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.castShadow=shadow;mesh.receiveShadow=true;mesh.name='woodland-instanced-layer';group.add(mesh);return mesh;
}

export function createWorldWoodlands({scene,groundHeight,roadSamples,buildingPlans,plots,seasonAt}){
  const plans=planWorldWoodlands({roadSamples,buildingPlans,plots,seasonAt});
  const group=new THREE.Group();group.name='continuous-world-woodlands';scene.add(group);
  const broad=plans.filter(p=>!p.pine),pines=plans.filter(p=>p.pine),snow=pines.filter(p=>p.season===3);
  const nearBroad=broad.filter(p=>Math.hypot(p.x,p.z)<115),farBroad=broad.filter(p=>Math.hypot(p.x,p.z)>=115);
  const groundLevels=new Map(plans.map(p=>[p,groundHeight(p.x,p.z)]));
  const trunk=instanceSet(group,new THREE.CylinderGeometry(.12,.24,1,6),plans.length);
  const crowns=instanceSet(group,new THREE.IcosahedronGeometry(1,1),nearBroad.length*3);
  // Far silhouettes retain the same placement/palette with 75% fewer crown
  // triangles. They are outside the playable town, not simplified landmarks.
  const farCrowns=instanceSet(group,new THREE.IcosahedronGeometry(1,0),farBroad.length*3);
  const tips=instanceSet(group,new THREE.IcosahedronGeometry(1,0),broad.length);
  const needles=instanceSet(group,new THREE.ConeGeometry(1,1,7),pines.length*3);
  const snowcaps=instanceSet(group,new THREE.ConeGeometry(1,1,7),snow.length*3);
  // Ground contact shadows use the exact terrain sampler, including outer LOD.
  // Small faceted bases add grounding without thousands of dynamic shadow maps.
  const roots=instanceSet(group,new THREE.CylinderGeometry(1,1,1,9),plans.length);
  const dummy=new THREE.Object3D(),color=new THREE.Color();
  function put(mesh,index,p,x,y,z,sx,sy,sz,tint,rotation=0){
    if(!mesh)return;dummy.position.set(p.x+x,groundLevels.get(p)+y,p.z+z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,rotation,0);dummy.updateMatrix();mesh.setMatrixAt(index,dummy.matrix);mesh.setColorAt(index,color.set(tint));
  }
  plans.forEach((p,i)=>{
    const h=(p.pine?5.8:4.5)*p.scale;
    put(trunk,i,p,0,h*.4,0,p.scale,h*.8,p.scale,p.season===3?'#756950':'#806445');
    put(roots,i,p,0,.045,0,p.radius*.65,.09,p.radius*.6,['#71964e','#5b8245','#ab974b','#b3c7b9'][p.season]);
  });
  for(const [trees,target] of [[nearBroad,crowns],[farBroad,farCrowns]])trees.forEach((p,i)=>{
    const tone=palettes[p.season][p.tint];
    for(let k=0;k<3;k++){
      const angle=p.phase+k*2.094,r=.8*p.scale;
      put(target,i*3+k,p,Math.cos(angle)*r,(3.65+k*.25)*p.scale,Math.sin(angle)*r,1.8*p.scale,(1.4+k*.06)*p.scale,1.6*p.scale,tone,angle);
    }
  });
  broad.forEach((p,i)=>put(tips,i,p,0,5.12*p.scale,0,1.25*p.scale,.95*p.scale,1.2*p.scale,color.set(palettes[p.season][p.tint]).multiplyScalar(1.1).getHex(),p.phase));
  pines.forEach((p,i)=>{for(let k=0;k<3;k++)put(needles,i*3+k,p,0,(2.2+k*1.3)*p.scale,0,(1.8-k*.39)*p.scale,2.8*p.scale,(1.8-k*.39)*p.scale,palettes[p.season][p.tint],p.phase);});
  snow.forEach((p,i)=>{for(let k=0;k<3;k++)put(snowcaps,i*3+k,p,0,(2.76+k*1.3)*p.scale,0,(1.46-k*.33)*p.scale,1.8*p.scale,(1.46-k*.33)*p.scale,k%2?'#ebefdf':'#dce7db',p.phase);});
  for(const mesh of group.children){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;mesh.computeBoundingSphere();}
  const stats={trees:plans.length,broadleaf:broad.length,pines:pines.length,lowDetailCrowns:farBroad.length,outerTrees:plans.filter(p=>Math.abs(p.x)>75||p.z< -62||p.z>60).length,drawGroups:group.children.length};
  group.userData={environmentOnly:true,stats};
  return {group,plans,stats};
}
