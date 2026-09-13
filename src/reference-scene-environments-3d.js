import * as THREE from 'three';
import {addReferenceInteriorDetails} from './reference-interior-details-3d.js';
import {addReferenceDepthScenes} from './reference-depth-scenes-3d.js';

// Architectural spaces reconstructed from the document references. Every wall,
// furnishing and landscape detail has depth; no reference image is a texture.
const names=['university-library','campus-recruitment-gym','urban-village-alley','office-meeting-corner','office-pantry','presentation-room','apartment-balcony','stairwell-landing','director-office','high-speed-rail-platform','incident-war-room','metro-street-entrance','cross-team-review-room','pan-fried-bun-shop','rental-bathroom','garden-break-terrace','delivery-auditorium','emergency-observation-room','city-observation-deck','airport-terminal-apron','night-food-courtyard','hotel-banquet-hall','traditional-family-teahouse','shared-rooftop','autumn-study','bookshop-salon','headhunter-lounge','financial-planning-lounge','red-brick-creative-lane','housing-transaction-hall','human-resources-office','underground-car-park','hospital-specialist-waiting','independent-studio','winter-apartment-home','arbitration-service-hall','closed-old-shop','snowy-open-air-hot-spring','winter-bud-park','four-season-star-palace'];
const outside=new Set([3,7,12,14,16,19,21,24,29,37,38,39,40]);
export const REFERENCE_SCENE_ENVIRONMENTS=Object.freeze(Object.fromEntries(names.map((name,i)=>[i+1,Object.freeze({name,space:outside.has(i+1)?'outdoor':i===9||i===19?'hybrid':'interior',openSides:['front','right']})])));

export function buildReferenceSceneEnvironment({root,cell,box,cyl,ball,rod,mesh,group,chair,desk,plant,document,actor,actors,createCompanion}){
  cell=Number(cell);const spec=REFERENCE_SCENE_ENVIRONMENTS[cell];if(!spec)return null;
  const g=group(root,`reference-space-${spec.name}`),winter=cell>=31,autumn=cell>=21&&cell<=30,night=[7,11,19,21,24,32,40].includes(cell);
  const B=(name,size,color,p,r,extra)=>box(g,name,size,color,p,r,extra);
  const C=(name,top,bottom,h,color,p,r,extra)=>cyl(g,name,top,bottom,h,color,p,r,extra);
  const S=(name,size,color,p)=>ball(g,name,size,color,p);
  const R=(name,a,b,r,color)=>rod(g,name,a,b,r,color);
  const wood=autumn?'#9f6e44':'#ab8864',leaf=winter?'#53776c':autumn?'#d39339':'#6e9d58';
  B('scene-solid-foundation',[12,.32,9],outside.has(cell)?'#828d78':'#847d72',[0,-.2,0]);
  const floor=cell===15?'#47747a':cell===32?'#556570':outside.has(cell)?winter?'#d1dfdf':'#b9b19a':cell===31?'#a0adb4':cell===18||cell===33?'#cadeda':wood;
  if([1,4,9,23,25,26,27,28,34,35].includes(cell)){
    // Long staggered timber boards give domestic rooms a different scale and
    // construction from the glazed tile used in clinics and washrooms.
    for(let x=0;x<24;x++)for(let z=0;z<6;z++){
      const start=-4.5+z*1.5+(x%2)*.75,end=Math.min(4.5,start+1.5);
      B('individual-wood-floor-board',[.493,.045,end-start-.012],(x+z)%5===0?new THREE.Color(floor).multiplyScalar(1.065).getHex():floor,[-5.75+x*.5,-.013,(start+end)/2]);
      if(z===0&&x%2)B('edge-cut-wood-floor-board',[.493,.045,.738],floor,[-5.75+x*.5,-.013,-4.125]);
    }
  }else for(let x=0;x<12;x++)for(let z=0;z<9;z++)B('individual-floor-tile',[.988,.045,.988],(x+z)%5===0?new THREE.Color(floor).multiplyScalar(1.055).getHex():floor,[-5.5+x,-.013,-4+z]);
  if(!outside.has(cell)){
    const wall=cell===15?'#aeac8e':cell===31?'#53657b':cell===11?'#745e47':cell===22?'#d4b27c':cell===27||cell===28?'#6f4e38':cell===33?'#d7e9e7':'#dfdac4';
    B('reference-back-wall',[12,4.7,.2],wall,[0,2.33,-4.45]);B('reference-left-wall',[.2,4.7,7.2],wall,[-6,2.33,-.9]);
    B('wall-baseboard',[11.9,.16,.13],wood,[0,.07,-4.28]);
  }
  function rail(name,x,z,width=10,y=0){for(let i=0;i<=width*2;i++)R(`${name}-baluster`,[x-width/2+i*.5,y,z],[x-width/2+i*.5,y+1.45,z],.025,'#698580');R(`${name}-handrail`,[x-width/2,y+1.45,z],[x+width/2,y+1.45,z],.062,'#9eac94');B(`${name}-curb`,[width,.16,.23],'#b6ad93',[x,y+.07,z]);}
  function glazing(x,z,width=6,height=3.5){B('glazed-window-reveal',[width+.18,height+.2,.14],wood,[x,height/2+.68,z]);B('dimensional-window-glass',[width,height,.025],night?'#234566':'#a7cccf',[x,height/2+.68,z+.09],null,{transparent:true,opacity:.56,roughness:.19,metalness:.13});for(let i=0;i<4;i++)B('window-mullion',[.055,height,.06],'#6e796f',[x-width/2+i*width/3,height/2+.68,z+.13]);B('window-sill',[width+.3,.15,.4],wood,[x,.62,z+.11]);}
  function skyline(z=-4.05){for(let i=0;i<15;i++){const h=.8+(i*7%11)*.22,x=-5.6+i*.8;B('distant-volumetric-city-tower',[.52,h,.38],i%2?'#38526b':'#49647d',[x,h/2+.13,z]);for(let y=.5;y<h;y+=.42)for(const dx of [-.13,.13])B('city-window-light',[.095,.13,.03],i%3?'#e8bd6d':'#a2cee0',[x+dx,y,z+.21],null,{emissive:i%3?'#e8bd6d':'#a2cee0',emissiveIntensity:.32});}}
  function bench(x,z,yaw=0){const a=group(g,'full-size-park-bench',[x,0,z],yaw);for(let i=0;i<4;i++)box(a,'wooden-seat-slat',[2.5,.08,.17],wood,[0,.75,-.28+i*.2]);for(const x of [-1.05,1.05]){box(a,'bench-foot',[.14,.72,.54],'#466858',[x,.36,0]);rod(a,'back-support',[x,.66,-.45],[x,1.66,-.45],.045,'#466858');}for(const y of [1.18,1.48])box(a,'bench-back-slat',[2.5,.22,.09],wood,[0,y,-.46]);return a;}
  const treeLeafGeometry=new THREE.IcosahedronGeometry(1,0);
  function tree(x,z,s=1){
    const a=group(g,'landscape-tree',[x,0,z]);a.scale.setScalar(s);
    cyl(a,'tree-planter',.68,.72,.23,'#8c9475',[0,.1,0]);rod(a,'sculpted-tree-trunk',[0,.1,0],[.05,2.35,0],.11,'#826b4f');
    for(let i=0;i<5;i++){
      const t=i*2.35,px=Math.sin(t)*.68,pz=Math.cos(t)*.55;
      rod(a,'branch',[0,1.1+i*.22,0],[px,2.1+i*.23,pz],.045,'#8a7353');
      if((!winter||cell===38)&&[16,23,25,26].includes(cell)){
        for(let j=0;j<11;j++){
          const angle=j*2.399+i,spread=.2+(j%3)*.15,lx=px+Math.sin(angle)*spread,ly=2.13+i*.15+(j%4)*.18,lz=pz+Math.cos(angle)*spread;
          const leaves=mesh(a,'tree-leaf-volume',treeLeafGeometry,(autumn?['#9a662c','#c58c33','#d2ab48']:['#496b3a','#668c3e','#8fa343','#799c4b'])[(i+j)% (autumn?3:4)],[lx,ly,lz]);
          leaves.scale.set(.33+(j%2)*.1,.23+(j%3)*.04,.35);leaves.rotation.set(.13*j,angle,.18*i);
          if(j%4===0)rod(a,'tree-fine-branch',[px,2.02+i*.19,pz],[lx,ly-.12,lz],.018,'#79623e');
        }
      }else if(!winter||cell===38)ball(a,'tree-leaf-volume',[.6,.6,.55],i%2?leaf:'#8a9e59',[px,2.37+i*.15,pz]);
      else for(let j=0;j<3;j++)ball(a,'early-spring-bud',[.07,.1,.07],cell===39?'#b5c989':'#ddd9c8',[px+j*.08,2.16+i*.23,pz]);
    }
    if(winter)cyl(a,'snow-at-tree-root',.65,.64,.05,'#e4ede7',[0,.25,0]);return a;
  }
  function bookshelf(x,z,width=2.3,height=3.8){B('wood-bookcase-back',[width,height,.16],'#835c3d',[x,height/2,z]);for(const dx of [-width/2,width/2])B('bookcase-upright',[.1,height,.62],wood,[x+dx,height/2,z+.22]);for(let k=0;k<5;k++){const y=.22+k*(height-.35)/4;B('book-shelf',[width,.1,.65],wood,[x,y,z+.25]);if(k<4)for(let i=0;i<Math.floor(width/.22)-1;i++){const h=.4+(i%3)*.085;B('individual-book',[.14,h,.4],['#839b80','#c4a36f','#976b52','#647f87'][i%4],[x-width/2+.2+i*.22,y+h/2+.06,z+.27],[0,0,i%6===0?.13:0]);}}}
  function laptop(x,y,z){B('laptop-keyboard',[.85,.035,.57],'#667981',[x,y,z]);B('laptop-display-frame',[.85,.53,.04],'#364d5a',[x,y+.28,z-.26],[-.13,0,0]);B('laptop-screen',[.74,.42,.025],'#8ec1cb',[x,y+.29,z-.224],[-.13,0,0]);for(let i=0;i<4;i++)B('screen-chart-stroke',[.42-i*.05,.018,.016],'#d8e4d7',[x-.07,y+.43-i*.09,z-.2]);}
  function lamp(x,z){R('garden-lamp-post',[x,0,z],[x,2.75,z],.06,'#657368');B('garden-lamp-housing',[.47,.61,.42],'#6e7464',[x,2.7,z]);B('warm-lantern-core',[.35,.43,.31],'#edce89',[x,2.7,z],null,{emissive:'#f2c974',emissiveIntensity:.48});C('lamp-roof',0,.38,.25,'#737860',[x,3.13,z]);}
  function snow(){for(let i=0;i<14;i++){const x=-5.3+i*.81;S('snow-edge-drift',[.53,.08,.28],'#eaf0e8',[x,.06,-3.95]);if(i%2===0)S('snow-side-drift',[.29,.07,.45],'#eaf0e8',[5.42,.06,-3.7+i*.52]);}}
  function tiledRoof(name,x,z,w=3,d=1.8,y=3.1){for(const side of [-1,1]){B(`${name}-roof-slope`,[w,.13,d/2+.25],'#566b70',[x,y,z+side*d/4],[side*.39,0,0]);for(let i=0;i<Math.floor(w/.27);i++)R(`${name}-individual-tile`,[x-w/2+i*.27,y+.11,z],[x-w/2+i*.27,y-.29,z+side*d/2],.053,'#6b7b7c');}R(`${name}-ridge`,[x-w/2-.12,y+.16,z],[x+w/2+.12,y+.16,z],.08,'#65787a');}
  const retained=Boolean({6:1,11:1,13:1,15:1,18:1,22:1,27:1,31:1}[cell]);
  if(retained){
    // These rooms retain the commissioned four-second story actors/props.
    if([6,13].includes(cell)){glazing(-3.6,-4.29,3.6,2.9);for(const x of [-3.4,.1,3.6]){B('suspended-meeting-light',[1.9,.1,.36],'#556969',[x,4.48,-.6]);B('meeting-light-diffuser',[1.75,.025,.31],'#f4edcd',[x,4.42,-.6],null,{emissive:'#ffedbc',emissiveIntensity:.6});}plant([-5.1,0,-3.2]);}
    if(cell===6){desk([-.1,0,.1],[2,1.42,1.7]);document([-.1,1.52,.1]);chair([-.4,0,-1.6]);}
    if(cell===11){B('architecture-planning-board',[4.3,2.55,.12],'#decaa4',[-3.35,2.77,-4.29]);for(let i=0;i<12;i++){const x=-4.9+i%4*.94,y=1.9+Math.floor(i/4)*.74;B('system-architecture-node',[.7,.43,.03],i%3?'#b5bd97':'#d1a275',[x,y,-4.21]);if(i%4<3)R('architecture-dependency',[x+.34,y,-4.18],[x+.6,y,-4.18],.014,'#8c7f61');}desk([-2.8,0,-1.4],[2.6,1.45,1.4],'#a78356');laptop(-3.2,1.56,-1.38);plant([-5.1,0,-2.7]);}
    if(cell===13){const t=root.children.find(o=>o.name==='table');if(t)t.visible=false;desk([-2,0,-.4],[1.85,1.45,4.4]);desk([2.15,0,-.4],[1.85,1.45,4.4]);for(const z of [-1.7,-.35,1]){chair([-3.35,0,z],Math.PI/2,'#50759d');chair([3.5,0,z],-Math.PI/2,'#50759d');document([-2,1.56,z]);document([2.15,1.56,z]);}actor.position.set(-.35,0,1.55);plant([0,0,-1.3],.7);}
    if(cell===15){B('aged-bathroom-door',[1.56,3.85,.13],'#536e5f',[-4.6,1.93,-4.26]);for(let i=0;i<10;i++)R('exposed-water-pipe',[-5.55,.45+i*.35,-4.21],[-4.95,.45+i*.35,-4.21],.032,'#807c69');R('shower-pipe',[-3.7,.25,-3.9],[-3.7,3.7,-3.9],.045,'#8d9788');R('shower-arm',[-3.7,3.7,-3.9],[-3.7,3.7,-3.37],.05,'#8d9788');C('shower-head',.19,.2,.06,'#93a293',[-3.7,3.64,-3.37]);B('mirror-strip-light',[2.4,.17,.19],'#e1cb94',[1.2,4.58,-4.15],null,{emissive:'#f2d9a0',emissiveIntensity:.6});for(const x of [.35,.8,1.65]){C('bathroom-bottle',.09,.09,.4,'#b3bc96',[x,1.92,-3.1]);C('bottle-pump',.045,.045,.08,'#dedcca',[x,2.16,-3.1]);}}
    if(cell===18){const old=root.getObjectByName('resting-companion');if(old)old.visible=false;const partner=createCompanion([1.5,1.15,-2],0);partner.rotation.x=Math.PI/2;partner.rotation.z=Math.PI;partner.scale.setScalar(.79);partner.name='resting-liu-kanyu';B('hospital-medical-cross-vertical',[.16,.64,.05],'#db735c',[4.1,3.66,-4.25]);B('hospital-medical-cross-horizontal',[.58,.16,.05],'#db735c',[4.1,3.66,-4.23]);glazing(-3.7,-4.3,3.45,2.45);B('hospital-privacy-curtain',[.08,3.5,2.5],'#a4c1c2',[4.35,2.4,-2.83]);}
    if(cell===22){for(const x of [-4.7,4.7]){C('hotel-fluted-column',.28,.32,4.5,'#e2c492',[x,2.2,-3.68]);C('column-capital',.42,.42,.17,'#b7975d',[x,4.4,-3.68]);}B('gold-banquet-frieze',[11.7,.2,.18],'#b99651',[0,4.44,-4.26]);for(const x of [-3.9,4.0]){B('hotel-sconce-bracket',[.19,.77,.18],'#a88951',[x,3.1,-4.14]);S('hotel-sconce-glow',[.25,.32,.16],'#e7ce95',[x,3.16,-3.97]);}}
    if(cell===27){glazing(-3.65,-4.27,3.8,3.1);B('headhunter-low-console',[2.65,.93,.62],'#885c3e',[-3.98,.48,-3.64]);for(const x of [-4.9,-4.1,-3.3])S('lounge-display-vase',[.16,.3,.16],'#c1a474',[x,1.24,-3.63]);tree(-5.15,-2.4,.87);B('lounge-wall-art-frame',[2.2,1.23,.12],'#baa77c',[.45,3.45,-4.24]);B('lounge-abstract-art',[1.94,.99,.03],'#a39070',[.45,3.45,-4.15]);}
    if(cell===31){glazing(-3.6,-4.26,3.9,3.1);for(let y=1.02;y<4.15;y+=.15)B('hr-venetian-blind-slat',[3.88,.08,.07],'#899baa',[-3.6,y,-4.09],[.25,0,0]);B('hr-acoustic-wall-panel',[3.4,3.9,.07],'#42576b',[.4,2.3,-4.25]);for(let x=-1.25;x<2;x+=.13)B('acoustic-wall-rib',[.035,3.84,.03],'#71818c',[x,2.3,-4.18]);plant([-5.15,0,-1.4],.8);}
  }else switch(cell){
    case 1:
      for(const x of [-4.5,-1.7,1.1,3.9])bookshelf(x,-4.16,2.35);desk([-2.8,0,-1.2],[3,1.25,1.7]);chair([-2.8,0,.15],Math.PI);document([-2.7,1.36,-1.2]);B('library-arched-entry-pillars',[.5,4.1,.55],'#bc936b',[-5.2,2.05,.8]);plant([4.8,0,.5]);break;
    case 2:
      for(const x of [-4,0,4]){B('gym-roof-truss-column',[.27,4.7,.3],'#7297a0',[x,2.3,-3.9]);R('gym-steel-roof-truss',[x,4.55,-3.9],[x,4.55,2.4],.09,'#819b9a');}for(const x of [-3,0,3]){desk([x,0,-2.9],[2.3,1.1,1.1]);B('recruitment-booth-backdrop',[2.55,2,.12],x===0?'#5c9b94':'#97b5a4',[x,2.55,-3.62]);for(let i=0;i<3;i++)B('booth-poster-detail',[1.55-i*.23,.1,.035],'#e7e4c6',[x,3.15-i*.3,-3.53]);}B('gym-court-marking',[10,.01,.06],'#ede6c5',[0,.022,2.75]);break;
    case 3:
      for(const x of [-4.7,3.9]){B('village-residential-facade',[3.0,4.5,1.1],x<0?'#bfa582':'#a7a991',[x,2.25,-3.1]);for(let i=0;i<3;i++){B('village-window-recess',[.74,.88,.08],'#486872',[x-.86+i*.86,2.93,-2.51]);B('village-window-awning',[.94,.09,.66],'#8b7962',[x-.86+i*.86,3.44,-2.28],[.15,0,0]);}B('shop-striped-awning',[3.3,.11,1.1],'#b9a374',[x,1.87,-2.14],[.17,0,0]);B('air-conditioning-box',[.72,.46,.32],'#c8c5ab',[x+.84,4.1,-2.37]);}for(let i=0;i<4;i++)R('overhead-utility-cable',[-5.8,4.3,-3.3+i*.3],[5.5,4.05,-3.3+i*.3],.017,'#536268');tree(-5.1,.7,.86);plant([4.7,0,.6]);break;
    case 4:case 5:case 9:
      glazing(-2.9,-4.28,5.8,3.15);for(let i=0;i<7;i++)B('glass-office-partition-mullion',[.05,3.65,.08],'#778e91',[.75+i*.75,1.85,-3.35]);B('office-partition-glass',[4.6,3.6,.035],'#aec9c7',[3,1.9,-3.35],null,{transparent:true,opacity:.35});
      if(cell===5){B('pantry-cabinet',[5.4,1.24,1.1],'#b9bc9e',[-2, .62,-2.9]);B('pantry-stone-counter',[5.6,.12,1.25],'#e8e0c8',[-2,1.31,-2.86]);B('coffee-machine',[.69,.82,.58],'#5f706b',[-3.45,1.76,-2.82]);C('coffee-machine-knob',.08,.08,.04,'#c9ccb5',[-3.45,1.94,-2.5],[Math.PI/2,0,0]);B('break-room-fridge',[1.22,2.7,1.1],'#bbc5bc',[4.53,1.35,-2.54]);}else{desk([-2.6,0,-1.7],[3.7,1.3,1.85]);laptop(-2.7,1.42,-1.7);chair([-2.6,0,-3]);if(cell===9){bookshelf(4,-4.17,2.5);for(let y=1;y<4;y+=.19)B('director-office-blind',[5.5,.1,.05],'#b9c3b6',[-3,y,-4.03],[.2,0,0]);}}plant([4.85,0,.75]);break;
    case 7:
      skyline();rail('balcony-front',0,2.85,10);B('apartment-side-wall',[.2,4.2,3.5],'#9f9279',[-5.8,2.1,-1.7]);B('warm-open-apartment-door',[2.1,3.45,.18],'#c5a96d',[-4.15,1.74,-3.45],null,{emissive:'#e2b66b',emissiveIntensity:.25});for(const x of [-3.2,3.3])plant([x,0,2.15],.82);R('balcony-drying-line',[-5.4,3.75,-.5],[4.8,3.75,-.5],.023,'#aba88b');for(let i=0;i<3;i++)B('hanging-laundry-cloth',[1.25,1.65,.045],i%2?'#ceb58f':'#e7dec3',[-3.5+i*1.65,2.86,-.5]);actor.position.set(-2.1,0,1.23);break;
    case 8:
      B('stairwell-grey-fire-door',[2,3.6,.15],'#7e8c98',[-3.65,1.82,-4.18]);B('door-pushbar',[1.25,.1,.13],'#c6c8b9',[-3.65,1.67,-4.05]);for(let i=0;i<8;i++)B('full-size-stair-step',[4.1,.2*(i+1),.6],'#a8aba4',[2.05,.1*(i+1),2.9-i*.6]);for(const x of [.0,4.1]){R('stair-flight-handrail',[x,1.25,3.16],[x,2.65,-1.37],.065,'#9b805e');for(let i=0;i<8;i++)R('stair-flight-baluster',[x,.2*(i+1),2.9-i*.6],[x,1.33+i*.2,2.9-i*.6],.026,'#778e94');}B('upper-stair-landing',[4.1,1.6,2.25],'#969f9e',[2.05,.8,-2.7]);actor.position.set(-2.2,0,1.35);break;
    case 10:
      B('rail-platform-edge',[11.8,.2,.6],'#d8c776',[0,.12,-1.83]);B('blue-high-speed-train',[10.7,1.45,1.75],'#e4ece5',[.3,1.42,-3.05]);B('train-blue-stripe',[10.7,.2,1.81],'#407eae',[.3,1.19,-3.05]);for(let i=0;i<9;i++)B('train-passenger-window',[.74,.52,.065],'#4c849d',[-4.1+i*1.1,1.73,-2.14]);S('streamlined-train-nose',[1.2,.73,.88],'#e5ede7',[5.15,1.4,-3.05]);for(const x of [-5,0,5]){B('rail-station-steel-column',[.17,4.4,.17],'#7d9897',[x,2.2,-1.1]);R('rail-platform-canopy',[x,4.3,-4.1],[x,4.3,.1],.075,'#7d9897');}for(let i=0;i<3;i++){B('ticket-gate-body',[.55,1.2,1.3],'#8badac',[-4.3+i*.85,.6,.3]);B('gate-reader-light',[.33,.04,.27],'#8acac4',[-4.3+i*.85,1.23,.63]);}break;
    case 12:
      B('metro-entrance-rear-wall',[8,3.35,.5],'#c5c4a9',[0,1.7,-3.7]);for(const x of [-3.7,3.7])B('metro-entry-pillar',[.5,3.5,.5],'#899c93',[x,1.75,-2.5]);B('metro-blue-canopy',[8.5,.37,2.2],'#407f99',[0,3.45,-2.8]);for(let i=0;i<6;i++)B('descending-metro-step',[3.4,.12,.38],'#a5b4b0',[1.2,.1-i*.05,-1.3-i*.39]);rail('metro-railing',1.2,-1.1,3.8);tree(-4.9,-.6);lamp(4.85,-1.25);break;
    case 14:
      B('bun-shop-back',[9.5,3.8,.7],'#c9a876',[0,1.9,-3.7]);tiledRoof('bun-shop',0,-3.5,10,1.7,4.03);B('open-shop-service-window',[6.3,1.68,.13],'#7e6044',[0,2.25,-3.23]);B('bun-shop-counter',[6.8,1.13,1.13],'#b68046',[0,.59,-2.66]);for(let i=0;i<3;i++){desk([-3.8+i*3.5,0,.2],[1.6,.83,1.1]);chair([-4.1+i*3.5,0,1.1],Math.PI,'#a68053').scale.setScalar(.7);}for(const x of [-4.5,4.5]){C('red-shop-lantern',.24,.24,.58,'#bd6446',[x,3.08,-2.9]);plant([x,0,-1.2],.72);}break;
    case 16:
      tree(-4.9,-2.8,1.24);tree(4.4,-3,1.17);rail('garden-terrace',0,-3.9,10);for(let i=0;i<7;i++)plant([-4.5+i*1.5,0,-3.25],.63);bench(-2.7,-.5);const umbrella=mesh(g,'garden-parasol',new THREE.ConeGeometry(2.1,.65,8),'#e5d5a9',[-1.7,3.4,-1.35]);R('parasol-pole',[-1.7,0,-1.35],[-1.7,3.35,-1.35],.055,'#958362');break;
    case 17:
      B('auditorium-raised-stage',[9.4,.38,2.65],'#a8825f',[0,.19,-2.9]);B('auditorium-main-screen',[5.8,2.55,.15],'#a4c3c0',[0,2.73,-4.25]);for(const x of [-4.2,4.2]){B('stage-red-curtain',[1.0,4.4,.25],'#aa6251',[x,2.24,-3.98]);for(let i=0;i<5;i++)C('curtain-fold',.12,.12,4.3,'#bd725d',[x-.4+i*.2,2.22,-3.77]);}for(const z of [1.6,3])for(const x of [-4,-2.8,2.8,4])chair([x,0,z],0,'#8c7664');break;
    case 19:
      skyline();rail('observation-deck',0,-1.85,10.5);bench(-2.7,.8);for(const x of [-4.85,4.85])lamp(x,.05);for(let i=0;i<6;i++)plant([-4.3+i*1.7,0,-1.35],.51);break;
    case 20:{
      B('airport-glazed-curtainwall',[11.8,3.9,.06],'#b9d6d7',[0,2,-1.7],null,{transparent:true,opacity:.28,roughness:.15});for(let x=-5.7;x<6;x+=1.45)B('terminal-window-upright',[.055,4.2,.11],'#73949d',[x,2.13,-1.7]);B('apron-tarmac',[11.7,.065,2.55],'#87969b',[0,.035,-3.07]);for(let i=0;i<7;i++)B('runway-dashed-line',[.65,.015,.06],'#e5dbc0',[-4.2+i*1.4,.08,-3.95]);const plane=group(g,'three-dimensional-airliner',[1.45,.42,-3.12],-.16);S('apron-shrub',[.2,.2,.2],leaf,[-5.3,.25,-3.4]);mesh(plane,'aircraft-fuselage',new THREE.CapsuleGeometry(.24,3.5,6,16),'#e5ece7',[0,.36,0],[0,0,Math.PI/2]);box(plane,'main-aircraft-wings',[1.1,.07,3.2],'#d5e1dc',[0,.33,0],[0,-.18,0]);box(plane,'tail-wings',[.58,.045,1.18],'#6994b2',[-1.56,.45,0]);box(plane,'tail-fin',[.57,.66,.075],'#487da3',[-1.54,.78,0],[0,0,-.2]);for(const z of [-.69,.69])cyl(plane,'engine-nacelle',.14,.14,.52,'#c2d1cf',[.16,.18,z],[0,0,Math.PI/2]);for(let i=0;i<11;i++)box(plane,'airplane-passenger-window',[.09,.1,.025],'#3f6c87',[-1.35+i*.24,.43,.245]);bench(-3.25,.6);B('departure-display-frame',[3.2,.87,.11],'#385972',[-3.2,3.42,-1.48]);for(let i=0;i<4;i++)B('departure-display-flight-row',[2.55,.052,.025],i%2?'#c1d8d8':'#d6c889',[-3.2,3.69-i*.16,-1.4]);break;}
    case 21:
      B('food-courtyard-shopfront',[11.1,3.6,.6],'#ae7047',[0,1.82,-3.77]);tiledRoof('night-food-stall',0,-3.6,11.6,1.7,3.9);for(const x of [-4.4,-2.2,0,2.2,4.4]){C('red-food-court-lantern',.22,.22,.46,'#cf8150',[x,3.05,-2.8],null,{emissive:'#d58e49',emissiveIntensity:.35});desk([x,0,-1.6],[1.4,.89,1.1]);}R('festival-lamp-wire',[-5.6,3.5,.4],[5.6,3.5,.4],.017,'#72795e');for(let i=0;i<13;i++)S('hanging-festival-bulb',[.075,.1,.075],'#efcf88',[-5.2+i*.87,3.44,.4]);tree(-5.2,1.7,.76);break;
    case 23:
      for(const x of [-4.8,4.8])C('traditional-teahouse-timber-post',.17,.17,4.5,'#875c37',[x,2.25,-3.6]);B('teahouse-exposed-lintel',[10.4,.25,.3],'#89613e',[0,4.32,-3.6]);for(let x=-4.5;x<4.8;x+=.45)for(let y=1.7;y<4;y+=.45){B('tea-lattice-vertical',[.055,.44,.07],'#ae8654',[x,y,-4.12]);B('tea-lattice-horizontal',[.44,.055,.07],'#ae8654',[x,y,-4.12]);}desk([-2.5,0,-1.5],[2.8,.95,1.5]);bench(-2.5,-2.85,Math.PI);plant([4.5,0,.6],1.1);break;
    case 24:
      skyline();rail('rooftop-front',0,2.88,10.7);rail('rooftop-back',0,-2.48,10.7);B('rooftop-access-cabin',[2.15,2.8,1.25],'#b29672',[-4.18,1.4,-2.34]);tiledRoof('access-cabin',-4.18,-2.34,2.55,1.6,2.95);B('cabin-warm-door',[.87,2.1,.08],'#e4bf76',[-4.18,1.07,-1.67],null,{emissive:'#d9aa5f',emissiveIntensity:.45});C('rooftop-water-tank',.56,.56,1.65,'#8a989c',[4.2,.85,-2.76]);for(let i=0;i<5;i++)R('water-tank-rib',[3.64,.23+i*.32,-2.2],[4.76,.23+i*.32,-2.2],.025,'#b8c0b5');for(const x of [-3.8,3.8])plant([x,0,1.84],.75);createCompanion([.4,0,1.12],-.5);actor.position.set(-1.0,0,1.3);break;
    case 25:
      for(const x of [1,3.7])bookshelf(x,-4.1,2.55,4.2);glazing(-3.68,-4.25,3.3,3.2);desk([-2.7,0,-1.65],[3.5,1.25,1.8]);laptop(-2.8,1.37,-1.67);chair([-2.7,0,-3.15]);tree(-5.1,-3.9,.8);for(let i=0;i<4;i++)B('stacked-study-volume',[.85,.12,.68],i%2?'#bc9968':'#738f79',[-1.4,1.4+i*.13,-1.6]);break;
    case 26:
      bookshelf(-4.3,-4.1,2.5);bookshelf(3.8,-4.1,2.5);glazing(-.2,-4.26,4.9,2.65);for(const x of [-3.4,3.7]){desk([x,0,-1.1],[1.65,.97,1.3]);chair([x-.85,0,-1.05],Math.PI/2,'#a7845e');chair([x+.85,0,-1.05],-Math.PI/2,'#a7845e');}plant([4.9,0,1.3]);break;
    case 28:
      glazing(-3.55,-4.27,4,3.2);bookshelf(4.4,-4.11,2.1,3.9);B('lounge-ivory-rug',[6.3,.035,4.1],'#cbb494',[-1,.06,-.25]);for(const x of [-3.75,3.72]){B('planning-lounge-sofa-seat',[1.4,.43,2.8],'#ad8153',[x,.54,-1.05]);B('planning-lounge-sofa-back',[.3,1.33,2.8],'#96704b',[x+(x<0?-.55:.55),1.12,-1.05]);}plant([-5.1,0,-2.4]);break;
    case 29:
      for(const x of [-4.9,4.9]){B('creative-lane-brick-building',[2,4.15,3.1],'#9c684b',[x,2.08,-2.3]);for(let row=0;row<12;row++)for(let i=0;i<5;i++)B('creative-brick-mortar',[.32,.025,.045],'#bc9a76',[x-.78+i*.38+(row%2)*.14,.4+row*.3,-.72]);B('studio-arch-window',[1.18,1.66,.08],'#50786d',[x,2.53,-.69]);for(let i=0;i<8;i++)S('brick-wall-ivy',[.22,.16,.14],i%2?'#81954a':'#aa9b48',[x-.85+(i%3)*.75,3.1+(i%4)*.23,-.55]);}B('creative-lane-entry-lintel',[11.3,.61,.52],'#956e4c',[0,4.15,-3.16]);lamp(-3.2,-2);lamp(3.2,-2);bench(-4.05,1.5,Math.PI/2);break;
    case 30:
      for(let i=0;i<4;i++){const x=-4.1+i*2.7;B('housing-service-desk',[2.26,1.25,1.1],'#b79b70',[x,.65,-2.65]);B('service-window-blue-header',[2.25,.48,.09],'#4d829f',[x,3.13,-4.26]);B('service-counter-divider',[.07,1.5,1.12],'#a7c0b7',[x-1.2,1.9,-2.65]);laptop(x,1.35,-2.64);}for(const x of [-4.8,-3.75,-2.7])chair([x,0,1.2],0,'#6391a0');for(let i=0;i<4;i++){R('queue-barrier-post',[-4.5+i*1.5,0,-.1],[-4.5+i*1.5,1.0,-.1],.045,'#98a7a0');if(i<3)R('queue-barrier-belt',[-4.5+i*1.5,.94,-.1],[-3+i*1.5,.94,-.1],.033,'#8b6252');}break;
    case 32:
      for(const x of [-4.9,.1,4.9]){B('concrete-parking-column',[.65,4.5,.65],'#70818a',[x,2.24,-2.95]);for(let i=0;i<5;i++)B('parking-yellow-hazard-stripe',[.7,.15,.04],i%2?'#d5b44f':'#394e59',[x,.44+i*.18,-2.6],[0,0,.12]);}for(let i=0;i<4;i++){R('overhead-parking-pipe',[-5.8,4.05,-2.7+i*.54],[5.8,4.05,-2.7+i*.54],.075,i%2?'#855f56':'#718d99');B('parking-bay-line',[.075,.012,5.2],'#d3c98d',[-4.1+i*2.7,.03,.3]);}for(const x of [-3,3])B('parking-overhead-light',[2,.07,.26],'#b4d5cf',[x,4.33,-1.5],null,{emissive:'#9ccec7',emissiveIntensity:.4});break;
    case 33:
      glazing(-3.7,-4.27,3.5,3);B('specialist-consultation-door',[1.6,3.3,.12],'#87acb5',[.25,1.65,-4.21]);B('clinic-blue-sign',[3.5,.59,.1],'#5288ae',[.2,3.91,-4.21]);B('specialist-reception-counter',[3.3,1.38,1.02],'#a1bec1',[3.7,.72,-2.9]);for(const x of [-4.8,-3.55,-2.3])chair([x,0,-1.55],0,'#759dad');B('radiology-viewer-frame',[1.7,1.33,.14],'#527f9a',[4.1,3.05,-4.15]);B('radiology-viewer-lit-panel',[1.52,1.14,.03],'#234a6c',[4.1,3.05,-4.05]);for(let i=0;i<3;i++){const x=3.6+i*.5;C('radiology-skull',.12,.12,.015,'#a8d5df',[x,3.35,-4.01],[Math.PI/2,0,0]);R('radiology-spine',[x,3.2,-4],[x,2.72,-4],.022,'#96ccd8');for(let j=0;j<4;j++){R('radiology-rib-left',[x,3.12-j*.09,-4],[x-.12,3.07-j*.08,-4],.013,'#96ccd8');R('radiology-rib-right',[x,3.12-j*.09,-4],[x+.12,3.07-j*.08,-4],.013,'#96ccd8');}}break;
    case 34:
      for(let x=-5.7;x<5.7;x+=.32)B('studio-vertical-wood-cladding',[.24,4.5,.065],x%2?'#a48055':'#b78c5c',[x,2.23,-4.3]);glazing(-3.6,-4.17,3.8,3.2);desk([-3,0,-1.8],[3.5,1.24,1.7]);laptop(-3.2,1.37,-1.75);chair([-3.1,0,-3.1]);bookshelf(3.9,-4.05,2.2);plant([4.8,0,.8],1.1);break;
    case 35:
      glazing(-3.5,-4.26,3.7,3.15);B('home-full-sofa-base',[5,.5,1.45],'#bc9a73',[-1,.54,-2.62]);B('home-full-sofa-back',[5,1.08,.24],'#c2a581',[-1,1.17,-3.23]);for(const x of [-3.38,1.38])B('home-sofa-arm',[.27,.68,1.54],'#b1936d',[x,.9,-2.57]);for(let i=0;i<3;i++)B('home-fabric-cushion',[.9,.6,.2],i%2?'#d3b885':'#8eac94',[-2.6+i*1.5,1.15,-3.02],[0,0,.12*(i-1)]);bookshelf(4.4,-4.1,1.65,3.2);lamp(3.0,-2.85);createCompanion([.5,0,1.45],-.45);break;
    case 36:
      for(const x of [-4.6,4.6])B('arbitration-hall-pilaster',[.42,4.5,.33],'#bec9bb',[x,2.25,-4.22]);B('public-service-blue-band',[10,.59,.1],'#4f7d98',[0,3.84,-4.21]);for(const x of [-3,0,3]){B('arbitration-service-counter',[2.6,1.25,1],'#a8bcae',[x,.65,-2.7]);B('counter-clear-glass',[2.45,1.32,.055],'#b3d0c8',[x,2.33,-2.63],null,{transparent:true,opacity:.45});B('counter-glass-top',[2.55,.06,.07],'#809c93',[x,3.03,-2.63]);}for(const x of [-4.5,-3.25,-2])chair([x,0,.8],0,'#829f97');break;
    case 37:
      B('old-shop-timber-facade',[10.9,3.3,.75],'#876a4c',[0,1.64,-3.45]);tiledRoof('old-shop',0,-3.4,11.4,2.1,3.55);for(let i=0;i<9;i++){const x=-4.8+i*1.2;B('closed-wooden-shutter',[1.02,2.3,.12],i%2?'#9a7956':'#a1825e',[x,1.35,-3.01]);for(let j=0;j<4;j++)B('shutter-carved-panel',[.79,.05,.04],'#765d45',[x,.54+j*.55,-2.92]);}tree(-4.9,.25,1.2);snow();break;
    case 38:
      B('onsen-lodge',[9.4,3.18,1.2],'#8c6947',[0,1.62,-3.45]);tiledRoof('snowy-onsen-lodge',0,-3.55,10.2,2.6,3.55);for(const x of [-3.3,-1.1,1.1,3.3]){B('onsen-warm-window',[1.48,1.6,.09],'#e1b87a',[x,1.86,-2.78],null,{emissive:'#d6a35e',emissiveIntensity:.36});for(const dx of [-.46,0,.46])B('onsen-window-lattice',[.055,1.62,.04],'#87643f',[x+dx,1.86,-2.7]);}const pool=C('full-size-open-air-hot-spring',2.15,2.15,.1,'#85b8b5',[-1.8,.16,.65],null,{roughness:.16,metalness:.18,transparent:true,opacity:.88});pool.scale.z=.74;for(let i=0;i<19;i++){const a=i/19*Math.PI*2;S('onsen-natural-boulder',[.44,.3,.31],i%2?'#b4b6a5':'#899d91',[-1.8+Math.sin(a)*2.2,.2,.65+Math.cos(a)*1.7]);if(i%3===0)S('snow-on-onsen-rock',[.34,.065,.26],'#e8ede4',[-1.8+Math.sin(a)*2.2,.48,.65+Math.cos(a)*1.7]);}for(let i=0;i<5;i++){const steam=mesh(g,'onsen-steam-volume',new THREE.TorusGeometry(.31+i*.035,.015,5,22),'#dfeadf',[-3.2+i*.67,1.0+i*.12,.65],[Math.PI/2,0,0],{transparent:true,opacity:.55});steam.scale.z=.6;}tree(-5.15,-1.7,.94);tree(5.06,-2,1.05);snow();actor.position.set(-4.37,0,1.55);break;
    case 39:
      for(const x of [-3.3,.5])for(const z of [-3.15,-.9])R('park-pavilion-timber-post',[x,0,z],[x,3.15,z],.13,'#9d7f55');tiledRoof('park-pavilion',-1.4,-2.05,4.8,3.2,3.35);bench(-1.4,-2.67);tree(3.7,-2.3,1.43);tree(-5.1,1.3,.7);lamp(4.8,1.3);for(let i=0;i<7;i++)S('park-ground-rock',[.33,.13,.25],'#c0c4ae',[-4.3+i*1.4,.08,2.9]);snow();break;
    case 40:
      C('star-palace-ceremonial-dais',4.3,4.5,.17,'#c7bea2',[0,.08,-.45]);for(let i=0;i<9;i++){const a=Math.PI*.13+i/8*Math.PI*.74,x=Math.cos(a)*4.7,z=-Math.sin(a)*3.6;C('palace-marble-column',.18,.22,3.8,'#c8d3c6',[x,1.95,z]);C('palace-golden-capital',.29,.29,.16,'#c8a65a',[x,3.88,z]);S('column-star-light',[.13,.15,.13],'#e8d298',[x,4.12,z]);}const dome=mesh(g,'palace-open-hemisphere',new THREE.SphereGeometry(2.35,28,12,0,Math.PI*2,0,Math.PI/2),'#4d718c',[0,3.3,-2.6],null,{side:THREE.DoubleSide,metalness:.25});for(let i=0;i<8;i++){const a=i*Math.PI/4;R('dome-golden-meridian',[0,5.66,-2.6],[Math.cos(a)*2.35,3.3,-2.6+Math.sin(a)*2.35],.023,'#ceb96f');}mesh(g,'celestial-orbit',new THREE.TorusGeometry(1,.028,6,48),'#d7bc6a',[0,6.03,-2.6],[.5,.5,0]);for(let i=0;i<24;i++)S('star-sphere',[.032,.032,.032],'#ebd89b',[-5.5+(i*7%23)*.48,3.8+(i%6)*.43,-3.6]);for(let i=0;i<12;i++)plant([-5.3+i*.95,0,-3.9],.6);actor.position.set(-2.4,0,1.2);break;
  }
  // Keep the narrative focal props human sized and seated on their actual
  // surfaces; wider environmental props should not be blocked by a mini set.
  const vignette=root.getObjectByName(`event-${cell}-specific-props`);
  if([7,8,10,12,16,19,24,33,38,39].includes(cell)&&vignette){
    const focal=vignette.children[0];
    if([8,16,19,24,33,38,39].includes(cell))focal.visible=false;
  }
  if(cell===8&&vignette)vignette.children[1].visible=false;
  if(cell===20&&vignette){vignette.position.set(3.5,0,1.0);vignette.scale.setScalar(.96);const plane=g.getObjectByName('three-dimensional-airliner');plane.position.set(-.6,.63,-3.04);plane.scale.setScalar(1.22);}
  if(cell===13){
    for(const part of root.children){if(part.name==='unsigned-papers'&&part.position.x<.2)part.position.x=-2;if(part.name==='records-folder')part.position.x=-2;if(part.name==='upholstered-chair'&&(part.position.x===3.2||part.position.x===1))part.visible=false;}
    const people=root.children.filter(part=>part.name==='supporting-person');people[0].position.set(3.65,0,-1.5);people[1].position.set(-3.5,0,-1.7);
  }
  if(cell===18){const partner=root.getObjectByName('resting-liu-kanyu');partner.rotation.set(-Math.PI/2,0,0);partner.position.set(1.5,1.2,-.12);}
  if(cell===24){const partner=root.getObjectByName('liu-kanyu-companion');partner.position.set(.85,0,.95);partner.rotation.y=-.08;actor.position.set(-1.2,0,1.1);}
  if(cell===25&&vignette){
    // The notebooks belong on the study desk, not on an extra miniature desk
    // in the walking route. Keep the scene's named prop groups for inspection.
    vignette.position.set(-2.7,0,-1.65);vignette.scale.setScalar(1);
    vignette.children[0].visible=false;vignette.children[1].position.set(.65,-.02,.05);
    for(const part of vignette.children[1].children)if(part.name==='prop-desktop'||part.name==='prop-table-leg')part.visible=false;
  }
  if(cell===27){B('headhunter-woven-rug',[6.8,.028,4.9],'#bca486',[.3,.044,-.4]);for(const x of [-3.6,3.8]){B('lounge-armchair-seat',[1.27,.35,1.15],'#9c7454',[x,.7,.4]);B('lounge-armchair-back',[1.28,1.03,.25],'#a77d58',[x,1.31,-.08]);for(const dx of [-.56,.56])B('lounge-armrest',[.18,.39,1.2],'#936e4f',[x+dx,1.05,.4]);}}
  if([10,20].includes(cell)){const back=g.getObjectByName('reference-back-wall');back.visible=false;const left=g.getObjectByName('reference-left-wall');left.scale.z=.52;left.position.z=.6;}
  if(cell===38){
    if(vignette){const cabinetProps=vignette.children[1];for(const object of cabinetProps.children)if(object.name==='prop-desktop'||object.name==='prop-table-leg')object.visible=false;}
    B('onsen-changing-cabinet',[1.4,.89,1.03],'#ab875f',[1.87,.445,-.816]);for(let i=0;i<4;i++)B('onsen-locker-wood-slat',[1.25,.055,.055],'#80623f',[1.87,.16+i*.2,-.27]);B('folded-onsen-towel',[.55,.12,.46],'#e2dfc6',[2.23,.99,-.86]);
    const trees=[];g.traverse(object=>{if(object.name==='landscape-tree')trees.push(object);});
    for(const tree of trees){for(const part of tree.children)if(['tree-leaf-volume','branch'].includes(part.name))part.visible=false;for(let level=0;level<5;level++){const radius=1.0-level*.155,y=1.0+level*.43;mesh(tree,'snowy-conifer-needles',new THREE.ConeGeometry(radius,1.05,9),level%2?'#3d6a62':'#4d7a69',[0,y,0]);mesh(tree,'snow-on-pine-boughs',new THREE.ConeGeometry(radius*.72,.51,9),'#e3ece8',[0,y+.29,0]);}}
  }
  if(cell===27)for(const x of [-3.6,3.8])for(const dx of [-.48,.48])for(const z of [.02,.81])B('lounge-armchair-foot',[.11,.55,.11],'#795d42',[x+dx,.275,z]);
  if(cell===28)for(const x of [-3.75,3.72])for(const dx of [-.5,.5])for(const z of [-2.19,.09])B('planning-sofa-foot',[.12,.34,.12],'#795d42',[x+dx,.17,z]);
  if(cell===35)for(const x of [-3.0,1])for(const z of [-3.12,-2.13])B('living-room-sofa-foot',[.14,.3,.14],'#816547',[x,.15,z]);
  if([37,38,39].includes(cell)){const roof=cell===37?{x:0,z:-3.4,w:10.9,d:2.1,y:3.64}:cell===38?{x:0,z:-3.55,w:9.8,d:2.6,y:3.64}:{x:-1.4,z:-2.05,w:4.5,d:3.2,y:3.44};for(const side of [-1,1])B('snow-on-pitched-roof',[roof.w,.065,roof.d/2-.06],'#e6eeea',[roof.x,roof.y,roof.z+side*roof.d/4],[side*.39,0,0]);}
  g.traverse(part=>{if(part.name==='dimensional-window-glass'){part.material.opacity=.95;part.material.color.set(night?'#345876':'#9bc7d0');}});
  addReferenceDepthScenes({root,environment:g,cell,box,cyl,rod,mesh,group});
  addReferenceInteriorDetails({root,environment:g,cell,spec,box,cyl,ball,rod,mesh,group});
  root.userData.referenceEnvironment=spec.name;root.userData.space=spec.space;
  g.userData={referenceEnvironment:spec.name,volumetric:true,openSides:spec.openSides};
  return {environment:g,spec};
}
