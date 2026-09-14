import './style.css';
import './ai.css';
import './meeting.css';
import './cinematics.css';
import './pastoral.css';
import './season-chapters.css';
import './journey-context.css';
import './practice.css';
import './pastoral-3d.css';
import './life-ui.css';
import './life-report.css';
import './reference-gallery.css';
import './world-signage.css';
import './journey-rhythm.css';
import './memory-album.css';
import './world-daylight.css';
import './share-preview.css';
import './practice-invitation.css';
import './welcome-entry.css';
import './arrival-seasons.css';
import './zhihu-auth.css';
import './mobile-layout.css';
import {mountMobileViewport} from './mobile-viewport.js';
import {mountDesktopStage} from './desktop-stage.js';
import {createZhihuAuthUI,saveZhihuLoginDraft,restoreZhihuLoginDraft} from './zhihu-auth-ui.js';
import {mountSharePreview} from './share-preview.js';
import {daylightMarkup,mountDaylightSwitch} from './world-daylight.js';
import {getMemoryAlbum} from './memory-album.js';
import {mountMemoryAlbum} from './memory-album-ui.js';
import {renderMemoryCard} from './memory-share.js';
import {mentorAdviceMarkup,inventoryNudge,inventoryNudgeMarkup} from './rhythm-ui.js';
import {inventoryMarkup,companionMarkup,lifeBadgeMarkup,lifeReportMarkup,lifeLedgerMarkup} from './life-ui.js';
import {loadLegacy,claimLegacy} from './life-legacy.js';
import {endingReflectionMarkup,endingReflectionText} from './life-report-view.js';
import {renderShareCard} from './share-card.js';
import {mountScenePreview} from './scene-preview-loader.js';
import {referenceTownMarkup} from './reference-gallery.js';
import {referenceLandmarkId} from './reference-world-plan.js';
import {playCinematic,cancelCinematic,getCinematic} from './cinematics.js';
import './cinematic-player.css';
import './desktop-stage.css';
import {resourceIcon,resourceEffects,summaryChart} from './resource-ui.js';
import {welcomeMarkup,talentDetailsMarkup,resumePromptMarkup,eventMarkup,feedbackMarkup,rulesMarkup,professionalTitle} from './presentation.js';
import {World,fallbackWorld} from './world.js';
import {EVENTS,SEASONS} from './events.js';
import {SOURCES,SOURCE_NOTE} from './sources.js';
import {RULES,newGame,rollDice,land,choose,advance,snapshot,restore,summarize,routeFor,useItem,interactCompanion,purchaseHome,interactBusiness} from './engine.js';
import {narrationKey,narrationLabel,peekNarration,requestNarration,cancelPendingNarrations} from './ai-client.js';
import {eventTheme,arrivalTransition,cancelArrivalTransition,delay} from './transitions.js';
import {JOURNEY_STORAGE_KEY,loadSavedJourney} from './journey-storage.js';
import {LIFE_CHAPTERS,chaptersBetween,playSeasonChapter,cancelSeasonChapter} from './season-chapters.js';
import {createSeasonMusic,SEASON_SCORES} from './season-music.js';
import {journeySourceBookMarkup,collectJourneySources} from './zhihu-context.js';
import {practiceForState} from './practice-scenes.js';
import {practiceEntryMarkup,createPracticeSession,mountPractice} from './practice-ui.js';
import {createInvitationProgress,restoreInvitationProgress,getInvitationPlacement,markInvitationSeen,resolveInvitation} from './practice-invitation.js';
import {fallbackInvitationMarkup} from './practice-invitation-ui.js';
import {INVITATION_PRACTICE_ID,createInvitationPracticeState,getInvitationPracticeScene} from './invitation-practice.js';
import {mountSample} from './sample-ui.js';
import {createSampleState} from './sample-scenario.js';
import {loadMethodCards,methodNotebookMarkup} from './method-cards.js';

const $=s=>document.querySelector(s);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('zh-CN').format(n);
const sign=n=>`${n>0?'+':''}${money(n)}`;
const storageKey=JOURNEY_STORAGE_KEY;
let playerSetup={name:'',talent:'defense'};
try{playerSetup=restoreZhihuLoginDraft(sessionStorage,window.location)||playerSetup;}catch{}
const isPortrait=()=>matchMedia('(orientation: portrait)').matches;
let state=null,busy=false,world,saved=null,sound=true,audioContext,music=null,chapterBusy=false,cinematicAudioActive=false;
let journeyRevision=0,startedAt=Date.now(),elapsedBefore=0,departureTimer=null,autoDepart=true;
let practiceSession=null,unmountPractice=null;
let practiceInvitation=createInvitationProgress(),invitationSession=null,invitationExit=null;
let unmountSample=null;
let townExploring=false;
let disposeDialogMedia=null,shareRevision=0,inheritNext=true;
let inventoryHintTurn=-Infinity;
let memoryPage=0,memoryRun=null;
let entryChecking=false,unsavedJourney=null;
function stopDialogMedia(){shareRevision++;disposeDialogMedia?.();disposeDialogMedia=null;}
function readLegacy(){try{return loadLegacy(localStorage);}catch{return null;}}
function legacyForNext(){return inheritNext?readLegacy():null;}
function legacyBonusText(legacy){return [legacy?.expBonus?`初始专业 +${legacy.expBonus}`:'',legacy?.moodMaxBonus?`初始情绪与上限 +${legacy.moodMaxBonus}`:''].filter(Boolean).join(' · ');}
function settleInheritance(){
  if(state?.phase!=='finished'||!state.life)return null;
  try{return claimLegacy(state,localStorage);}catch{return {claimed:false,reason:'浏览器暂时无法保存下一程积累，本局手记仍可下载。'};}
}
function inheritanceMarkup(result){
  if(!result)return '';
  const saved=result.claimed||result.alreadyClaimed;
  return `<aside class="inheritance-receipt" role="status"><b>${saved?'下一程的积累已收好':'下一程积累'}</b><p>${saved?`${result.legacy.failed?'受挫抗体 · ':''}${escape(legacyBonusText(result.legacy))}。再次出发自动携带；固定保留，不随重复结局叠加。`:escape(result.reason)}</p></aside>`;
}
function mentorPreviewMarkup(){
  if(state?.phase!=='choice'||!state.life?.mentorQuestion)return '';
  return mentorAdviceMarkup(state);
}
function showInventoryHint(){
  const hint=inventoryNudge(state,inventoryHintTurn);if(!hint)return;
  const anchor=$('.decision-area')||$('#next-button');if(!anchor)return;
  anchor.insertAdjacentHTML(anchor.id==='next-button'?'beforebegin':'beforeend',inventoryNudgeMarkup(hint));
  $('[data-open-inventory]').onclick=openInventory;
  inventoryHintTurn=state.turn;
}
function stopPractice(forget=false){unmountPractice?.();unmountPractice=null;if(forget)practiceSession=null;}
function stopSample(){if(!unmountSample)return;const cleanup=unmountSample;unmountSample=null;cleanup();$('.experience').classList.remove('sample-active');updateStats();}
try{saved=loadSavedJourney(localStorage);autoDepart=localStorage.getItem('four-seasons-auto-depart')!=='off';sound=localStorage.getItem('four-seasons-music')!=='off';}catch{}
const svg=name=>{
  const paths={book:'<path d="M3 5c3-1 6-1 9 1v15c-3-2-6-2-9-1zM21 5c-3-1-6-1-9 1v15c3-2 6-2 9-1z"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',wallet:'<path d="M20 8H5a2 2 0 0 1 0-4h14v4M3 6v13a2 2 0 0 0 2 2h15V8M20 12h-6v5h6"/>',leaf:'<path d="M20 3c-9-1-16 2-16 9a7 7 0 0 0 7 7c7 0 10-7 9-16ZM4 21 15 10"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',speaker:'<path d="m11 4-6 5H2v6h3l6 5zM15 8c2 2 2 6 0 8m3-11c4 4 4 10 0 14"/>',mute:'<path d="m11 4-6 5H2v6h3l6 5zM16 9l6 6m0-6-6 6"/>',reset:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',external:'<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',check:'<path d="m5 12 4 4L20 5"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>'};
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.leaf}</svg>`;
};

$('#app').innerHTML=`
<main class="experience" data-stage="welcome">
  ${daylightMarkup()}
  <div id="scene" class="scene" aria-label="四季人生 3D 田园小镇"></div><div class="world-vignette" aria-hidden="true"></div>
  <header class="topbar"><a class="brand" href="/" aria-label="四时人生首页"><span class="brand-mark">知</span><span>知乎四时<small>把经验，走成自己的四季</small></span></a><nav><button id="companion-button" class="nav-button life-nav" aria-label="伴侣：和刘看雨交流、获得支持或查看生活计划" title="伴侣 · 每季交流一次，恢复情绪、增进关系或获得支持" hidden></button><button id="inventory-button" class="nav-button" aria-label="打开行囊" hidden>${svg('wallet')}<span>行囊</span></button><button id="collection-button" class="nav-button" aria-label="打开成就图鉴" hidden>${svg('leaf')}<span>图鉴</span></button><button id="journal-button" class="nav-button" aria-label="打开人生手记">${svg('book')}<span>手记</span></button><button id="rules-button" class="nav-button" aria-label="查看玩法">${svg('leaf')}<span>玩法</span></button><button id="sound-button" class="icon-button" aria-label="开启音乐" title="开启音乐" aria-pressed="false">${svg('mute')}</button></nav></header>
  <section class="status-strip" aria-label="游戏状态"><div class="player-badge"><img src="/characters/idle.gif" alt="刘看山"/><span><b id="player-name">刘看山</b><small id="player-tier">初出茅庐</small></span></div><div class="resource money-resource"><span class="resource-icon">${resourceIcon('coin')}</span><div><span class="eyebrow">储备金</span><strong id="money-value">5,000</strong></div></div><div class="resource mood-resource"><span class="resource-icon">${resourceIcon('heart')}</span><div><span class="eyebrow">情绪</span><strong><span id="mood-value">100</span><i id="mood-max"> / 100</i></strong><div class="mood-track"><span id="mood-fill"></span></div></div></div><div class="resource exp-resource" title="专业底气"><span class="resource-icon">${resourceIcon('star')}</span><div><span class="eyebrow">专业</span><strong id="exp-value">10</strong><div id="exp-stars" aria-hidden="true">✦ ✦ ✦</div></div></div><div class="journey-resource"><span class="eyebrow">路线进度</span><strong id="route-value">0 <i>/ 40 站</i></strong><small>已经历 <b id="round-value">0</b> 段故事</small></div><div id="season-progress" class="season-progress"></div><div class="route-track"><span id="route-fill"></span></div></section>
  <aside id="life-season" class="life-season" aria-label="当前人生阶段"><span id="life-season-name">春</span><div><strong id="life-stage-name">初入社会</strong><small id="season-music-label">点击开始，聆听四季</small></div></aside>
  <div id="season-chapter" hidden></div>
  <div id="resource-effects" class="resource-effects" aria-hidden="true"></div><div id="cinematic-stage" hidden></div><div id="orientation-gate" class="orientation-gate" role="dialog" aria-modal="true" aria-label="请横屏游玩" hidden><div class="rotate-device" aria-hidden="true">↻</div><h2>把世界，横过来看。</h2><p>请旋转手机或平板，继续四季旅程。</p><span>横屏继续</span></div>
  <div id="overlay-shell" class="overlay-shell"><section id="story-panel" class="story-panel" aria-label="生活事件"></section></div>
  <div id="arrival-transition" class="arrival-transition" hidden aria-live="polite"><div class="arrival-shape" aria-hidden="true"></div><span class="arrival-mark" aria-hidden="true"></span><span class="arrival-caption"></span><strong class="arrival-title"></strong></div>
  <div class="travel-status" id="travel-status" role="status"><span class="travel-dot"></span><div><strong id="travel-title">四季已在路上，等你出发。</strong><small id="travel-detail">知乎经验与观点，启发一路选择。</small></div><button id="continue-travel" class="text-button" hidden>继续前行 ${svg('arrow')}</button></div>
  <div class="bottom-tools"><div class="map-controls"><button id="view-follow" class="view-mode-button" aria-pressed="true">跟随</button><button id="view-overview" class="view-mode-button" aria-pressed="false">全图</button><button id="zoom-out" class="icon-button" aria-label="拉远视角">−</button><button id="reset-view" class="icon-button" aria-label="重置视角">${svg('reset')}</button><button id="zoom-in" class="icon-button" aria-label="拉近视角">+</button></div><div class="journey-settings"><label class="auto-setting"><input type="checkbox" id="auto-depart" ${autoDepart?'checked':''}/><span class="toggle-track"></span><span>自动出发</span></label><button id="all-sources" class="text-button">知乎原文 ${svg('external')}</button><span id="save-status" role="status"></span></div></div>
</main>
<dialog id="dialog"><button id="dialog-close" class="dialog-close icon-button" aria-label="关闭">${svg('close')}</button><div id="dialog-content"></div></dialog><div id="toast" class="toast" role="status"></div><span id="announcer" class="sr-only" aria-live="polite"></span>`;

const unmountViewport=mountMobileViewport();
const unmountStage=mountDesktopStage();
function announce(text){$('#announcer').textContent=text;}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),3400);}
function save(){
  if(!state)return !unsavedJourney;
  const record={game:snapshot(state),practiceInvitation,seconds:Math.floor((Date.now()-startedAt)/1000)+elapsedBefore};
  try{localStorage.setItem(storageKey,JSON.stringify(record));unsavedJourney=null;return true;}
  catch{unsavedJourney=record;$('#save-status').textContent='无法保存，请保持页面打开';return false;}
}
const zhihuAuth=createZhihuAuthUI({notify:text=>toast(unsavedJourney?'进度暂存于当前页面，请先允许浏览器存储，不要关闭页面。':text),beforeNavigate:()=>{
  save();
  if(unsavedJourney){
    try{localStorage.setItem(storageKey,JSON.stringify(unsavedJourney));unsavedJourney=null;}
    catch{toast('进度暂未写入，请先允许浏览器存储后再登录。');return false;}
  }
  if(!state&&$('#character-name'))try{saveZhihuLoginDraft(sessionStorage,{name:$('#character-name').value,talent:document.querySelector('input[name="talent"]:checked')?.value||'defense'});}catch{}
}});
function canPlay(){const auth=zhihuAuth.getStatus();return auth.known&&auth.authenticated&&!auth.error&&auth.operation!=='logout';}
function updateLoginEntry(){
  const button=$('#start-full');if(!button)return;
  const auth=zhihuAuth.getStatus(),pending=auth.loading||!!auth.operation||entryChecking;
  button.disabled=pending;button.setAttribute('aria-busy',String(pending));
  button.innerHTML=`走进我的四季 <span>→</span><small>${pending?'正在确认登录…':canPlay()?'40 站 · 约 6–10 分钟':auth.error?'登录暂不可用 · 点击重试':'登录知乎后，开始你的旅程'}</small>`;
}
function pauseForLogin(){
  if(!state&&!unmountSample){
    if($('#dialog').classList.contains('journey-entry-dialog')){
      portraitDialog=false;portraitDialogScroll=0;$('#dialog').close();$('#dialog-content').replaceChildren();
    }
    return;
  }
  const stored=save();
  if(state)playerSetup={name:state.name||'旅人',talent:state.talent||'defense'};
  journeyRevision++;cancelDeparture();cancelPendingNarrations();
  cancelSeasonChapter($('#season-chapter'));cancelCinematic($('#cinematic-stage'));cancelArrivalTransition($('#arrival-transition'));
  stopPractice(true);stopSample();invitationExit=null;invitationSession=null;stopDialogMedia();
  state=null;busy=false;chapterBusy=false;townExploring=false;cinematicAudioActive=false;memoryRun=null;
  portraitDialog=false;portraitDialogScroll=0;
  $('#town-return').hidden=true;$('#dialog').close();$('#dialog-content').replaceChildren();
  if(unsavedJourney)saved=unsavedJourney;
  else try{saved=loadSavedJourney(localStorage);}catch{}
  world?.setCameraMode?.('follow');updateStats();renderStory();
  toast(stored?'请登录知乎后继续，旅程进度已保留。':'进度暂存于当前页面，请先允许浏览器存储，不要关闭页面。');
}
zhihuAuth.subscribe(auth=>{
  if((auth.known&&!auth.authenticated)||auth.error||auth.operation==='logout')pauseForLogin();
  updateLoginEntry();
});
window.addEventListener('zhihu-session-required',()=>{pauseForLogin();void zhihuAuth.refresh();});
void zhihuAuth.refresh();
function tone(kind='step'){if(!sound)return;try{audioContext??=new(window.AudioContext||window.webkitAudioContext)();audioContext.resume();const o=audioContext.createOscillator(),g=audioContext.createGain();o.type='sine';o.frequency.value=kind==='choice'?660:kind==='end'?784:440;g.gain.setValueAtTime(.04,audioContext.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+.18);o.connect(g);g.connect(audioContext.destination);o.start();o.stop(audioContext.currentTime+.2);}catch{}}
function syncMusic(){
  music?.setPaused(cinematicAudioActive||document.hidden||$('#dialog').open||isPortrait()||!state||state.phase==='finished');
}
function setSound(enabled){
  sound=!!enabled;
  try{localStorage.setItem('four-seasons-music',sound?'on':'off');}catch{}
  music?.setEnabled(sound);if(sound)void music?.unlock();syncMusic();
}
function displayMusic(status){
  Object.assign($('#sound-button').dataset,{season:String(status.season),playing:String(status.playing),enabled:String(status.enabled)});
  const audible=status.enabled&&status.unlocked&&!status.blocked;
  $('#sound-button').innerHTML=svg(audible?'speaker':'mute');
  $('#sound-button').setAttribute('aria-pressed',String(audible));
  const label=audible?'关闭音乐':status.enabled&&!status.unlocked?'开启音乐':'开启音乐';
  $('#sound-button').setAttribute('aria-label',label);$('#sound-button').title=label;
  const track=SEASON_SCORES[status.season];
  $('#season-music-label').textContent=!status.supported?'音乐不可用':!status.enabled?'音乐已关闭':status.blocked?'点击音符开启音乐':!status.unlocked?'点击开始，聆听四季':status.paused?'音乐已暂停':`♫ ${track?.name||track?.title||'四季旋律'}`;
}
function updateChapterBadge(index){const chapter=LIFE_CHAPTERS[index];if(!chapter)return;$('#life-season').dataset.season=String(index);$('#life-season-name').textContent=chapter.name;$('#life-stage-name').textContent=chapter.stage;}
async function showChapters(from,to,revision=journeyRevision){
  const chapters=chaptersBetween(from,to);if(!chapters.length){music?.setSeason(to);return true;}
  const current=()=>journeyRevision===revision;
  chapterBusy=true;syncInteraction();
  try{
    for(const index of chapters){
      if(!current())return false;
      setStage('season',`${LIFE_CHAPTERS[index].name} · ${LIFE_CHAPTERS[index].stage}`,'');
      const completed=await playSeasonChapter($('#season-chapter'),index,{isCurrent:current,isPaused:()=>$('#dialog').open||document.hidden||isPortrait(),onEnter:()=>{updateChapterBadge(index);music?.setSeason(index);syncMusic();}});
      if(!completed||!current())return false;
    }
    return true;
  }finally{if(current()){chapterBusy=false;syncInteraction();}}
}
function cancelDeparture(){clearTimeout(departureTimer);departureTimer=null;}
function setStage(stage,title,detail=''){$('.experience').dataset.stage=stage;if(title)$('#travel-title').textContent=title;$('#travel-detail').textContent=detail;syncInteraction();}
function syncInteraction(){
  const hasOverlay=!$('#overlay-shell').hidden,hasDialog=$('#dialog').open,locked=busy||chapterBusy||hasOverlay||hasDialog;
  $('.experience').classList.toggle('overlay-open',hasOverlay);$('.experience').classList.toggle('dialog-open',hasDialog);
  $('#scene').inert=locked;$('#scene').style.pointerEvents=locked?'none':'';
  world?.setInteractionEnabled?.(!locked);
  $('.map-controls').querySelectorAll('button').forEach(button=>button.disabled=locked);
  for(const id of ['inventory-button','companion-button','collection-button'])$('#'+id).disabled=busy||chapterBusy;
  $('#continue-travel').hidden=!(state?.phase==='ready'&&!busy&&!chapterBusy&&(!autoDepart||townExploring)&&!hasDialog);
  syncMusic();
}
function updateStats(){
  const s=state||newGame('full',{name:playerSetup.name.trim()||'旅人'}),station=Math.max(0,s.position+1);
  $('#money-value').textContent=money(s.money);$('#mood-value').textContent=s.mood;$('#mood-max').textContent=` / ${s.moodMax||100}`;$('#mood-fill').style.width=`${s.mood/(s.moodMax||100)*100}%`;
  $('#exp-value').textContent=s.exp;$('#player-name').textContent=s.name||'刘看山';$('#player-tier').textContent=professionalTitle(s.exp);$('#exp-stars').innerHTML=[30,70,150].map(n=>`<span class="${s.exp>=n?'lit':''}">✦</span>`).join(' ');
  $('.money-resource').classList.toggle('low',s.money<=2000);$('.mood-resource').classList.toggle('low',s.mood<=25);
  $('#route-value').innerHTML=`${station} <i>/ ${s.total} 站</i>`;$('#round-value').textContent=s.turn;$('#route-fill').style.width=`${station/s.total*100}%`;
  $('#season-progress').innerHTML=SEASONS.map((season,i)=>`<span class="season-step ${i===s.season?'active':''} ${i<s.season?'done':''}" title="${LIFE_CHAPTERS[i].stage}" style="--season:${season.color}">${season.name}</span>`).join('');
  updateChapterBadge(s.season);
  for(const id of ['inventory-button','companion-button','collection-button'])$('#'+id).hidden=!s.life;
  $('#companion-button').innerHTML=lifeBadgeMarkup(s);
  world?.setState(s);syncInteraction();
}
function showOverlay(html,kind='event',theme='work'){
  const panel=$('#story-panel');panel.className=`story-panel ${kind}-panel`;panel.dataset.theme=theme;panel.innerHTML=html;panel.scrollTop=0;
  $('#overlay-shell').hidden=false;syncInteraction();
}
function hideOverlay(){$('#overlay-shell').hidden=true;$('#story-panel').innerHTML='';syncInteraction();}
function aiCard(kind){return `<section class="ai-reflection" data-ai-kind="${kind}" data-mode="loading" aria-live="polite" aria-busy="true"><div class="ai-reflection-heading"><h3>${kind==='summary'?'知乎直答 · 这一程的启发':'知乎直答 · 刘看山回响'}</h3><span class="ai-reflection-status">正在生成…</span></div><p class="ai-reflection-text">结合本局选择与知乎摘要整理中。</p><small class="ai-reflection-footnote">AI 复盘，不改变结算。</small></section>`;}
function mountNarration(kind){
  const card=document.querySelector(`[data-ai-kind="${kind}"]`);if(!card||!state?.history.length)return;
  const game=snapshot(state),key=narrationKey(kind,game),revision=journeyRevision;
  const fallback=kind==='summary'?`${summarize(state).description}\n这一次，你更常选择${summarize(state).style}。可以把具体取舍留给下一程参考。`:state.history.at(-1).lesson;
  requestNarration(kind,game,fallback).then(result=>{
    const dialog=card.closest('dialog');if(revision!==journeyRevision||!card.isConnected||!state||narrationKey(kind,snapshot(state))!==key||(dialog&&!dialog.open))return;
    card.dataset.mode=result.mode;card.setAttribute('aria-busy','false');card.querySelector('.ai-reflection-status').textContent=narrationLabel(result);card.querySelector('.ai-reflection-text').textContent=result.text;
    if(result.mode==='fallback')card.querySelector('.ai-reflection-footnote').textContent='直答暂不可用，以下为预设回顾。';
  });
}
function sourceButton(event){return `<button class="source-button" id="event-sources" title="相关讨论，不是事件实录"><span class="zhihu-badge">知</span><span>知乎来处</span>${svg('arrow')}</button>`;}

function renderStory(){
  if(!state){
    showOverlay(welcomeMarkup(playerSetup,saved),'welcome');
    setStage('welcome','四季已在路上，等你出发。','知乎经验启发 · 单人生活体验');
    $('.welcome-top .tiny-label').textContent='知乎四时 · 3D 四季田园';
    $('.welcome-top').insertAdjacentHTML('beforeend','<div class="welcome-account-slot" hidden></div>');
    zhihuAuth.mount($('.welcome-account-slot'));
    const legacy=readLegacy();
    if(legacy?.available){$('.welcome-extras').insertAdjacentHTML('afterbegin',`<label class="life-inheritance"><input id="inherit-next" type="checkbox" ${inheritNext?'checked':''}/><span>带上上一程的积累<small>${escape(legacyBonusText(legacy))} · 固定保留，不重复叠加</small></span></label>`);$('#inherit-next').onchange=e=>{inheritNext=e.target.checked;};}
    $('#talent-details').onclick=()=>openDialog(talentDetailsMarkup()+(legacy?.available?`<p class="talent-inheritance-note">上一程的积累：${escape(legacyBonusText(legacy))} · 固定保留，不重复叠加。</p>`:''),'talent-info-dialog');
    $('#start-full').onclick=enterJourney;updateLoginEntry();return;
  }
  if(state.phase==='ready'){
    hideOverlay();setStage('ready',autoDepart?'下一程，出发。':'在这里歇一会儿。',autoDepart?'':'空格 · 继续前行');queueDeparture();return;
  }
  const season=SEASONS[state.season];
  if(state.phase==='choice'){
    const e=state.active,theme=eventTheme(e.kind);
    showOverlay(eventMarkup(state,sourceButton(e)),'event',theme.id);
    setStage('choice',`第 ${state.position+1} 站 · ${e.title}`,'');
    document.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>makeChoice(Number(button.dataset.choice)));$('#event-sources').onclick=()=>openSources(e.sources,e.title);
    $('.event-story').insertAdjacentHTML('beforeend','<button class="event-scene-link" id="look-at-scene">看看这一刻 ↗</button>');$('#look-at-scene').onclick=()=>openScene(e);
    if(state.life?.mentorQuestion)$('.decision-area').insertAdjacentHTML('beforeend',mentorPreviewMarkup());
    showInventoryHint();
    requestAnimationFrame(()=>$('#event-heading')?.focus({preventScroll:true}));return;
  }
  if(state.phase==='feedback'){
    const h=state.history.at(-1);
    const placement=getInvitationPlacement(state,practiceInvitation);
    const practice=placement==='natural'?practiceForState(state):null;
    if(placement==='natural'||placement==='fallback'){
      practiceInvitation=markInvitationSeen(practiceInvitation,placement);save();
    }
    const invitation=placement==='fallback'?fallbackInvitationMarkup():practiceEntryMarkup(practice);
    showOverlay(feedbackMarkup(state,aiCard('event'),autoDepart,invitation),'feedback',eventTheme(state.active?.kind).id);
    // Keep the optional entry above the long feedback/source section so it is
    // actually discoverable on a short landscape screen without scrolling.
    const invitationCard=$('.journey-practice-invitation')||$('.practice-invite');
    if(invitationCard)$('.panel-topline').after(invitationCard);
    setStage('feedback','这一页，已经写下。','');
    $('#next-button').onclick=nextPage;
    showInventoryHint();
    if(practice)$('#practice-open').onclick=openPractice;
    if(placement==='fallback'){
      $('#next-button').hidden=true;
      $('#invitation-skip').onclick=nextPage;
      $('#invitation-practice-open').onclick=()=>openInvitationPractice(false);
    }
    const drawer=$('.reflection-drawer');let requested=false;
    drawer.addEventListener('toggle',()=>{if(drawer.open&&!requested){requested=true;mountNarration('event');}});
    return;
  }
  const report=summarize(state);
  const legacyResult=settleInheritance();
  showOverlay(`<span class="tiny-label">THE JOURNEY WE KEEP</span><img class="ending-mascot" src="/characters/${state.ended==='complete'?'play':'sleep'}.gif" alt="陪伴你的刘看山"/><span class="ending-tag">${state.ended==='complete'?'四季通关':'旅程暂歇'}</span><h2>${escape(report.title)}</h2><p class="intro-copy">${escape(report.titleReason||report.description)}</p><button id="view-summary" class="primary">翻开我的四季回忆 ${svg('book')}</button><button id="new-journey" class="secondary">再走一程 ${svg('reset')}</button>`,'ended');
  $('#story-panel').classList.toggle('unfinished-ending',state.ended!=='complete');
  $('#new-journey').insertAdjacentHTML('beforebegin',inheritanceMarkup(legacyResult));
  $('.ending-tag').textContent=state.ended==='complete'?(state.mode==='demo'?'快速体验完成':'四季通关'):'未竟之书 · 旅程暂歇';
  setStage('finished','走过的路，已经被好好收藏。',`抵达 ${state.position+1} / ${state.total} 站 · 留下 ${state.turn} 段经历`);
  $('#view-summary').onclick=openSummary;$('#new-journey').onclick=()=>start(state.mode);
}

async function enterJourney(){
  if(state||busy||entryChecking||isPortrait())return;
  entryChecking=true;updateLoginEntry();
  try{if(!await zhihuAuth.ensureAuthenticated()||state||isPortrait())return;}
  finally{entryChecking=false;updateLoginEntry();}
  const begin=()=>{
    playerSetup={name:$('#character-name').value.trim()||'旅人',talent:document.querySelector('input[name="talent"]:checked')?.value||'defense'};
    closeDialog();start('full');
  };
  // One welcome entry, without silently replacing an existing journey. Read
  // again on entry so a recently changed save is not mistaken for a new game.
  if(unsavedJourney)saved=unsavedJourney;else try{saved=loadSavedJourney(localStorage);}catch{}
  const previous=saved&&restore(saved.game);
  if(!previous){begin();return;}
  openDialog(resumePromptMarkup(previous),'journey-entry-dialog');
  $('#resume').onclick=()=>{closeDialog();resumeJourney();};
  $('#start-new-journey').onclick=begin;
}
async function start(mode){
  const entryRevision=journeyRevision;
  if(!await zhihuAuth.ensureAuthenticated()||entryRevision!==journeyRevision||isPortrait())return;
  practiceInvitation=createInvitationProgress();invitationSession=null;invitationExit=null;
  inventoryHintTurn=-Infinity;
  townExploring=false;$('#town-return').hidden=true;selectCamera('follow');
  stopSample();
  stopPractice(true);
  journeyRevision++;cancelSeasonChapter($('#season-chapter'));chapterBusy=false;
  cancelCinematic($('#cinematic-stage'));cancelPendingNarrations();cancelDeparture();cancelArrivalTransition($('#arrival-transition'));
  state=newGame(mode,{...playerSetup,enriched:true,legacy:legacyForNext()});busy=true;startedAt=Date.now();elapsedBefore=0;music?.setSeason(0);
  save();updateStats();hideOverlay();
  // Release the welcome pause before asynchronous audio unlocking, while still
  // inside the start button's user gesture. Otherwise suspend can race resume.
  void music?.unlock();
  const revision=journeyRevision;
  void showChapters(-1,0,revision).catch(()=>{if(journeyRevision===revision)toast('章节暂未展示，旅程可以继续。');}).finally(()=>{if(journeyRevision!==revision)return;busy=false;renderStory();});
  announce('旅程开始。春，初入社会。');
}
async function resumeJourney(){
  const entryRevision=journeyRevision;
  if(!await zhihuAuth.ensureAuthenticated()||entryRevision!==journeyRevision||!saved||isPortrait())return;
  townExploring=false;$('#town-return').hidden=true;selectCamera('follow');
  stopSample();
  stopPractice(true);
  journeyRevision++;cancelSeasonChapter($('#season-chapter'));chapterBusy=false;cancelCinematic($('#cinematic-stage'));cancelPendingNarrations();cancelDeparture();cancelArrivalTransition($('#arrival-transition'));
  state=restore(saved.game);playerSetup={name:state.name||'刘看山',talent:state.talent||'defense'};busy=false;music?.setSeason(state.season);
  practiceInvitation=restoreInvitationProgress(saved.practiceInvitation,state);invitationSession=null;invitationExit=null;
  elapsedBefore=Number.isFinite(saved.seconds)?saved.seconds:0;startedAt=Date.now();updateStats();renderStory();
  if(state.phase==='finished')openSummary();else void music?.unlock();
}
function queueDeparture(){cancelDeparture();if(!canPlay()||state?.phase!=='ready'||busy||chapterBusy||townExploring||!autoDepart||$('#dialog').open||document.hidden||isPortrait())return;departureTimer=setTimeout(()=>{departureTimer=null;depart();},600);}
async function waitForClear(revision){while(journeyRevision===revision&&($('#dialog').open||document.hidden||isPortrait()))await delay(80);return journeyRevision===revision;}
async function depart(manual=false){
  if(!canPlay()){pauseForLogin();return;}
  if(!state||state.phase!=='ready'||busy||chapterBusy||$('#dialog').open||document.hidden||isPortrait()||(!manual&&(!autoDepart||townExploring)))return;
  townExploring=false;$('#town-return').hidden=true;
  cancelDeparture();busy=true;hideOverlay();const revision=journeyRevision,begin=state,current=()=>journeyRevision===revision;
  const die=rollDice(()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296);
  try{
    setStage('preparing','把小镇准备好，旅程马上开始。','正在整理场景与行装。');await world.ready;if(!current())return;
    setStage('casting','准备投掷，看看生活会把你带去哪里。','刘看山正在投出六面骰子。');tone();
    if(!await waitForClear(revision))return;selectCamera('follow',{immediate:false});await world.throwDice(die);if(!current())return;
    setStage('landed',`骰子落地，${die} 点。`,'途经的格子只是风景，最终落点才触发故事。');await delay(matchMedia('(prefers-reduced-motion: reduce)').matches?0:240);
    if(!await waitForClear(revision))return;setStage('walking','沿着道路，走向下一段生活。',`前行 ${Math.min(die,begin.total-begin.position-1)} 站 · 还没有需要回答的问题`);
    await world.walk(begin,die);if(!current())return;
    state=land(begin,die);save();updateStats();
    if(!await showChapters(begin.season,state.season,revision)||!current())return;
    if(!await waitForClear(revision))return;setStage('arriving','脚步停下，一个故事刚好发生。','先到达，再作选择。');await world.arrive?.(state);if(!current())return;
    if(!await waitForClear(revision))return;setStage('transition','这一站，有新的生活片段。','');await arrivalTransition($('#arrival-transition'),state.active.kind,current,{season:state.active.season??state.season,isPaused:()=>$('#dialog').open||document.hidden||isPortrait()});
    if(!await waitForClear(revision))return;
    if(getCinematic(state.active.cinematicId||'')){
      setStage('cinematic',state.active.location||state.active.title,'');
      await playCinematic($('#cinematic-stage'),state.active.cinematicId,{
        isCurrent:current,isPaused:()=>$('#dialog').open||document.hidden||isPortrait(),
        isSoundEnabled:()=>sound,onSoundToggle:()=>setSound(!sound),
        onAudioChange:active=>{cinematicAudioActive=active;syncMusic();},
      });
      if(!current()||!await waitForClear(revision))return;
    }
    busy=false;renderStory();announce(`掷出 ${die} 点，已抵达第 ${state.position+1} 站，${state.active.title}。现在可以作出选择。`);
  }catch(error){
    if(!current())return;busy=false;chapterBusy=false;cancelCinematic($('#cinematic-stage'));cancelSeasonChapter($('#season-chapter'));cancelArrivalTransition($('#arrival-transition'));toast('场景暂未完成，进度已保留。');
    if(state.phase==='ready'){autoDepart=false;$('#auto-depart').checked=false;}renderStory();console.warn('旅途动画暂不可用：',error?.message||'unknown');
  }finally{if(current())syncInteraction();}
}
function makeChoice(index){if(!canPlay()){pauseForLogin();return;}if(busy||state?.phase!=='choice'||$('#dialog').open||isPortrait())return;try{state=choose(state,index);}catch(error){toast(error.message||'这个选项暂不可用');return;}tone('choice');save();updateStats();renderStory();resourceEffects(state.history.at(-1));announce(`选择已结算。资金 ${state.money}，情绪 ${state.mood}，专业 ${state.exp}。`);}
function nextPage(){if(!canPlay()){pauseForLogin();return;}if(state?.phase!=='feedback'||busy||$('#dialog').open)return;practiceInvitation=resolveInvitation(practiceInvitation);stopPractice(true);state=advance(state);save();updateStats();renderStory();if(state.phase==='finished'){tone('end');openSummary();}}

function openDialog(html,kind='standard') {invitationExit=null;stopDialogMedia();stopSample();stopPractice();cancelDeparture();const dialog=$('#dialog');dialog.className=kind;$('#dialog-content').innerHTML=html;if(!dialog.open)dialog.showModal();dialog.scrollTop=0;syncInteraction();}
function closeDialog(){if(invitationExit){const exit=invitationExit;invitationExit=null;exit();return;}stopDialogMedia();$('#dialog').close();}
function changeLife(action,reopen){
  if(!canPlay()){pauseForLogin();return;}
  if(busy||chapterBusy||!state?.life||state.ended)return;
  const before=state;
  try{const changed=action(state);state=changed;stopPractice(true);cancelPendingNarrations();save();updateStats();renderStory();resourceEffects({moneyDelta:state.money-before.money,moodDelta:state.mood-before.mood,expDelta:state.exp-before.exp});reopen();const note=state.life.notices?.at(-1);if(note&&note!==state.life.companion?.lastMessage)$('#dialog-content').insertAdjacentHTML('afterbegin',`<p class="life-action-notice" role="status">${escape(note)}</p>`);}catch(error){toast(error.message||'现在还不能这样做。');}
}
function openInventory(){if(!state?.life||busy||chapterBusy)return;openDialog(inventoryMarkup(state),'inventory-dialog');document.querySelectorAll('[data-use-item]').forEach(b=>b.onclick=()=>changeLife(s=>useItem(s,b.dataset.useItem),openInventory));}
function openCompanion(){if(!state?.life||busy||chapterBusy)return;openDialog(companionMarkup(state),'companion-dialog');document.querySelectorAll('[data-companion]').forEach(b=>b.onclick=()=>changeLife(s=>interactCompanion(s,b.dataset.companion),openCompanion));document.querySelectorAll('[data-business]').forEach(b=>b.onclick=()=>changeLife(s=>interactBusiness(s,b.dataset.business),openCompanion));if($('#purchase-home'))$('#purchase-home').onclick=()=>changeLife(purchaseHome,openCompanion);}
function openCollection(){if(!state?.life||busy||chapterBusy)return;openDialog(`<span class="tiny-label">旅途图鉴</span><h2>慢慢长出的印记</h2>${lifeReportMarkup(state,{compact:true})}`,'collection-dialog');}
function openScene(event,{fromTown=false,character=false}={}){
  // All forty entries share the finished scene view and map navigation.
  openDialog(`<span class="tiny-label">${character?'看山形象':`${SEASONS[event.season].name} · 第 ${event.number} 站`}</span><h2>${escape(character?'你好，我是刘看山。':event.location||event.title)}</h2>${character?'':`<div class="scene-view-tabs" role="group" aria-label="场景操作"><button data-scene-view="scene" aria-pressed="true">走进场景</button><button id="scene-on-map">地图位置 ↗</button></div>`}<div class="scene-preview" id="scene-preview"></div><div class="scene-toolbar">${fromTown?'<button class="secondary" id="back-to-town">返回小镇</button>':`<button class="secondary" id="scene-sources">知乎依据 ↗</button>`}</div>`,'scene-dialog');
  let stopPreview=mountScenePreview($('#scene-preview'),event,{view:character?'character':'scene'});
  disposeDialogMedia=()=>{stopPreview();};
  document.querySelectorAll('[data-scene-view]').forEach(button=>button.onclick=()=>button.setAttribute('aria-pressed','true'));
  if($('#scene-on-map'))$('#scene-on-map').onclick=()=>focusTownLandmark(referenceLandmarkId(event.number),event.location);
  if($('#back-to-town'))$('#back-to-town').onclick=()=>openTown(event.season);
  if($('#scene-sources'))$('#scene-sources').onclick=()=>openSources(event.sources,event.title);
}
async function openShareCard({legacy=false}={}){
  if(!state?.history.length)return;
  const report=!!state.ended,memories=report&&!legacy,title=memories?'把这一程，留成四季回忆':report?'把这一程，留成人生长图':'留下一张四季明信片';
  openDialog(`<section class="share-view share-loading"><header class="share-header"><h2>${title}</h2></header><p id="share-progress" role="status">正在绘制…</p></section>`,'share-dialog');const revision=shareRevision;
  try{
    const {blob,data}=await (memories?renderMemoryCard:renderShareCard)(state,{url:location.href});if(revision!==shareRevision||!$('#dialog').open)return;
    const url=URL.createObjectURL(blob);disposeDialogMedia=()=>URL.revokeObjectURL(url);
    const unmount=mountSharePreview($('#dialog-content'),{title,url,
      alt:memories?'本局3D场景留影、实际四季选择和知乎方法来源的分享卡':report?'本局资源雷达、称号、10 个选择点回溯与知乎来源的竖版人生报告':'本局经历与一个人生难题的竖版明信片',
      caption:`${data.publicUrl?'扫码打开游戏，走进你的四季。':'本机试玩：二维码只分享题目，不是外网试玩地址。'}${data.missingImages?.length?' 部分画面未载入，已保留文字回忆。':''}`,
      filename:`知乎四时-${memories?'四季回忆':report?'人生长图':'四季明信片'}.png`,
      downloadLabel:memories?'下载四季分享卡':report?'下载人生长图':'下载明信片',
      backLabel:memories?'返回回忆册':'返回手记',onBack:state.ended?(legacy?openDetailedSummary:openSummary):openJournal});
    disposeDialogMedia=()=>{unmount();URL.revokeObjectURL(url);};
  }catch(error){if(revision===shareRevision&&$('#share-progress'))$('#share-progress').textContent=error.message||'暂时无法生成图片，文字手记仍可下载。';}
}
function focusTownLandmark(id,title){
  if(!world?.focusLandmark){toast('当前浏览器未能启用 3D 地图，旅程仍可继续。');return;}
  if(!world.focusLandmark(id)){toast('建筑还在准备中，请稍后再试。');return;}
  townExploring=true;cancelDeparture();closeDialog();
  hideOverlay();
  $('#town-return').hidden=false;$('#town-return').textContent=state?'返回我的旅程 →':'返回出发页 →';
  $('#view-follow').setAttribute('aria-pressed','false');$('#view-overview').setAttribute('aria-pressed','false');
  setStage('explore',title,'');
}
function openTown(selectedSeason){
  if(busy||chapterBusy||isPortrait())return;
  if(!world?.focusLandmark){toast('当前为轻量备用模式；3D 地标需要支持 WebGL 的浏览器。');return;}
  // Preserve the draft form before preview removes its DOM. No game/save starts.
  if(!state&&$('#character-name'))playerSetup={name:$('#character-name').value,talent:document.querySelector('input[name="talent"]:checked')?.value||'defense'};
  const season=Number.isInteger(selectedSeason)?selectedSeason:(state?.active?.season??state?.history?.at(-1)?.season??0);
  openDialog(referenceTownMarkup(season),'town-dialog');
  document.querySelectorAll('[data-town-season]').forEach(button=>button.onclick=()=>openTown(Number(button.dataset.townSeason)));
  document.querySelectorAll('[data-visit-cell]').forEach(button=>button.onclick=()=>openScene(EVENTS[Number(button.dataset.visitCell)-1],{fromTown:true}));
  $('#view-character-reference').onclick=()=>openScene({number:0,season,title:'刘看山',location:'刘看山'},{fromTown:true,character:true});
}
function openSample(){
  if(!canPlay())return;
  if(isPortrait())return;
  openDialog('','sample-dialog');$('.experience').classList.add('sample-active');
  world?.setState(createSampleState());
  unmountSample=mountSample($('#dialog-content'),{onClose:closeDialog});
}
function openMethodNotebook(){let cards=[];try{cards=loadMethodCards(localStorage);}catch{}openDialog(methodNotebookMarkup(cards),'methods-dialog');}
function openPractice(){
  const scene=practiceForState(state);if(!scene||busy||isPortrait())return;
  if(!practiceSession)practiceSession=createPracticeSession(snapshot(state),state.history.at(-1),scene);
  openDialog('','practice-dialog');
  unmountPractice=mountPractice($('#dialog-content'),practiceSession,{onClose:closeDialog});
}
function openInvitationPractice(fromMemory=false){
  if(!state||busy||isPortrait()||!practiceInvitation.seen||practiceInvitation.resolved)return;
  // Accepting consumes this optional invitation, even if the player closes the
  // dialog. Neither this preset nor its messages enter the real journey.
  practiceInvitation=resolveInvitation(practiceInvitation);save();
  if(!fromMemory)renderStory();
  const preset=createInvitationPracticeState(),scene=getInvitationPracticeScene();
  invitationSession=createPracticeSession(undefined,preset.history.at(-1),scene);
  invitationSession.rehearsal={id:INVITATION_PRACTICE_ID};
  openDialog('','practice-dialog invitation-practice-dialog');
  invitationExit=()=>{invitationSession=null;if(fromMemory)openSummary();else closeDialog();};
  unmountPractice=mountPractice($('#dialog-content'),invitationSession,{
    onClose:closeDialog,
    headingLabel:'刘看山陪你练 · 独立假设情境',
    contextLabel:'假设你已整理时间线，正在回应同事质疑。这是独立练习，不是本局刚发生的事。',
    exitLabel:session=>`${session.done?'收好提醒':'跳过练习'}，${fromMemory?'回到回忆册':'继续旅行'} →`,
  });
}
function openRules(){openDialog('<div class="rules-account-slot" hidden></div>'+rulesMarkup());zhihuAuth.mount($('.rules-account-slot'));void zhihuAuth.refresh();}
function sourceCard(id){const source=SOURCES[id];if(!source)return '';return `<article class="source-card"><span class="tiny-label">${escape(source.scope)}</span><a href="${source.url}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ${svg('external')}</a><span class="source-author">${source.sourceKind==='question'?'问题页':'知乎作者'} · ${escape(source.author||'作者待核对')}</span><p>${escape(source.idea)}</p><details class="source-detail-note"><summary>查看证据与核对片段</summary><p>${escape(source.evidence||'CLI 搜索片段，未读取完整原文')}</p>${source.excerpt?`<p>核对原句：${escape(source.excerpt)}</p>`:''}<small>整理日期 ${escape(source.checkedAt||'2026-09-08')} · 不代表事件实录</small></details><button class="text-button find-more" data-source="${id}">检索更多 ${svg('arrow')}</button><div id="more-${id}" class="more-results"></div></article>`;}
function openSources(ids=[...new Set(EVENTS.flatMap(event=>event.sources))],title='四季背后的知乎讨论'){
  ids=[...new Set(ids)].filter(id=>SOURCES[id]);
  openDialog(`<span class="tiny-label">知乎原文 · 经验有来处</span><h2>${escape(title)}</h2><p class="dialog-intro">${ids.length} 条独立来源 · 不同地点可能参考同一篇讨论。核对范围见各条详情。</p><div class="source-list">${ids.map(sourceCard).join('')}</div><details class="source-detail-note"><summary>来源核对与改编说明</summary><p>${SOURCE_NOTE}</p><p>原文可能更新；相关检索不会改写本局规则。</p></details>`,'sources-dialog');
  document.querySelectorAll('.find-more').forEach(button=>button.onclick=async()=>{
    const id=button.dataset.source,target=$(`#more-${id}`);button.disabled=true;button.textContent='正在检索知乎…';
    try{const response=await fetch(`/api/experience?source=${encodeURIComponent(id)}`,{signal:AbortSignal.timeout(15000)});if(response.status===401){pauseForLogin();void zhihuAuth.refresh();throw new Error();}if(!response.ok)throw new Error();const body=await response.json();if(!target.isConnected)return;
      target.innerHTML=`<small>${body.mode==='live'?'刚刚检索到的知乎内容':body.mode==='cache'?'近期检索结果':'实时检索暂不可用，展示已整理的参考来源'}</small>`+(body.items||[]).map(item=>{let url;try{url=new URL(item.url);}catch{return '';}if(url.protocol!=='https:'||!['www.zhihu.com','zhuanlan.zhihu.com'].includes(url.hostname))return '';return `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${escape(item.title)}<span>${escape(item.author)} ${svg('external')}</span></a>`;}).join('');button.textContent='重新检索';
    }catch{if(target.isConnected)target.textContent='暂时无法实时检索，上方原文仍可直接查看。';button.textContent='重试检索';}finally{button.disabled=false;}
  });
}
function openTile(index){if(busy||!$('#overlay-shell').hidden||$('#dialog').open)return;const e=EVENTS[index];if(e)openScene(e);}
function historyMarkup(){if(!state?.history.length)return '<div class="empty-note">还没有写下的故事，就从第一段旅途开始。</div>';return `<div class="history-list">${state.history.map(h=>`<article class="history-entry"><span class="history-number" style="background:${SEASONS[h.season].tint};color:${SEASONS[h.season].color}">${String(h.turn).padStart(2,'0')}</span><div><small>${SEASONS[h.season].name} · 掷出 ${h.die} 点</small><h3>${escape(h.title)}</h3><p>${escape(h.choiceLabel)}</p><div class="history-deltas"><span class="${h.moneyDelta>=0?'positive':'negative'}">资金 ${sign(h.moneyDelta)}</span><span class="${h.moodDelta>=0?'positive':'negative'}">情绪 ${sign(h.moodDelta)}</span><span>专业 ${sign(h.expDelta||0)}</span></div><p class="history-lesson">${escape(h.lesson)}</p><div class="history-source-links">${h.sources.map(id=>`<a href="${SOURCES[id].url}" target="_blank" rel="noopener noreferrer">知乎 · ${escape(SOURCES[id].author)} ↗</a>`).join('')}</div></div></article>`).join('')}</div>`;}
function openJournal(){if(state?.phase==='finished'){openSummary();return;}openDialog(`<span class="tiny-label">我的知乎经验旅程</span><h2>每一步，都有来处。</h2><p class="muted">${state?`${state.turn} 段经历 · ${collectJourneySources(state.history).length} 篇相关知乎原文`:'从第一步开始，收集属于你的生活经验。'}</p><button id="method-notebook" class="text-button">我的方法卡 →</button>${journeySourceBookMarkup(state?.history||[])}${historyMarkup()}`,'journal-dialog');$('#method-notebook').onclick=openMethodNotebook;}
function openSummary(){
  if(!state?.ended)return;
  const showPractice=getInvitationPlacement(state,practiceInvitation)==='ending'||(practiceInvitation.kind==='ending'&&!practiceInvitation.resolved);
  if(showPractice){practiceInvitation=markInvitationSeen(practiceInvitation,'ending');save();}
  if(memoryRun!==state){memoryRun=state;memoryPage=0;}
  const album=getMemoryAlbum(state),legacyResult=settleInheritance();
  openDialog('','memory-dialog');
  disposeDialogMedia=mountMemoryAlbum($('#dialog-content'),album,{index:memoryPage,onPage:index=>{memoryPage=index;},
    practiceInvitation:showPractice,onPractice:()=>openInvitationPractice(true),
    onDetails:openDetailedSummary,onShare:()=>openShareCard(),onDownload:downloadNote,
    onRestart:()=>{const mode=state.mode;closeDialog();start(mode);},inheritance:inheritanceMarkup(legacyResult)});
}
function openDetailedSummary(){
  if(!state?.ended)return;const report=summarize(state),cost=report.highestCost,drain=report.biggestDrain;
  const legacyResult=settleInheritance();
  openDialog(`<div class="report-hero"><div><span class="tiny-label">把知乎经验，留给下一程</span><span class="report-badge">${state.ended==='complete'?'四季通关':'旅程暂歇'} · ${state.mode==='demo'?'快速体验':'完整旅程'}</span><h2>${escape(report.title)}</h2><p>${escape(report.titleReason||report.description)}</p></div><img src="/characters/${state.ended==='complete'?'wave':'sleep'}.gif" alt="刘看山陪你回看旅程"/></div><div class="report-numbers"><div><span>剩余资金</span><strong>¥ ${money(state.money)}</strong></div><div><span>剩余情绪</span><strong>${state.mood}<small> / ${state.moodMax||100}</small></strong></div><div><span>专业底气</span><strong>${state.exp}<small> ${professionalTitle(state.exp)}</small></strong></div></div>${summaryChart(state)}${endingReflectionMarkup(state)}<p class="report-route">抵达 ${state.position+1} / ${state.total} 站 · ${state.history.length} 段经历</p><div class="report-observation"><span>${report.keyChoices.length?'这一次，你更常选择':'这次旅程留下的记录'}</span><b>${escape(report.style)}</b><p>只记录本局选择，不评判真实人生。</p></div>${aiCard('summary')}${journeySourceBookMarkup(state.history)}<details class="report-fold"><summary>钱与精力，去了哪里？</summary><div class="report-takeaways"><article><span>事件中最大一笔净支出</span><p>${cost&&cost.moneyDelta<0?`「${escape(cost.title)}」：${money(-cost.moneyDelta)}。当时你选择了${escape(cost.choiceLabel)}。`:'本局没有净支出回合。'}</p></article><article><span>最消耗精力的一刻</span><p>${drain&&drain.moodDelta<0?`「${escape(drain.title)}」消耗 ${-drain.moodDelta} 点情绪。${escape(drain.lesson)}`:'你给恢复留了空间。'}</p></article></div></details><details class="report-fold"><summary>翻开我的手记 · ${state.history.length} 页</summary>${historyMarkup()}</details><div class="report-actions"><button id="download-note" class="primary">${svg('download')}下载我的手记</button><button id="report-restart" class="secondary">再走一程 ${svg('reset')}</button></div><p class="source-note">${SOURCE_NOTE} 手记不预测真实人生。</p>`,'report-dialog');
  $('.report-actions').insertAdjacentHTML('beforebegin',lifeReportMarkup(state)+lifeLedgerMarkup(state));
  $('.report-actions').insertAdjacentHTML('afterbegin','<button id="share-card" class="primary">导出完整人生长图 ↗</button>');$('#share-card').onclick=()=>openShareCard({legacy:true});
  $('#dialog-content').insertAdjacentHTML('afterbegin','<button id="back-to-memories" class="secondary">← 返回四季回忆</button>');$('#back-to-memories').onclick=openSummary;
  $('.report-actions').insertAdjacentHTML('afterend',inheritanceMarkup(legacyResult));
  $('#dialog').classList.toggle('unfinished-report',state.ended!=='complete');
  $('#download-note').onclick=downloadNote;$('#report-restart').onclick=()=>{const mode=state.mode;closeDialog();start(mode);};mountNarration('summary');
}
function downloadNote(){
  const report=summarize(state),narration=peekNarration('summary',snapshot(state));
  const activities=report.life?.transactions?.length?'\n\n行囊与生活计划 · 独立行动账\n'+report.life.transactions.map(t=>`第 ${t.turn} 次停靠 · ${t.title}\n${t.result}\n变化：资金 ${sign(t.moneyDelta)}，情绪 ${sign(t.moodDelta)}，专业 ${sign(t.expDelta)}`).join('\n\n'):'';
  const text=`四时人生 · 我的生活手记\n${report.title}\n${report.titleReason||report.description}\n${(report.commemorations||[]).map(item=>`纪念 · ${item.name}：${item.reason}`).join('\n')}\n\n模式：${state.mode==='demo'?'快速体验':'完整旅程'}\n结局：${state.ended==='complete'?'四季通关':state.ended==='money'?'资金耗尽':state.ended==='mood'?'情绪耗尽':'资金与情绪耗尽'}\n资金：${state.money} / 初始 ${RULES.money}\n情绪：${state.mood} / 上限 ${state.moodMax||100}\n专业：${state.exp} / 初始 ${RULES.exp+(state.life?.legacyBonus?.exp??(state.life?.legacyProof?5:0))}\n角色：${state.name||'刘看山'}\n路线：${state.position+1} / ${state.total} 站\n实际停靠：${state.turn} 处\n分叉选择：${report.keyChoices.length} 次\n更常选择：${report.style}\n\n`+state.history.map(h=>`${h.turn}. ${SEASONS[h.season].name} · ${h.title}\n选择：${h.choiceLabel}\n结果：${h.result}\n净变化：资金 ${sign(h.moneyDelta)}，情绪 ${sign(h.moodDelta)}，专业 ${sign(h.expDelta||0)}\n经验：${h.lesson}\n来源：\n${h.sources.map(id=>`${SOURCES[id].title} / ${SOURCES[id].author}\n${SOURCES[id].url}`).join('\n')}`).join('\n\n')+`\n\n刘看山陪你回看这一程\n${narration?`${narrationLabel(narration)}\n${narration.text}`:'AI 总结尚未生成，以上手记已完整保留本局选择和结算。'}\n\nAI 只补充叙事与反思，不改变游戏数值，也不预测现实人生。\n${SOURCE_NOTE}\n生成日期：${new Date().toLocaleDateString('zh-CN')}\n`;
  const blob=new Blob(['\uFEFF'+text,activities,'\n\n'+endingReflectionText(state)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='四时人生-我的生活手记.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('手记已交给浏览器下载');
}

$('#journal-button').onclick=openJournal;$('#rules-button').onclick=openRules;$('#all-sources').onclick=()=>openSources();$('#dialog-close').onclick=closeDialog;
$('#inventory-button').onclick=openInventory;$('#companion-button').onclick=openCompanion;$('#collection-button').onclick=openCollection;
$('#dialog').addEventListener('close',()=>{if(!portraitDialog&&!$('#dialog').open){stopDialogMedia();stopPractice();stopSample();}syncInteraction();queueDeparture();});
$('#dialog').addEventListener('cancel',event=>{if(invitationExit){event.preventDefault();closeDialog();}});
$('#dialog').addEventListener('click',event=>{if(event.target===$('#dialog')){const bounds=event.target.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeDialog();}});
$('#auto-depart').onchange=event=>{autoDepart=event.target.checked;try{localStorage.setItem('four-seasons-auto-depart',autoDepart?'on':'off');}catch{}cancelDeparture();if(state?.phase==='ready'&&!busy)renderStory();else syncInteraction();toast(autoDepart?'自动出发已开启':'已暂停下一次自动出发；准备好时可按空格前行');};
$('#continue-travel').onclick=()=>depart(true);
document.addEventListener('keydown',event=>{if(event.code!=='Space'||event.repeat||event.target.closest?.('button,a,input,textarea,select,[contenteditable="true"]')||$('#dialog').open)return;if(state?.phase==='ready'&&!busy){event.preventDefault();depart(true);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelDeparture();else void zhihuAuth.refresh().then(()=>queueDeparture());syncMusic();});
$('#sound-button').onclick=()=>{
  const status=music?.getStatus();setSound(!(status?.enabled&&status.unlocked&&!status.blocked));
};
function selectCamera(mode,options){world.setCameraMode(mode,options);$('#view-follow').setAttribute('aria-pressed',String(mode==='follow'));$('#view-overview').setAttribute('aria-pressed',String(mode==='overview'));}
$('.map-controls').insertAdjacentHTML('beforeend','<button id="town-gallery" class="view-mode-button">小镇地标</button>');
$('.experience').insertAdjacentHTML('beforeend','<button id="town-return" class="secondary" hidden>返回出发页 →</button>');
$('#town-gallery').onclick=openTown;
$('#town-return').onclick=()=>{townExploring=false;$('#town-return').hidden=true;selectCamera('follow');renderStory();};
$('#view-follow').onclick=()=>selectCamera('follow');$('#view-overview').onclick=()=>selectCamera('overview');$('#zoom-in').onclick=()=>world.zoom(.15);$('#zoom-out').onclick=()=>world.zoom(-.15);$('#reset-view').onclick=()=>{world.resetView();const mode=$('#scene').dataset.cameraMode;$('#view-follow').setAttribute('aria-pressed',String(mode==='follow'));$('#view-overview').setAttribute('aria-pressed',String(mode==='overview'));};
window.addEventListener('beforeunload',save);
window.addEventListener('pagehide',event=>{
  if(event.persisted){music?.setPaused(true);return;}
  unmountStage();unmountViewport();
  zhihuAuth.dispose();
  stopPractice(true);
  stopSample();
  stopDialogMedia();
  cancelCinematic($('#cinematic-stage'));cancelSeasonChapter($('#season-chapter'));cancelArrivalTransition($('#arrival-transition'));music?.dispose();world?.dispose?.();audioContext?.close().catch(()=>{});
});
window.addEventListener('pageshow',event=>{if(event.persisted){cancelDeparture();void zhihuAuth.refresh().then(()=>{syncMusic();queueDeparture();});}});
music=createSeasonMusic({enabled:sound,volume:.18,onStatusChange:displayMusic});
try{world=new World($('#scene'),openTile);}catch(error){console.warn('3D 场景暂不可用，使用地点列表。',error.message);world=fallbackWorld($('#scene'),openTile);}
const disposeDaylightSwitch=mountDaylightSwitch($('.daylight-switch'),world);
window.addEventListener('pagehide',disposeDaylightSwitch,{once:true});
updateStats();renderStory();
let portraitDialog=false,portraitDialogScroll=0;
function syncOrientation(){
  const blocked=isPortrait(),dialog=$('#dialog');$('#orientation-gate').hidden=!blocked;
  if(blocked&&dialog.open){portraitDialog=true;portraitDialogScroll=dialog.scrollTop;dialog.close();}
  for(const selector of ['#scene','.topbar','.daylight-switch','.status-strip','#overlay-shell','.bottom-tools','#travel-status','#cinematic-stage','#season-chapter','#dialog','#town-return'])$(selector).inert=blocked;
  if(blocked)cancelDeparture();else {if(portraitDialog){portraitDialog=false;dialog.showModal();dialog.scrollTop=portraitDialogScroll;}queueDeparture();}
  syncInteraction();
}
window.addEventListener('resize',syncOrientation);syncOrientation();
