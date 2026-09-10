import {EVENTS} from './events.js';
import {SOURCES} from './sources.js';
import {practiceModeLabel} from './practice-ui.js';
export const METHOD_STORAGE_KEY='four-seasons-methods-v1';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const event=EVENTS.find(e=>e.id==='cell-13');
const TIP_MODES=new Set(['live','cache','fallback']);
const MAX_CARDS=12;
export const PRESET_METHOD='指出一条可核对的记录，再约定谁来整理待确认事项、何时一起核对。';
export function makeMethodCard(record,session){
  if(record?.eventId!==event.id||!Number.isInteger(record.choice)||!event.options[record.choice])throw new Error('方法卡需要本次实际选择');
  const completedTip=session?.done===true&&session.turn===2&&TIP_MODES.has(session.tipMode)&&typeof session.tip==='string'&&session.tip.trim().length>0&&session.tip.length<=300;
  return {version:1,eventId:event.id,choice:record.choice,tip:completedTip?session.tip.trim():PRESET_METHOD,
    mode:completedTip?session.tipMode:'preset',turns:session?.turn===2?2:session?.turn===1?1:0};
}
function valid(card){
  return card&&typeof card==='object'&&!Array.isArray(card)&&card.version===1&&card.eventId===event.id&&Number.isInteger(card.choice)&&!!event.options[card.choice]&&
    typeof card.tip==='string'&&card.tip.trim().length>0&&card.tip.length<=300&&[0,1,2].includes(card.turns)&&
    (card.mode==='preset'?card.tip.trim()===PRESET_METHOD:TIP_MODES.has(card.mode)&&card.turns===2);
}
function clean(card){return {version:1,eventId:event.id,choice:card.choice,tip:card.tip.trim(),mode:card.mode,turns:card.turns};}
function normalized(cards){
  const unique=new Map();
  for(const card of Array.isArray(cards)?cards:[]){
    if(!valid(card))continue;
    const item=clean(card),key=JSON.stringify([item.eventId,item.choice,item.tip]);
    unique.delete(key);unique.set(key,item);
  }
  return [...unique.values()].slice(-MAX_CARDS);
}
function readStoredCards(storage){
  try{
    const raw=storage.getItem(METHOD_STORAGE_KEY);
    if(raw===null)return {ok:true,cards:[]};
    const data=JSON.parse(raw);
    return Array.isArray(data)?{ok:true,cards:normalized(data)}:{ok:false,cards:[]};
  }catch{return {ok:false,cards:[]};}
}
export function loadMethodCards(storage){
  return readStoredCards(storage).cards;
}
export function collectMethodCard(storage,card){
  if(!valid(card))return false;
  const stored=readStoredCards(storage);
  // A failed/invalid read is not an empty notebook. Do not overwrite data that
  // could not be inspected; the sample still shows the unsaved card on screen.
  if(!stored.ok)return false;
  try{storage.setItem(METHOD_STORAGE_KEY,JSON.stringify(normalized([...stored.cards,card])));return true;}catch{return false;}
}
function sourceLinks(){
  // Local storage never chooses the references or the destination URL. Only
  // the current event's bundled source IDs and exact Zhihu hosts are trusted.
  return [...new Set(event.sources)].filter(id=>typeof id==='string'&&Object.hasOwn(SOURCES,id)).map(id=>{
    const source=SOURCES[id];let url;
    try{url=new URL(source.url);}catch{return '';}
    if(url.protocol!=='https:'||!['www.zhihu.com','zhuanlan.zhihu.com'].includes(url.hostname)||url.username||url.password)return '';
    return `<a href="${esc(url.href)}" target="_blank" rel="noopener noreferrer">${esc(source.author)} · ${esc(source.title)} ↗</a>`;
  }).join('');
}
export function methodCardMarkup(card){
  if(!valid(card))return '';
  return `<article class="method-card"><span class="tiny-label">带走一个小方法 · 不是标准答案</span><h3>把争论，带回可核对的事。</h3><p class="method-action">${esc(card.tip)}</p><small>${card.mode==='preset'?'编辑整理的预设方法 · 非实时 AI':practiceModeLabel(card.mode)+' · 本次练习提醒'}</small><details><summary>方法的来处</summary><p>这次你选择：${esc(event.options[card.choice].label)}。虚构练习不评价真实能力；方法不是答主原话，也不保证对方同意。</p>${sourceLinks()}</details></article>`;
}
export function methodNotebookMarkup(cards){
  const items=normalized(cards);
  return `<section class="method-notebook"><span class="tiny-label">只存在这个浏览器 · 不上传社区</span><h2>收好的方法，留给下一次。</h2><p>这里只保留你主动收下的方法和选择，不保留聊天记录。</p>${items.length?items.map(methodCardMarkup).join(''):'<p>还没有方法卡。先去体验一次沟通难题。</p>'}</section>`;
}
