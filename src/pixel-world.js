import { EVENTS } from './events.js';
import { routeFor } from './route.js';
import {loadSeasonTrees,applySeasonTrees} from './seasonal-art.js';
import {LANDMARK_ART_READY,loadLifeLandmarks,applyLifeLandmarks} from './landmark-art.js';
import {LIFE_CHAPTERS} from './season-chapters.js';
import {MAP_WIDTH,MAP_HEIGHT,buildPixelRoute,routePoint,createPixelArt,drawStation,drawBear,drawPixelDice,drawButterfly,pixelOval} from './pixel-art.js';

const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const smooth=t=>t*t*(3-2*t);
export const PIXEL_WALK_STEP_MS=820;

export const SEASON_WEATHER=Object.freeze(['blossoms','fireflies','leaves','snow']);
// World-space bands match seasonAt() in pixel-art.js. Weather cannot spill over
// into another chapter when the player pans or uses the four-season overview.
export const WEATHER_BANDS=Object.freeze([
  Object.freeze({top:680,bottom:1000}),Object.freeze({top:495,bottom:680}),
  Object.freeze({top:310,bottom:495}),Object.freeze({top:100,bottom:310})
]);
export function seasonWeatherParticles(season,elapsed=0,{motion=true}={}){
  if(!Number.isInteger(season)||!WEATHER_BANDS[season])return [];
  const time=motion&&Number.isFinite(elapsed)?Math.max(0,elapsed):0,band=WEATHER_BANDS[season],height=band.bottom-band.top;
  const count=[72,46,90,145][season],speed=[.009,.001,.013,.020][season];
  return Array.from({length:count},(_,i)=>{
    const phase=i*2.39,drift=Math.sin(time*.0008+phase)*[14,8,23,17][season];
    const x=35+((i*137+season*71+time*.004)%1430)+drift;
    const y=band.top+((i*53+time*speed+Math.sin(phase)*17+height)%height);
    return {x,y,size:season===3?(i%4===0?3:2):season===2?3+i%3:2+i%2,phase,time,variant:i%3};
  });
}

function drawSeasonWeather(c,time,bounds,motion){
  const {left,top,right,bottom}=bounds;
  for(let season=0;season<4;season++){
    const band=WEATHER_BANDS[season];if(band.bottom<top||band.top>bottom)continue;
    c.save();c.beginPath();c.rect(0,band.top,MAP_WIDTH,band.bottom-band.top);c.clip();
    // The summer is bright and alive; a few short sun shafts remain local to it.
    if(season===1){c.fillStyle='#ffec9622';for(let i=0;i<6;i++){const x=100+i*265;c.beginPath();c.moveTo(x,band.top);c.lineTo(x+38,band.top);c.lineTo(x+96,band.bottom);c.lineTo(x+75,band.bottom);c.closePath();c.fill();}}
    for(const particle of seasonWeatherParticles(season,time,{motion})){
      const {x,y,size,phase,variant}=particle;if(x<left-5||x>right+5||y<top-5||y>bottom+5)continue;const px=Math.round(x),py=Math.round(y);
      if(season===0){c.fillStyle=variant?'#fff0e9':'#ef9cbd';c.fillRect(px,py,size,2);c.fillStyle='#d4779b';c.fillRect(px+1,py+2,1,1);}
      else if(season===1){const glow=motion ? .35+(.5+.5*Math.sin(time*.002+phase))*.65 : .7;c.globalAlpha=glow;c.fillStyle='#fff6b54d';c.fillRect(px-2,py-2,6,6);c.fillStyle='#fff7b0';c.fillRect(px,py,2,2);c.globalAlpha=1;}
      else if(season===2){const flip=Math.abs(Math.sin(time*.002+phase)),width=Math.max(2,Math.round(size*flip));c.fillStyle=['#b64f2d','#e77e2f','#ffd675'][variant];c.fillRect(px,py,width,2);c.fillRect(px+1,py-1,Math.max(1,width-1),4);c.fillStyle='#854a2e';c.fillRect(px+1,py+3,1,2);}
      else{c.fillStyle='#709bac60';c.fillRect(px+1,py+1,size,size);c.fillStyle='#ffffff';c.fillRect(px,py,size,1);c.fillRect(px+(size>>1),py-1,1,size+1);}
    }
    c.restore();
  }
}

export class PixelWorld {
  constructor(container,onTile){
    this.container=container;this.onTile=onTile;this.isDisposed=false;this.interactive=true;this.stage='idle';this.mode='full';this.cameraMode='follow';this.zoomFactor=1;this.currentPosition=-1;this.elapsed=0;this.animation=null;this.action=null;this.arrivalLift=0;this.die=null;this.pan={x:0,y:0};
    this.route=buildPixelRoute();this.tiles=this.route.stations.map(p=>({...p,cinematic:Boolean(EVENTS[p.index].cinematicId)}));this.distance=0;this.character=routePoint(this.route,0);this.art=createPixelArt(this.route);this.camera={x:this.character.x,y:this.character.y,scale:1};
    this.canvas=document.createElement('canvas');this.canvas.className='pixel-world-canvas';this.canvas.setAttribute('aria-label','刘看山的四季像素小镇：40个地点，一条连续的田园小路。可拖动画面，点击路牌查看地点。');this.canvas.setAttribute('role','img');Object.assign(this.canvas.style,{width:'100%',height:'100%',display:'block',imageRendering:'pixelated',touchAction:'none'});container.appendChild(this.canvas);this.ctx=this.canvas.getContext('2d',{alpha:false});if(!this.ctx)throw new Error('当前浏览器无法建立像素画布');this.ctx.imageSmoothingEnabled=false;
    container.setAttribute('aria-label','四季人生像素世界');Object.assign(container.dataset,{renderer:'pixel',assets:'ready',cameraMode:'follow',stage:'idle',routeLength:'40',worldLayout:'pixel-four-seasons',pixelArt:'original-canvas',loadedModels:'0',position:'-1',season:'0',weather:'blossoms',lifeStage:LIFE_CHAPTERS[0].stage});
    this.location=document.createElement('div');this.location.className='world-location pixel-world-location';this.location.innerHTML='<span>四季小镇 · 春日清晨</span><strong>春 · 破土萌芽</strong><small>从这里，开始你的四季。</small>';container.appendChild(this.location);
    container.dataset.treeArt='loading';container.dataset.landmarkArt='loading';
    this.seasonTreesAbort=new AbortController();let treesApplied=false;
    const applyTrees=image=>{
      if(this.isDisposed||treesApplied)return;
      const count=image?applySeasonTrees(this.art,this.route,image):0;
      treesApplied=count>0;
      container.dataset.treeArt=count?'seasonal-sprites':'code-fallback';container.dataset.treeSpriteCount=String(count);
    };
    this.ready=Promise.all([loadSeasonTrees({signal:this.seasonTreesAbort.signal,onLateLoad:applyTrees}),LANDMARK_ART_READY?loadLifeLandmarks():Promise.resolve(null)]).then(([image,landmarks])=>{
      if(this.isDisposed)return {loaded:0,failed:0,renderer:'pixel'};
      const landmarkCount=landmarks?applyLifeLandmarks(this.art,this.route,landmarks):0;
      container.dataset.landmarkArt=landmarkCount?'local-sprites':'code-fallback';container.dataset.landmarkCount=String(landmarkCount);
      container.dataset.landmarks=this.art.objects.filter(o=>o.kind==='landmark').map(o=>o.id).join(',');
      applyTrees(image);
      return {loaded:this.art.objects.length,failed:(treesApplied?0:1)+(landmarkCount?0:1),renderer:'pixel'};
    });this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);this.resize();this.updateCamera(1,true);this.bindPointer();this.onVisibility=()=>{this.lastTime=null;};document.addEventListener('visibilitychange',this.onVisibility);this.frame=this.frame.bind(this);this.frameId=requestAnimationFrame(this.frame);
  }
  announceStage(stage,extra={}){this.container.dataset.stage=stage;this.container.dispatchEvent(new CustomEvent('worldstage',{detail:{stage,...extra}}));}
  isPaused(){return document.hidden||Boolean(document.querySelector('#dialog[open]'))||Boolean(typeof matchMedia==='function'&&matchMedia('(orientation: portrait)').matches);}
  routeIndex(position,mode=this.mode){return position<0?-1:routeFor(mode)[position];}
  place(distance){this.distance=clamp(distance,0,this.route.totalDistance);this.character=routePoint(this.route,this.distance);this.container.dataset.characterX=String(Math.round(this.character.x));this.container.dataset.characterY=String(Math.round(this.character.y));}
  setState(state){
    const restarting=this.state&&(state.mode!==this.state.mode||state.position<this.state.position||state.turn<this.state.turn||(state.position===-1&&this.stage!=='idle'));
    if(restarting)this.cancelAnimations();this.state=state;this.mode=state.mode;this.currentPosition=state.position;const route=routeFor(state.mode),index=this.routeIndex(state.position);this.activeRoute=route;this.visited=new Set(state.history.map(h=>h.tile));
    this.tiles.forEach(t=>{t.visible=route.includes(t.index);t.label=route.indexOf(t.index)+1;});Object.assign(this.container.dataset,{position:String(state.position),routeLength:String(route.length)});
    const chapter=LIFE_CHAPTERS[state.season];Object.assign(this.container.dataset,{season:String(state.season),weather:chapter.weather,lifeStage:chapter.stage});this.location.querySelector('span').textContent=chapter.scene;this.location.querySelector('strong').textContent=`${chapter.name} · ${chapter.stage}`;this.location.querySelector('small').textContent=index<0?'从这里，开始你的四季。':`第 ${state.position+1} / ${state.total} 站 · ${EVENTS[index].location}`;
    if(this.stage==='idle'){this.place(index<0?0:this.route.stations[index].distance);if(restarting){this.pan={x:0,y:0};this.updateCamera(1,true);}}
  }
  animate(duration,update,{signal}={}){
    if(this.isDisposed||signal?.aborted)return Promise.resolve(false);
    if(!duration||reduced()){update(1);return Promise.resolve(true);}
    return new Promise(resolve=>{const animation={duration,elapsed:0,update,resolve,signal};animation.abort=()=>{if(this.animation===animation)this.animation=null;signal?.removeEventListener('abort',animation.abort);resolve(false);};signal?.addEventListener('abort',animation.abort,{once:true});this.animation=animation;});
  }
  finishAnimation(animation,success){if(this.animation===animation)this.animation=null;animation.signal?.removeEventListener('abort',animation.abort);animation.resolve(success);}
  async throwDice(value,options={}){
    if(!Number.isInteger(value)||value<1||value>6)throw new Error('骰子点数必须是1到6的整数');if(this.action||this.isDisposed)return;const token={};this.action=token;this.stage='dice';this.pan={x:0,y:0};this.cameraMode='follow';this.container.dataset.cameraMode='follow';this.container.dataset.diceValue=String(value);this.announceStage('windup',{value});
    const landing=routePoint(this.route,Math.min(this.route.totalDistance,this.distance+48));this.die={value,x:this.character.x+22,y:this.character.y-18,rotation:0,shadowY:this.character.y+3,scale:.68,stage:'windup'};
    try{let lastStage='';const success=await this.animate(2200,p=>{
      const stage=p<.16?'windup':p<.52?'flight':p<.68?'bounce':'settled';this.die.stage=stage;if(stage!==lastStage){lastStage=stage;this.announceStage(stage,{value});}
      const flight=clamp((p-.16)/.36,0,1),bounce=p<.52?0:Math.sin(clamp((p-.52)/.16,0,1)*Math.PI)*8;this.die.x=this.character.x+18+(landing.x-this.character.x-18)*flight;this.die.y=this.character.y-21+(landing.y-this.character.y+18)*flight-Math.sin(flight*Math.PI)*51-bounce;this.die.shadowY=landing.y+4;this.die.rotation=p<.68?Math.sin(p*25)*(1-p)*.8:0;this.die.scale=.68+flight*.24;
      this.container.dataset.diceStage=stage;
    },options);if(success&&this.action===token){this.die.rotation=0;this.die.stage='settled';}else if(this.action===token)this.die=null;}
    finally{if(this.action===token){this.stage='idle';this.action=null;this.announceStage('idle',{value});}}
  }
  async walk(state,die,options={}){
    if(this.action||this.isDisposed)return;const route=routeFor(state.mode),target=Math.min(state.position+die,route.length-1),steps=target-state.position;if(steps<=0)return;const token={};this.action=token;this.stage='walking';this.mode=state.mode;this.die=null;const nodes=[this.distance,...route.slice(state.position+1,target+1).map(index=>this.route.stations[index].distance)];let announced=-1;this.announceStage('walking',{steps});
    try{const success=await this.animate(PIXEL_WALK_STEP_MS*steps,p=>{const edge=.12,eased=p<edge?p*p/(2*edge*(1-edge)):p>1-edge?1-(1-p)**2/(2*edge*(1-edge)):(p-edge/2)/(1-edge);const travel=Math.min(steps,eased*steps),segment=Math.min(steps-1,Math.floor(travel)),fraction=travel-segment;this.place(nodes[segment]+(nodes[segment+1]-nodes[segment])*fraction);this.container.dataset.walkingCell=String(state.position+segment+2);if(announced!==segment){announced=segment;this.announceStage('walking',{step:segment+1,steps,position:state.position+segment+1});}},options);if(success&&this.action===token)this.place(this.route.stations[route[target]].distance);}
    finally{if(this.action===token){this.stage='idle';this.action=null;this.announceStage('arrived',{position:target});}}
  }
  async arrive(state,options={}){
    if(this.action||this.isDisposed)return;const token={};this.action=token;this.stage='arrival';this.arrivalIndex=this.routeIndex(state.position,state.mode);this.announceStage('arrival',{position:state.position});
    try{await this.animate(440,p=>{this.arrivalLift=Math.sin(p*Math.PI)*5;this.arrivalRing=p;},options);}finally{if(this.action===token){this.arrivalLift=0;this.arrivalRing=0;this.stage='idle';this.action=null;this.announceStage('idle');}}
  }
  cancelAnimations(){this.action=null;if(this.animation)this.finishAnimation(this.animation,false);this.stage='idle';this.arrivalLift=0;this.arrivalRing=0;this.die=null;this.announceStage('idle');}
  setInteractionEnabled(enabled){this.interactive=Boolean(enabled);this.container.dataset.interaction=String(this.interactive);}
  setCameraMode(mode){this.cameraMode=mode==='overview'?'overview':'follow';this.container.dataset.cameraMode=this.cameraMode;this.zoomFactor=1;this.pan={x:0,y:0};if(reduced())this.updateCamera(1,true);}
  zoom(delta){this.zoomFactor=clamp(this.zoomFactor+delta,.7,1.7);}
  resetView(){this.zoomFactor=1;this.pan={x:0,y:0};if(reduced())this.updateCamera(1,true);}
  resize(){const w=this.container.clientWidth||960,h=this.container.clientHeight||540;this.width=clamp(Math.round(w/2.25),360,800);this.height=Math.max(180,Math.round(this.width*h/w));this.canvas.width=this.width;this.canvas.height=this.height;this.ctx.imageSmoothingEnabled=false;if(reduced())this.updateCamera(1,true);}
  updateCamera(dt,immediate=false){
    const overview=this.cameraMode==='overview',fit=Math.min(this.width/(MAP_WIDTH+90),this.height/(MAP_HEIGHT+40)),scale=(overview?fit:Math.max(.9,this.width/615))*this.zoomFactor;let x=overview?MAP_WIDTH/2:this.character.x+Math.cos(this.character.heading)*49,y=overview?MAP_HEIGHT/2:this.character.y-28;x+=this.pan.x;y+=this.pan.y;
    const halfW=this.width/scale/2,halfH=this.height/scale/2;x=halfW*2<MAP_WIDTH?clamp(x,halfW,MAP_WIDTH-halfW):MAP_WIDTH/2;y=halfH*2<MAP_HEIGHT?clamp(y,halfH,MAP_HEIGHT-halfH):MAP_HEIGHT/2;const blend=immediate?1:1-Math.exp(-dt*5);this.camera.x+=(x-this.camera.x)*blend;this.camera.y+=(y-this.camera.y)*blend;this.camera.scale+=(scale-this.camera.scale)*blend;
  }
  bindPointer(){
    this.pointerDown=e=>{if(!this.interactive||this.stage!=='idle')return;this.drag={x:e.clientX,y:e.clientY,pan:{...this.pan},moved:false};this.canvas.setPointerCapture?.(e.pointerId);};
    this.pointerMove=e=>{if(!this.drag||!this.interactive)return;const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;if(Math.hypot(dx,dy)>5)this.drag.moved=true;const ratio=this.width/(this.canvas.getBoundingClientRect().width||this.canvas.clientWidth||1)/this.camera.scale;this.pan.x=this.drag.pan.x-dx*ratio;this.pan.y=this.drag.pan.y-dy*ratio;this.canvas.style.cursor=this.drag.moved?'grabbing':'grab';};
    this.pointerUp=e=>{if(!this.drag)return;const moved=this.drag.moved;this.drag=null;this.canvas.style.cursor='grab';if(moved||!this.interactive||this.stage!=='idle')return;const box=this.canvas.getBoundingClientRect(),x=((e.clientX-box.left)*this.width/box.width-this.width/2)/this.camera.scale+this.camera.x,y=((e.clientY-box.top)*this.height/box.height-this.height/2)/this.camera.scale+this.camera.y;const tile=this.tiles.filter(t=>t.visible!==false).find(t=>Math.abs(x-t.x)<25&&Math.abs(y-t.y)<36);if(tile)this.onTile?.(tile.index);};
    this.pointerCancel=()=>{this.drag=null;};this.wheel=e=>{if(!this.interactive||this.stage!=='idle')return;e.preventDefault();this.zoom(e.deltaY<0?.08:-.08);};this.canvas.addEventListener('pointerdown',this.pointerDown);this.canvas.addEventListener('pointermove',this.pointerMove);this.canvas.addEventListener('pointerup',this.pointerUp);this.canvas.addEventListener('pointercancel',this.pointerCancel);this.canvas.addEventListener('wheel',this.wheel,{passive:false});
  }
  draw(){
    const c=this.ctx,{x:cx,y:cy,scale}=this.camera,w=this.width,h=this.height,left=cx-w/scale/2,top=cy-h/scale/2,right=cx+w/scale/2,bottom=cy+h/scale/2;c.setTransform(1,0,0,1,0,0);c.fillStyle='#b3dfdd';c.fillRect(0,0,w,h);c.save();c.translate(Math.round(w/2-cx*scale),Math.round(h/2-cy*scale));c.scale(scale,scale);c.imageSmoothingEnabled=false;c.drawImage(this.art.terrain,0,0);const time=reduced()?0:this.elapsed;
    for(const lake of this.art.lakes){for(let i=0;i<7;i++){const xx=lake.x+(i-3)*lake.rx*.21+Math.sin(time*.0004+i)*3,yy=lake.y+Math.sin(i*1.7)*lake.ry*.65;c.fillStyle=i%2?'#b5e0cf':'#7ec7c1';c.fillRect(Math.round(xx),Math.round(yy),9+i%3*3,1);}}
    for(const tile of this.tiles){if(tile.visible===false||tile.x<left-70||tile.x>right+70||tile.y<top-70||tile.y>bottom+70)continue;drawStation(c,tile,{label:tile.label||tile.index+1,visited:this.visited?.has(tile.index),current:tile.index===this.routeIndex(this.currentPosition),cinematic:tile.cinematic,time,overview:this.cameraMode==='overview'});}
    if(this.arrivalRing){const p=this.character,r=18+this.arrivalRing*17;c.globalAlpha=1-this.arrivalRing;pixelOval(c,p.x,p.y,r,Math.round(r*.45),'#ffec9c');c.globalAlpha=1;}
    const actor={...this.character,kind:'actor'},objects=[...this.art.objects.filter(o=>o.x-o.offsetX<right&&o.x-o.offsetX+o.sprite.width>left&&o.y-o.offsetY<bottom&&o.y-o.offsetY+o.sprite.height>top),actor].sort((a,b)=>a.y-b.y);
    for(const object of objects){if(object.kind==='actor'){drawBear(c,object.x,object.y,{time,motion:!reduced(),walking:this.stage==='walking',heading:object.heading,throwing:this.stage==='dice',arrival:this.arrivalLift});continue;}const broad=object.kind==='landmark',hidesActor=object.kind!=='garden'&&object.y>actor.y&&object.y-actor.y<(broad?object.offsetY:95)&&Math.abs(object.x-actor.x)<(broad?object.sprite.width/2+12:49);if(hidesActor)c.globalAlpha=.37;c.drawImage(object.sprite,Math.round(object.x-object.offsetX),Math.round(object.y-object.offsetY));c.globalAlpha=1;}
    // Wayfinding stays legible even where a foreground canopy overlaps a sign.
    if(this.cameraMode!=='overview')for(const tile of this.tiles){if(tile.visible===false||tile.x<left-70||tile.x>right+70||tile.y<top-70||tile.y>bottom+70)continue;drawStation(c,tile,{labelsOnly:true,name:EVENTS[tile.index].location,cinematic:tile.cinematic});}
    if(this.die){const d=this.die;pixelOval(c,d.x,d.shadowY,11,4,'#6557403f');drawPixelDice(c,d.x,d.y,d.value,{rotation:d.rotation,scale:d.scale});}
    // Butterflies belong to spring and summer, never a snowy winter sky.
    for(let i=0;i<18;i++){const x=110+(i*179)%1290+Math.sin(time*.0006+i)*19,y=530+(i*71)%370+Math.cos(time*.0009+i)*9;if(x>left&&x<right&&y>top&&y<bottom)drawButterfly(c,x,y,time+i*317,i%3?'#fff2b5':'#f5afbf');}
    drawSeasonWeather(c,time,{left,top,right,bottom},!reduced());
    c.restore();
    if(this.cameraMode==='overview'){for(let season=0;season<4;season++){const sy=780-season*185-104,px=Math.round(w/2+(MAP_WIDTH/2-cx)*scale),py=Math.round(h/2+(sy-cy)*scale);c.font='bold 11px "Microsoft YaHei",sans-serif';c.textAlign='center';const chapter=LIFE_CHAPTERS[season],label=`${chapter.name} · ${chapter.stage}`;const tw=c.measureText(label).width;c.fillStyle=['#ffedf0f0','#edf9ddf0','#ffe4bbf0','#edf7fff0'][season];c.fillRect(px-tw/2-9,py-12,tw+18,20);c.fillStyle=chapter.color;c.fillRect(px-tw/2-9,py-12,3,20);c.fillText(label,px+1,py+2);}}
  }
  frame(now){
    if(this.isDisposed)return;const dt=this.lastTime===null||this.lastTime===undefined?0:Math.min(80,Math.max(0,now-this.lastTime));this.lastTime=now;const paused=this.isPaused();this.container.dataset.paused=String(paused);
    if(!paused){if(!reduced())this.elapsed+=dt;const animation=this.animation;if(animation){animation.elapsed+=dt;const p=reduced()?1:Math.min(1,animation.elapsed/animation.duration);animation.update(p);if(p===1)this.finishAnimation(animation,true);}this.updateCamera(dt/1000,reduced());}
    this.draw();this.frameId=requestAnimationFrame(this.frame);
  }
  dispose(){if(this.isDisposed)return;this.isDisposed=true;this.seasonTreesAbort.abort();this.cancelAnimations();cancelAnimationFrame(this.frameId);this.resizeObserver.disconnect();document.removeEventListener('visibilitychange',this.onVisibility);for(const [name,handler] of [['pointerdown',this.pointerDown],['pointermove',this.pointerMove],['pointerup',this.pointerUp],['pointercancel',this.pointerCancel],['wheel',this.wheel]])this.canvas.removeEventListener(name,handler);this.canvas.remove();this.location.remove();this.art.terrain.width=1;this.art.objects.length=0;}
}

// Accessible emergency route when Canvas itself is unavailable. It does not
// claim that this plain list is the delivered pixel art renderer.
export function fallbackWorld(container,onTile){
  container.dataset.renderer='fallback';container.innerHTML='';const note=document.createElement('p');note.className='fallback-note';note.textContent='当前浏览器无法建立像素画布，使用地点列表继续体验。';const board=document.createElement('div');board.className='fallback-board';container.append(note,board);let enabled=true;
  return {ready:Promise.resolve(),setState(state){board.replaceChildren();routeFor(state.mode).forEach((index,i)=>{const b=document.createElement('button');b.className=`fallback-tile ${i===state.position?'current':''}`;b.textContent=`${i+1} · ${EVENTS[index].location}`;b.onclick=()=>{if(enabled)onTile?.(index);};board.appendChild(b);});},async throwDice(){},async walk(){},async arrive(){},setCameraMode(){},zoom(){},resetView(){},setInteractionEnabled(value){enabled=value;board.querySelectorAll('button').forEach(b=>b.disabled=!value);},dispose(){board.remove();note.remove();}};
}
