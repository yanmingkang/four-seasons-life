// Original, code-drawn pixel art. Every shape is rendered into the low-resolution
// world canvas; no WebGL, perspective meshes, filters or generated screenshots.
export const MAP_WIDTH=1500,MAP_HEIGHT=1000;
export const PALETTES=Object.freeze([
 {grass:'#79b74e',light:'#a4ce63',dark:'#55903d',flower:'#ff91b1',leaf:['#873f65','#c85487','#f187b3','#ffcfdf']},
 {grass:'#659d3e',light:'#8bbb4e',dark:'#427733',flower:'#fff4ac',leaf:['#254e3c','#3a743b','#69a93d','#b8d955']},
 {grass:'#aab651',light:'#c9ca68',dark:'#87963e',flower:'#ffd271',leaf:['#8a472e','#ce692a','#f5a32f','#ffe382']},
 {grass:'#d5e9e6',light:'#eff8ea',dark:'#b4d3d4',flower:'#fff8df',leaf:['#395d71','#538698','#95c7ce','#f3fff5']}
]);
export const seasonAt=y=>Math.max(0,Math.min(3,Math.floor((865-y)/185)));
export const seededRandom=(seed=7419)=>()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
const rr=(c,x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));};
export function polygon(c,points,color){c.fillStyle=color;c.beginPath();for(let i=0;i<points.length;i++)c[i?'lineTo':'moveTo'](Math.round(points[i][0]),Math.round(points[i][1]));c.closePath();c.fill();}
export function pixelOval(c,x,y,rx,ry,color){for(let dy=-ry;dy<=ry;dy++){const half=Math.floor(rx*Math.sqrt(Math.max(0,1-dy*dy/(ry*ry))));rr(c,x-half,y+dy,half*2+1,1,color);}}
export function makeCanvas(w,h){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;return canvas;}

// Four neighbourhoods share one open route, ten places per season.
export function buildPixelRoute(){
 const stations=Array.from({length:40},(_,i)=>{const row=Math.floor(i/10),n=i%10;return {index:i,x:180+(row%2?9-n:n)*124,y:780-row*185+Math.round(Math.sin(n*1.22+row*.7)*15)};});
 const nodes=[{x:105,y:807},...stations];const samples=[{...nodes[0],distance:0}],distances=[];let distance=0;
 for(let segment=0;segment<nodes.length-1;segment++){
  const a=nodes[Math.max(0,segment-1)],b=nodes[segment],d=nodes[segment+1],e=nodes[Math.min(nodes.length-1,segment+2)];
  for(let k=1;k<=20;k++){const t=k/20,t2=t*t,t3=t2*t,p={};for(const axis of ['x','y'])p[axis]=.5*((2*b[axis])+(-a[axis]+d[axis])*t+(2*a[axis]-5*b[axis]+4*d[axis]-e[axis])*t2+(-a[axis]+3*b[axis]-3*d[axis]+e[axis])*t3);const last=samples.at(-1);distance+=Math.hypot(p.x-last.x,p.y-last.y);samples.push({...p,distance});}
  distances.push(distance);
 }
 stations.forEach((p,i)=>p.distance=distances[i]);
 return {stations,samples,totalDistance:distance,start:nodes[0]};
}
export function routePoint(route,distance){
 distance=Math.max(0,Math.min(route.totalDistance,distance));let low=0,high=route.samples.length-1;
 while(low+1<high){const middle=(low+high)>>1;if(route.samples[middle].distance<distance)low=middle;else high=middle;}
 const a=route.samples[low],b=route.samples[high],t=(distance-a.distance)/(b.distance-a.distance||1);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading:Math.atan2(b.y-a.y,b.x-a.x)};
}
export function nearRoad(route,x,y,radius=35){return route.samples.some((p,i)=>i%3===0&&Math.hypot(x-p.x,y-p.y)<radius);}
const LAKES=[{x:650,y:486,rx:170,ry:47},{x:1000,y:680,rx:136,ry:45},{x:425,y:296,rx:134,ry:43}];
export const inWater=(x,y,pad=0)=>LAKES.some(l=>((x-l.x)/(l.rx+pad))**2+((y-l.y)/(l.ry+pad))**2<1);

function drawTerrain(c,route,random){
 rr(c,0,0,MAP_WIDTH,MAP_HEIGHT,'#9bd8e5');
 // Wide tonal patches read as a meadow, not a screen of unrelated noisy dots.
 for(let y=100;y<MAP_HEIGHT;y+=4){for(let x=0;x<MAP_WIDTH;x+=4){const edge=Math.sin(x*.022)*9+Math.sin(x*.007)*10,pp=PALETTES[seasonAt(y+edge)];const patch=Math.sin(x*.016+Math.sin(y*.02))*Math.cos(y*.027);rr(c,x,y,4,4,patch>.62?pp.light:pp.grass);}}
 // Broad rock ledges and distant ridges make a landscape, without perspective.
 for(let layer=0;layer<3;layer++){const points=[[0,170-layer*36]];for(let x=0;x<=MAP_WIDTH;x+=35){const peak=44+Math.sin(x*.013+layer)*33+Math.sin(x*.031)*12;points.push([x,peak+layer*32]);}points.push([MAP_WIDTH,177-layer*5],[0,177-layer*5]);polygon(c,points,['#a6d4dc','#78aebc','#548a8c'][layer]);}
 for(let x=0;x<MAP_WIDTH;x+=15){const y=115+Math.sin(x*.013)*12;rr(c,x,y,8,2,'#b5c3ae');}
 // Local ground speckling: restrained clusters, grass tufts, and little stones.
 for(let i=0;i<5200;i++){const x=Math.floor(random()*MAP_WIDTH),y=160+Math.floor(random()*(MAP_HEIGHT-160));const p=PALETTES[seasonAt(y)],kind=random();if(kind<.2){rr(c,x,y,1,3,p.dark);rr(c,x-2,y-2,1,3,p.dark);rr(c,x+2,y-3,1,3,p.light);}else rr(c,x,y,kind<.5?3:2,1,kind<.6?p.dark:p.light);}
 // Banks, water cutouts, stepped shoreline and reeds.
 for(const lake of LAKES){pixelOval(c,lake.x,lake.y+6,lake.rx+14,lake.ry+12,'#46754c');pixelOval(c,lake.x,lake.y+2,lake.rx+9,lake.ry+7,'#cba568');pixelOval(c,lake.x,lake.y,lake.rx+5,lake.ry+3,'#f1d49c');pixelOval(c,lake.x,lake.y,lake.rx,lake.ry,'#318eaf');pixelOval(c,lake.x-6,lake.y-3,lake.rx-11,lake.ry-7,'#52bbcb');for(let i=0;i<75;i++){const x=lake.x+(random()-.5)*lake.rx*1.9,y=lake.y+(random()-.5)*lake.ry*1.6;if(((x-lake.x)/lake.rx)**2+((y-lake.y)/lake.ry)**2<.88)rr(c,x,y,4+random()*12,1,random()<.4?'#bbf0df':'#289bb8');}for(let i=0;i<15;i++){const a=random()*Math.PI*2,x=lake.x+Math.cos(a)*(lake.rx+5),y=lake.y+Math.sin(a)*(lake.ry+3);rr(c,x,y-7,1,9,'#4b793d');rr(c,x+3,y-5,1,7,'#4b793d');rr(c,x,y-9,2,3,'#9e6438');}for(let i=0;i<4;i++){const xx=lake.x-lake.rx*.6+i*lake.rx*.32,yy=lake.y+Math.sin(i*2)*lake.ry*.4;pixelOval(c,xx,yy,7,3,'#29876a');rr(c,xx,yy-1,7,1,'#78ca79');if(i%2===0){rr(c,xx-2,yy-4,4,3,'#ffe9ec');rr(c,xx-1,yy-3,2,1,'#f59ab5');}}}
 // Carved sand road: pixel discs overlap to create naturally stair-stepped edges.
 for(const [radius,color,dy] of [[26,'#52703b',5],[23,'#aa774d',3],[20,'#dfb77c',0],[16,'#f6d79b',0]])for(const p of route.samples)pixelOval(c,Math.round(p.x),Math.round(p.y)+dy,radius,Math.round(radius*.67),color);
 for(let i=0;i<1450;i++){const point=route.samples[Math.floor(random()*route.samples.length)],x=point.x+(random()-.5)*30,y=point.y+(random()-.5)*17;rr(c,x,y,random()<.2?3:2,1,random()<.55?'#d5ac70':'#ffe6b5');}
 // Side paths and tended gardens belong to each little neighbourhood.
 for(const p of route.stations){if(p.index%3!==1)continue;const s=Math.floor(p.index/10),side=p.index%2?-1:1;for(let d=20;d<65;d+=3)pixelOval(c,p.x+Math.sin(d*.03)*6,p.y+side*d,8,4,'#d2ba83');}
 // Small footbridges cross the lakes and join their banks.
 for(const lake of LAKES){const x=lake.x+lake.rx*.2;rr(c,x-11,lake.y-lake.ry-12,29,lake.ry*2+28,'#6d5644');for(let y=lake.y-lake.ry-10;y<lake.y+lake.ry+14;y+=6){rr(c,x-9,y,25,4,'#bd9464');rr(c,x-8,y,23,1,'#dbb782');}for(const dx of [-13,17]){rr(c,x+dx,lake.y-lake.ry-20,3,lake.ry*2+32,'#896447');for(let y=lake.y-lake.ry-17;y<lake.y+lake.ry+18;y+=22){rr(c,x+dx-1,y-6,5,12,'#665340');rr(c,x+dx-1,y-7,5,2,'#d8b786');}}}
}

export function drawTree(c,x,y,season=0,variation=0,scale=1){
 c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale,scale);const p=PALETTES[season],r=seededRandom(variation+391);
 pixelOval(c,4,1,28,8,'#294d4140');polygon(c,[[-9,3],[-5,-13],[-6,-46],[5,-47],[4,-13],[10,3],[3,1],[-1,-8],[-3,2]],'#634331');rr(c,-3,-42,4,38,'#b17c45');rr(c,-3,-37,2,27,'#d3a266');rr(c,2,-17,2,17,'#8a5936');polygon(c,[[-3,-24],[-22,-42],[-18,-43],[2,-29],[20,-47],[24,-46],[5,-23]],'#785033');
 if(season===3&&variation%3===0){
  // Fir boughs have broken horizontal shelves, not smooth triangular edges.
  for(let row=0;row<5;row++){const yy=-79+row*12,w=9+row*6;polygon(c,[[0,yy-12],[-w,yy+7],[-w-4,yy+9],[-w+4,yy+12],[w+5,yy+10],[w,yy+7]],p.leaf[0]);polygon(c,[[0,yy-9],[-w+3,yy+4],[-w+8,yy+4],[-w+6,yy+7],[w-1,yy+6],[w-4,yy+1]],p.leaf[3]);rr(c,-w+7,yy+8,w+4,2,p.leaf[2]);}
 }else{
  const clusters=[[-21,-45,19,13],[20,-47,21,14],[-1,-40,21,13],[-27,-60,16,12],[1,-63,25,18],[23,-66,16,12],[-12,-77,19,13],[9,-82,17,11]];
  const crown=(xx,yy,w,h,color)=>polygon(c,[[xx-w,yy-h+6],[xx-w+5,yy-h+6],[xx-w+5,yy-h+2],[xx-6,yy-h+2],[xx-6,yy-h],[xx+w-7,yy-h],[xx+w-7,yy-h+4],[xx+w-2,yy-h+4],[xx+w-2,yy-3],[xx+w+1,yy-3],[xx+w+1,yy+5],[xx+w-4,yy+5],[xx+w-4,yy+h-2],[xx+5,yy+h-2],[xx+5,yy+h],[xx-w+6,yy+h],[xx-w+6,yy+h-4],[xx-w,yy+h-4]],color);
  for(const [xx,yy,w,h] of clusters)crown(xx+2,yy+4,w+1,h+1,p.leaf[0]);
  for(const [xx,yy,w,h] of clusters){crown(xx,yy,w,h,p.leaf[1]);crown(xx-3,yy-4,w-3,Math.max(5,h-4),p.leaf[2]);for(let n=0;n<5;n++){const dx=xx-w*.65+r()*w*1.25,dy=yy-h*.8+r()*h*.65;rr(c,dx,dy,4+r()*5,2,p.leaf[3]);rr(c,dx-2,dy+2,4,2,p.leaf[3]);}for(let n=0;n<3;n++)rr(c,xx-w*.6+r()*w,yy+h*.4+r()*4,3+r()*5,2,p.leaf[0]);}
  if(season===0){for(let n=0;n<26;n++){const xx=(r()-.5)*63,yy=-82+r()*36;rr(c,xx,yy,2,4,'#fff0ed');rr(c,xx-1,yy+1,4,2,'#fff0ed');rr(c,xx,yy+1,1,1,'#f5bd71');}}
  if(season===1&&variation%4===0){for(const [xx,yy] of [[-22,-47],[16,-62],[-3,-74],[27,-44]]){rr(c,xx,yy,4,4,'#d76c45');rr(c,xx+1,yy,2,1,'#ffd087');}}
  if(season===3){for(const [xx,yy,w] of [[-22,-58,13],[-7,-84,17],[13,-73,15],[23,-50,12]]){rr(c,xx-w/2,yy,w,3,p.leaf[3]);rr(c,xx-w/2+3,yy+3,w-4,2,p.leaf[3]);}}
 }
 if(season!==3){for(let n=0;n<6;n++){const xx=(r()-.5)*39,yy=r()*5;rr(c,xx,yy,3,1,season===0?'#f7abc4':season===2?'#eeba49':'#80b94b');}}
 c.restore();
}

export function drawHouse(c,x,y,season=0,variant=0){
 c.save();c.translate(Math.round(x),Math.round(y));const roof=[['#663e64','#a95683','#df86a9'],['#4d5635','#768541','#b1b75c'],['#743d2f','#b65936','#e38c46'],['#375a72','#547e95','#90bbc3']][season],kind=variant%4;
 const timber='#744b34',light='#f8ddb0',wall=kind===2?'#d78654':'#e8bd83';
 pixelOval(c,4,2,47,10,'#294d4140');rr(c,-39,-7,78,7,'#715e49');rr(c,-36,-49,72,42,timber);rr(c,-33,-46,66,37,wall);rr(c,-31,-44,62,8,light);
 for(let yy=-34;yy<-8;yy+=8)rr(c,-33,yy,66,1,kind===2?'#b5643d':'#cca070');rr(c,-36,-46,4,39,timber);rr(c,32,-46,4,39,timber);
 if(kind===1){
  // A striped-awning shop: a distinct destination among the homes.
  polygon(c,[[-43,-48],[-30,-72],[30,-72],[44,-48]],roof[0]);polygon(c,[[-39,-51],[-28,-69],[29,-69],[39,-51]],roof[1]);for(let yy=-66;yy<-48;yy+=5)rr(c,-30,yy,61,1,roof[2]);
  rr(c,-31,-32,42,20,timber);rr(c,-29,-30,38,15,'#8ccace');rr(c,-28,-28,18,3,'#cef1d9');rr(c,-12,-30,2,15,light);rr(c,-30,-15,40,3,'#f2d298');rr(c,18,-29,12,23,timber);rr(c,20,-27,8,12,'#edb765');rr(c,26,-14,2,2,'#ffe6a4');
  rr(c,-42,-40,84,10,timber);for(let n=0;n<7;n++){const xx=-40+n*12;rr(c,xx,-42,12,11,n%2?'#fff0c8':roof[1]);rr(c,xx,-31,12,4,n%2?'#e4c796':roof[0]);}rr(c,-19,-65,38,14,timber);rr(c,-17,-63,34,10,'#ffe7a8');drawPlaceIcon(c,0,-58,variant%3,roof[0]);
 }else if(kind===2){
  // A barn-shaped workshop and broad double doors break the repeated roofline.
  polygon(c,[[-44,-47],[-29,-69],[0,-81],[29,-69],[44,-47]],roof[0]);polygon(c,[[-39,-50],[-26,-66],[0,-77],[26,-66],[39,-50]],roof[1]);polygon(c,[[-27,-64],[0,-76],[26,-65],[24,-61],[-25,-61]],roof[2]);for(let yy=-59;yy<-48;yy+=5)rr(c,-32,yy,65,2,roof[0]);
  rr(c,-18,-35,36,29,timber);rr(c,-15,-32,30,24,'#b57042');rr(c,-1,-32,2,24,light);polygon(c,[[-14,-29],[-12,-31],[14,-11],[12,-9]],light);polygon(c,[[12,-31],[14,-29],[-12,-9],[-14,-11]],light);rr(c,-7,-63,14,11,timber);rr(c,-5,-61,10,7,'#fee3a5');rr(c,-1,-61,2,7,timber);
 }else{
  // A front gable and a dormer provide a softer cottage silhouette.
  polygon(c,[[-45,-46],[-20,-77],[22,-76],[45,-46]],roof[0]);polygon(c,[[-40,-49],[-18,-73],[21,-72],[39,-49]],roof[1]);for(let row=0;row<5;row++){const yy=-69+row*5;rr(c,-18-row*4,yy,38+row*8,1,roof[2]);for(let col=0;col<5;col++)rr(c,-15-row*3+col*11+(row%2?5:0),yy+1,1,3,roof[0]);}
  polygon(c,[[-12,-45],[0,-62],[14,-45]],timber);polygon(c,[[-8,-47],[0,-58],[10,-47]],light);rr(c,-4,-49,8,7,roof[0]);rr(c,-2,-49,4,5,'#c2e9d7');rr(c,-9,-29,18,23,timber);rr(c,-6,-26,12,20,'#ad7042');rr(c,3,-16,2,2,'#ffe5a1');
  for(const wx of [-28,17]){rr(c,wx,-33,12,14,timber);rr(c,wx+2,-31,8,10,season===3?'#ffe394':'#9ed9d8');rr(c,wx+6,-31,1,10,light);rr(c,wx+1,-26,10,1,light);rr(c,wx-2,-18,16,4,'#b07845');rr(c,wx-1,-19,14,2,'#4c833d');for(let n=0;n<3;n++){rr(c,wx+n*5,-22,3,3,season===0?'#ff9cbc':'#ffe29a');rr(c,wx+n*5+1,-23,1,1,'#fff1ce');}}
  rr(c,23,-81,9,21,'#915938');rr(c,21,-83,13,4,'#d5a06e');rr(c,25,-79,4,3,'#bb8151');
  if(kind===3){rr(c,-41,-8,83,4,'#e6c08c');for(const xx of [-39,36]){rr(c,xx,-29,3,22,timber);rr(c,xx-1,-31,5,4,light);}rr(c,-43,-34,87,3,roof[0]);}
 }
 if(season===3){rr(c,-28,-73,51,3,'#f1fbf2');rr(c,-22,-76,37,3,'#f1fbf2');rr(c,-36,-47,71,3,'#e4f3ee');}
 rr(c,-14,-5,28,3,'#bda175');rr(c,-18,-2,36,3,'#f0d29a');
 if(variant%3===0){drawProp(c,-49,0,season,'mailbox');}else if(variant%3===1){drawProp(c,49,0,season,'planter');}
 c.restore();
}

function drawPlaceIcon(c,x,y,kind,color){
 if(kind===0){rr(c,x-8,y-4,7,8,color);rr(c,x+1,y-4,7,8,color);rr(c,x-6,y-3,4,1,'#fff0bc');rr(c,x+2,y-3,4,1,'#fff0bc');rr(c,x-1,y-2,2,7,color);}
 else if(kind===1){rr(c,x-6,y-4,10,6,color);rr(c,x+4,y-3,3,4,color);rr(c,x+5,y-2,1,2,'#ffe7a8');rr(c,x-8,y+3,17,2,color);}
 else{polygon(c,[[x,y-5],[x+2,y-1],[x+7,y-1],[x+3,y+2],[x+4,y+6],[x,y+3],[x-4,y+6],[x-3,y+2],[x-7,y-1],[x-2,y-1]],color);}
}

export function drawFence(c,x,y,length=55){for(let xx=0;xx<length;xx+=12){rr(c,x+xx,y-13,3,16,'#8b6b49');rr(c,x+xx,y-14,3,2,'#d7b783');}rr(c,x,y-10,length,3,'#bc9460');rr(c,x,y-3,length,3,'#a77c50');rr(c,x,y-10,length,1,'#e0be85');}
function drawGarden(c,x,y,season,variant){rr(c,x-28,y-23,56,29,season===3?'#adc6c8':'#9c6940');for(let row=0;row<3;row++){rr(c,x-26,y-21+row*9,52,2,season===3?'#dfeee8':'#704d33');for(let col=0;col<7;col++){const xx=x-24+col*8,yy=y-18+row*9;rr(c,xx,yy-5,1,6,'#47733b');if(season===2){pixelOval(c,xx,yy,3,3,'#e38e28');rr(c,xx,yy-2,1,4,'#ffbc42');rr(c,xx,yy-4,1,2,'#47733b');}else{rr(c,xx-2,yy-4,5,2,season===3?'#86aaaa':'#659c39');rr(c,xx,yy-6,2,3,season===0?'#b8d65d':'#afd456');if(variant%2)rr(c,xx,yy-7,2,2,season===0?'#f185af':'#f5d36b');}}}drawFence(c,x-33,y+7,65);}
function drawRock(c,x,y,variation){polygon(c,[[x-10,y],[x-12,y-7],[x-5,y-15],[x+5,y-16],[x+12,y-8],[x+9,y+2]],'#738575');polygon(c,[[x-10,y-7],[x-4,y-14],[x+5,y-15],[x+9,y-8],[x,y-4]],'#a3aa8b');rr(c,x-5,y-11,5,2,'#c4c6a5');}

function drawProp(c,x,y,season,kind){
 c.save();c.translate(Math.round(x),Math.round(y));const wood='#815337',gold='#eac48a',leaf='#518838';
 if(kind==='mailbox'){rr(c,-2,-17,4,18,wood);rr(c,-8,-24,17,10,wood);rr(c,-7,-25,12,9,season===3?'#729eaf':'#ce6559');rr(c,-6,-23,10,1,'#efae8a');rr(c,6,-23,4,7,'#4b7476');rr(c,10,-29,1,11,wood);rr(c,11,-29,6,4,'#f7d077');}
 if(kind==='lamp'){pixelOval(c,0,1,7,2,'#43594140');rr(c,-2,-30,4,31,'#62513b');rr(c,-5,-35,10,12,'#574c3c');rr(c,-3,-33,6,8,'#ffdf76');rr(c,-1,-32,2,5,'#fff7c2');polygon(c,[[-8,-35],[0,-41],[8,-35]],'#765239');rr(c,-7,-36,14,2,gold);}
 if(kind==='bench'){rr(c,-17,-16,34,9,wood);rr(c,-16,-15,32,3,'#d6a669');rr(c,-16,-10,32,2,gold);rr(c,-19,-4,38,4,wood);rr(c,-18,-5,36,2,'#e1b779');rr(c,-15,0,3,6,wood);rr(c,12,0,3,6,wood);rr(c,-21,-9,4,9,wood);rr(c,17,-9,4,9,wood);}
 if(kind==='planter'){rr(c,-9,-9,18,10,wood);rr(c,-11,-11,22,4,'#c58d52');rr(c,-7,-7,2,6,'#dbb17a');for(let n=0;n<4;n++){const xx=-7+n*5;rr(c,xx,-21+n%2*3,2,11,leaf);rr(c,xx-2,-17,5,2,leaf);rr(c,xx-2,-24+n%2*3,5,4,season===0?'#f680ad':season===2?'#ffc75d':'#fff0c5');rr(c,xx,-23+n%2*3,1,2,'#ddae40');}}
 if(kind==='pumpkins'){for(const [xx,yy,s] of [[-8,0,7],[8,-3,5],[1,-9,4]]){pixelOval(c,xx,yy,s,s*.7,'#af5b26');pixelOval(c,xx,yy-1,s-1,s*.7-1,'#f4a331');rr(c,xx-1,yy-s*.5,2,s,'#ffd15d');rr(c,xx,yy-s-1,2,4,leaf);}rr(c,-13,3,27,1,'#aa913d');}
 if(kind==='mushrooms'){for(const [xx,yy,s] of [[-7,1,5],[6,-3,7]]){rr(c,xx-1,yy-5,3,7,'#e8d0a6');pixelOval(c,xx,yy-6,s,s*.6,'#a74d3e');rr(c,xx-s+1,yy-6,s*2-1,2,'#e8a26e');rr(c,xx-2,yy-8,2,2,'#ffe2af');rr(c,xx+3,yy-6,2,1,'#ffe2af');}}
 if(kind==='snowman'){pixelOval(c,1,1,13,3,'#7daeb547');pixelOval(c,0,-8,11,10,'#a9cdd1');pixelOval(c,-1,-10,9,9,'#f3fff4');pixelOval(c,0,-23,7,7,'#f3fff4');rr(c,-4,-33,8,5,'#42647b');rr(c,-7,-29,14,2,'#42647b');rr(c,-3,-24,1,2,'#42647b');rr(c,3,-24,1,2,'#42647b');rr(c,1,-21,5,2,'#e49c43');rr(c,-7,-17,14,3,'#bc6169');rr(c,5,-16,3,7,'#df8790');rr(c,0,-11,2,2,'#42647b');rr(c,0,-5,2,2,'#42647b');polygon(c,[[-9,-12],[-18,-18],[-18,-20],[-9,-15]],wood);}
 c.restore();
}

export function createPixelArt(route){
 const terrain=makeCanvas(MAP_WIDTH,MAP_HEIGHT),c=terrain.getContext('2d'),random=seededRandom();c.imageSmoothingEnabled=false;drawTerrain(c,route,random);const objects=[];
 const add=(kind,x,y,season,variant,scale=1)=>{const sprite=makeCanvas(160,160),ctx=sprite.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.translate(80,143);if(kind==='tree')drawTree(ctx,0,0,season,variant,scale);else if(kind==='house')drawHouse(ctx,0,0,season,variant);else if(kind==='garden')drawGarden(ctx,0,0,season,variant);else if(kind==='rock')drawRock(ctx,0,0,variant);else if(kind==='fence')drawFence(ctx,-25,0,50);else drawProp(ctx,0,0,season,kind);objects.push({kind,x,y,season,sprite,offsetX:80,offsetY:143});};
 // Buildings sit behind the road, leaving the path and place markers readable.
 for(const p of route.stations){const season=Math.floor(p.index/10);if(p.index%3!==2){const yy=p.y-42;if(!inWater(p.x,yy,42))add('house',p.x+(p.index%2?13:-8),yy,season,p.index);}if(p.index%3===2&&!inWater(p.x,p.y+57,40))add('garden',p.x,p.y+57,season,p.index);if(p.index%4===0&&!inWater(p.x+55,p.y+51,22))add('fence',p.x+55,p.y+51,season,p.index);const prop=p.index%4===0?'lamp':p.index%4===1?'bench':season===2?'pumpkins':season===3?'snowman':p.index%4===2?'planter':'mushrooms';const px=p.x+43,py=p.y-24;if(!inWater(px,py,18)&&!nearRoad(route,px,py,23))add(prop,px,py,season,p.index);}
 // Tree placement respects the complete road, water and house footprints.
 for(let i=0;i<480;i++){const x=30+random()*(MAP_WIDTH-60),y=174+random()*(MAP_HEIGHT-194),season=seasonAt(y),scale=.73+random()*.39;const canopyCoversRoad=route.samples.some((p,i)=>i%4===0&&Math.abs(p.x-x)<48*scale&&y>p.y-19&&y<p.y+105*scale);if(nearRoad(route,x,y,43)||canopyCoversRoad||inWater(x,y,25)||objects.some(o=>Math.abs(o.x-x)<(o.kind==='house'?74:o.kind==='tree'?36:24)&&Math.abs(o.y-y)<(o.kind==='house'?78:o.kind==='tree'?34:27)))continue;add('tree',x,y,season,i,scale);}
 for(let i=0;i<85;i++){const x=30+random()*(MAP_WIDTH-60),y=175+random()*790;if(nearRoad(route,x,y,28)||inWater(x,y,14))continue;add('rock',x,y,seasonAt(y),i);}
 // Flower meadows: stems, leaves and four square petals in seasonal colours.
 for(let i=0;i<1050;i++){const x=20+random()*(MAP_WIDTH-40),y=180+random()*800;if(nearRoad(route,x,y,28)||inWater(x,y,14))continue;const p=PALETTES[seasonAt(y)];for(let n=0;n<(i%4===0?3:1);n++){const xx=x+n*5,yy=y+(n%2)*4;rr(c,xx,yy,1,4,p.dark);rr(c,xx-2,yy-3,5,3,i%7===0?'#fff7d4':p.flower);rr(c,xx-1,yy-4,3,5,i%7===0?'#fff7d4':p.flower);rr(c,xx,yy-2,1,1,'#e7af3d');}}
 objects.sort((a,b)=>a.y-b.y);return {terrain,objects,lakes:LAKES};
}

export function drawStation(c,p,{label,visited,current,cinematic,time=0,name='',overview=false,labelsOnly=false}){
 if(!labelsOnly){
 pixelOval(c,p.x,p.y+4,20,12,'#806345');pixelOval(c,p.x,p.y+1,19,11,current?'#ecb845':visited?'#8eab65':'#d4b780');pixelOval(c,p.x,p.y-1,17,9,current?'#ffe9a0':visited?'#d2e4a3':'#fff0c7');rr(c,p.x-11,p.y-7,17,1,current?'#fff9d8':'#fff9e2');
 c.fillStyle=current?'#764719':'#514632';c.font='bold 12px monospace';c.textAlign='center';c.fillText(String(label).padStart(2,'0'),Math.round(p.x),Math.round(p.y+4));
 if(current){const h=overview?6:8;polygon(c,[[p.x-5,p.y-36-h],[p.x+5,p.y-36-h],[p.x,p.y-30-h]],'#fff3bc');}
 }
 if(!overview&&name){const width=Math.min(100,name.length*9+12),x=Math.round(p.x-width/2),y=Math.round(p.y+21);rr(c,x+3,y+14,2,6,'#8c6849');rr(c,x+width-6,y+14,2,6,'#8c6849');rr(c,x-1,y-1,width+2,16,'#765136');rr(c,x,y,width,13,'#edcc94');rr(c,x+1,y+1,width-2,1,'#fff1c9');rr(c,x+2,y+11,width-4,1,'#c39a64');c.fillStyle='#563b28';c.font='bold 9px "Microsoft YaHei",sans-serif';c.textAlign='center';c.fillText(name,Math.round(p.x),y+10);if(cinematic){rr(c,x+width-3,y-6,7,8,'#a37642');polygon(c,[[x+width-1,y-5],[x+width+3,y-2],[x+width-1,y]],'#ffda85');}}
}

// Only the upper body moves at rest; the feet stay anchored to the same tile.
// A frozen time (pause) or motion:false produces a deterministic stable pose.
export function bearIdlePose(time=0,{motion=true}={}){
 if(!motion||!Number.isFinite(time))return {breath:0,blink:false,look:0,wave:0,stretch:0,gesture:'rest'};
 const t=Math.max(0,time),cycle=t%14500,look=cycle>=3500&&cycle<5500?Math.sin((cycle-3500)/2000*Math.PI)*2:0;
 const waving=cycle>=7200&&cycle<9200,stretch=cycle>=11200&&cycle<12800?Math.sin((cycle-11200)/1600*Math.PI):0;
 return {breath:(1-Math.cos(t*.0024))*.75,blink:t%4600>4420,look,wave:waving?1+Math.sin((cycle-7200)*.016)*.5:0,stretch,gesture:stretch>0?'stretch':waving?'wave':look>0?'look':'rest'};
}

export const BEAR_PALETTE=Object.freeze({outline:'#42424c',shade:'#d6d6da',soft:'#e8e8eb',white:'#ffffff',limb:'#151516',limbLight:'#343436',sole:'#060607',nose:'#101011',noseLight:'#3d3d40',eye:'#040405'});

// Heading follows the map: down faces the player, up reveals the small tail.
// A side silhouette is retained on diagonals so the large nose reads clearly.
export function bearFacing(heading=0){
 const angle=Number.isFinite(heading)?heading:0,vertical=Math.sin(angle);
 return {view:vertical>.7?'front':vertical<-.7?'back':'side',flip:Math.cos(angle)<0?-1:1};
}

export function drawBear(c,x,y,{time=0,walking=false,heading=0,throwing=false,arrival=0,motion=true}={}){
 const clock=Number.isFinite(time)?Math.max(0,time):0,p=BEAR_PALETTE,{view,flip}=bearFacing(heading),side=view==='side',back=view==='back';
 const phase=walking&&motion?Math.sin(clock*.016):0,idle=bearIdlePose(clock,{motion:motion&&!walking}),breath=walking?Math.abs(phase):idle.breath;
 const wave=!walking&&(idle.wave>0||throwing),stretch=!walking&&!throwing&&idle.stretch>.2,lift=Number.isFinite(arrival)?Math.max(0,arrival):0;
 c.save();c.translate(Math.round(x),Math.round(y));pixelOval(c,0,1,13,4,'#3c554e50');c.scale(side?flip:1,1);c.translate(0,-Math.round(lift));
 // Boots remain outside the breathing/head transform. Even a big stretch
 // changes neither sole's position; walking lifts alternate feet, never sinks.
 for(const [leg,px] of [[-1,side?-5:-7],[1,side?3:4]]){
  const step=-Math.round(Math.max(0,phase*leg)*2),toe=side?1:leg<0?-2:1;
  rr(c,px,-11+step,4,12,p.limb);rr(c,px+1,-8+step,1,7,p.limbLight);
  rr(c,px+toe-1,-3+step,7,4,p.limb);rr(c,px+toe,-3+step,5,1,p.limbLight);rr(c,px+toe-1,step,7,2,p.sole);
 }
 c.save();c.translate(0,-Math.round(breath));
 const arm=(direction,raised=false)=>{
  const shoulder=direction*(side?9:11),swing=walking?Math.round(phase*direction*2):0;
  if(raised){
   const handX=direction*(stretch?17:(side?24:17)+Math.round(Math.sin(clock*.015)*2)),handY=stretch?-35-Math.round(idle.stretch*3):-35;
   polygon(c,[[shoulder,-25],[shoulder+direction*3,-24],[handX+direction*2,handY+2],[handX-direction,handY]],p.limb);
   rr(c,handX-2,handY-3,5,5,p.limb);rr(c,handX-1,handY-2,1,3,p.limbLight);
  }else{
   polygon(c,[[shoulder,-26],[shoulder+direction*3,-23],[shoulder+direction*5,-12+swing],[shoulder+direction*4,-8+swing],[shoulder+direction,-9+swing],[shoulder,-18]],p.limb);
   rr(c,shoulder+direction*2,-21+swing,1,10,p.limbLight);
  }
 };
 // Far hand and a profile tail sit behind the uninterrupted pear-shaped body.
 arm(-1,stretch||(side&&wave&&!throwing));
 if(side){pixelOval(c,-12,-16,5,5,p.outline);pixelOval(c,-13,-17,4,4,p.shade);pixelOval(c,-14,-18,3,3,p.white);}
 const body=side?
  [[-10,-34],[-9,-42],[-7,-46],[-5,-46],[-1,-38],[3,-35],[11,-35],[13,-31],[12,-22],[11,-15],[7,-10],[2,-8],[-5,-9],[-10,-12],[-12,-19],[-11,-28]]:
  [[-11,-33],[-10,-43],[-8,-46],[-6,-46],[-2,-37],[2,-37],[6,-46],[9,-46],[11,-42],[12,-31],[13,-21],[12,-15],[9,-11],[4,-8],[-4,-8],[-9,-11],[-12,-15],[-13,-23]];
 polygon(c,body,p.outline);
 const fill=side?
  [[-9,-33],[-8,-41],[-6,-44],[-2,-37],[2,-34],[10,-34],[11,-31],[10,-22],[10,-16],[6,-11],[1,-9],[-5,-10],[-9,-13],[-11,-19],[-10,-27]]:
  [[-10,-32],[-9,-42],[-7,-44],[-2,-35],[3,-35],[7,-44],[9,-42],[10,-31],[11,-21],[10,-15],[7,-12],[3,-10],[-3,-10],[-8,-12],[-10,-16],[-11,-23]];
 polygon(c,fill,p.shade);
 const white=side?
  [[-7,-33],[-6,-43],[-2,-36],[2,-33],[10,-33],[10,-27],[8,-24],[9,-17],[5,-12],[-1,-11],[-6,-13],[-8,-18],[-8,-26]]:
  [[-8,-31],[-7,-43],[-3,-35],[3,-35],[7,-43],[9,-41],[9,-31],[10,-22],[9,-17],[6,-13],[2,-12],[-3,-12],[-7,-15],[-9,-20],[-9,-27]];
 polygon(c,white,p.white);
 // Two pointed ears remain recognisable head-on and from behind. Profile has
 // a second short ear behind the head rather than a round teddy-bear ear.
 if(side){polygon(c,[[1,-35],[4,-41],[6,-42],[8,-35]],p.outline);polygon(c,[[3,-35],[5,-39],[6,-40],[7,-35]],p.soft);}
 else{rr(c,-7,-40,1,6,p.soft);rr(c,6,-40,1,6,p.soft);}
 if(back){pixelOval(c,0,-16,5,5,p.outline);pixelOval(c,0,-16,4,4,p.shade);pixelOval(c,-1,-17,3,3,p.white);}
 else{
  c.save();c.translate(Math.round(idle.look)*(side?1:.5),-Math.round(idle.stretch));
  const nx=side?13:0,ny=side?-33:-32;
  if(side){polygon(c,[[4,-36],[13,-36],[15,-32],[13,-28],[8,-27],[8,-23],[5,-24],[5,-28],[2,-29]],p.shade);polygon(c,[[3,-36],[13,-36],[14,-32],[12,-29],[7,-29],[5,-28],[2,-30]],p.white);rr(c,5,-27,6,1,p.outline);rr(c,-4,-33,2,idle.blink?1:3,p.eye);}
  else{rr(c,-9,-32,2,idle.blink?1:3,p.eye);rr(c,8,-32,2,idle.blink?1:3,p.eye);pixelOval(c,0,-27,6,3,p.shade);}
  // Oversized charcoal nose: four neutral tones, no coloured cheeks/gear.
  pixelOval(c,nx,ny,6,7,p.nose);pixelOval(c,nx+1,ny-1,5,5,'#242427');pixelOval(c,nx+1,ny-2,3,4,p.noseLight);rr(c,nx+1,ny-4,2,2,'#65656a');
  c.restore();
 }
 arm(1,stretch||(!side&&wave)||throwing);c.restore();c.restore();
}
export const DICE_PIPS=Object.freeze({1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]});
export function drawPixelDice(c,x,y,value,{rotation=0,scale=1}={}){c.save();c.translate(Math.round(x),Math.round(y));c.scale(scale,scale);c.rotate(rotation);rr(c,-13,-13,26,26,'#795c43');rr(c,-12,-12,24,23,'#fff5d2');rr(c,-11,-11,22,3,'#fffcec');rr(c,-11,8,22,3,'#d6be91');for(const [px,py] of DICE_PIPS[value]||[])rr(c,px*6-2,py*6-2,4,4,value===1?'#be6a56':'#655d4b');c.restore();}
export function drawButterfly(c,x,y,time,color='#fff1a8'){const wing=Math.sin(time*.015)>0?3:1;rr(c,x-wing,y-2,wing,3,color);rr(c,x+1,y-2,wing,3,color);rr(c,x,y-1,1,3,'#79674b');}
