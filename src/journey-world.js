import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EVENTS, SEASONS } from './events.js';
import { routeFor } from './route.js';
import { SceneDice } from './dice.js';
import { Scenery, surfaceY, groundPoint, material, textMap, boardSign, updateBoardSign } from './scenery.js';
import { LIFE_CHAPTERS } from './season-chapters.js';
import { createLiuKanshan, animateLiuKanshan, resetLiuKanshan } from './mascot-3d.js';
import { WorldSignage } from './world-signage.js';
import { WorldDaylight } from './world-daylight.js';
import { CharacterContrast } from './character-contrast.js';
import { bindScaledOrbitInput } from './screen-coordinates.js';

const reduce=()=>Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// One open, landscape journey. Four generous bends leave room for ten cells
// and their little neighbourhoods per season, without a loop or reused cells.
export const WORLD_ROUTE_NODES=Object.freeze([
  [-50,36],[-33,36],[-17,33],[0,36],[17,34],[35,36],[49,32],[54,22],
  [48,13],[32,12],[16,13],[0,10],[-17,12],[-34,10],[-49,6],[-54,-4],
  [-47,-12],[-31,-14],[-15,-11],[2,-14],[19,-12],[36,-14],[49,-18],[54,-28],
  [47,-37],[31,-39],[15,-36],[-2,-39],[-19,-37],[-36,-39],[-50,-38]
].map(Object.freeze));
export const WALK_STEP_MS=1800;
export const stationU=(eventIndex,count=EVENTS.length)=>.045+eventIndex/Math.max(1,count-1)*.9;
export const stationName=event=>event.location||event.title;
export function cinematicStation(event,index){return Boolean(event?.cinematicId);}
const angleDiff=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));
export const CHARACTER_TURN_SPEED=Math.PI*1.5;
// Keep visual yaw continuous across +/- PI, with a bounded turn per active
// frame. Route tangent and body facing are deliberately separate values.
export function advanceCharacterHeading(current,target,deltaSeconds){
  const dt=Math.min(.1,Math.max(0,deltaSeconds));
  const change=angleDiff(current,target)*(1-Math.exp(-12*dt));
  return current+THREE.MathUtils.clamp(change,-CHARACTER_TURN_SPEED*dt,CHARACTER_TURN_SPEED*dt);
}

/** Fit actual world-space geometry inside an asymmetric HUD-safe rectangle. */
export function fitCameraBounds(camera,bounds,{direction=new THREE.Vector3(0,1.24,1),width=1440,height=900,insets={left:32,right:32,top:180,bottom:100}}={}){
  if(bounds.isEmpty())return null;
  const forward=direction.clone().normalize(),right=new THREE.Vector3(0,1,0).cross(forward).normalize(),up=forward.clone().cross(right).normalize(),center=bounds.getCenter(new THREE.Vector3());
  const left=-1+2*insets.left/width,rightEdge=1-2*insets.right/width,bottom=-1+2*insets.bottom/height,top=1-2*insets.top/height;
  const centerX=(left+rightEdge)/2,centerY=(bottom+top)/2,tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/camera.zoom,tanX=tanY*camera.aspect;
  let distance=1;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
    const point=new THREE.Vector3(x,y,z).sub(center),px=point.dot(right),py=point.dot(up),pz=point.dot(forward);
    distance=Math.max(distance,(px/tanX+rightEdge*pz)/(rightEdge-centerX),(-px/tanX-left*pz)/(centerX-left),(py/tanY+top*pz)/(top-centerY),(-py/tanY-bottom*pz)/(centerY-bottom),pz+camera.near+1);
  }
  distance*=1.045;
  const target=center.clone().addScaledVector(right,-centerX*distance*tanX).addScaledVector(up,-centerY*distance*tanY);
  camera.position.copy(target).addScaledVector(forward,distance);camera.far=Math.max(420,distance+bounds.getSize(new THREE.Vector3()).length()*2);camera.updateProjectionMatrix();camera.lookAt(target);camera.updateMatrixWorld(true);
  return {target,distance};
}

export class JourneyWorld {
  constructor(container,onTile){
    this.container=container;this.onTile=onTile;this.tiles=[];this.faded=new Set();this.ray=new THREE.Raycaster();this.mode='full';this.currentPosition=-1;
    this.cameraMode='follow';this.stage='idle';this.heading=0;this.cameraHeading=0;this.zoomFactor=1;this.isDisposed=false;this.interactive=true;this.elapsed=0;this.action=null;this.animation=null;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#ceded6');this.fog=new THREE.Fog('#ceded6',65,360);this.overviewFog=new THREE.Fog('#ceded6',250,470);this.scene.fog=this.fog;
    this.renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});this.renderer.setPixelRatio(1);this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.renderer.domElement.setAttribute('aria-label','刘看山的四季立体小镇：拖动旋转视角，点击路牌查看地点。');this.renderer.domElement.setAttribute('role','img');Object.assign(this.renderer.domElement.style,{width:'100%',height:'100%',display:'block',imageRendering:'pixelated',touchAction:'none'});container.appendChild(this.renderer.domElement);
    const environment=new RoomEnvironment();const generator=new THREE.PMREMGenerator(this.renderer);this.environment=generator.fromScene(environment,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.24;environment.dispose();generator.dispose();
    this.hemisphere=new THREE.HemisphereLight('#fff8e7','#839984',1.05);this.scene.add(this.hemisphere);
    this.sun=new THREE.DirectionalLight('#ffefd4',2.5);this.sun.position.set(-28,43,21);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:.5,far:130});this.sun.shadow.normalBias=.035;this.sun.shadow.bias=-.00008;this.scene.add(this.sun);this.scene.add(this.sun.target);
    this.camera=new THREE.PerspectiveCamera(43,1,.08,420);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.enableZoom=false;this.controls.minPolarAngle=.25;this.controls.maxPolarAngle=1.3;
    this.disposeScaledOrbitInput=bindScaledOrbitInput(this.controls);
    this.controls.addEventListener('start',()=>{this.userOrbit=true;this.container.dataset.cameraOrbit='user';});
    this.curve=new THREE.CatmullRomCurve3(WORLD_ROUTE_NODES.map(([x,z])=>groundPoint(x,z)),false,'centripetal');
    this.art=new Scenery(this.scene,this.curve,this.renderer);this.art.terrain();this.art.road();this.createStations();
    this.daylight=new WorldDaylight(this);this.art.beforeOverviewBatch=()=>this.daylight.prepareEmitters(this.scene);
    this.character=this.createCharacter();this.scene.add(this.character);this.dice=new SceneDice(this.scene);
    this.characterContrast=new CharacterContrast(this.scene,this.character,{surfaceHeight:(x,z)=>this.contactSurfaceY(x,z)});
    this.u=.01;this.place(this.u,{snapHeading:true});this.cameraHeading=this.heading;this.setCameraMode('follow');
    this.location=document.createElement('div');this.location.className='world-location';this.location.innerHTML='<span>花开时，故事开始</span><strong>春 · 初入社会</strong><small>从这里，开始你的四季。</small>';container.appendChild(this.location);
    this.labels=[];
    SEASONS.forEach((s,i)=>{const chapter=EVENTS.flatMap((event,index)=>event.season===i?[index]:[]);const p=this.curve.getPointAt(stationU(chapter[Math.floor(chapter.length/2)]??0));p.y=surfaceY(p.x,p.z)+7;const el=document.createElement('div');el.className=`world-label season-${i}`;el.innerHTML=`<b>${s.name}</b><span>${LIFE_CHAPTERS[i].stage}<small>${s.en}</small></span>`;container.appendChild(el);this.labels.push({el,position:p});});
    this.signage=new WorldSignage(this);
    this.picking();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    this.onVisibility=()=>{this.lastFrame=null;};document.addEventListener('visibilitychange',this.onVisibility);
    Object.assign(container.dataset,{renderer:'webgl',renderStyle:'pixel-3d',cameraMode:'follow',cameraOrbit:'follow',assets:'loading',stage:'idle',routeLength:String(EVENTS.length),worldLayout:'landscape-four-seasons',position:'-1',season:'0',weather:LIFE_CHAPTERS[0].weather,lifeStage:LIFE_CHAPTERS[0].stage,mascot:'liukanshan-procedural-3d',idleMotion:'breathing-blink-look-wave'});
    this.ready=this.art.load().then(stats=>{if(!this.isDisposed){container.dataset.assets=stats.failed?'partial':'ready';container.dataset.loadedModels=String(stats.loaded);container.dataset.buildingCount=String(stats.buildings||0);container.dataset.referenceCells=String(this.art.buildingPlans.filter(p=>p.cell).length);if(stats.procedural)container.dataset.scenery='procedural-3d';if(Array.isArray(stats.landmarks))container.dataset.landmarks=stats.landmarks.join(',');}return stats;});
    // Keep atmosphere attached to the actual render, even for a direct render
    // immediately after a camera change or while animation clocks are paused.
    this.scene.onBeforeRender=()=>this.updateAtmosphere();
    this.ready.then(()=>{if(!this.isDisposed)this.signage.load();});
    this.frame=this.frame.bind(this);this.renderer.setAnimationLoop(this.frame);
  }
  createStations(){
    for(let i=0;i<EVENTS.length;i++){
      const s=EVENTS[i].season,p=this.curve.getPointAt(stationU(i)),t=this.curve.getTangentAt(stationU(i)),angle=Math.atan2(t.x,t.z),g=new THREE.Group();g.position.copy(groundPoint(p.x,p.z,.13));g.rotation.y=angle;this.scene.add(g);
      const base=new THREE.Mesh(new THREE.CylinderGeometry(1.55,1.64,.2,64),material('#e7d9b8',.7));base.castShadow=true;base.receiveShadow=true;g.add(base);base.userData.index=i;
      const top=new THREE.Mesh(new THREE.CylinderGeometry(1.45,1.45,.025,64),material('#f7f0db'));top.position.y=.115;g.add(top);
      const border=new THREE.Mesh(new THREE.TorusGeometry(1.47,.035,8,64),material(SEASONS[s].color,.5));border.rotation.x=Math.PI/2;border.position.y=.14;g.add(border);
      const labelMap=textMap(`${String(i+1).padStart(2,'0')}`,{width:256,height:256,font:116,color:SEASONS[s].color,background:'#f7f0db'});
      const number=new THREE.Mesh(new THREE.PlaneGeometry(1.75,1.75),new THREE.MeshBasicMaterial({map:labelMap}));number.rotation.x=-Math.PI/2;number.rotation.z=Math.PI;number.position.y=.134;g.add(number);
      const halo=new THREE.Mesh(new THREE.RingGeometry(1.68,1.76,64),new THREE.MeshBasicMaterial({color:'#ffdb81',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}));halo.rotation.x=-Math.PI/2;halo.position.y=.17;g.add(halo);
      const normal=new THREE.Vector3(-t.z,0,t.x).normalize(),q=p.clone().addScaledVector(normal,i%2?3.1:-3.1);
      const sign=boardSign(this.scene,`${i+1} · ${stationName(EVENTS[i])}`,groundPoint(q.x,q.z),3.15,angle+Math.PI,SEASONS[s].color);
      const cinematic=cinematicStation(EVENTS[i],i);
      if(cinematic){
        // A small gold play pennant identifies a cinematic choice cell, rather
        // than adding another sentence to the already compact world signage.
        const marker=new THREE.Group();marker.name='cinematic-marker';marker.position.set(0,2.68,0);sign.add(marker);
        const medallion=new THREE.Mesh(new THREE.CircleGeometry(.3,24),material('#eed39a',.45));medallion.position.z=.075;marker.add(medallion);
        const play=new THREE.Shape();play.moveTo(-.065,-.12);play.lineTo(.13,0);play.lineTo(-.065,.12);play.closePath();
        const icon=new THREE.Mesh(new THREE.ShapeGeometry(play),material('#5e684e'));icon.position.z=.083;marker.add(icon);
      }
      this.tiles.push({index:i,label:i+1,cinematic,group:g,hit:base,top,number,halo,sign,position:g.position.clone()});
    }
    this.routeLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints(this.curve.getPoints(140).map(p=>groundPoint(p.x,p.z,.31))),new THREE.LineBasicMaterial({color:'#f2d693',transparent:true,opacity:.6}));this.routeLine.visible=false;this.scene.add(this.routeLine);
  }
  createCharacter(){
    const actor=createLiuKanshan();this.legs=actor.userData.rig.legs;this.arms=actor.userData.rig.arms;return actor;
  }
  picking(){
    let start;const mouse=new THREE.Vector2();
    this.onPointerDown=e=>start=[e.clientX,e.clientY];
    this.onPointerUp=e=>{
      if(!this.interactive||this.stage!=='idle'||!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>6)return;
      const b=this.renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2);this.ray.setFromCamera(mouse,this.camera);
      this.ray.far=Infinity;const hit=this.ray.intersectObjects(this.tiles.filter(t=>t.group.visible).map(t=>t.hit),false)[0];if(hit)this.onTile?.(hit.object.userData.index);
    };
    this.onWheel=e=>{
      if(this.isDisposed||!this.interactive||this.stage!=='idle'||this.action||this.isPaused())return;
      const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?this.container.clientHeight:1);
      if(!Number.isFinite(pixels)||pixels===0)return;
      e.preventDefault();this.zoom(THREE.MathUtils.clamp(-pixels*.0015,-.18,.18));
    };
    this.renderer.domElement.addEventListener('pointerdown',this.onPointerDown);this.renderer.domElement.addEventListener('pointerup',this.onPointerUp);
    this.renderer.domElement.addEventListener('wheel',this.onWheel,{passive:false});
  }
  reportHeading(){Object.assign(this.container.dataset,{characterHeading:this.character.rotation.y.toFixed(6),routeHeading:this.heading.toFixed(6)});}
  announceStage(stage,extra={}){this.reportHeading();this.container.dataset.stage=stage;this.container.dispatchEvent(new CustomEvent('worldstage',{detail:{stage,characterHeading:this.character.rotation.y,routeHeading:this.heading,...extra}}));}
  isPaused(){return document.hidden||Boolean(document.querySelector('#dialog[open]'))||Boolean(globalThis.matchMedia?.('(orientation: portrait)').matches);}
  routeIndex(position,mode=this.mode){return position<0?-1:routeFor(mode)[position];}
  walkingSurfaceY(x,z){
    let lift=0;for(const tile of this.tiles){if(!tile.group.visible)continue;const d=Math.hypot(x-tile.position.x,z-tile.position.z);lift=Math.max(lift,.2025*(1-THREE.MathUtils.smoothstep(d,1.42,2.02)));}
    return surfaceY(x,z)+.055+lift;
  }
  contactSurfaceY(x,z){
    // Unlike the deliberately smooth foot-travel ramp, the contact patch must
    // follow rendered surfaces: road, station base and its flat numbered top.
    let y=surfaceY(x,z)+.055;
    for(const tile of this.tiles){
      if(!tile.group.visible)continue;
      const dx=x-tile.position.x,dz=z-tile.position.z,d2=dx*dx+dz*dz;
      if(d2>=1.64*1.64)continue;
      const sideTop=d2<=1.55*1.55?.1:.1-(Math.sqrt(d2)-1.55)*.2/.09;
      y=Math.max(y,tile.position.y+sideTop);
      if(d2<1.45*1.45)y=Math.max(y,tile.position.y+.1275);
      const angle=tile.group.rotation.y,c=Math.cos(angle),s=Math.sin(angle),lx=dx*c-dz*s,lz=dx*s+dz*c;
      if(Math.abs(lx)<.875&&Math.abs(lz)<.875)y=Math.max(y,tile.position.y+.134);
    }
    return y;
  }
  place(u,{snapHeading=false}={}){
    const p=this.curve.getPointAt(u),t=this.curve.getTangentAt(u);
    this.character.position.set(p.x,this.walkingSurfaceY(p.x,p.z),p.z);this.heading=Math.atan2(t.x,t.z);
    // Only an initial load or a genuine relocation may establish a new pose.
    // Landing, feedback and the next roll must never turn the actor backwards.
    if(snapHeading)this.character.rotation.y+=angleDiff(this.character.rotation.y,this.heading);
    this.u=u;Object.assign(this.container.dataset,{characterX:p.x.toFixed(3),characterZ:p.z.toFixed(3)});this.reportHeading();
  }
  async turnToHeading(target,options={}){
    if(this.isDisposed||options.signal?.aborted)return false;
    const start=this.character.rotation.y,difference=angleDiff(start,target);
    if(Math.abs(difference)<.005)return true;
    this.stage='turning';this.announceStage('turning');
    // Smoothstep's peak derivative is 1.5, so this duration respects the same
    // angular speed limit as walking. Pauses/cancellation use the travel clock.
    const duration=Math.max(160,Math.abs(difference)*1500/CHARACTER_TURN_SPEED);
    return this.animate(duration,p=>{
      this.character.rotation.y=start+difference*p*p*(3-2*p);this.reportHeading();
    },options);
  }
  setState(state){
    const restarting=this.state&&(state.mode!==this.state.mode||state.position<this.state.position||state.turn<this.state.turn||(state.position===-1&&this.action));
    if(restarting)this.cancelAnimations();
    const route=routeFor(state.mode);this.mode=state.mode;this.currentPosition=state.position;Object.assign(this.container.dataset,{routeLength:String(route.length),position:String(state.position)});this.state=state;
    this.tiles.forEach(t=>{
      const routePosition=route.indexOf(t.index);t.group.visible=t.sign.visible=routePosition>=0;t.halo.material.opacity=t.index===this.routeIndex(state.position)?0.88:0;t.top.material=material(state.history.some(h=>h.tile===t.index)?'#dce5c9':'#f7f0db');
      if(routePosition>=0&&t.label!==routePosition+1){
        t.label=routePosition+1;t.number.material.map.dispose();t.number.material.map=textMap(String(t.label).padStart(2,'0'),{width:256,height:256,font:116,color:SEASONS[EVENTS[t.index].season].color,background:'#f7f0db'});
        updateBoardSign(t.sign,`${t.label} · ${stationName(EVENTS[t.index])}`);
      }
    });
    this.signage?.invalidate();
    this.characterContrast?.invalidate();
    const chapter=LIFE_CHAPTERS[state.season];Object.assign(this.container.dataset,{season:String(state.season),weather:chapter.weather,lifeStage:chapter.stage});this.art.setSeason?.(state.season);this.location.querySelector('span').textContent=chapter.scene;this.location.querySelector('strong').textContent=`${chapter.name} · ${chapter.stage}`;
    this.location.querySelector('small').textContent=state.position<0?'从这里，开始你的四季。':`第 ${state.position+1} / ${state.total} 站 · ${EVENTS[this.routeIndex(state.position)].title}`;
    if(this.stage==='idle'){
      const u=state.position<0?.01:stationU(this.routeIndex(state.position));const changed=Math.abs(this.u-u)>.001;this.place(u,{snapHeading:changed});
      if(changed&&this.cameraMode==='follow'){this.cameraHeading=this.heading;this.followCamera(1,true);}
    }
  }
  async throwDice(value){
    if(this.action||this.isDisposed)return;const token={};this.action=token;
    try{
      await this.ready;if(this.isDisposed||this.action!==token)return;
      this.resetLimbs();this.userOrbit=false;this.controls.enabled=false;this.setCameraMode('follow',{immediate:false});
      if(!await this.turnToHeading(this.heading)||this.isDisposed||this.action!==token)return;
      this.stage='dice';this.diceStage='windup';this.container.dataset.diceValue=String(value);
      await this.dice.throw({actor:this.character,value,heading:this.heading,groundY:(x,z)=>this.walkingSurfaceY(x,z),reduceMotion:reduce(),isPaused:()=>this.isPaused(),onStage:stage=>{if(this.action===token){this.diceStage=stage;this.container.dataset.diceStage=stage;this.announceStage(stage,{value});}}});
    }finally{if(this.action===token){this.action=null;this.stage='idle';this.resetLimbs();this.controls.enabled=this.interactive&&!this.isPaused();this.announceStage('idle',{value});}}
  }
  async walk(state,die,options={}){
    if(this.action||this.isDisposed)return;const route=routeFor(state.mode),target=Math.min(state.position+die,route.length-1);if(target<=state.position)return;const token={};this.action=token;this.mode=state.mode;this.controls.enabled=false;this.userOrbit=false;this.container.dataset.cameraOrbit='follow';this.resetLimbs();let arrived=false;
    this.dice.mesh.visible=false;
    this.dice.shadow.visible=false;
    try{
      if(!await this.turnToHeading(this.heading,options)||this.isDisposed||this.action!==token)return;
      this.stage='walking';this.announceStage('walking',{steps:target-state.position});
      const steps=target-state.position,nodes=[this.u,...route.slice(state.position+1,target+1).map(index=>stationU(index))];let announced=-1;
      const completed=await this.animate(WALK_STEP_MS*steps,progress=>{
        // Accelerate only at departure and brake only at the final landing.
        // Intermediate cells no longer cause a full stop and another start.
        const edge=.1,eased=progress<edge?progress*progress/(2*edge*(1-edge)):progress>1-edge?1-(1-progress)**2/(2*edge*(1-edge)):(progress-edge/2)/(1-edge);
        const travel=Math.min(steps,eased*steps),segment=Math.min(steps-1,Math.floor(travel)),fraction=travel-segment;
        this.place(THREE.MathUtils.lerp(nodes[segment],nodes[segment+1],fraction));
        this.stepPhase=progress*steps*Math.PI*6;this.character.position.y+=Math.abs(Math.sin(this.stepPhase))*.018;
        this.container.dataset.walkingCell=String(state.position+segment+2);
        if(segment!==announced){announced=segment;this.announceStage('walking',{step:segment+1,steps,position:state.position+segment+1});}
      },options);
      if(completed&&this.action===token){
        this.place(stationU(route[target]));this.resetLimbs();
        arrived=await this.turnToHeading(this.heading,options)&&this.action===token;
      }
      return arrived;
    }finally{if(this.action===token){this.action=null;this.stage='idle';this.resetLimbs();this.controls.enabled=this.interactive&&!this.isPaused();this.announceStage(arrived?'arrived':'idle',arrived?{position:target}:{cancelled:true});}}
  }
  async arrive(state,options={}){
    if(this.action||this.isDisposed)return;const token={};this.action=token;this.stage='arrival';this.controls.enabled=false;const tile=this.tiles[this.routeIndex(state.position,state.mode)];if(tile)tile.halo.material.opacity=1;
    try{await this.animate(520,p=>{if(tile)tile.halo.scale.setScalar(1+.2*Math.sin(p*Math.PI));},options);}
    finally{if(this.action===token){this.action=null;if(tile)tile.halo.scale.setScalar(1);this.stage='idle';this.controls.enabled=this.interactive&&!this.isPaused();this.announceStage('idle');}}
  }
  animate(duration,callback,{signal}={}){
    if(this.isDisposed||signal?.aborted)return Promise.resolve(false);
    if((!duration||reduce())&&!this.isPaused()){callback(1);return Promise.resolve(true);}
    return new Promise(resolve=>{
      let elapsed=0,last;const animation={raf:0,finish:null};const visibility=()=>{last=undefined;};
      const finish=success=>{cancelAnimationFrame(animation.raf);document.removeEventListener('visibilitychange',visibility);signal?.removeEventListener('abort',abort);if(this.animation===animation)this.animation=null;resolve(success);};
      const abort=()=>finish(false);animation.finish=finish;signal?.addEventListener('abort',abort,{once:true});this.animation=animation;
      document.addEventListener('visibilitychange',visibility);
      const frame=now=>{
        if(this.isDisposed||this.animation!==animation){finish(false);return;}
        if(this.isPaused()){last=undefined;animation.raf=requestAnimationFrame(frame);return;}
        if(last!==undefined)elapsed+=Math.max(0,now-last);last=now;
        const p=!duration||reduce()?1:Math.min(1,elapsed/duration);callback(p);
        if(p<1)animation.raf=requestAnimationFrame(frame);else finish(true);
      };
      animation.raf=requestAnimationFrame(frame);
    });
  }
  cancelAnimations(){
    this.action=null;this.animation?.finish(false);this.dice.cancel();this.dice.mesh.visible=false;this.dice.shadow.visible=false;this.dice.impactRing.visible=false;this.stage='idle';this.resetLimbs();for(const tile of this.tiles)tile.halo.scale.setScalar(1);this.controls.enabled=this.interactive&&!this.isDisposed&&!this.isPaused();delete this.container.dataset.walkingCell;this.announceStage('idle');
  }
  resetLimbs(){resetLiuKanshan(this.character);}
  setInteractionEnabled(enabled){this.interactive=Boolean(enabled);this.container.dataset.interaction=String(this.interactive);this.controls.enabled=this.interactive&&this.stage==='idle'&&!this.isPaused();}
  cameraInsets(){const w=this.container.clientWidth||1440,h=this.container.clientHeight||900;return {left:Math.min(44,w*.055),right:Math.min(44,w*.055),top:Math.min(180,h*.25),bottom:Math.min(100,h*.21)};}
  overviewBounds(){
    const bounds=new THREE.Box3().setFromPoints(this.curve.getSpacedPoints(280)).expandByScalar(2.6);
    for(const building of this.art.buildings||[])bounds.union(new THREE.Box3().setFromObject(building));
    for(const tile of this.tiles)bounds.union(new THREE.Box3().setFromObject(tile.sign));
    return bounds;
  }
  fitView(bounds,direction){
    this.controls.enableDamping=false;this.controls.update();
    const framing=fitCameraBounds(this.camera,bounds,{direction,width:this.container.clientWidth||1440,height:this.container.clientHeight||900,insets:this.cameraInsets()});
    if(framing){this.controls.target.copy(framing.target);this.controls.update();}
    this.controls.enableDamping=true;this.lastOcclusion=0;return Boolean(framing);
  }
  setCameraMode(mode,{immediate=true}={}){
    this.focusedBuilding=null;delete this.container.dataset.focusedLandmark;this.cameraMode=mode==='overview'?'overview':'follow';this.container.dataset.cameraMode=this.cameraMode;this.scene.fog=this.cameraMode==='overview'?this.overviewFog:this.fog;this.art.clouds.visible=this.cameraMode!=='overview';this.routeLine.visible=this.cameraMode==='overview';this.userOrbit=false;
    if(immediate||this.cameraMode==='overview')this.resetView();
    else{this.container.dataset.cameraOrbit='follow';this.syncSceneVisibility();}
  }
  focusLandmark(id){
    if(this.isDisposed||this.action||this.stage!=='idle')return false;
    const building=this.art.buildings?.find(object=>object.userData.landmark===true&&object.userData.buildingId===id);if(!building)return false;
    this.focusedBuilding=building;this.cameraMode='landmark';this.camera.zoom=1;this.zoomFactor=1;this.userOrbit=true;Object.assign(this.container.dataset,{cameraMode:'landmark',focusedLandmark:id,cameraOrbit:'landmark'});this.scene.fog=this.fog;this.art.clouds.visible=false;this.routeLine.visible=false;
    building.visible=true;this.fitView(new THREE.Box3().setFromObject(building),new THREE.Vector3(.9,1,1.3).applyAxisAngle(new THREE.Vector3(0,1,0),building.rotation.y));this.syncSceneVisibility();this.controls.enabled=this.interactive&&!this.isPaused();return true;
  }
  resetView(){
    if(this.cameraMode==='landmark'){this.setCameraMode('follow');return;}
    this.zoomFactor=1;this.userOrbit=false;this.container.dataset.cameraOrbit='follow';this.camera.zoom=1;this.camera.updateProjectionMatrix();
    if(this.cameraMode==='overview')this.fitView(this.overviewBounds(),new THREE.Vector3(0,1.24,1));
    else{this.cameraHeading=this.heading;this.followCamera(1,true);}
    this.syncSceneVisibility();
  }
  syncSceneVisibility(){
    // Camera mode switches must swap proxy/originals synchronously, not wait
    // for the throttled occlusion pass (which could show both for 150 ms).
    this.art.setView(this.camera,this.cameraMode==='overview');
    if(this.focusedBuilding)this.focusedBuilding.visible=true;
    this.occlusion();this.lastOcclusion=0;
  }
  zoom(delta){if(this.cameraMode==='overview'||this.cameraMode==='landmark'){this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom+delta,.7,1.8);this.camera.updateProjectionMatrix();}else{this.zoomFactor=THREE.MathUtils.clamp(this.zoomFactor-delta,.68,1.5);this.userOrbit=false;this.container.dataset.cameraOrbit='follow';}}
  followCamera(delta,immediate=false){
    const blend=immediate?1:1-Math.exp(-delta*3.8);this.cameraHeading+=angleDiff(this.cameraHeading,this.heading)*Math.min(1,delta*3.4);
    const target=this.character.position.clone().add(new THREE.Vector3(0,1.6,0));let offset;
    if(this.stage==='dice'){
      // A medium shot reveals the face, hand and die; the landing gets its own closer framing.
      if(this.diceStage==='settled'||this.diceStage==='bounce'){target.lerp(this.dice.mesh.position.clone().add(new THREE.Vector3(0,.4,0)),.72);offset=new THREE.Vector3(3.4,3.8,4.4);}
      else{target.add(new THREE.Vector3(0,-.15,0));offset=new THREE.Vector3(5,3.1,5.8);}
    }else offset=new THREE.Vector3(6.2,7.7,-8.8).multiplyScalar(this.zoomFactor);
    offset.applyAxisAngle(new THREE.Vector3(0,1,0),this.cameraHeading);const destination=target.clone().add(offset);destination.y=Math.max(destination.y,surfaceY(destination.x,destination.z)+2.2);
    this.camera.position.lerp(destination,blend);this.controls.target.lerp(target,immediate?1:1-Math.exp(-delta*6));this.controls.update();
  }
  occlusion(){
    const next=new Set();if(this.cameraMode==='follow'||this.cameraMode==='landmark'){
      this.scene.updateMatrixWorld();const target=this.cameraMode==='landmark'?new THREE.Box3().setFromObject(this.focusedBuilding).getCenter(new THREE.Vector3()):this.character.position.clone().add(new THREE.Vector3(0,1.35,0)),distance=target.distanceTo(this.camera.position);this.ray.set(this.camera.position,target.sub(this.camera.position).normalize());this.ray.far=distance-.35;
      for(const o of this.art.occluders){if(!o.group.visible||o.group===this.focusedBuilding)continue;const nearbyGate=this.stage==='dice'&&o.group.userData.cinematicOccluder&&o.center.distanceTo(this.character.position)<7.5;if(nearbyGate||o.center.distanceTo(this.camera.position)<o.radius+1.3||this.ray.intersectObjects(o.meshes,false).length)o.group.traverse(m=>{if(m.isMesh)next.add(m);});}
      if(this.stage==='dice'&&this.dice.mesh.visible){const diceTarget=this.dice.mesh.position.clone();this.ray.set(this.camera.position,diceTarget.clone().sub(this.camera.position).normalize());this.ray.far=diceTarget.distanceTo(this.camera.position);for(const o of this.art.occluders){if(o.group.visible&&this.ray.intersectObjects(o.meshes,false).length)o.group.traverse(m=>{if(m.isMesh)next.add(m);});}}
    }
    for(const m of this.faded)if(!next.has(m))m.material=m.userData.solid;
    for(const m of next){if(!m.userData.faded){m.userData.solid=m.material;m.userData.faded=m.material.clone();m.userData.faded.transparent=true;m.userData.faded.opacity=.1;m.userData.faded.depthWrite=false;this.daylight?.registerEmitter(m.userData.faded);}m.material=m.userData.faded;}this.faded=next;
  }
  setTimeOfDay(mode,{immediate=false}={}){if(this.isDisposed)return;return this.daylight.setMode(mode,{immediate:immediate||reduce()||this.isPaused()});}
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setPixelRatio(Math.min(1,1080/w));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.signage?.invalidate();if(this.cameraMode==='overview')this.resetView();else if(this.cameraMode==='landmark')this.focusLandmark(this.focusedBuilding.userData.buildingId);}
  updateAtmosphere(){
    this.characterContrast?.update({winter:THREE.MathUtils.smoothstep(this.u,stationU(29),stationU(30)),daylightBlend:this.daylight?.blend||0});
    if(this.cameraMode==='overview'){
      const distance=this.camera.position.distanceTo(this.controls.target);
      this.overviewFog.near=Math.max(135,distance+48);this.overviewFog.far=Math.max(this.overviewFog.near+95,this.camera.far*.92);this.scene.fog=this.overviewFog;
    }else this.scene.fog=this.fog;
    const dome=this.art.skyDome;
    if(dome){
      const originalRadius=dome.geometry.parameters?.radius||230;
      dome.position.copy(this.camera.position);dome.scale.setScalar(this.camera.far*.78/originalRadius);dome.renderOrder=-10000;dome.frustumCulled=false;dome.material.depthWrite=false;dome.material.depthTest=false;dome.material.fog=false;dome.updateMatrixWorld(true);
      this.container.dataset.sky='camera-centered';
    }
    // A distant, camera-relative sun cannot be clipped when overview zooms out.
    if(this.art.sunDisk&&this.sunOffset){const disk=this.art.sunDisk;disk.position.copy(this.sunOffset).normalize().multiplyScalar(this.camera.far*.65).add(this.camera.position);disk.scale.setScalar(this.camera.far/420);disk.lookAt(this.camera.position);disk.updateMatrixWorld(true);}
  }
  shouldRenderPausedFrame(paused){
    if(!paused){this.pausedFrameKey=null;return true;}
    const key=[this.cameraMode,this.mode,this.stage,this.currentPosition,this.art.activeSeason,this.art.populated,this.daylight?.revision,this.camera.zoom,this.container.clientWidth,this.container.clientHeight,...this.camera.position.toArray(),...this.camera.quaternion.toArray(),...this.character.position.toArray(),...this.character.rotation.toArray()].join('|');
    if(key===this.pausedFrameKey)return false;this.pausedFrameKey=key;return true;
  }
  frame(time){
    if(this.isDisposed)return;const activeDelta=this.lastFrame?Math.max(0,(time-this.lastFrame)/1000):1/60,delta=Math.min(.05,activeDelta);this.lastFrame=time;
    const paused=this.isPaused(),reduced=reduce();this.controls.enabled=this.interactive&&this.stage==='idle'&&!paused;
    Object.assign(this.container.dataset,{motion:paused?'paused':reduced?'reduced':'active',idleTime:this.elapsed.toFixed(1)});
    if(!paused){
      // During a throw the hand and landing direction are fixed; an explicit
      // turn owns yaw until its pause-aware animation completes.
      if(this.stage!=='dice'&&this.stage!=='turning'){
        this.character.rotation.y=reduced?this.character.rotation.y+angleDiff(this.character.rotation.y,this.heading):advanceCharacterHeading(this.character.rotation.y,this.heading,activeDelta);this.reportHeading();
      }
      if(this.cameraMode==='follow'&&!this.userOrbit)this.followCamera(delta,reduced);
      this.controls.update();
      if(!reduced){
        this.elapsed+=delta*1000;this.art.update(this.elapsed);
        if(this.stage!=='dice')animateLiuKanshan(this.character,this.elapsed,{walking:this.stage==='walking',stepPhase:this.stepPhase||0});
      }else if(!this.wasReduced){if(this.stage!=='dice')this.resetLimbs();this.art.update(0);}
    }
    this.wasReduced=reduced;
    if(!document.hidden)this.daylight.update(delta,{immediate:paused||reduced});
    // A modal freezes this backdrop. Keep its last rendered frame instead of
    // drawing the entire town behind a second, interactive 3D canvas each RAF.
    if(!this.shouldRenderPausedFrame(paused))return;
    this.sun.target.position.copy(this.cameraMode==='landmark'?this.focusedBuilding.position:this.character.position);this.sun.position.copy(this.sun.target.position).add(this.sunOffset);
    if(!this.lastOcclusion||time-this.lastOcclusion>150){this.art.setView(this.camera,this.cameraMode==='overview');if(this.focusedBuilding)this.focusedBuilding.visible=true;this.occlusion();this.lastOcclusion=time;}
    this.renderer.render(this.scene,this.camera);this.container.dataset.boardDraws=String(this.boardDraws=(this.boardDraws||0)+1);const w=this.container.clientWidth,h=this.container.clientHeight;
    this.signage?.update(time);
  }
  dispose(){
    if(this.isDisposed)return;this.isDisposed=true;this.cancelAnimations();this.renderer.setAnimationLoop(null);this.scene.onBeforeRender=()=>{};this.characterContrast?.dispose();this.dice.dispose();this.art.dispose();this.resizeObserver.disconnect();this.disposeScaledOrbitInput?.();this.controls.dispose();document.removeEventListener('visibilitychange',this.onVisibility);this.renderer.domElement.removeEventListener('pointerdown',this.onPointerDown);this.renderer.domElement.removeEventListener('pointerup',this.onPointerUp);this.renderer.domElement.removeEventListener('wheel',this.onWheel);
    const geometries=new Set(),materials=new Set(),textures=new Set();
    this.scene.traverse(object=>{if(!object.isMesh&&!object.isLine&&!object.isPoints)return;if(object.geometry)geometries.add(object.geometry);for(const mat of [object.material,object.userData.solid,object.userData.faded].flat().filter(Boolean)){materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture)textures.add(value);}});
    for(const geometry of geometries)geometry.dispose();for(const mat of materials)mat.dispose();for(const texture of textures)texture.dispose();
    this.daylight.dispose();this.environment.dispose();this.renderer.dispose();this.renderer.domElement.remove();this.location.remove();this.signage?.dispose();for(const label of this.labels)label.el.remove();
  }
}

export function fallbackWorld(container,onTile){
  container.dataset.renderer='fallback';container.dataset.assets='fallback';container.innerHTML='<div class="fallback-note">当前设备无法启用 3D，使用轻量连续路线。事件、数值和 AI 回顾不变。</div><div class="fallback-board"></div>';
  return{ready:Promise.resolve(),setState(s){const r=routeFor(s.mode);container.querySelector('.fallback-board').innerHTML=r.map((index,i)=>`<button class="fallback-tile ${i===s.position?'current':''}" data-index="${index}">${i+1} · ${EVENTS[index].title}</button>`).join('');container.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>onTile?.(Number(b.dataset.index)));},throwDice:()=>sleep(200),walk:()=>sleep(200),arrive:()=>Promise.resolve(),setCameraMode(){},setInteractionEnabled(){},zoom(){},resetView(){},dispose(){}};
}
