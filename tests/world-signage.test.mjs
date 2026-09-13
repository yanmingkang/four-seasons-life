import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {WorldSignage,layoutWorldLabels,overlaps} from '../src/world-signage.js';

const label=(id,x,y,more={})=>({id,x,y,width:100,height:34,depth:0,priority:0,kind:'building',...more});
test('labels stay in CSS viewport pixels, avoid HUD and one another, and respect density limits',()=>{
  for(const [width,height] of [[1440,900],[844,390]]){
    const reserved=[{x:0,y:0,width,height:90},{x:width-150,y:height-70,width:150,height:70}];
    const candidates=Array.from({length:40},(_,id)=>label(id,90+(id%8)*(width-180)/7,110+Math.floor(id/8)*(height-210)/4));
    const layout=layoutWorldLabels(candidates,{width,height,reserved,limit:10});
    assert.ok(layout.length>2&&layout.length<=10);
    for(const [i,c] of layout.entries()){
      assert.ok(c.rect.x>=12&&c.rect.y>=12&&c.rect.x+c.width<=width-12&&c.rect.y+c.height<=height-12);
      for(const other of [...reserved,...layout.slice(i+1).map(e=>e.rect)])assert.equal(overlaps(c.rect,other),false);
    }
  }
});
test('focused names win, duplicate station/building names do not pile up, and placement is deterministic',()=>{
  const entries=[label('route',400,250,{stationIndex:5}),label('focus',400,250,{stationIndex:5,priority:-50}),label('nearby',420,260)];
  const options={width:844,height:390},result=layoutWorldLabels(entries,options);
  assert.equal(result[0].id,'focus');assert.ok(!result.some(e=>e.id==='route'));
  assert.deepEqual(result,layoutWorldLabels(entries,options));
  assert.ok(Math.abs(result[0].rect.x+50-400)<=36);
});
test('behind-camera, clipped, offscreen and invalid anchors cannot leak onto the map',()=>{
  const entries=[label('back',400,250,{depth:2}),label('near',400,250,{depth:-1}),label('off',-50,200),label('nan',NaN,200),label('valid',400,250)];
  assert.deepEqual(layoutWorldLabels(entries,{width:844,height:390}).map(e=>e.id),['valid']);
});

test('loading all buildings creates no building names or stems and preserves four overview chapters',t=>{
  const previous=globalThis.document,created=[];
  function element(){return {style:{},children:[],setAttribute(){},append(child){this.children.push(child);},remove(){this.removed=true;}};}
  globalThis.document={createElement(tag){assert.equal(tag,'div');const el=element();created.push(el);return el;},querySelectorAll(){return [];}};
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const buildings=Array.from({length:40},(_,i)=>({userData:{label:`地点${i+1}`,stationIndex:i,buildingId:`reference-cell-${i+1}`}}));
  buildings.push({userData:{label:'书与咖啡',buildingId:'bookstall'}});
  const originalNames=buildings.map(b=>b.userData.label);
  const labels=Array.from({length:4},()=>({el:element(),position:new THREE.Vector3()}));
  const world={container:element(),labels,art:{buildings}};
  const signage=new WorldSignage(world);signage.load();signage.load();
  assert.equal(created.length,1,'Only the chapter layer is created, no building callouts or leader lines');
  assert.equal(signage.entries.length,4);assert.deepEqual(signage.entries.map(e=>e.kind),['season','season','season','season']);
  assert.deepEqual(signage.layer.children,labels.map(label=>label.el));
  assert.deepEqual(buildings.map(b=>b.userData.label),originalNames,'Gallery metadata is not deleted');
  signage.dispose();assert.equal(signage.layer.removed,true);signage.load();assert.deepEqual(signage.entries,[]);
});
