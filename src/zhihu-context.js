import {SOURCES} from './sources.js';
import {getEventGrounding} from './event-grounding.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const ZHIHU_CONTEXT_LABEL='相关讨论 · 非事件实录';
export const ZHIHU_BRIDGE='知乎讨论启发 · 虚构情景';

// Sources are curated discussion references, not proof that an author lived
// through the game's fictional scene or endorsed its numerical settlement.
export function getEventSourceContext(eventOrRecord){
  const ids=Array.isArray(eventOrRecord?.sources)?eventOrRecord.sources:[];
  const sources=[...new Set(ids)].filter(id=>typeof id==='string'&&Object.hasOwn(SOURCES,id)).map(id=>({...SOURCES[id]}));
  return {label:ZHIHU_CONTEXT_LABEL,sources,count:sources.length};
}

export function collectJourneySources(history=[]){
  const collected=new Map();
  for(const record of Array.isArray(history)?history:[]){
    for(const source of getEventSourceContext(record).sources){
      if(!collected.has(source.id))collected.set(source.id,{...source,events:[]});
      const events=collected.get(source.id).events;
      // Count the visited, settled pages only. Unvisited map cells and future
      // choices must never inflate this collection.
      const page={eventId:record.eventId??record.id??'',title:record.title??'',turn:record.turn??null};
      if(!events.some(event=>event.eventId===page.eventId&&event.turn===page.turn))events.push(page);
    }
  }
  return [...collected.values()];
}

function firstSentence(text){
  return String(text??'').match(/^[\s\S]*?[。！？](?:[”」])?/)?.[0]||String(text??'');
}

export function zhihuEchoMarkup(record){
  const {sources}=getEventSourceContext(record),source=sources[0];
  if(!source)return '';
  const candidate=getEventGrounding(record);
  // Old standalone records must not borrow evidence outside their mapping.
  const grounding=candidate?.sourceIds.every(id=>sources.some(item=>item.id===id))?candidate:null;
  const title=grounding?.status==='topic-only'?'知乎同题讨论':'知乎经验回声';
  const status=grounding?.status==='topic-only'?'经验待补核':grounding?.status==='author-pending'?'作者待核对':'相关讨论';
  const conditions=(grounding?.considerations??[]).map(item=>{
    const reference=sources.find(entry=>entry.id===item.sourceId);
    return reference?`<p class="zhihu-condition"><b>${esc(item.when)}</b><br>${esc(item.idea)} <a href="${esc(reference.url)}" target="_blank" rel="noopener noreferrer">${esc(reference.sourceKind==='question'?'问题页讨论':reference.author)} ↗</a></p>`:'';
  }).join('');
  const references=sources.map(item=>`<p><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)} ↗</a><br><small>${esc(item.sourceKind==='question'?'问题页 · '+item.author:'知乎作者 · '+item.author)} · ${esc(item.evidence??'2026-09-08 CLI 搜索片段，未读取完整原文')}</small></p>`).join('');
  return `<aside class="zhihu-echo" aria-label="${title}"><div class="zhihu-echo-heading"><span class="zhihu-badge" aria-hidden="true">知</span><b>${title}</b><small>${status}</small></div><p>${esc(grounding?.echo??firstSentence(source.idea))}</p><details class="zhihu-echo-context"><summary>原文与适用条件 ↗</summary>${conditions}${references}<p>${esc(grounding?.boundary??source.scope)} 这是相关讨论的整理，不是原文逐字引述，也不是本局事件实录。</p></details></aside>`;
}

export function journeySourceBookMarkup(history=[]){
  const sources=collectJourneySources(history);
  if(!sources.length)return '<section class="journey-source-book empty"><h3>本局知乎经验册</h3><p>作出第一次选择后，在这里收好相关讨论。</p></section>';
  return `<details class="journey-source-book"><summary><span>本局知乎经验册</span><b>${sources.length} 篇相关原文</b></summary><p class="source-book-note">只收录本局已经历事件的相关讨论，同一原文只计一次；不是作者经历的复现。</p><div class="source-book-list">${sources.map(source=>`<article class="source-book-entry" data-source-id="${esc(source.id)}"><span class="tiny-label">${esc(source.scope)}</span><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ↗</a><small>${esc(source.sourceKind==='question'?'问题页 · '+source.author:'知乎作者 · '+source.author)}</small><p>${esc(source.idea)}</p><small>${esc(source.evidence??'CLI 搜索片段，未读取完整原文')}</small><div class="source-book-pages">与你经历的「${source.events.map(event=>esc(event.title)).join('」「')}」主题相关</div></article>`).join('')}</div></details>`;
}
