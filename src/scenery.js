import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EVENTS, SEASONS } from './events.js';

export const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export const CANAL_CENTER_X=67;
const naturalY=(x,z)=>.18*Math.sin(x*.11)+.32*Math.cos(z*.065)+.12*Math.sin((x-z)*.09)
  +1.1*(1-THREE.MathUtils.smoothstep(z,9,23))
  +1.0*(1-THREE.MathUtils.smoothstep(z,-16,-1))
  +1.1*(1-THREE.MathUtils.smoothstep(z,-40,-25));
export const surfaceY=(x,z)=>{
  // Carve a real bed beneath the canal, including its end caps. Water no longer
  // intersects the unmodified rolling terrain.
  const bank=1-THREE.MathUtils.smoothstep(Math.abs(x-CANAL_CENTER_X),3.8,5.2);
  const end=1-THREE.MathUtils.smoothstep(Math.abs(z+5),57.8,59.8);
  return THREE.MathUtils.lerp(naturalY(x,z),-.72,bank*end);
};
export const groundPoint=(x,z,offset=0)=>new THREE.Vector3(x,surfaceY(x,z)+offset,z);
export const biomeColors=['#95bd69','#79a457','#bd9f5a','#d9e6e4'];
export const leafColors=['#ed9dbc','#608e44','#dc9c36','#b6cfc2'];

const materials=new Map();
export function material(color,roughness=.8){const key=color+roughness;if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness}));return materials.get(key);}
export function box(parent,w,h,d,color,x,y,z,r=.04){const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,3,r),material(color));mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
export function ball(parent,r,color,x,y,z,sx=1,sy=1,sz=1){const m=new THREE.Mesh(new THREE.SphereGeometry(r,24,16),material(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
export function textMap(text,{background='#fff9e9',color='#345448',width=768,height=192,font=64}={}){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const c=canvas.getContext('2d');
  c.fillStyle=background;c.fillRect(0,0,width,height);c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font=`500 ${font}px "Microsoft YaHei",sans-serif`;c.fillText(text,width/2,height/2,width-40);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;
}
export function boardSign(scene,text,p,width=3.1,angle=0,color='#476e5b'){
  const g=new THREE.Group();g.position.copy(p);g.rotation.y=angle;scene.add(g);
  for(const x of [-width*.35,width*.35])box(g,.08,1.9,.08,'#877a5f',x,.95,0,.02);
  box(g,width,.86,.12,color,0,1.95,0,.1);
  const panel=new THREE.Mesh(new THREE.PlaneGeometry(width-.12,.72),new THREE.MeshBasicMaterial({map:textMap(text,{font:52})}));panel.position.set(0,1.95,.066);g.add(panel);g.userData.labelPanel=panel;return g;
}

// Static props are authored with many small meshes. Consolidate only matching
// materials/attributes inside a single prop; moving actors and fading groups
// remain independent. This preserves geometry while reducing draw submissions.
export function batchStatic(root){
  root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),batches=new Map();
  root.traverse(m=>{
    if(!m.isMesh||m.isInstancedMesh||m.isSkinnedMesh||Array.isArray(m.material)||m.geometry.morphAttributes.position)return;
    const key=[m.material.uuid,m.castShadow,m.receiveShadow,...Object.keys(m.geometry.attributes).sort()].join(':');
    if(!batches.has(key))batches.set(key,[]);batches.get(key).push(m);
  });
  for(const meshes of batches.values()){
    if(meshes.length<2)continue;
    const pieces=meshes.map(m=>m.geometry.clone().applyMatrix4(inverse.clone().multiply(m.matrixWorld)).toNonIndexed());
    const combined=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());if(!combined)continue;
    const mesh=new THREE.Mesh(combined,meshes[0].material);mesh.castShadow=meshes[0].castShadow;mesh.receiveShadow=meshes[0].receiveShadow;
    meshes.forEach(m=>m.removeFromParent());root.add(mesh);
  }
}

export class Scenery {
  constructor(scene,curve,renderer){this.scene=scene;this.curve=curve;this.renderer=renderer;this.models=new Map();this.occluders=[];this.visuals=[];this.clouds=new THREE.Group();this.scene.add(this.clouds);this.wind={value:0};this.particles=[];this.loaded=0;this.failed=0;this.disposed=false;this.routeSamples=curve.getSpacedPoints(280);this.wildlife=[];this.detailCounts={flowers:0,fences:0,bridges:0,birds:0,butterflies:0};}
  distanceToRoad(x,z){let min=Infinity;for(const p of this.routeSamples)min=Math.min(min,Math.hypot(p.x-x,p.z-z));return min;}
  seasonAt(x,z){let min=Infinity,index=0;this.routeSamples.forEach((p,i)=>{const d=(p.x-x)**2+(p.z-z)**2;if(d<min){min=d;index=i;}});const eventIndex=THREE.MathUtils.clamp(Math.round((index/(this.routeSamples.length-1)-.045)/.9*(EVENTS.length-1)),0,EVENTS.length-1);return EVENTS[eventIndex]?.season??0;}
  async load(){
    const loader=new GLTFLoader();const city=['building_A','building_B','building_C','building_D','building_E','building_G','car_hatchback','car_taxi','bench','streetlight','firehydrant','bush'];
    const nature=['tree_oak','tree_oak_fall','tree_pineTallA_detailed','plant_bushDetailed','flower_purpleA','flower_yellowA','flower_redA','rock_largeA','rock_largeB','lily_small','mushroom_redGroup'];
    await Promise.allSettled([...city.map(n=>[n,`/models/city/${n}.gltf`]),...nature.map(n=>[n,`/models/nature/${n}.glb`])].map(async([name,url])=>{
      let timer;try{const gltf=await Promise.race([loader.loadAsync(url),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('asset timeout')),45000);})]);if(this.disposed)return;gltf.scene.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;if(m.material.map)m.material.map.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());}});this.models.set(name,gltf.scene);this.loaded++;}catch{this.failed++;}finally{clearTimeout(timer);}
    }));
    if(!this.disposed)this.populate();
    return {loaded:this.loaded,failed:this.failed};
  }
  model(name,p,height=3,rotation=0,occludes=false){
    const original=this.models.get(name);if(!original)return null;
    const obj=original.clone(true),bounds=new THREE.Box3().setFromObject(obj),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
    const factor=height/Math.max(.01,size.y);obj.position.set(-center.x,-bounds.min.y,-center.z);const group=new THREE.Group();group.add(obj);group.scale.setScalar(factor);group.position.copy(p);group.rotation.y=rotation;this.scene.add(group);
    batchStatic(group);
    this.visuals.push({group,position:p.clone(),range:occludes?76:name.startsWith('car')?52:42});
    if(occludes){const meshes=[];group.traverse(m=>{if(m.isMesh)meshes.push(m);});this.occluders.push({group,meshes,center:p.clone().add(new THREE.Vector3(0,height*.5,0)),radius:Math.max(size.x,size.z)*factor*.5});}
    return group;
  }
  terrain(){
    // Sub-metre samples keep the rendered terrain close to surfaceY even at
    // terrace ramps; a coarse grid used to cut triangles through the road.
    const geometry=new THREE.PlaneGeometry(210,230,240,260);geometry.rotateX(-Math.PI/2);const positions=geometry.attributes.position,colors=[],rand=rng(2006);
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),z=positions.getZ(i);let h=surfaceY(x,z);
      const edge=Math.max(0,Math.abs(x)-72,Math.abs(z+5)-64);h+=Math.pow(edge*.06,1.65)*(1.4+.6*Math.sin(x*.12+z*.08));positions.setY(i,h);
      const season=this.seasonAt(x,z),b=Math.min(3,Math.floor(season)),mix=THREE.MathUtils.smoothstep(season-b,.75,1);
      const c=new THREE.Color(biomeColors[b]).lerp(new THREE.Color(biomeColors[Math.min(3,b+1)]),mix);c.multiplyScalar(.96+rand()*.06);colors.push(c.r,c.g,c.b);
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));mesh.receiveShadow=true;this.scene.add(mesh);
    // Fine surface grain is procedural; no raster asset is copied from the reference video.
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,256,256);
    for(let i=0;i<13000;i++){const v=215+Math.floor(rand()*40);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(rand()*256,rand()*256,1,1);}
    const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(90,100);texture.colorSpace=THREE.SRGBColorSpace;mesh.material.map=texture;
    this.sky();this.river();this.grass();
  }
  sky(){
    const c=document.createElement('canvas');c.width=2;c.height=256;const ctx=c.getContext('2d'),g=ctx.createLinearGradient(0,0,0,256);g.addColorStop(0,'#88b9cc');g.addColorStop(.55,'#d3dfe1');g.addColorStop(1,'#f9ead0');ctx.fillStyle=g;ctx.fillRect(0,0,2,256);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;this.scene.add(new THREE.Mesh(new THREE.SphereGeometry(230,32,20),new THREE.MeshBasicMaterial({map:t,side:THREE.BackSide,depthWrite:false,fog:false})));
    const rand=rng(72);for(let i=0;i<14;i++){const cluster=new THREE.Group();cluster.position.set((rand()-.5)*170,28+rand()*16,-60+rand()*140);this.clouds.add(cluster);for(let k=0;k<4;k++){const m=ball(cluster,3.4,'#fdf6e9',k*2.5,Math.sin(k)*.3,0,1.4,.28,.7);m.castShadow=false;m.receiveShadow=false;}}
    const sun=new THREE.Mesh(new THREE.CircleGeometry(6,40),new THREE.MeshBasicMaterial({color:'#fff4d8',fog:false}));sun.position.set(-70,55,-135);sun.lookAt(0,0,0);this.scene.add(sun);
  }
  road(){
    const points=this.curve.getPoints(480),vertices=[],uvs=[],indices=[],across=8,stride=across+1;
    for(let i=0;i<points.length;i++){
      const p=points[i],t=this.curve.getTangent(i/(points.length-1)),normal=new THREE.Vector3(-t.z,0,t.x).normalize();
      // Sample across, not only along, the path. Two edge vertices make one
      // flat plank over a curved terrace and allow the centre to poke through.
      for(let j=0;j<=across;j++){const q=p.clone().addScaledVector(normal,2.15*(j/across*2-1));vertices.push(q.x,surfaceY(q.x,q.z)+.055,q.z);uvs.push(j/across,i*.09);}
      if(i<points.length-1)for(let j=0;j<across;j++){const a=i*stride+j;indices.push(a,a+1,a+stride,a+1,a+stride+1,a+stride);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const tile=document.createElement('canvas');tile.width=256;tile.height=256;const ctx=tile.getContext('2d');ctx.fillStyle='#c3bdae';ctx.fillRect(0,0,256,256);const rand=rng(927);
    for(let y=0;y<8;y++)for(let x=0;x<4;x++){const shade=175+Math.floor(rand()*24);ctx.fillStyle=`rgb(${shade+16},${shade+9},${shade-3})`;ctx.fillRect(x*64+(y%2?32:0)+2,y*32+2,60,28);if(y%2)ctx.fillRect(-30,y*32+2,60,28);}
    const texture=new THREE.CanvasTexture(tile);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:texture,roughness:.96}));mesh.receiveShadow=true;this.scene.add(mesh);
    for(const side of [-1,1]){const edge=points.map((p,i)=>{const t=this.curve.getTangent(i/(points.length-1)),n=new THREE.Vector3(-t.z,0,t.x).normalize();const q=p.clone().addScaledVector(n,side*2.22);q.y=surfaceY(q.x,q.z)+.13;return q;});const curb=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge),480,.1,6,false),material('#eee4cc'));curb.receiveShadow=true;this.scene.add(curb);}
    // Tiny brass studs form a quiet continuous guide through the town.
    const studs=new THREE.InstancedMesh(new THREE.CylinderGeometry(.065,.065,.025,8),material('#bb9d63',.4),90);const temp=new THREE.Object3D();
    for(let i=0;i<90;i++){const p=this.curve.getPointAt(i/89);temp.position.copy(groundPoint(p.x,p.z,.084));temp.updateMatrix();studs.setMatrixAt(i,temp.matrix);}this.scene.add(studs);
  }
  river(){
    // A planted canal beside the path, kept away from all gameplay landing cells.
    const water=new THREE.Mesh(new THREE.PlaneGeometry(7,115),new THREE.MeshStandardMaterial({color:'#78adb0',roughness:.2,metalness:.16}));water.rotation.x=-Math.PI/2;water.position.set(CANAL_CENTER_X,-.05,-5);this.scene.add(water);
    for(const x of [CANAL_CENTER_X-3.7,CANAL_CENTER_X+3.7])box(this.scene,.38,.52,115,'#b6b59f',x,-.08,-5,.1);
    for(const z of [-62.5,52.5])box(this.scene,7.8,.52,.38,'#b6b59f',CANAL_CENTER_X,-.08,z,.1);
    const positions=[];for(let i=0;i<38;i++){const z=-61+i*3;positions.push(CANAL_CENTER_X-2.8,-.025,z,CANAL_CENTER_X+2.8,-.025,z+.4);}
    const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)),new THREE.LineBasicMaterial({color:'#d4ece4',transparent:true,opacity:.42}));this.scene.add(lines);
  }
  grass(){
    const rand=rng(992),positions=[],colors=[];
    for(let i=0;i<17000;i++){
      const x=(rand()-.5)*135,z=(rand()-.5)*120-5;if(this.distanceToRoad(x,z)<2.75||x>CANAL_CENTER_X-5)continue;
      const season=Math.floor(this.seasonAt(x,z));if(season===3&&rand()>.18)continue;
      const y=surfaceY(x,z),h=(season===3?.06:.12)+rand()*.2,w=.025+rand()*.035,angle=rand()*Math.PI,dx=Math.cos(angle)*w,dz=Math.sin(angle)*w;
      positions.push(x-dx,y,z-dz,x+dx,y,z+dz,x+.05,y+h,z+.05);
      const c=new THREE.Color(['#77925f','#5d824f','#af8d54','#b4c7c2'][season]);for(let k=0;k<3;k++){const cc=c.clone().multiplyScalar(k===2?1.28:.8);colors.push(cc.r,cc.g,cc.b);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const mat=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1});mat.onBeforeCompile=shader=>{shader.uniforms.uWind=this.wind;shader.vertexShader='uniform float uWind;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.x += sin(position.x * 1.9 + position.z + uWind)*0.035;');};
    const mesh=new THREE.Mesh(geometry,mat);mesh.receiveShadow=true;this.scene.add(mesh);
  }
  leafyTree(p,season,scale=1){
    const g=new THREE.Group();g.position.copy(p);g.scale.setScalar(scale);this.scene.add(g);
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.11,.22,3.8,10),material('#817054'));trunk.position.y=1.9;trunk.castShadow=true;g.add(trunk);
    for(const [x,angle] of [[-1,.6],[1,-.55]]){const b=new THREE.Mesh(new THREE.CylinderGeometry(.06,.12,1.8,8),material('#817054'));b.position.set(x*.35,3.05,0);b.rotation.z=angle;g.add(b);}
    // Leaf clusters instead of the previous giant solid polyhedra. Alpha-tested
    // instances give a detailed silhouette at a bounded draw-call cost.
    if(!this.leafTexture){const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#fff';for(let i=0;i<7;i++){const a=i*2.4;ctx.beginPath();ctx.ellipse(64+Math.cos(a)*25,64+Math.sin(a)*23,18,10,a,0,Math.PI*2);ctx.fill();}this.leafTexture=new THREE.CanvasTexture(c);}
    const leafMaterial=new THREE.MeshStandardMaterial({map:this.leafTexture,color:leafColors[season],alphaTest:.5,side:THREE.DoubleSide,roughness:.86});
    const leaves=new THREE.InstancedMesh(new THREE.PlaneGeometry(.72,.72),leafMaterial,170),temp=new THREE.Object3D(),rand=rng(Math.abs(Math.round(p.x*919+p.z*147)));
    for(let i=0;i<170;i++){const a=rand()*Math.PI*2,r=Math.cbrt(rand())*1.7;temp.position.set(Math.cos(a)*r,3.9+(rand()-.35)*1.7,Math.sin(a)*r);temp.rotation.set(rand()*Math.PI,rand()*Math.PI,rand()*Math.PI);temp.scale.setScalar(.75+rand()*.9);temp.updateMatrix();leaves.setMatrixAt(i,temp.matrix);}
    leaves.castShadow=true;leaves.receiveShadow=true;g.add(leaves);this.occluders.push({group:g,meshes:[trunk,leaves],center:p.clone().add(new THREE.Vector3(0,3.6*scale,0)),radius:2.2*scale});
    this.visuals.push({group:g,position:p.clone(),range:76});
    return g;
  }
  populate(){
    const rand=rng(32026),lots=[];
    for(let i=0;i<EVENTS.length;i++){
      const u=.045+i/Math.max(1,EVENTS.length-1)*.9,p=this.curve.getPointAt(u),t=this.curve.getTangentAt(u),n=new THREE.Vector3(-t.z,0,t.x).normalize(),s=EVENTS[i].season;
      const side=i%2?1:-1,lot=p.clone().addScaledVector(n,side*(8.5+rand()*1.5));
      if(i%3!==2&&lot.x<CANAL_CENTER_X-8&&this.distanceToRoad(lot.x,lot.z)>6.2&&!lots.some(l=>l.distanceTo(lot)<10)){
        const name=s===1?(i%2?'building_G':'building_E'):['building_A','building_B','building_C','building_D'][i%4];
        this.model(name,groundPoint(lot.x,lot.z),s===1?9+rand()*3:5.5+rand()*2,Math.atan2(-n.x*side,-n.z*side),true);lots.push(lot);
        if(i%2===0)this.model(i%4?'car_taxi':'car_hatchback',groundPoint(lot.x+n.z*3.5,lot.z-n.x*3.5),.85,Math.atan2(t.x,t.z));
      }
      const lamp=p.clone().addScaledVector(n,3.05*side).addScaledVector(t,2.1);this.model('streetlight',groundPoint(lamp.x,lamp.z),3.8,Math.atan2(t.x,t.z));
      if(i%3===0){const bench=p.clone().addScaledVector(n,-4.6*side);this.bench(groundPoint(bench.x,bench.z),Math.atan2(n.x*side,n.z*side),s);}
      for(const offset of [-5,5]){
        const q=p.clone().addScaledVector(n,offset);if(this.distanceToRoad(q.x,q.z)<4)continue;
        if(s!==3){for(let k=0;k<3;k++)this.model(['flower_purpleA','flower_yellowA','flower_redA'][s%3],groundPoint(q.x+(rand()-.5),q.z+(rand()-.5)),.28+rand()*.1,rand()*6);this.model('plant_bushDetailed',groundPoint(q.x+.7,q.z+.5),.62,rand()*6);}
        else this.model('rock_largeA',groundPoint(q.x,q.z),.26,rand()*6);
      }
    }
    for(let i=0;i<104;i++){
      const u=rand(),p=this.curve.getPointAt(u),t=this.curve.getTangentAt(u),n=new THREE.Vector3(-t.z,0,t.x).normalize(),q=p.clone().addScaledVector(n,(i%2?1:-1)*(5.6+rand()*12));
      if(q.x>CANAL_CENTER_X-6||this.distanceToRoad(q.x,q.z)<5||lots.some(l=>l.distanceTo(q)<5.2))continue;
      const season=Math.floor(this.seasonAt(q.x,q.z));
      if(season===3)this.model('tree_pineTallA_detailed',groundPoint(q.x,q.z),4+rand()*3,rand()*6,true);
      else this.leafyTree(groundPoint(q.x,q.z),season,.9+rand()*.45);
    }
    for(let i=0;i<22;i++){const x=CANAL_CENTER_X-8+rand()*3,z=-59+rand()*104;if(this.distanceToRoad(x,z)>4)this.model(i%2?'rock_largeA':'rock_largeB',groundPoint(x,z),.4+rand()*.7,rand()*6);}
    this.seasonDetails();this.smallDetails();this.gardenDetails();this.riversideBridges();this.createWildlife();
  }
  bench(p,angle,season){
    const g=new THREE.Group();g.position.copy(p);g.rotation.y=angle;this.scene.add(g);
    for(const x of [-.85,.85]){
      box(g,.1,.62,.09,'#4c625b',x,.31,0,.035);box(g,.1,.95,.08,'#4c625b',x,.47,-.34,.03);
      box(g,.11,.08,.8,'#4c625b',x,.59,-.02,.035);box(g,.12,.08,.68,'#4c625b',x,.06,-.07,.025);
    }
    for(let k=0;k<4;k++)box(g,2.05,.07,.13,k%2?'#b38a60':'#c29a70',0,.46,-.26+k*.15,.022);
    for(let k=0;k<3;k++)box(g,2.05,.12,.06,k%2?'#b38a60':'#c29a70',0,.69+k*.15,-.34,.018);
    if(season===3)box(g,2.08,.035,.55,'#eaf0eb',0,.51,-.035,.015);
    batchStatic(g);this.visuals.push({group:g,position:p.clone(),range:42});return g;
  }
  seasonDetails(){
    const rand=rng(812),petals=[],leaves=[],snow=[];
    // Small seasonal details stay by the route, so a player sees the chapter
    // change at walking scale rather than only in the map overview.
    for(let i=0;i<1000;i++){
      const u=rand(),p=this.curve.getPointAt(u),t=this.curve.getTangentAt(u),n=new THREE.Vector3(-t.z,0,t.x),side=i%2?1:-1;
      p.addScaledVector(n,side*(2.6+rand()*3));if(this.distanceToRoad(p.x,p.z)<2.5)continue;
      const season=Math.floor(this.seasonAt(p.x,p.z));if(season===0)petals.push(p);if(season===2)leaves.push(p);if(season===3&&i%3===0)snow.push(p);
    }
    for(const [points,color,size] of [[petals,'#e8b5c4',.1],[leaves,'#b98c43',.17],[snow,'#edf2ef',.22]]){
      if(!points.length)continue;const mesh=new THREE.InstancedMesh(new THREE.CircleGeometry(size,6),material(color),points.length),temp=new THREE.Object3D();
      points.forEach((p,i)=>{temp.position.copy(groundPoint(p.x,p.z,.014));temp.rotation.set(-Math.PI/2,0,rand()*6);temp.scale.set(1,.6+rand()*.5,1);temp.updateMatrix();mesh.setMatrixAt(i,temp.matrix);});mesh.receiveShadow=true;this.scene.add(mesh);
    }
  }
  smallDetails(){
    const p=this.curve.getPointAt(.02),t=this.curve.getTangentAt(.02),angle=Math.atan2(t.x,t.z),arch=new THREE.Group();arch.position.copy(groundPoint(p.x,p.z));arch.rotation.y=angle;this.scene.add(arch);
    for(const x of [-2.65,2.65]){box(arch,.32,4.2,.32,'#678c78',x,2.1,0,.1);box(arch,.65,.24,.65,'#ded8c1',x,.12,0,.08);}
    box(arch,5.8,.85,.3,'#426b56',0,4.1,0,.16);
    const title=new THREE.Mesh(new THREE.PlaneGeometry(4.8,.61),new THREE.MeshBasicMaterial({map:textMap('四 时 人 生',{background:'#426b56',color:'#fff1cb',font:70})}));title.position.set(0,4.1,.16);arch.add(title);
    batchStatic(arch);arch.userData.cinematicOccluder=true;const archMeshes=[];arch.traverse(m=>{if(m.isMesh)archMeshes.push(m);});this.occluders.push({group:arch,meshes:archMeshes,center:arch.position.clone().add(new THREE.Vector3(0,2,0)),radius:3.4});
    for(let s=1;s<SEASONS.length;s++){const first=EVENTS.findIndex(e=>e.season===s),u=.045+(first-.5)/Math.max(1,EVENTS.length-1)*.9,p=this.curve.getPointAt(u),t=this.curve.getTangentAt(u);const n=new THREE.Vector3(-t.z,0,t.x).normalize();const q=p.clone().addScaledVector(n,3.7);boardSign(this.scene,`${SEASONS[s].name} · ${SEASONS[s].title}`,groundPoint(q.x,q.z),3.3,Math.atan2(-t.x,-t.z));}
    this.finishGate();
    const rand=rng(71),geo=new THREE.BufferGeometry(),positions=[];
    for(let i=0;i<160;i++){const p=this.curve.getPointAt(rand());positions.push(p.x+(rand()-.5)*12,2+rand()*6,p.z+(rand()-.5)*12);}
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.motes=new THREE.Points(geo,new THREE.PointsMaterial({color:'#fff1c5',size:.055,transparent:true,opacity:.5,depthWrite:false}));this.scene.add(this.motes);
  }
  finishGate(){
    const p=this.curve.getPointAt(.973),t=this.curve.getTangentAt(.973),g=new THREE.Group();g.name='four-seasons-finish-gate';g.position.copy(groundPoint(p.x,p.z));g.rotation.y=Math.atan2(t.x,t.z);this.scene.add(g);
    for(const x of [-2.55,2.55]){
      box(g,.42,4.5,.42,'#866c48',x,2.25,0,.1);box(g,.85,.35,.85,'#ced3bd',x,.18,0,.12);
      for(let y=.7;y<4;y+=.55){ball(g,.31,'#81976b',x+Math.sin(y*3)*.22,y,.08,1,.62,.72);ball(g,.09,y%1>.5?'#ffe6a6':'#edafbe',x-.12,y+.2,.32);}
    }
    const bow=new THREE.Mesh(new THREE.TorusGeometry(2.55,.18,8,32,Math.PI),material('#8d734d'));bow.position.y=4.2;g.add(bow);
    for(let i=0;i<15;i++){const a=i/14*Math.PI;ball(g,.31,'#9daf76',Math.cos(a)*2.55,4.2+Math.sin(a)*2.55,0,1,.67,.7);if(i%2===0)ball(g,.13,i%4?'#edbfd0':'#fff0ba',Math.cos(a)*2.55,4.2+Math.sin(a)*2.55,.26);}
    box(g,3.4,.66,.22,'#5d806a',0,4.06,.12,.12);
    const title=new THREE.Mesh(new THREE.PlaneGeometry(3.1,.48),new THREE.MeshBasicMaterial({map:textMap('把生活还给自己',{background:'#5d806a',color:'#fff0cf',font:68})}));title.position.set(0,4.06,.241);g.add(title);
    const star=new THREE.Shape();for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.23:.5;if(i)star.lineTo(Math.cos(a)*r,Math.sin(a)*r);else star.moveTo(Math.cos(a)*r,Math.sin(a)*r);}star.closePath();const emblem=new THREE.Mesh(new THREE.ExtrudeGeometry(star,{depth:.1,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:1,steps:1}),material('#f3cd70',.4));emblem.position.set(0,5.12,.15);g.add(emblem);
    batchStatic(g);g.userData.cinematicOccluder=true;const meshes=[];g.traverse(m=>{if(m.isMesh)meshes.push(m);});this.occluders.push({group:g,meshes,center:g.position.clone().add(new THREE.Vector3(0,3,0)),radius:3.4});
  }
  gardenDetails(){
    const rand=rng(140909),flowers=[],stones=[];
    for(let i=0;i<EVENTS.length;i++){
      const u=Math.min(.98,.045+i/Math.max(1,EVENTS.length-1)*.9+.007),p=this.curve.getPointAt(u),t=this.curve.getTangentAt(u),n=new THREE.Vector3(-t.z,0,t.x).normalize(),season=EVENTS[i].season,side=i%2?1:-1;
      const patch=p.clone().addScaledVector(n,side*5.5);if(patch.x>CANAL_CENTER_X-6||this.distanceToRoad(patch.x,patch.z)<4)continue;
      if(season!==3){
        for(let k=0;k<22;k++){const q=patch.clone().addScaledVector(t,(rand()-.5)*3.3).addScaledVector(n,(rand()-.5)*1.5);flowers.push({p:groundPoint(q.x,q.z),season,height:.2+rand()*.25,phase:rand()*Math.PI*2});}
      }else{
        for(let k=0;k<7;k++){const q=patch.clone().addScaledVector(t,(rand()-.5)*3);stones.push({p:groundPoint(q.x,q.z,.05),scale:.16+rand()*.25});}
      }
      if(i%2===0){
        const f=p.clone().addScaledVector(n,-side*4.7);if(this.distanceToRoad(f.x,f.z)>3.5){
          const fence=new THREE.Group();fence.position.copy(groundPoint(f.x,f.z));fence.rotation.y=Math.atan2(-t.z,t.x);this.scene.add(fence);
          for(const x of [-1.55,0,1.55]){box(fence,.13,.95,.13,'#937855',x,.475,0,.035);ball(fence,.1,'#b69b70',x,.96,0,.8,.55,.8);}
          for(const y of [.38,.73])box(fence,3.1,.11,.085,'#b99b6b',0,y,0,.035);
          if(season===3)box(fence,3.15,.05,.16,'#f2f5ec',0,.81,0,.02);
          batchStatic(fence);this.visuals.push({group:fence,position:fence.position.clone(),range:46});this.detailCounts.fences++;
        }
      }
    }
    // Hundreds of small blossoms share three instanced draw calls; denser
    // landscaping therefore does not turn into hundreds of animated objects.
    if(flowers.length){
      const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.017,.023,1,5),material('#739554'),flowers.length);
      const heads=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),material('#ffffff'),flowers.length*5),centers=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),material('#efd16a'),flowers.length),temp=new THREE.Object3D();
      flowers.forEach(({p,season,height,phase},i)=>{
        temp.position.copy(p).add(new THREE.Vector3(0,height/2,0));temp.rotation.set(0,0,0);temp.scale.set(1,height,1);temp.updateMatrix();stems.setMatrixAt(i,temp.matrix);
        for(let k=0;k<5;k++){const a=phase+k*Math.PI*.4;temp.position.copy(p).add(new THREE.Vector3(Math.cos(a)*.075,height,Math.sin(a)*.075));temp.scale.set(.075,.037,.06);temp.rotation.y=a;temp.updateMatrix();heads.setMatrixAt(i*5+k,temp.matrix);heads.setColorAt(i*5+k,new THREE.Color([['#fff1ce','#eeabc5','#f8deed'],['#fff8b5','#c2cce5','#f7ecbb'],['#f1bf71','#edd9af','#dda077']][season][i%3]));}
        temp.position.copy(p).add(new THREE.Vector3(0,height+.01,0));temp.scale.setScalar(.04);temp.updateMatrix();centers.setMatrixAt(i,temp.matrix);
      });for(const mesh of [stems,heads,centers]){mesh.receiveShadow=true;this.scene.add(mesh);}this.detailCounts.flowers=flowers.length;
    }
    if(stones.length){const snow=new THREE.InstancedMesh(new THREE.SphereGeometry(1,8,5),material('#f0f4ee'),stones.length),temp=new THREE.Object3D();stones.forEach(({p,scale},i)=>{temp.position.copy(p);temp.scale.set(scale*1.4,scale*.45,scale);temp.updateMatrix();snow.setMatrixAt(i,temp.matrix);});snow.receiveShadow=true;this.scene.add(snow);}
  }
  riversideBridges(){
    // Decorative footbridges cross the canal, not the playable route. Its
    // terrain bed and the forty landing cells remain independent.
    for(const z of [20,-28]){
      const g=new THREE.Group();g.name='riverside-footbridge';g.position.set(CANAL_CENTER_X,0,z);this.scene.add(g);
      for(let i=0;i<23;i++){const x=-4.4+i*.4,y=.42+Math.sin(i/22*Math.PI)*.62;box(g,.37,.14,2.4,'#b99766',x,y,0,.045);}
      for(const side of [-1,1]){
        const rail=[];for(let i=0;i<7;i++){const x=-4.4+i*8.8/6,y=.5+Math.sin(i/6*Math.PI)*.62;box(g,.14,1.1,.14,'#82684b',x,y+.5,side*1.08,.04);rail.push(new THREE.Vector3(x,y+1.02,side*1.08));}
        const handrail=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rail),30,.075,6,false),material('#ae8a5f'));handrail.castShadow=true;g.add(handrail);
      }
      batchStatic(g);this.visuals.push({group:g,position:g.position.clone(),range:72});this.detailCounts.bridges++;
      for(const x of [CANAL_CENTER_X-5.6,CANAL_CENTER_X+5.6]){this.model('plant_bushDetailed',groundPoint(x,z-2.5),.8,0);this.model('lily_small',new THREE.Vector3(CANAL_CENTER_X+(x<CANAL_CENTER_X?-2:2),.005,z+4),.15,0);}
    }
  }
  createWildlife(){
    const rand=rng(43017);
    for(let i=0;i<12;i++){
      const u=.065+i/12*.86,p=this.curve.getPointAt(u),t=this.curve.getTangentAt(u),n=new THREE.Vector3(-t.z,0,t.x).normalize();p.addScaledVector(n,(i%2?1:-1)*4.7);p.y=surfaceY(p.x,p.z)+1.05+rand()*1.1;
      const season=Math.floor(this.seasonAt(p.x,p.z)),bird=i%3===0,g=new THREE.Group();g.position.copy(p);this.scene.add(g);
      const wings=[];ball(g,bird?.09:.035,bird?'#d8b05e':'#5b5b43',0,0,0,bird?1.5:.6,1,bird?1:1.9);
      for(const side of [-1,1]){const pivot=new THREE.Group();g.add(pivot);const wing=new THREE.Mesh(new THREE.SphereGeometry(bird?.13:.105,8,5),material(bird?'#f2cf78':['#efbed2','#eadd92','#d4a566','#d1dfe7'][season]));wing.scale.set(1,.12,bird?.55:1.35);wing.position.x=side*.09;pivot.add(wing);wings.push({pivot,side});}
      if(bird){ball(g,.065,'#e9bf67',0,.04,.12);const beak=new THREE.Mesh(new THREE.ConeGeometry(.027,.085,5),material('#9b6b44'));beak.position.set(0,.04,.205);beak.rotation.x=Math.PI/2;g.add(beak);this.detailCounts.birds++;}else this.detailCounts.butterflies++;
      this.wildlife.push({group:g,origin:p.clone(),phase:rand()*Math.PI*2,wings,bird});this.visuals.push({group:g,position:p.clone(),range:36});
    }
  }
  update(time){this.wind.value=time*.0009;if(this.motes)this.motes.rotation.y=Math.sin(time*.0001)*.003;for(const actor of this.wildlife){if(!actor.group.visible)continue;const phase=time*.0008+actor.phase;actor.group.position.set(actor.origin.x+Math.sin(phase)*.65,actor.origin.y+Math.sin(phase*2)*.17,actor.origin.z+Math.cos(phase)*.4);actor.group.rotation.y=phase;for(const {pivot,side} of actor.wings)pivot.rotation.z=Math.sin(time*(actor.bird?.008:.013)+actor.phase)*.75*side;}}
  setView(camera,overview){for(const visual of this.visuals)visual.group.visible=overview||visual.position.distanceTo(camera.position)<visual.range;}
  dispose(){this.disposed=true;}
}
