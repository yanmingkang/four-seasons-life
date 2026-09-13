import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {JourneyWorld,fitCameraBounds} from '../src/journey-world.js';

test('paused backdrop renders once and invalidates on camera, viewport, season, position or resume changes',()=>{
  const world=Object.create(JourneyWorld.prototype);Object.assign(world,{camera:new THREE.PerspectiveCamera(),character:new THREE.Group(),art:{activeSeason:0,populated:true},container:{clientWidth:1440,clientHeight:900},cameraMode:'follow',mode:'full',stage:'idle',currentPosition:0});
  assert.equal(world.shouldRenderPausedFrame(true),true);assert.equal(world.shouldRenderPausedFrame(true),false);
  for(const change of [()=>world.camera.position.x++,()=>world.camera.quaternion.x=.2,()=>world.camera.zoom=1.2,()=>world.container.clientWidth=844,()=>world.art.activeSeason=1,()=>world.currentPosition=4,()=>world.character.position.z++]){change();assert.equal(world.shouldRenderPausedFrame(true),true);assert.equal(world.shouldRenderPausedFrame(true),false);}
  assert.equal(world.shouldRenderPausedFrame(false),true);assert.equal(world.shouldRenderPausedFrame(false),true);assert.equal(world.shouldRenderPausedFrame(true),true);assert.equal(world.shouldRenderPausedFrame(true),false);
});

test('perspective framing keeps tall buildings and the full map inside desktop/mobile HUD margins',()=>{
  for(const [width,height] of [[1440,900],[844,390]])for(const bounds of [new THREE.Box3(new THREE.Vector3(-68,-1,-64),new THREE.Vector3(64,13,61)),new THREE.Box3(new THREE.Vector3(-8,0,-6),new THREE.Vector3(8,11,6))]){
    const camera=new THREE.PerspectiveCamera(43,width/height,.08,420),insets={left:44,right:44,top:Math.min(180,height*.25),bottom:Math.min(100,height*.21)};
    const fit=fitCameraBounds(camera,bounds,{width,height,insets});assert.ok(fit.distance>0);
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){
      const projected=new THREE.Vector3(x,y,z).project(camera),px=(projected.x+1)*width/2,py=(1-projected.y)*height/2;
      assert.ok(px>=insets.left&&px<=width-insets.right,`horizontal framing at ${width}×${height}`);
      assert.ok(py>=insets.top&&py<=height-insets.bottom,`vertical framing at ${width}×${height}`);assert.ok(projected.z>-1&&projected.z<1);
    }
  }
});

test('wheel gestures are bounded and only consumed by an interactive idle world',()=>{
  const world=Object.create(JourneyWorld.prototype),canvas=new EventTarget();let paused=false;
  Object.assign(world,{renderer:{domElement:canvas},container:{clientHeight:900,dataset:{}},cameraMode:'follow',zoomFactor:1,interactive:true,stage:'idle',action:null,isDisposed:false,isPaused:()=>paused});world.picking();
  const wheel=(deltaY,deltaMode=0)=>{const event=new Event('wheel',{cancelable:true});Object.assign(event,{deltaY,deltaMode});canvas.dispatchEvent(event);return event.defaultPrevented;};
  assert.equal(wheel(-100000),true);assert.ok(Math.abs(world.zoomFactor-.82)<1e-9);
  for(let n=0;n<20;n++)wheel(-1,2);assert.equal(world.zoomFactor,.68);
  for(let n=0;n<20;n++)wheel(120,1);assert.equal(world.zoomFactor,1.5);
  for(const gate of ['paused','interactive','walking','action','disposed']){
    paused=gate==='paused';world.interactive=gate!=='interactive';world.stage=gate==='walking'?'walking':'idle';world.action=gate==='action'?{}:null;world.isDisposed=gate==='disposed';
    assert.equal(wheel(-200),false,gate);assert.equal(world.zoomFactor,1.5,gate);
  }
});

test('sky stays inside the far plane and centred on cameras outside the old dome',()=>{
  const world=Object.create(JourneyWorld.prototype),camera=new THREE.PerspectiveCamera(43,844/390,.08,551),sky=new THREE.Mesh(new THREE.SphereGeometry(230,8,6),new THREE.MeshBasicMaterial({side:THREE.BackSide}));
  camera.position.set(1.7,193.5,149.5);
  Object.assign(world,{camera,cameraMode:'overview',controls:{target:new THREE.Vector3(1.7,5.3,-2.4)},art:{skyDome:sky},container:{dataset:{}},scene:new THREE.Scene(),fog:new THREE.Fog('#ceded6',65,360),overviewFog:new THREE.Fog('#ceded6',250,470)});
  world.updateAtmosphere();assert.ok(sky.position.equals(camera.position));assert.ok(sky.geometry.parameters.radius*sky.scale.x<camera.far);assert.equal(sky.material.depthTest,false);assert.equal(sky.material.depthWrite,false);assert.equal(sky.frustumCulled,false);assert.ok(sky.renderOrder<0);assert.equal(world.scene.fog,world.overviewFog);assert.ok(world.overviewFog.near>240&&world.overviewFog.far<camera.far);
  camera.position.set(-241,70,12);world.updateAtmosphere();assert.ok(sky.position.equals(camera.position));world.cameraMode='follow';world.updateAtmosphere();assert.equal(world.scene.fog,world.fog);sky.geometry.dispose();sky.material.dispose();
});

test('3D travel clock excludes paused time, resumes without jumping, and cancels cleanly',async()=>{
  const previous={raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame,document:globalThis.document};
  let serial=0,paused=false;const frames=new Map(),progress=[];
  globalThis.requestAnimationFrame=callback=>{const id=++serial;frames.set(id,callback);return id;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);globalThis.document=new EventTarget();
  const tick=time=>{const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(time));};
  try{
    const world=Object.create(JourneyWorld.prototype);Object.assign(world,{isDisposed:false,isPaused:()=>paused,animation:null});
    const animation=world.animate(1000,p=>progress.push(p));tick(0);tick(300);assert.equal(progress.at(-1),.3);
    paused=true;tick(600);tick(9000);assert.equal(progress.at(-1),.3);
    paused=false;tick(9500);assert.equal(progress.at(-1),.3);tick(10200);assert.equal(await animation,true);assert.equal(progress.at(-1),1);assert.equal(frames.size,0);
    const next=world.animate(500,p=>progress.push(p));tick(12000);world.animation.finish(false);assert.equal(await next,false);assert.equal(world.animation,null);assert.equal(frames.size,0);
    const controller=new AbortController();const aborted=world.animate(500,()=>assert.fail('aborted callbacks must not run'),{signal:controller.signal});controller.abort();assert.equal(await aborted,false);assert.equal(frames.size,0);
  }finally{
    for(const [key,original] of [['requestAnimationFrame',previous.raf],['cancelAnimationFrame',previous.cancel],['document',previous.document]])if(original===undefined)delete globalThis[key];else globalThis[key]=original;
  }
});
