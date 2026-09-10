import {PRACTICE_MAX_LENGTH,practiceOpening} from './practice-scenes.js';
const MODEL='zhida-fast-1p5';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function practiceEntryMarkup(scene){
  return scene?`<section class="practice-invite"><div><span>可选 · 不计分</span><b>${esc(scene.title)}</b></div><button type="button" id="practice-open" class="secondary">试着说一句 →</button></section>`:'';
}
export function createPracticeSession(game,record,scene){
  return {game,record,scene,clientId:crypto.randomUUID(),sessionId:null,turn:0,done:false,rows:[],tip:'',tipMode:null,draft:'',localOnly:false};
}
export function practiceModeLabel(mode){return mode==='live'?'知乎直答 · 本次回应':mode==='cache'?'知乎直答 · 已生成回应':'预设练习 · 非实时 AI';}
export function validatePracticeResponse(body,expectedTurn){
  return body&&['live','cache','fallback'].includes(body.mode)&&body.model===MODEL&&typeof body.sessionId==='string'&&body.sessionId.length>=16&&body.sessionId.length<=128&&body.turn===expectedTurn&&body.done===(expectedTurn===2)&&typeof body.npc==='string'&&body.npc.trim().length>0&&body.npc.length<=500&&(expectedTurn===1?body.tip===undefined:typeof body.tip==='string'&&body.tip.trim().length>0&&body.tip.length<=300);
}

// One ephemeral session per settled event. Typed messages never enter game
// saves, scores, journals or URLs. Closing invalidates in-flight DOM updates.
export function mountPractice(container,session,{onClose=()=>{},deferTip=false,exitLabel=null}={}){
  let disposed=false,busy=false,request=null,pendingText='';
  const {scene,record}=session;
  container.innerHTML=`<section class="practice-room" aria-label="沟通小练习"><div class="practice-heading"><span class="zhihu-badge" aria-hidden="true">知</span><div><span class="tiny-label">刘看山陪你练 · 虚构角色</span><h2>${esc(scene.title)}</h2></div><span class="practice-round" aria-live="polite"></span></div><p class="practice-context">接着「${esc(record.choiceLabel)}」，练习你会怎样表达。</p><p class="practice-boundary">最多两轮 · 可随时跳过 · 不改变资金、情绪、专业或结局</p><div class="practice-chat" role="log" aria-label="练习对话" aria-live="polite" aria-relevant="additions text"></div><aside class="practice-tip" hidden><b>刘看山 · 留一句具体提醒</b><p></p><small></small></aside><form class="practice-form"><label for="practice-message">你会怎么回应？</label><textarea id="practice-message" rows="2" maxlength="${PRACTICE_MAX_LENGTH}" placeholder="写下你此刻会说的话……" autocomplete="off" spellcheck="false" aria-describedby="practice-privacy practice-counter"></textarea><div class="practice-compose-meta"><small id="practice-counter">0 / ${PRACTICE_MAX_LENGTH}</small><button class="primary" type="submit">说出这句话 →</button></div><p id="practice-privacy">发送后由知乎直答处理。请勿输入真实姓名、个人隐私或公司机密。练习文字不进入存档；服务器仅短期保留会话。</p></form><p class="practice-status" role="status"></p><button type="button" class="text-button practice-exit">跳过练习，回到旅程 →</button></section>`;
  const room=container.querySelector('.practice-room'),chat=room.querySelector('.practice-chat'),form=room.querySelector('form'),textarea=room.querySelector('textarea'),submit=room.querySelector('[type="submit"]'),counter=room.querySelector('#practice-counter'),status=room.querySelector('.practice-status'),tip=room.querySelector('.practice-tip'),exit=room.querySelector('.practice-exit');
  textarea.value=session.draft;
  const row=(role,text,mode)=>`<article class="practice-message ${role}"><small>${role==='player'?'你':esc(scene.npcName)}${role==='npc'?`<span>${mode==='opening'?'情境开场 · 预设':practiceModeLabel(mode)}</span>`:''}</small><p>${esc(text)}</p></article>`;
  function input(){session.draft=textarea.value;counter.textContent=`${textarea.value.length} / ${PRACTICE_MAX_LENGTH}`;submit.disabled=busy||session.done||!textarea.value.trim();}
  function render(){
    if(disposed)return;
    chat.innerHTML=row('npc',practiceOpening(scene,record),'opening')+session.rows.map(r=>row(r.role,r.text,r.mode)).join('')+(busy?row('player',pendingText):'');
    chat.scrollTop=chat.scrollHeight;room.querySelector('.practice-round').textContent=session.done?'练习完成':`第 ${session.turn+1} / 2 轮`;
    tip.hidden=!session.done||deferTip;tip.querySelector('p').textContent=deferTip?'':session.tip;tip.querySelector('small').textContent=deferTip?'':practiceModeLabel(session.tipMode);
    form.hidden=session.done;textarea.disabled=busy;form.setAttribute('aria-busy',String(busy));
    submit.textContent=busy?'正在听你的回应…':session.turn===1?'说完这一句 →':'说出这句话 →';
    exit.textContent=exitLabel?exitLabel(session):session.done?'收好提醒，回到旅程 →':'跳过练习，回到旅程 →';
    status.textContent=busy?'正在生成，可以随时退出。':session.localOnly?'连接暂不可用，本次改为两轮预设练习；不会假装是实时 AI。':session.done?'这只是一段表达练习，不是对你能力或人格的评价。':'';
    input();
  }
  async function send(event){
    event.preventDefault();const message=textarea.value.trim();
    if(disposed||busy||session.done||!message||message.length>PRACTICE_MAX_LENGTH)return;
    busy=true;pendingText=message;render();let result;
    const controller=new AbortController();request=controller;const timer=setTimeout(()=>controller.abort(),25000);
    try{
      if(session.localOnly)throw new Error('local rehearsal');
      const response=await fetch('/api/practice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...(session.sample?{sample:session.sample}:{game:session.game}),clientId:session.clientId,turn:session.turn+1,...(session.sessionId?{sessionId:session.sessionId}:{}),message}),signal:controller.signal});
      if(!response.ok)throw new Error('practice unavailable');
      result=await response.json();if(!validatePracticeResponse(result,session.turn+1))throw new Error('invalid practice');
    }catch{
      if(disposed||request!==controller)return;
      session.localOnly=true;
      result={mode:'fallback',turn:session.turn+1,done:session.turn===1,npc:scene.localReplies[session.turn],tip:session.turn===1?scene.localTip:undefined};
    }finally{clearTimeout(timer);}
    if(disposed||request!==controller)return;
    request=null;busy=false;pendingText='';session.turn=result.turn;session.done=result.done;session.sessionId=result.sessionId||session.sessionId;
    session.rows.push({role:'player',text:message},{role:'npc',text:result.npc,mode:result.mode});session.tip=result.tip||'';session.tipMode=result.mode;session.draft='';textarea.value='';render();
    if(!document.hidden&&!matchMedia('(orientation: portrait)').matches)(session.done?exit:textarea).focus({preventScroll:true});
  }
  form.addEventListener('submit',send);textarea.addEventListener('input',input);exit.addEventListener('click',onClose);render();textarea.focus({preventScroll:true});
  return ()=>{
    disposed=true;
    // The server may already own this first message even when its response was
    // lost. Keep the draft, but let an edited resubmission start a fresh session.
    if(request&&session.turn===0&&!session.sessionId)session.clientId=crypto.randomUUID();
    request?.abort();request=null;form.removeEventListener('submit',send);textarea.removeEventListener('input',input);exit.removeEventListener('click',onClose);
  };
}
