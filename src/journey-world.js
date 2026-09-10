import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EVENTS, SEASONS } from './events.js';
import { routeFor } from './route.js';
import { SceneDice } from './dice.js';
import { Scenery, surfaceY, groundPoint, material, box, ball, textMap, boardSign } from './scenery.js';

const reduce=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
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
export function cinematicStation(event,index){return Boolean(event.cinematicId||[6,11,13,15,18,22,27,31].includes(index+1));}
const angleDiff=(a,b)=>Math.atan2(Math.sin(b-a),Math.cos(b-a));

export class JourneyWorld {
  constructor(container,onTile){
    this.container=container;this.onTile=onTile;this.tiles=[];this.faded=new Set();this.ray=new THREE.Raycaster();this.mode='full';this.currentPosition=-1;
    this.cameraMode='follow';this.stage='idle';this.heading=0;this.cameraHeading=0;this.zoomFactor=1;this.isDisposed=false;this.interactive=true;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#d3dfe1');this.fog=new THREE.Fog('#d4e0da',38,145);this.scene.fog=this.fog;
    this.renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    this.renderer.domElement.setAttribute('aria-label','四时人生连续旅程：春日街巷、盛夏街区、秋日书巷、冬日山居');container.appendChild(this.renderer.domElement);
    const environment=new RoomEnvironment();const generator=new THREE.PMREMGenerator(this.renderer);this.environment=generator.fromScene(environment,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.24;environment.dispose();generator.dispose();
    this.scene.add(new THREE.HemisphereLight('#fff8e7','#839984',1.05));
    this.sun=new THREE.DirectionalLight('#ffefd4',2.5);this.sun.position.set(-28,43,21);this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);Object.assign(this.sun.shadow.camera,{left:-28,right:28,top:28,bottom:-28,near:.5,far:130});this.sun.shadow.normalBias=.035;this.sun.shadow.bias=-.00008;this.scene.add(this.sun);this.scene.add(this.sun.target);
    this.camera=new THREE.PerspectiveCamera(47,1,.08,320);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.enablePan=false;this.controls.enableZoom=false;this.controls.minPolarAngle=.2;this.controls.maxPolarAngle=1.36;
    this.controls.addEventListener('start',()=>{this.userOrbit=true;this.orbitUntil=0;});this.controls.addEventListener('end',()=>this.orbitUntil=performance.now()+4500);
    this.curve=new THREE.CatmullRomCurve3(WORLD_ROUTE_NODES.map(([x,z])=>groundPoint(x,z)),false,'centripetal');
    this.art=new Scenery(this.scene,this.curve,this.renderer);this.art.terrain();this.art.road();this.createStations();
    this.character=this.createCharacter();this.scene.add(this.character);this.dice=new SceneDice(this.scene);
    this.u=.01;this.place(this.u);this.cameraHeading=this.heading;this.setCameraMode('follow');
    this.location=document.createElement('div');this.location.className='world-location';this.location.innerHTML='<span>LIUKANSHAN’S JOURNEY</span><strong>春日街巷</strong><small>从这里，开始你的四季。</small>';container.appendChild(this.location);
    this.labels=[];
    SEASONS.forEach((s,i)=>{const chapter=EVENTS.flatMap((event,index)=>event.season===i?[index]:[]);const p=this.curve.getPointAt(stationU(chapter[Math.floor(chapter.length/2)]??0));p.y=surfaceY(p.x,p.z)+7;const el=document.createElement('div');el.className=`world-label season-${i}`;el.innerHTML=`<b>${s.name}</b><span>${s.title}<small>${s.en}</small></span>`;container.appendChild(el);this.labels.push({el,position:p});});
    this.picking();this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();
    container.dataset.renderer='webgl';container.dataset.cameraMode='follow';container.dataset.assets='loading';container.dataset.stage='idle';container.dataset.routeLength=String(EVENTS.length);container.dataset.worldLayout='landscape-four-seasons';
    this.ready=this.art.load().then(stats=>{if(!this.isDisposed){container.dataset.assets=stats.failed?'partial':'ready';container.dataset.loadedModels=String(stats.loaded);}return stats;});
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
      const sign=boardSign(this.scene,`${i+1} · ${stationName(EVENTS[i])}`,groundPoint(q.x,q.z),2.65,angle+Math.PI,SEASONS[s].color);
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
    const g=new THREE.Group(),white='#f7f7ee',black='#262d2b';this.legs=[];this.arms=[];
    const body=ball(g,.49,white,0,1.03,0,1,1.33,.86);body.material=new THREE.MeshStandardMaterial({color:white,roughness:.48});
    ball(g,.43,white,0,1.76,.02,1,1.04,.9);ball(g,.33,white,0,1.73,.36,1.05,.74,1.33);const nose=ball(g,.23,black,0,1.82,.75,1.15,.82,.7);nose.material=new THREE.MeshStandardMaterial({color:black,roughness:.22});
    for(const sign of [-1,1]){
      const ear=new THREE.Mesh(new THREE.ConeGeometry(.14,.48,32),material(white,.52));ear.position.set(sign*.26,2.2,0);ear.rotation.z=-sign*.14;g.add(ear);
      ball(g,.043,black,sign*.23,1.9,.365,1,1.15,.65);ball(g,.012,'#ffffff',sign*.23-.008,1.916,.395);
      const shoulder=new THREE.Group();shoulder.position.set(sign*.49,1.32,0);g.add(shoulder);const arm=box(shoulder,.115,.58,.135,black,0,-.26,.025,.057);arm.rotation.z=sign*.05;ball(shoulder,.087,black,0,-.56,.05,.86,1.12,1);this.arms.push({joint:shoulder,sign});if(sign===1)g.userData.throwArm=shoulder;
      const hip=new THREE.Group();hip.position.set(sign*.2,.42,0);g.add(hip);const leg=box(hip,.1,.31,.12,black,0,-.12,0,.046);ball(hip,.11,black,0,-.3,.09,.9,.64,1.38);this.legs.push({joint:hip,sign});
    }
    ball(g,.23,white,.3,.8,-.35,1,1,1.15);box(g,.62,.69,.22,'#507c64',0,1.05,-.46,.13);box(g,.52,.21,.035,'#6d987b',0,1.25,-.585,.035);box(g,.12,.09,.04,'#dcb978',0,1.15,-.61,.015);
    for(const x of [-.25,.25])box(g,.06,.72,.035,'#3d6253',x,1.08,-.27,.02);
    const badge=new THREE.Mesh(new THREE.CircleGeometry(.1,24),material('#f2e3b7',.45));badge.position.set(.13,.92,-.588);badge.rotation.y=Math.PI;g.add(badge);
    g.scale.setScalar(1.1);return g;
  }
  picking(){
    let start;const mouse=new THREE.Vector2();
    this.renderer.domElement.addEventListener('pointerdown',e=>start=[e.clientX,e.clientY]);
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(!this.interactive||this.stage!=='idle'||!start||Math.hypot(e.clientX-start[0],e.clientY-start[1])>6)return;
      const b=this.renderer.domElement.getBoundingClientRect();mouse.set((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2);this.ray.setFromCamera(mouse,this.camera);
      const hit=this.ray.intersectObjects(this.tiles.filter(t=>t.group.visible).map(t=>t.hit),false)[0];if(hit)this.onTile?.(hit.object.userData.index);
    });
  }
  announceStage(stage,extra={}){this.container.dataset.stage=stage;this.container.dispatchEvent(new CustomEvent('worldstage',{detail:{stage,...extra}}));}
  routeIndex(position,mode=this.mode){return position<0?-1:routeFor(mode)[position];}
  walkingSurfaceY(x,z){
    let lift=0;for(const tile of this.tiles){if(!tile.group.visible)continue;const d=Math.hypot(x-tile.position.x,z-tile.position.z);lift=Math.max(lift,.2025*(1-THREE.MathUtils.smoothstep(d,1.42,2.02)));}
    return surfaceY(x,z)+.055+lift;
  }
  place(u){const p=this.curve.getPointAt(u),t=this.curve.getTangentAt(u);this.character.position.set(p.x,this.walkingSurfaceY(p.x,p.z)-.058,p.z);this.heading=Math.atan2(t.x,t.z);this.character.rotation.y=this.heading;this.u=u;}
  setState(state){
    const route=routeFor(state.mode);this.mode=state.mode;this.currentPosition=state.position;this.container.dataset.routeLength=String(route.length);this.state=state;
    this.tiles.forEach(t=>{
      const routePosition=route.indexOf(t.index);t.group.visible=t.sign.visible=routePosition>=0;t.halo.material.opacity=t.index===this.routeIndex(state.position)?0.88:0;t.top.material=material(state.history.some(h=>h.tile===t.index)?'#dce5c9':'#f7f0db');
      if(routePosition>=0&&t.label!==routePosition+1){
        t.label=routePosition+1;t.number.material.map.dispose();t.number.material.map=textMap(String(t.label).padStart(2,'0'),{width:256,height:256,font:116,color:SEASONS[EVENTS[t.index].season].color,background:'#f7f0db'});
        const panel=t.sign.userData.labelPanel;panel.material.map.dispose();panel.material.map=textMap(`${t.label} · ${stationName(EVENTS[t.index])}`,{font:52});
      }
    });
    const s=SEASONS[state.season];this.location.querySelector('strong').textContent=`${s.name} · ${s.title}`;
    this.location.querySelector('small').textContent=state.position<0?'从这里，开始你的四季。':`第 ${state.position+1} / ${state.total} 站 · ${EVENTS[this.routeIndex(state.position)].title}`;
    if(this.stage==='idle'){
      const u=state.position<0?.01:stationU(this.routeIndex(state.position));const changed=Math.abs(this.u-u)>.001;this.place(u);
      if(changed&&this.cameraMode==='follow'){this.cameraHeading=this.heading;this.followCamera(1,true);}
    }
  }
  async throwDice(value){
    if(this.stage!=='idle')return;await this.ready;if(this.isDisposed)return;
    this.stage='dice';this.userOrbit=false;this.controls.enabled=false;this.diceStage='windup';this.cameraMode='follow';this.container.dataset.cameraMode='follow';this.scene.fog=this.fog;this.art.clouds.visible=true;
    try{
      await this.dice.throw({actor:this.character,value,heading:this.heading,groundY:(x,z)=>this.walkingSurfaceY(x,z),reduceMotion:reduce(),onStage:stage=>{this.diceStage=stage;this.announceStage(stage,{value});}});
    }finally{this.stage='idle';this.controls.enabled=this.interactive;this.announceStage('idle',{value});}
  }
  async walk(state,die){
    if(this.stage!=='idle')return;const route=routeFor(state.mode),target=Math.min(state.position+die,route.length-1);this.mode=state.mode;this.stage='walking';this.controls.enabled=false;this.userOrbit=false;
    this.announceStage('walking',{steps:target-state.position});this.dice.mesh.visible=false;
    if(reduce()){this.place(stationU(route[target]));this.stage='idle';this.controls.enabled=this.interactive;return;}
    try{
      const steps=target-state.position,nodes=[this.u,...route.slice(state.position+1,target+1).map(index=>stationU(index))];let announced=-1;
      await this.animate(WALK_STEP_MS*steps,progress=>{
        // Accelerate only at departure and brake only at the final landing.
        // Intermediate cells no longer cause a full stop and another start.
        const edge=.1,eased=progress<edge?progress*progress/(2*edge*(1-edge)):progress>1-edge?1-(1-progress)**2/(2*edge*(1-edge)):(progress-edge/2)/(1-edge);
        const travel=Math.min(steps,eased*steps),segment=Math.min(steps-1,Math.floor(travel)),fraction=travel-segment;
        this.place(THREE.MathUtils.lerp(nodes[segment],nodes[segment+1],fraction));
        this.stepPhase=progress*steps*Math.PI*6;this.character.position.y+=Math.abs(Math.sin(this.stepPhase))*.018;
        this.container.dataset.walkingCell=String(state.position+segment+2);
        if(segment!==announced){announced=segment;this.announceStage('walking',{step:segment+1,steps,position:state.position+segment+1});}
      });
      this.place(stationU(route[target]));
    }finally{this.stage='idle';this.resetLimbs();this.controls.enabled=this.interactive;this.announceStage('arrived',{position:target});}
  }
  async arrive(state){
    this.stage='arrival';this.controls.enabled=false;const tile=this.tiles[this.routeIndex(state.position,state.mode)];if(tile)tile.halo.material.opacity=1;
    await this.animate(reduce()?0:520,p=>{if(tile)tile.halo.scale.setScalar(1+.2*Math.sin(p*Math.PI));});this.stage='idle';this.controls.enabled=this.interactive;
  }
  animate(duration,callback){
    if(!duration||reduce()){callback(1);return Promise.resolve();}
    return new Promise(resolve=>{
      let elapsed=0,last;const visibility=()=>{last=undefined;};
      const finish=()=>{document.removeEventListener('visibilitychange',visibility);this.animationResolve=null;resolve();};
      document.addEventListener('visibilitychange',visibility);
      const frame=now=>{if(this.isDisposed){finish();return;}if(last!==undefined&&!document.hidden)elapsed+=now-last;last=now;const p=Math.min(1,elapsed/duration);callback(p);if(p<1)this.animationId=requestAnimationFrame(frame);else{this.animationId=null;finish();}};
      this.animationId=requestAnimationFrame(frame);this.animationResolve=finish;
    });
  }
  resetLimbs(){for(const {joint} of [...this.legs,...this.arms])joint.rotation.x=0;this.character.rotation.z=0;}
  setInteractionEnabled(enabled){this.interactive=enabled;this.controls.enabled=enabled&&this.stage==='idle';}
  setCameraMode(mode){this.cameraMode=mode==='overview'?'overview':'follow';this.container.dataset.cameraMode=this.cameraMode;this.scene.fog=this.cameraMode==='overview'?null:this.fog;this.art.clouds.visible=this.cameraMode!=='overview';this.routeLine.visible=this.cameraMode==='overview';this.userOrbit=false;this.resetView();}
  resetView(){this.zoomFactor=1;this.userOrbit=false;this.camera.zoom=1;this.camera.updateProjectionMatrix();if(this.cameraMode==='overview'){const fit=Math.max(1,1.62/this.camera.aspect);this.camera.position.set(4,88*fit,68*fit);this.controls.target.set(4,1,-1);this.controls.update();}else{this.cameraHeading=this.heading;this.followCamera(1,true);}}
  zoom(delta){if(this.cameraMode==='overview'){this.camera.zoom=THREE.MathUtils.clamp(this.camera.zoom+delta,.7,1.8);this.camera.updateProjectionMatrix();}else{this.zoomFactor=THREE.MathUtils.clamp(this.zoomFactor-delta,.68,1.5);this.userOrbit=false;}}
  followCamera(delta,immediate=false){
    const blend=immediate?1:1-Math.exp(-delta*3.8);this.cameraHeading+=angleDiff(this.cameraHeading,this.heading)*Math.min(1,delta*3.4);
    const target=this.character.position.clone().add(new THREE.Vector3(0,1.6,0));let offset;
    if(this.stage==='dice'){
      // A medium shot reveals the face, hand and die; the landing gets its own closer framing.
      if(this.diceStage==='settled'||this.diceStage==='bounce'){target.lerp(this.dice.mesh.position.clone().add(new THREE.Vector3(0,.4,0)),.72);offset=new THREE.Vector3(3.4,3.8,4.4);}
      else{target.add(new THREE.Vector3(0,-.15,0));offset=new THREE.Vector3(5,3.1,5.8);}
    }else offset=new THREE.Vector3(2.4,4.1,-10.8).multiplyScalar(this.zoomFactor);
    offset.applyAxisAngle(new THREE.Vector3(0,1,0),this.cameraHeading);const destination=target.clone().add(offset);destination.y=Math.max(destination.y,surfaceY(destination.x,destination.z)+2.2);
    this.camera.position.lerp(destination,blend);this.controls.target.lerp(target,immediate?1:1-Math.exp(-delta*6));this.controls.update();
  }
  occlusion(){
    const next=new Set();if(this.cameraMode==='follow'){
      this.scene.updateMatrixWorld();const target=this.character.position.clone().add(new THREE.Vector3(0,1.35,0)),distance=target.distanceTo(this.camera.position);this.ray.set(this.camera.position,target.sub(this.camera.position).normalize());this.ray.far=distance-.35;
      for(const o of this.art.occluders){if(!o.group.visible)continue;const nearbyGate=this.stage==='dice'&&o.group.userData.cinematicOccluder&&o.center.distanceTo(this.character.position)<7.5;if(nearbyGate||o.center.distanceTo(this.camera.position)<o.radius+1.3||this.ray.intersectObjects(o.meshes,false).length)o.group.traverse(m=>{if(m.isMesh)next.add(m);});}
      if(this.stage==='dice'&&this.dice.mesh.visible){const diceTarget=this.dice.mesh.position.clone();this.ray.set(this.camera.position,diceTarget.clone().sub(this.camera.position).normalize());this.ray.far=diceTarget.distanceTo(this.camera.position);for(const o of this.art.occluders){if(o.group.visible&&this.ray.intersectObjects(o.meshes,false).length)o.group.traverse(m=>{if(m.isMesh)next.add(m);});}}
    }
    for(const m of this.faded)if(!next.has(m))m.material=m.userData.solid;
    for(const m of next){if(!m.userData.faded){m.userData.solid=m.material;m.userData.faded=m.material.clone();m.userData.faded.transparent=true;m.userData.faded.opacity=.1;m.userData.faded.depthWrite=false;}m.material=m.userData.faded;}this.faded=next;
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();if(this.cameraMode==='overview')this.resetView();}
  frame(time){
    if(this.isDisposed)return;const delta=Math.min(.05,this.lastFrame?(time-this.lastFrame)/1000:1/60);this.lastFrame=time;
    if(this.userOrbit&&this.orbitUntil&&time>this.orbitUntil)this.userOrbit=false;
    if(this.cameraMode==='follow'&&!this.userOrbit)this.followCamera(delta,reduce());
    this.controls.update();
    if(!reduce()){
      this.art.update(time);
      if(this.stage==='walking'){for(const {joint,sign} of this.legs)joint.rotation.x=Math.sin(this.stepPhase)*.48*sign;for(const {joint,sign} of this.arms)joint.rotation.x=-Math.sin(this.stepPhase)*.32*sign;}
      else if(!this.character.userData.diceThrowing){this.character.rotation.z=Math.sin(time*.0014)*.012;for(const {joint,sign} of this.arms)joint.rotation.x=Math.sin(time*.0012)*.035*sign;}
    }
    this.sun.target.position.copy(this.character.position);this.sun.position.copy(this.character.position).add(new THREE.Vector3(-28,43,21));
    if(!this.lastOcclusion||time-this.lastOcclusion>150){this.art.setView(this.camera,this.cameraMode==='overview');this.occlusion();this.lastOcclusion=time;}
    this.renderer.render(this.scene,this.camera);const w=this.container.clientWidth,h=this.container.clientHeight;
    for(const label of this.labels){const p=label.position.clone().project(this.camera);label.el.style.transform=`translate(-50%,-50%) translate(${(p.x+1)*w/2}px,${(1-p.y)*h/2}px)`;label.el.style.opacity=this.cameraMode==='overview'&&p.z<1&&Math.abs(p.x)<1&&Math.abs(p.y)<1?'1':'0';}
  }
  dispose(){this.isDisposed=true;cancelAnimationFrame(this.animationId);this.animationResolve?.();this.dice.dispose();this.art.dispose();this.renderer.setAnimationLoop(null);this.resizeObserver.disconnect();this.controls.dispose();this.environment.dispose();this.renderer.dispose();}
}

export function fallbackWorld(container,onTile){
  container.dataset.renderer='fallback';container.dataset.assets='fallback';container.innerHTML='<div class="fallback-note">当前设备无法启用 3D，使用轻量连续路线。事件、数值和 AI 回顾不变。</div><div class="fallback-board"></div>';
  return{ready:Promise.resolve(),setState(s){const r=routeFor(s.mode);container.querySelector('.fallback-board').innerHTML=r.map((index,i)=>`<button class="fallback-tile ${i===s.position?'current':''}" data-index="${index}">${i+1} · ${EVENTS[index].title}</button>`).join('');container.querySelectorAll('[data-index]').forEach(b=>b.onclick=()=>onTile?.(Number(b.dataset.index)));},throwDice:()=>sleep(200),walk:()=>sleep(200),arrive:()=>Promise.resolve(),setCameraMode(){},setInteractionEnabled(){},zoom(){},resetView(){},dispose(){}};
}
