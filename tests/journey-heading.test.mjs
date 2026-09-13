import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {JourneyWorld,CHARACTER_TURN_SPEED,advanceCharacterHeading,stationU} from '../src/journey-world.js';

const radians=degrees=>degrees*Math.PI/180;
const difference=(from,to)=>Math.atan2(Math.sin(to-from),Math.cos(to-from));
const close=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} should be within ${tolerance} of ${expected}`);
const sameHeading=(actual,expected,tolerance=1e-9)=>close(difference(actual,expected),0,tolerance);
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};

function makeWorld(){
  const events=[],locationFields=new Map(),world=Object.create(JourneyWorld.prototype);
  Object.assign(world,{
    character:new THREE.Group(),curve:new THREE.LineCurve3(new THREE.Vector3(),new THREE.Vector3(20,0,0)),
    container:{dataset:{},clientWidth:1440,clientHeight:900},tiles:[],mode:'full',currentPosition:-1,
    heading:Math.PI/2,cameraHeading:Math.PI/2,u:.01,stage:'idle',action:null,animation:null,
    isDisposed:false,interactive:true,isPaused:()=>false,ready:Promise.resolve(),elapsed:0,
    camera:new THREE.PerspectiveCamera(),cameraMode:'follow',userOrbit:false,zoomFactor:1,
    controls:{enabled:true,target:new THREE.Vector3(),update(){}},scene:{},fog:{},overviewFog:{},routeLine:{visible:false},
    art:{clouds:{visible:true},setSeason(){},setView(){},update(){}},
    location:{querySelector(selector){if(!locationFields.has(selector))locationFields.set(selector,{textContent:''});return locationFields.get(selector);}},
    dice:{mesh:new THREE.Object3D(),shadow:new THREE.Object3D(),impactRing:new THREE.Object3D(),cancel(){},async throw({value}){return value;}},
    walkingSurfaceY:()=>.25,resetLimbs(){},followCamera(){},resetView(){},syncSceneVisibility(){},
    announceStage(stage,detail={}){this.container.dataset.stage=stage;events.push({stage,...detail});},
    shouldRenderPausedFrame:()=>false,daylight:{update(){}},
  });
  return {world,events};
}

async function withClock(callback,{reduced=false}={}){
  const keys=['requestAnimationFrame','cancelAnimationFrame','document','matchMedia'];
  const originals=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  let serial=0,paused=false;
  const frames=new Map(),document=new EventTarget();
  Object.assign(document,{hidden:false,querySelector:()=>null});
  globalThis.requestAnimationFrame=handler=>{const id=++serial;frames.set(id,handler);return id;};
  globalThis.cancelAnimationFrame=id=>frames.delete(id);
  globalThis.document=document;
  globalThis.matchMedia=query=>({matches:reduced&&query.includes('prefers-reduced-motion')});
  const clock={frames,isPaused:()=>paused,pause:()=>{paused=true;},resume:()=>{paused=false;},
    tick(time){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(handler=>handler(time));}};
  try{return await callback(clock);}finally{
    for(const [key,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
}

test('heading interpolation takes the short arc through both sides of the PI boundary',()=>{
  close(CHARACTER_TURN_SPEED,Math.PI*1.5);
  for(const [from,to] of [[170,-170],[-170,170]]){
    const current=radians(from),target=radians(to),next=advanceCharacterHeading(current,target,1/60);
    assert.equal(Math.sign(difference(current,next)),Math.sign(difference(current,target)));
    assert.ok(Math.abs(difference(next,target))<Math.abs(difference(current,target)));
    assert.ok(Math.abs(difference(current,next))<=CHARACTER_TURN_SPEED/60+1e-12);
  }
});

test('heading interpolation clamps elapsed time, bounds angular speed and never overshoots',()=>{
  const current=.4,target=-2.4;
  close(advanceCharacterHeading(current,target,-1),current);
  close(advanceCharacterHeading(current,target,0),current);
  close(advanceCharacterHeading(current,target,8),advanceCharacterHeading(current,target,.1));
  for(const delta of [1/120,1/60,1/30,.1])for(const target of [-Math.PI,-.3,.3,Math.PI]){
    let heading=0;
    for(let frame=0;frame<120;frame++){
      const next=advanceCharacterHeading(heading,target,delta);
      assert.ok(Number.isFinite(next));
      assert.ok(Math.abs(difference(heading,next))<=CHARACTER_TURN_SPEED*delta+1e-12);
      assert.ok(Math.abs(difference(next,target))<=Math.abs(difference(heading,target))+1e-12);
      heading=next;
    }
  }
});

test('heading convergence is consistent at 30 and 60 frames per second',()=>{
  const simulate=(fps,target)=>{
    let heading=0;
    for(let frame=0;frame<fps;frame++)heading=advanceCharacterHeading(heading,target,1/fps);
    return heading;
  };
  sameHeading(simulate(30,.25),simulate(60,.25),1e-8);
  sameHeading(simulate(30,2.7),simulate(60,2.7),.025);
});

test('placing a character updates the route without changing its displayed facing unless explicitly snapped',()=>{
  const {world}=makeWorld();
  for(const stage of ['idle','walking','turning','dice','arrival']){
    world.stage=stage;world.character.rotation.y=-2.1;world.place(.5);
    close(world.character.position.x,10);close(world.character.position.y,.25);close(world.u,.5);
    sameHeading(world.heading,Math.PI/2);close(world.character.rotation.y,-2.1);
  }
  world.place(.7,{snapHeading:true});
  close(world.character.position.x,14);sameHeading(world.character.rotation.y,Math.PI/2);
});

test('heading diagnostics report the distinct displayed and route angles without rounding event values',()=>{
  const {world}=makeWorld(),details=[];
  world.character.rotation.y=.123456789;world.heading=-2.987654321;
  world.reportHeading();
  assert.equal(world.container.dataset.characterHeading,'0.123457');
  assert.equal(world.container.dataset.routeHeading,'-2.987654');
  world.container.dispatchEvent=event=>details.push(event.detail);
  JourneyWorld.prototype.announceStage.call(world,'arrived',{position:7});
  assert.deepEqual(details,[{stage:'arrived',characterHeading:.123456789,routeHeading:-2.987654321,position:7}]);
});

test('same-station state refreshes preserve facing, while actual teleports and restarts face forward',()=>{
  const {world}=makeWorld(),state={mode:'full',position:0,turn:2,season:0,history:[],total:40};
  world.state=state;world.place(stationU(0),{snapHeading:true});world.character.rotation.y=.37;
  world.setState({...state,turn:3});close(world.character.rotation.y,.37);
  // A freshly walked-to position is not a teleport, despite state.position advancing.
  world.place(stationU(1));world.character.rotation.y=.61;
  world.setState({...state,position:1,turn:4});close(world.character.rotation.y,.61);
  world.setState({...state,position:5,turn:5});
  close(world.u,stationU(5));sameHeading(world.character.rotation.y,world.heading);
  world.character.rotation.y=-1;
  world.setState({...state,position:-1,turn:0});
  close(world.u,.01);sameHeading(world.character.rotation.y,world.heading);
});

test('short-arc turns pause in place and resume without counting the hidden interval',async()=>withClock(async clock=>{
  const {world}=makeWorld();world.isPaused=clock.isPaused;world.character.rotation.y=radians(170);
  const origin=world.character.position.clone(),turn=world.turnToHeading(radians(-170));
  clock.tick(0);clock.tick(80);
  sameHeading(world.character.rotation.y,Math.PI,1e-8);
  const pausedHeading=world.character.rotation.y;clock.pause();clock.tick(200);clock.tick(9000);
  close(world.character.rotation.y,pausedHeading);assert.ok(world.character.position.equals(origin));
  clock.resume();clock.tick(9100);close(world.character.rotation.y,pausedHeading);
  clock.tick(9180);assert.equal(await turn,true);sameHeading(world.character.rotation.y,radians(-170));
  assert.equal(clock.frames.size,0);
}));

test('turn cancellation preserves intermediate facing and stale frames cannot revive it',async()=>withClock(async clock=>{
  const {world}=makeWorld(),controller=new AbortController();world.character.rotation.y=0;
  const turn=world.turnToHeading(Math.PI/2,{signal:controller.signal});clock.tick(0);clock.tick(150);
  const yaw=world.character.rotation.y,stale=[...clock.frames.values()];
  assert.ok(yaw>0&&yaw<Math.PI/2);controller.abort();assert.equal(await turn,false);
  close(world.character.rotation.y,yaw);assert.equal(clock.frames.size,0);
  world.character.rotation.y=-.7;stale.forEach(handler=>handler(5000));
  close(world.character.rotation.y,-.7);assert.equal(clock.frames.size,0);
}));

test('already aligned turns do not snap tiny errors, and reduced-motion turns finish immediately',async()=>withClock(async clock=>{
  const {world}=makeWorld();world.character.rotation.y=.4;
  assert.equal(await world.turnToHeading(.404),true);close(world.character.rotation.y,.4);
  assert.equal(clock.frames.size,0);
  assert.equal(await world.turnToHeading(-1.2),true);sameHeading(world.character.rotation.y,-1.2);
  assert.equal(clock.frames.size,0);
},{reduced:true}));

test('a die is thrown only after alignment, and completing the throw keeps the same forward facing',async()=>withClock(async clock=>{
  const {world}=makeWorld(),throws=[],cameraChanges=[];world.character.rotation.y=0;
  world.setCameraMode=(mode,options)=>cameraChanges.push({mode,options});
  world.dice.throw=async options=>{throws.push(options);sameHeading(options.actor.rotation.y,options.heading);return options.value;};
  const throwing=world.throwDice(4);await flush();
  assert.equal(throws.length,0);clock.tick(0);clock.tick(250);
  assert.equal(throws.length,0);assert.ok(world.character.rotation.y>0&&world.character.rotation.y<world.heading);
  clock.tick(500);await throwing;
  assert.equal(throws.length,1);assert.equal(throws[0].value,4);sameHeading(world.character.rotation.y,world.heading);
  assert.equal(world.action,null);assert.equal(world.stage,'idle');assert.equal(clock.frames.size,0);
  for(const change of cameraChanges){assert.equal(change.mode,'follow');assert.equal(change.options?.immediate,false);}
}));

test('canceling a pre-throw turn prevents the die and old cleanup from changing a new action',async()=>withClock(async clock=>{
  const {world}=makeWorld();let throws=0;world.character.rotation.y=0;world.dice.throw=async()=>{throws++;};
  const throwing=world.throwDice(3);await flush();clock.tick(0);clock.tick(150);
  const yaw=world.character.rotation.y,stale=[...clock.frames.values()];world.cancelAnimations();
  close(world.character.rotation.y,yaw);
  const nextAction={};world.action=nextAction;world.stage='walking';world.character.rotation.y=-.8;
  await throwing;stale.forEach(handler=>handler(5000));
  assert.equal(throws,0);assert.equal(world.action,nextAction);assert.equal(world.stage,'walking');
  close(world.character.rotation.y,-.8);assert.equal(clock.frames.size,0);
}));

test('failed asset readiness releases the throw action without changing facing or starting a die',async()=>withClock(async()=>{
  const {world}=makeWorld();let throws=0;world.character.rotation.y=.7;
  world.ready=Promise.reject(new Error('asset-load-test-failure'));world.dice.throw=async()=>{throws++;};
  await assert.rejects(world.throwDice(2),/asset-load-test-failure/);
  assert.equal(throws,0);assert.equal(world.action,null);assert.equal(world.stage,'idle');close(world.character.rotation.y,.7);
}));

test('aborted walking does not announce arrival or flip the character around',async()=>withClock(async clock=>{
  const {world,events}=makeWorld(),controller=new AbortController(),state={mode:'full',position:0};
  world.place(stationU(0),{snapHeading:true});
  const walking=world.walk(state,1,{signal:controller.signal});await flush();clock.tick(0);clock.tick(900);
  assert.ok(world.u>stationU(0)&&world.u<stationU(1));
  const position=world.character.position.clone(),yaw=world.character.rotation.y;
  controller.abort();await walking;
  assert.ok(world.character.position.equals(position));close(world.character.rotation.y,yaw);
  assert.equal(events.filter(event=>event.stage==='arrived').length,0);
  assert.equal(world.action,null);assert.equal(world.stage,'idle');assert.equal(clock.frames.size,0);
}));

test('completed walking and arrival retain forward facing and announce exactly one reached station',async()=>withClock(async clock=>{
  const {world,events}=makeWorld(),state={mode:'full',position:0};world.place(stationU(0),{snapHeading:true});
  const walking=world.walk(state,1);await flush();clock.tick(0);clock.tick(900);clock.tick(1800);await walking;
  close(world.u,stationU(1));sameHeading(world.character.rotation.y,world.heading);
  assert.equal(events.filter(event=>event.stage==='arrived').length,1);
  const yaw=world.character.rotation.y,arrival=world.arrive({...state,position:1});
  clock.tick(2000);clock.tick(2260);close(world.character.rotation.y,yaw);clock.tick(2520);await arrival;
  close(world.character.rotation.y,yaw);assert.equal(world.action,null);assert.equal(world.stage,'idle');
}));

test('curved travel aligns before moving and finishes its final short turn before announcing arrival',async()=>withClock(async clock=>{
  const {world,events}=makeWorld(),state={mode:'full',position:0};
  world.curve={getPointAt:u=>new THREE.Vector3(20*u,0,20*u*u),getTangentAt:u=>new THREE.Vector3(1,0,2*u).normalize()};
  world.place(stationU(0));world.character.rotation.y=.6;
  const origin=world.character.position.clone(),walking=world.walk(state,1);
  await flush();assert.equal(world.stage,'turning');clock.tick(0);clock.tick(150);
  assert.ok(world.character.position.equals(origin));assert.equal(events.some(event=>event.stage==='walking'),false);
  clock.tick(400);await flush();assert.equal(world.stage,'walking');
  clock.tick(500);clock.tick(2300);await flush();
  close(world.u,stationU(1));assert.equal(world.stage,'turning');
  assert.equal(events.some(event=>event.stage==='arrived'),false);
  clock.tick(2400);clock.tick(2560);assert.equal(await walking,true);
  sameHeading(world.character.rotation.y,world.heading);
  assert.equal(events.filter(event=>event.stage==='arrived').length,1);
}));

test('canceling the final alignment at a curved destination still reports cancellation, not arrival',async()=>withClock(async clock=>{
  const {world,events}=makeWorld(),controller=new AbortController(),state={mode:'full',position:0};
  world.curve={getPointAt:u=>new THREE.Vector3(20*u,0,20*u*u),getTangentAt:u=>new THREE.Vector3(1,0,2*u).normalize()};
  world.place(stationU(0),{snapHeading:true});
  const walking=world.walk(state,1,{signal:controller.signal});await flush();clock.tick(0);clock.tick(1800);await flush();
  close(world.u,stationU(1));assert.equal(world.stage,'turning');clock.tick(1900);clock.tick(1980);
  const yaw=world.character.rotation.y;controller.abort();assert.equal(await walking,false);
  close(world.character.rotation.y,yaw);assert.equal(events.some(event=>event.stage==='arrived'),false);
  assert.equal(world.action,null);assert.equal(world.stage,'idle');assert.equal(clock.frames.size,0);
}));

test('frame tracking freezes when paused and does not compete with dice or explicit turns',async()=>withClock(async clock=>{
  const {world}=makeWorld();world.isPaused=clock.isPaused;world.heading=Math.PI/2;world.lastFrame=1000;
  for(const stage of ['dice','turning']){
    world.stage=stage;world.character.rotation.y=0;world.frame(world.lastFrame+16);close(world.character.rotation.y,0);
  }
  world.stage='walking';world.character.rotation.y=0;clock.pause();world.frame(world.lastFrame+16);
  close(world.character.rotation.y,0);clock.resume();world.frame(world.lastFrame+16);
  assert.ok(world.character.rotation.y>0&&world.character.rotation.y<=CHARACTER_TURN_SPEED*.016+1e-12);
}));

test('low-frame-rate idle and walking use the heading time cap rather than the scenery time cap, and pause freezes both',async()=>withClock(async clock=>{
  for(const stage of ['idle','walking']){
    const {world}=makeWorld();world.isPaused=clock.isPaused;world.stage=stage;
    world.heading=Math.PI/2;world.character.rotation.y=0;world.lastFrame=1000;
    world.frame(1250);
    const expected=advanceCharacterHeading(0,world.heading,.1);
    close(world.character.rotation.y,expected);
    assert.ok(Math.abs(world.character.rotation.y-advanceCharacterHeading(0,world.heading,.05))>.1,stage);
    close(world.elapsed,50); // Scenery keeps its own 50 ms cap.
    clock.pause();world.frame(1500);world.frame(9000);
    close(world.character.rotation.y,expected);close(world.elapsed,50);
    clock.resume();world.frame(9250);
    close(world.character.rotation.y,advanceCharacterHeading(expected,world.heading,.1));
    close(world.elapsed,100);
  }
}));

test('automatic follow mode changes preserve camera placement while explicit resets still run',()=>{
  const {world}=makeWorld();let resets=0;
  world.resetView=()=>{resets++;world.camera.position.set(1,2,3);};
  world.cameraMode='overview';world.camera.position.set(8,9,10);world.controls.target.set(2,3,4);
  world.cameraHeading=.47;world.userOrbit=true;world.focusedBuilding={};world.container.dataset.focusedLandmark='old';
  const position=world.camera.position.clone(),target=world.controls.target.clone();
  world.setCameraMode('follow',{immediate:false});
  assert.equal(resets,0);assert.ok(world.camera.position.equals(position));assert.ok(world.controls.target.equals(target));
  close(world.cameraHeading,.47);assert.equal(world.userOrbit,false);assert.equal(world.cameraMode,'follow');
  assert.equal(world.scene.fog,world.fog);assert.equal(world.routeLine.visible,false);assert.equal(world.art.clouds.visible,true);
  assert.equal(world.focusedBuilding,null);assert.equal(world.container.dataset.focusedLandmark,undefined);
  world.setCameraMode('follow');assert.equal(resets,1);assert.ok(world.camera.position.equals(new THREE.Vector3(1,2,3)));
});
