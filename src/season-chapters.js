// Seasons are chapters of a fictional life, not age predictions or endings.
export const LIFE_CHAPTERS=Object.freeze([
  Object.freeze({name:'春',stage:'初入社会',caption:'带着期待，走进未知。',weather:'blossoms',scene:'花开时，故事开始',color:'#ad597e'}),
  Object.freeze({name:'夏',stage:'努力打拼',caption:'向前奔跑，也留一口呼吸。',weather:'fireflies',scene:'盛夏里，试着发光',color:'#477b48'}),
  Object.freeze({name:'秋',stage:'重新选择',caption:'放下比较，走自己的路。',weather:'leaves',scene:'叶落时，听听内心',color:'#a76332'}),
  Object.freeze({name:'冬',stage:'独立生活',caption:'把日子，过成自己的模样。',weather:'snow',scene:'风雪里，也有归处',color:'#537d99'})
]);

const chapterIndex=value=>Number.isFinite(value)?Math.max(-1,Math.min(3,Math.trunc(value))):-1;
/** Include every newly crossed chapter, even when a fast route skips stations. */
export function chaptersBetween(from,to){
  const first=chapterIndex(from),last=chapterIndex(to);
  return last>first?Array.from({length:last-first},(_,i)=>first+i+1):[];
}

const running=new WeakMap();
const make=(tag,className,text)=>{const element=document.createElement(tag);element.className=className;if(text!==undefined)element.textContent=text;return element;};
export function cancelSeasonChapter(container){running.get(container)?.finish(false);}

/** UI only. The caller owns game state, route progression, and audio. */
export function playSeasonChapter(container,index,{isCurrent=()=>true,isPaused=()=>false,onEnter,reducedMotion}={}){
  cancelSeasonChapter(container);
  const chapter=LIFE_CHAPTERS[index];
  if(!container||!Number.isInteger(index)||!chapter||!isCurrent())return Promise.resolve(false);
  const reduced=reducedMotion??globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  return new Promise(resolve=>{
    const previousFocus=document.activeElement,root=make('section','season-chapter'),card=make('div','chapter-card');
    root.dataset.season=String(index);root.dataset.weather=chapter.weather;root.dataset.reduced=String(reduced);
    root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',`${chapter.name}季 · ${chapter.stage}`);
    const landscape=make('div','chapter-landscape');landscape.setAttribute('aria-hidden','true');
    for(const name of ['sun','ridge','ridge rear','meadow','path','cottage','tree','tree second'])landscape.append(make('i',`chapter-${name.replaceAll(' ',' chapter-')}`));
    for(let n=0;n<22;n++){const particle=make('i','chapter-particle');particle.style.setProperty('--x',`${(n*47+7)%100}%`);particle.style.setProperty('--delay',`${-n*.39}s`);particle.style.setProperty('--size',`${6+n%3*3}px`);landscape.append(particle);}
    const content=make('div','chapter-content'),kicker=make('span','chapter-kicker',`人生的第 ${index+1} 章`),name=make('span','chapter-name',chapter.name),title=make('h2','chapter-title',chapter.stage),caption=make('p','chapter-caption',chapter.caption),skip=make('button','chapter-continue','走进这一季 →');
    skip.type='button';content.append(kicker,name,title,caption,skip);card.append(landscape,content);root.append(card);container.append(root);container.hidden=false;
    let elapsed=0,last=performance.now(),raf=0,settled=false,entered=false,paused=true;
    const duration=3000;
    function finish(success){
      if(settled)return;settled=true;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',visibility);root.removeEventListener('keydown',key);skip.removeEventListener('click',proceed);root.remove();
      if(running.get(container)?.root===root){running.delete(container);container.hidden=true;}
      if(previousFocus?.isConnected&&document.activeElement===document.body)previousFocus.focus?.({preventScroll:true});
      resolve(success);
    }
    function blocked(){return document.hidden||Boolean(globalThis.matchMedia?.('(orientation: portrait)').matches)||Boolean(document.querySelector('#dialog[open]'))||isPaused();}
    function enter(){if(entered||blocked())return;entered=true;try{onEnter?.(index);}catch{finish(false);}}
    function proceed(){if(!isCurrent()){finish(false);return;}if(blocked())return;enter();if(!settled)finish(true);}
    function key(event){
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();proceed();}
      else if(event.key==='Tab'){event.preventDefault();skip.focus({preventScroll:true});}
      else if(event.key===' '||event.key==='Enter')event.stopPropagation();
    }
    function visibility(){last=performance.now();root.dataset.paused=String(blocked());}
    function tick(now){
      if(settled)return;if(!isCurrent()){finish(false);return;}
      const delta=Math.min(100,Math.max(0,now-last));last=now;const nextPaused=blocked();
      if(nextPaused!==paused){paused=nextPaused;root.dataset.paused=String(paused);}
      if(!paused){enter();if(settled)return;elapsed+=delta;root.style.setProperty('--chapter-progress',Math.min(1,elapsed/duration));if(elapsed>=duration){finish(true);return;}}
      raf=requestAnimationFrame(tick);
    }
    running.set(container,{root,finish});root.dataset.paused=String(blocked());
    document.addEventListener('visibilitychange',visibility);root.addEventListener('keydown',key);skip.addEventListener('click',proceed);skip.focus({preventScroll:true});raf=requestAnimationFrame(tick);
  });
}
