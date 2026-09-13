import * as THREE from 'three';

// All silhouettes are closed, spatial meshes. Pixel textures are small original
// patterns generated in memory; the reference atlas is never a building face.
const cache=new Map();
const random=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export function pixelTexture(pattern='wood'){
  const key=`texture:${pattern}`;if(cache.has(key))return cache.get(key);
  const size=128,data=new Uint8Array(size*size*4),heights=new Uint8Array(size*size*4),roughness=new Uint8Array(size*size*4),rand=random(721);
  const tileShade=(x,y)=>((Math.imul(x+19,73)^Math.imul(y+31,137))>>>0)%19;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let shade=239+Math.floor(rand()*7),height=170,rough=226;
    const row=Math.floor(y/16),offset=(row%2)*16,xx=(x+offset)%32;
    if(pattern==='wood'){
      const grain=Math.sin(y*1.65+Math.sin(x*.085)*1.9)+.4*Math.sin(y*3.5+x*.035),joint=(x+row*31)%64;
      const knot=Math.exp(-((x-(row*37+21)%128)**2/36+(y%16-8)**2/9));
      shade=224+tileShade(Math.floor((x+row*31)/64),row)+grain*6-knot*23;
      height=183+grain*8-knot*12;rough=205+grain*10;
      if(y%16===0){shade=147;height=62;}else if(y%16===1){shade=248;height=203;}else if(joint===0){shade=176;height=105;}
    }
    if(pattern==='brick'){
      const br=Math.floor(y/10),bx=(x+(br%2)*12)%24,by=y%10;
      shade=220+tileShade(Math.floor((x+(br%2)*12)/24),br)+Math.floor(rand()*9);
      height=185+Math.floor(rand()*10);rough=228+Math.floor(rand()*13);
      if(by===0||bx===0){shade=175;height=68;rough=249;}else if(by===1||bx===1){shade=246;height=195;}
      else if(by===9||bx===23){shade-=13;height=140;}
    }
    if(pattern==='roof'){
      const arch=Math.sin((xx+.5)*Math.PI/32),course=y%16;
      shade=204+tileShade(Math.floor((x+offset)/32),row)+arch*24-course*.7;
      height=130+arch*76+course*1.5;rough=207+tileShade(Math.floor((x+offset)/32),row);
      if(course===15||xx===0){shade=124;height=58;}else if(course===0||xx===1){shade=246;height=214;}
    }
    if(pattern==='stone'){
      const stagger=(Math.floor(y/32)%2)*16,sx=(x+stagger)%32;
      const mineral=Math.sin(x*.31+y*.17)*2+Math.sin(y*.7-x*.21)*2;
      shade=222+tileShade(Math.floor((x+stagger)/32),Math.floor(y/32))+mineral+rand()*5;
      height=181+mineral;rough=222+mineral*2;
      if(sx===0||y%32===0){shade=157;height=72;}else if(sx===1||y%32===1){shade=246;height=197;}
    }
    if(pattern==='plaster'){const grain=rand()*7;shade=241+grain+Math.sin(x*.06)*Math.sin(y*.08)*3;height=176+grain*2;rough=237+grain;}
    if(pattern==='fabric'){
      const warp=(x%4)<2,weft=(y%4)<2,thread=warp===weft?1:-1;
      shade=235+thread*7+rand()*4;height=166+thread*24;rough=242+thread*5;
    }
    const i=(y*size+x)*4;
    for(const [target,value] of [[data,shade],[heights,height],[roughness,rough]]){target[i]=target[i+1]=target[i+2]=Math.max(0,Math.min(255,Math.round(value)));target[i+3]=255;}
  }
  const map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.NearestFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.anisotropy=4;map.needsUpdate=true;map.name=`original-pixel-${pattern}`;cache.set(key,map);
  for(const [channel,pixels] of [['height',heights],['roughness',roughness]]){const surface=map.clone();surface.source=new THREE.Source({data:pixels,width:size,height:size});surface.colorSpace=THREE.NoColorSpace;surface.name=`original-pixel-${pattern}-${channel}`;surface.needsUpdate=true;cache.set(`texture:${pattern}:${channel}`,surface);}
  return map;
}
export function pixelSurfaceTexture(pattern,channel='height'){pixelTexture(pattern);return cache.get(`texture:${pattern}:${channel}`);}
export function pastoralMaterial(color,pattern=null){
  const key=`material:${color}:${pattern}`;
  if(!cache.has(key)){
    const map=pattern?pixelTexture(pattern):null;
    const material=new THREE.MeshStandardMaterial({color,roughness:pattern==='wood'?.86:.96,map,bumpMap:pattern?pixelSurfaceTexture(pattern):null,roughnessMap:pattern?pixelSurfaceTexture(pattern,'roughness'):null,bumpScale:pattern==='plaster'?.012:pattern==='roof'?.065:.038,flatShading:true});
    material.userData.referencePattern=pattern;cache.set(key,material);
  }
  return cache.get(key);
}
const palette={wood:'#bf8750',dark:'#765236',cream:'#f3dfab',wall:'#e5dab8',roof:'#c76442',stone:'#c4b998',green:'#568456',glass:'#659dba',leaf:'#6d984f',metal:'#657879',white:'#f2f0dd',blue:'#6688ac'};
const mat=(name,pattern=null)=>pastoralMaterial(palette[name]||name,pattern);
const cube=new THREE.BoxGeometry(1,1,1),leafGeo=new THREE.IcosahedronGeometry(1,1);
function mesh(parent,geometry,material,x=0,y=0,z=0){const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
function block(parent,w,h,d,name,x,y,z,pattern=null){const m=mesh(parent,cube,mat(name,pattern),x,y,z);m.scale.set(w,h,d);return m;}
function cylinder(parent,r,h,name,x,y,z,r2=r,segments=12){return mesh(parent,new THREE.CylinderGeometry(r,r2,h,segments),mat(name),x,y,z);}
function sprout(parent,x,y,z,size=.42,flowers=false){
  cylinder(parent,size*.5,size*.64,'roof',x,y+size*.32,z,size*.38,8);
  const m=mesh(parent,leafGeo,mat('leaf'),x,y+size*1.18,z);m.scale.set(size*.75,size*.92,size*.7);
  if(flowers)for(const dx of [-.35,.25]){const f=mesh(parent,leafGeo,mat('#f0bfba'),x+dx*size,y+size*1.45,z+size*.5);f.scale.setScalar(size*.18);}
}
function steps(parent,width,front,levels=3){for(let i=0;i<levels;i++)block(parent,width,.16*(i+1),.42,'stone',0,.08*(i+1),front+(levels-i)*.39,'stone');}
function windowFrame(parent,x,y,z,w=1.1,h=1.25,{books=false,side=false}={}){
  const g=new THREE.Group();g.position.set(x,y,z);if(side)g.rotation.y=Math.PI/2;parent.add(g);
  block(g,w+.16,h+.15,.15,'dark',0,0,0,'wood');block(g,w,h,.16,'glass',0,0,.035);
  // Warm interior depth and individually modelled book spines behind mullions.
  if(books){block(g,w-.14,.045,.25,'wood',0,-h*.37,.13);for(let i=0;i<6;i++)block(g,w*.083,h*(.21+(i%3)*.035),.12,['roof','cream','green','blue'][i%4],-w*.39+i*w*.145,-h*.27,.15);}
  block(g,.065,h,.12,'cream',0,0,.16);block(g,w,.065,.12,'cream',0,.1,.16);
  block(g,w+.28,.12,.37,'wood',0,-h*.5-.07,.09,'wood');
}
function door(parent,x,y,z,w=1,h=1.85){
  block(parent,w+.25,h+.16,.22,'dark',x,y+h/2,z,'wood');block(parent,w,h,.24,'wood',x,y+h/2,z+.025,'wood');
  block(parent,w*.68,h*.3,.04,'glass',x,y+h*.72,z+.155);
  cylinder(parent,.055,.05,'cream',x+w*.3,y+h*.44,z+.175,undefined,6).rotation.x=Math.PI/2;
}
function gable(parent,w,d,y,rise,{roof='roof',wall='wood'}={}){
  const tri=new THREE.Shape();tri.moveTo(-w/2,0);tri.lineTo(w/2,0);tri.lineTo(0,rise);tri.closePath();
  const shell=mesh(parent,new THREE.ExtrudeGeometry(tri,{depth:d,bevelEnabled:false,steps:1}),mat(wall,'wood'),0,y,-d/2);shell.name='solid-gable';
  const slope=Math.atan2(rise,w/2),length=Math.hypot(w/2,rise)+.25;
  for(const side of [-1,1]){const m=block(parent,length,.17,d+.45,roof,side*w/4,y+rise/2+.08,0,'roof');m.rotation.z=-side*slope;}
  block(parent,.2,.22,d+.5,roof,0,y+rise+.1,0,'roof');
}
function awning(parent,x,y,z,w,depth,{green=true}={}){
  const stripes=Math.ceil(w/.38),step=w/stripes;
  for(let i=0;i<stripes;i++){
    const color=i%2?'cream':green?'green':'roof',xx=x-w/2+step*(i+.5);
    const roof=block(parent,step,.095,depth,color,xx,y,z);roof.rotation.x=.15;
    block(parent,step,.28,.12,color,xx,y-.16,z+depth/2-.025);
  }
}
function plaque(parent,x,y,z,w=2.5){
  block(parent,w+.16,.57,.17,'dark',x,y,z,'wood');block(parent,w,.45,.19,'cream',x,y,z+.025);
  // Keep the architectural trim; names are written only on nearby road signs.
}
function foundation(g,w,d){block(g,w,.35,d,'stone',0,.025,0,'stone');}
function createLibrary(){
  const g=new THREE.Group();foundation(g,8.05,6.5);block(g,7.6,4.8,5.6,'wood',0,2.55,0,'wood');
  for(const y of [.32,2.65,4.9])block(g,7.9,.18,5.85,'dark',0,y,0,'wood');
  for(const x of [-3.64,3.64])block(g,.2,4.8,.2,'dark',x,2.65,2.88,'wood');
  gable(g,7.9,5.9,4.95,1.8);
  // The central front dormer raises a second visible ridge, as in the reference.
  const dormer=new THREE.Group();dormer.position.set(0,0,1.35);g.add(dormer);gable(dormer,3.25,3.25,4.8,2.55);
  windowFrame(g,0,5.65,3.005,.88,.9);windowFrame(g,0,3.78,2.88,2.45,1.45,{books:true});
  for(const x of [-2.48,2.48])for(const y of [1.35,3.79])windowFrame(g,x,y,2.88,1.8,1.56,{books:true});
  for(const z of [-1.5,1.2])windowFrame(g,3.84,2.9,z,1.25,1.5,{books:true,side:true});
  door(g,0,.32,2.95,1.25,1.85);plaque(g,0,2.77,3.03,2.15);steps(g,2.45,2.83,3);
  for(const x of [-2.95,2.95]){block(g,1.95,.42,.7,'wood',x,.34,3.32,'wood');for(const dx of [-.55,0,.55])sprout(g,x+dx,.52,3.32,.36,true);}
  for(const x of [-1.22,1.22]){sprout(g,x,.22,3.25,.52);block(g,.15,.55,.2,'dark',x,2.25,3.1);block(g,.24,.34,.22,'cream',x,2.15,3.14);}
  for(const x of [-2.8,2.8]){block(g,.55,1.16,.58,'roof',x,6.05,-1.22,'brick');block(g,.7,.16,.7,'dark',x,6.67,-1.22);}
  return g;
}
function ringGeometry(rx,rz,innerX,innerZ,y,thickness,segments=64){
  const positions=[],indices=[];
  for(let layer=0;layer<2;layer++)for(let side=0;side<2;side++)for(let i=0;i<=segments;i++){
    const a=i/segments*Math.PI*2,rX=side?innerX:rx,rZ=side?innerZ:rz;
    positions.push(Math.cos(a)*rX,y+layer*thickness,Math.sin(a)*rZ);
  }
  const n=segments+1;for(let i=0;i<segments;i++){
    for(const offset of [0,2*n]){const a=offset+i,b=offset+n+i;if(offset)indices.push(a,b,a+1,b,b+1,a+1);else indices.push(a,a+1,b,b,a+1,b+1);}
    for(const offset of [0,n]){const a=offset+i,b=offset+2*n+i;if(offset)indices.push(a,a+1,b,b,a+1,b+1);else indices.push(a,b,a+1,b,b+1,a+1);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();return geo;
}
function ellipseLine(parent,rx,rz,y,color,width=.045){
  const points=Array.from({length:65},(_,i)=>new THREE.Vector3(Math.cos(i/64*Math.PI*2)*rx,y,Math.sin(i/64*Math.PI*2)*rz));
  return mesh(parent,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,true),64,width,5,true),mat(color));
}
function createStadium(){
  const g=new THREE.Group();const base=cylinder(g,1,.3,'stone',0,.05,0,1,64);base.scale.set(6.3,1,4.8);
  // Elliptical walls, stepped seats and a real opening show the pitch through
  // the roof; the stadium is not a capped cylinder or a textured rectangle.
  const wall=mesh(g,ringGeometry(5.95,4.4,5.62,4.08,.18,2.18),mat('wood','wood'));wall.name='stadium-open-wall';
  for(let i=0;i<56;i++){const a=i/56*Math.PI*2;block(g,.13,2.16,.14,'dark',Math.cos(a)*5.96,1.27,Math.sin(a)*4.42);}
  for(let tier=0;tier<4;tier++)mesh(g,ringGeometry(5.4-tier*.36,3.9-tier*.32,5.07-tier*.36,3.61-tier*.32,1.61-tier*.35,.28),mat(tier%2?'blue':'roof'));
  block(g,7.4,.09,4.35,'green',0,.23,0);
  for(let stripe=0;stripe<8;stripe++)block(g,.87,.015,4.05,stripe%2?'#83ad57':'#78a553',-3.05+stripe*.87,.284,0);
  for(const z of [-1.95,1.95])block(g,6.6,.025,.035,'white',0,.3,z);
  for(const x of [-3.3,0,3.3])block(g,.035,.025,3.9,'white',x,.3,0);
  ellipseLine(g,.68,.68,.31,'white',.023);
  for(const x of [-3.25,3.25]){for(const z of [-.61,.61])block(g,.035,.53,.035,'white',x,.56,z);block(g,.035,.035,1.25,'white',x,.81,0);}
  const roof=mesh(g,ringGeometry(6.12,4.62,3.92,2.6,2.51,.24),mat('white'));roof.name='elliptical-open-roof';
  for(let i=0;i<4;i++)ellipseLine(g,6.08-i*.17,4.58-i*.14,2.79+i*.07,'#d9e0db',.048);
  ellipseLine(g,3.94,2.62,2.75,'#b2c5d0',.055);
  block(g,3.7,1.65,.45,'cream',0,1.02,4.36,'stone');
  for(const x of [-1.15,-.38,.38,1.15])block(g,.68,1.31,.13,'glass',x,.84,4.64);
  plaque(g,0,1.94,4.59,3.35);steps(g,4.1,4.45,3);
  for(const x of [-4.25,4.25])sprout(g,x,.23,3.3,.78);
  return g;
}
function createVillage(){
  const g=new THREE.Group();foundation(g,6.6,6.2);block(g,5.3,7.05,4.85,'wall',-.35,3.7,-.2,'plaster');
  for(const y of [.34,2.65,4.99,7.2])block(g,5.65,.18,5.07,'stone',-.35,y,-.2,'stone');
  for(const x of [-2.8,2.1])block(g,.18,6.86,.16,'stone',x,3.7,2.25,'stone');
  for(const y of [1.43,3.71,6.03])for(const x of [-1.62,.89]){
    windowFrame(g,x,y,2.26,1.52,1.26);awning(g,x,y+.83,2.54,1.86,.74,{green:y>5});
    if(y>2){block(g,1.79,.13,.68,'stone',x,y-.83,2.61);for(const xx of [-.76,-.38,0,.38,.76])block(g,.044,.55,.045,'metal',x+xx,y-.5,2.92);block(g,1.66,.055,.055,'metal',x,y-.24,2.92);sprout(g,x-.47,y-.74,2.64,.28,true);}
  }
  door(g,-1.81,.25,2.37,.95,1.76);door(g,1,.25,2.37,.92,1.76);awning(g,-.45,2.1,2.79,3.6,1.2,{green:false});
  plaque(g,-.43,2.44,2.38,2.2);
  // External stair run, landings and guard rail have physical depth.
  for(let i=0;i<18;i++){const z=2.6-i*.28,y=.2+i*.25;block(g,.94,.25,.3,'stone',2.86,y,z,'stone');block(g,.045,.68,.05,'metal',3.29,y+.45,z);}
  for(const y of [2.72,5.08])block(g,1.28,.14,1.25,'stone',2.75,y,-1.6);
  for(const z of [-1.6,.1,1.7])windowFrame(g,2.33,5.95,z,1,1.12,{side:true});
  block(g,5.5,.16,5.1,'stone',-.35,7.29,-.2,'stone');
  for(const x of [-3.02,2.32])block(g,.13,.61,5.12,'wall',x,7.61,-.2,'plaster');block(g,5.48,.61,.13,'wall',-.35,7.61,-2.71,'plaster');
  const roof=new THREE.Group();roof.position.set(-.5,0,1.25);g.add(roof);gable(roof,4.6,2.08,7.31,.58,{wall:'wall'});
  cylinder(g,.54,1.25,'blue',1.23,8.08,-1.45);for(const y of [7.57,7.92,8.31,8.65])cylinder(g,.56,.045,'white',1.23,y,-1.45);
  for(const x of [.86,1.58])block(g,.07,.4,.07,'metal',x,7.51,-1.45);
  // Laundry is made of hanging cloth solids, visible from both sides.
  block(g,2.73,.028,.028,'dark',-.49,4.07,3.05);
  for(let i=0;i<5;i++)block(g,.38,.6+(i%2)*.14,.035,['cream','blue','roof'][i%3],-1.57+i*.53,3.71,3.05);
  for(const x of [-2.3,-1.25])sprout(g,x,7.36,-1.55,.54,true);
  for(const [x,z] of [[-2.9,2.73],[1.74,2.73],[2.84,-2.18]])sprout(g,x,.24,z,.43,true);
  for(const y of [3.09,5.47]){block(g,.57,.49,.24,'white',-2.48,y,2.48);cylinder(g,.17,.04,'metal',-2.48,y,2.64).rotation.x=Math.PI/2;}
  return g;
}
function shelf(parent,x,y,z,w=1.1,h=1.7){
  block(parent,w,h,.24,'dark',x,y,z,'wood');for(let row=0;row<3;row++){
    const yy=y-h*.35+row*h*.31;block(parent,w,.07,.39,'wood',x,yy-.17,z+.12,'wood');
    for(let i=0;i<5;i++)block(parent,w*.12,.25+(i%2)*.09,.16,['roof','green','cream','blue'][i%4],x-w*.36+i*w*.18,yy,z+.17);
  }
}
function createBookstall(){
  const g=new THREE.Group();foundation(g,5.65,4.8);block(g,3.6,2.85,2.7,'wood',-.6,1.58,-.55,'wood');
  block(g,3.95,.17,3.1,'dark',-.6,3.05,-.4,'wood');
  for(const x of [-2.33,1.14])block(g,.14,2.85,.15,'dark',x,1.61,1.21,'wood');
  awning(g,-.6,2.97,.89,3.95,1.55);
  shelf(g,-1.74,1.58,.87,.86,1.9);shelf(g,.54,1.66,.87,.87,1.75);
  block(g,2.43,.11,.73,'cream',-.46,1.03,1.13);block(g,2.25,.94,.48,'wood',-.46,.51,1.13,'wood');
  block(g,.54,.54,.36,'metal',-.35,1.34,1.12);block(g,.43,.13,.15,'dark',-.35,1.5,1.35);cylinder(g,.095,.13,'cream',-.35,1.09,1.39);
  for(const x of [-1.16,.32])cylinder(g,.085,.16,'cream',x,1.17,1.25);
  shelf(g,-1.23,.59,1.83,1.8,.84);
  cylinder(g,.67,.12,'wood',2,1.01,.82);cylinder(g,.09,.95,'dark',2,.48,.82);
  for(const z of [-.05,1.68]){cylinder(g,.29,.12,'wood',2,.58,z);for(const dx of [-.16,.16])block(g,.07,.5,.08,'dark',2+dx,.3,z);}
  cylinder(g,.045,2.65,'dark',2,1.46,.82);const umbrella=mesh(g,new THREE.ConeGeometry(1.05,.55,8),mat('cream'),2,2.65,.82);umbrella.name='bookstall-umbrella';
  sprout(g,-2.29,.18,1.88,.38,true);sprout(g,2.67,.18,1.92,.36,true);sprout(g,1.12,3.14,-.75,.42);steps(g,2.2,2.05,2);
  plaque(g,-.5,2.37,1.02,1.62);
  const chalk=block(g,.65,.93,.1,'dark',-2.46,.66,1.58);chalk.rotation.x=-.12;block(g,.53,.74,.035,'green',-2.46,.68,1.665);
  return g;
}
function createCottage(style='cottage',season=0){
  const g=new THREE.Group(),cafe=style==='cafe',workshop=style==='workshop',w=workshop?5.2:4.7,d=4.15,h=workshop?3.5:3.15;
  foundation(g,w+.5,d+.9);block(g,w,h,d,cafe?'cream':workshop?'wood':'wall',0,h/2+.23,0,cafe?'plaster':workshop?'wood':'brick');
  for(const x of [-w/2+.1,w/2-.1])block(g,.17,h,.19,'dark',x,h/2+.23,d/2+.035,'wood');
  block(g,w+.2,.17,d+.15,'dark',0,h+.21,0,'wood');gable(g,w+.22,d+.18,h+.3,1.45,{roof:season===3?'white':workshop?'green':'roof',wall:'wood'});
  door(g,workshop?.83:0,.22,d/2+.08,workshop?1.7:1.02,1.97);
  for(const x of workshop?[-1.51]:[-1.5,1.5])windowFrame(g,x,1.8,d/2+.08,workshop?1.33:1.08,1.36,{books:cafe});
  for(const z of [-.96,1])windowFrame(g,w/2+.06,1.72,z,1.08,1.21,{side:true});
  if(cafe){awning(g,0,2.93,d/2+.43,w+.12,1.26);plaque(g,0,3.29,d/2+.16,2.14);}
  else if(workshop){plaque(g,.72,2.81,d/2+.16,2.0);const wheel=mesh(g,new THREE.TorusGeometry(.45,.075,6,12),mat('dark'),-1.43,.78,d/2+.21);wheel.rotation.y=.13;}
  else{windowFrame(g,0,h+.91,d/2+.09,.72,.66);block(g,.48,1.32,.5,'roof',-1.53,h+1.43,-1.04,'brick');}
  for(const x of [-w/2+.32,w/2-.3])sprout(g,x,.16,d/2+.42,.36,season===0);steps(g,1.75,d/2+.04,2);
  return g;
}

export const LANDMARK_BUILDINGS=Object.freeze([
  Object.freeze({id:'library',name:'大学图书馆',stationIndex:0,width:8.4,depth:8.2,front:4.4,back:3.4,preferredSide:1}),
  Object.freeze({id:'stadium',name:'校招体育馆',stationIndex:1,width:12.7,depth:11,front:5.9,back:4.9,preferredSide:1}),
  Object.freeze({id:'village',name:'城中村小楼',stationIndex:2,width:7.1,depth:6.8,front:3.55,back:3.25,preferredSide:1}),
  Object.freeze({id:'bookstall',name:'书与咖啡',stationIndex:0,width:6.4,depth:5.7,front:3.15,back:2.55,preferredSide:-1,decorative:true}),
]);
export function createPastoralBuilding(id,{season=0}={}){
  const factory={library:createLibrary,stadium:createStadium,village:createVillage,bookstall:createBookstall};
  const g=factory[id]?factory[id]():createCottage(id,season);g.name=`pastoral-${id}`;g.userData={...g.userData,buildingId:id,season,real3D:true};return g;
}
export function pointToFootprint(x,z,plan){
  const dx=x-plan.x,dz=z-plan.z,c=Math.cos(plan.rotation),s=Math.sin(plan.rotation);
  const xx=c*dx-s*dz,zz=s*dx+c*dz;
  return Math.hypot(Math.max(0,Math.abs(xx)-plan.width/2),Math.max(0,zz-plan.front,-zz-plan.back));
}
export function footprintCorners(plan,padding=0){
  const c=Math.cos(plan.rotation),s=Math.sin(plan.rotation),corners=[];
  for(const x of [-plan.width/2-padding,plan.width/2+padding])for(const z of [-plan.back-padding,plan.front+padding])corners.push({x:plan.x+x*c+z*s,z:plan.z-x*s+z*c});return corners;
}
export function footprintsOverlap(a,b,clearance=.7){
  const aa=footprintCorners(a,clearance/2),bb=footprintCorners(b,clearance/2);
  for(const angle of [a.rotation,b.rotation])for(const axis of [[Math.cos(angle),-Math.sin(angle)],[Math.sin(angle),Math.cos(angle)]]){
    const pa=aa.map(p=>p.x*axis[0]+p.z*axis[1]),pb=bb.map(p=>p.x*axis[0]+p.z*axis[1]);
    if(Math.max(...pa)<Math.min(...pb)||Math.max(...pb)<Math.min(...pa))return false;
  }return true;
}
export function planPastoralBuildings(curve,events,{canalX=67,roadClearance=3.85}={}){
  const samples=curve.getSpacedPoints(960),plans=[];
  const add=spec=>{
    const u=spec.routeU??(.045+spec.stationIndex/Math.max(1,events.length-1)*.9),p=curve.getPointAt(u),t=curve.getTangentAt(u).setY(0).normalize(),n=new THREE.Vector3(-t.z,0,t.x);
    const front=spec.front??3.45,back=spec.back??2.6;
    for(const side of [spec.preferredSide,-spec.preferredSide])for(const distance of [front+4.9,front+7.1,front+9.5,front+12])for(const shift of [0,-2.7,2.7,-5.5,5.5]){
      const q=p.clone().addScaledVector(n,side*distance).addScaledVector(t,shift),rotation=Math.atan2(-n.x*side,-n.z*side);
      const plan={...spec,x:q.x,z:q.z,rotation,front,back,season:events[spec.stationIndex].season};
      const corners=footprintCorners(plan,.25);
      if(corners.some(c=>c.x>canalX-5.4||Math.abs(c.x)>76||Math.abs(c.z+5)>68))continue;
      if(samples.some(sample=>pointToFootprint(sample.x,sample.z,plan)<roadClearance))continue;
      if(plans.some(other=>footprintsOverlap(other,plan,1)))continue;
      plans.push(plan);return;
    }
  };
  LANDMARK_BUILDINGS.forEach(add);
  add({id:'cottage',name:'启程小屋',stationIndex:0,routeU:.008,width:6,depth:6.1,front:3.45,back:2.6,preferredSide:1});
  for(let i=3;i<events.length;i++)if(i%3!==2){const style=Math.floor(i/3)%3;add({id:['cottage','workshop','cafe'][style],name:['邻里木屋','手作工坊','街角咖啡'][style],stationIndex:i,width:6,depth:6.1,front:3.45,back:2.6,preferredSide:i%2?1:-1});}
  return plans;
}
