import {SAMPLE_ID,createSampleState} from './sample-scenario.js';
import {eventMarkup} from './presentation.js';
import {getPracticeScene} from './practice-scenes.js';
import {createPracticeSession,mountPractice} from './practice-ui.js';
import {zhihuEchoMarkup} from './zhihu-context.js';
import {makeMethodCard,collectMethodCard,methodCardMarkup} from './method-cards.js';
import './sample.css';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// The sample owns its DOM and ephemeral state only. It never writes the journey
// save or claims that the fixed setup was played by this visitor.
export function mountSample(container,{onClose=()=>{},onCollected=()=>{},storage=null}={}){
  let state=createSampleState(),session=null,stopPractice=null,disposed=false,step='choice';
  function chrome(stage,body){
    container.innerHTML=`<section class="sample-room" data-sample-stage="${stage}"><div class="sample-heading"><span class="tiny-label">AI 互动样板 · 独立预设情境</span><small>不覆盖四季存档</small></div><ol class="sample-steps" aria-label="体验步骤">${['遇见难题','试着说一句','经验与方法'].map((title,i)=>`<li ${i===['choice','practice','lesson'].indexOf(stage)?'aria-current="step"':''}><span>${i+1}</span>${title}</li>`).join('')}</ol>${body}</section>`;
    container.closest('dialog')?.scrollTo({top:0});
  }
  function showChoice(){
    step='choice';chrome('choice',`<div class="sample-scene" aria-hidden="true"><img src="/characters/idle.gif" alt=""/><span class="sample-message">项目群 · 一条新消息<br><b>“延期的问题，得请你解释一下。”</b></span><span class="sample-record">时间线<br>待核对</span></div>${eventMarkup(state)}<p class="sample-note">约 1–2 分钟，随时可退出。虚构同事，不是知乎答主本人。</p>`);
    container.querySelector('.panel-topline .tiny-label').textContent='第13格片段 · 非整局通关';
    container.querySelectorAll('[data-choice]').forEach(button=>button.addEventListener('click',()=>{
      if(disposed||step!=='choice')return;state=createSampleState(Number(button.dataset.choice));showInvitation();
    }));
    container.querySelector('#event-heading').focus({preventScroll:true});
  }
  function showInvitation(){
    step='invite';const record=state.history.at(-1);
    chrome('practice',`<div class="sample-invitation"><span class="sample-check">✓</span><h2>决定做了，接下来怎么说？</h2><p>你选择了「${esc(record.choiceLabel)}」</p><details class="sample-settlement"><summary>看看这次选择的结果</summary><p>${esc(record.result)}</p><small>沿用本局规则，仅这次三选一结算；练习不追加资源变化。</small></details><p class="sample-brief">虚构同事会接着你的决定回应。试着说一句，或直接看看相关经验。</p><button class="primary" id="sample-practice">试着说一句 →</button><button class="text-button" id="sample-skip">跳过练习，看看知乎经验 →</button></div>`);
    container.querySelector('#sample-practice').onclick=showPractice;container.querySelector('#sample-skip').onclick=showLesson;
  }
  function showPractice(){
    if(disposed||step!=='invite')return;step='practice';const record=state.history.at(-1);
    session=createPracticeSession(undefined,record,getPracticeScene(record.eventId));session.sample={id:SAMPLE_ID,choice:record.choice};
    chrome('practice','<div id="sample-conversation"></div>');
    stopPractice=mountPractice(container.querySelector('#sample-conversation'),session,{deferTip:true,onClose:showLesson,
      exitLabel:s=>s.done?'看看知乎经验 →':s.turn?'先练到这里，看看经验 →':'跳过练习，看看经验 →'});
  }
  function showLesson(){
    if(disposed||step==='lesson')return;stopPractice?.();stopPractice=null;step='lesson';
    const record=state.history.at(-1),card=makeMethodCard(record,session);
    chrome('lesson',`<h2>别人走过的路，留给你一点参考。</h2>${zhihuEchoMarkup(record)}${methodCardMarkup(card)}<div class="sample-actions"><button class="primary" id="sample-collect">收下这条方法</button><button class="secondary" id="sample-home">回到四季首页 →</button></div><p class="sample-note" id="sample-save-status" role="status">点击收下，才会在本浏览器保存这条提醒与选择；不保存聊天。</p>`);
    container.querySelector('#sample-collect').onclick=()=>{
      let ok=false;try{ok=collectMethodCard(storage??globalThis.localStorage,card);}catch{}
      container.querySelector('#sample-save-status').textContent=ok?'已收好。首页的“我的方法卡”可以再次查看。':'浏览器暂时无法保存。方法仍显示在这里，可以自行记下。';
      if(ok){const button=container.querySelector('#sample-collect');button.disabled=true;button.textContent='✓ 已收进方法卡';onCollected();}
    };
    container.querySelector('#sample-home').onclick=onClose;
  }
  showChoice();
  return ()=>{disposed=true;stopPractice?.();stopPractice=null;session=null;};
}
