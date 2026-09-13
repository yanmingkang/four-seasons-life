import {EVENTS,SEASONS} from './events.js';
import {routeFor} from './route.js';
import {SOURCES} from './sources.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=value=>Number.isFinite(value)?value.toLocaleString('zh-CN'):'—';
const signed=value=>`${value>0?'+':''}${amount(value)}`;
export const REVIEW_CELLS=Object.freeze([6,10,13,15,18,20,22,27,30,31]);
const idFor=number=>`cell-${String(number).padStart(2,'0')}`;
const historyOf=state=>Array.isArray(state?.history)?state.history:[];
const settledSources=record=>(record?.sources||[]).map(id=>SOURCES[id]).filter(Boolean);

// Replay data is the authority: a crossed square is never presented as a choice.
export function getTenDecisionReview(state={}){
  const history=historyOf(state),byId=new Map(history.map(record=>[record.eventId,record]));
  const route=routeFor(state.mode==='demo'?'demo':'full');
  const furthest=route[state.position]??-1;
  return REVIEW_CELLS.map(number=>{
    const id=idFor(number),event=EVENTS[number-1],record=byId.get(id);
    const status=record?'visited':state.active?.id===id?'pending':!route.includes(number-1)?'outside':furthest>=number-1?'skipped':'ahead';
    const outgoing=(state.life?.chains||[]).filter(chain=>chain.from===id&&byId.has(chain.to)).map(chain=>({reason:chain.reason,record:byId.get(chain.to)}));
    const incoming=(state.life?.chains||[]).filter(chain=>chain.to===id&&byId.has(chain.from)).map(chain=>({reason:chain.reason,record:byId.get(chain.from)}));
    // These two actions have an explicit origin in the game state. Other
    // independent actions remain in the ledger instead of receiving a made-up cause.
    const transactions=record?(state.life?.transactions||[]).filter(transaction=>transaction.turn>=record.turn&&(
      transaction.kind==='home'&&number===30&&record.choice===0 ||
      transaction.kind==='business'&&state.life.business?.origin===id
    )):[];
    return {number,id,title:record?.title||event.title,location:event.location,season:event.season,golden:event.golden,
      status,statusLabel:{visited:'已亲历',pending:'已抵达，尚未选择',outside:'本局未停靠',skipped:'本局未停靠',ahead:'尚未抵达'}[status],
      record:record||null,incoming:record?incoming:[],outgoing:record?outgoing:[],transactions};
  });
}

function resourceChanges(record){
  return `<div class="decision-resource-changes">${[['money','资金','¥'],['mood','情绪',''],['exp','专业','']].map(([key,label,unit])=>`<span><b>${label}</b><span>${unit}${amount(record.before?.[key])} → ${unit}${amount(record.after?.[key])}</span><em>${signed(record[`${key}Delta`])}</em></span>`).join('')}</div>`;
}
function reviewItemMarkup(item){
  const h=item.record;
  const body=h?`<p class="decision-chosen"><b>我的选择</b>${esc(h.choiceLabel)}</p>${resourceChanges(h)}<p>${esc(h.result)}</p>${h.conditionNote?`<p class="decision-note">${esc(h.conditionNote)}</p>`:''}${h.talentNote?`<p class="decision-note">${esc(h.talentNote)}</p>`:''}${h.lesson?`<p class="decision-lesson">这一刻的提醒：${esc(h.lesson)}</p>`:''}${item.incoming.length?`<div class="decision-causal"><h5>从前面的决定延续而来</h5>${item.incoming.map(cause=>`<p><b>「${esc(cause.record.title)}」</b> · ${esc(cause.reason)}</p>`).join('')}</div>`:''}<details class="decision-causal decision-downstream"><summary>后续已经发生的影响 · ${item.outgoing.length + item.transactions.length} 条</summary>${item.outgoing.length||item.transactions.length?`${item.outgoing.map(cause=>`<article><b>第 ${cause.record.tile+1} 格 · ${esc(cause.record.title)}</b><p>${esc(cause.reason)}</p><small>后来选择：${esc(cause.record.choiceLabel)}</small><p>${esc(cause.record.result)}</p></article>`).join('')}${item.transactions.map(action=>`<article><b>${esc(action.title)}</b><p>${esc(action.result)}</p><small>独立行动 · 资金 ${signed(action.moneyDelta)} / 情绪 ${signed(action.moodDelta)} / 专业 ${signed(action.expDelta)}</small></article>`).join('')}`:'<p>本局没有记录到由这次选择触发的后续事件；当次结果已保留在上方。</p>'}</details>${settledSources(h).length?`<div class="decision-sources">相关知乎讨论 · ${settledSources(h).map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.author)} ↗</a>`).join('')}</div>`:''}`:`<p class="decision-unvisited">${{pending:'已经停靠这一格，完成选择后才会写入回溯。',outside:'快速体验路线未包含这一格，没有记录选择。',skipped:'这次掷骰越过了这一格，没有触发事件或记录选择。',ahead:stateAheadText}[item.status]}</p>`;
  return `<li class="decision-review-item ${item.status}" data-review-cell="${item.number}"><details ${h?'open':''}><summary><span class="decision-number">${String(item.number).padStart(2,'0')}</span><span class="decision-summary"><small>${SEASONS[item.season].name} · ${item.golden?'黄金抉择':'关键选择'}${h?` · 第 ${h.turn} 次停靠`:''}</small><b>${esc(item.title)}</b></span><span class="decision-status">${item.statusLabel}</span></summary><div class="decision-review-body">${body}</div></details></li>`;
}
const stateAheadText='这一程还没有抵达这里，未来的选择留白。';

export function tenDecisionReviewMarkup(state){
  const rows=getTenDecisionReview(state),visited=rows.filter(row=>row.record).length;
  return `<details class="report-fold ten-decision-review" open><summary>10 大关键选择回溯 <span>亲历 ${visited} / 10</span></summary><p class="decision-review-intro">7 个关键选择与 3 个黄金抉择。展开可回看当时数值、选择和已经发生的后续；每一条都能单独收起。</p><ol class="decision-review-list">${rows.map(reviewItemMarkup).join('')}</ol></details>`;
}

function transactionSeason(transaction,history,state){
  const turn=transaction.phase==='choice'?transaction.turn+1:transaction.turn;
  return history.find(record=>record.turn===turn)?.season??(transaction.turn===0?0:state.season??0);
}
export function getSeasonReview(state={}){
  const history=historyOf(state);
  return SEASONS.map((season,index)=>{
    const records=history.filter(record=>record.season===index);
    const actions=(state.life?.transactions||[]).filter(action=>transactionSeason(action,history,state)===index);
    const focus=records.find(record=>[10,20,30].includes(record.tile+1))||records.at(-1);
    const delta=Object.fromEntries(['money','mood','exp'].map(key=>[key,[...records,...actions].reduce((sum,record)=>sum+(record[`${key}Delta`]||0),0)]));
    return {season:index,name:season.name,title:season.title,records,actions,focus,delta};
  });
}

export function getEndingReflection(state={}){
  if(!state.ended)return null;
  const history=historyOf(state),last=history.at(-1),name=state.name||'刘看山',season=SEASONS[state.season??0]?.name||'春';
  let source=null,sourceRecord=null;
  // Prefer an actual, curated short quotation from the most recent applicable
  // settled page. Never put a paraphrase inside quotation marks.
  for(const record of [...history].reverse()){
    const candidate=settledSources(record).find(entry=>entry.excerpt&&entry.author&&entry.author!=='作者待核对');
    if(candidate){source=candidate;sourceRecord=record;break;}
  }
  if(!source){
    source=settledSources(last).find(entry=>entry.author&&entry.author!=='作者待核对')||null;
    if(source)sourceRecord=last;
  }
  const complete=state.ended==='complete';
  const quote=source?.excerpt?(source.excerpt.match(/^[\s\S]*?[。！？]/)?.[0]||source.excerpt.split('\n')[0]):'';
  return {complete,title:complete?`${name}的四时人生总结`:`${name}的未竟之书`,season,source,sourceRecord,quote,
    reflection:complete?`我走到了这条路线的终点，留下 ${history.length} 段亲历。那些为了成长、陪伴或喘一口气而做的选择，都留在了这本手记里。`:`我在${season}季暂时停下，手记里已经写了 ${history.length} 段经历。${last?`最后一次，我选择了「${last.choiceLabel}」。`:''}这一页先留到这里，走过的路仍然算数。`,
    chapters:getSeasonReview(state)};
}

function sourceReflectionMarkup(reflection){
  const source=reflection.source;if(!source)return '';
  return `<aside class="ending-source-reflection"><span class="tiny-label">从相关经验里，留下一句话</span><p class="ending-source-context">与你经历的「${esc(reflection.sourceRecord.title)}」主题相关</p>${reflection.quote?`<blockquote>${esc(reflection.quote)}</blockquote>`:`<p>${esc(source.idea)}</p>`}<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.author)} · ${esc(source.title)} ↗</a><small>${reflection.quote?'核对片段摘录':'相关观点整理，非逐字引述'} · ${esc(source.evidence||'仅核对搜索片段，未读取完整原文')}</small><p class="ending-source-scope">${esc(source.scope)}。相关讨论不代表作者经历了本局事件。</p></aside>`;
}

export function endingReflectionMarkup(state){
  const reflection=getEndingReflection(state);if(!reflection)return '';
  return `<section class="ending-reflection ${reflection.complete?'complete':'unfinished'}"><span class="tiny-label">${reflection.complete?'四季成章 · 留给未来的自己':`${reflection.season}季 · 旅程暂歇`}</span><h3>${esc(reflection.title)}</h3><p class="ending-monologue">${esc(reflection.reflection)}</p>${reflection.complete?`<div class="ending-season-chapters">${reflection.chapters.map(chapter=>`<article style="--chapter-tint:${SEASONS[chapter.season].tint};--chapter-color:${SEASONS[chapter.season].color}"><span class="ending-season-letter">${chapter.name}</span><div><h4>${chapter.title}</h4><small>${chapter.records.length} 次停靠${chapter.actions.length?` · ${chapter.actions.length} 次生活行动`:''}</small>${chapter.focus?`<p>在「${esc(chapter.focus.title)}」，我选择了${esc(chapter.focus.choiceLabel)}。</p><p class="ending-chapter-result">${esc(chapter.focus.result)}</p>`:'<p>本季没有留下停靠记录，这一章保留空白。</p>'}<p class="ending-season-delta">本季合计 · 资金 ${signed(chapter.delta.money)} / 情绪 ${signed(chapter.delta.mood)} / 专业 ${signed(chapter.delta.exp)}</p></div></article>`).join('')}</div>`:`${sourceReflectionMarkup(reflection)}<p class="ending-pause-note">这次暂停只表示本局情绪已耗尽，不是对现实人生的判断。已经走过的片段，仍可在下方回看。</p>`}</section>`;
}

export function endingReflectionText(state){
  const reflection=getEndingReflection(state);if(!reflection)return '';
  const review=getTenDecisionReview(state).map(item=>`${item.number}. ${item.title} · ${item.statusLabel}${item.record?`\n选择：${item.record.choiceLabel}\n结果：${item.record.result}\n变化：资金 ${signed(item.record.moneyDelta)}，情绪 ${signed(item.record.moodDelta)}，专业 ${signed(item.record.expDelta)}${item.outgoing.length?`\n后续：${item.outgoing.map(cause=>`「${cause.record.title}」${cause.reason} ${cause.record.result}`).join('\n')}`:''}${item.transactions.length?`\n独立行动：${item.transactions.map(action=>`${action.title}：${action.result}`).join('\n')}`:''}`:''}`).join('\n\n');
  const chapters=reflection.complete?reflection.chapters.map(chapter=>`${chapter.name} · ${chapter.title}\n${chapter.records.length} 次停靠 / ${chapter.actions.length} 次生活行动\n${chapter.focus?`选择：${chapter.focus.choiceLabel}\n结果：${chapter.focus.result}`:'本季没有留下停靠记录。'}\n本季合计：资金 ${signed(chapter.delta.money)}，情绪 ${signed(chapter.delta.mood)}，专业 ${signed(chapter.delta.exp)}`).join('\n\n'):reflection.source?`相关知乎经验 · ${reflection.source.author}\n${reflection.source.excerpt||reflection.source.idea}\n${reflection.source.excerpt?'核对片段摘录':'观点整理，非逐字引述'}；${reflection.source.evidence||'未读取完整原文'}\n${reflection.source.url}`:'';
  return `${reflection.title}\n${reflection.reflection}\n\n${chapters}\n\n10 大关键选择回溯\n${review}`;
}
