// Versioned, local art only. The map is always playable with its original
// code-drawn buildings when this optional atlas is missing or malformed.
import {inWater} from './pixel-art.js';

export const LANDMARK_ATLAS_URL='/art/life-landmarks-v1.png';
// Enable only after a validated transparent atlas has been delivered locally.
export const LANDMARK_ART_READY=false;
export const LANDMARK_SPECS=Object.freeze([
  Object.freeze({id:'library',tile:0,cell:0,width:116,maxHeight:114,dx:0,dy:-31}),
  Object.freeze({id:'stadium',tile:1,cell:1,width:122,maxHeight:92,dx:0,dy:-31}),
  Object.freeze({id:'village',tile:2,cell:2,width:110,maxHeight:122,dx:0,dy:-31}),
  Object.freeze({id:'bookstall',tile:0,cell:3,width:82,maxHeight:64,dx:80,dy:124,decorative:true}),
]);

export function landmarkPlans(route){
  if(!Array.isArray(route?.stations)||!Array.isArray(route?.samples))return [];
  return LANDMARK_SPECS.flatMap(spec=>{
    const tile=route.stations[spec.tile];if(!tile)return [];
    const x=tile.x+spec.dx,y=tile.y+spec.dy;
    const bounds={left:x-spec.width/2,right:x+spec.width/2,top:y-spec.maxHeight,bottom:y};
    // Do not sacrifice a road, another season's route, or water for a landmark.
    const blocksRoad=route.samples.some(p=>p.x>bounds.left-8&&p.x<bounds.right+8&&p.y>bounds.top-20&&p.y<bounds.bottom+20);
    const wet=[bounds.left,x,bounds.right].some(xx=>[bounds.top,(bounds.top+y)/2,y].some(yy=>inWater(xx,yy,5)));
    return blocksRoad||wet?[]:[{...spec,x,y,bounds,season:Math.floor(spec.tile/10)}];
  });
}

export function alphaBounds(data,width,height,region){
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||!data||data.length<width*height*4||!region)return null;
  if(!['x','y','w','h'].every(key=>Number.isInteger(region[key]))||region.x<0||region.y<0||region.w<=0||region.h<=0||region.x+region.w>width||region.y+region.h>height)return null;
  const {x,y,w,h}=region;let left=x+w,top=y+h,right=-1,bottom=-1,count=0;
  for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
    if(data[(yy*width+xx)*4+3]<=24)continue;
    left=Math.min(left,xx);right=Math.max(right,xx);top=Math.min(top,yy);bottom=Math.max(bottom,yy);count++;
  }
  const ratio=count/(w*h);
  // Reject both empty cells and opaque/fake-transparent sheets. All four
  // subjects must have genuine empty margin before any map object is replaced.
  if(ratio<.04||ratio>.88||left<=x||top<=y||right>=x+w-1||bottom>=y+h-1)return null;
  return {x:left,y:top,w:right-left+1,h:bottom-top+1};
}

export function loadLifeLandmarks({timeoutMs=3000,imageFactory=()=>new Image()}={}){
  return new Promise(resolve=>{
    let image;try{image=imageFactory();}catch{resolve(null);return;}
    if(!image){resolve(null);return;}
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);image.onload=image.onerror=null;resolve(value);};
    const timer=setTimeout(()=>finish(null),Math.max(0,timeoutMs));
    image.onload=()=>finish(image.naturalWidth>=128&&image.naturalHeight>=128&&image.naturalWidth<=4096&&image.naturalHeight<=4096&&image.naturalWidth%2===0&&image.naturalHeight%2===0?image:null);
    image.onerror=()=>finish(null);try{image.src=LANDMARK_ATLAS_URL;}catch{finish(null);}
  });
}

export function applyLifeLandmarks(art,route,image,{makeCanvas=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;}}={}){
  if(!image||!Array.isArray(art?.objects)||art.objects.some(o=>o.kind==='landmark'))return 0;
  try{
    const width=image.naturalWidth,height=image.naturalHeight;
    const sheet=makeCanvas(width,height),sc=sheet.getContext('2d',{willReadFrequently:true});
    sc.drawImage(image,0,0);const data=sc.getImageData(0,0,width,height).data;
    const cells=Array.from({length:4},(_,i)=>alphaBounds(data,width,height,{x:i%2*width/2,y:Math.floor(i/2)*height/2,w:width/2,h:height/2}));
    if(cells.some(cell=>!cell))return 0;
    const planned=landmarkPlans(route),objects=[];if(!planned.length)return 0;
    for(const plan of planned){
      const cell=cells[plan.cell],scale=Math.min(plan.width/cell.w,plan.maxHeight/cell.h);
      const w=Math.round(cell.w*scale),h=Math.round(cell.h*scale),sprite=makeCanvas(w+8,h+8),c=sprite.getContext('2d');
      c.imageSmoothingEnabled=false;c.drawImage(image,cell.x,cell.y,cell.w,cell.h,4,4,w,h);
      objects.push({...plan,kind:'landmark',sprite,offsetX:4+w/2,offsetY:4+h,generatedArt:true});
    }
    // Alter scenery, never route coordinates or hit targets. Remove the old
    // placeholder house and overlapping foreground props within these plots.
    const retained=art.objects.filter(object=>!objects.some(plan=>{
      const b=plan.bounds,inside=object.x>b.left-8&&object.x<b.right+8&&object.y>b.top&&object.y<b.bottom+15;
      const oldHouse=object.kind==='house'&&!plan.decorative&&Math.abs(object.x-plan.x)<26&&Math.abs(object.y-(plan.y-11))<3;
      return inside||oldHouse;
    }));
    art.objects=[...retained,...objects].sort((a,b)=>a.y-b.y);
    return objects.length;
  }catch{return 0;}
}
