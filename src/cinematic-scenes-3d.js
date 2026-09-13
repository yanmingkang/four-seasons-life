import * as THREE from 'three';
import {createLiuKanshan, resetLiuKanshan} from './mascot-3d.js';
import {buildReferenceSceneEnvironment} from './reference-scene-environments-3d.js';
import {pixelTexture,pixelSurfaceTexture} from './pastoral-buildings.js';
import {applyReferenceSurface} from './reference-surfaces.js';
import {batchReferenceSceneEnvironment} from './reference-scene-batch.js';
import {addReferenceScenePopulation} from './reference-scene-population.js';

// The same dimensional character used on the board. No sprites, DOM captures,
// text textures, generated character art, or choice-result reenactments.
export const CINEMATIC_THEMES=Object.freeze(['presentation','incident','review','home','care','banquet','offer','departure']);
const CELL_THEME={6:'presentation',11:'incident',13:'review',15:'home',18:'care',22:'banquet',27:'offer',31:'departure'};
const PREVIEW_THEME={1:'review',2:'presentation',3:'home',4:'review',5:'banquet',7:'home',8:'departure',9:'review',10:'departure',12:'incident',14:'banquet',16:'home',17:'presentation',19:'incident',20:'departure',21:'banquet',23:'banquet',24:'home',25:'home',26:'review',28:'offer',29:'review',30:'offer',32:'departure',33:'care',34:'offer',35:'home',36:'review',37:'offer',38:'home',39:'home',40:'presentation'};
// Props follow events.js scene text. Eight commissioned scenes retain their
// original geometry; the other 32 add a dedicated dimensional scene vignette.
export const CELL_SCENE_PROPS=Object.freeze(Object.fromEntries(Object.entries({
  1:['thesis-books','graduation-backpack'],2:['recruitment-booth','application-folder'],3:['moving-writing-desk','moving-carton'],4:['meeting-notebook','missed-date-card'],5:['milk-tea','shortcut-notes'],6:['presentation-screen','waiting-microphone'],7:['waiting-phone','hanging-laundry'],8:['fire-door','stairwell-steps'],9:['review-work-orders','venetian-blinds'],10:['rolling-suitcase','train-gate'],11:['server-rack','fault-monitor'],12:['hot-oden','metro-exit'],13:['dependency-whiteboard','unsigned-papers'],14:['steaming-buns','alley-cat'],15:['uncapped-toothpaste','water-on-counter'],16:['outdoor-bench','resource-planner'],17:['project-stage','delivery-display'],18:['observation-bed','waiting-work-phone'],19:['observation-railing','invitation-phone'],20:['travel-suitcase','paired-calendars'],21:['birthday-cake','charcoal-grill'],22:['round-banquet-table','business-card'],23:['family-tea-set','shared-budget'],24:['rooftop-railing','paired-stools'],25:['study-lamp','method-notebooks'],26:['salon-display-board','case-portfolio'],27:['unsigned-papers','unclaimed-pen'],28:['budget-calculator','planning-ledger'],29:['brick-ivy-wall','collaboration-plan'],30:['house-scale-model','queue-ticket-machine'],31:['open-handover-box','unsigned-papers'],32:['parked-car-front','car-radio'],33:['waiting-area-bench','care-calendar'],34:['consulting-casebook','scope-contract'],35:['warm-teapot','living-room-sofa'],36:['service-window','record-timeline'],37:['empty-shop-window','startup-ledger'],38:['hot-spring-stones','muted-phone'],39:['spring-bud-tree','park-bench'],40:['four-season-keepsakes','journey-scroll'],
}).map(([cell,props])=>[cell,Object.freeze(props)])));
export function resolveCinematicTheme(eventOrId){
  if(CINEMATIC_THEMES.includes(eventOrId?.theme))return eventOrId.theme;
  const cell=Number(typeof eventOrId==='number'?eventOrId:eventOrId?.cell??eventOrId?.number??String(eventOrId?.id??eventOrId??'').replace('cell-',''));
  if(CELL_THEME[cell])return CELL_THEME[cell];
  if(PREVIEW_THEME[cell])return PREVIEW_THEME[cell];
  const place=String(eventOrId?.location??'');
  if(/医院|急诊|输液|病/.test(place))return 'care';
  if(/家|合租|小楼|厨房|卫生间|阳台/.test(place))return 'home';
  if(/餐|宴|酒|校友|咖啡|茶/.test(place))return 'banquet';
  if(/猎头|合同|客户|会客/.test(place))return 'offer';
  if(/人事|离职|工作室/.test(place))return 'departure';
  return ['presentation','review','home','banquet'][Math.max(0,(cell||1)-1)%4];
}
const smooth=(a,b,t)=>{const p=THREE.MathUtils.clamp((t-a)/(b-a),0,1);return p*p*(3-2*p);};

/** Reusable 3D event room. update accepts seconds on a pausable/deterministic clock. */
export function createCinematicScene3D({theme='presentation',cell=6,seed=0,cameraMotion=true}={}){
  if(!CINEMATIC_THEMES.includes(theme))theme=resolveCinematicTheme({cell});
  const scene=new THREE.Scene();scene.name=`cinematic-${theme}`;
  const night=[7,11,19,21,24,32,40].includes(Number(cell))||theme==='care',warm=['home','banquet','offer'].includes(theme);
  scene.background=new THREE.Color(night?'#243442':Number(cell)>=31?'#c6d9df':warm?'#ddcdb3':'#ccd8cf');
  const camera=new THREE.PerspectiveCamera(36,16/9,.1,80);
  const materials=new Map(),geometries=new Set(),geometryCache=new Map(),surfaceGeometries=new Map(),textures=new Map(),actors=[],moving=[];
  // Most joinery, book spines and fixture parts repeat. Keep one geometry for
  // each size within this disposable room rather than allocating it per mesh.
  const shape=(key,create)=>{if(!geometryCache.has(key))geometryCache.set(key,create());return geometryCache.get(key);};
  function sceneTexture(pattern,channel='color'){
    const key=`${pattern}:${channel}`;
    if(!textures.has(key)){
      const source=channel==='color'?pixelTexture(pattern):pixelSurfaceTexture(pattern,channel);let map=source.clone();
      if(pattern==='wood'){
        // Joinery already models each plank and its seam. Furniture uses a
        // continuous sawn grain rather than the exterior's cladding joints.
        const size=128,data=new Uint8Array(size*size*4);
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
          const grain=Math.sin(y*.83+Math.sin(x*.061)*1.7)+.44*Math.sin(y*2.6+Math.sin(x*.13)*2),i=(y*size+x)*4;
          const shade=Math.round((channel==='color'?231:channel==='height'?174:208)+grain*(channel==='height'?13:9)+((x*13+y*7)%5));data[i]=data[i+1]=data[i+2]=Math.max(0,Math.min(255,shade));data[i+3]=255;
        }
        map=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);map.colorSpace=channel==='color'?THREE.SRGBColorSpace:THREE.NoColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.magFilter=THREE.NearestFilter;map.minFilter=THREE.LinearMipmapLinearFilter;map.generateMipmaps=true;map.anisotropy=4;
      }
      map.needsUpdate=true;map.name=`original-pixel-scene-${pattern}-${channel}`;textures.set(key,map);
    }return textures.get(key);
  }
  function mat(color,extra={}){const {pattern,...settings}=extra,key=color+JSON.stringify(settings)+(pattern||'');if(!materials.has(key)){const map=pattern?sceneTexture(pattern):null;materials.set(key,new THREE.MeshStandardMaterial({color,roughness:pattern?.94:.76,map,bumpMap:pattern?sceneTexture(pattern,'height'):null,roughnessMap:pattern?sceneTexture(pattern,'roughness'):null,bumpScale:pattern==='plaster'?.016:pattern==='wood'?.026:.038,...settings}));}return materials.get(key);}
  function mesh(parent,name,g,color,p=[0,0,0],r=[0,0,0],extra={}){
    let pattern;
    if(!extra.transparent&&!extra.emissive&&!/snow/.test(name)){
      if(/roof-slope|house-roof/.test(name))pattern='roof';else if(/brick-building|red-brick/.test(name))pattern='brick';else if(/woven|rug|upholstery|sofa|towel|cloth|curtain|blanket|cushion|napkin|parasol/.test(name))pattern='fabric';else if(/wood|timber|bookcase|shelf$|tabletop|desktop|cabinet|vanity|lectern|shutter|lattice|bench-slat|armrest|drawer|box-side/.test(name)&&!name.endsWith('-leg'))pattern='wood';else if(/step|stone|boulder|foundation|pavement/.test(name))pattern='stone';else if(/floor|wall|pillar|seat|chair-back/.test(name))pattern='plaster';
    }
    pattern=extra.pattern??pattern;
    const o=new THREE.Mesh(g,mat(color,{pattern,...extra}));o.name=name;o.position.set(...p);o.rotation.set(...(r??[0,0,0]));o.castShadow=true;o.receiveShadow=true;
    if(pattern&&g.type==='BoxGeometry'){
      const key=`${g.uuid}:${pattern}`;
      if(surfaceGeometries.has(key)){o.geometry=surfaceGeometries.get(key);o.userData.surfacePattern=pattern;}
      else{o.geometry=g.clone();applyReferenceSurface(o,pattern,{shared:false});surfaceGeometries.set(key,o.geometry);geometries.add(o.geometry);}
    }
    parent.add(o);geometries.add(g);return o;
  }
  const box=(parent,name,size,color,p,r,extra)=>mesh(parent,name,shape(`box:${size}`,()=>new THREE.BoxGeometry(...size)),color,p,r,extra);
  const cyl=(parent,name,top,bottom,height,color,p,r,extra)=>mesh(parent,name,shape(`cylinder:${top},${bottom},${height}`,()=>new THREE.CylinderGeometry(top,bottom,height,20)),color,p,r,extra);
  function ball(parent,name,size,color,p){const o=mesh(parent,name,shape('sphere',()=>new THREE.SphereGeometry(1,20,12)),color,p);o.scale.set(...size);return o;}
  function group(parent,name,p=[0,0,0],yaw=0){const g=new THREE.Group();g.name=name;g.position.set(...p);g.rotation.y=yaw;parent.add(g);return g;}
  function rod(parent,name,from,to,r,color){const a=new THREE.Vector3(...from),b=new THREE.Vector3(...to),d=b.clone().sub(a);const o=cyl(parent,name,r,r,d.length(),color,a.clone().add(b).multiplyScalar(.5).toArray());o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return o;}
  const root=group(scene,'room');
  box(root,'thick-room-foundation',[12,.28,9],'#857866',[0,-.19,0]);
  for(let i=0;i<24;i++)box(root,'individual-floor-board',[.488,.07,8.94],night?(i%3?'#6f8587':'#849699'):(i%3?'#c5ad8a':'#d0b896'),[-5.75+i*.5,-.015,0]);
  const wall=night?'#677f89':theme==='banquet'?'#e3cdaa':theme==='home'?'#c7d7c4':'#dce4d9';
  box(root,'back-wall',[12,5.7,.2],wall,[0,2.82,-4.45]);
  box(root,'left-wall',[.2,5.7,9],wall,[-6,2.82,0]);
  box(root,'back-skirting',[11.9,.17,.1],night?'#9dafac':'#b8b398',[0,.08,-4.3]);
  box(root,'left-skirting',[.1,.17,8.9],night?'#9dafac':'#b8b398',[-5.85,.08,0]);
  const rug=cyl(root,'woven-round-rug',3,3,.045,theme==='banquet'?'#b58666':theme==='care'?'#729b9b':'#b2b8a0',[0,.05,.5]);rug.scale.z=.74;
  const window=group(root,'large-recessed-window',[-3.6,3.3,-4.29]);
  box(window,'window-frame',[3.35,2.7,.18],'#f6f1df');
  box(window,'blue-glass',[3.06,2.4,.12],night?'#203c59':'#b2d8dc',[0,0,.12],null,{emissive:night?'#14273c':'#b2d8dc',emissiveIntensity:night?.25:.35});
  for(let i=0;i<7;i++){const h=.3+((i*31+seed*7)%9)*.075;box(window,'city-silhouette',[.27,h,.045],night?'#415d73':'#91b5b4',[-1.36+i*.44,-1.15+h/2,.21]);}
  if(night){const moon=ball(window,'moon',[.17,.17,.06],'#dbe2be',[.94,.65,.22]);moon.material=mat('#dbe2be',{emissive:'#dbe2be',emissiveIntensity:.4});}
  box(window,'window-mullion',[.08,2.4,.11],'#f6f1df',[0,0,.24]);box(window,'window-crossbar',[3.15,.08,.11],'#f6f1df',[0,.06,.24]);
  box(window,'window-sill',[3.7,.16,.46],'#f4ecda',[0,-1.4,.13]);
  function plant(p,scale=1){const g=group(root,'potted-plant',p);g.scale.setScalar(scale);cyl(g,'terracotta-pot',.35,.25,.65,'#ae7d59',[0,.32,0]);cyl(g,'pot-soil',.3,.3,.04,'#635c42',[0,.66,0]);for(let i=0;i<6;i++){const ang=i*2.4;rod(g,'green-stem',[0,.65,0],[Math.sin(ang)*.35,1+i*.14,Math.cos(ang)*.25],.025,'#57754d');const leaf=ball(g,'dimensional-leaf',[.24,.1,.45],i%2?'#809b65':'#64865b',[Math.sin(ang)*.35,1+i*.14,Math.cos(ang)*.25]);leaf.rotation.set(.3,ang,.4);}}
  plant([-4.9,0,-2.4],1.14);plant([4.9,0,-3.4],1.45);
  function chair(p,yaw=0,color='#6b8581'){
    const g=group(root,'upholstered-chair',p,yaw),edge=new THREE.Color(color).multiplyScalar(.72).getHex();
    box(g,'seat',[1.02,.18,.92],edge,[0,.89,0]);box(g,'seat-upholstery',[.93,.12,.82],color,[0,1.01,.01]);
    box(g,'chair-back',[1.02,1.18,.18],edge,[0,1.47,-.44]);box(g,'chair-back-inset',[.87,1.01,.065],color,[0,1.49,-.326]);
    for(const x of [-.45,.45]){box(g,'chair-upholstery-piping',[.018,.94,.018],edge,[x,1.51,-.283]);rod(g,'chair-arm-support',[x,.87,.22],[x,1.27,.22],.035,'#5d6560');box(g,'wood-armrest',[.12,.065,.57],'#8b795c',[x,1.29,.05]);}
    for(const x of [-.4,.4])for(const z of [-.33,.33])rod(g,'chair-leg',[x,0,z],[x*.9,.84,z*.9],.045,'#5d6560');return g;
  }
  function desk(p,size=[4,1.7,2],color='#a87c54'){
    const g=group(root,'table',p),edge=new THREE.Color(color).multiplyScalar(.7).getHex();
    box(g,'wood-tabletop-edge',[size[0]+.055,.09,size[2]+.055],edge,[0,size[1]-.05,0]);box(g,'wood-tabletop',[size[0],.13,size[2]],color,[0,size[1]+.02,0]);
    for(const z of [-1,1])box(g,'wood-table-apron',[size[0]-.3,.22,.09],edge,[0,size[1]-.21,z*(size[2]/2-.2)]);
    for(const x of [-1,1]){box(g,'wood-table-end-joinery',[.09,.22,size[2]-.3],edge,[x*(size[0]/2-.2),size[1]-.21,0]);for(const z of [-1,1])box(g,'table-leg',[.14,size[1],.14],'#62675b',[x*(size[0]/2-.2),size[1]/2,z*(size[2]/2-.2)]);}
    return g;
  }
  function document(p,yaw=0,highlight=false){const g=group(root,'unsigned-papers',p,yaw);box(g,'document-page',[.86,.025,1.2],'#fff9e7');for(let i=0;i<6;i++)box(g,'unreadable-document-rule',[.55-(i%3)*.07,.006,.018],highlight&&i===4?'#c48955':'#a4b1ad',[0,.018,-.42+i*.15]);if(highlight)box(g,'clause-highlight',[.67,.006,.07],'#d9b478',[0,.021,.17]);return g;}
  function cup(p,color='#f0e7d0'){const g=group(root,'ceramic-cup',p);cyl(g,'cup-body',.15,.13,.27,color,[0,.135,0]);cyl(g,'dark-coffee',.124,.124,.008,'#67493c',[0,.274,0]);mesh(g,'cup-handle',new THREE.TorusGeometry(.105,.025,8,20),color,[.16,.15,0]);return g;}
  function human(p,yaw=0,color='#667d87',skin='#ddb38b'){const g=group(root,'supporting-person',p,yaw);cyl(g,'jacket',.31,.4,1.1,color,[0,1.05,0]);ball(g,'face',[.32,.38,.3],skin,[0,1.95,.015]);ball(g,'hair',[.34,.23,.31],'#544b43',[0,2.14,-.03]);for(const x of [-.13,.13]){ball(g,'eye',[.022,.032,.016],'#343b3c',[x,1.99,.283]);rod(g,'trouser-leg',[x,0,0],[x,.61,0],.105,'#48545b');ball(g,'shoe',[.13,.075,.22],'#3f4847',[x,.07,.085]);}const arms=[];for(const sign of [-1,1]){const arm=group(g,'person-arm',[sign*.33,1.5,0]);rod(arm,'sleeve',[0,0,0],[0,-.57,.03],.1,color);ball(arm,'hand',[.1,.12,.1],skin,[0,-.63,.045]);arms.push(arm);}g.userData.arms=arms;moving.push(g);return g;}
  const roomShell=root.children.slice();
  const actor=createLiuKanshan();actor.name='event-protagonist-liu-kanshan';actor.position.set(-1.7,0,1.25);actor.rotation.y=.42;root.add(actor);actors.push(actor);
  const rig=actor.userData.rig;const action={};
  const themedChildrenStart=root.children.length;
  if(theme==='presentation'){
    const screen=group(root,'presentation-screen',[1.1,3.24,-4.22]);box(screen,'screen-housing',[4.7,2.66,.14],'#6b7974');box(screen,'blank-projection',[4.5,2.45,.03],'#f5f1d8',[0,0,.1]);
    for(let i=0;i<4;i++)box(screen,'proposal-chart',[.55,.45+i*.29,.025],['#b7c6aa','#91ad93','#779b88','#538778'][i],[-1.42+i*.91,-.8+(.45+i*.29)/2,.13]);
    desk([1.7,0,.1],[4,1.42,1.7]);document([1.7,1.52,.1]);cup([3,1.52,0]);chair([1.3,0,1.45],Math.PI);chair([3.1,0,1.45],Math.PI);
    human([1.5,0,-1.6],.1,'#677d81');human([3.5,0,-1.5],-.2,'#918472');
    box(root,'lectern',[.83,1.8,.65],'#b8986b',[-2.2,.9,-1.65]);rod(root,'waiting-microphone',[-2.2,1.8,-1.65],[-2.08,2.21,-1.65],.035,'#344f51');
    const door=group(root,'open-door',[4.45,0,-4.26]);box(door,'doorway',[1.72,3.7,.16],'#667c76',[0,1.85,0]);const doorLeaf=box(door,'ajar-door',[1.54,3.55,.12],'#bcb096',[.63,1.79,.54],[0,.86,0]);
    action.leaving=human([4.2,0,-2.9],Math.PI,'#a18c70');action.door=doorLeaf;
  }else if(theme==='incident'){
    actor.position.set(-1.9,0,1.1);actor.rotation.y=.56;
    for(let i=0;i<3;i++){const rack=group(root,'server-rack',[.5+i*1.55,0,-3.05]);box(rack,'rack-case',[1.3,3.7,.95],'#354a59',[0,1.85,0]);for(let j=0;j<7;j++){box(rack,'server-tray',[1.12,.31,.08],'#536773',[0,.42+j*.45,.52]);for(let k=0;k<4;k++)box(rack,'vent',[.12,.025,.035],'#283d4a',[-.35+k*.18,.42+j*.45,.57]);const lamp=ball(rack,'server-status-led',[.032,.032,.02],j===3?'#e99b67':'#7dd2ad',[.43,.43+j*.45,.582]);if(j===3)action.alerts=(action.alerts||[]).concat(lamp);}}
    desk([1.25,0,.45],[3.2,1.45,1.8],'#8a9390');const screen=group(root,'fault-monitor',[1.15,2.35,.02]);box(screen,'monitor-case',[1.9,1.25,.14],'#364956');box(screen,'monitor-glass',[1.72,1.09,.035],'#173442',[0,0,.091]);for(let i=0;i<5;i++)box(screen,'diagnostic-line',[1.15-i*.11,.025,.018],i===2?'#e39167':'#80b1a9',[-.12,.34-i*.16,.119]);box(root,'keyboard',[1.2,.06,.43],'#586e76',[1.15,1.58,.82]);cup([2.5,1.55,.53]);chair([2.9,0,1.5],-.5);human([3.4,0,-.5],-.55,'#70868b');
    action.beacon=ball(root,'incident-beacon',[.18,.18,.18],'#f2a078',[3.6,4,-3.8]);action.beacon.material=mat('#f2a078',{emissive:'#ee6b40',emissiveIntensity:1});
  }else if(theme==='review'){
    desk([.6,0,-.1],[5.3,1.45,2.1]);chair([3.2,0,.9],-.55);chair([1,0,-1.9]);
    const board=group(root,'dependency-whiteboard',[1.75,3.18,-4.18]);box(board,'board-frame',[4.5,2.15,.15],'#8fa6a0');box(board,'board',[4.28,1.94,.025],'#f2f2dd',[0,0,.092]);for(let i=0;i<5;i++){box(board,'dependency-card',[.58,.4,.03],i===3?'#d9a883':'#a3baa2',[-1.6+i*.8,(i%2)*.61-.31,.12]);if(i<4)rod(board,'connection',[-1.26+i*.8,(i%2)*.61-.31,.13],[-1.08+i*.8,((i+1)%2)*.61-.31,.13],.019,'#90a09d');}
    action.records=document([-.1,1.56,.43],-.16);document([1.6,1.56,-.25],.18);box(root,'records-folder',[1.02,.06,1.29],'#708e84',[-.1,1.51,.43]);
    action.colleague=human([2.8,0,-1.5],-.5,'#9b8578');human([.45,0,-2.2],.1,'#6f8790');cup([2.7,1.55,.3]);
  }else if(theme==='home'){
    actor.position.set(-1.9,0,1.3);actor.rotation.y=.72;
    for(let i=0;i<9;i++)for(let j=0;j<4;j++)box(root,'ceramic-wall-tile',[.73,.73,.04],(i+j)%3?'#d6dfd0':'#bccdc4',[-1.4+i*.8,.46+j*.8,-4.27]);
    box(root,'vanity-cabinet',[3,1.5,1.23],'#91b3a2',[1.15,.75,-2.82]);box(root,'sink-countertop',[3.2,.17,1.36],'#efeede',[1.15,1.57,-2.77]);
    const basin=cyl(root,'porcelain-sink',.57,.48,.22,'#f7f6e9',[1.13,1.73,-2.7]);basin.scale.z=.65;cyl(root,'basin-interior',.43,.35,.023,'#bdcecb',[1.13,1.85,-2.7]).scale.z=.65;
    rod(root,'tap-stem',[1.17,1.63,-3.15],[1.17,2.23,-3.15],.055,'#a6bab8');rod(root,'tap-spout',[1.17,2.23,-3.15],[1.17,2.23,-2.83],.055,'#a6bab8');
    box(root,'mirror-frame',[2.45,2.18,.1],'#ae9874',[1.15,3.3,-4.15]);box(root,'mirror',[2.21,1.94,.035],'#b4d1d1',[1.15,3.3,-4.075]);box(root,'mirror-glint',[.21,2,.015],'#dfeddf',[.46,3.3,-4.043],[0,0,-.4]);
    action.toothpaste=box(root,'uncapped-toothpaste',[.59,.13,.19],'#d99b89',[2.28,1.75,-2.44],[0,.24,0]);cyl(root,'loose-cap',.09,.09,.11,'#f1edda',[1.97,1.73,-2.1]);
    for(let i=0;i<5;i++){const drop=ball(root,'water-on-counter',[.06+i*.009,.005,.037],'#99b7b7',[.01+i*.22,1.66,-2.43+Math.sin(i)*.17]);drop.material=mat('#99b7b7',{roughness:.12});}
    rod(root,'towel-rail',[3.2,2.2,-3.6],[4.7,2.2,-3.6],.048,'#a1aaa2');box(root,'hanging-towel',[.83,.9,.07],'#d1ae83',[3.99,1.75,-3.58]);box(root,'laundry-basket',[.95,.75,.88],'#b8a787',[3.9,.38,-1.74]);
    action.colleague=human([1.2,0,.85],-.8,'#b3a087');
  }else if(theme==='care'){
    actor.position.set(-1.72,0,1.13);actor.rotation.y=.65;
    const bed=group(root,'observation-bed',[1.5,0,-.9]);box(bed,'bed-frame',[2.3,.22,3.5],'#779596',[0,.65,0]);box(bed,'mattress',[2.22,.24,3.3],'#e9ece2',[0,.89,0]);box(bed,'pillow',[1.34,.2,.72],'#f7f6e9',[0,1.13,-1.08]);box(bed,'blue-blanket',[2.16,.25,2.13],'#9cbfc0',[0,1.13,.55]);for(const x of [-1,1])for(const z of [-1.35,1.35]){box(bed,'bed-leg',[.08,.58,.08],'#789295',[x,.31,z]);ball(bed,'castor',[.1,.1,.06],'#506d73',[x,.1,z]);}
    const patient=human([1.5,1.05,-1.9],0,'#b4cec6');patient.rotation.x=-Math.PI/2;patient.scale.setScalar(.75);patient.name='resting-companion';
    rod(root,'iv-pole',[3.33,0,-2.3],[3.33,3.72,-2.3],.043,'#b1c2b9');rod(root,'iv-hook',[3.33,3.72,-2.3],[2.88,3.72,-2.3],.043,'#b1c2b9');box(root,'iv-bag',[.4,.65,.16],'#c2d8ce',[2.94,3.26,-2.3]);box(root,'iv-fluid',[.32,.34,.17],'#9bc4c2',[2.94,3.13,-2.3]);rod(root,'iv-line',[2.94,2.94,-2.3],[2.77,1.38,-.7],.017,'#d3e1d8');
    desk([-3.8,0,-1.7],[1.1,1.1,.85],'#8dabad');action.phone=box(root,'waiting-work-phone',[.36,.06,.66],'#354f62',[-3.8,1.23,-1.7]);box(action.phone,'phone-notification',[.24,.012,.19],'#a6d3db',[0,.037,-.12],null,{emissive:'#70b9cf',emissiveIntensity:.6});chair([-3.7,0,.6],.25,'#7b9c9d');
    const clock=group(root,'hospital-clock',[1,4.34,-4.23]);cyl(clock,'clock-face',.37,.37,.06,'#e4ece0',[0,0,0],[Math.PI/2,0,0]);rod(clock,'hour-hand',[0,0,.05],[-.15,.1,.05],.015,'#607b82');rod(clock,'minute-hand',[0,0,.05],[0,-.25,.05],.012,'#607b82');
  }else if(theme==='banquet'){
    actor.position.set(-2.2,0,1.4);actor.rotation.y=.57;
    for(let i=0;i<4;i++){box(root,'wall-panel',[1.02,3.8,.055],'#d3b783',[-.45+i*1.45,2.5,-4.25]);box(root,'panel-inset',[.85,3.6,.07],'#e7d3ae',[-.45+i*1.45,2.5,-4.2]);}
    const table=group(root,'round-banquet-table',[.7,0,-.1]);cyl(table,'tablecloth',2.0,1.91,.22,'#efe3c5',[0,1.5,0]);cyl(table,'central-leg',.32,.6,1.42,'#9a8159',[0,.71,0]);
    for(let i=0;i<5;i++){const a=i/5*Math.PI*2;const x=.7+Math.sin(a)*1.54,z=-.1+Math.cos(a)*1.54;cyl(root,'porcelain-plate',.27,.27,.03,'#fbf5df',[x,1.65,z]);const glass=group(root,'wine-glass',[x+.25,1.65,z-.15]);cyl(glass,'glass-foot',.1,.1,.024,'#dbd8ba');rod(glass,'stem',[0,0,0],[0,.2,0],.018,'#dad8be');cyl(glass,'glass-bowl',.12,.06,.19,'#d2af91',[0,.3,0]);}
    action.colleague=human([2.57,0,-2.1],-.32,'#887c8e');action.host=human([.15,0,-2.67],.17,'#8f9a88');human([3.13,0,1.17],-.95,'#a28d78');
    action.card=box(root,'business-card',[.5,.024,.31],'#fff5d9',[.75,1.67,-.66]);
    const chandelier=group(root,'chandelier',[.7,4.53,-.6]);rod(chandelier,'suspension',[0,.8,0],[0,0,0],.034,'#b89a5c');mesh(chandelier,'brass-ring',new THREE.TorusGeometry(1.22,.04,8,64),'#b79a5d',[0,0,0],[Math.PI/2,0,0]);for(let i=0;i<9;i++){const a=i/9*Math.PI*2;rod(chandelier,'hanging-wire',[Math.sin(a)*1.2,0,Math.cos(a)*1.2],[Math.sin(a)*1.2,-.41,Math.cos(a)*1.2],.012,'#b79a5d');const crystal=mesh(chandelier,'crystal',new THREE.OctahedronGeometry(.15),'#fff0ba',[Math.sin(a)*1.2,-.49,Math.cos(a)*1.2],null,{emissive:'#ffdf97',emissiveIntensity:.3});crystal.scale.y=1.5;}
  }else if(theme==='offer'){
    actor.position.set(-1.9,0,1.6);actor.rotation.y=.52;
    desk([.55,0,-.35],[4.1,1.43,2.15],'#ac865e');chair([.7,0,-2.23],0,'#7a8a78');action.colleague=human([1.05,0,-2.15],-.22,'#8c9180');
    action.contract=document([.75,1.54,-.7],-.13,true);document([1.7,1.53,-.42],.1);rod(root,'unclaimed-pen',[-.4,1.56,.1],[-.15,1.56,.67],.035,'#426767');cup([2.04,1.53,.26]);cup([-.97,1.53,-.7]);
    const shelf=group(root,'wood-shelf',[3.67,0,-3.8]);for(const y of [.7,1.6,2.5,3.4])box(shelf,'shelf',[2,.09,.62],'#b5966d',[0,y,0]);for(let i=0;i<9;i++)box(shelf,'book-spine',[.13,.55+(i%3)*.07,.39],['#91a59c','#c2ad82','#8b9b9d'][i%3],[-.75+i*.18,1.92,0]);
  }else{
    actor.position.set(-1.9,0,1.4);actor.rotation.y=.53;
    desk([.75,0,-.2],[4.2,1.45,2.03],'#9c8d76');chair([1.45,0,-2.05],0,'#899691');action.colleague=human([1.45,0,-2.1],-.35,'#92978c');action.contract=document([1.2,1.56,-.6],-.12);document([-.7,1.56,.38],.17);
    const archive=group(root,'open-handover-box',[3.63,0,1.07]);box(archive,'box-bottom',[1.43,.1,1.17],'#a18a67',[0,.12,0]);for(const x of [-.7,.7])box(archive,'box-side',[.055,.95,1.17],'#c1a681',[x,.62,0]);for(const z of [-.56,.56])box(archive,'box-side',[1.42,.95,.055],'#c9ae84',[0,.62,z]);for(let i=0;i<4;i++)box(archive,'handover-folder',[1.02,.08,.86],i%2?'#8ba39a':'#e5d9bd',[0,.33+i*.16,0],[0,(i-1.5)*.07,0]);
    box(root,'filing-cabinet',[2.1,2.8,.87],'#a9b6ad',[3.96,1.4,-3.64]);for(let i=0;i<4;i++){box(root,'cabinet-drawer',[1.95,.57,.07],'#bdc7bb',[3.96,.44+i*.65,-3.15]);box(root,'drawer-handle',[.43,.05,.05],'#84928a',[3.96,.52+i*.65,-3.08]);}
  }
  if(!CELL_THEME[cell]&&CELL_SCENE_PROPS[cell]){
    // Preview-only events use the room/light palette and their own large props;
    // their scene should not inherit another story's bathroom, contract or actors.
    for(const object of root.children.slice(themedChildrenStart))object.visible=false;
    const vignette=group(root,`event-${cell}-specific-props`,[.55,0,-.3]);vignette.scale.setScalar(1.2);
    const [first,second]=CELL_SCENE_PROPS[cell];
    const a=group(vignette,first,[-.23,0,0]),b=group(vignette,second,[1.1,0,-.43]);
    const board=(g,p=[0,1.23,0],size=[1.34,.075,.95])=>box(g,'prop-desktop',size,'#b69a72',p);
    const stand=(g,h=1.2)=>{board(g,[0,h,0]);for(const x of [-.52,.52])for(const z of [-.34,.34])box(g,'prop-table-leg',[.07,h,.07],'#7f8978',[x,h/2,z]);};
    const paper=(g,p=[0,1.32,0],rotation=0)=>{const pgroup=group(g,'paper-detail',p,rotation);box(pgroup,'unwritten-sheet',[.72,.018,.85],'#f6edda');for(let i=0;i<4;i++)box(pgroup,'unreadable-rule',[.5-(i%2)*.12,.008,.018],'#a7b0a3',[0,.016,-.26+i*.16]);return pgroup;};
    const notebook=(g,p=[0,1.31,0],color='#6f9184')=>{box(g,'notebook-cover',[.8,.075,.96],color,p);paper(g,[p[0],p[1]+.045,p[2]]);for(let i=0;i<5;i++)mesh(g,'binding-ring',new THREE.TorusGeometry(.037,.009,6,12),'#c7c8b0',[p[0]-.35,p[1]+.06,p[2]-.3+i*.15],[Math.PI/2,0,0]);};
    const phone=(g,p=[0,1.3,0])=>{box(g,'phone-case',[.39,.07,.72],'#3f5a66',p);box(g,'phone-glass',[.31,.013,.61],'#a4c9c8',[p[0],p[1]+.04,p[2]]);box(g,'notification',[.24,.014,.1],'#e4e7c7',[p[0],p[1]+.05,p[2]-.13]);};
    const suitcase=(g,color='#8fa49e')=>{box(g,'luggage-shell',[.83,1.13,.5],color,[0,.68,0]);for(const x of [-.31,.31]){ball(g,'luggage-wheel',[.09,.09,.08],'#536866',[x,.1,0]);rod(g,'handle-rod',[x*.6,1.2,0],[x*.6,1.61,0],.025,'#b4c1b3');}rod(g,'suitcase-handle',[-.19,1.61,0],[.19,1.61,0],.055,'#5a7275');box(g,'luggage-band',[.1,1.15,.515],'#d3c29a',[0,.68,0]);};
    const bench=(g,color='#ad9877')=>{for(let i=0;i<3;i++)box(g,'bench-slat',[1.58,.08,.16],color,[0,.7,-.22+i*.2]);for(const x of [-.65,.65]){box(g,'bench-leg',[.1,.66,.47],'#6b7e71',[x,.33,0]);rod(g,'back-support',[x,.6,-.36],[x,1.48,-.36],.035,'#6b7e71');}box(g,'bench-back',[1.6,.44,.07],color,[0,1.2,-.35]);};
    const teapot=(g,p=[0,1.45,0])=>{ball(g,'round-teapot',[.28,.25,.26],'#b28e68',p);cyl(g,'teapot-lid',.15,.18,.055,'#d0b492',[p[0],p[1]+.24,p[2]]);ball(g,'lid-knob',[.055,.055,.055],'#9d7754',[p[0],p[1]+.31,p[2]]);rod(g,'spout',[p[0]+.19,p[1],p[2]],[p[0]+.42,p[1]+.17,p[2]],.067,'#b28e68');mesh(g,'teapot-handle',new THREE.TorusGeometry(.2,.035,8,24),'#b28e68',[p[0]-.24,p[1]+.05,p[2]]);};
    const leaves=(g,x,y,z,color='#84a275')=>{for(let i=0;i<4;i++){const leaf=ball(g,'young-leaf',[.18,.07,.31],color,[x+Math.sin(i*2)*.19,y+i*.075,z+Math.cos(i*2)*.16]);leaf.rotation.y=i*2;}};
    const ledger=(g)=>{stand(g);notebook(g);rod(g,'resting-pencil',[.44,1.29,-.35],[.49,1.29,.26],.022,'#c29856');};
    switch(Number(cell)){
      case 1:
        stand(a);for(let i=0;i<5;i++)box(a,'library-book',[1-i*.035,.14,.75],['#91a8a0','#ccb689','#9ca394'][i%3],[0,1.36+i*.15,0],[0,(i-2)*.055,0]);
        ball(b,'backpack-body',[.41,.58,.25],'#b1936e',[0,.6,0]);box(b,'backpack-pocket',[.51,.4,.14],'#c4aa83',[0,.38,.24]);rod(b,'bag-loop',[-.12,1.13,0],[.12,1.13,0],.04,'#7d846b');break;
      case 2:
        stand(a);for(const x of [-.6,.6])box(a,'booth-post',[.065,2.45,.065],'#8eaa9b',[x,1.23,-.36]);box(a,'blank-booth-sign',[1.5,.53,.08],'#c4d2b1',[0,2.28,-.36]);box(a,'booth-counter',[1.36,.72,.94],'#91ad9f',[0,.83,0]);
        stand(b,.74);notebook(b,[0,.85,0],'#c3af83');break;
      case 3:
        stand(a,1.05);box(a,'small-writing-drawer',[1.1,.22,.67],'#ae8c5e',[0,.85,0]);box(a,'drawer-knob',[.15,.04,.04],'#796f56',[0,.86,.36]);
        box(b,'moving-box',[.9,.75,.78],'#c4a980',[0,.38,0]);box(b,'packing-tape',[.16,.02,.79],'#e2cea5',[0,.77,0]);break;
      case 4:
        ledger(a);box(a,'correction-sticky',[.22,.025,.2],'#dbc38b',[.16,1.42,.2]);stand(b,.87);paper(b,[0,.93,0]);for(let i=0;i<3;i++)box(b,'calendar-row',[.46,.018,.07],i===1?'#dba58a':'#b1bfad',[0,.96,-.2+i*.16]);break;
      case 5:
        stand(a,.89);cyl(a,'milk-tea-cup',.2,.15,.5,'#d6b79a',[0,1.19,0]);cyl(a,'cup-lid',.21,.21,.04,'#faf1d5',[0,1.45,0]);rod(a,'drinking-straw',[.04,1.45,0],[.09,1.8,0],.023,'#8b9c91');stand(b,.74);paper(b,[0,.8,0]);for(let i=0;i<3;i++)box(b,'shortcut-key',[.13,.05,.12],'#8aaba0',[-.21+i*.21,.85,.12]);break;
      case 7:
        stand(a,.84);phone(a,[0,.94,0]);for(const x of [-.5,.5])rod(b,'drying-rack-post',[x,0,0],[x,2.1,0],.027,'#a8b4a8');rod(b,'washing-line',[-.55,2.1,0],[.55,2.1,0],.022,'#9caa9a');box(b,'hanging-bed-sheet',[.96,1.18,.035],'#e7dec3',[0,1.48,0]);for(const x of [-.35,.35])box(b,'clothespin',[.045,.12,.055],'#ad9878',[x,2.1,0]);break;
      case 8:
        box(a,'door-frame',[1.05,2.65,.13],'#7c9289',[0,1.33,-.2]);box(a,'fire-door-panel',[.9,2.44,.1],'#a2b1a2',[0,1.25,-.08]);rod(a,'push-bar',[-.32,1.2,.01],[.32,1.2,.01],.04,'#d0d1b4');for(let i=0;i<4;i++)box(b,'stair-tread',[.95,.2*(i+1),.33],'#b6b6a0',[0,.1*(i+1),.46-i*.33]);break;
      case 9:
        ledger(a);for(let i=0;i<3;i++)paper(a,[.08,1.43+i*.032,.02],i*.06);box(b,'blinds-frame',[1.1,2.2,.1],'#a4ac97',[0,1.1,-.2]);for(let i=0;i<12;i++)box(b,'individual-blind-slat',[1.04,.11,.06],'#ded8bc',[0,.16+i*.17,-.12],[.25,0,0]);break;
      case 10:
        suitcase(a,'#7b9c97');for(const x of [-.42,.42])box(b,'ticket-gate-pillar',[.28,1.27,.61],'#a5b6aa',[x,.64,0]);box(b,'gate-reader',[.2,.035,.23],'#638b89',[.42,1.29,0]);box(b,'gate-flap',[.65,.43,.07],'#c6d8ca',[0,.78,0]);break;
      case 12:
        stand(a,.78);cyl(a,'warm-food-tub',.3,.23,.38,'#e1ceb0',[0,1.01,0]);for(let i=0;i<3;i++){rod(a,'bamboo-skewer',[-.13+i*.14,1.09,0],[-.13+i*.14,1.6,0],.014,'#b8965d');ball(a,'oden-piece',[.08,.08,.08],'#d9b777',[-.13+i*.14,1.24+i*.055,0]);}
        for(const x of [-.42,.42])box(b,'exit-column',[.12,2.3,.16],'#819b98',[x,1.15,-.2]);box(b,'metro-exit-canopy',[1.15,.23,.62],'#a1b6a0',[0,2.25,-.12]);break;
      case 14:
        stand(a,.75);cyl(a,'black-iron-pan',.53,.5,.12,'#49514a',[0,.86,0]);for(let i=0;i<6;i++){const an=i/6*Math.PI*2;ball(a,'golden-bun',[.15,.11,.14],'#ead6a8',[Math.sin(an)*.28,.99,Math.cos(an)*.28]);}ball(a,'center-bun',[.15,.11,.14],'#ebd5a5',[0,.99,0]);
        ball(b,'orange-cat-body',[.23,.27,.4],'#c99460',[0,.3,0]);ball(b,'cat-head',[.22,.22,.2],'#d3a46e',[0,.61,.21]);for(const x of [-.13,.13])mesh(b,'cat-ear',new THREE.ConeGeometry(.095,.21,4),'#c18b56',[x,.81,.17]);for(const x of [-.08,.08])ball(b,'cat-eye',[.017,.025,.013],'#3d4640',[x,.64,.401]);rod(b,'cat-tail',[.1,.31,-.29],[.32,.56,-.5],.05,'#bb8653');break;
      case 16:
        bench(a,'#a2b297');stand(b,.72);paper(b,[0,.79,0]);for(let i=0;i<3;i++)box(b,'resource-card',[.16,.021,.21],['#a1b993','#d2b589','#94b1ac'][i],[-.23+i*.23,.83,.02]);break;
      case 17:
        box(a,'low-presentation-stage',[1.75,.25,1.32],'#a99068',[0,.125,0]);box(a,'stage-lectern',[.56,1.1,.49],'#ba9a6b',[0,.8,-.13]);rod(a,'stage-microphone',[0,1.36,-.1],[.08,1.63,-.05],.025,'#466469');box(b,'delivery-screen',[1.18,1.13,.1],'#a0b6a7',[0,1.45,0]);for(let i=0;i<3;i++)box(b,'delivery-chart',[.21,.24+i*.21,.04],'#648d7f',[-.33+i*.33,1.02+(.24+i*.21)/2,.08]);rod(b,'screen-post',[0,0,0],[0,.94,0],.06,'#7e9487');break;
      case 19:
        for(const x of [-.65,0,.65])rod(a,'view-deck-post',[x,0,0],[x,1.33,0],.04,'#9ab5b3');rod(a,'deck-railing',[-.75,1.33,0],[.75,1.33,0],.05,'#b7cec5');for(let i=0;i<6;i++)box(a,'distant-city-block',[.18,.3+i%3*.18,.3],'#638e93',[-.68+i*.26,.15+i%3*.09,-.37]);stand(b,.78);phone(b,[0,.89,0]);break;
      case 20:
        suitcase(a,'#8b9cae');stand(b,.95);for(const sign of [-1,1]){const cal=group(b,'open-planner',[sign*.28,1.05,0]);paper(cal,[0,0,0]);cal.scale.set(.65,1,.75);for(let i=0;i<3;i++)box(cal,'marked-date',[.1,.015,.08],sign===1?'#90afa7':'#c9a789',[-.17+i*.16,.023,0]);}break;
      case 21:
        stand(a,.82);cyl(a,'birthday-cake-base',.4,.4,.3,'#e0c39a',[0,1.04,0]);cyl(a,'cream-icing',.41,.41,.06,'#f2e6c7',[0,1.22,0]);for(let i=0;i<3;i++){rod(a,'birthday-candle',[-.18+i*.18,1.25,0],[-.18+i*.18,1.52,0],.018,'#c08f71');ball(a,'candle-light',[.035,.065,.035],'#e8b765',[-.18+i*.18,1.57,0]);}
        box(b,'grill-body',[.82,.3,.62],'#5b5c4e',[0,.69,0]);for(const x of [-.31,.31])box(b,'grill-leg',[.045,.55,.045],'#6e7566',[x,.28,0]);for(let i=0;i<6;i++)rod(b,'grill-rack',[-.36,.85,-.23+i*.09],[.36,.85,-.23+i*.09],.014,'#a6a08b');break;
      case 23:
        stand(a,.82);teapot(a,[0,1.12,0]);for(const x of [-.49,.49])cyl(a,'family-tea-cup',.12,.09,.18,'#d8c8a6',[x,.97,.22]);ledger(b);break;
      case 24:
        for(const x of [-.6,0,.6])rod(a,'rooftop-baluster',[x,0,-.2],[x,1.25,-.2],.035,'#899c95');rod(a,'rooftop-top-rail',[-.72,1.25,-.2],[.72,1.25,-.2],.04,'#a7b8a7');for(const x of [-.3,.3]){cyl(b,'rooftop-stool',.25,.25,.12,'#c0a87f',[x,.73,0]);for(const sign of [-1,1])rod(b,'stool-leg',[x+sign*.15,0,0],[x+sign*.11,.68,0],.03,'#7b8d7e');}break;
      case 25:
        stand(a);cyl(a,'desk-lamp-base',.21,.21,.035,'#96a698',[0,1.29,0]);rod(a,'lamp-stem',[0,1.29,0],[.14,1.94,-.12],.027,'#92a394');cyl(a,'lamp-shade',.09,.27,.24,'#d2bd8c',[.14,1.98,-.12]);ledger(b);for(let i=0;i<3;i++)notebook(b,[0,1.42+i*.095,0],['#adbfa7','#cbb78a','#8fa59c'][i]);break;
      case 26:
        box(a,'salon-easel-board',[1.3,1.62,.08],'#d9ceb0',[0,1.45,-.1]);for(const x of [-.45,.45])rod(a,'easel-leg',[x,0,.22],[x*.8,2.23,-.12],.045,'#a28d6e');for(let i=0;i<4;i++)box(a,'case-display-card',[.44,.42,.035],i%2?'#a0b3a2':'#c4b28b',[-.29+(i%2)*.58,1.03+Math.floor(i/2)*.64,-.04]);ledger(b);break;
      case 28:
        stand(a,.95);box(a,'calculator',[.62,.15,.88],'#7f978f',[0,1.06,0]);box(a,'calculator-display',[.48,.018,.19],'#cbd8ba',[0,1.145,-.24]);for(let i=0;i<12;i++)box(a,'calculator-key',[.105,.024,.09],'#d2d5ba',[-.18+(i%3)*.18,1.15,-.01+Math.floor(i/3)*.12]);ledger(b);break;
      case 29:
        for(let i=0;i<5;i++)for(let j=0;j<4;j++)box(a,'individual-red-brick',[.32,.18,.11],(i+j)%2?'#ba8b72':'#ad8066',[-.67+i*.34+(j%2)*.1,.2+j*.2,-.1]);rod(a,'ivy-stem',[-.4,.1,.02],[.38,1.32,.02],.017,'#799564');for(let i=0;i<4;i++)leaves(a,-.36+i*.22,.26+i*.29,.05,'#93a875');ledger(b);break;
      case 30:
        stand(a,.82);box(a,'house-model-base',[1.12,.07,.88],'#b3bda2',[0,.91,0]);box(a,'mini-house',[.71,.64,.56],'#e0c8a0',[0,1.26,0]);const roof=mesh(a,'house-roof',new THREE.ConeGeometry(.63,.49,4),'#a27f68',[0,1.78,0],[0,Math.PI/4,0]);roof.scale.z=.88;box(a,'house-window',[.18,.18,.023],'#9dbaba',[-.17,1.33,.296]);box(a,'house-door',[.17,.35,.023],'#ae9874',[.18,1.15,.296]);
        box(b,'queue-machine-column',[.48,1.27,.43],'#a0b4ab',[0,.64,0]);box(b,'queue-screen',[.36,.3,.04],'#c1d5c3',[0,1.13,.24]);box(b,'printed-queue-ticket',[.18,.25,.025],'#ece5ce',[0,.71,.25],[.3,0,0]);break;
      case 32:
        box(a,'car-bonnet',[1.6,.44,1],'#8a9e9b',[0,.72,0]);box(a,'windshield',[1.32,.65,.06],'#a7c4c2',[0,1.19,-.37],[.2,0,0]);for(const x of [-.62,.62]){ball(a,'headlight',[.2,.13,.055],'#dcd6b0',[x,.71,.54]);cyl(a,'car-wheel',.22,.22,.15,'#4f615e',[x,.36,0],[0,0,Math.PI/2]);}box(a,'car-grille',[.64,.17,.04],'#687d78',[0,.55,.53]);stand(b,.81);box(b,'radio-body',[.71,.34,.36],'#a58f72',[0,1.03,0]);for(const x of [-.22,.22])cyl(b,'radio-speaker',.12,.12,.025,'#5f706a',[x,1.04,.197],[Math.PI/2,0,0]);break;
      case 33:
        bench(a,'#a4c0b5');stand(b,.84);notebook(b,[0,.93,0],'#b1c4af');for(let i=0;i<3;i++)box(b,'care-shift-tab',[.09,.019,.15],i%2?'#cca97e':'#8cac9c',[.36,1.0,-.2+i*.2]);break;
      case 34:
        ledger(a);box(a,'casebook-divider',[.77,.021,.12],'#b5bda1',[0,1.4,-.1]);stand(b,.99);paper(b,[0,1.06,0]);rod(b,'contract-pencil',[.39,1.1,-.21],[.4,1.1,.3],.022,'#8a9c8a');break;
      case 35:
        stand(a,.77);teapot(a,[0,1.08,0]);box(b,'sofa-seat',[1.16,.36,.79],'#baa98c',[0,.49,0]);box(b,'sofa-back',[1.16,.66,.18],'#c6b699',[0,.85,-.36]);for(const x of [-.55,.55])box(b,'sofa-arm',[.18,.42,.83],'#ad9f86',[x,.74,0]);box(b,'resting-cushion',[.42,.38,.15],'#d8c697',[.21,.79,-.19],[0,0,.12]);break;
      case 36:
        box(a,'service-counter',[1.27,.97,.6],'#a3b6ab',[0,.49,0]);board(a,[0,1.02,0],[1.42,.07,.74]);for(const x of [-.6,.6])rod(a,'window-post',[x,1.03,-.22],[x,2.23,-.22],.035,'#9cae9f');box(a,'service-glass',[1.14,.93,.035],'#bdd2c7',[0,1.71,-.22]);stand(b,.81);paper(b,[0,.89,0]);for(let i=0;i<4;i++)ball(b,'timeline-point',[.04,.017,.04],'#80a195',[-.24+i*.16,.93,0]);break;
      case 37:
        box(a,'old-shop-frame',[1.22,2.34,.11],'#ac9270',[0,1.18,-.1]);box(a,'empty-shop-glass',[1.06,2.12,.055],'#bdcfbf',[0,1.18,-.02]);box(a,'shop-crossbar',[1.15,.085,.07],'#a3896b',[0,1.16,.04]);box(a,'shop-mullion',[.09,2.12,.07],'#a3896b',[0,1.18,.04]);ledger(b);break;
      case 38:
        cyl(a,'hot-spring-water',.7,.7,.1,'#9ec6c1',[0,.17,0]);for(let i=0;i<10;i++){const an=i/10*Math.PI*2;ball(a,'rounded-pool-stone',[.24,.21,.18],i%2?'#a2b5a6':'#bec6b1',[Math.sin(an)*.73,.19,Math.cos(an)*.73]);}for(let i=0;i<3;i++){const steam=mesh(a,'soft-steam',new THREE.TorusGeometry(.18+i*.045,.014,6,24),'#dee8d4',[-.2+i*.2,.6+i*.18,0],[Math.PI/2,0,.3]);steam.scale.z=.55;}
        stand(b,.69);phone(b,[0,.81,0]);box(b,'silent-switch',[.03,.03,.1],'#b3b99d',[.21,.81,-.11]);break;
      case 39:
        cyl(a,'young-tree-soil',.51,.51,.07,'#abb8a0',[0,.07,0]);rod(a,'bare-tree-trunk',[0,.08,0],[0,1.91,0],.059,'#a58a64');rod(a,'new-branch',[0,1.05,0],[-.42,1.6,.08],.028,'#a58a64');rod(a,'new-branch',[0,1.35,0],[.39,1.88,-.04],.024,'#a58a64');leaves(a,.35,1.86,-.04,'#b7c98c');leaves(a,-.38,1.6,.08,'#a6c182');bench(b,'#b2a586');break;
      case 40:
        stand(a,.85);for(let i=0;i<4;i++){const m=group(a,'season-keepsake',[-.48+i*.32,1.01,0]);cyl(m,'keepsake-plinth',.13,.13,.07,'#d7c299');if(i===0){ball(m,'spring-blossom',[.15,.15,.14],'#dcaab0',[0,.22,0]);}if(i===1){ball(m,'summer-leaves',[.16,.19,.14],'#89aa7c',[0,.26,0]);}if(i===2){mesh(m,'autumn-leaf',new THREE.OctahedronGeometry(.17),'#c9a166',[0,.24,0]);}if(i===3){mesh(m,'winter-crystal',new THREE.OctahedronGeometry(.17),'#c5dde0',[0,.24,0]);}}
        stand(b,.68);box(b,'long-journey-scroll',[1.2,.04,1.14],'#e8d9b5',[0,.74,0]);for(const x of [-.58,.58])cyl(b,'scroll-roller',.075,.075,1.28,'#a88b60',[x,.79,0],[Math.PI/2,0,0]);for(let i=0;i<6;i++)box(b,'memory-tile',[.24,.016,.23],['#d8b5b1','#a1b698','#c8ad7c','#b5ced0'][i%4],[-.26+(i%2)*.52,.78,-.35+Math.floor(i/2)*.35]);break;
    }
  }
  // Replace the old universal room shell with the document's actual space.
  // Narrative action props remain in place for the eight filmed events.
  for(const part of roomShell)part.visible=false;
  function createCompanion(position,yaw=0){
    const companion=createLiuKanshan();companion.name='liu-kanyu-companion';companion.position.set(...position);companion.rotation.y=yaw;root.add(companion);actors.push(companion);
    const head=companion.userData.rig.head;
    ball(head,'liu-kanyu-brown-hair-crown',[.49,.2,.37],'#6e4d36',[0,.54,-.04]);
    for(const sign of [-1,1]){const lock=ball(head,'liu-kanyu-long-brown-hair',[.17,.56,.25],'#75523a',[sign*.41,.02,-.095]);lock.rotation.z=sign*.15;}
    ball(head,'liu-kanyu-hair-back',[.43,.57,.15],'#6b4b37',[0,.1,-.31]);return companion;
  }
  const environment=buildReferenceSceneEnvironment({root,cell,box,cyl,ball,rod,mesh,group,chair,desk,plant,document,actor,actors,createCompanion});
  const population=addReferenceScenePopulation({root,environment:environment?.environment,cell,box,cyl,rod,group,chair,desk,document,actor});
  Object.assign(scene.userData,{populationApplied:Boolean(population),plannedPeople:population?.userData.population.people??0,addedPeople:population?.userData.addedPeople??0,populationMeshes:population?.userData.meshCount??0});
  const environmentBatch=environment?batchReferenceSceneEnvironment(environment.environment):null;
  // Keep shadow uniforms local to this disposable room. Three's renderer-wide
  // depth material can otherwise retain the previous room's color map and
  // upload that already-disposed texture again on the next room's shadow pass.
  const shadowDepth=new THREE.MeshDepthMaterial(),shadowDistance=new THREE.MeshDistanceMaterial();
  scene.traverse(object=>{if(object.isMesh){object.customDepthMaterial=shadowDepth;object.customDistanceMaterial=shadowDistance;}});
  scene.userData.referenceEnvironment=environment?.spec.name;scene.userData.space=environment?.spec.space;scene.userData.referenceReconstruction='native-threejs-geometry';
  const ambient=new THREE.HemisphereLight(night?'#b9d3ed':'#d9e8ef',night?'#455964':'#75694f',.88);scene.add(ambient);
  const sun=new THREE.DirectionalLight(warm?'#ffe5b8':night?'#d1e9f3':'#fff5df',2.8);sun.position.set(-3,9,6);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-10;sun.shadow.camera.right=10;sun.shadow.camera.top=9;sun.shadow.camera.bottom=-9;sun.shadow.normalBias=.025;sun.shadow.bias=-.0002;sun.shadow.radius=3;scene.add(sun);
  const rim=new THREE.DirectionalLight(night?'#8bc6e6':'#f9e0b4',.75);rim.position.set(4,5,-3);scene.add(rim);
  const positions={presentation:[8.9,6.2,12.2],incident:[9.5,6.7,12],review:[8.4,6.7,12],home:[8.1,6.4,11.8],care:[8.7,7.1,12.5],banquet:[9.7,6.8,13],offer:[8.5,6.6,11.8],departure:[8.9,6.5,12]};
  const start=new THREE.Vector3(...positions[theme]),target=new THREE.Vector3(-.05,1.92,-.4);
  if(cell===40){start.set(10.3,8,14.1);target.set(0,2.48,-.45);}
  camera.position.copy(start);camera.lookAt(target);camera.updateMatrixWorld();
  let disposed=false;
  function update(timeSeconds=0,options={}){
    const t=THREE.MathUtils.clamp(Number(timeSeconds)||0,0,4),p=smooth(0,4,t),anticipate=smooth(.5,2.7,t);
    if(options.cameraMotion??cameraMotion){camera.position.copy(start).multiplyScalar(1-p*.105);camera.position.x-=p*.7;camera.lookAt(target.x-p*.2,target.y,target.z);camera.updateMatrixWorld();}
    resetLiuKanshan(actor);rig.torso.scale.y=1+Math.sin(t*2.2)*.012;rig.head.rotation.y=.1+anticipate*.24;rig.head.rotation.x=anticipate*.06;
    // Ends with attention/hesitation: nobody signs, speaks, cleans, repairs or leaves.
    rig.arms[1].joint.rotation.z=.1+anticipate*.28;rig.arms[1].joint.rotation.x=-anticipate*.28;
    const blink=Math.max(0,1-Math.abs(t-2.85)/.095);for(const eye of rig.eyes)eye.scale.y=.055*(1-blink*.9);
    moving.forEach((person,i)=>{person.rotation.z=Math.sin(t*1.8+i)*.009;});
    if(theme==='presentation'){action.leaving.position.z=-2.9-smooth(0,1.7,t)*1.12;action.leaving.visible=Boolean(CELL_THEME[cell])&&t<2;rig.head.rotation.y=.35-anticipate*.4;rig.arms[1].joint.rotation.z=.1+anticipate*.43;}
    if(theme==='incident'){for(const led of action.alerts)led.material.emissive.setRGB(.38+.3*Math.sin(t*7),.08,.025);action.beacon.material.emissiveIntensity=.6+.6*Math.sin(t*7)**2;rig.head.rotation.y=.15+anticipate*.5;}
    if(theme==='review'){action.colleague.userData.arms[0].rotation.x=-smooth(.3,1.7,t)*1.04;action.colleague.userData.arms[0].rotation.z=-.28;rig.head.rotation.x=anticipate*.16;}
    if(theme==='home'){action.colleague.userData.arms[1].rotation.z=smooth(.5,2.1,t)*.63;rig.head.rotation.x=anticipate*.13;rig.arms[1].joint.rotation.z=.08;}
    if(theme==='care'){rig.head.rotation.y=.2+smooth(.5,1.7,t)*.27-smooth(2.1,3.4,t)*.59;rig.head.rotation.x=.11;action.phone.rotation.y=Math.sin(t*34)*.032*(smooth(1.8,2.1,t)-smooth(2.6,2.9,t));rig.arms[1].joint.rotation.z=.2;}
    if(theme==='banquet'){action.card.position.z=-.66+smooth(.4,1.8,t)*.72;action.host.userData.arms[1].rotation.x=-smooth(.2,1.3,t)*.8;action.colleague.userData.arms[0].rotation.z=-smooth(.6,2,t)*.65;rig.head.rotation.y=.37-smooth(2,3.6,t)*.35;}
    if(theme==='offer'||theme==='departure'){action.contract.position.z=-.7+smooth(.3,2,t)*.91;action.colleague.userData.arms[0].rotation.x=-.6*(smooth(.2,1,t)-smooth(2,3.2,t));rig.head.rotation.x=smooth(1,3,t)*.25;rig.arms[1].joint.rotation.x=-.1;}
    scene.updateMatrixWorld(true);
  }
  function dispose(){if(disposed)return;disposed=true;for(const a of actors)a.userData.dispose();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});environmentBatch?.dispose();for(const g of geometries)g.dispose();for(const m of materials.values())m.dispose();shadowDepth.dispose();shadowDistance.dispose();for(const texture of textures.values())texture.dispose();sun.shadow.map?.dispose();sun.shadow.mapPass?.dispose();scene.clear();}
  update(0);return {scene,camera,target,actors,theme,cell,environment:environment?.spec,update,dispose};
}
