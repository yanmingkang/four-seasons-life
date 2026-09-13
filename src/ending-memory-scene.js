import * as THREE from 'three';
import {createLiuKanshan} from './mascot-3d.js';
import {pixelTexture} from './pastoral-buildings.js';
import {applyReferenceSurface} from './reference-surfaces.js';

// Authored, editable geometry using the game's actual mascot and materials.
// These are symbolic ending illustrations, not invented events in a save.
export const ENDING_ART_THEMES=Object.freeze(['cover','accompany','communicate','grow','rest']);
const PALETTES={
  cover:{background:'#cdd8c7',wall:'#dbe0c8',wood:'#b1946c',accent:'#769779'},
  accompany:{background:'#d6c8b8',wall:'#e7d6bd',wood:'#a78463',accent:'#b79579'},
  communicate:{background:'#c8d8d4',wall:'#d8e4d7',wood:'#a58a67',accent:'#789b91'},
  grow:{background:'#d0d9c4',wall:'#dedfc6',wood:'#af9266',accent:'#839963'},
  rest:{background:'#bfcfd4',wall:'#d4dfdb',wood:'#9b8970',accent:'#839c9d'},
};

export function createEndingMemoryScene({theme='cover',textured=true}={}){
  if(!ENDING_ART_THEMES.includes(theme))throw new RangeError('Unknown ending art theme');
  const palette=PALETTES[theme],scene=new THREE.Scene();scene.name=`ending-illustration-${theme}`;
  scene.background=new THREE.Color(palette.background);scene.userData.artRole='symbolic-ending-illustration';
  const materials=new Map(),textures=new Map(),root=new THREE.Group();root.name='ending-diorama';scene.add(root);
  function material(color,pattern){
    const key=`${color}/${pattern||''}`;if(materials.has(key))return materials.get(key);
    let map=null;if(textured&&pattern){if(!textures.has(pattern)){const t=pixelTexture(pattern).clone();t.needsUpdate=true;textures.set(pattern,t);}map=textures.get(pattern);}
    const mat=new THREE.MeshStandardMaterial({color,roughness:pattern?.94:.82,map});materials.set(key,mat);return mat;
  }
  function mesh(parent,name,geometry,color,p=[0,0,0],pattern){
    const m=new THREE.Mesh(geometry,material(color,pattern));m.name=name;m.position.set(...p);m.castShadow=true;m.receiveShadow=true;
    if(textured&&pattern&&geometry.type==='BoxGeometry')applyReferenceSurface(m,pattern,{shared:false});parent.add(m);return m;
  }
  const box=(parent,name,size,color,p,pattern)=>mesh(parent,name,new THREE.BoxGeometry(...size),color,p,pattern);
  const cylinder=(parent,name,r1,r2,h,color,p)=>mesh(parent,name,new THREE.CylinderGeometry(r1,r2,h,16),color,p);
  const sphere=(parent,name,size,color,p)=>{const m=mesh(parent,name,new THREE.SphereGeometry(1,16,10),color,p);m.scale.set(...size);return m;};
  const group=(parent,name,p=[0,0,0],yaw=0)=>{const g=new THREE.Group();g.name=name;g.position.set(...p);g.rotation.y=yaw;parent.add(g);return g;};
  function rod(parent,name,from,to,r,color){const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),d=b.clone().sub(a);const m=cylinder(parent,name,r,r,d.length(),color,a.clone().add(b).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m;}
  function plant(parent,p,scale=1,flower=false){
    const g=group(parent,'potted-living-plant',p);g.scale.setScalar(scale);cylinder(g,'terracotta-pot',.38,.28,.64,'#b08060',[0,.32,0]);cylinder(g,'visible-soil',.33,.33,.035,'#695f43',[0,.65,0]);
    for(let i=0;i<5;i++){const a=i*2.4,y=.95+i*.15,x=Math.sin(a)*.3,z=Math.cos(a)*.25;rod(g,'green-stem',[0,.64,0],[x,y,z],.025,'#577b53');const leaf=sphere(g,'leaf',[.26,.07,.38],i%2?'#8da46a':'#6a905e',[x,y,z]);leaf.rotation.set(.3,a,.2);}
    if(flower)for(let i=0;i<5;i++){const a=i*Math.PI*.4;sphere(g,'spring-petal',[.15,.08,.15],'#edb9b1',[Math.sin(a)*.17,1.75,Math.cos(a)*.17]);}return g;
  }
  function mug(parent,p,color='#efe6cd'){
    const g=group(parent,'ceramic-mug',p);cylinder(g,'mug',.15,.13,.29,color,[0,.145,0]);cylinder(g,'tea',.122,.122,.008,'#7a604b',[0,.294,0]);mesh(g,'handle',new THREE.TorusGeometry(.1,.026,8,16),color,[.16,.16,0]);return g;
  }
  function books(parent,p,count=3){const g=group(parent,'small-library',p);for(let i=0;i<count;i++){const b=group(g,'closed-book',[0,i*.14,0],i%2?.08:-.04);box(b,'paper-block',[.88,.1,.6],'#f3edda',[0,.05,0]);for(const y of [0,.105])box(b,'book-cover',[.94,.025,.64],['#77968a','#a88968','#c5aa7e','#889ca7'][i%4],[0,y,0]);}return g;}
  function notebook(parent,p,scale=1,yaw=0){
    const g=group(parent,'open-blank-method-notebook',p,yaw);g.scale.setScalar(scale);
    box(g,'cloth-book-cover',[1.58,.065,1.14],'#648476',[0,0,0],'fabric');
    for(const sign of [-1,1]){const leaf=group(g,'open-paper-leaf',[sign*.38,.065,0]);leaf.rotation.z=-sign*.07;box(leaf,'unwritten-paper',[.74,.075,1.03],'#fcf6df',[0,0,0]);}
    box(g,'binding-fold',[.035,.1,1.05],'#d4c5a6',[0,.06,0]);box(g,'ribbon-bookmark',[.07,.014,.45],'#b98768',[.16,.055,.64]);return g;
  }
  function desk(parent,p,{width=3.5,height=1.4,depth=1.8}={}){
    const g=group(parent,'writing-desk',p);box(g,'wood-tabletop',[width,.14,depth],palette.wood,[0,height,0],'wood');box(g,'table-apron',[width-.2,.22,depth-.2],'#8b7657',[0,height-.15,0]);
    for(const x of [-1,1])for(const z of [-1,1])box(g,'table-leg',[.13,height,.13],'#716951',[x*(width/2-.2),height/2,z*(depth/2-.2)]);return g;
  }
  function chair(parent,p,yaw=0,color=palette.accent){
    const g=group(parent,'cushioned-chair',p,yaw);box(g,'chair-seat',[1.15,.16,1.12],'#86755d',[0,.83,0]);box(g,'seat-cushion',[1.04,.16,1.01],color,[0,.97,0],'fabric');box(g,'chair-back',[1.15,1.22,.16],'#8c7b63',[0,1.45,-.48]);box(g,'back-cushion',[1.02,1.08,.1],color,[0,1.45,-.36],'fabric');
    for(const x of [-.47,.47])for(const z of [-.42,.42])box(g,'chair-leg',[.11,.79,.11],'#6c6557',[x,.4,z]);return g;
  }
  function lamp(parent,p,{height=3.2}={}){
    const g=group(parent,'warm-reading-lamp',p);cylinder(g,'lamp-base',.36,.39,.08,'#736d58',[0,.06,0]);rod(g,'lamp-stem',[0,.1,0],[0,height,0],.045,'#777359');
    cylinder(g,'cream-lamp-shade',.3,.55,.55,'#efdab0',[0,height,0]);cylinder(g,'warm-lamp-interior',.46,.46,.025,'#ffe9b2',[0,height-.28,0]);
    const glow=new THREE.PointLight('#ffd7a0',3.3,5,1.8);glow.position.set(0,height-.36,0);g.add(glow);return g;
  }
  function window(parent,p,size=[3.2,2.4]){
    const g=group(parent,'daylight-window',p);box(g,'wood-window-frame',[size[0]+.22,size[1]+.22,.16],'#f2e9cf');box(g,'blue-window-glass',[size[0],size[1],.055],theme==='rest'?'#8faebb':'#b6cfd1',[0,0,.105]);
    box(g,'window-mullion',[.07,size[1],.08],'#f0e6cc',[0,0,.15]);box(g,'window-crossbar',[size[0],.07,.08],'#f0e6cc',[0,0,.15]);box(g,'wood-window-sill',[size[0]+.4,.12,.42],palette.wood,[0,-size[1]/2-.08,.12],'wood');return g;
  }
  function actor(p,yaw=.35,pose='calm'){
    const a=createLiuKanshan();a.position.set(...p);a.rotation.y=yaw;root.add(a);a.userData.endingPose=pose;
    const rig=a.userData.rig;rig.head.rotation.x=.03;if(pose==='thinking'){rig.arms[0].joint.rotation.x=-1.15;rig.arms[0].joint.rotation.z=-.58;rig.head.rotation.y=-.16;}
    if(pose==='welcome'){rig.arms[1].joint.rotation.z=1.7;rig.arms[1].joint.rotation.x=-.18;}
    return a;
  }
  box(root,'thick-diorama-foundation',[9,.24,7],'#948771',[0,-.16,0],'stone');
  for(let i=0;i<18;i++)box(root,'individual-wood-floor-board',[.494,.06,6.95],i%3?palette.wood:'#beab8b',[-4.24+i*.5,-.01,0],'wood');
  if(theme!=='cover'){
    box(root,'back-room-wall',[9,4.5,.17],palette.wall,[0,2.23,-3.43],'plaster');box(root,'short-left-room-wall',[.17,4.5,3.7],palette.wall,[-4.44,2.23,-1.66],'plaster');
    box(root,'wood-back-skirting',[8.94,.13,.1],'#a19172',[0,.09,-3.3],'wood');box(root,'wood-wall-cap',[9,.12,.23],'#b3a07a',[0,4.5,-3.43],'wood');
  }
  if(theme==='cover'){
    // Four distinct miniature seasons around one shared book. No game location
    // is claimed here; the cover is a symbolic table of memories.
    box(root,'garden-grass-base',[8.94,.09,6.94],'#96ad76',[0,.055,0]);
    for(const [i,color] of ['#b7c88c','#8eae78','#bca16f','#dce4df'].entries()){
      const x=i%2?2.9:-2.9,z=i<2?-1.8:1.8;
      box(root,`season-${i}-garden-plot`,[2.5,.15,2.25],color,[x,.14,z]);
      if(i===0){plant(root,[x-.9,.23,z+.85],1.28,true);plant(root,[x+.6,.23,z-.4],.7,true);}
      if(i===1){plant(root,[x,.23,z],1.45);plant(root,[x+.6,.23,z+.55],.75);}
      if(i===2){const tree=group(root,'autumn-amber-tree',[x,.22,z]);rod(tree,'tree-trunk',[0,0,0],[0,1.35,0],.1,'#876644');for(let j=0;j<5;j++)sphere(tree,'autumn-leaf-canopy',[.5,.56,.47],j%2?'#bc955a':'#d5b16b',[Math.sin(j*2.4)*.38,1.45+j*.1,Math.cos(j*2.4)*.3]);}
      if(i===3){for(let j=0;j<3;j++){const t=mesh(root,'winter-snow-pine',new THREE.ConeGeometry(.43-j*.07,.8,8),'#e2e8df',[x,.7+j*.45,z]);}sphere(root,'snow-stone',[.45,.16,.27],'#edf0e3',[x+.6,.32,z+.6]);}
    }
    desk(root,[.1,0,.6],{width:3.2,height:1.2,depth:1.7});notebook(root,[.1,1.32,.62],1.5,-.08);mug(root,[1.29,1.29,.7]);
    actor([-1.45,.16,-.5],.2,'welcome');books(root,[1.1,.2,-1.45],3);
    for(let i=0;i<4;i++)box(root,'garden-stepping-stone',[.62,.045,.46],'#ddceb0',[-.8+i*.57,.14,2.7+(i%2)*.16],'stone');
  }else if(theme==='accompany'){
    window(root,[-2.25,2.8,-3.26],[2.4,2.3]);chair(root,[-2.7,0,.15],.35,'#b79779');chair(root,[2.5,0,.3],-.48,'#8d9b7d');
    desk(root,[-.4,0,1.4],{width:2.5,height:.78,depth:1.48});notebook(root,[-.4,.89,1.4],1.1,.08);mug(root,[-1.3,.87,1.4]);mug(root,[.5,.87,1.38],'#91a59b');
    actor([.45,0,-.65],.45,'thinking');lamp(root,[3.25,0,-2.15]);plant(root,[-3.3,0,-2.4],1.15);
    box(root,'folded-shared-blanket',[.75,.12,.64],'#d3b69b',[-2.65,1.13,.3],'fabric');books(root,[3,0,1.5],3);
  }else if(theme==='communicate'){
    window(root,[-2.3,2.95,-3.27],[2.5,2.25]);desk(root,[.7,0,.25],{width:4,height:1.35,depth:1.9});notebook(root,[.8,1.47,.43],1.5,.03);mug(root,[2.22,1.44,.42]);
    const pen=rod(root,'single-planning-pencil',[1.5,1.47,-.04],[1.98,1.47,-.36],.028,'#bd9968');actor([-1.77,0,.2],.45,'thinking');chair(root,[1.3,0,-1.35],.02);plant(root,[3.25,0,-2.35],1.4);
    const board=group(root,'blank-conversation-board',[.85,2.96,-3.2]);box(board,'board-frame',[2.5,1.65,.13],'#ad916d');box(board,'unwritten-planning-board',[2.32,1.47,.045],'#f1e8ce',[0,0,.09]);
    // Three quiet paper blocks suggest organizing a conversation, not text.
    for(let i=0;i<3;i++)box(board,'unwritten-note',[.48,.49,.025],['#d8c28b','#adbea4','#b7c9ca'][i],[-.72+i*.72,.05,.13]);
    books(root,[-3.15,0,-1.8],4);box(root,'woven-desk-rug',[4.5,.03,2.2],'#a6baac',[.55,.035,1.28],'fabric');
  }else if(theme==='grow'){
    window(root,[1.6,2.82,-3.27],[3.6,2.4]);
    const shelf=group(root,'open-bookcase',[-3.3,0,-2.15]);for(const x of [-.7,.7])box(shelf,'wood-bookcase-upright',[.14,3.8,.86],'#9b845e',[x,1.9,0],'wood');for(let i=0;i<4;i++){box(shelf,'wood-bookcase-shelf',[1.55,.1,.9],palette.wood,[0,.28+i*1.13,0],'wood');if(i<3)books(shelf,[0,.35+i*1.13,0],3-i%2);}
    desk(root,[.4,0,.4],{width:3.4,height:1.22,depth:1.65});notebook(root,[-.1,1.34,.55],1.25,.12);plant(root,[1.45,1.3,.25],.62);
    actor([-1.55,0,.95],.18);plant(root,[3.12,0,-1.65],1.45);books(root,[.95,0,2.0],4);
    box(root,'growth-window-seat',[3.8,.16,.92],'#a49c74',[1.4,.68,-2.6],'wood');for(const x of [-.05,2.8])box(root,'window-seat-leg',[.12,.67,.65],'#817457',[x,.33,-2.6]);
  }else{
    window(root,[-1.4,2.86,-3.27],[3.8,2.45]);chair(root,[-2.25,0,.45],.32,'#889c9b');
    box(root,'folded-reading-blanket',[.85,.13,.7],'#cfbd9d',[-2.22,1.14,.63],'fabric');desk(root,[.05,0,1.3],{width:1.7,height:.77,depth:1.35});mug(root,[.02,.87,1.2]);books(root,[.28,.87,1.6],1);
    actor([.55,0,-.1],.28);lamp(root,[2.9,0,-2.2],{height:3.4});plant(root,[-3.4,0,-1.95],1.25);plant(root,[2.9,0,1.65],.85);
    const rug=cylinder(root,'woven-round-rest-rug',2.5,2.5,.035,'#b4bca8',[-.3,.035,.8]);rug.scale.z=.78;
    box(root,'simple-blank-wall-print',[1.4,1.6,.07],'#b49c77',[2.55,2.77,-3.26]);box(root,'quiet-paper-print',[1.23,1.43,.03],'#e2dac4',[2.55,2.77,-3.21]);sphere(root,'abstract-print-circle',[.35,.35,.015],'#b2bd99',[2.55,2.92,-3.18]);
  }
  // Match scene-preview.js and cinematic-scenes-3d.js lighting, exposure and
  // geometry-based pixel edges in the renderer, including the actual actor.
  scene.add(new THREE.HemisphereLight('#d9e8ef','#75694f',.88));
  const sun=new THREE.DirectionalLight(theme==='rest'?'#e1edf0':'#ffe5b8',2.8);sun.position.set(-3,9,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-10,right:10,top:9,bottom:-9});sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;sun.shadow.radius=3;scene.add(sun);
  const rim=new THREE.DirectionalLight('#f9e0b4',.75);rim.position.set(4,5,-3);scene.add(rim);
  return {scene,dispose(){const geo=new Set(),mats=new Set();scene.traverse(o=>{if(o.geometry)geo.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])mats.add(m);});for(const g of geo)g.dispose();for(const m of mats)m.dispose();for(const t of textures.values())t.dispose();scene.clear();}};
}
