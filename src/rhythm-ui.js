import {getInventory} from './life-systems.js';
import {fatigueStatus,hasRhythm} from './journey-rhythm.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function fatigueMarkup(state,{always=false,feedback=false}={}){
  const status=fatigueStatus(state);if(!status)return '';
  const notes=feedback?state.history.at(-1)?.talentNote||'':'';
  const recovering=notes.includes('节奏放缓');
  if(status.level==='low'&&!always&&!recovering)return '';
  return `<aside class="rhythm-status" data-level="${status.level}"><span aria-hidden="true">${recovering?'☘':'◌'}</span><b>${recovering?'缓过来一些':status.label}</b><span>${feedback&&notes.includes('累积疲惫：')?'连续忙碌，额外消耗了心力。':recovering?'这一刻的放慢，也算前进。':status.hint}</span></aside>`;
}

export function mentorAdviceMarkup(state){
  if(!state.life?.mentorQuestion)return '';
  // Even older journals may contain the former numeric-preview invitation. Do
  // not echo it or hidden deltas into either the card or the inventory.
  return '<section class="mentor-preview"><b>前辈留给你的三个问题</b><p class="mentor-note">哪些条件已经确认？你现在最想照顾什么？还有哪件事需要和对方商量？</p></section>';
}

export function inventoryNudge(state,lastShownTurn=-Infinity){
  if(!state.life||state.ended||!['choice','feedback'].includes(state.phase)||state.turn-lastShownTurn<2)return null;
  const items=getInventory(state),usable=id=>items.find(item=>item.id===id&&item.usable);
  // Match current needs, not simulated outcomes or the supposedly best answer.
  let item;
  if(state.mood<=55||(hasRhythm(state)&&state.life.strain.fatigue>=4))item=usable('coffee')||usable('onsen')||usable('oden');
  if(!item&&state.phase==='choice'){
    const n=state.active.number;
    if([8,22].includes(n))item=usable('earplugs');
    if([13,27,31].includes(n)&&!(n===13&&state.talent==='defense'&&!state.memoUsed&&state.life.inventory.memo))item=usable('legal');
  }
  if(!item&&state.life.companion.coldWar)item=usable('communication');
  return item?{id:item.id,text:'行囊里有可以使用的道具',detail:item.name}:null;
}
export function inventoryNudgeMarkup(nudge){
  return nudge?`<button type="button" class="inventory-nudge" data-open-inventory><span aria-hidden="true">♧</span><span>${nudge.text}<small>${esc(nudge.detail)}</small></span><span aria-hidden="true">↗</span></button>`:'';
}
