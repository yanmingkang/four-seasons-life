// An optional local sprite sheet, not a network service. The code-drawn forest
// remains playable while loading, on timeout, or when the PNG is unavailable.
export const SEASON_TREE_URL='/art/season-trees-v2.png';
export function loadSeasonTrees({timeoutMs=3000,lateTimeoutMs=30000,onLateLoad,signal}={}) {
  return new Promise(resolve=>{
    if(signal?.aborted){resolve(null);return;}
    const image=new Image();let settled=false,finished=false,timer,lateTimer;
    const canEnhance=typeof onLateLoad==='function';
    const settle=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);};
    const cleanup=()=>{finished=true;clearTimeout(timer);clearTimeout(lateTimer);image.onload=image.onerror=null;signal?.removeEventListener('abort',cancel);};
    const cancel=()=>{if(finished)return;cleanup();settle(null);image.removeAttribute('src');};
    timer=setTimeout(()=>{
      // Readiness stays bounded. Only callers that can use a late enhancement
      // retain the image handlers, and only until the final deadline or abort.
      settle(null);if(!canEnhance)cancel();
    },timeoutMs);
    if(canEnhance)lateTimer=setTimeout(cancel,Math.max(timeoutMs,lateTimeoutMs));
    image.onload=()=>{
      if(finished)return;
      const valid=image.naturalWidth>0&&image.naturalWidth===image.naturalHeight,late=settled;
      cleanup();settle(valid?image:null);
      if(valid&&late&&canEnhance)onLateLoad(image);
    };
    image.onerror=()=>{if(finished)return;cleanup();settle(null);};
    signal?.addEventListener('abort',cancel,{once:true});
    try{image.src=SEASON_TREE_URL;}catch{cancel();}
  });
}
export function applySeasonTrees(art,route,image) {
  const cell=image.naturalWidth/2,cache=new Map();let count=0;
  art.objects.forEach((object,index)=>{
    if(object.kind!=='tree'||index%3===0)return;
    // A large canopy must not obscure a station or the actual walking road.
    if(route.samples.some((p,i)=>i%3===0&&Math.abs(p.x-object.x)<49&&object.y>p.y-14&&object.y<p.y+103))return;
    const size=index%2?92:84,key=object.season+':'+size;
    if(!cache.has(key)){
      const sprite=document.createElement('canvas');sprite.width=128;sprite.height=128;
      const c=sprite.getContext('2d');c.imageSmoothingEnabled=false;
      c.drawImage(image,(object.season%2)*cell,Math.floor(object.season/2)*cell,cell,cell,64-size/2,110-size*.97,size,size);
      cache.set(key,sprite);
    }
    object.sprite=cache.get(key);object.offsetX=64;object.offsetY=110;object.generatedArt=true;count++;
  });
  return count;
}
