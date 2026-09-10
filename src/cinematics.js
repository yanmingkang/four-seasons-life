import {getCinematic} from './cinematic-manifest.js';
export {getCinematic,CINEMATIC_MANIFEST} from './cinematic-manifest.js';

const running=new WeakMap();
const MIN_CLIP_MS=3000,MAX_CLIP_MS=5000,MEDIA_GRACE_MS=1000;
const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};

function prop(stage,type,label,parts=[]) {
  const node=make('div',`cine-prop cine-${type}`);
  if(label)node.append(make('span','cine-prop-label',label));
  for(const part of parts)node.append(make('i',`cine-detail cine-${part}`));
  stage.append(node);return node;
}

// These are temporary in-browser dioramas, not the team's delivered footage.
function storyboard(item) {
  const scene=make('div',`cine-diorama cine-theme-${item.theme}`);scene.setAttribute('aria-hidden','true');
  scene.append(make('div','cine-wall'),make('div','cine-window'),make('div','cine-floor'),make('div','cine-spotlight'));
  const furniture=make('div','cine-furniture');scene.append(furniture);
  if(['presentation','review','offer','departure'].includes(item.theme))prop(furniture,'desk',null,['desk-leg','desk-leg']);
  switch(item.theme){
    case 'presentation':
      prop(furniture,'projection','项目提案',['chart','chart','chart']);prop(furniture,'podium',null,['microphone']);prop(furniture,'empty-chair');break;
    case 'incident':
      prop(furniture,'rack',null,['server','server','server']);prop(furniture,'monitor','!',['code','code','code']);prop(furniture,'coffee',null,['steam','steam']);break;
    case 'review':
      prop(furniture,'chat','项目协作群',['bubble','bubble','bubble']);prop(furniture,'evidence','沟通记录',['rule','rule','rule']);break;
    case 'home':
      prop(furniture,'mirror');prop(furniture,'basin',null,['tap']);prop(furniture,'toothpaste',null,['toothpaste-cap']);prop(furniture,'towel');prop(furniture,'plant',null,['leaf','leaf','leaf']);break;
    case 'care':
      prop(furniture,'bed',null,['pillow','blanket']);prop(furniture,'drip',null,['drip-bag','drip-line']);prop(furniture,'clock','04:30');prop(furniture,'phone','明早 · 汇报');break;
    case 'banquet':
      prop(furniture,'chandelier',null,['crystal','crystal','crystal']);prop(furniture,'round-table',null,['glass','glass']);prop(furniture,'cards','名片',['rule','rule']);break;
    case 'offer':
      prop(furniture,'contract','新的机会',['rule','rule','highlight']);prop(furniture,'pen');prop(furniture,'plant',null,['leaf','leaf','leaf']);break;
    case 'departure':
      prop(furniture,'agreement','离职协议',['rule','rule','rule']);prop(furniture,'box','工作记录');prop(furniture,'clock','17:30');break;
  }
  const mascot=make('div','cine-mascot');
  const character=make('img','cine-character');character.src='/characters/idle.gif';character.alt='';character.draggable=false;
  mascot.append(make('span','cine-mascot-shadow'),character);scene.append(mascot);
  scene.append(make('div','cine-vignette'));
  return scene;
}

export function cancelCinematic(container) {running.get(container)?.finish('cancelled');}

/** A self-contained, cancellable cutscene. This function never calls a model API. */
export function playCinematic(container,eventOrId,{isCurrent=()=>true,isPaused=()=>false,reducedMotion}={}) {
  cancelCinematic(container);
  const item=getCinematic(eventOrId);
  if(!item)return Promise.resolve({status:'not-found',mode:'storyboard'});
  const reduce=reducedMotion??globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  if(!isCurrent())return Promise.resolve({status:'cancelled',mode:'storyboard'});
  if(reduce)return Promise.resolve({status:'skipped',mode:'storyboard',reason:'reduced-motion'});
  return new Promise(resolve=>{
    const previousFocus=document.activeElement;
    const root=make('section','cinematic');root.dataset.cinematic=item.id;root.dataset.mode='storyboard';
    root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',`${item.title}，事件短片`);
    const card=make('div','cine-card'),head=make('header','cine-header');
    head.append(make('span','cine-kicker',`四时片刻 / ${String(item.cell).padStart(2,'0')}`),make('h2','cine-title',item.title));
    const badge=make('span','cine-placeholder-label','临时演绎 · 正式动画待替换');head.append(badge);
    const frame=make('div','cine-frame');frame.append(storyboard(item));
    const caption=make('p','cine-caption',item.beat[0]);caption.setAttribute('aria-live','polite');
    const footer=make('footer','cine-footer'),progress=make('span','cine-progress');progress.setAttribute('aria-hidden','true');
    const skip=make('button','cine-skip','跳过，进入选择');skip.type='button';
    footer.append(progress,skip);card.append(head,frame,caption,footer);root.append(card);container.append(root);container.hidden=false;
    skip.focus({preventScroll:true});
    let elapsed=0,lastTime=performance.now(),raf=0,settled=false,video=null,mediaStarted=false,mode='storyboard',desiredDuration=item.durationMs,lastMediaTime=0,stalledFor=0,paused=document.hidden||isPaused();
    root.dataset.paused=String(paused);
    const listeners=[];
    const on=(node,name,listener)=>{node.addEventListener(name,listener);listeners.push(()=>node.removeEventListener(name,listener));};
    function releaseMedia(){
      if(!video)return;
      video.pause();video.removeAttribute('src');video.load();video.remove();video=null;
    }
    function finish(status){
      if(settled)return;settled=true;cancelAnimationFrame(raf);listeners.splice(0).forEach(off=>off());releaseMedia();
      root.remove();if(running.get(container)?.root===root){running.delete(container);container.hidden=true;}
      if(previousFocus?.isConnected&&document.activeElement===document.body)previousFocus.focus?.({preventScroll:true});
      resolve({status,mode});
    }
    running.set(container,{root,finish});
    const fallBack=()=>{
      releaseMedia();mode='storyboard';root.dataset.mode=mode;badge.textContent='临时演绎 · 正式动画待替换';desiredDuration=item.durationMs;
    };
    const playVideo=()=>{if(video&&!paused&&!video.ended)video.play()?.catch(()=>{if(!settled)fallBack();});};
    on(skip,'click',()=>finish('skipped'));
    on(root,'keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish('skipped');}
      else if(event.key==='Tab'){event.preventDefault();skip.focus();}
      else if(event.key===' '||event.key==='Enter')event.stopPropagation();
    });
    on(document,'visibilitychange',()=>{lastTime=performance.now();if(document.hidden)video?.pause();});
    // A null path means no footage has been delivered. No probing or 404 request.
    // Only same-origin absolute local paths are accepted, never third-party URLs.
    if(typeof item.src==='string'&&/^\/cinematics\/[a-zA-Z0-9_./-]+\.mp4$/.test(item.src)&&!item.src.includes('..')){
      video=make('video','cine-video');video.muted=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-label',`${item.title}场景动画`);
      if(typeof item.poster==='string'&&/^\/cinematics\/[a-zA-Z0-9_./-]+\.(png|webp|jpg)$/.test(item.poster)&&!item.poster.includes('..'))video.poster=item.poster;
      on(video,'error',fallBack);
      on(video,'loadedmetadata',()=>{if(video&&Number.isFinite(video.duration))desiredDuration=Math.max(MIN_CLIP_MS,Math.min(MAX_CLIP_MS,video.duration*1000));});
      on(video,'playing',()=>{mediaStarted=true;mode='video';root.dataset.mode=mode;badge.textContent='四时人生 · 场景短片';});
      video.src=item.src;frame.append(video);playVideo();
    }
    function tick(now){
      if(settled)return;
      if(!isCurrent()){finish('cancelled');return;}
      const nextPaused=document.hidden||isPaused(),delta=Math.min(250,Math.max(0,now-lastTime));lastTime=now;
      if(nextPaused!==paused){paused=nextPaused;root.dataset.paused=String(paused);if(paused)video?.pause();else playVideo();}
      if(!paused){
        elapsed+=delta;
        if(video){
          if(!mediaStarted&&elapsed>=MEDIA_GRACE_MS)fallBack();
          else if(mediaStarted&&!video.ended){
            stalledFor=video.currentTime===lastMediaTime?stalledFor+delta:0;lastMediaTime=video.currentTime;
            if(stalledFor>=MEDIA_GRACE_MS)fallBack();
          }
        }
        const fraction=Math.min(1,elapsed/desiredDuration);
        progress.style.setProperty('--cine-progress',fraction);
        const beat=item.beat[Math.min(item.beat.length-1,Math.floor(fraction*item.beat.length))];
        if(caption.textContent!==beat)caption.textContent=beat;
        if(elapsed>=desiredDuration){finish('completed');return;}
      }
      raf=requestAnimationFrame(tick);
    }
    raf=requestAnimationFrame(tick);
  });
}
