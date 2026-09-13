import * as THREE from 'three';

export const WORLD_TERRAIN_RADIUS=1000;
const CORE_HALF=80,CORE_STEP=1;
const TRANSITION_RINGS=20;
const RINGS=Object.freeze([184,220,264,320,388,472,572,692,832,WORLD_TERRAIN_RADIUS]);
const PERIMETER=Array.from({length:640},(_,i)=>{
  const side=Math.floor(i/160),step=i%160;
  const [x,z]=side===0?[-80+step,-80]:side===1?[80,-80+step]:side===2?[80-step,80]:[-80,80-step],radius=Math.hypot(x,z);
  return {x,z,radius,dx:x/radius,dz:z/radius};
});
const ringPoint=(index,ring)=>{const p=PERIMETER[index%640],radius=ring===0?p.radius:ring<=TRANSITION_RINGS?THREE.MathUtils.lerp(p.radius,160,ring/TRANSITION_RINGS):RINGS[ring-TRANSITION_RINGS-1];return {x:p.dx*radius,z:p.dz*radius};};
const COLORS=['#82af4d','#579447','#b59b50','#d5e1d6'].map(color=>new THREE.Color(color));
const smooth=(value,start,end)=>THREE.MathUtils.smoothstep(value,start,end);
const HILLS=Object.freeze([
  [-164,-115,34,105,92],[178,104,29,118,84],[-213,102,37,112,108],
  [218,-126,42,100,112],[30,-286,63,155,95],[24,267,46,130,110],
  [-427,-267,82,165,150],[435,290,87,175,145],[-470,345,69,185,155],
  [432,-388,96,155,160],[-37,-551,86,230,155],[12,566,71,200,175]
]);

/** Preserve the playable ground exactly; the surrounding valley is visual only. */
function landformHeight(x,z,surfaceY){
  const base=surfaceY(x,z),outside=Math.max(0,Math.abs(x)-72,-60-z,z-55);
  if(outside===0)return base;
  let hills=3.5+2.8*Math.sin(x*.017)*Math.cos(z*.02)+1.2*Math.sin(x*.037+z*.013);
  for(const [cx,cz,height,sx,sz] of HILLS)hills+=height*Math.exp(-(((x-cx)/sx)**2+((z-cz)/sz)**2));
  hills+=Math.sin(x*.024+z*.009)*Math.sin(z*.017-x*.005)*Math.min(4,outside*.018);
  return THREE.MathUtils.lerp(base,hills,smooth(outside,0,38));
}

/** Ground props on the actual outer LOD triangles, including across ring seams. */
export function scenicHeight(x,z,surfaceY){
  if(Math.abs(x)<=72&&z>=-60&&z<=55)return surfaceY(x,z);
  if(Math.max(Math.abs(x),Math.abs(z))<=CORE_HALF){
    const left=Math.floor(x),top=Math.floor(z),fx=x-left,fz=z-top,height=(dx,dz)=>landformHeight(left+dx,top+dz,surfaceY);
    return fx+fz<=1?height(0,0)*(1-fx-fz)+height(0,1)*fz+height(1,0)*fx:height(1,0)*(1-fz)+height(0,1)*(1-fx)+height(1,1)*(fx+fz-1);
  }
  const radius=Math.hypot(x,z);if(radius>WORLD_TERRAIN_RADIUS)return landformHeight(x,z,surfaceY);
  const factor=CORE_HALF/Math.max(Math.abs(x),Math.abs(z)),bx=x*factor,bz=z*factor;
  const sector=(Math.floor(z<=-Math.abs(x)?bx+80:x>=Math.abs(z)?160+bz+80:z>=Math.abs(x)?320+80-bx:480+80-bz)+640)%640,next=(sector+1)%640;
  const dx=x/radius,dz=z/radius;
  let outer=TRANSITION_RINGS+RINGS.length;
  for(let ring=1;ring<=outer;ring++){const a=ringPoint(sector,ring),b=ringPoint(next,ring),edgeRadius=(a.x*b.z-a.z*b.x)/(dx*(b.z-a.z)-dz*(b.x-a.x));if(radius<=edgeRadius+1e-7){outer=ring;break;}}
  const a=ringPoint(sector,outer-1),b=ringPoint(next,outer-1),c=ringPoint(sector,outer),d=ringPoint(next,outer);
  const interpolate=(p,q,r)=>{
    const divisor=(q.z-r.z)*(p.x-r.x)+(r.x-q.x)*(p.z-r.z),u=((q.z-r.z)*(x-r.x)+(r.x-q.x)*(z-r.z))/divisor,v=((r.z-p.z)*(x-r.x)+(p.x-r.x)*(z-r.z))/divisor,w=1-u-v;
    return {inside:u>=-1e-7&&v>=-1e-7&&w>=-1e-7,height:u*landformHeight(p.x,p.z,surfaceY)+v*landformHeight(q.x,q.z,surfaceY)+w*landformHeight(r.x,r.z,surfaceY)};
  };
  const first=interpolate(a,b,c);return first.inside?first.height:interpolate(b,d,c).height;
}

/** Ordered, gently wandering climate boundaries; weights always sum to one. */
export function blendSeasonWeights(x,z){
  const climateX=THREE.MathUtils.clamp(x,-90,90);
  const springBoundary=19-.085*climateX+2*Math.sin(climateX*.065);
  const autumnBoundary=-1+.018*climateX+1.4*Math.sin(climateX*.045);
  const winterBoundary=-22+.1*climateX+2*Math.sin(climateX*.05);
  const spring=smooth(z,springBoundary-4,springBoundary+4),warm=smooth(z,autumnBoundary-4.8,autumnBoundary+4.8),autumn=smooth(z,winterBoundary-4.5,winterBoundary+4.5);
  return [spring,(1-spring)*warm,(1-spring)*(1-warm)*autumn,(1-spring)*(1-warm)*(1-autumn)];
}

function groundTexture(){
  const size=64,pixels=new Uint8Array(size*size*4);let seed=15731;
  for(let i=0;i<size*size;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const shade=228+seed%27;pixels.set([shade,shade,shade,255],i*4);}
  const texture=new THREE.DataTexture(pixels,size,size,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;return texture;
}

export function createWorldTerrain({scene,surfaceY}){
  if(!scene?.isObject3D||typeof surfaceY!=='function')throw new TypeError('A scene and gameplay surfaceY function are required.');
  const group=new THREE.Group();group.name='continuous-world-terrain';group.userData.backgroundEnvironment=true;scene.add(group);
  const positions=[],colors=[],uvs=[],indices=[],side=CORE_HALF*2/CORE_STEP+1;
  const add=(x,z)=>{
    const y=landformHeight(x,z,surfaceY),weights=blendSeasonWeights(x,z),color=new THREE.Color(0,0,0);
    for(let season=0;season<4;season++)color.add(COLORS[season].clone().multiplyScalar(weights[season]));
    const hash=Math.sin(x*127.1+z*311.7)*43758.5453,grain=hash-Math.floor(hash);
    color.multiplyScalar(.972+grain*.043);
    // Rocky high ridges remain subdued behind the coloured lowland chapters.
    color.lerp(new THREE.Color('#889681'),smooth(y,32,105)*.42);
    positions.push(x,y,z);colors.push(color.r,color.g,color.b);uvs.push(x/12,z/12);return positions.length/3-1;
  };
  for(let row=0;row<side;row++)for(let column=0;column<side;column++)add(-CORE_HALF+column*CORE_STEP,-CORE_HALF+row*CORE_STEP);
  for(let row=0;row<side-1;row++)for(let column=0;column<side-1;column++){const a=row*side+column;indices.push(a,a+side,a+1,a+1,a+side,a+side+1);}
  // Share the exact square boundary vertices with the first outer strip. The
  // following rings retain those angular rays, so no LOD seam can open a crack.
  let previous=[];
  for(let column=0;column<side-1;column++)previous.push(column);
  for(let row=0;row<side-1;row++)previous.push(row*side+side-1);
  for(let column=side-1;column>0;column--)previous.push((side-1)*side+column);
  for(let row=side-1;row>0;row--)previous.push(row*side);
  for(let ring=1;ring<=TRANSITION_RINGS+RINGS.length;ring++){
    const next=previous.map((_,index)=>{const p=ringPoint(index,ring);return add(p.x,p.z);});
    for(let i=0;i<previous.length;i++){const j=(i+1)%previous.length;indices.push(previous[i],previous[j],next[i],previous[j],next[j],next[i]);}
    previous=next;
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,map:groundTexture(),roughness:1});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='continuous-ground-lod';mesh.receiveShadow=true;group.add(mesh);
  const stats=Object.freeze({radius:WORLD_TERRAIN_RADIUS,coreStep:CORE_STEP,coreHalfExtent:CORE_HALF,vertices:positions.length/3,triangles:indices.length/3,lodRings:TRANSITION_RINGS+RINGS.length,climate:'blended-four-seasons'});
  group.userData.terrainStats=stats;mesh.userData.terrainRadius=WORLD_TERRAIN_RADIUS;
  return {group,mesh,stats};
}
