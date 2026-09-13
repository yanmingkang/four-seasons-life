import {getCinematic} from './cinematic-manifest.js';
export {getCinematic,CINEMATIC_MANIFEST} from './cinematic-manifest.js';

const running=new WeakMap();
const FALLBACK_MS=3000,LOAD_GRACE_MS=4500,STALL_GRACE_MS=3500,HANDOFF_MS=220;
const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};

function prop(stage,type,label,parts=[]) {
  const node=make('div',`cine-prop cine-${type}`);
  if(label)node.append(make('span','cine-prop-label',label));
  for(const part of parts)node.append(make('i',`cine-detail cine-${part}`));
  stage.append(node);return node;
}

// Lightweight local fallback when footage is unavailable or fails to decode.
function storyboard(item) {
  const scene=make('div',`cine-diorama cine-theme-${item.theme}`);scene.setAttribute('aria-hidden','true');
  scene.append(make('div','cine-wall'),make('div','cine-window'),make('div','cine-floor'),make('div','cine-spotlight'));
  const furniture=make('div','cine-furniture');scene.append(furniture);
  if(['presentation','review','offer','departure'].includes(item.theme))prop(furniture,'desk',null,['desk-leg','desk-leg']);
  switch(item.theme){
    case 'stairwell':
      prop(furniture,'chat','楼道转角',['bubble','bubble']);prop(furniture,'plant',null,['leaf','leaf','leaf']);break;
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
export function playCinematic(container,eventOrId,{isCurrent=()=>true,isPaused=()=>false,isSoundEnabled,onSoundToggle,onAudioChange=()=>{},reducedMotion}={}) {
  cancelCinematic(container);
  const item=getCinematic(eventOrId);
  if(!item)return Promise.resolve({status:'not-found',mode:'storyboard'});
  const reduce=reducedMotion??globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false;
  if(!isCurrent())return Promise.resolve({status:'cancelled',mode:'storyboard'});
  if(reduce)return Promise.resolve({status:'skipped',mode:'storyboard',reason:'reduced-motion'});
  return new Promise(resolve=>{
    const previousFocus=document.activeElement;
    const root=make('section','cinematic cinematic--film');root.dataset.cinematic=item.id;root.dataset.mode='loading';root.dataset.production=item.production??'local-video';
    root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',`${item.title}，事件短片`);
    const card=make('div','cine-card'),head=make('header','cine-header');
    head.append(make('span','cine-kicker',`四时片刻 / ${String(item.cell).padStart(2,'0')}`),make('h2','cine-title',item.title));
    const badge=make('span','cine-placeholder-label','载入这一刻…');head.append(badge);
    const frame=make('div','cine-frame');frame.append(storyboard(item));
    const caption=make('p','cine-caption',item.beat[0]);
    const footer=make('footer','cine-footer'),progress=make('span','cine-progress');progress.setAttribute('aria-hidden','true');
    const audio=make('button','cine-sound');audio.type='button';audio.hidden=item.hasAudio===false;
    const skip=make('button','cine-skip','跳过，进入选择');skip.type='button';
    footer.append(progress,audio,skip);card.append(head,frame,caption,footer);root.append(card);container.append(root);container.hidden=false;
    skip.focus({preventScroll:true});
    let elapsed=0,lastTime=performance.now(),raf=0,settled=false,video=null,mediaStarted=false,mode='loading',lastMediaTime=0,stalledFor=0,paused=document.hidden||isPaused();
    let pendingPlay=false,closing=null,closingElapsed=0,localSound=false,autoplayMuted=false,audible=false,abortRetries=0;
    root.dataset.paused=String(paused);
    const listeners=[];
    const on=(node,name,listener)=>{node.addEventListener(name,listener);listeners.push(()=>node.removeEventListener(name,listener));};
    function publishAudio(value){
      if(audible===value)return;audible=value;root.dataset.audible=String(value);
      try{onAudioChange(value);}catch{/* Audio presentation must not prevent cleanup. */}
    }
    function syncAudio(){
      const enabled=(isSoundEnabled?!!isSoundEnabled():localSound)&&!autoplayMuted&&item.hasAudio!==false;
      if(video){video.muted=!enabled;video.volume=.65;}
      audio.textContent=enabled?'关闭声音':'开启声音';audio.setAttribute('aria-pressed',String(enabled));
      publishAudio(!!(enabled&&video&&mediaStarted&&!video.paused&&!paused&&!closing));
    }
    function releaseMedia(){
      publishAudio(false);pendingPlay=false;
      if(!video)return;
      const media=video;video=null;media.pause();media.removeAttribute('src');media.load();media.remove();
    }
    function finish(status){
      if(settled)return;settled=true;cancelAnimationFrame(raf);listeners.splice(0).forEach(off=>off());releaseMedia();
      root.remove();if(running.get(container)?.root===root){running.delete(container);container.hidden=true;}
      if(previousFocus?.isConnected&&document.activeElement===document.body)previousFocus.focus?.({preventScroll:true});
      resolve({status,mode});
    }
    running.set(container,{root,finish});
    function end(status){
      if(settled||closing)return;
      closing=status;closingElapsed=0;root.classList.add('is-leaving');publishAudio(false);
      video?.pause();progress.style.setProperty('--cine-progress',1);
    }
    const fallBack=()=>{
      if(settled||closing)return;
      releaseMedia();mode='storyboard';root.dataset.mode=mode;badge.textContent='短片暂未加载，继续这一刻';elapsed=0;stalledFor=0;audio.hidden=true;
    };
    const playVideo=()=>{
      const media=video;if(!media||paused||media.ended||closing||pendingPlay)return;
      syncAudio();pendingPlay=true;
      let attempt;try{attempt=media.play();}catch(error){attempt=Promise.reject(error);}
      Promise.resolve(attempt).then(()=>{if(media===video){pendingPlay=false;if(paused||closing)media.pause();syncAudio();}},error=>{
        if(settled||media!==video)return;pendingPlay=false;
        if(paused||closing)return;
        // A pause may abort an earlier play after the player has already resumed.
        if(error?.name==='AbortError'){if(abortRetries++<1)playVideo();else fallBack();return;}
        // A browser may require a gesture for sound. Keep the picture playing silently.
        if(error?.name==='NotAllowedError'&&!media.muted){autoplayMuted=true;syncAudio();playVideo();}
        else fallBack();
      });
    };
    on(audio,'click',()=>{const retrySound=autoplayMuted&&(isSoundEnabled?isSoundEnabled():localSound);autoplayMuted=false;if(!retrySound){if(onSoundToggle)onSoundToggle();else localSound=!localSound;}syncAudio();playVideo();});
    on(skip,'click',()=>end('skipped'));
    on(root,'keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();end('skipped');}
      else if(event.key==='Tab'){event.preventDefault();(audio.hidden||document.activeElement===audio?skip:audio).focus();}
      else if(event.key===' '||event.key==='Enter')event.stopPropagation();
    });
    on(document,'visibilitychange',()=>{lastTime=performance.now();paused=document.hidden||isPaused();root.dataset.paused=String(paused);if(paused)video?.pause();else playVideo();syncAudio();});
    // Only same-origin absolute local media paths are accepted.
    if(typeof item.src==='string'&&/^\/cinematics\/[a-zA-Z0-9_./-]+\.mp4$/.test(item.src)&&!item.src.includes('..')){
      video=make('video','cine-video');video.muted=true;video.playsInline=true;video.preload='auto';video.setAttribute('aria-label',`${item.title}场景动画`);
      if(typeof item.poster==='string'&&/^\/cinematics\/[a-zA-Z0-9_./-]+\.(png|webp|jpg)$/.test(item.poster)&&!item.poster.includes('..')){
        video.poster=item.poster;
        // Keep the actual scene still for a missing clip; the local diorama is the final fallback if the poster also fails.
        const poster=make('img','cine-poster');poster.src=item.poster;poster.alt='';poster.draggable=false;
        on(poster,'error',()=>poster.remove());frame.append(poster);
      }
      on(video,'error',fallBack);
      on(video,'loadedmetadata',()=>{if(video&&(!Number.isFinite(video.duration)||video.duration<=0||video.duration>60))fallBack();});
      on(video,'playing',()=>{
        if(!video||settled)return;
        if(paused||closing){video.pause();return;}
        if(!mediaStarted){elapsed=0;lastTime=performance.now();}mediaStarted=true;stalledFor=0;mode='video';root.dataset.mode=mode;badge.textContent='';syncAudio();
      });
      on(video,'ended',()=>{if(video&&mediaStarted)end('completed');});
      video.src=item.src;frame.append(video);playVideo();
    }else fallBack();
    syncAudio();
    function tick(now){
      if(settled)return;
      if(!isCurrent()){finish('cancelled');return;}
      const nextPaused=document.hidden||isPaused(),delta=Math.min(250,Math.max(0,now-lastTime));lastTime=now;
      if(nextPaused!==paused){paused=nextPaused;root.dataset.paused=String(paused);if(paused)video?.pause();else playVideo();}
      syncAudio();
      if(!paused){
        if(closing){closingElapsed+=delta;if(closingElapsed>=HANDOFF_MS){finish(closing);return;}raf=requestAnimationFrame(tick);return;}
        elapsed+=delta;
        if(video){
          if(!mediaStarted&&elapsed>=LOAD_GRACE_MS)fallBack();
          else if(mediaStarted&&!video.ended){
            stalledFor=video.currentTime===lastMediaTime?stalledFor+delta:0;lastMediaTime=video.currentTime;
            if(stalledFor>=STALL_GRACE_MS)fallBack();
          }
        }
        const fraction=mode==='video'&&video?Math.min(1,video.currentTime/video.duration):mode==='storyboard'?Math.min(1,elapsed/FALLBACK_MS):0;
        progress.style.setProperty('--cine-progress',fraction);
        const beat=item.beat[Math.min(item.beat.length-1,Math.floor(fraction*item.beat.length))];
        if(caption.textContent!==beat)caption.textContent=beat;
        if(mode==='storyboard'&&elapsed>=FALLBACK_MS)end('completed');
      }
      raf=requestAnimationFrame(tick);
    }
    raf=requestAnimationFrame(tick);
  });
}
