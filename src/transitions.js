import {LIFE_CHAPTERS} from './season-chapters.js';

export function eventTheme(kind='') {
  if(kind==='治愈')return {id:'rest',label:'给自己一点呼吸',mark:'叶',caption:'A MOMENT TO BREATHE'};
  if(kind==='机会'||kind==='成长')return {id:'opportunity',label:'新的可能，正在发生',mark:'光',caption:'A NEW POSSIBILITY'};
  if(kind==='抉择')return {id:'conflict',label:'生活，递来一道选择',mark:'择',caption:'A CHOICE THAT MATTERS'};
  if(kind==='相遇')return {id:'meeting',label:'在这里，遇见一点温度',mark:'遇',caption:'A LITTLE CONNECTION'};
  return {id:'work',label:'新的生活任务已送达',mark:'页',caption:'A PAGE OF YOUR JOURNEY'};
}

export const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

// Arrival art follows the destination season, independently of the card's
// event category. It never changes choices, resources, dice or game history.
const ARRIVAL_SEASONS=Object.freeze([
  {mark:'花',motif:'petals',lines:{rest:'在花香里，缓一缓',opportunity:'新的可能，悄悄发芽',conflict:'在岔路前，听听自己',meeting:'春风里，遇见一个人',work:'新的一页，慢慢展开'}},
  {mark:'光',motif:'sunlight',lines:{rest:'借一阵风，歇一会儿',opportunity:'迎着光，试一试',conflict:'走得热烈，也可以停一停',meeting:'一同走过，这段晴天',work:'把脚步，落在当下'}},
  {mark:'叶',motif:'leaves',lines:{rest:'让落叶带走一点疲惫',opportunity:'这一程，也有新收获',conflict:'有所放下，也有所留下',meeting:'在秋光里，说说近况',work:'拾起经验，再走一步'}},
  {mark:'雪',motif:'snow',lines:{rest:'雪慢慢落，你慢慢来',opportunity:'静下来的日子，也有光',conflict:'风雪之中，选自己的路',meeting:'天冷了，靠近一点温暖',work:'留一点暖，继续向前'}}
].map(value=>Object.freeze({...value,lines:Object.freeze(value.lines)})));

export function arrivalTheme(kind='',season=0){
  const index=Number.isInteger(season)&&season>=0&&season<4?season:0;
  const theme=eventTheme(kind),art=ARRIVAL_SEASONS[index],chapter=LIFE_CHAPTERS[index];
  return {...theme,season:index,mark:art.mark,motif:art.motif,label:art.lines[theme.id],caption:`${chapter.name} · ${chapter.stage}`};
}

export const ARRIVAL_DURATION=1120;
const arrivals=new WeakMap();
export function cancelArrivalTransition(container){arrivals.get(container)?.finish(false);}

export function arrivalTransition(container,kind,isCurrent=()=>true,{season=0,isPaused=()=>false,reducedMotion}={}) {
  cancelArrivalTransition(container);
  if(!container||!isCurrent())return Promise.resolve(null);
  const theme=arrivalTheme(kind,season);
  const reduced=reducedMotion??globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  const duration=reduced?360:ARRIVAL_DURATION;
  container.dataset.theme=theme.id;
  container.dataset.season=String(theme.season);
  container.dataset.motif=theme.motif;
  container.dataset.reduced=String(reduced);
  container.style.setProperty('--arrival-duration',`${duration}ms`);
  container.querySelector('.arrival-mark').textContent=theme.mark;
  container.querySelector('.arrival-caption').textContent=theme.caption;
  container.querySelector('.arrival-title').textContent=theme.label;
  let atmosphere=container.querySelector('.arrival-atmosphere');
  if(!atmosphere){atmosphere=document.createElement('div');atmosphere.className='arrival-atmosphere';atmosphere.setAttribute('aria-hidden','true');container.prepend(atmosphere);}
  // Twelve reused, deterministic decorations; no randomness borrowed from dice
  // and no particle accumulation when a save changes season or mode.
  if(!atmosphere.childElementCount)for(let i=0;i<12;i++){
    const particle=document.createElement('i');particle.className='arrival-particle';
    for(const [key,value] of Object.entries({x:`${12+(i*29)%76}%`,y:`${15+(i*17)%68}%`,size:`${9+i%4*4}px`,delay:`${-i*.11}s`,drift:`${(i%2?1:-1)*(20+i%4*12)}px`,spin:`${i*37}deg`}))particle.style.setProperty(`--${key}`,value);
    atmosphere.append(particle);
  }
  container.hidden=false;
  container.classList.remove('playing');
  void container.offsetWidth;
  container.classList.add('playing');
  return new Promise(resolve=>{
    let elapsed=0,last=performance.now(),raf=0,settled=false;
    const blocked=()=>document.hidden||isPaused();
    function finish(success){
      if(settled)return;settled=true;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);
      if(arrivals.get(container)?.finish===finish){arrivals.delete(container);container.hidden=true;container.classList.remove('playing');container.dataset.paused='false';}
      resolve(success?theme:null);
    }
    function visibility(){last=performance.now();container.dataset.paused=String(blocked());}
    function tick(now){
      if(settled)return;if(!isCurrent()){finish(false);return;}
      const delta=Math.min(100,Math.max(0,now-last));last=now;const paused=blocked();container.dataset.paused=String(paused);
      if(!paused){elapsed+=delta;if(elapsed>=duration){finish(true);return;}}
      raf=requestAnimationFrame(tick);
    }
    arrivals.set(container,{finish});container.dataset.paused=String(blocked());
    document.addEventListener('visibilitychange',visibility);raf=requestAnimationFrame(tick);
  });
}
