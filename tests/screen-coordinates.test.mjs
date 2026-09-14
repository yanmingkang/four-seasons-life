import test from 'node:test';
import assert from 'node:assert/strict';
import {screenRectToLocal,canvasInputScale,bindScaledOrbitInput} from '../src/screen-coordinates.js';

function canvas(width=1904,height=942,scale=1){
  const listeners=new Map();
  return {clientWidth:width,clientHeight:height,scale,
    getBoundingClientRect(){return {x:21,y:9,width:this.clientWidth*this.scale,height:this.clientHeight*this.scale};},
    addEventListener(type,fn,options){listeners.set(type,{fn,options});},
    removeEventListener(type,fn,capture){assert.equal(capture,true);if(listeners.get(type)?.fn===fn)listeners.delete(type);},
    emit(type){listeners.get(type)?.fn();},listeners};
}

test('HUD reservations stay in world logical pixels when the whole game is scaled',()=>{
  assert.deepEqual(screenRectToLocal({x:65,y:33,width:150,height:20},{x:15,y:8,width:952,height:471},1904,942),{x:100,y:50,width:300,height:40});
});
test('untransformed HUD coordinates preserve the existing desktop result',()=>{
  assert.deepEqual(screenRectToLocal({x:135,y:63,width:300,height:40},{x:35,y:13,width:1904,height:942},1904,942),{x:100,y:50,width:300,height:40});
});
test('screen-to-local coordinates respect independent axes and safe-area offsets',()=>{
  assert.deepEqual(screenRectToLocal({x:70,y:80,width:120,height:25},{x:40,y:30,width:480,height:270},1920,540),{x:120,y:100,width:480,height:50});
});
test('zero/detached canvas dimensions cannot create infinite input speeds',()=>{
  assert.deepEqual(canvasInputScale(null),{x:1,y:1});
  assert.deepEqual(canvasInputScale(canvas(0,0)),{x:1,y:1});
  assert.deepEqual(canvasInputScale(canvas(1904,942,0)),{x:1,y:1});
  assert.deepEqual(screenRectToLocal({x:12,y:20,width:30,height:40},{x:2,y:10,width:0,height:0},1904,942),{x:10,y:10,width:30,height:40});
});
test('OrbitControls compensates pointer rotation only, before its normal listener',()=>{
  const element=canvas(1904,942,.25),controls={domElement:element,rotateSpeed:.75,panSpeed:1,zoomSpeed:1};
  const unbind=bindScaledOrbitInput(controls);
  assert.equal(controls.rotateSpeed,.75,'No per-frame measurement or eager mutation');
  for(const entry of element.listeners.values())assert.deepEqual(entry.options,{capture:true,passive:true});
  element.emit('pointerdown');assert.equal(controls.rotateSpeed,3);assert.equal(controls.panSpeed,1);assert.equal(controls.zoomSpeed,1);
  // Moving a physical fraction of the rendered height matches the desktop
  // angle after OrbitControls divides the delta by logical clientHeight.
  assert.equal((942*.1*.25)*controls.rotateSpeed/942,(942*.1)*.75/942);
  element.scale=.5;element.emit('pointermove');assert.equal(controls.rotateSpeed,1.5,'Resize during a gesture is remeasured');
  unbind();assert.equal(controls.rotateSpeed,.75);assert.equal(element.listeners.size,0);unbind();
});
test('ordinary desktop retains its configured speed, including subpixel rounding',()=>{
  const element=canvas(),controls={domElement:element,rotateSpeed:.8};const unbind=bindScaledOrbitInput(controls);
  element.emit('pointerdown');assert.equal(controls.rotateSpeed,.8);
  element.scale=.9998;element.emit('pointermove');assert.equal(controls.rotateSpeed,.8);
  unbind();
});
test('cleanup does not overwrite a later owner of OrbitControls speed',()=>{
  const element=canvas(1904,942,.5),controls={domElement:element,rotateSpeed:1};const unbind=bindScaledOrbitInput(controls);
  element.emit('pointerdown');controls.rotateSpeed=.4;unbind();assert.equal(controls.rotateSpeed,.4);
  assert.doesNotThrow(()=>bindScaledOrbitInput(null)());
});
