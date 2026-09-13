import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {EVENTS,SEASONS} from '../src/events.js';
import {boardSign,updateBoardSign} from '../src/scenery.js';

function canvasDocument(t){
  const previous=globalThis.document;
  globalThis.document={createElement(tag){
    assert.equal(tag,'canvas');
    const canvas={width:0,height:0,calls:[]};
    const ctx={fillRect(){},measureText(text){return {width:Array.from(text).length*parseFloat(this.font.match(/[\d.]+px/)[0])};},
      fillText(text,x,y){canvas.calls.push({text,x,y,font:this.font,width:this.measureText(text).width,color:this.fillStyle});}};
    canvas.getContext=()=>ctx;return canvas;
  }};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
}

test('all road signs actually paint full Chinese text inside a proportional high-resolution face',t=>{
  canvasDocument(t);
  for(const text of [...EVENTS.map((e,i)=>`${i+1} · ${e.location||e.title}`),...SEASONS.slice(1).map(s=>`${s.name} · ${s.title}`)]){
    const sign=boardSign(new THREE.Scene(),text,new THREE.Vector3(),3.15),panel=sign.userData.labelPanel,map=panel.material.map;
    const [paint]=map.image.calls;
    assert.equal(paint.text,text);assert.equal(sign.userData.signText,text);
    assert.ok(paint.font.includes('Microsoft YaHei'));
    assert.equal(map.image.width,1024);assert.ok(paint.width<=map.image.width-39);
    assert.equal(paint.x,map.image.width/2);assert.equal(paint.y,map.image.height/2);
    assert.ok(Math.abs(map.image.width/map.image.height-panel.geometry.parameters.width/panel.geometry.parameters.height)<.02);
    assert.equal(map.magFilter,THREE.LinearFilter);assert.equal(map.minFilter,THREE.LinearMipmapLinearFilter);
    assert.equal(map.generateMipmaps,true);assert.equal(map.anisotropy,8);
    assert.equal(panel.material.depthTest,true);assert.equal(panel.material.depthWrite,true);
    assert.equal(panel.material.toneMapped,false);
    map.dispose();panel.material.dispose();panel.geometry.dispose();
  }
});

test('both sides stay attached to the board and remain readable when it turns',t=>{
  canvasDocument(t);
  const sign=boardSign(new THREE.Scene(),'13 · 跨部评审厅',new THREE.Vector3(8,3,-4),3.15,.72);
  const front=sign.userData.labelPanel,back=sign.children.find(m=>m!==front&&m.material===front.material);
  assert.equal(front.parent,sign);assert.equal(back.parent,sign);assert.equal(back.geometry,front.geometry);
  assert.equal(front.position.y,1.95);assert.equal(back.position.y,1.95);
  assert.equal(front.position.z,.066);assert.equal(back.position.z,-.066);assert.equal(back.rotation.y,Math.PI);
  for(const yaw of [0,.6,Math.PI,5.4]){
    sign.rotation.y=yaw;sign.updateMatrixWorld(true);
    const normal=new THREE.Vector3(0,0,1).transformDirection(front.matrixWorld);
    const reverseNormal=new THREE.Vector3(0,0,1).transformDirection(back.matrixWorld);
    assert.ok(normal.dot(reverseNormal)<-.999);
    const position=front.getWorldPosition(new THREE.Vector3());sign.worldToLocal(position);
    assert.ok(position.distanceTo(front.position)<1e-10,'no camera-facing billboard or floating offset');
  }
});

test('route-number updates retain the name, synchronize both sides and dispose each replaced map once',t=>{
  canvasDocument(t);
  const sign=boardSign(new THREE.Scene(),'6 · 客户会议室',new THREE.Vector3());
  const front=sign.userData.labelPanel,back=sign.children.find(m=>m!==front&&m.material===front.material);
  for(const text of ['2 · 客户会议室','6 · 客户会议室','2 · 客户会议室']){
    const previous=front.material.map;let disposed=0;previous.addEventListener('dispose',()=>disposed++);
    updateBoardSign(sign,text);
    assert.equal(disposed,1);assert.notEqual(front.material.map,previous);
    assert.equal(front.material.map,back.material.map);assert.equal(front.material.map.image.calls[0].text,text);
    const current=front.material.map;updateBoardSign(sign,text);
    assert.equal(front.material.map,current,'unchanged labels do not allocate every frame');assert.equal(disposed,1);
  }
});
