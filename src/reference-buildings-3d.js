import * as THREE from 'three';
import {pastoralMaterial} from './pastoral-buildings.js';
import {getCellArt} from './reference-art-manifest.js';
import {batchExteriorDetails,disposeExteriorDetailInstances} from './reference-exterior-detail.js';
import {applyReferenceSurface} from './reference-surfaces.js';

// Native geometry interpretations of the user's 55 embedded reference images.
// Image 1/2 describe the existing character, so building references start at 3.
// Front faces +Z. The plinth fixes the exact footprint used by the map planner.
const ROWS=[
  ['大学图书馆','library',[3,4],8.8,7.4],['校招体育馆','stadium',[5],11,8.8],['城中村小楼','village',[6],7.2,6.8],
  ['开放式工位','office',[8],7.3,6.2],['公司茶水间','office-cafe',[8],7.1,6.2],['客户会议室','meeting',[7],7.4,6.2],
  ['狭窄小阳台','residential-night',[9,10],7,6.4],['楼道转角','stairs',[11],6.4,6.2],['总监办公室','director',[8],7.4,6.4],
  ['高铁检票口','rail',[12],10.5,7.5],['攻坚作战室','incident',[13,14],7.6,6.5],['深夜地铁站','subway',[15],8.3,7],
  ['跨部评审厅','review',[16,17],9,7.5],['弄堂生煎摊','breakfast',[18],7.5,6.6],['合租卫生间','rental',[19,20],7.2,6.6],
  ['园区露天椅','terrace',[21],7.5,6.4],['战略大礼堂','auditorium',[22],9.6,7.8],['急诊输液室','hospital',[23,24],10,8],
  ['高层观景台','observation',[25],8.6,7.2],['国际出发口','airport',[26],11,8.8],['炭火大排档','night-market',[27],9.1,7.7],
  ['校友宴会厅','banquet',[28],10,8.2],['典雅茶室','tea',[29],8,7.1],['夜晚天台','roof-garden',[30,31],7.3,6.8],
  ['家中小书房','study',[32,33],7.5,6.4],['创作者沙龙','salon',[34],8.2,7],['猎头会客室','headhunter',[35,36],7.5,6.4],
  ['预算会谈室','finance',[37,38],7.5,6.4],['红砖文创园','creative',[39,40],9.6,8],['房屋交易厅','property',[41,42],9.2,7.6],
  ['人事谈话间','hr',[43],7.4,6.4],['地下车库','garage',[44,45],8.8,7.5],['医院候诊区','winter-hospital',[46,47,48],10,8],
  ['咨询工作室','studio',[49],7.7,6.6],['自家暖客厅','home',[50],7.2,6.8],['公共服务厅','public-service',[51],9.1,7.6],
  ['老街空店铺','old-shop',[52],8.5,6.8],['深山温泉屋','onsen',[53],9.4,8],['社区公园椅','park',[54],8,7.1],
  ['岁月星图殿','star-hall',[55],11,9],
];
export const REFERENCE_BUILDING_SPECS=Object.freeze(ROWS.map(([name,kind,ids,width,depth],i)=>{const art=getCellArt(i+1);return Object.freeze({cell:i+1,id:`reference-cell-${String(i+1).padStart(2,'0')}`,stationIndex:i,name,kind,referenceIds:Object.freeze([...new Set([...art.exterior,...art.interior,...art.shared])].sort((a,b)=>a-b)),width,depth,front:depth*.55,back:depth*.45,preferredSide:i%2?-1:1});}));

const materials=new Map(),geometries=new Map();
const COLORS={stone:'#c5bba4',cream:'#efe3c9',white:'#e7ebdf',snow:'#f4f7f1',wall:'#dad8bf',wood:'#a96e42',dark:'#574b40',roof:'#bd6345',slate:'#405767',blue:'#477eaa',glass:'#82b6cf',metal:'#647477',gold:'#d7b166',red:'#b65847',green:'#668b59',ink:'#273d54',warm:'#e2bb74'};
function material(color){const pattern=['wood','dark'].includes(color)?'wood':['roof','slate'].includes(color)?'roof':['wall','cream','red'].includes(color)?'brick':color==='stone'?'stone':null;const resolved=COLORS[color]||color,key=`${resolved}:${pattern}`;if(!materials.has(key)){const emitter=color==='window-glow'||color==='lamp-glow';const m=color==='glass'||color==='window-warm'?new THREE.MeshStandardMaterial({color:color==='window-warm'?'#dab578':resolved,roughness:.26,metalness:.12,transparent:true,opacity:color==='window-warm'?.23:.55,depthWrite:false}):emitter?new THREE.MeshStandardMaterial({color:color==='lamp-glow'?'#ffe0a1':'#976b3f',emissive:'#ffc16a',emissiveIntensity:.24,roughness:.82}):pastoralMaterial(resolved,pattern);m.userData.sharedReferenceResource=true;if(emitter)m.userData.daylightEmitter=true;materials.set(key,m);}return materials.get(key);}
function geometry(key,make){if(!geometries.has(key)){const g=make();g.userData.sharedReferenceResource=true;geometries.set(key,g);}return geometries.get(key);}
function mesh(g,geo,color,x=0,y=0,z=0,name='detail'){const m=new THREE.Mesh(geo,material(color));m.position.set(x,y,z);m.name=name;m.castShadow=m.receiveShadow=true;g.add(m);return m;}
function box(g,w,h,d,color,x=0,y=h/2,z=0,name='solid-block'){const m=mesh(g,geometry('box',()=>new THREE.BoxGeometry(1,1,1)),color,x,y,z,name);m.scale.set(w,h,d);applyReferenceSurface(m,m.material.userData.referencePattern);return m;}
function cyl(g,r,h,color,x=0,y=h/2,z=0,rTop=r,n=12,name='solid-column'){const key=`cyl:${rTop/r}:${n}`;const m=mesh(g,geometry(key,()=>new THREE.CylinderGeometry(rTop/r,1,1,n)),color,x,y,z,name);m.scale.set(r,h,r);return m;}
function orb(g,r,color,x,y,z,scale=[1,1,1],name='foliage'){const m=mesh(g,geometry('orb',()=>new THREE.IcosahedronGeometry(1,1)),color,x,y,z,name);m.scale.set(r*scale[0],r*scale[1],r*scale[2]);return m;}
function beam(g,a,b,width,color,name='structural-beam'){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),m=box(g,width,va.distanceTo(vb),width,color,0,0,0,name);m.position.copy(va).add(vb).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return m;}
function detail(node){node.userData.exteriorDetail=true;return node;}
function dbox(...args){return detail(box(...args));}
function dorb(...args){return detail(orb(...args));}
function dbeam(...args){return detail(beam(...args));}
function roof(g,w,d,y,rise,color='roof',x=0,z=0){
  const angle=Math.atan2(rise,w/2),slope=Math.hypot(w/2,rise);
  for(const side of [-1,1]){const m=box(g,slope+.18,.19,d+.24,color,x+side*w/4,y+rise/2,z,'pitched-roof');m.rotation.z=-side*angle;}
  box(g,.18,.18,d+.26,color,x,y+rise+.04,z,'roof-ridge');
  if(color==='snow'){
    for(const side of [-1,1])for(let i=0;i<Math.ceil(d/.58);i++)dorb(g,.19,'snow',x+side*w*.49,y+.13,z-d/2+.25+i*.54,[1.25,.36,1.15],'irregular-snow-eave');
    for(const side of [-1,1])for(let i=0;i<Math.ceil(d/.67);i++){
      const t=.2+(i%3)*.19,drift=dbox(g,slope*(.23+(i%2)*.14),.034,.26+(i%2)*.17,i%3===0?'#e1e8e4':'snow',x+side*w/2*(1-t),y+rise*t+.13,z-d/2+.32+i*.62,'wind-shaped-roof-snow');drift.rotation.z=-side*angle;
    }
    return;
  }
  const gable=geometry('solid-triangular-gable',()=>{const shape=new THREE.Shape();shape.moveTo(-.5,0);shape.lineTo(.5,0);shape.lineTo(0,1);shape.closePath();return new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false});});
  for(const front of [-1,1]){
    const m=detail(mesh(g,gable,'wood',x,y-.035,z+front*(d/2-.06),'solid-roof-gable'));m.scale.set(w-.22,rise-.06,.11);
    for(const side of [-1,1])dbeam(g,[x+side*w*.505,y-.04,z+front*(d/2+.14)],[x,y+rise+.1,z+front*(d/2+.14)],.13,'dark','layered-gable-fascia');
  }
  for(const side of [-1,1]){
    dbox(g,.16,.24,d+.28,'dark',x+side*w*.49,y-.08,z,'deep-eave-fascia');
    dbox(g,.28,.075,d+.34,'wood',x+side*w*.49,y+.075,z,'eave-coping');
    for(let i=0;i<Math.ceil(d/.55);i++)dbox(g,.43,.12,.085,'wood',x+side*(w/2-.18),y-.22,z-d/2+.21+i*.54,'exposed-rafter-tail');
    for(let row=1;row<Math.ceil(slope/.36);row++){
      const t=row/Math.ceil(slope/.36),m=dbox(g,.047,.025,d+.24,color==='roof'?'#995b3e':'#54616a',x+side*w/2*(1-t),y+rise*t+.115,z,'overlapping-roof-course');m.rotation.z=-side*angle;
    }
  }
}
function win(g,x,y,z,w=.9,h=1,side=false,warm=false){
  const group=new THREE.Group();group.name='layered-window';group.position.set(x,y,z);if(side)group.rotation.y=Math.PI/2;g.add(group);
  box(group,w+.16,h+.16,.12,'dark',0,0,0,'window-frame');
  box(group,w-.04,h-.03,.04,warm?'window-glow':'#38596a',0,0,.075,'window-interior-depth');
  box(group,w-.08,h-.08,.035,warm?'window-warm':'glass',0,0,.12,'recessed-window');
  for(const xx of [-1,1])dbox(group,.065,h+.12,.1,'wood',xx*w/2,0,.155,'window-jamb');
  for(const yy of [-1,1])dbox(group,w+.19,.075,.17,'wood',0,yy*h/2,.18,'window-head-and-sill');
  dbox(group,w+.29,.095,.3,'stone',0,-h/2-.08,.14,'projecting-window-sill');
  dbox(group,w+.2,.065,.22,'dark',0,h/2+.095,.125,'window-drip-cap');
  dbox(group,.044,h-.08,.052,'dark',0,0,.178,'window-casement');
  for(const yy of [-.16,.28])dbox(group,w-.07,.042,.052,'dark',0,h*yy,.178,'window-transom');
  if(w>1.1)for(const xx of [-.3,.3])dbox(group,.038,h-.08,.055,'dark',w*xx,0,.18,'window-casement');
  if(warm){
    dbox(group,w*.17,h*.55,.025,'#ddba83',-w*.34,-h*.1,.145,'drawn-back-curtain');
    dbox(group,w*.12,h*.55,.025,'#c9a877',w*.37,-h*.1,.146,'drawn-back-curtain');
    for(let i=0;i<3;i++)dbox(group,w*.1,h*(.13+i*.035),.07,['#708271','#b17c5f','#cbb078'][i],w*(-.16+i*.15),-h*.33,.155,'window-interior-books');
  }else{const reflection=dbox(group,w*.17,h*.31,.008,'#b2d0cf',w*.21,h*.2,.146,'glass-sky-reflection');reflection.rotation.z=-.24;}
  return group;
}
function door(g,x,z,w=1.1,h=1.8,y=.13){
  box(g,w+.18,h+.14,.18,'dark',x,y+h/2,z,'door-frame');box(g,w,h,.08,'wood',x,y+h/2,z+.075,'entrance-door');
  dbox(g,w*.76,h*.54,.045,'glass',x,y+h*.67,z+.15,'door-upper-glazing');
  for(const xx of [-.27,.27])dbox(g,w*.38,h*.22,.04,'dark',x+xx*w,y+h*.18,z+.145,'recessed-door-panel');
  for(const xx of [-.48,0,.48])dbox(g,.047,h,.06,'wood',x+xx*w,y+h/2,z+.2,'door-stile');
  dbox(g,w+.29,.09,.27,'stone',x,y-.015,z+.09,'entrance-threshold');dbox(g,.04,.2,.055,'gold',x+w*.13,y+h*.45,z+.25,'door-pull');
}
function steps(g,w,z,count=3){for(let i=0;i<count;i++)box(g,w,.15*(count-i),.32,'stone',0,.075*(count-i),z+i*.31,'entrance-step');}
function railing(g,w,x,y,z){box(g,w,.075,.08,'metal',x,y+.65,z,'railing-top');for(let i=0;i<=Math.round(w/.35);i++)box(g,.055,.64,.06,'metal',x-w/2+i*w/Math.round(w/.35),y+.32,z,'railing-post');}
function tree(g,x,z,season=0,size=1,y=0){
  cyl(g,.14*size,1.7*size,'wood',x,y+.85*size,z,.1*size,7,'tree-trunk');
  const palettes=[['#467247','#658c40','#8dad4f','#e4b4bf'],['#386d46','#568440','#7a9c47','#9daf58'],['#657941','#a6913e','#c09a47','#b67242'],['#466d60','#678676','#86a28d','#dce5dd']],palette=palettes[season];
  orb(g,.61*size,palette[0],x,y+1.94*size,z,[1,1.13,1],'seasonal-foliage');
  for(let i=0;i<12;i++){
    const a=i*2.39996,rr=(i<7?.52:.3)*size,yy=y+(i<7?1.72:2.3)*size;
    dorb(g,(.26+(i%3)*.055)*size,palette[season===0&&i%5!==0?1+i%2:1+i%3],x+Math.cos(a)*rr,yy+(i%2)*.17*size,z+Math.sin(a)*rr,[1,.88,1],'layered-canopy-cluster');
    if(i<4)dbeam(g,[x,y+1.15*size,z],[x+Math.cos(a)*rr,yy,z+Math.sin(a)*rr],.065*size,'wood','branch-under-canopy');
  }
  if(season===3)orb(g,.57*size,'snow',x,y+2.52*size,z,[1,.23,1],'seasonal-snow');
}
function planter(g,x,z,season=0,w=.8){
  box(g,w,.28,.58,'wood',x,.14,z,'planter');dbox(g,w-.09,.045,.47,'dark',x,.295,z,'planter-soil');
  for(const side of [-1,1]){dbox(g,w+.06,.055,.075,'wood',x,.295,z+side*.275,'raised-planter-lip');for(const xx of [-.39,.39])dbox(g,.055,.3,.055,'dark',x+xx*w,.17,z+side*.3,'planter-corner-brace');}
  for(let i=0;i<5;i++){const xx=x-w*.36+i*w*.18,zz=z+Math.sin(i*2.4)*.12;
    dorb(g,.16,'#4b7351',xx,.37,zz,[1,.9,1],'planter-leaf');
    dorb(g,.105,['#819a56','#7e9e4c','#ab914a','#88a28d'][season],xx+.04,.48,zz,[1,.8,1],'planter-new-growth');
    if(season!==3&&i%2===0){dorb(g,.06,['#edd6c0','#ddb879','#b67d5c'][season],xx,.56,zz,[1,.65,1],'planter-flower');dorb(g,.025,'gold',xx,.597,zz,[1,.65,1],'flower-heart');}
  }
}
function lamp(g,x,z,h=2.4){cyl(g,.055,h,'dark',x,h/2,z,.055,8,'lamp-post');box(g,.27,.36,.27,'lamp-glow',x,h,z,'lamp-lantern');box(g,.35,.08,.35,'dark',x,h+.23,z);}
function bench(g,x,z,rotation=0){const b=new THREE.Group();b.position.set(x,0,z);b.rotation.y=rotation;g.add(b);for(const zz of [-.18,0,.18])box(b,1.65,.1,.13,'wood',0,.55,zz,'bench-seat');for(const yy of [.9,1.13])box(b,1.65,.12,.09,'wood',0,yy,-.26,'bench-back');for(const xx of [-.62,.62])box(b,.1,.56,.44,'metal',xx,.28,0,'bench-leg');return b;}
function table(g,x,z,r=.6){cyl(g,r,.13,'wood',x,.86,z,r,16,'table-top');cyl(g,.075,.78,'dark',x,.4,z);for(const [dx,dz] of [[-r-.3,0],[r+.3,0],[0,r+.3]]){cyl(g,.22,.11,'wood',x+dx,.49,z+dz);cyl(g,.07,.44,'dark',x+dx,.25,z+dz);}}
function sign(g,w,x,y,z,color='blue',symbol='lines'){box(g,w,.46,.17,color,x,y,z,'dimensional-sign');if(symbol==='cross'){box(g,.12,.31,.05,'white',x,y,z+.12);box(g,.32,.11,.05,'white',x,y,z+.12);}else for(let i=0;i<3;i++)box(g,w*.18,.045,.05,'cream',x-w*.29+i*w*.29,y,z+.12,'raised-sign-mark');}
function awning(g,w,x,y,z,color='green',d=.95){for(let i=0;i<8;i++){const b=box(g,w/8,.1,d,i%2?'cream':color,x-w/2+(i+.5)*w/8,y,z,'striped-canopy');b.rotation.x=.11;box(g,w/8,.2,.08,i%2?'cream':color,x-w/2+(i+.5)*w/8,y-.12,z+d/2);}}
function smallCar(g,x,z,color='blue'){box(g,1,.4,1.85,color,x,.38,z,'car-body');box(g,.82,.42,.97,'glass',x,.78,z-.05,'car-cabin');for(const xx of [-.52,.52])for(const zz of [-.57,.57]){const wheel=cyl(g,.2,.12,'dark',x+xx,.24,z+zz,.2,10,'car-wheel');wheel.rotation.z=Math.PI/2;}box(g,.84,.09,.08,'warm',x,.45,z+.95,'car-lights');}

function ring(g,rx,rz,ix,iz,h,y,color,name='open-roof-ring'){
  const key=`ring:${rx}:${rz}:${ix}:${iz}`;
  const geo=geometry(key,()=>{const shape=new THREE.Shape();shape.absellipse(0,0,rx,rz,0,Math.PI*2,false);const hole=new THREE.Path();hole.absellipse(0,0,ix,iz,0,Math.PI*2,true);shape.holes.push(hole);const out=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,curveSegments:28});out.rotateX(-Math.PI/2);return out;});
  const m=mesh(g,geo,color,0,y,0,name);m.scale.y=h;return m;
}
function torus(g,r,t,color,x,y,z,rotation=[0,0,0],scale=[1,1,1],name='solid-ring'){
  const m=mesh(g,geometry(`torus:${r}:${t}`,()=>new THREE.TorusGeometry(r,t,6,32)),color,x,y,z,name);m.rotation.set(...rotation);m.scale.set(...scale);return m;
}
function snowRoof(g,w,d,y,rise,x=0,z=0){roof(g,w,d,y+.11,rise,'snow',x,z);}
function gardenEdges(g,season,w=6,d=4.8){for(const [x,z] of [[-w/2,d/2],[w/2,d/2],[-w/2,-d/2]])planter(g,x,z,season);lamp(g,w/2,-d/2,2.2);}
function bookshelf(g,x,z,w=1.5,h=2.2,y=0){box(g,w,h,.34,'dark',x,y+h/2,z,'bookcase-body');for(let row=0;row<4;row++){const yy=y+.3+row*h/4;box(g,w,.07,.48,'wood',x,yy-.16,z+.06,'shelf-board');for(let i=0;i<5;i++)box(g,w*.12,.28+(i%3)*.05,.25,['red','green','blue','gold'][i%4],x-w*.37+i*w*.18,yy,z+.19,'individual-book');}}
function chair(g,x,z,color='blue',y=0,turn=0){const c=new THREE.Group();c.position.set(x,y,z);c.rotation.y=turn;g.add(c);box(c,.58,.14,.58,color,0,.46,0,'chair-seat');box(c,.58,.68,.14,color,0,.85,-.26,'chair-back');for(const xx of [-.21,.21])for(const zz of [-.21,.21])box(c,.06,.43,.06,'metal',xx,.22,zz);}
function desk(g,x,z,w=1.8,computer=true){box(g,w,.13,.9,'wood',x,.94,z,'desk-surface');for(const xx of [-w*.4,w*.4])box(g,.12,.89,.62,'dark',x+xx,.45,z);if(computer){box(g,.75,.55,.085,'ink',x,1.35,z-.15,'monitor');box(g,.65,.4,.09,'glass',x,1.36,z-.1,'monitor-screen');box(g,.08,.19,.1,'metal',x,1.02,z-.14);box(g,.68,.035,.21,'cream',x,1.02,z+.22,'keyboard');}}
function coffeeSet(g,x,y,z){cyl(g,.18,.31,'cream',x,y+.15,z,.18,10,'cup');torus(g,.11,.025,'cream',x+.19,y+.16,z,[0,Math.PI/2,0],[1,1,1],'cup-handle');}

function ivy(g,x,y,z,h=2.5,w=.7,season=0,side=false){
  const vine=new THREE.Group();vine.position.set(x,y,z);if(side)vine.rotation.y=Math.PI/2;g.add(vine);
  const palette=season===2?['#556d3b','#9b873c','#ac6f40']:season===3?['#476858','#688574','#a3b9a5']:['#3d6e45','#678641','#8ea853'];
  for(let branch=0;branch<3;branch++){
    const xx=(branch-1)*w*.31;dbeam(vine,[xx,0,0],[xx+w*.18,h*(.73+branch*.12),.045],.025,'wood','climbing-vine-stem');
    for(let i=0;i<19;i++){const phase=i*2.39996+branch*1.3,yy=(i/19+.034*Math.sin(phase))*h,spread=w*(.18+.1*Math.sin(i*.8)),dx=xx+Math.sin(phase)*spread;
      const leaf=dorb(vine,.07+(i%3)*.012,palette[(i+branch)%3],dx,yy,.05+(i%3)*.011,[1.3,.83,.44],'individual-ivy-leaf');leaf.rotation.z=Math.sin(phase)*.74;
    }
  }
}
function flowerBed(g,x,z,w,d,season=0){
  dbox(g,w,.08,d,season===3?'snow':'#5f7850',x,.05,z,'garden-bed-ground');
  for(let i=0;i<Math.ceil(w/.32);i++){
    const xx=x-w/2+.17+i*.31;dorb(g,.17,'#476a48',xx,.19,z,[1,.86,1.3],'garden-understory');
    dorb(g,.1,season===2?'#b39a53':season===3?'#b1c0ac':'#8ca05a',xx+.04,.31,z-.05,[1,.8,1.2],'garden-midgrowth');
    if(i%2===0)dorb(g,.063,season===3?'snow':season===2?'#ddba75':'#ecd4be',xx,.41,z+.04,[1,.66,1],'garden-flower-cluster');
  }
  for(const end of [-1,1])dbox(g,w,.13,.09,'wood',x,.13,z+end*d/2,'flower-bed-edging');
}
function gardenShrub(g,x,z,season=0,size=1,y=0){
  const colors=season===2?['#576d36','#91983e','#c8a34d']:season===3?['#4a6856','#748c73','#d1ded0']:['#416638','#709448','#a1b455'];
  for(let i=0;i<27;i++){const a=i*2.39996,r=(.21+.12*Math.sin(i*1.31))*size,yy=y+(.2+.37*(1-i/34))*size;
    const leaf=dorb(g,(.085+i%3*.018)*size,colors[i%3],x+Math.cos(a)*r,yy,z+Math.sin(a)*r,[1.4,.59,1],'garden-individual-shrub-leaf');leaf.rotation.set(.3*Math.cos(a),a,.38*Math.sin(a));
    if(season!==3&&i%8===0)dorb(g,.033*size,season===2?'#f0cc76':'#f1dfb9',x+Math.cos(a)*r,yy+.075*size,z+Math.sin(a)*r,[1,.65,1],'garden-small-blossom');
  }
}
function paving(g,x,z,w,d){
  const cols=Math.max(1,Math.floor(w/.37)),rows=Math.max(1,Math.floor(d/.4));
  for(let i=0;i<cols;i++)for(let j=0;j<rows;j++)dbox(g,w/cols-.025,.045,d/rows-.025,['#a99b80','#baad91','#c7b99b'][(i*7+j*3)%3],x-w/2+(i+.5)*w/cols,.025,z-d/2+(j+.5)*d/rows,'individual-courtyard-paver');
}
function fence(g,x,z,w,y=0){
  for(let i=0;i<=Math.ceil(w/.44);i++)dbox(g,.09,.65,.11,'wood',x-w/2+i*w/Math.ceil(w/.44),y+.34,z,'garden-fence-picket');
  for(const yy of [.19,.49])dbox(g,w,.07,.065,'dark',x,y+yy,z-.035,'garden-fence-rail');
}
function wallLantern(g,x,y,z){
  dbox(g,.08,.35,.12,'dark',x,y,z,'wall-lantern-bracket');dbox(g,.19,.3,.2,'lamp-glow',x,y-.06,z+.2,'wall-lantern-glow');
  for(const xx of [-.1,.1])dbox(g,.035,.34,.025,'dark',x+xx,y-.06,z+.305,'wall-lantern-frame');
  for(const yy of [-.25,.13])dbox(g,.27,.055,.27,'dark',x,y+yy,z+.2,'wall-lantern-cap');
}
function fir(g,x,z,season=3,size=1){
  detail(cyl(g,.095*size,2.8*size,'wood',x,1.4*size,z,.065*size,8,'fir-trunk'));
  for(let i=0;i<4;i++){
    const r=(.7-i*.12)*size,yy=(.93+i*.48)*size;
    const cone=detail(mesh(g,geometry('fir-tier',()=>new THREE.ConeGeometry(1,1,9)),i%2?'#52796a':'#3c6559',x,yy,z,'fir-branch-tier'));cone.scale.set(r,1.04*size,r);cone.rotation.y=i*.55;
    if(season===3){const snow=detail(mesh(g,geometry('fir-tier',()=>new THREE.ConeGeometry(1,1,9)),'snow',x,yy+.19*size,z,'fir-snow-tier'));snow.scale.set(r*.79,.72*size,r*.79);snow.rotation.y=i*.55;}
    for(let j=0;j<5;j++){
      const a=j/5*Math.PI*2+i*.57;
      dorb(g,r*.3,j%2?'#52796a':'#3c6559',x+Math.cos(a)*r*.69,yy-.17*size,z+Math.sin(a)*r*.69,[1.4,.68,1.1],'fir-needle-bough');
      if(season===3)dorb(g,r*.26,'snow',x+Math.cos(a)*r*.7,yy-.035*size,z+Math.sin(a)*r*.7,[1.25,.35,1.12],'snow-on-fir-bough');
    }
  }
}

// A swept, thick roof with rising eaves. Its silhouette and overlapping barrel
// tiles remain geometry when the camera moves around the courtyard.
function tiledEaveRoof(g,w,d,eave,rise,x=0,z=0,season=0){
  const roofProfile=t=>eave+rise*(1-t)*(1-t)+.2*Math.pow(t,7),segments=10;
  const key=`swept-eave:${w}:${d}:${eave}:${rise}`;
  const geo=geometry(key,()=>{
    const p=[],uv=[];
    const quad=(a,b,c,d,reverse=false)=>{const vertices=reverse?[[a,0,0],[d,0,1],[b,1,0],[b,1,0],[d,0,1],[c,1,1]]:[[a,0,0],[b,1,0],[d,0,1],[b,1,0],[c,1,1],[d,0,1]];for(const [point,u,v] of vertices){p.push(...point);uv.push(u,v);}};
    for(const side of [-1,1])for(let j=0;j<segments;j++){
      const t0=j/segments,t1=(j+1)/segments,z0=side*d/2*t0,z1=side*d/2*t1,y0=roofProfile(t0),y1=roofProfile(t1);
      quad([-w/2,y0,z0],[w/2,y0,z0],[w/2,y1,z1],[-w/2,y1,z1],side===1);
      quad([-w/2,y1-.12,z1],[w/2,y1-.12,z1],[w/2,y0-.12,z0],[-w/2,y0-.12,z0],side===1);
      for(const xx of [-w/2,w/2])quad([xx,y0,z0],[xx,y1,z1],[xx,y1-.12,z1],[xx,y0-.12,z0]);
      if(j===segments-1)quad([-w/2,y1,z1],[w/2,y1,z1],[w/2,y1-.12,z1],[-w/2,y1-.12,z1]);
    }
    const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(p,3));out.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));out.computeVertexNormals();return out;
  });
  mesh(g,geo,season===3?'snow':'slate',x,0,z,'sweeping-tiled-roof');
  const tileGeo=geometry('raised-half-round-roof-tile',()=>new THREE.CylinderGeometry(1,1,1,8,1,false));
  const cols=Math.ceil(w/.29),courses=Math.ceil(d/2/.32);
  for(const side of [-1,1])for(let col=0;col<cols;col++)for(let row=0;row<courses;row++){
    const t0=row/courses,t1=Math.min(1,(row+1.16)/courses),a=new THREE.Vector3(x-w/2+(col+.5)*w/cols,roofProfile(t0)+.062,z+side*d/2*t0),b=new THREE.Vector3(a.x,roofProfile(t1)+.062,z+side*d/2*t1);
    const tile=detail(mesh(g,tileGeo,season===3?'snow':(row+col)%4?'#435464':'#5c6570',0,0,0,'overlapping-barrel-tile'));tile.position.copy(a).add(b).multiplyScalar(.5);tile.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());tile.scale.set(.085,a.distanceTo(b),.07);
  }
  for(let i=0;i<Math.ceil(w/.3);i++)dbox(g,.29,.16,.25,season===3?'snow':'#6b665e',x-w/2+.15+i*.3,eave+rise+.1,z,'segmented-ceramic-ridge');
  for(const side of [-1,1]){
    dbox(g,w+.06,.17,.15,'dark',x,roofProfile(1)-.12,z+side*d/2,'carved-eave-fascia');
    for(let i=0;i<Math.ceil(w/.35);i++)dbox(g,.09,.12,.38,'wood',x-w/2+.17+i*.35,roofProfile(1)-.23,z+side*(d/2-.1),'visible-timber-roof-bracket');
    for(const end of [-1,1])dbeam(g,[x+end*w/2,roofProfile(.74)-.035,z+side*d*.37],[x+end*(w/2+.17),roofProfile(1)+.13,z+side*(d/2+.11)],.12,'dark','rising-eave-corner');
  }
}
function latticePanel(g,x,y,z,w,h){
  dbox(g,w+.12,h+.12,.12,'dark',x,y,z,'carved-lattice-surround');dbox(g,w,h,.065,'window-glow',x,y,z+.075,'lit-lattice-depth');
  for(let i=0;i<=Math.floor(w/.2);i++)dbox(g,.032,h,.075,'wood',x-w/2+i*w/Math.floor(w/.2),y,z+.16,'fine-window-lattice');
  for(let j=0;j<=Math.floor(h/.26);j++)dbox(g,w,.032,.075,'wood',x,y-h/2+j*h/Math.floor(h/.26),z+.16,'fine-window-lattice');
  for(const yy of [-1,1])dbox(g,w+.15,.075,.18,'wood',x,y+yy*h/2,z+.16,'lattice-panel-frame');
}
function parasol(g,x,z,y=0,r=1.35,season=0){
  const canopy=geometry(`fabric-parasol:${r}`,()=>{const p=[],uv=[];for(let i=0;i<12;i++){const a=i/12*Math.PI*2,b=(i+1)/12*Math.PI*2;for(const [point,u,v] of [[[0,.52,0],.5,.5],[[Math.cos(b)*r,0,Math.sin(b)*r],1,0],[[Math.cos(a)*r,0,Math.sin(a)*r],0,0],[[0,.485,0],.5,.5],[[Math.cos(a)*r,-.035,Math.sin(a)*r],0,0],[[Math.cos(b)*r,-.035,Math.sin(b)*r],1,0]]){p.push(...point);uv.push(u,v);}}const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(p,3));out.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));out.computeVertexNormals();return out;});
  mesh(g,canopy,season===3?'snow':'#f0d7a3',x,y+2.43,z,'tailored-fabric-parasol');detail(cyl(g,.055,2.83,'wood',x,y+1.46,z,.055,10,'parasol-pole'));detail(cyl(g,.24,.1,'stone',x,y+.17,z,.24,12,'parasol-weighted-foot'));
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2,b=(i+1)/12*Math.PI*2;dbeam(g,[x,y+2.93,z],[x+Math.cos(a)*r,y+2.42,z+Math.sin(a)*r],.028,'wood','radial-parasol-rib');dbeam(g,[x+Math.cos(a)*r,y+2.41,z+Math.sin(a)*r],[x+Math.cos(b)*r,y+2.41,z+Math.sin(b)*r],.035,'#ba9870','parasol-stitched-edge');}
}
function foldingChair(g,x,z,turn=0){
  const c=new THREE.Group();c.position.set(x,.1,z);c.rotation.y=turn;g.add(c);dbox(c,.59,.09,.62,'cream',0,.48,0,'canvas-chair-seat');const back=dbox(c,.59,.57,.07,'cream',0,.85,-.28,'canvas-chair-back');back.rotation.x=-.14;
  for(const xx of [-.34,.34]){dbeam(c,[xx,.05,-.39],[xx,.7,.35],.065,'wood','folding-chair-cross-leg');dbeam(c,[xx,.05,.39],[xx,1.18,-.37],.065,'wood','folding-chair-back-support');dbox(c,.08,.07,.64,'wood',xx,.76,0,'folding-chair-arm');}
}
function menuBoard(g,x,z,turn=0){const m=new THREE.Group();m.position.set(x,0,z);m.rotation.y=turn;g.add(m);dbox(m,.86,1.22,.1,'wood',0,.79,0,'pavement-menu-frame');dbox(m,.72,1.05,.055,'#314d47',0,.8,.07,'pavement-menu-blackboard');for(let i=0;i<5;i++)dbox(m,.47-i%2*.1,.027,.025,'cream',0,1.17-i*.17,.112,'chalk-menu-line');for(const xx of [-.37,.37])for(const side of [-1,1])dbeam(m,[xx,.03,side*.25],[xx,1.44,0],.07,'wood','folding-menu-leg');}

function library(g,season){
  box(g,6.8,4.2,4.9,'wood',0,2.15,0,'library-main-hall');
  for(const y of [.18,2.2,4.28])box(g,7,.15,5.02,'dark',0,y,0,'timber-floor-band');
  const crossRoof=new THREE.Group();crossRoof.rotation.y=Math.PI/2;g.add(crossRoof);roof(crossRoof,5.35,6.95,4.35,1.52,'roof');roof(g,2.9,3.2,4.25,2.05,'roof',0,1.3);
  for(const x of [-2.35,2.35])for(const y of [1.27,3.25]){win(g,x,y,2.53,1.56,1.25,false,true);}
  win(g,0,3.38,2.58,1.45,1.2);win(g,0,5.15,2.99,.66,.72);door(g,0,2.55,1.35,1.9);
  for(const z of [-1.5,.1,1.55])win(g,3.45,2.6,z,.95,1.4,true,true);
  for(const x of [-2.1,2.1]){box(g,.43,.85,.48,'red',x,5.82,-1.25,'library-chimney');box(g,.6,.13,.62,'dark',x,6.27,-1.25);}
  for(const x of [-3.24,-1.16,1.16,3.24])dbox(g,.11,4.18,.17,'dark',x,2.14,2.53,'library-timber-post');
  for(const x of [-2.36,2.36]){flowerBed(g,x,3.05,1.87,.58,season);fence(g,x,3.49,1.83);wallLantern(g,x/2,1.91,2.64);}
  for(const x of [-4.2,4.21]){flowerBed(g,x,.5,.64,1.23,season);tree(g,x,.02,season,1.1);}
  paving(g,0,3.09,1.7,1.04);ivy(g,-3.2,.4,2.59,1.6,.42,season);
  const notice=new THREE.Group();notice.position.set(-3.54,0,2.48);notice.rotation.y=.25;g.add(notice);for(const x of [-.33,.33])dbox(notice,.065,1.42,.07,'wood',x,.71,0,'notice-board-leg');dbox(notice,.8,.79,.11,'dark',0,1.02,0,'library-notice-board');for(let i=0;i<3;i++)dbox(notice,.16,.25,.02,['cream','warm','stone'][i],-.23+i*.23,1.07,.07,'library-notice-paper');
  sign(g,2.1,0,2.44,2.68,'cream');steps(g,2.1,2.65);gardenEdges(g,season,6.8,6.1);tree(g,-3.65,-1.65,season,.8);if(season===3){snowRoof(crossRoof,5.3,6.92,4.39,1.52);snowRoof(g,2.85,3.2,4.29,2.05,0,1.3);}
}
function stadium(g,season){
  const turf=cyl(g,1,.16,'green',0,.08,0,1,48,'stadium-pitch');turf.scale.set(4.2,.16,2.8);
  ring(g,5,3.65,4.62,3.28,1.7,.1,'wood','stadium-elliptical-wall');
  for(let i=0;i<4;i++)ring(g,4.5-i*.28,3.13-i*.23,4.23-i*.28,2.91-i*.23,.2,1.4-i*.28,i%2?'red':'blue','stadium-tiered-seats');
  const canopyPoint=(a,t,drop=0)=>{const rx=3.13+(5.25-3.13)*t,rz=1.92+(3.85-1.92)*t;return [Math.cos(a)*rx,2.12+.58*Math.sin(Math.PI*t)+.31*Math.sin(a*2+.55)-drop,Math.sin(a)*rz];};
  const shell=geometry('undulating-stadium-shell',()=>{const p=[],uv=[];const tri=(a,b,c)=>{p.push(...a,...b,...c);uv.push(0,0,1,0,1,1);};for(let i=0;i<80;i++)for(let j=0;j<9;j++){
    const a=i/80*Math.PI*2,b=(i+1)/80*Math.PI*2,t=j/9,u=(j+1)/9,A=canopyPoint(a,t),B=canopyPoint(b,t),C=canopyPoint(b,u),D=canopyPoint(a,u);tri(A,B,C);tri(A,C,D);
    const E=canopyPoint(a,t,.13),F=canopyPoint(b,t,.13),G=canopyPoint(b,u,.13),H=canopyPoint(a,u,.13);tri(E,G,F);tri(E,H,G);if(j===0){tri(A,E,F);tri(A,F,B);}if(j===8){tri(D,C,G);tri(D,G,H);}
  }const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(p,3));out.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));out.computeVertexNormals();return out;});
  mesh(g,shell,season===3?'snow':'white',0,0,0,'stadium-open-canopy');
  for(let i=0;i<64;i++){const a=i/64*Math.PI*2;dbeam(g,[Math.cos(a)*5.035,.17,Math.sin(a)*3.68],[Math.cos(a)*5.035,2.07+.31*Math.sin(a*2+.55),Math.sin(a)*3.68],.09,i%3?'wood':'#ba8353','stadium-timber-fin');}
  for(let i=0;i<40;i++){const a=i/40*Math.PI*2;for(let j=0;j<9;j++){const p=canopyPoint(a,j/9),q=canopyPoint(a,(j+1)/9);p[1]+=.02;q[1]+=.02;dbeam(g,p,q,.034,'#a9b9c2','stadium-curving-standing-seam');}}
  for(let row=0;row<4;row++)for(let i=0;i<66;i++){const a=i/66*Math.PI*2;if(i%11===0)continue;const seat=dbox(g,.17,.065,.13,(i+row)%7?'#386ba3':'#b65b49',Math.cos(a)*(4.38-row*.28),1.57-row*.28,Math.sin(a)*(3.01-row*.23),'individual-stadium-seat');seat.rotation.y=-a;}
  for(const z of [-1.75,1.75])box(g,5.6,.025,.04,'cream',0,.2,z,'pitch-marking');for(const x of [-2.8,0,2.8])box(g,.04,.025,3.5,'cream',x,.2,0,'pitch-marking');torus(g,.63,.026,'white',0,.23,0,[Math.PI/2,0,0]);
  for(const x of [-2.7,2.7]){beam(g,[x,.22,-.5],[x,1,-.5],.05,'white');beam(g,[x,.22,.5],[x,1,.5],.05,'white');beam(g,[x,1,-.5],[x,1,.5],.05,'white');}
  box(g,3.2,1.48,.7,'cream',0,.8,3.5,'stadium-entrance');for(const x of [-1,0,1])door(g,x,3.9,.7,1.22);sign(g,2.65,0,1.69,3.88);steps(g,3.1,3.95,2);tree(g,-4.5,2.85,season,.58);
  for(const x of [-3.45,3.45]){flowerBed(g,x,3.53,1.15,.53,season);lamp(g,x,4.03,1.92);}for(const x of [-2.75,2.75]){dbox(g,.055,1.86,.06,'metal',x,.94,4.02,'stadium-banner-pole');dbox(g,.3,.72,.045,x<0?'blue':'gold',x+.15,1.44,4.02,'stadium-festival-banner');}
}
function apartments(g,season,{floors=3,roofGarden=false,night=false,village=false}={}){
  const h=floors*1.8;box(g,4.5,h,3.85,'wall',0,h/2,0,'residential-main-mass');
  for(let floor=0;floor<floors;floor++){const y=floor*1.8;box(g,4.65,.14,4,'stone',0,y+.1,0,'residential-floor');
    for(const x of [-1.18,1.18]){win(g,x,y+1,2,.98,1.08,false,night);if(floor){box(g,1.85,.12,.65,'stone',x,y+.36,2.15,'projecting-balcony');railing(g,1.7,x,y+.42,2.48);const balconyPlants=new THREE.Group();balconyPlants.position.y=y+.43;g.add(balconyPlants);planter(balconyPlants,x-.45,2.22,season,.5);}}
    for(const z of [-1.15,.65])win(g,2.32,y+1,z,.82,1,true,night);
    const conditioner=new THREE.Group();conditioner.position.set(2.43,y+.52,-.23);conditioner.rotation.y=Math.PI/2;g.add(conditioner);dbox(conditioner,.52,.33,.28,'stone',0,0,0,'exterior-air-conditioner');for(let i=0;i<4;i++)dbox(conditioner,.37,.025,.025,'metal',0,-.11+i*.07,.155,'air-conditioner-grille');
    if(village){awning(g,.97,-1.18,y+1.7,2.2,floor%2?'green':'blue',.47);ivy(g,2.12,y+.35,2.09,1.23,.24,season);}
  }
  dbox(g,.065,h+.08,.07,'metal',-2.12,h/2,2.05,'residential-downpipe');for(let i=0;i<floors;i++)dbox(g,.13,.065,.08,'dark',-2.12,i*1.8+.65,2.09,'downpipe-collar');
  door(g,0,2.04,1.03,1.5);awning(g,4.1,0,1.75,2.21,village?'red':'blue',.62);
  box(g,4.75,.18,4.05,'stone',0,h+.08,0,'residential-flat-roof');
  for(const x of [-2.29,2.29])box(g,.12,.57,4.03,'wall',x,h+.37,0,'roof-parapet');box(g,4.67,.57,.12,'wall',0,h+.37,-1.96);
  const shed=box(g,1.8,1.2,1.45,'wood',-.65,h+.7,-.64,'rooftop-shed');roof(g,2,1.62,h+1.32,.45,'slate',-.65,-.64);win(g,-.64,h+.76,.12,.7,.66,false,true);
  cyl(g,.45,.93,'metal',1.4,h+.65,-.88,.45,12,'roof-water-tank');for(const yy of [h+.3,h+.64,h+1])cyl(g,.46,.04,'cream',1.4,yy,-.88);
  if(village){for(let i=0;i<14;i++)box(g,.64,.17,.28,'stone',2.65,.13+i*.27,1.5-i*.24,'external-stair-tread');box(g,2.65,.035,.035,'dark',-.2,3.4,2.73,'laundry-line');for(let i=0;i<4;i++)box(g,.42,.56+(i%2)*.2,.045,['cream','blue','red'][i%3],-1.1+i*.58,3.09,2.73,'hanging-laundry');}
  if(roofGarden){for(const x of [-1.6,1.6]){const p=new THREE.Group();p.position.y=h+.19;g.add(p);planter(p,x,1.25,season);}const b=bench(g,.1,.96);b.position.y=h+.18;}
  tree(g,-2.85,1.1,season,.63);lamp(g,2.7,2.2,2.55);if(season===3)box(g,4.53,.08,3.81,'snow',0,h+.22,0,'seasonal-snow-roof');
}
function villageCluster(g,season){
  const front=new THREE.Group();front.name='village-primary-tenement';apartments(front,season,{floors:4,village:true,roofGarden:true});front.scale.setScalar(.72);front.position.set(-1.55,0,.45);g.add(front);
  const right=new THREE.Group();right.name='village-secondary-tenement';apartments(right,season,{floors:3,roofGarden:true});right.scale.setScalar(.53);right.position.set(1.97,0,.28);g.add(right);
  box(g,2.6,4.7,2.1,'red',.15,2.35,-1.69,'village-rear-tenement');roof(g,2.78,2.3,4.8,.46,season===3?'snow':'slate',.15,-1.69);
  for(const x of [-.54,.72])for(const y of [1.05,2.38,3.75])win(g,x,y,-.58,.65,.89,false,true);
  box(g,.5,.055,3.85,'stone',.48,.075,.26,'village-narrow-alley');beam(g,[-.8,3.22,1.88],[2.5,3.22,1.88],.028,'dark','village-shared-laundry-line');for(let i=0;i<5;i++)box(g,.3,.46,.045,['cream','red','blue'][i%3],-.55+i*.56,2.96,1.88,'village-laundry');
  paving(g,.47,1.35,.66,3.35);paving(g,0,2.89,5.98,.7);
  for(const [x,z] of [[-3.03,-1.62],[3.03,-1.4],[-2.9,2.64],[2.7,2.61]]){tree(g,x,z,season,.58);flowerBed(g,x,z+.12,.58,.53,season);}
  for(const x of [-2.28,2.25]){
    dbox(g,.53,.63,.08,'red',x,2.87,1.98,'village-vertical-shop-sign');for(let i=0;i<3;i++)dbox(g,.25,.055,.024,'cream',x,3.08-i*.18,2.038,'shop-sign-letter-stroke');
    dbox(g,.64,.58,.49,'wood',x,.29,2.63,'street-produce-crate');for(let i=0;i<6;i++)dorb(g,.09,i%2?'#c88e48':'#8c9c47',x-.2+(i%3)*.2,.64,2.52+Math.floor(i/3)*.22,[1,1,1],'market-produce');
  }
  for(const x of [-2.82,2.81]){dbox(g,.06,4.65,.06,'dark',x,2.32,.32,'village-utility-pole');dbox(g,.58,.06,.08,'dark',x,4.37,.32,'utility-crossbar');}
  dbeam(g,[-2.82,4.32,.32],[-.1,3.98,.45],.018,'dark','sagging-alley-wire');dbeam(g,[-.1,3.98,.45],[2.81,4.32,.32],.018,'dark','sagging-alley-wire');
  ivy(g,-.76,.2,-.51,4.15,.47,season);ivy(g,1.46,.4,-.51,3.7,.36,season);
}
function office(g,season,{kind='office',height=6.8}={}){
  box(g,4.65,height,3.9,'#355668',0,height/2,0,'blue-glass-office');
  const floors=6,floorH=(height-1.65)/floors;
  for(const x of [-2.39,2.39])for(const z of [-1.96,1.96])box(g,.26,height+.25,.27,'cream',x,height/2,z,'office-stone-pier');
  for(let row=0;row<floors;row++){
    const y=1.67+row*floorH;dbox(g,4.85,.15,4.03,'cream',0,y,0,'office-horizontal-mullion');
    for(const side of [false,true])for(let col=0;col<(side?4:5);col++){
      const f=new THREE.Group();f.position.set(side?2.35:-1.85+col*.925,y+floorH*.51,side?-1.43+col*.955:1.99);if(side)f.rotation.y=Math.PI/2;g.add(f);
      dbox(f,side?.88:.84,floorH-.2,.035,['#37698a','#4f8aa5','#699eae'][(row+col)%3],0,0,.03,'office-reflective-window-bay');
      dbox(f,.037,floorH-.11,.1,'metal',-.44,0,.09,'office-slim-window-mullion');dbox(f,.82,.045,.09,'metal',0,-floorH*.36,.08,'office-window-sill');
      const reflection=dbox(f,.22,floorH*.5,.014,'#8bbfc5',.2,floorH*.04,.06,'office-glass-sky-glint');reflection.rotation.z=-.35;
      dbox(f,.34,.035,.09,'warm',-.1,-floorH*.23,.09,'office-visible-desk-edge');dbox(f,.16,.17,.028,'#284751',-.09,-floorH*.13,.1,'office-visible-monitor');if((row+col)%3===0)dorb(f,.065,'#7a9254',.23,-floorH*.19,.1,[1,1.7,.5],'office-window-pot');
    }
  }
  box(g,5,.22,4.22,season===3?'snow':'stone',0,height+.1,0,'office-roof');
  for(const z of [-2.01,2.01])dbox(g,4.94,.42,.12,'cream',0,height+.4,z,'office-roof-parapet');for(const x of [-2.43,2.43])dbox(g,.12,.42,3.95,'cream',x,height+.4,0,'office-roof-parapet');
  box(g,1.4,.54,1.12,'metal',.65,height+.47,-.55,'rooftop-air-conditioning');for(let i=0;i<8;i++)dbox(g,.075,.33,.035,'dark',.1+i*.16,height+.5,.03,'rooftop-air-conditioning-louvre');for(const x of [.29,1]){detail(torus(g,.21,.035,'dark',x,height+.76,-.56,[Math.PI/2,0,0],[1,1,1],'roof-cooling-fan-ring'));for(let i=0;i<3;i++){const blade=dbox(g,.37,.03,.055,'dark',x,height+.76,-.56,'cooling-fan-blade');blade.rotation.y=i*Math.PI/3;}}
  for(const x of [-1.95,-1.68])detail(cyl(g,.058,.85,'metal',x,height+.67,-1.32,.058,8,'rooftop-vent-stack'));
  for(const z of [-.8,-.11]){const panel=new THREE.Group();panel.position.set(-1.04,height+.57,z);panel.rotation.x=-.32;g.add(panel);dbox(panel,1.62,.08,.61,'blue',0,0,0,'solar-panel');for(let i=0;i<6;i++)dbox(panel,.019,.02,.58,'#a8c8d6',-.76+i*.3,.054,0,'solar-cell-grid');dbox(panel,1.6,.021,.018,'#a8c8d6',0,.054,0,'solar-cell-grid');}
  for(const x of [-1.47,1.47]){dbox(g,1.42,1.42,.06,'glass',x,.87,2.02,'lobby-full-height-window');dbox(g,.075,1.5,.11,'metal',x,.9,2.09,'lobby-window-mullion');}
  box(g,2.65,.13,1.23,'glass',0,1.93,2.48,'office-entrance-canopy');for(const x of [-1.3,1.3])dbeam(g,[x,2.36,2.06],[x,2,3.06],.05,'metal','canopy-tension-rod');door(g,0,2.09,1.2,1.75);sign(g,2.68,0,2.33,2.13,'blue');steps(g,2.25,2.72,2);
  if(kind==='office-cafe'){awning(g,2.7,1.1,1.55,2.52,'green',.84);table(g,1.55,3.45,.43);coffeeSet(g,1.55,.95,3.45);}
  if(kind==='incident'){for(const x of [-1.5,0,1.5])win(g,x,height-.8,2.08,1.1,.63,false,true);box(g,.35,.35,.3,'red',2.2,height+.38,1.6,'incident-warning-light');}
  if(kind==='director'){box(g,3.3,.15,1.15,'stone',0,height*.7,2.27,'director-balcony');railing(g,3.3,0,height*.7,2.83);}
  gardenEdges(g,season,6.1,5.6);tree(g,-3,-1.7,season,.8);tree(g,3.03,-1.45,season,.7);for(const x of [-2.7,2.7]){flowerBed(g,x,1.35,.62,1.18,season);wallLantern(g,x*.74,1.43,2.1);}paving(g,0,3.22,4.98,.56);
}
function roomPavilion(g,season,kind='meeting'){
  const warm=['study','headhunter','finance','hr'].includes(kind),h=3.35;
  box(g,6.2,.2,4.8,'wood',0,.1,0,'pavilion-floor');box(g,6.2,h,.21,warm?'wood':'cream',0,h/2,-2.28,'pavilion-back-wall');box(g,.18,h,4.6,'glass',-3,h/2,0,'pavilion-side-glazing');
  box(g,.18,h,4.6,'glass',3,h/2,0,'pavilion-side-glazing');
  for(const x of [-3,-1,1,3])box(g,.12,h,.12,'dark',x,h/2,2.25,'pavilion-front-frame');box(g,6.3,.17,.24,'dark',0,h,2.25,'pavilion-front-lintel');
  box(g,6.35,.18,2.8,season===3?'snow':'slate',0,h+.15,-.85,'pavilion-partial-roof');
  if(['meeting','review'].includes(kind)){
    box(g,3.5,.16,1.4,'wood',0,.94,.1,'conference-table');for(const x of [-1.15,1.15])box(g,.15,.88,.85,'dark',x,.45,.1);for(const x of [-1.2,0,1.2]){chair(g,x,-1.05,'blue');chair(g,x,1.25,'blue',0,Math.PI);}
    box(g,2.8,1.4,.12,'cream',0,2.15,-2.13,'presentation-board');for(let i=0;i<4;i++)box(g,.35,.24+i*.16,.06,['blue','green','gold','red'][i],-.8+i*.52,1.84+i*.08,-2.03,'dimensional-chart-bar');coffeeSet(g,.75,1.04,.3);
  }else if(kind==='study'){bookshelf(g,1.7,-1.93,2.05,2.65);bookshelf(g,-1.4,-1.93,1.25,2.65);desk(g,-.85,.3,2.1);chair(g,-.85,1.3,'dark',0,Math.PI);win(g,-2.95,1.8,-.5,1.5,1.6,true,true);coffeeSet(g,-1.55,1.02,.42);}
  else if(kind==='hr'){desk(g,0,-.3,2.85);chair(g,0,-1.5,'dark');chair(g,-.6,1.1,'blue',0,Math.PI);chair(g,.65,1.1,'blue',0,Math.PI);bookshelf(g,2.2,-1.92,.95,2.35);for(const x of [-.8,-.25,.5])box(g,.47,.04,.38,'cream',x,1.04,.15,'personnel-document');}
  else{for(const x of [-1.9,1.9]){box(g,1.06,.65,1.95,warm?'wood':'blue',x,.42,.15,'lounge-sofa');box(g,.22,1.08,1.95,'dark',x+(x<0?-.5:.5),.64,.15,'sofa-back');}box(g,1.8,.15,1.03,'dark',0,.58,.22,'consultation-coffee-table');for(const x of [-.45,.42])coffeeSet(g,x,.68,.17);bookshelf(g,1.9,-1.97,1.3,2.4);sign(g,1.5,-1.23,2.14,-2.08,warm?'dark':'blue');}
  gardenEdges(g,season,6.5,5.4);sign(g,1.6,0,h-.33,2.36,kind==='hr'?'blue':'dark');
}

function stairCorner(g,season){
  box(g,4.9,.22,4.7,'stone',0,.11,0,'stair-court-floor');box(g,4.9,4.7,.24,'wall',0,2.35,-2.2,'stair-back-wall');box(g,.24,4.7,4.65,'wall',-2.3,2.35,0,'stair-side-wall');
  for(let i=0;i<10;i++)box(g,2.35,.23*(10-i),.38,'stone',.65,.115*(10-i),-1.52+i*.38,'stair-solid-tread');
  box(g,4.48,.2,1.1,'stone',0,2.42,-1.63,'stair-upper-landing');railing(g,1.5,-1.47,2.52,-1.1);door(g,-.9,-2.04,.9,1.65,2.55);
  beam(g,[-.65,3.12,-1.42],[-.65,.99,1.96],.075,'wood','sloping-stair-handrail');for(let i=0;i<8;i++)box(g,.055,.68,.055,'metal',-.65,.66+(7-i)*.25,-.98+i*.39,'stair-guard-post');
  sign(g,.9,1.3,3.53,-2.03,'blue');sign(g,.65,-2.12,3.37,-.6,'red');cyl(g,.2,.52,'metal',1.77,2.78,-1.6,.2,10,'landing-bin');planter(g,-1.7,1.5,season,.7);if(season===3)box(g,4.8,.09,.38,'snow',0,4.74,-2.18,'seasonal-snow-coping');
}
function rail(g,season){
  box(g,8.7,.28,5.5,'stone',0,.14,0,'rail-terminal-platform');
  for(const z of [-1.66,-.85])box(g,8.55,.08,.075,'metal',0,.36,z,'rail-track');for(let i=0;i<20;i++)box(g,.12,.06,1.15,'wood',-4.1+i*.43,.29,-1.25,'rail-sleeper');
  box(g,6.55,1.15,1.33,'white',.55,.91,-1.27,'high-speed-train-body');const nose=orb(g,.8,'white',4,.92,-1.27,[1.1,.73,.84],'train-rounded-nose');
  for(let i=0;i<9;i++)box(g,.46,.43,.07,'ink',-2.23+i*.65,1.12,-.56,'train-window');box(g,6.7,.13,.08,'blue',.58,.61,-.54,'train-blue-stripe');
  for(const x of [-3.8,0,3.8]){box(g,.15,3.7,.15,'metal',x,1.85,1.64,'rail-glass-frame');beam(g,[x,3.7,1.64],[x,3.3,-1.86],.12,'metal');}
  box(g,8.1,.11,2.6,season===3?'snow':'glass',0,3.63,.46,'station-canopy');
  for(const x of [-3.4,-2.5,-1.6,-.7]){box(g,.36,.84,1,'metal',x,.7,1.31,'ticket-gate');box(g,.28,.12,.29,'blue',x,1.19,1.62,'gate-reader');box(g,.52,.26,.055,'glass',x+.32,.95,1.36,'gate-wing');}
  sign(g,3.1,.5,2.68,1.78,'ink');planter(g,3.64,2.23,season,.7);lamp(g,-4.06,2.27,2.38);
}
function subway(g,season){
  box(g,4.5,3.1,3.85,'cream',-.9,1.55,-.55,'subway-station-house');box(g,4.8,.2,4.1,season===3?'snow':'stone',-.9,3.17,-.55,'subway-flat-roof');
  for(const x of [-2.3,-.92,.45])win(g,x,2.26,1.44,1.05,.98);door(g,-1.26,1.49,1.25,1.6);sign(g,3.2,-.85,3.56,1.22,'blue');
  box(g,2.75,.16,3.2,'slate',2.12,.23,.7,'subway-entry-ramp');for(let i=0;i<8;i++)box(g,2,.09*(8-i),.29,'stone',2.1,.045*(8-i),-.2+i*.29,'subway-entry-stair');
  for(const x of [1,3.18])box(g,.2,2.65,2.4,'cream',x,1.33,.12,'subway-entry-wall');box(g,2.6,.35,2.5,season===3?'snow':'cream',2.1,2.83,.07,'subway-entry-canopy');
  for(const x of [1.22,2.95])beam(g,[x,1.5,-.5],[x,.8,2],.08,'metal','subway-stair-rail');sign(g,.58,3.24,2.36,1.41,'blue');tree(g,-3.5,1.15,season,.71);gardenEdges(g,season,7,5.7);
}
function civicHall(g,season,kind='review'){
  const auditorium=kind==='auditorium',property=kind==='property',civic=kind==='public-service';
  box(g,7.15,3.85,4.55,auditorium?'red':'cream',0,1.95,-.25,'civic-main-hall');
  for(const x of [-3.15,3.15]){box(g,.48,4.03,4.9,'stone',x,2.03,-.2,'hall-side-pier');for(const z of [-1.4,.1,1.55])win(g,x+(x>0?.26:-.26),2.1,z,.85,1.75,true);}
  for(const x of [-2.28,2.28])box(g,.25,3.5,.33,'stone',x,1.86,2.17,'hall-front-column');
  box(g,3.8,2.65,.18,'glass',0,1.5,2.12,'hall-glazed-entrance');for(const x of [-1.22,0,1.22])door(g,x,2.22,.99,2);
  if(auditorium){roof(g,7.5,4.95,3.96,1.13,'slate');box(g,4.8,.17,.28,'stone',0,3.94,2.39);sign(g,3.1,0,3.35,2.37,'red');if(season===3)snowRoof(g,7.48,4.92,4,1.13);}
  else{box(g,7.58,.25,4.88,season===3?'snow':'stone',0,3.98,-.23,'hall-flat-roof');box(g,3.5,.22,2.8,'glass',0,4.19,-.32,'hall-roof-skylight');sign(g,4.18,0,3.36,2.4,civic?'cream':'blue');}
  if(property){box(g,4.2,.12,1.18,'glass',0,2.49,2.53,'property-glass-portico');for(const x of [-1.92,1.92])box(g,.1,2.39,.1,'metal',x,1.2,3.03);}
  if(civic){for(const x of [-1.68,-.56,.56,1.68])cyl(g,.13,2.74,'cream',x,1.51,2.39,.13,10,'civic-column');orb(g,.29,'gold',0,4.35,2.2,[1,1,.2],'public-service-emblem');}
  steps(g,4.65,2.6,4);for(const x of [-3.12,3.12])tree(g,x,3.29,season,.66);gardenEdges(g,season,7.5,6.8);
}
function foodStall(g,season,night=false){
  box(g,5.1,2.6,2.8,'wood',0,1.3,-1.05,night?'night-market-kitchen':'breakfast-shop');roof(g,5.5,3.2,2.7,.75,'slate',0,-.93);
  for(const x of [-2.4,2.4])box(g,.22,2.7,.24,'wood',x,1.36,.46,'stall-front-post');
  box(g,4.2,1,.62,'wood',0,.52,.56,'food-stall-counter');box(g,4.55,.15,.95,'gold',0,1.09,.6,'food-counter-top');box(g,3.8,1.4,.15,'warm',0,1.77,.18,'open-stall-kitchen');
  for(const x of [-1.3,-.52,.3]){cyl(g,.31,.11,'metal',x,1.24,.66,.31,16,'cooking-pan');for(let i=0;i<5;i++){const a=i/5*Math.PI*2;orb(g,.075,'cream',x+Math.cos(a)*.16,1.35,.66+Math.sin(a)*.16,[1,.65,1],night?'skewer-food':'steamed-bun');}}
  awning(g,5.25,0,2.64,.95,night?'blue':'green',1.2);sign(g,3.8,0,3.06,.7,night?'red':'dark');
  table(g,-1.42,2.63,.54);table(g,1.51,2.66,.54);coffeeSet(g,-1.45,.96,2.59);
  if(night){for(const x of [-2.63,0,2.63]){orb(g,.25,'red',x,2.67,1.65,[.78,1.25,.78],'market-lantern');cyl(g,.06,.14,'gold',x,2.32,1.65);}beam(g,[-2.8,3.38,1.7],[2.8,3.38,1.7],.035,'dark','market-light-string');for(let i=0;i<9;i++)orb(g,.065,'lamp-glow',-2.6+i*.65,3.29,1.71,[1,1,1],'market-bulb');}
  tree(g,-3.1,-1.57,season,.67);planter(g,3.05,2.5,season);if(season===3)snowRoof(g,5.45,3.18,2.74,.75,0,-.93);
  // A working street kitchen needs an open counter, shelves and cookware,
  // together with the alley walls that frame the original storefront.
  for(const x of [-2.16,2.16])dbox(g,.32,2.5,.18,'cream',x,1.25,.32,'stall-plaster-return');
  for(let i=0;i<9;i++)dbox(g,.36,.79,.075,i%3?'wood':'#bf8b50',-1.84+i*.46,.57,.911,'food-counter-individual-panel');
  for(const y of [1.53,2.11]){dbox(g,2.57,.08,.35,'wood',.28,y,.37,'kitchen-open-shelf');for(let i=0;i<7;i++){detail(cyl(g,.085,.17+(i%3)*.055,['cream','warm','red','green'][i%4],-.79+i*.34,y+.13,.39,.07,8,'kitchen-storage-jar'));}}
  for(const x of [-1.46,.23]){const hood=detail(mesh(g,geometry('cooking-light-shade',()=>new THREE.ConeGeometry(.19,.17,10)),night?'blue':'green',x,2.25,.88,'stall-pendant-shade'));detail(cyl(g,.045,.15,'warm',x,2.13,.88,.045,8,'stall-pendant-bulb'));dbeam(g,[x,2.38,.88],[x,2.71,.88],.025,'dark','stall-pendant-cord');}
  for(let j=0;j<3;j++)detail(cyl(g,.27,.11,'wood',1.55,1.31+j*.125,.49,.27,18,'stacked-bamboo-steamer'));detail(torus(g,.25,.027,'dark',1.55,1.64,.49,[Math.PI/2,0,0],[1,1,1],'bamboo-steamer-rim'));
  const cabinet=new THREE.Group();cabinet.position.set(.81,1.18,.75);g.add(cabinet);dbox(cabinet,.78,.035,.47,'metal',0,.07,0,'food-display-case-tray');dbox(cabinet,.8,.49,.045,'glass',0,.31,.23,'food-display-glazing');dbox(cabinet,.8,.055,.48,'metal',0,.57,0,'food-display-case-cap');for(const x of [-.39,.39])dbox(cabinet,.035,.49,.48,'metal',x,.31,0,'food-display-case-frame');for(let i=0;i<4;i++)dorb(cabinet,.083,'cream',-.27+i*.18,.19,.07,[1,.64,1],'display-steamed-bun');
  for(const x of [-1.82,1.71]){detail(cyl(g,.072,.26,'red',x,1.27,1.07,.055,8,'counter-sauce-bottle'));detail(cyl(g,.044,.11,'dark',x,1.45,1.07,.044,8,'sauce-bottle-neck'));}
  if(!night){
    tiledEaveRoof(g,5.55,3.26,2.72,.82,0,-.94,season);dbox(g,.12,2.13,1.95,'cream',3.1,1.09,-.64,'breakfast-alley-wall');dbox(g,.25,.13,2.07,'slate',3.1,2.23,-.64,'alley-wall-coping');
    menuBoard(g,2.66,2.97,-.21);const menu=new THREE.Group();menu.position.set(-1.64,.72,.94);menu.scale.set(.87,.91,.8);g.add(menu);menuBoard(menu,0,0);
    detail(cyl(g,.23,.78,'blue',2.61,.49,1.2,.19,12,'kitchen-gas-cylinder'));detail(cyl(g,.11,.14,'metal',2.61,.94,1.2,.11,8,'gas-cylinder-valve'));orb(g,.2,'red',-2.47,2.63,.53,[.8,1.46,.8],'breakfast-red-lantern');
    for(const x of [-1.42,1.51]){dbox(g,1.2,.11,1.02,'wood',x,.94,2.64,'breakfast-square-table');detail(cyl(g,.09,.21,'metal',x,1.11,2.62,.09,10,'table-chopstick-holder'));for(let i=0;i<4;i++)dbeam(g,[x-.045+i*.03,1.16,2.62],[x-.09+i*.06,1.46,2.65],.018,'wood','individual-chopstick');}
    paving(g,0,2.67,5.96,1.49);flowerBed(g,-3.08,.35,.52,1.11,season);wallLantern(g,2.49,2.09,.59);
  }
}
function terrace(g,season,high=false){
  if(!high){
    box(g,6.55,.23,5.3,'stone',0,.115,.17,'terrace-garden-plinth');
    for(let i=0;i<16;i++)dbox(g,4.1,.065,.225,i%3?'wood':'#bf8a54',-.66,.285,-1.25+i*.25,'individual-terrace-deck-board');
    box(g,5.85,2.6,.24,'cream',.18,1.6,-2.24,'terrace-office-garden-wall');for(const x of [-1.9,-.15])win(g,x,1.57,-2.05,1.57,1.68,false,false);box(g,.12,2.4,1.35,'glass',3,1.5,-1.63,'terrace-side-glass');
    dbox(g,6.03,.16,.39,'stone',.18,2.93,-2.23,'green-wall-coping');sign(g,.96,1.75,1.93,-2.06,'cream');
    const livingWall=new THREE.Group();livingWall.position.y=2.92;g.add(livingWall);for(const x of [-2.35,-.97,.4,1.78,2.7])planter(livingWall,x,-2.23,season,.86);ivy(g,1.13,.41,-2.03,2.61,.48,season);ivy(g,-2.64,.41,-2.02,2.64,.31,season);
    for(const [x,z,w] of [[-2.78,-.95,.63],[-2.78,.49,.63],[-2.54,2.31,1.09],[2.68,.1,.7],[2.25,1.79,1.36]]){planter(g,x,z,season,w);flowerBed(g,x,z,w,.47,season);}
    tree(g,-2.46,-1.25,season,.88);tree(g,2.61,-1.07,season,.52);
    const tableTop=cyl(g,.86,.12,'wood',-.48,1.06,.29,.86,24,'terrace-work-table');detail(cyl(g,.08,.74,'wood',-.48,.68,.29,.08,10,'terrace-table-pedestal'));parasol(g,-.48,.29,.05,1.68,season);
    for(const [dx,dz,a] of [[-1.18,0,-Math.PI/2],[1.18,0,Math.PI/2],[-.53,1.07,Math.PI],[.5,-1.02,0]])foldingChair(g,-.48+dx,.29+dz,a);
    dbox(g,.54,.035,.35,'metal',-.27,1.145,.34,'terrace-open-laptop-keyboard');const screen=dbox(g,.54,.39,.035,'slate',-.27,1.34,.18,'terrace-open-laptop-screen');screen.rotation.x=-.13;coffeeSet(g,-.93,1.13,.45);
    for(const [x,z] of [[-3,2.56],[2.95,2.56]])lamp(g,x,z,1.38);for(const x of [-2.26,2.14])fence(g,x,2.63,1.7,.21);menuBoard(g,-1.3,2.17,.12);paving(g,1.45,2.7,1.1,.68);return;
  }
  const y=high?2.7:0;box(g,6.5,high?2.7:.2,4.7,high?'slate':'wood',0,high?1.35:.1,0,high?'observation-tower-base':'terrace-deck');
  const top=new THREE.Group();top.position.y=y;g.add(top);box(top,6.62,.17,4.82,'stone',0,.12,0,'observation-deck');railing(top,6.4,0,.2,2.34);railing(top,6.4,0,.2,-2.25);
  for(const x of [-3.12,3.12]){const r=new THREE.Group();r.position.x=x;r.rotation.y=Math.PI/2;top.add(r);railing(r,4.3,0,.2,0);}
  bench(top,-1.1,1.03);table(top,1.3,.15,.65);cyl(top,.065,2.72,'wood',1.3,1.46,.15);const umbrella=mesh(top,geometry('umbrella',()=>new THREE.ConeGeometry(1.38,.64,8)),season===3?'snow':'cream',1.3,2.74,.15,'terrace-umbrella');
  for(const x of [-2.65,2.65]){planter(top,x,-1.65,season);tree(top,x,-1.68,season,.64);}
  if(high){for(let i=0;i<7;i++){const h=1.5+(i%3)*.65;box(top,.52,h,.58,'blue',-2.6+i*.87,h/2,-2.05,'distant-city-volume');for(let j=0;j<3;j++)box(top,.3,.1,.04,'warm',-2.6+i*.87,.5+j*.45,-1.74,'city-window');}}
  else{box(top,2.2,2.48,.22,'wall',-1.2,1.44,-2.24,'terrace-garden-wall');for(const x of [-1.7,-.7])box(top,.06,2.3,.1,'green',x,1.4,-2.09,'wall-climber');sign(top,1.2,-1.2,1.96,-2.04,'cream');}
}
function hospital(g,season,winter=false){
  box(g,3.25,5.35,4.1,'cream',0,2.68,-.25,'hospital-central-tower');
  for(const x of [-2.95,2.95]){box(g,2.9,winter?3.9:3.6,3.65,'white',x,(winter?3.9:3.6)/2,-.05,'hospital-wing');for(const y of [1,2.07,3.12])for(const dx of [-.74,0,.74])win(g,x+dx,y,1.84,.48,.72);box(g,3.03,.2,3.86,season===3?'snow':'stone',x,winter?4:3.71,-.05,'hospital-wing-roof');}
  for(const x of [-1.05,1.05])for(const y of [1.05,2.15,3.3,4.35])win(g,x,y,1.86,.59,.76);
  box(g,.29,.9,.17,'red',0,4.64,1.91,'hospital-cross-vertical');box(g,.9,.29,.18,'red',0,4.64,1.92,'hospital-cross-horizontal');
  box(g,3.45,.2,4.25,season===3?'snow':'stone',0,5.48,-.25,'hospital-rooftop');const helipad=cyl(g,1.23,.09,'slate',0,5.65,-.4,1.23,32,'hospital-helipad');torus(g,1,.04,'cream',0,5.72,-.4,[Math.PI/2,0,0]);for(const x of [-.31,.31])box(g,.1,.035,.76,'cream',x,5.75,-.4,'helipad-H');box(g,.65,.035,.1,'cream',0,5.75,-.4,'helipad-H');
  box(g,3.08,.16,1.28,'blue',0,2.34,2.33,'hospital-entrance-canopy');door(g,0,1.94,1.45,1.85);sign(g,1.95,0,2.78,2.02,'blue');steps(g,2.8,2.56,2);
  smallCar(g,3.17,3.09,'white');box(g,.37,.1,.22,'red',3.17,1.07,3.06,'ambulance-roof-light');box(g,.11,.35,.08,'red',3.17,.77,4.06,'ambulance-cross');box(g,.34,.11,.08,'red',3.17,.77,4.06,'ambulance-cross');
  for(const x of [-3.9,3.9])tree(g,x,-1.8,season,.65);for(const x of [-3.6,-2.3,-.95])planter(g,x,3.38,season);lamp(g,-4.37,2.8);
}
function airport(g,season){
  box(g,6.6,2.4,3.05,'glass',-1.08,1.21,-.35,'airport-terminal');
  for(const x of [-4.27,-2.67,-1.07,.53,2.13])box(g,.17,2.54,3.2,'cream',x,1.28,-.35,'terminal-pier');box(g,6.94,.25,3.32,season===3?'snow':'white',-1.08,2.54,-.35,'terminal-roof');
  sign(g,3.75,-1.08,2.12,1.32,'blue');door(g,-1.13,1.29,1.25,1.73);box(g,4.75,.14,1.08,'blue',-1.16,1.98,1.53,'airport-curb-canopy');
  box(g,.85,4.65,.9,'stone',-3.15,2.33,-2.04,'airport-control-tower');box(g,1.68,.78,1.44,'glass',-3.15,4.75,-2.04,'control-tower-cabin');box(g,1.88,.17,1.63,'white',-3.15,5.22,-2.04,'control-tower-roof');cyl(g,.055,.64,'metal',-3.15,5.62,-2.04);
  box(g,8.7,.07,1.44,'slate',0,.075,-3.16,'airport-runway');for(let i=0;i<11;i++)box(g,.4,.015,.05,'cream',-4+i*.76,.12,-3.16,'runway-marking');
  const plane=new THREE.Group();plane.position.set(3.07,.45,1.1);plane.rotation.y=-.35;g.add(plane);
  const body=cyl(plane,.27,3.48,'white',0,.36,0,.15,12,'airplane-fuselage');body.rotation.x=Math.PI/2;orb(plane,.28,'white',0,.36,1.74,[1,1,.7],'airplane-nose');
  box(plane,2.98,.085,.71,'white',0,.35,-.04,'airplane-wings');box(plane,1.2,.07,.43,'blue',0,.55,-1.45,'airplane-tailplane');box(plane,.08,.85,.64,'blue',0,.82,-1.45,'airplane-tail');for(const x of [-.76,.76]){const engine=cyl(plane,.14,.5,'metal',x,.25,.18,.14,10,'airplane-engine');engine.rotation.x=Math.PI/2;}
  for(const x of [-3.4,-2.3,.7])planter(g,x,2.43,season);lamp(g,-4.44,2.5);
}
function banquet(g,season){
  box(g,7.4,4.25,4.4,'cream',0,2.13,-.5,'banquet-hotel-main');roof(g,7.7,4.75,4.34,.95,'slate',0,-.5);
  for(const x of [-3.05,3.05]){box(g,1.52,5.25,2.28,'stone',x,2.63,.52,'banquet-corner-tower');const spire=mesh(g,geometry('hotel-spire',()=>new THREE.ConeGeometry(1.12,1.75,4)),season===3?'snow':'slate',x,6.11,.52,'banquet-spire');spire.rotation.y=Math.PI/4;cyl(g,.055,.35,'gold',x,7.16,.52);}
  for(const x of [-2.96,-1.47,0,1.47,2.96])for(const y of [1.38,3.24])win(g,x,y,1.81,.84,1.26,false,true);
  door(g,0,1.81,1.35,2.05);for(const x of [-1.05,1.05])cyl(g,.16,2.72,'cream',x,1.44,2.17,.16,12,'hotel-portico-column');box(g,2.6,.17,1.5,'stone',0,2.84,2.05,'hotel-portico');sign(g,2.7,0,3.63,1.88,'dark');steps(g,2.7,2.65,3);
  const basin=cyl(g,1.12,.2,'stone',0,.17,4.13,1.12,24,'courtyard-fountain');cyl(g,.96,.04,'glass',0,.3,4.13,.96,24,'fountain-water');cyl(g,.12,.74,'stone',0,.64,4.13);cyl(g,.54,.12,'stone',0,1.07,4.13,.54,20,'fountain-upper-bowl');
  for(const x of [-3.77,3.77]){tree(g,x,2.9,season,.7);lamp(g,x,4.4,2.2);}if(season===3)snowRoof(g,7.65,4.7,4.37,.95,0,-.5);
}
function teaHouse(g,season,{salon=false,old=false,studio=false}={}){
  if(!salon&&!old&&!studio){
    const house=new THREE.Group();house.position.set(.15,0,-.74);g.add(house);
    box(house,6.02,.38,4.04,'stone',0,.19,0,'tea-house-stone-foundation');box(house,5.74,2.66,3.2,'wood',0,1.71,-.3,'tea-house');
    tiledEaveRoof(house,6.28,4.15,3.05,1.06,0,-.2,season);tiledEaveRoof(house,2.12,2.92,2.17,.51,-2.77,.28,season);tiledEaveRoof(house,1.79,2.66,2.17,.49,2.79,.19,season);
    box(house,1.68,1.97,2.25,'wood',-2.77,1.35,.1,'tea-side-pavilion');box(house,1.38,1.97,2.16,'wood',2.79,1.35,.1,'tea-side-pavilion');
    for(const x of [-2.61,-1.15,1.15,2.61]){
      dbox(house,.21,2.81,.28,'dark',x,1.8,1.45,'tea-carved-timber-column');dbox(house,.34,.17,.39,'stone',x,.43,1.45,'tea-column-stone-foot');
      for(let i=0;i<3;i++)dbox(house,.29+i*.15,.11,.39-i*.045,'wood',x,2.59+i*.13,1.46,'tea-stacked-bracket-capital');wallLantern(house,x,2.29,1.49);
    }
    for(const x of [-1.88,1.88])latticePanel(house,x,1.62,1.36,1.02,1.94);
    for(const x of [-3.26,3.23])latticePanel(house,x,1.39,1.27,.72,1.47);
    // An open central doorway contains a real table, shelving and a circular
    // moon-window; the recessed volume reads from the exterior as occupied.
    box(house,1.8,2.03,.16,'#574a35',0,1.52,1.38,'tea-open-entrance-recess');box(house,1.66,.12,1.54,'wood',0,.46,1.56,'tea-entrance-timber-floor');
    detail(torus(house,.48,.056,'wood',0,1.77,1.51,[0,0,0],[1,1,1],'tea-moon-window'));for(const x of [-.27,0,.27])dbox(house,.027,.68,.06,'wood',x,1.78,1.55,'moon-window-lattice');
    dbox(house,1.13,.1,.51,'wood',0,1.03,1.91,'tea-interior-table');for(const x of [-.39,.39])dbox(house,.07,.51,.4,'dark',x,.76,1.91,'tea-table-leg');for(const x of [-.25,.19])coffeeSet(house,x,1.09,1.91);
    for(const x of [-.83,.83]){dbox(house,.19,1.89,.1,'#d9b887',x,1.54,1.57,'tea-drawn-curtain');dbeam(house,[x,2.45,1.6],[x*.83,1.46,1.64],.032,'gold','curtain-fold-highlight');}
    sign(house,2.44,0,2.92,1.82,'dark');dbox(house,2.62,.065,.14,'gold',0,3.18,1.89,'tea-plaque-gold-border');
    for(const side of [-1,1]){dbox(house,1.76,.11,.12,'wood',side*1.98,1.05,2.07,'tea-porch-balustrade');for(let i=0;i<5;i++)dbox(house,.065,.55,.08,'wood',side*1.98-.78+i*.39,.78,2.07,'tea-porch-baluster');}
    const pool=cyl(g,1.36,.095,'#367e83',-2.29,.09,2.33,1.36,32,'tea-courtyard-pond');pool.scale.z=.77;
    for(let i=0;i<21;i++){const a=i/21*Math.PI*2;dorb(g,.2,i%3?'stone':'#919586',-2.29+Math.cos(a)*1.43,.19,2.33+Math.sin(a)*1.12,[1.17,.79,.96],'tea-pond-riverstone');}
    for(let i=0;i<6;i++){const a=i*2.39996,r=.26+i*.13;detail(cyl(g,.13,.025,'#738f4d',-2.29+Math.cos(a)*r,.153,2.33+Math.sin(a)*r*.64,.13,10,'tea-pond-lily-pad'));}
    for(let i=0;i<4;i++)detail(torus(g,.18+i*.11,.012,'#85babb',-2.86,.151,2.31,[Math.PI/2,0,0],[1,.73,1],'tea-pond-water-ripple'));
    const bridge=new THREE.Group();bridge.position.set(-1.87,0,2.77);bridge.rotation.y=-.2;g.add(bridge);
    for(let i=0;i<11;i++){const x=-.91+i*.182,y=.2+.29*Math.sin(i/10*Math.PI);dbox(bridge,.177,.09,.76,'wood',x,y,0,'arched-garden-bridge-plank');if(i%2===0)for(const side of [-1,1])dbox(bridge,.055,.44,.06,'dark',x,y+.2,side*.4,'arched-bridge-baluster');if(i<10)for(const side of [-1,1])dbeam(bridge,[x,y+.44,side*.4],[x+.182,.64+.29*Math.sin((i+1)/10*Math.PI),side*.4],.065,'wood','arched-bridge-handrail');}
    const stepsGroup=new THREE.Group();stepsGroup.position.set(.15,.2,-.63);g.add(stepsGroup);steps(stepsGroup,1.83,2.19,3);paving(g,.61,2.72,1.68,2.37);
    for(const [x,z,w,d] of [[-3.32,1.31,1.08,.56],[2.27,2.51,1.33,.59],[3.3,.76,.73,.82],[-.9,3.59,1.66,.43]])flowerBed(g,x,z,w,d,season);
    for(const [x,z,size] of [[-3.48,-1.69,1.31],[-3.71,.12,.81],[3.49,-1.36,1.19],[2.36,-2.55,1.29]])tree(g,x,z,season,size);
    for(const [x,z,size] of [[-3.71,1.37,1.12],[-3.1,.21,.88],[-3.71,-2.17,1.25],[3.46,.87,1.25],[3.76,-.16,1.15],[2.63,2.78,1.13],[1.75,3.41,.78],[-3.38,3.18,.76],[-.88,3.69,.71]])gardenShrub(g,x,z,season,size);
    for(const x of [-.52,1.13]){dbox(g,.3,.52,.3,'stone',x,.3,1.92,'tea-garden-stone-lantern');dbox(g,.31,.27,.31,'warm',x,.69,1.92,'tea-garden-lantern-window');const cap=detail(mesh(g,geometry('garden-lantern-roof',()=>new THREE.ConeGeometry(.31,.2,4)),season===3?'snow':'slate',x,.93,1.92,'tea-garden-lantern-roof'));cap.rotation.y=Math.PI/4;}
    fence(g,2.43,3.44,1.8);ivy(g,3.4,.23,1.15,1.67,.42,season);return;
  }
  const w=salon?5.7:6.1,h=salon?3.2:2.65;box(g,w,h,3.9,'wood',0,h/2,-.35,old?'old-shop-timber-shell':studio?'wood-studio-shell':salon?'creator-salon':'tea-house');
  if(studio){box(g,w+.4,.2,4.3,season===3?'snow':'slate',0,h+.1,-.35,'studio-flat-roof');box(g,1.7,.15,1.3,'glass',-.5,h+.25,-.4,'studio-skylight');}
  else{roof(g,w+.45,4.37,h+.05,.98,'slate',0,-.35);for(const x of [-w/2-.27,w/2+.27])box(g,.16,.28,4.34,'slate',x,h+.17,-.35,'raised-eave-tip');if(season===3)snowRoof(g,w+.42,4.34,h+.1,.98,0,-.35);}
  for(const x of [-2.1,-.8,.7,2.1]){win(g,x,1.44,1.67,.98,1.65,false,!old);box(g,.09,h,.12,'dark',x-.6,h/2,1.68,'timber-front-divider');}
  door(g,salon?1.93:0,1.7,1.05,1.97);sign(g,2.75,0,2.69,1.79,'dark');
  if(salon){const wing=new THREE.Group();wing.position.set(-1.1,0,1);g.add(wing);roof(wing,3.4,2.58,3.21,1.16,'slate');awning(g,2.3,-1.55,2.18,2,'green');bookshelf(g,-2.56,1.95,.69,1.55);table(g,.3,3.08,.56);coffeeSet(g,.3,.96,3.08);
    win(g,-1.1,3.76,2.35,1.36,.76,false,true);for(const x of [-2.58,-.61,1.25]){bookshelf(g,x,1.82,.7,1.6,.25);wallLantern(g,x,2.18,1.93);}
    box(g,2.03,.18,2.53,'wood',3.48,.12,.78,'salon-open-reading-porch');box(g,2.03,2.52,.19,'wood',3.48,1.48,-.43,'salon-porch-back');bookshelf(g,3.48,-.26,1.67,1.93,.26);tiledEaveRoof(g,2.21,2.75,2.67,.5,3.48,.72,season);
    for(const x of [2.56,4.4])dbox(g,.12,2.52,.13,'dark',x,1.43,1.96,'salon-reading-porch-post');foldingChair(g,3.04,1.08,.4);foldingChair(g,4.02,1.19,-.4);
    for(const [x,z] of [[-3.06,2.94],[3.55,2.42]])flowerBed(g,x,z,1.08,.53,season);ivy(g,-2.81,.15,1.79,2.89,.45,season);ivy(g,2.66,.18,1.84,3.1,.52,season);ivy(g,4.51,.15,1.53,2.52,.47,season);
    const plants=new THREE.Group();plants.position.y=3.24;g.add(plants);planter(plants,-1.07,2.33,season,1.49);tree(g,-3.46,-1.34,season,1.21);tree(g,3.91,-1.51,season,1.19);tree(g,1.75,-2.48,season,1.38);menuBoard(g,1.94,3.36,-.2);paving(g,1.59,2.5,1.12,2.38);fence(g,3.7,2.94,1.75);
    for(const [x,z,size] of [[-3.48,1.22,1.12],[-3.3,2.31,.89],[3.88,2.77,1.04],[4.44,.08,1.26],[2.81,-2.35,1.23]])gardenShrub(g,x,z,season,size);
    for(let i=0;i<26;i++){const xx=-2.57+i*.255,zz=2.04+Math.sin(i*2.41)*.23;dorb(g,.07,season===2?['#c7a452','#b77942','#b35933'][i%3]:'#658945',xx,3.12,zz,[1.45,.47,1],'salon-eave-trailing-leaf');}
    dbox(g,.48,.91,.5,'stone',-2.1,4.02,-.94,'salon-brick-chimney');dbox(g,.65,.1,.62,'dark',-2.1,4.52,-.94,'salon-chimney-coping');
  }
  else if(!old){box(g,6.3,.19,1.2,'wood',0,.14,2.35,'tea-house-porch');for(const x of [-2.85,2.85]){box(g,.17,2.68,.17,'wood',x,1.46,2.63,'porch-pillar');orb(g,.21,'lamp-glow',x,2.12,2.48,[.8,1.25,.8],'tea-lantern');}bench(g,-1.6,2.53);}
  else{for(const x of [-2.1,-.7,.7,2.1])box(g,.81,1.6,.17,'dark',x,1.15,1.82,'closed-timber-shutter');sign(g,1.1,1.8,1.48,1.98,'wood');}
  steps(g,1.95,2.72,2);tree(g,-3.55,.7,season,.84);planter(g,3.27,2.6,season);lamp(g,3.15,-2.13,2.2);
}
function creativePark(g,season){
  for(const [x,z,w,h,d] of [[-1.92,-1.15,3.34,4.5,3.65],[2.13,-.32,2.7,3.45,3.46],[.15,-2.02,2.8,5.5,2.1]]){
    box(g,w,h,d,'red',x,h/2,z,'creative-redbrick-workshop');
    if(x>1.5)dbox(g,w+.2,.2,d+.2,'slate',x,h+.04,z,'factory-flat-terrace-roof');else roof(g,w+.23,d+.26,h+.05,.64,'slate',x,z);
    for(let row=0;row<Math.floor(h/1.5);row++)for(let col=0;col<3;col++)win(g,x-w*.32+col*w*.32,.9+row*1.37,z+d/2+.07,w*.19,.93,false,true);
    for(const y of [1.6,3.1])if(y<h)box(g,w+.08,.13,d+.08,'dark',x,y,z,'factory-floor-band');
    for(const xx of [-.47,.47]){dbox(g,.16,h+.1,.17,'red',x+w*xx,h/2,z+d/2+.07,'factory-brick-pilaster');for(let j=0;j<Math.ceil(h/.3);j++)dbox(g,.24,.105,.15,'#ba8060',x+w*xx,.2+j*.3,z+d/2+.15,'factory-pilaster-brick');}
    for(let col=0;col<3;col++){const xx=x-w*.32+col*w*.32;for(let i=0;i<7;i++){const a=i/6*Math.PI,m=dbox(g,.12,.15,.16,'#c78e65',xx+Math.cos(a)*w*.119,h-1.4+Math.sin(a)*.32,z+d/2+.14,'brick-window-arch');m.rotation.z=a-Math.PI/2;}}
    ivy(g,x-w*.48,.2,z+d/2+.21,h*.9,.61,season);ivy(g,x+w*.45,.2,z+d/2+.21,h*.81,.52,season);
    if(season===3&&x<1.5)snowRoof(g,w+.2,d+.24,h+.09,.64,x,z);
  }
  for(const x of [-3.4,3.3])box(g,.44,3.15,.5,'red',x,1.57,2.73,'creative-gateway-pier');box(g,6.75,.29,.37,'dark',-.05,3.08,2.73,'creative-gateway-lintel');sign(g,2.55,0,3.1,2.99,'dark');
  cyl(g,.32,6.2,'red',3.25,3.1,-2.3,.26,14,'factory-chimney');for(let i=0;i<8;i++)cyl(g,.33,.07,'dark',3.25,.4+i*.78,-2.3);
  // The glazed upper studio and external iron walkways give the converted
  // factory the occupied, layered silhouette of reference 39.
  dbox(g,2.98,.17,1.02,'dark',-1.72,3.12,1.15,'factory-upper-walkway');railing(g,2.91,-1.72,3.19,1.63);
  dbox(g,2.55,.18,1.68,'stone',2.13,3.58,.44,'factory-roof-terrace');railing(g,2.5,2.13,3.68,1.28);const roofCafe=new THREE.Group();roofCafe.position.y=3.63;g.add(roofCafe);table(roofCafe,2.12,.27,.39);
  for(let i=0;i<11;i++)dbox(g,.59,.08,.2,'metal',-.15,.2+i*.275,3.34-i*.15,'factory-external-iron-stair');
  for(const x of [-.5,.18])dbeam(g,[x,.8,3.43],[x,3.7,1.75],.045,'dark','factory-stair-handrail');
  for(const x of [1.11,3.1]){const top=new THREE.Group();top.position.y=3.68;g.add(top);planter(top,x,.98,season,.58);}
  dbox(g,2.2,1.13,1.26,'glass',.13,5.97,-2.02,'factory-glazed-rooftop-studio');dbox(g,2.37,.12,1.45,'slate',.13,6.58,-2.02,'factory-studio-canopy');
  for(let i=0;i<5;i++)dbox(g,.055,1.18,.06,'dark',-.94+i*.53,5.98,-1.35,'factory-studio-mullion');dbox(g,2.28,.08,.07,'dark',.13,5.43,-1.35,'factory-studio-sill');
  for(const [x,z] of [[-3.39,1.4],[-2.3,1.8],[2.8,1.3],[1.6,-1.5]])tree(g,x,z,season,.52);
  for(const x of [-2.92,2.88]){flowerBed(g,x,3.27,1.05,.51,season);ivy(g,x,.2,2.99,2.53,.6,season);}
  for(const [x,z] of [[-3.42,-2.14],[3.46,-.98]])tree(g,x,z,season,.74);
  paving(g,.13,3.57,7.65,.69);paving(g,.12,2.11,1.25,2.01);awning(g,1.58,2.4,1.53,2.45,'green',.54);wallLantern(g,-2.85,1.63,1.87);bench(g,-1.3,3.52);lamp(g,3.64,3.2);
}
function garage(g,season){
  box(g,7,.16,5.6,'slate',0,.08,0,'garage-floor');box(g,7,2.55,.26,'stone',0,1.28,-2.61,'garage-back-wall');for(const x of [-3.35,3.35])box(g,.34,2.55,5.5,'stone',x,1.28,0,'garage-side-wall');
  box(g,7.3,.33,5.8,season===3?'snow':'stone',0,2.64,0,'garage-flat-roof');box(g,1.42,.47,1.07,'metal',1.82,3,-1.51,'garage-ventilator');
  for(const x of [-2.82,2.82]){box(g,.38,2.36,.54,'stone',x,1.2,2.38,'garage-entry-pillar');for(let i=0;i<6;i++){const stripe=box(g,.4,.15,.055,i%2?'gold':'dark',x,.38+i*.25,2.68,'garage-warning-stripe');stripe.rotation.z=-.25;}}
  for(const x of [-2,0,2])box(g,.07,.015,3.98,'gold',x,.19,-.13,'parking-bay-marking');smallCar(g,-1.13,-.7,'blue');smallCar(g,1.15,-1.1,'cream');
  for(const z of [-1.9,-.35,1.2])box(g,2.45,.07,.18,'warm',0,2.43,z,'garage-ceiling-light');
  box(g,.18,1.2,.18,'metal',-.7,.72,3);const barrier=box(g,3,.12,.14,'cream',.77,1.28,3,'garage-lift-barrier');for(let i=0;i<5;i++)box(g,.27,.13,.155,'red',-.33+i*.59,1.28,3,'garage-barrier-stripe');
  sign(g,.6,-3.57,1.87,1.7,'blue');for(const x of [-3.4,3.4])planter(g,x,3,season);lamp(g,3.46,-2.22,3.03);
}
function park(g,season){
  box(g,6.8,.18,5.4,'green',0,.09,0,'park-garden-ground');box(g,2.05,.1,5.3,'stone',-.52,.22,0,'park-stone-walkway');
  for(const x of [-2.54,.68])for(const z of [-1.65,.48])box(g,.2,2.72,.2,'wood',x,1.47,z,'park-pavilion-column');roof(g,3.78,2.64,2.85,.92,'slate',-.93,-.58);bench(g,-.96,-.65);if(season===3)snowRoof(g,3.75,2.6,2.89,.92,-.93,-.58);
  cyl(g,.23,2.75,'wood',2.13,1.49,-.62,.12,8,'park-old-tree-trunk');for(const [endx,endy,endz] of [[3.26,4,-.6],[1.11,3.8,-.95],[2.55,4.45,-1.4],[2.92,3.2,.3]])beam(g,[2.12,2.08,-.62],[endx,endy,endz],.13,'wood','park-tree-branch');
  const colors=['#dca8b8','#6b9953','#d3a34d','#9fc489'];for(const [x,y,z] of [[3.16,4,-.6],[1.11,3.8,-.95],[2.55,4.45,-1.4]])orb(g,season===3?.28:.65,colors[season],x,y,z,[1,.72,.84],season===3?'winter-new-bud':'seasonal-foliage');
  for(const x of [-3.1,2.9])for(const z of [1.25,2.17])planter(g,x,z,season,.8);lamp(g,-3.22,2.31);bench(g,1.48,2.25,Math.PI/2);
}
function onsen(g,season){
  box(g,4.8,3.6,3.55,'wood',1.28,1.8,-1.05,'onsen-lodge-main');roof(g,5.1,3.82,3.7,1.18,'slate',1.28,-1.05);
  box(g,3.05,2.4,2.65,'wood',2.08,1.2,1.14,'onsen-lodge-wing');roof(g,3.3,2.9,2.5,.86,'slate',2.08,1.14);
  for(const x of [-.14,1.15,2.51])win(g,x,2.18,.79,.94,1.16,false,true);door(g,2.09,2.54,1.05,1.83);win(g,2.66,1.41,2.54,.69,1.1,false,true);
  const pool=cyl(g,1,.2,'glass',-1.97,.25,1.1,1,36,'onsen-open-water');pool.scale.set(2.21,.2,1.82);
  for(let i=0;i<18;i++){const a=i/18*Math.PI*2;orb(g,.37,season===3?'snow':'stone',-1.97+Math.cos(a)*2.17,.4,1.1+Math.sin(a)*1.74,[1,.62,.82],'onsen-stone-rim');}
  for(const [x,z] of [[-1.9,.7],[-2.6,1.35],[-1.1,1.7]]){const points=[new THREE.Vector3(x,.45,z),new THREE.Vector3(x+.12,1.08,z),new THREE.Vector3(x-.12,1.55,z)];const geo=geometry(`steam:${x}:${z}`,()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),10,.045,5,false));mesh(g,geo,'white',0,0,0,'onsen-steam');}
  for(const [x,z] of [[-3.76,-1.84],[-2.51,-2.65],[4.01,-1.57]])fir(g,x,z,season,.95);
  for(const [x,z,size] of [[-4.0,.26,.58],[-3.65,2.66,.66],[3.81,1.44,.66],[-.75,-2.54,.72]])fir(g,x,z,season,size);
  for(const x of [-.94,.26,1.53,3.64])dbox(g,.13,3.64,.15,'dark',x,1.82,.77,'onsen-timber-frame');
  for(const y of [.22,.81,1.37,2.96,3.48])dbox(g,4.75,.08,.17,'dark',1.28,y,.79,'onsen-exposed-timber-band');
  for(const y of [.23,.77,2.26])dbox(g,3.07,.08,.17,'dark',2.08,y,2.5,'onsen-wing-timber-band');
  const veranda=dbox(g,2.15,.15,.68,'wood',-.12,.2,.52,'onsen-wood-veranda');for(let i=0;i<10;i++)dbox(g,.045,.025,.68,'dark',-1.08+i*.215,.285,.52,'onsen-deck-board-joint');
  wallLantern(g,1.42,1.96,2.59);for(let i=0;i<3;i++)dbox(g,.23,.43,.033,'slate',1.82+i*.25,2.01,2.76,'onsen-entry-curtain');
  for(const x of [-3.21,-1.34])fence(g,x,3.13,1.44);
  for(const [x,z] of [[-3.68,2.82],[-2.82,3.12],[-1.88,3.16],[3.72,2.88]]){dorb(g,.29,'#668579',x,.22,z,[1.15,.86,1],'onsen-winter-shrub');if(season===3)dorb(g,.27,'snow',x,.39,z,[1.08,.39,1],'onsen-shrub-snow');}
  for(const x of [-3.76,-2.51,-.74]){dorb(g,.43,'stone',x,.28,-.49,[1,1.3,.8],'onsen-garden-boulder');if(season===3)dorb(g,.35,'snow',x,.64,-.49,[1,.32,.85],'boulder-snow-cap');}
  for(let i=0;i<6;i++){const rock=dorb(g,.21,'stone',.54+i*.32,.075,2.7+(i%2)*.1,[1.3,.3,1],'onsen-stepping-stone');}
  for(const [r,x,z] of [[.39,-2.45,1.1],[.66,-1.75,1.63],[.26,-1.12,.67]])detail(torus(g,r,.018,'#bad6d5',x,.37,z,[Math.PI/2,0,0],[1,1,.68],'onsen-water-ripple'));
  dbox(g,.21,.12,.67,'wood',-.62,.93,-.14,'onsen-water-spout');dbox(g,.06,.58,.06,'#bad6d5',-.62,.57,.17,'onsen-pouring-water');
  if(season===3){snowRoof(g,5.05,3.78,3.74,1.18,1.28,-1.05);snowRoof(g,3.27,2.87,2.54,.86,2.08,1.14);}lamp(g,3.81,2.83,2.25);
}
function starHall(g,season){
  const court=cyl(g,1,.18,'stone',0,.12,0,1,64,'star-hall-circular-court');court.scale.set(5.24,.18,4.27);
  const podium=cyl(g,2.18,.28,'cream',0,.32,-.45,2.18,36,'star-hall-round-podium');
  cyl(g,1.92,3.7,'cream',0,2.27,-.68,1.92,24,'star-hall-rotunda');
  for(const side of [-1,1]){box(g,2.67,2.88,2.55,'cream',side*2.47,1.72,-.74,'star-hall-arc-wing');roof(g,2.94,2.8,3.2,.61,'slate',side*2.47,-.74);for(const dx of [-.75,0,.75]){win(g,side*2.47+dx,1.88,.6,.53,1.54,false,true);cyl(g,.09,2.82,'gold',side*2.47+dx,.36+1.41,.84,.09,8,'star-hall-wing-column');}}
  const dome=mesh(g,geometry('celestial-dome',()=>new THREE.SphereGeometry(1,24,16)), '#314c6e',0,4.4,-.68,'star-hall-celestial-dome');dome.scale.set(2.02,1.75,2.02);
  torus(g,2.07,.085,'gold',0,4.35,-.68,[Math.PI/2,0,0]);for(let i=0;i<8;i++){const a=i/8*Math.PI*2,points=[];for(let j=0;j<=18;j++){const t=j/18*Math.PI/2;points.push(new THREE.Vector3(Math.cos(a)*2.055*Math.sin(t),4.4+1.77*Math.cos(t),-.68+Math.sin(a)*2.055*Math.sin(t)));}const geo=geometry(`dome-rib:${i}`,()=>new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),18,.04,5,false));mesh(g,geo,'gold',0,0,0,'star-hall-gold-meridian');}
  cyl(g,.065,.6,'gold',0,6.4,-.68,.065,10,'celestial-spire');torus(g,.4,.055,'gold',0,6.71,-.68,[0,0,.4],[1,1,1],'star-armillary');torus(g,.4,.055,'gold',0,6.71,-.68,[0,Math.PI/2,0],[1,1,1],'star-armillary');orb(g,.12,'gold',0,6.71,-.68);
  for(const x of [-1.38,1.38])cyl(g,.16,3.3,'gold',x,1.99,1.23,.16,12,'star-hall-entrance-column');door(g,0,1.29,1.55,2.6,.35);sign(g,1.65,0,3.43,1.38,'slate');steps(g,2.48,1.96,6);
  for(let i=0;i<12;i++){const a=Math.PI*.07+i/11*Math.PI*.86,x=Math.cos(a)*4.37,z=Math.sin(a)*3.77;planter(g,x,z,i%4,.61);orb(g,.12,['#d7a7b7','#78a45f','#d4a253','#e4edf0'][i%4],x,.65,z,[1,1,1],'four-season-court-flower');}
  // Balustrades, capitals and constellations keep the gold ornamental rhythm
  // visible when the camera orbits, rather than drawing it on an image plane.
  for(let i=0;i<16;i++){
    const a=i/16*Math.PI*2,x=Math.cos(a)*1.96,z=-.68+Math.sin(a)*1.96;
    detail(cyl(g,.075,3.43,'stone',x,2.27,z,.075,9,'rotunda-fluted-pilaster'));
    for(const y of [.58,3.96]){detail(cyl(g,.13,.12,'gold',x,y,z,.13,9,'rotunda-column-capital'));}
  }
  for(const y of [.54,3.99,4.18])detail(torus(g,1.96,.07,'gold',0,y,-.68,[Math.PI/2,0,0],[1,1,1],'rotunda-ornamental-cornice'));
  for(const theta of [.35,.72,1.05]){
    const radius=Math.sin(theta)*2.055;detail(torus(g,radius,.022,'#b49d68',0,4.4+Math.cos(theta)*1.77,-.68,[Math.PI/2,0,0],[1,1,1],'celestial-dome-latitude'));
  }
  const starPoints=[];
  for(let i=0;i<18;i++){
    const a=i*2.39996,t=.43+(i%5)*.195,point=[Math.cos(a)*2.069*Math.sin(t),4.4+1.785*Math.cos(t),-.68+Math.sin(a)*2.069*Math.sin(t)];starPoints.push(point);
    dorb(g,.055,i%3?'gold':'warm',...point,[1,1,1],'dome-constellation-star');
    if(i%3!==0)dbeam(g,starPoints[i-1],point,.014,'gold','constellation-joining-line');
  }
  for(const side of [-1,1]){
    for(const x of [side*1.17,side*3.76]){
      detail(cyl(g,.18,3.15,'stone',x,1.98,.79,.18,10,'palace-ornamental-column'));
      for(const y of [.44,.58,3.39,3.53])detail(cyl(g,.25,.1,'gold',x,y,.79,.25,10,'palace-carved-capital'));
      detail(cyl(g,.08,.49,'gold',x,3.85,.79,.035,8,'palace-rooftop-finial'));dorb(g,.12,'gold',x,4.12,.79,[.8,1.25,.8],'palace-finial-point');
    }
    for(const [dx,dz,sz] of [[2.62,2.04,.64],[3.48,.67,.59],[2.87,-2.55,.58]])tree(g,side*dx,dz,side<0?0:side>0?2:3,sz);
    flowerBed(g,side*2.88,2.87,1.73,.68,side<0?0:2);flowerBed(g,side*4.09,1.53,.59,.61,season);
    dbox(g,.74,2.01,.09,'slate',side*1.98,1.91,.84,'palace-hanging-banner');
    for(const xx of [-.39,.39])dbox(g,.035,2.08,.07,'gold',side*1.98+xx,1.91,.89,'banner-gold-border');
    detail(torus(g,.18,.025,'gold',side*1.98,2.19,.92,[0,0,0],[1,1,1],'banner-celestial-emblem'));
  }
  for(let i=0;i<17;i++){
    const a=.12+i/16*(Math.PI-.24),x=Math.cos(a)*4.84,z=Math.sin(a)*3.91;
    detail(cyl(g,.075,.55,'stone',x,.51,z,.075,8,'court-balustrade-spindle'));detail(cyl(g,.13,.06,'gold',x,.8,z,.13,8,'court-balustrade-cap'));
    const tile=dbox(g,.35,.033,.33,i%2?'#7c94a1':'#c2b58f',x,.231,z-.25,'celestial-court-inlay');tile.rotation.y=-a;
  }
  detail(torus(g,.58,.035,'gold',0,.226,3.57,[Math.PI/2,0,0],[1,1,1],'entry-compass-ring'));
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;dbeam(g,[0,.24,3.57],[Math.cos(a)*.52,.24,3.57+Math.sin(a)*.52],.035,'gold','entry-compass-ray');}
  wallLantern(g,-.91,2.58,1.59);wallLantern(g,.91,2.58,1.59);
  for(const x of [-4.17,4.17])lamp(g,x,1.22,2.25);if(season===3)for(const side of [-1,1])snowRoof(g,2.9,2.76,3.25,.61,side*2.47,-.74);
}

function buildArchitecture(g,spec,season){
  switch(spec.kind){
    case 'library':return library(g,season);
    case 'stadium':return stadium(g,season);
    case 'village':return villageCluster(g,season);
    case 'office':return office(g,season);
    case 'office-cafe':return office(g,season,{kind:'office-cafe',height:6.15});
    case 'meeting':office(g,season,{height:5.7});desk(g,-2.37,2.8,1.22,false);chair(g,-2.37,3.64,'blue',0,Math.PI);return;
    case 'residential-night':return apartments(g,season,{night:true,roofGarden:true});
    case 'stairs':return stairCorner(g,season);
    case 'director':return office(g,season,{kind:'director',height:7.5});
    case 'rail':return rail(g,season);
    case 'incident':return office(g,season,{kind:'incident',height:7.6});
    case 'subway':return subway(g,season);
    case 'review':return civicHall(g,season,'review');
    case 'breakfast':return foodStall(g,season);
    case 'rental':apartments(g,season,{floors:2,night:true});box(g,.09,3.8,.11,'metal',-2.17,2.05,2.15,'external-water-pipe');box(g,.63,.37,.26,'white',1.53,2.4,2.32,'bathroom-vent');return;
    case 'terrace':return terrace(g,season);
    case 'auditorium':return civicHall(g,season,'auditorium');
    case 'hospital':return hospital(g,season);
    case 'observation':return terrace(g,season,true);
    case 'airport':return airport(g,season);
    case 'night-market':return foodStall(g,season,true);
    case 'banquet':return banquet(g,season);
    case 'tea':return teaHouse(g,season);
    case 'roof-garden':return apartments(g,season,{floors:3,night:true,roofGarden:true});
    case 'study':apartments(g,season,{floors:3,roofGarden:true});bookshelf(g,-1.22,2.31,1.06,1.11,3.2);return;
    case 'salon':return teaHouse(g,season,{salon:true});
    case 'headhunter':return roomPavilion(g,season,'headhunter');
    case 'finance':return roomPavilion(g,season,'finance');
    case 'creative':return creativePark(g,season);
    case 'property':return civicHall(g,season,'property');
    case 'hr':office(g,season,{height:5.35});box(g,1.4,1.15,.6,'wood',2.91,.71,1.72,'hr-record-cabinet');return;
    case 'garage':return garage(g,season);
    case 'winter-hospital':return hospital(g,season,true);
    case 'studio':return teaHouse(g,season,{studio:true});
    case 'home':return apartments(g,season,{floors:3,night:true,roofGarden:true});
    case 'public-service':return civicHall(g,season,'public-service');
    case 'old-shop':return teaHouse(g,season,{old:true});
    case 'onsen':return onsen(g,season);
    case 'park':return park(g,season);
    case 'star-hall':return starHall(g,season);
    default:throw new Error('建筑类型未实现');
  }
}

export function createReferenceBuilding(cell,{season=0}={}){
  if(!Number.isInteger(cell)||cell<1||cell>40)throw new Error('建筑格号必须是 1 至 40');
  if(!Number.isInteger(season)||season<0||season>3)throw new Error('建筑季节必须是 0 至 3');
  const spec=REFERENCE_BUILDING_SPECS[cell-1],group=new THREE.Group(),content=new THREE.Group();
  group.name=spec.id;content.name='reference-solid-architecture';buildArchitecture(content,spec,season);const exteriorDetailStats=batchExteriorDetails(content);content.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(content),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const scale=Math.min((spec.width-.22)/size.x,(spec.depth-.22)/size.z);
  content.scale.setScalar(scale);content.position.set(-center.x*scale,.21-bounds.min.y*scale,(spec.front-spec.back)/2-center.z*scale);group.add(content);
  box(group,spec.width,.2,spec.depth,season===3?'snow':'stone',0,.1,(spec.front-spec.back)/2,'exact-footprint-plinth');
  group.userData={real3D:true,cell,stationIndex:spec.stationIndex,buildingId:spec.id,referenceIds:[...spec.referenceIds],referenceKind:spec.kind,season,footprint:{width:spec.width,depth:spec.depth,front:spec.front,back:spec.back},sharedReferenceResources:true,exteriorDetailStats};
  group.updateMatrixWorld(true);return group;
}

// Materials and primitive geometries are shared with other live instances.
// Detaching this group never invalidates the map when a preview is closed.
export function disposeReferenceBuilding(group){if(!group?.isGroup||group.userData.disposed)return;disposeExteriorDetailInstances(group);group.removeFromParent();group.clear();group.userData.disposed=true;}
