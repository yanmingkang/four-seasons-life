import * as THREE from 'three';
import {pointToFootprint,pixelTexture} from './pastoral-buildings.js';

// Reserved circular clearings are shared with the surrounding woodland. The
// routes, station buildings and gameplay state are inputs, never mutated here.
const candidates=Object.freeze([
  ['spring-homestead','homestead',-80,53,11],
  ['spring-orchard','orchard',-72,78,10],
  ['south-meadow-garden','garden',-38,76,8],
  ['south-market','market',1,77,10],
  ['south-farm','farm',34,78,12],
  ['south-windmill','windmill',-7,110,11],
  ['east-riverside-village','village',94,47,12],
  ['east-orchard','orchard',113,16,10],
  ['east-farm','farm',96,-16,12],
  ['east-well-garden','well-garden',101,-49,8],
  ['north-homestead','homestead',40,-82,11],
  ['north-kitchen-garden','farm',9,-87,11],
  ['north-windmill','windmill',-27,-103,10],
  ['north-orchard','orchard',-53,-77,10],
  ['west-village','village',-91,-47,12],
  ['west-farm','farm',-100,-12,12],
  ['west-orchard','orchard',-88,20,10],
  ['inner-spring-garden','garden',-15,24,3.5],
  ['inner-summer-well','well-garden',5,1,3.4],
  ['inner-autumn-garden','garden',12,-26,3.4],
  ['inner-west-garden','garden',-40,-25,3.5],
]);
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const fallbackSeason=(x,z)=>Math.max(0,Math.min(3,Math.floor((55-z)/32)));

export function planTownOutskirts({roadSamples=[],buildingPlans=[],seasonAt=fallbackSeason}={}){
  const plots=[];
  for(let index=0;index<candidates.length;index++){
    const [id,kind,originX,originZ,radius]=candidates[index],inner=id.startsWith('inner-');
    const offsets=inner?[[0,0],[-4,0],[4,0],[0,-3],[0,3],[-7,0],[7,0]]:[[0,0],[-3,0],[3,0],[0,-3],[0,3]];
    // The expanded 40-building map uses two former clearings. Relocate their
    // well/garden into nearby safe gaps instead of dropping existing scenery.
    if(id==='inner-summer-well')offsets.push([6,2]);
    if(id==='inner-west-garden')offsets.push([-13,-5],[-14,-4]);
    for(const [dx,dz] of offsets){
      const x=originX+dx,z=originZ+dz;
      if(x+radius>=62&&x-radius<=72)continue;
      if(roadSamples.some(p=>Math.hypot(p.x-x,p.z-z)<radius+5))continue;
      if(buildingPlans.some(p=>pointToFootprint(x,z,p)<radius+1.5))continue;
      if(plots.some(p=>Math.hypot(p.x-x,p.z-z)<p.radius+radius+2))continue;
      const season=Math.max(0,Math.min(3,Math.floor(Number(seasonAt(x,z))||0)));
      plots.push({id,kind,x,z,radius,season,seed:8461+index*317,region:inner?'town':x>72?'east':x<-65?'west':z>55?'south':'north'});break;
    }
  }
  return plots;
}

const COLORS={wood:'#ac7c4e',dark:'#73593f',cream:'#e5d4a8',roof:'#ad5d41',stone:'#b6ad94',glass:'#80a5ac',leaf:'#749450',green:'#719452',earth:'#998566',white:'#dfe6d5'};
const LEAVES=['#93aa65','#668952','#c69b52','#aebdad'];
const FLOWERS=['#dfa8b7','#dbcd8b','#d2a463','#dbe4db'];

function gableGeometry(){
  const shape=new THREE.Shape();shape.moveTo(-.5,0);shape.lineTo(.5,0);shape.lineTo(0,1);shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:1,steps:1,bevelEnabled:false}).translate(0,0,-.5);
}

export function createTownOutskirts({scene,groundHeight=()=>0,roadSamples=[],buildingPlans=[],seasonAt=fallbackSeason}={}){
  const plots=planTownOutskirts({roadSamples,buildingPlans,seasonAt}),group=new THREE.Group();group.name='town-outskirts';group.userData.environmentOnly=true;
  const batches=new Map(),geometries={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,8),taper:new THREE.CylinderGeometry(.74,1,1,8),cone:new THREE.ConeGeometry(1,1,8),leaf:new THREE.IcosahedronGeometry(1,0),gable:gableGeometry()},materials=new Map();
  const stats={plots:plots.length,homes:0,orchardTrees:0,cropPlants:0,marketStalls:0,windmills:0,wells:0,flowerPlants:0,drawCalls:0,instances:0,triangles:0};
  const item=new THREE.Object3D(),rollQ=new THREE.Quaternion(),axisZ=new THREE.Vector3(0,0,1),colorValue=new THREE.Color();
  const height=(p,x,z)=>groundHeight(p.x+x,p.z+z);
  function add(p,shape,pattern,color,x,y,z,sx,sy,sz,yaw=0,roll=0){
    const key=`${p.region}:${shape}:${pattern||'solid'}`;
    if(!batches.has(key))batches.set(key,{region:p.region,shape,pattern,items:[]});
    item.position.set(p.x+x,y,p.z+z);item.scale.set(sx,sy,sz);item.quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP,yaw);
    if(roll)item.quaternion.multiply(rollQ.setFromAxisAngle(axisZ,roll));item.updateMatrix();
    batches.get(key).items.push({matrix:item.matrix.clone(),color:colorValue.set(COLORS[color]||color).clone(),plotId:p.id});
  }
  const block=(p,x,y,z,w,h,d,color,pattern=null,yaw=0,roll=0)=>add(p,'box',pattern,color,x,y,z,w,h,d,yaw,roll);
  function support(p,x,z,w,d,yaw=0){
    const c=Math.cos(yaw),s=Math.sin(yaw),heights=[];
    for(const xx of [-w/2,w/2])for(const zz of [-d/2,d/2])heights.push(height(p,x+xx*c+zz*s,z-xx*s+zz*c));
    const low=Math.min(...heights)-.07,top=Math.max(...heights)+.13;
    block(p,x,(top+low)/2,z,w,top-low,d,'stone','stone',yaw);return top;
  }
  function cottage(p,x,z,{width=4,depth=3.5,yaw=0,barn=false}={}){
    const base=support(p,x,z,width+.34,depth+.35,yaw),wallHeight=barn?2.65:2.7,c=Math.cos(yaw),s=Math.sin(yaw);
    const part=(xx,yy,zz,w,h,d,color,pattern=null)=>block(p,x+xx*c+zz*s,base+yy,z-xx*s+zz*c,w,h,d,color,pattern,yaw);
    part(0,wallHeight/2,0,width,wallHeight,depth,barn?'wood':'cream',barn?'wood':'plaster');
    add(p,'gable','roof',p.season===3?'white':barn?'#6b8051':'roof',x,base+wallHeight,z,width+.4,1.45,depth+.5,yaw);
    part(0,wallHeight+.025,0,width+.4,.16,depth+.5,'dark','wood');
    for(const xx of [-width/2+.12,width/2-.12])part(xx,wallHeight/2,depth/2+.025,.13,wallHeight,.12,'dark','wood');
    part(barn?.35:0,.93,depth/2+.035,barn?1.7:.86,1.86,.09,'dark','wood');
    for(const xx of barn?[-width*.3]:[-width*.31,width*.31]){
      part(xx,1.67,depth/2+.09,.85,.91,.09,'dark');part(xx,1.67,depth/2+.145,.68,.74,.075,'glass');part(xx,1.67,depth/2+.19,.065,.74,.055,'cream');part(xx,1.63,depth/2+.19,.7,.055,.055,'cream');
    }
    // Side and rear windows keep houses credible when the camera orbits.
    for(const side of [-1,1]){part(side*(width/2+.055),1.6,0,.085,.86,1,'dark');part(side*(width/2+.1),1.6,0,.06,.67,.78,'glass');}
    part(0,1.72,-depth/2-.055,1.02,.79,.065,'glass');
    if(!barn)part(-width*.28,wallHeight+1.0,-depth*.2,.42,1.45,.42,'roof','brick');
    stats.homes++;
  }
  function fence(p,x,z,w,d){
    for(const side of [-1,1]){
      for(let i=0;i<=4;i++){const xx=x-w/2+i*w/4,zz=z+side*d/2,y=height(p,xx,zz);block(p,xx,y+.54,zz,.13,1.08,.13,'dark','wood');}
      for(let i=0;i<4;i++){const xx=x-w/2+(i+.5)*w/4,zz=z+side*d/2;for(const yy of [.43,.79])block(p,xx,height(p,xx,zz)+yy,zz,w/4,.085,.09,'wood','wood');}
    }
    // A gap in each side works as a believable garden gate.
    for(const side of [-1,1])for(const along of [-1,1])for(const yy of [.43,.79])block(p,x+side*w/2,height(p,x+side*w/2,z+along*d*.3)+yy,z+along*d*.3,.09,.085,d*.3,'wood','wood');
  }
  function crops(p,x,z,w=6,d=6,rows=5){
    for(let row=0;row<rows;row++){
      const xx=x+(row-(rows-1)/2)*w/rows;
      for(let k=0;k<7;k++){
        const zz=z+(k-3)*d/7,base=height(p,xx,zz);block(p,xx,base+.055,zz,w/rows*.73,.11,d/7+.025,p.season===3?'#cfd6c0':'earth');
        const plantH=p.season===2?.48:p.season===3?.18:.34;
        add(p,'leaf',null,p.season===2?'#c4ad63':p.season===3?'#97ab88':'green',xx,base+.15+plantH*.35,zz,.2,plantH,.21);
        if(p.season!==3)add(p,'cone',null,p.season===0?'#a0b26e':p.season===1?'#a3b457':'#d1b85e',xx,base+.16+plantH*.65,zz,.08,plantH*.85,.08);
        stats.cropPlants++;
      }
    }
  }
  function fruitTree(p,x,z,size=1){
    const base=height(p,x,z);add(p,'taper','wood','dark',x,base+1.35*size,z,.15*size,2.7*size,.15*size);
    for(const side of [-1,1])block(p,x+side*.29*size,base+2.15*size,z,.1*size,1.1*size,.1*size,'dark','wood',0,side*.46);
    for(const [dx,dy,dz] of [[-.55,2.83,0],[.53,2.94,.12],[0,3.46,-.26]])add(p,'leaf',null,LEAVES[p.season],x+dx*size,base+dy*size,z+dz*size,1.05*size,.98*size,.98*size);
    if(p.season!==3)for(const [dx,dy,dz] of [[-.8,2.76,.57],[.53,3.06,.86],[.22,3.7,.18]])add(p,'leaf',null,p.season===0?'#e0b7bd':p.season===2?'#bc8150':'#ac9e50',x+dx*size,base+dy*size,z+dz*size,.115*size,.135*size,.12*size);
    else add(p,'cone',null,'white',x,base+3.94*size,z,.77*size,.52*size,.7*size);
    stats.orchardTrees++;
  }
  function well(p,x=0,z=0,scale=1){
    const y=height(p,x,z),rim=.89*scale;
    for(let i=0;i<10;i++){const a=i/10*Math.PI*2;block(p,x+Math.cos(a)*rim,y+.4*scale,z+Math.sin(a)*rim,.51*scale,.8*scale,.29*scale,'stone','stone',Math.PI/2-a);}
    add(p,'cylinder',null,'#789da2',x,y+.1,z,.64*scale,.025,.64*scale);
    for(const side of [-1,1])block(p,x+side*.78*scale,y+1.45*scale,z,.14*scale,2.25*scale,.14*scale,'dark','wood');
    block(p,x,y+2.29*scale,z,1.8*scale,.16*scale,.16*scale,'wood','wood');
    add(p,'gable','roof',p.season===3?'white':'roof',x,y+2.48*scale,z,2.3*scale,.71*scale,1.82*scale);
    block(p,x,y+1.49*scale,z,.045*scale,1.5*scale,.045*scale,'dark');add(p,'taper',null,'wood',x,y+.75*scale,z,.19*scale,.3*scale,.19*scale);stats.wells++;
  }
  function garden(p,withWell=false){
    const scale=Math.min(1.7,p.radius/3.6),spacing=1.05*scale;
    if(withWell)well(p,0,0,.68*scale);
    for(const side of [-1,1])for(const row of [-1,1]){
      const x=side*spacing,z=row*spacing,y=height(p,x,z),rand=random(p.seed+side+row*3);
      block(p,x,y+.13,z,1.16*scale,.26,1.16*scale,'wood','wood');block(p,x,y+.28,z,1.02*scale,.055,1.02*scale,'earth');
      for(let i=0;i<6;i++){const xx=x+(rand()-.5)*.8*scale,zz=z+(rand()-.5)*.8*scale;block(p,xx,y+.49,zz,.025,.39,.025,'green');add(p,'leaf',null,FLOWERS[p.season],xx,y+.71,zz,.13*scale,.1,.13*scale);stats.flowerPlants++;}
    }
    for(const side of [-1,1]){
      const x=side*1.08*scale,z=-2.27*scale,y=height(p,x,z);block(p,x,y+.34,z,.12,.68,.12,'dark','wood');
    }
    const y=height(p,0,-2.27*scale);block(p,0,y+.58,-2.27*scale,2.65*scale,.11,.56*scale,'wood','wood');block(p,0,y+.89,-2.53*scale,2.65*scale,.51,.095,'wood','wood');
  }
  function stall(p,x,z,variant){
    const y=support(p,x,z,2.9,2.5);
    for(const dx of [-1.23,1.23])for(const dz of [-.85,.85])block(p,x+dx,y+1.15,z+dz,.12,2.3,.12,'dark','wood');
    block(p,x,y+.87,z+.47,2.65,.14,.9,'wood','wood');block(p,x,y+.42,z+.47,2.5,.7,.12,'cream','wood');
    for(let i=0;i<7;i++)block(p,x-1.23+i*.41,y+2.32,z,.43,.14,2.35,i%2?'cream':variant%2?'#9a8053':'#688b60');
    for(let i=0;i<3;i++){block(p,x-.72+i*.7,y+1.02,z+.47,.61,.2,.59,'wood','wood');for(let k=0;k<3;k++)add(p,'leaf',null,['#b78450','#8a9c56','#c5b465'][i],x-.9+i*.7+k*.16,y+1.2,z+.47,.11,.13,.14);}
    stats.marketStalls++;
  }
  function windmill(p){
    const y=support(p,0,0,4.1,4.1),yaw=Math.atan2(-p.x,-p.z),c=Math.cos(yaw),s=Math.sin(yaw);
    add(p,'taper','plaster','cream',0,y+2.65,0,1.66,5.3,1.66);add(p,'cone','roof',p.season===3?'white':'roof',0,y+6.1,0,2.05,1.8,2.05);
    const part=(x,yy,z,w,h,d,color,roll=0)=>block(p,x*c+z*s,y+yy,-x*s+z*c,w,h,d,color,'wood',yaw,roll);
    part(0,1.03,1.5,.86,2.04,.13,'dark');
    add(p,'cylinder',null,'dark',1.82*s,y+5.15,1.82*c,.32,.36,.32,yaw,Math.PI/2);
    for(let blade=0;blade<4;blade++){
      const a=Math.PI/4+blade*Math.PI/2,xx=Math.sin(a)*1.77,yy=Math.cos(a)*1.77;
      part(xx,5.15+yy,1.96,.28,3.56,.13,'dark',-a);
      part(Math.sin(a)*2.38,5.15+Math.cos(a)*2.38,2.035,.73,1.59,.11,'cream',-a);
    }
    crops(p,-5.4,2.1,3.1,4.2,3);crops(p,5.4,2.1,3.1,4.2,3);fence(p,0,.5,13.8,11.4);stats.windmills++;
  }
  for(const p of plots){
    const yaw=Math.atan2(-p.x,-p.z);
    if(p.kind==='garden'||p.kind==='well-garden')garden(p,p.kind==='well-garden');
    if(p.kind==='orchard'){
      for(const x of [-4.25,0,4.25])for(const z of [-4.25,0,4.25])fruitTree(p,x,z,.93);
      for(const x of [-1.25,0,1.25])block(p,x,height(p,x,7.25)+.35,7.25,.86,.7,.86,'wood','wood');fence(p,0,0,13.6,13.6);
    }
    if(p.kind==='farm'){
      cottage(p,-5.6,-4.8,{width:3.6,depth:3.25,yaw:Math.PI/8,barn:true});crops(p,2.4,.8,8.2,10,6);fence(p,1.8,1.2,10.6,12.3);
      add(p,'cylinder',null,'#c0a56e',-5.9,height(p,-5.9,2)+.63,2,1.1,1.26,1.1);
    }
    if(p.kind==='homestead'){
      cottage(p,-3.7,-3.1,{width:4.4,depth:3.6,yaw});cottage(p,4.3,-2.1,{width:3.05,depth:3.1,yaw,barn:true});well(p,-3.9,3.8,.82);crops(p,3.3,4.3,4.2,3.8,4);fence(p,0,0,14.3,14.3);
    }
    if(p.kind==='village'){
      for(const [x,z] of [[-4.7,-3.8],[4.7,-3.8],[0,5]])cottage(p,x,z,{width:3.85,depth:3.4,yaw:Math.atan2(-x,-z)});
      well(p,0,-.4,.9);fruitTree(p,-6.9,3.6,.9);fruitTree(p,6.9,3.6,.9);fence(p,0,0,16,15.6);
    }
    if(p.kind==='market'){
      for(let i=0;i<3;i++)stall(p,(i-1)*3.9,-2.5,i);
      for(const x of [-3.1,3.1]){const y=height(p,x,3);add(p,'cylinder',null,'wood',x,y+.92,3,.9,.12,.9);block(p,x,y+.44,3,.17,.88,.17,'dark','wood');for(const z of [1.75,4.25])add(p,'cylinder',null,'wood',x,height(p,x,z)+.38,z,.37,.76,.37);}
      well(p,0,4.3,.67);fence(p,0,0,14,13.2);
    }
    if(p.kind==='windmill')windmill(p);
  }
  const regions=new Map();
  for(const batch of batches.values()){
    if(!regions.has(batch.region)){const cluster=new THREE.Group();cluster.name=`outskirts-${batch.region}`;cluster.userData.environmentOnly=true;group.add(cluster);regions.set(batch.region,cluster);}
    const materialKey=batch.pattern||'solid';
    if(!materials.has(materialKey))materials.set(materialKey,new THREE.MeshStandardMaterial({color:'#ffffff',map:batch.pattern?pixelTexture(batch.pattern):null,roughness:.96,flatShading:true}));
    const instances=new THREE.InstancedMesh(geometries[batch.shape],materials.get(materialKey),batch.items.length);instances.name=`outskirts-${batch.region}-${batch.shape}-${materialKey}`;
    instances.castShadow=instances.receiveShadow=true;instances.userData.plotIds=batch.items.map(item=>item.plotId);instances.userData.environmentOnly=true;
    batch.items.forEach((item,i)=>{instances.setMatrixAt(i,item.matrix);instances.setColorAt(i,item.color);});instances.instanceMatrix.needsUpdate=true;instances.instanceColor.needsUpdate=true;instances.computeBoundingBox();instances.computeBoundingSphere();regions.get(batch.region).add(instances);
    stats.drawCalls++;stats.instances+=batch.items.length;const geometry=instances.geometry;stats.triangles+=batch.items.length*(geometry.index?geometry.index.count:geometry.attributes.position.count)/3;
  }
  for(const cluster of regions.values()){
    const bounds=new THREE.Box3().setFromObject(cluster),size=bounds.getSize(new THREE.Vector3());cluster.userData.center=bounds.getCenter(new THREE.Vector3());cluster.userData.radius=size.length()/2;cluster.userData.cullingRange=220;
  }
  // Region instances have real depth, cast shadows and native frustum culling.
  // They are scenery, not new stations or individually focusable landmarks.
  group.userData.stats=stats;group.userData.plots=plots;scene?.add(group);
  return {group,plots,stats,occluders:[]};
}
