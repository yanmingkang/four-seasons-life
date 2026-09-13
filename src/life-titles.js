// Titles describe replayed game experiences, never a personality or real-life outcome.
import {EVENTS} from './events.js';
import {getJourneyTitleReport} from './journey-titles.js';

export const LIFE_TITLES = Object.freeze([
  {id:'together',name:'琴瑟和鸣破局者',description:'实际留下多次共同生活或交流记录，也积累了专业经验；结局时没有冷战。仅为游戏称号。'},
  {id:'explorer',name:'小步经营探索者',description:'亲自开启合作、验证小样、确认试运营，并收到后续营业结算。仅为游戏称号。'},
  {id:'balanced',name:'小城慢调生活大师',description:'亲自选择留在本地，并多次留下休息或边界安排；结局时仍有情绪余量。仅为游戏称号。'},
  {id:'resilient',name:'东山再起患难伴侣',description:'记录中有低谷、其间的刘看雨支持，以及之后的恢复；结局时没有冷战。仅为游戏称号。'},
].map(Object.freeze));

const eventById=new Map(EVENTS.map(event=>[event.id,event]));
const finite=value=>typeof value==='number' && Number.isFinite(value);
const list=value=>Array.isArray(value)?value:[];
// Only these choices explicitly concern the two characters, not any generic
// "connect" choice (a colleague or an old friend is not proof of partner support).
const sharedChoices=new Map([[3,[0]],[10,[1,2]],[12,[0,1,2]],[15,[1,2]],[20,[1,2]],[23,[0,1,2]],[24,[0,1,2]]]);
const eventProof=record=>({kind:'event',eventId:record.eventId,turn:record.turn,choice:record.choice});
const transactionProof=record=>({kind:'transaction',action:record.command[0],choice:record.command[1],turn:record.turn,order:record.order});
const short=value=>value.length>30?`${value.slice(0,29)}…`:value;

// Keep the original strict experience-chain evaluator independent from the
// everyday title. Moving a rare title to a badge must never relax its proof.
export function getExperienceTitleReport(state={}) {
  const life=state.life||{},actions=list(life.actions);
  const history=list(state.history).filter(record=>record && Number.isInteger(record.turn) && record.turn>0 && Number.isInteger(record.choice) && eventById.get(record.eventId)?.options[record.choice] && finite(record.before?.mood) && finite(record.after?.mood)).slice().sort((a,b)=>a.turn-b.turn);
  const transactions=list(life.transactions).filter(record=>record && Number.isInteger(record.turn) && record.turn>=0 && Number.isInteger(record.order) && record.order>=0 && ['ready','choice','feedback'].includes(record.phase) && Array.isArray(actions[record.order]) && finite(record.before?.mood) && finite(record.after?.mood)).map(record=>({...record,command:actions[record.order],time:record.turn*1000+(record.phase==='choice'?500:100)+record.order})).sort((a,b)=>a.time-b.time);
  const partner=life.companion||{},finished=['complete','mood'].includes(state.ended) && history.length>0;
  const shared=history.filter(record=>sharedChoices.get(eventById.get(record.eventId).number)?.includes(record.choice));
  const talks=transactions.filter(record=>record.kind==='companion' && record.command[0]==='r' && ['listen','share','promise'].includes(record.command[1]));
  const support=[...shared.map(record=>({time:record.turn*1000-1,proof:eventProof(record)})),...talks.map(record=>({time:record.time,proof:transactionProof(record)}))];
  const lows=[],recovery=[];
  for(const record of history){
    const time=record.turn*1000,proof=eventProof(record);
    if(record.before.mood<=30)lows.push({time:time-200,recoverAfter:time,proof});
    if(record.after.mood<=30)lows.push({time,recoverAfter:time,proof});
    // A protected event's stored before/after can both be above 30. Match both
    // the consumed automatic item and that exact event's settlement note.
    if(/关东煮自动守护/.test(record.talentNote||'') && list(life.usedItems).some(item=>item?.id==='oden' && item.automatic===true && item.turn===record.turn-1)){
      const guard={...proof,kind:'automatic-oden'};
      lows.push({time:time-2,recoverAfter:time,proof:guard});
      support.push({time:time-1,proof:guard});
    }
    if(record.after.mood>=50)recovery.push({time,proof});
  }
  for(const record of transactions){
    // Only replay-recognised resource actions can provide a mood timeline.
    if(!['i','r','b'].includes(record.command[0]))continue;
    const proof=transactionProof(record);
    if(record.before.mood<=30)lows.push({time:record.time-0.1,recoverAfter:record.time-0.1,proof});
    if(record.after.mood<=30)lows.push({time:record.time,recoverAfter:record.time,proof});
    if(record.after.mood>=50)recovery.push({time:record.time,proof});
  }
  lows.sort((a,b)=>a.time-b.time);recovery.sort((a,b)=>a.time-b.time);
  const comeback=state.mood>=50?lows.flatMap(low=>{
    const recovered=recovery.find(point=>point.time>low.recoverAfter);
    return recovered?[{low,recovered,help:support.find(point=>point.time>=low.time && point.time<=recovered.time)}]:[];
  }):[];
  const supportedComeback=comeback.find(entry=>entry.help);
  const opening=history.find(record=>(record.eventId==='cell-29' && record.choice!==2)||(record.eventId==='cell-30' && record.choice===1));
  const tested=opening && transactions.find(record=>record.kind==='business' && record.command[0]==='b' && record.command[1]==='test' && record.time>opening.turn*1000);
  const launched=tested && transactions.find(record=>record.kind==='business' && record.command[0]==='b' && record.command[1]==='launch' && record.time>tested.time);
  const earned=launched && history.find(record=>record.turn*1000>launched.time && /小样试运营结算/.test(record.talentNote||'') && /小样试运营/.test(record.result||''));
  const local=history.find(record=>record.eventId==='cell-10' && record.choice===1);
  const restful=history.filter(record=>local && record.turn>local.turn && ['rest','boundary'].includes(eventById.get(record.eventId).options[record.choice].style));
  const growth=history.filter(record=>finite(record.expDelta) && record.expDelta>0);
  const together=shared.length+talks.length>=2 && growth.length>=2 && state.exp>=150 && partner.relationship>=70 && partner.coldWar===false;
  const business=!!earned && life.business?.stage==='operating' && life.business.earned>0;
  const balanced=!!local && restful.length>=2 && state.mood>=50;
  const resilient=!!supportedComeback && partner.relationship>=55 && partner.coldWar===false;
  const comebackReason=entry=>`在「${eventById.get(entry.low.proof.eventId)?.title||'一次生活行动'}」经历低落后，你在之后的经历里重新缓了过来。`;
  const details={
    together:{unlocked:together,reason:shared.length?`你在「${eventById.get(shared[0].eventId).title}」留出了陪伴，也把交流和专业积累带到了后来。`:'你不止一次与刘看雨认真交流，也在之后的工作中留下了积累。',evidence:[...shared.map(eventProof),...talks.map(transactionProof),...growth.slice(0,2).map(eventProof)]},
    explorer:{unlocked:business,reason:'从验证小样到试运营，你亲手推进了合作，并等到了后续营业结算。',evidence:business?[eventProof(opening),transactionProof(tested),transactionProof(launched),eventProof(earned)]:[]},
    balanced:{unlocked:balanced,reason:'春天，你把陪伴放进留在本地的计划；后来也不止一次给休息和边界留了位置。',evidence:balanced?[eventProof(local),...restful.slice(0,2).map(eventProof)]:[]},
    resilient:{unlocked:resilient,reason:supportedComeback?`「${eventById.get(supportedComeback.low.proof.eventId)?.title||'一次生活行动'}」之后的低落里，刘看雨的支持伴着你走向后来的恢复。`:'',evidence:resilient?[supportedComeback.low.proof,supportedComeback.help.proof,supportedComeback.recovered.proof]:[]},
  };
  const titles=LIFE_TITLES.map(title=>{const detail=details[title.id],unlocked=finished && detail.unlocked;return {...title,unlocked,reason:unlocked?detail.reason:'',evidence:unlocked?detail.evidence:[]};});
  const selected=titles.find(title=>title.unlocked);
  if(selected)return {title:selected.name,titleId:selected.id,titleReason:selected.reason,titleEvidence:selected.evidence,titles};
  if(finished && comeback.length)return {title:'重新出发的行路人',titleId:'restarted',titleReason:comebackReason(comeback[0]),titleEvidence:[comeback[0].low.proof,comeback[0].recovered.proof],titles};
  const remembered=history.find(record=>eventById.get(record.eventId).golden)||history.find(record=>eventById.get(record.eventId).cinematicId)||history[0];
  return {title:'四季行路人',titleId:'traveler',titleReason:remembered?`在「${eventById.get(remembered.eventId).title}」，你选择了${short(eventById.get(remembered.eventId).options[remembered.choice].label)}。`:'这一页还没有足够的经历记录，不急着给旅程命名。',titleEvidence:remembered?[eventProof(remembered)]:[],titles};
}

export function getLifeTitleReport(state={}) {
  const journey=getJourneyTitleReport(state),experience=getExperienceTitleReport(state);
  const commemorations=experience.titles.filter(item=>item.unlocked).map(({id,name,description,reason,evidence})=>({id,name,description,reason,evidence}));
  // A self-supported recovery is its own keepsake, never evidence of partner
  // support. The old evaluator only awards it after a recorded low and recovery.
  if(experience.titleId==='restarted')commemorations.push({id:'restarted',name:'重新出发的行路人',description:'本局有真实的低谷与之后的恢复，不推断现实人生。',reason:experience.titleReason,evidence:experience.titleEvidence});
  return {...journey,titles:experience.titles,commemorations};
}
