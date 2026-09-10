import test from 'node:test';
import assert from 'node:assert/strict';
import {bearIdlePose,drawBear,buildPixelRoute,routePoint,PALETTES,BEAR_PALETTE,bearFacing} from '../src/pixel-art.js';

test('idle gestures are deterministic, varied and bounded',()=>{
 for(const t of [0,4500,7800,12000])assert.deepEqual(bearIdlePose(t),bearIdlePose(t));
 assert.equal(bearIdlePose(4500).gesture,'look');
 assert.equal(bearIdlePose(7800).gesture,'wave');
 assert.equal(bearIdlePose(12000).gesture,'stretch');
 assert.equal(bearIdlePose(4500).blink,true);
 for(let time=0;time<30000;time+=37){const pose=bearIdlePose(time);assert.ok(pose.breath>=0&&pose.breath<=1.5);assert.ok(pose.look>=0&&pose.look<=2);assert.ok(pose.stretch>=0&&pose.stretch<=1);}
});

test('reduced motion and invalid clocks produce one stable rest pose',()=>{
 const rest={breath:0,blink:false,look:0,wave:0,stretch:0,gesture:'rest'};
 for(const time of [0,4500,7800,12000,NaN,Infinity])assert.deepEqual(bearIdlePose(time,{motion:false}),rest);
 assert.deepEqual(bearIdlePose(NaN),rest);
});

function renderBear(time,options={}){
 const rectangles=[],stack=[];let tx=0,ty=0,sx=1,sy=1;
 const c={fillStyle:'',save(){stack.push({tx,ty,sx,sy});},restore(){({tx,ty,sx,sy}=stack.pop());},translate(x,y){tx+=x*sx;ty+=y*sy;},scale(x,y){sx*=x;sy*=y;},fillRect(x,y,w,h){rectangles.push({x:tx+x*sx,y:ty+y*sy,w:w*sx,h:h*sy,color:this.fillStyle});},beginPath(){},lineTo(){},moveTo(){},closePath(){},fill(){}};
 drawBear(c,100,100,{time,...options});assert.equal(stack.length,0);return rectangles;
}

test('breathing, waving and stretching do not lift idle feet off their tile',()=>{
 for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const feet=time=>renderBear(time,{heading}).filter(r=>r.color===BEAR_PALETTE.sole);
  const rest=feet(0);assert.equal(rest.length,2);assert.ok(rest.every(r=>r.y===100));
  for(const t of [800,4500,7800,12000])assert.deepEqual(feet(t),rest);
 }
 assert.notDeepEqual(renderBear(0),renderBear(7800));
});

test('heading selects front, mirrored sides and a back with no facial features',()=>{
 assert.deepEqual(bearFacing(0),{view:'side',flip:1});
 assert.deepEqual(bearFacing(Math.PI),{view:'side',flip:-1});
 assert.equal(bearFacing(Math.PI/2).view,'front');assert.equal(bearFacing(-Math.PI/2).view,'back');
 assert.deepEqual(bearFacing(NaN),bearFacing(0));
 const front=renderBear(0,{heading:Math.PI/2}),side=renderBear(0),back=renderBear(0,{heading:-Math.PI/2});
 assert.equal(front.filter(r=>r.color===BEAR_PALETTE.eye).length,2);
 assert.equal(side.filter(r=>r.color===BEAR_PALETTE.eye).length,1);
 assert.equal(back.filter(r=>r.color===BEAR_PALETTE.eye||r.color===BEAR_PALETTE.nose).length,0);
 assert.ok(back.some(r=>r.color===BEAR_PALETTE.white&&r.y>80),'White round tail is visible above the boots');
});

test('reference mascot has neutral colours, no backpack or pink cheeks, and grounded walking soles',()=>{
 const removed=['#487b65','#385f52','#90aa78','#e3c378','#e6b9b1'];
 for(const heading of [0,Math.PI/2,-Math.PI/2])for(const time of [0,800,4500,7800,12000]){
  const shapes=renderBear(time,{heading});assert.ok(shapes.every(r=>!removed.includes(r.color)));
  const walking=renderBear(time,{heading,walking:true}).filter(r=>r.color===BEAR_PALETTE.sole);
  assert.ok(walking.every(r=>r.y<=100&&r.y>=98));assert.ok(walking.some(r=>r.y===100));
 }
 assert.notDeepEqual(renderBear(0),renderBear(0,{throwing:true}));
 assert.deepEqual(renderBear(4500,{motion:false}),renderBear(0,{motion:false}));
});

test('visual polish retains forty ordered route destinations and unique seasonal palettes',()=>{
 const route=buildPixelRoute();assert.equal(route.stations.length,40);
 for(let index=0;index<40;index++){const station=route.stations[index],point=routePoint(route,station.distance);assert.equal(station.index,index);assert.ok(Math.hypot(point.x-station.x,point.y-station.y)<.001);if(index)assert.ok(station.distance>route.stations[index-1].distance);}
 assert.equal(new Set(PALETTES.map(p=>p.grass)).size,4);
 assert.equal(new Set(PALETTES.map(p=>p.leaf[2])).size,4);
});
