import * as THREE from 'three';

export const overlaps=(a,b,gap=6)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;

// CSS pixels, never the downsampled WebGL buffer dimensions. Bound callout
// movement so a name cannot drift onto an unrelated building.
export function layoutWorldLabels(candidates,{width,height,reserved=[],limit=12}){
  const placed=[],occupied=[...reserved];
  for(const c of [...candidates].sort((a,b)=>a.priority-b.priority)){
    if(placed.length>=limit)break;
    if(!Number.isFinite(c.x+c.y+c.depth)||c.depth<=-1||c.depth>=1||c.x<0||c.x>width||c.y<0||c.y>height)continue;
    if(c.stationIndex!=null&&placed.some(p=>p.stationIndex===c.stationIndex))continue;
    const offsets=c.kind==='season'?[[0,-c.height/2],[-112,-c.height/2],[112,-c.height/2],[0,12],[0,-c.height-12]]:[[0,-c.height-12],[0,12],[-36,-c.height-24],[36,-c.height-24]];
    for(const [dx,dy] of offsets){
      const rect={x:c.x-c.width/2+dx,y:c.y+dy,width:c.width,height:c.height};
      if(rect.x<12||rect.y<12||rect.x+rect.width>width-12||rect.y+rect.height>height-12||occupied.some(r=>overlaps(rect,r)))continue;
      placed.push({...c,rect});occupied.push(rect);break;
    }
  }
  return placed;
}

export class WorldSignage{
  constructor(world){
    this.world=world;this.entries=[];this.vector=new THREE.Vector3();this.nextLayout=0;this.needsMeasure=true;
    this.layer=document.createElement('div');this.layer.className='world-signage';this.layer.setAttribute('aria-hidden','true');world.container.append(this.layer);
    // Location names belong only on physical road signs, never on buildings.
    // This screen-space layer now contains only overview chapter labels.
    world.labels.forEach((label,season)=>{
      label.el.style.opacity='';label.el.style.transform='';this.layer.append(label.el);
      this.entries.push({...label,kind:'season',anchor:label.position,season});
    });
    this.hud=[...document.querySelectorAll('.topbar,.daylight-switch,.status-strip,.map-controls,.journey-settings,.world-location,#town-return,#continue-travel,.life-season,.travel-status')];
  }
  load(){
    if(this.disposed)return;
    this.invalidate();
  }
  invalidate(){
    this.needsMeasure=true;this.nextLayout=0;
  }
  update(time){
    const w=this.world,width=w.container.clientWidth,height=w.container.clientHeight;
    // Pure presentation: no handler or hit surface over OrbitControls.
    this.layer.hidden=w.stage==='dice'||w.stage==='turning';
    if(this.layer.hidden||time<this.nextLayout||!width||!height||!this.layer.offsetWidth)return;
    this.nextLayout=time+50;
    if(this.needsMeasure){for(const entry of this.entries){entry.width=entry.el.offsetWidth;entry.height=entry.el.offsetHeight;}this.needsMeasure=false;}
    const reserved=[],containerRect=w.container.getBoundingClientRect();
    for(const hud of this.hud){
      if(!hud.isConnected||hud.hidden)continue;
      const style=getComputedStyle(hud);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')continue;
      const r=hud.getBoundingClientRect();if(r.width&&r.height)reserved.push({x:r.x-containerRect.x,y:r.y-containerRect.y,width:r.width,height:r.height});
    }
    if(w.cameraMode==='follow'){
      const actor=this.vector.copy(w.character.position);actor.y+=1.4;actor.project(w.camera);
      reserved.push({x:(actor.x+1)*width/2-38,y:(1-actor.y)*height/2-62,width:76,height:124});
    }
    const candidates=[];
    for(const e of this.entries){
      e.el.style.visibility='hidden';
      if(w.cameraMode!=='overview')continue;
      const p=this.vector.copy(e.anchor).project(w.camera),priority=-100+e.season;
      candidates.push({...e,x:(p.x+1)*width/2,y:(1-p.y)*height/2,depth:p.z,priority});
    }
    const visible=layoutWorldLabels(candidates,{width,height,reserved,limit:w.cameraMode==='overview'?(height<550?8:14):5});
    for(const e of visible){
      e.el.style.transform=`translate(${Math.round(e.rect.x)}px,${Math.round(e.rect.y)}px)`;e.el.style.visibility='visible';
    }
    w.container.dataset.readableLabels=String(visible.length);w.container.dataset.textLayer='css-resolution';
  }
  dispose(){this.disposed=true;this.layer.remove();this.entries=[];}
}
