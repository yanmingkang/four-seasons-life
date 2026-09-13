import {RULES,previewChoice} from './engine.js';
import {SEASONS} from './events.js';
import {SOURCE_NOTE} from './sources.js';
import {resourceIcon} from './resource-ui.js';
import {ZHIHU_BRIDGE,zhihuEchoMarkup} from './zhihu-context.js';
import {LIFE_CHAPTERS} from './season-chapters.js';
import {eventCopy,feedbackShort,isKeyEvent} from './event-copy.js';
import {fatigueMarkup} from './rhythm-ui.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>new Intl.NumberFormat('zh-CN').format(n);
const sign=n=>`${n>0?'+':''}${money(n||0)}`;
export const professionalTitle=exp=>exp>=150?'独立顾问':exp>=70?'项目骨干':exp>=30?'职场进阶':'初出茅庐';
export function welcomeMarkup(setup,saved){return `<div class="welcome-top"><span class="tiny-label">知乎四时</span><span class="edition" aria-label="3D 田园版 · v4">四季田园</span></div>
  <div class="welcome-layout"><div class="welcome-story"><div class="welcome-illustration"><span class="welcome-orbit"></span><img src="/characters/wave.gif" alt="刘看山向你打招呼"/><i>带着自己，慢慢出发。</i></div><span class="welcome-kicker">刘看山陪你 · 四季人生体验</span><h1>四季很长，<br>每一步都算数。</h1><p class="intro-copy">把知乎经验，走成自己的四季。</p><div class="starter-resources"><span title="初始储备金">${resourceIcon('coin')}<b>${money(RULES.money)}</b></span><span title="初始情绪">${resourceIcon('heart')}<b>${RULES.mood}</b></span><span title="初始专业">${resourceIcon('star')}<b>${RULES.exp}</b></span></div></div>
  <div class="welcome-setup"><label class="name-label" for="character-name">怎么称呼你？</label><input id="character-name" maxlength="16" value="${esc(setup.name??'')}" autocomplete="off" placeholder="填写你的昵称（选填）"/><fieldset class="talent-picker"><legend>带上一种心态</legend>${[['defense','稳健防守型','开局带【留痕备忘录】，首次甩锅抵挡事件本身的消耗。','提前使用会消耗这次保护；累积疲惫仍需休息。'],['ambitious','锐意进取型','事件专业收益 +20%，负面事件情绪消耗 +10%。','更快成长，也更容易感到疲惫。'],['optimistic','乐天知命型','每跨入一个新季节，自动恢复 15 点情绪。','随当次事件结算，不超过情绪上限。']].map(([v,n,d,note])=>`<label><input type="radio" name="talent" value="${v}" ${setup.talent===v?'checked':''}/><span><b>${n}</b><small class="talent-effect">${d}</small><small class="talent-note">${note}</small></span></label>`).join('')}</fieldset><div class="welcome-actions"><button id="start-full" class="primary">走进我的四季 <span>→</span><small>40 站 · 约 6–10 分钟</small></button></div><p class="welcome-fineprint">虚构人生，认真选择。</p></div></div>`;}

// The caller supplies a replay-validated state. Rendering alone never starts,
// clears or overwrites a journey; the two explicit actions are bound by main.
export function resumePromptMarkup(restoredState){
  const name=String(restoredState?.name??'').trim()||'旅人';
  const turn=Number.isSafeInteger(restoredState?.turn)&&restoredState.turn>=0?restoredState.turn:0;
  return `<section class="resume-prompt" aria-labelledby="resume-heading"><h2 id="resume-heading">你的旅程还在这里</h2><p class="resume-progress"><strong>${esc(name)}</strong> · 已写下 <b>${turn}</b> 段经历</p><div class="resume-actions"><button type="button" id="resume" class="primary">${restoredState?.ended?'翻开上次回忆':'继续上次旅程'}</button><button type="button" id="start-new-journey" class="secondary">开启新旅程</button></div><p class="resume-warning">开启新旅程将替换当前存档。</p></section>`;
}
export function compactScene(scene){
  const text=String(scene??'').trim(),sentences=text.match(/[^。！？]+[。！？]?/g)||[];
  // Preserve the entire factual setup for our current short scenes. Longer
  // authored scenes retain a native, keyboard-accessible background drawer.
  if(sentences.length<=2)return {preview:text,remainder:''};
  return {preview:sentences.slice(0,2).join(''),remainder:sentences.slice(2).join('')};
}
export function eventMarkup(state,source=''){
  const e=state.active,copy=eventCopy(e),scene=compactScene(copy.scene),keyEvent=isKeyEvent(e);
  const background=copy.background||scene.remainder;
  // Preview is used only to enforce affordability. No outcome data enters the
  // choice DOM, including hidden text, labels, tooltips or disabled reasons.
  const options=e.options.map((option,index)=>{
    const unavailable=previewChoice(state,option).disabled;
    return `<button type="button" class="choice" data-choice="${index}"${unavailable?' disabled':''}><span class="choice-letter" aria-hidden="true">${['一','二','三'][index]||index+1}</span><span class="choice-body"><strong>${esc(option.label)}</strong>${keyEvent&&option.description?`<small class="choice-intention">${esc(option.description)}</small>`:''}${unavailable?'<small class="choice-unavailable">暂不可选</small>':''}</span><span class="choice-arrow" aria-hidden="true">›</span></button>`;
  }).join('');
  return `<div class="panel-topline"><span class="event-kind">${SEASONS[e.season].name} · ${LIFE_CHAPTERS[e.season].stage}</span><span class="tiny-label">第 ${state.position+1} / ${state.total} 站</span></div><div class="event-layout ${keyEvent?'event-key':'event-ordinary'}"><div class="event-story"><span class="event-overline">${esc(e.location||e.title)}</span><h2 id="event-heading" tabindex="-1">${esc(e.title)}</h2><p class="event-scene">${esc(scene.preview)}</p>${copy.detail?`<p class="scene-moment">${esc(copy.detail)}</p>`:''}${background?`<details class="event-background"><summary>展开故事背景</summary><p>${esc(background)}</p></details>`:''}${e.dynamicScene?`<details class="event-causal-hint"><summary>之前的选择，留到了这一刻</summary><p>${esc(e.dynamicScene)}</p></details>`:''}<span class="zhihu-story-bridge"><span class="zhihu-badge" aria-hidden="true">知</span>${ZHIHU_BRIDGE}</span>${fatigueMarkup(state)}</div><div class="decision-area"><h3 class="choice-prompt">${esc(e.prompt)}</h3><div class="options options-${e.options.length}">${options}</div>${keyEvent?`<details class="choice-context"><summary>看看每种回应的细节</summary>${e.options.map(o=>`<p><b>${esc(o.label)}</b><br>${esc(o.description)}</p>`).join('')}</details>`:''}</div></div>${source}`;
}
export function feedbackMarkup(state,ai,auto,practice=''){const h=state.history.at(-1),short=feedbackShort(h),result=short?{preview:short,remainder:h.result}:compactScene(h.result);return `<div class="panel-topline"><span class="event-kind">选择的回响</span><span class="tiny-label">第 ${state.turn} 页</span></div><h2>${state.ended&&state.ended!=='complete'?'先歇一歇。':'这一页，属于你。'}</h2><p class="chosen-line">${esc(h.choiceLabel)}</p><p class="result-copy">${esc(result.preview)}</p><div class="result-stats">${[['coin','储备金',h.moneyDelta,money(state.money)],['heart','情绪',h.moodDelta,`${state.mood} / ${state.moodMax||100}`],['star','专业',h.expDelta,`${state.exp}`]].map(([icon,title,delta,total])=>`<div><span>${resourceIcon(icon)} ${title}</span><strong class="${delta>=0?'positive':'negative'}">${sign(delta)}</strong><small>${total}</small></div>`).join('')}</div>${fatigueMarkup(state,{feedback:true})}${zhihuEchoMarkup(h)}${practice}<button id="next-button" class="primary">${state.ended?'收下手记':'继续前行'} ↗</button><details class="reflection-drawer"><summary>听听刘看山 · AI</summary>${ai}</details><details class="settlement-drawer"><summary>这次取舍的细节</summary>${result.remainder?`<p>${esc(result.remainder)}</p>`:''}<p>${esc(h.lesson)}</p>${h.conditionNote?`<p>${esc(h.conditionNote)}</p>`:''}${h.talentNote?`<p>${esc(h.talentNote)}</p>`:''}${state.life?.notices?.length?`<p>${esc(state.life.notices.join(' '))}</p>`:''}<small>以上为游戏规则，不是知乎作者的现实结论。</small></details>`;}
export function rulesMarkup(){return `<span class="tiny-label">出发手册</span><h2>骰子带路，选择由你。</h2><div class="rules-grid"><article><b>一</b><h3>出发</h3><p>起步 ${money(RULES.money)} 元、${RULES.mood} 情绪、${RULES.exp} 专业。六面骰带你走过四季，停靠才触发事件。</p></article><article><b>二</b><h3>选择</h3><p>每个故事三种回应，选后再看结果。八处场景配有团队提供的短片，可以跳过。</p></article><article><b>三</b><h3>生活</h3><p>连续硬扛会累积疲惫，休息可以缓解。需要时打开行囊，或找看雨聊聊。</p></article><article><b>四</b><h3>留念</h3><p>通关或停下都有手记。收集成就、留下明信片，把这道难题分享给朋友。</p></article></div><details class="report-fold"><summary>节奏、保护与存档</summary><p>横屏游玩。关闭自动出发后按空格继续；弹窗与竖屏暂停推进。完整40站约6–10分钟，快速12站约1–3分钟，取决于停靠次数和阅读速度。</p><p>新旅程有一次树洞保护；之后情绪耗尽则结束。资金不足不会成为负数，也不会单独判定结束。道具消耗、房贷与支线均遵循预设游戏规则。</p><p>存档留在当前浏览器。既有旅程保持原来的规则；新旅程启用生活扩展。旧记录不会被删除。</p></details><details class="report-fold"><summary>知乎来源与虚构边界</summary><p>${SOURCE_NOTE}</p><p>AI依据已发生的选择陪你练习和复盘，不改游戏结算，不作现实人生或心理诊断。短片由团队提供，用于虚构情境演绎。</p></details>`;}
