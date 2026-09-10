import { EVENTS, SEASONS } from './events.js';
import { routeFor } from './route.js';
export { routeFor } from './route.js';

export const SAVE_VERSION = 4;
export const RULES = Object.freeze({ money:5000, mood:100, exp:10, livingCost:0, fatigue:0 });
export const STYLE_NAMES = {earn:'努力开源', evidence:'认真求证', connect:'借助联结', rest:'照顾自己', boundary:'守住边界', invest:'投入成长', spend:'维系体面'};
export const TALENTS = Object.freeze({ defense:'稳健防守', ambitious:'锐意进取', optimistic:'乐天知命' });

export function newGame(mode = 'full', options = {}) {
  const talent = options.talent ?? 'defense';
  if (!Object.hasOwn(TALENTS,talent)) throw new Error('未知的开局天赋');
  const name = typeof options.name === 'string' ? options.name.trim().replace(/[<>\u0000-\u001f]/g,'').slice(0,16) : '';
  return {mode,total:routeFor(mode).length,name:name || '刘看山',talent,memoUsed:false,
    money:RULES.money,mood:RULES.mood,moodMax:RULES.mood,exp:RULES.exp,
    turn:0,season:0,position:-1,phase:'ready',die:null,active:null,history:[],ended:null,seasonRecovery:0};
}

export function rollDice(random = Math.random) {
  const n = random();
  if (!Number.isFinite(n) || n < 0 || n >= 1) throw new Error('骰子随机数必须在 [0,1)');
  return Math.floor(n * 6) + 1;
}

export function land(state, die) {
  if (state.phase !== 'ready') return state;
  if (!Number.isInteger(die) || die < 1 || die > 6) throw new Error('骰子只能是 1 至 6');
  const route = routeFor(state.mode);
  const position = Math.min(state.position + die, route.length - 1);
  const active = EVENTS[route[position]];
  if (!active) throw new Error('路线指向不存在的地点');
  const seasonRecovery = state.talent === 'optimistic' ? Math.max(0,active.season-state.season)*15 : 0;
  return {...state,position,season:active.season,die,active,phase:'choice',seasonRecovery};
}

export function previewChoice(state, option) {
  const expBefore = state.exp ?? RULES.exp;
  const threshold = option.threshold;
  const eligible = !threshold || expBefore >= threshold.exp;
  const resolved = threshold ? {...option,...(eligible ? threshold.success : threshold.failure)} : option;
  let moodChange = resolved.mood;
  let expChange = resolved.exp ?? 0;
  const notes = [];
  let memoUsed = state.memoUsed;
  if (state.talent === 'ambitious') {
    if (expChange > 0) { expChange = Math.round(expChange*1.2); notes.push('进取天赋：专业收益 +20%'); }
    if (moodChange < 0) { moodChange = -Math.ceil(-moodChange*1.1); notes.push('进取天赋：负面情绪消耗 +10%'); }
  }
  if (state.talent === 'defense' && !memoUsed && state.active?.id === 'cell-13' && moodChange < 0) {
    moodChange = 0; memoUsed = true; notes.push('留痕备忘录：抵挡本次甩锅情绪消耗（仅一次）');
  }
  const disabled = resolved.money < 0 && state.money < -resolved.money;
  const disabledReason = disabled ? `储备金不足，需要 ${(-resolved.money).toLocaleString('zh-CN')} 元；可选择不预付的方案` : '';
  const moodMax = (state.moodMax ?? RULES.mood)+(resolved.moodMaxBonus ?? 0);
  const money = disabled ? state.money : state.money + resolved.money;
  const mood = disabled ? state.mood : resolved.fillMood ? moodMax : Math.max(0,Math.min(moodMax,state.mood+moodChange+(state.seasonRecovery || 0)));
  const exp = disabled ? expBefore : Math.max(0,expBefore+expChange);
  if (state.seasonRecovery) notes.push(`跨季恢复：情绪 +${state.seasonRecovery}，不超过上限`);
  const conditionNote = threshold ? `本局规则：专业达到 ${threshold.exp} 点进入准备充分分支（当前 ${expBefore}）；${eligible?'条件已满足':'条件未满足，按准备不足分支结算'}。不是现实成功率。` : '';
  return {money,mood,moodMax,exp,moneyDelta:money-state.money,moodDelta:mood-state.mood,expDelta:exp-expBefore,
    moneyCost:0,moodCost:0,fatal:!disabled && mood===0,disabled,disabledReason,conditionNote,
    result:resolved.result,lesson:resolved.lesson,talentNote:notes.join('；'),memoUsed,eligible};
}

export function choose(state, index) {
  if (state.phase !== 'choice') return state;
  const o=state.active.options[index];
  if (!Number.isInteger(index) || !o) throw new Error('无效的选择');
  const settled=previewChoice(state,o);
  if (settled.disabled) throw new Error(settled.disabledReason);
  const record={turn:state.turn+1,season:state.season,tile:routeFor(state.mode)[state.position],position:state.position,die:state.die,
    eventId:state.active.id,title:state.active.title,choice:index,choiceLabel:o.label,style:o.style,
    isChoice:state.active.isChoice,result:settled.result,lesson:settled.lesson,sources:state.active.sources,
    before:{money:state.money,mood:state.mood,exp:state.exp,moodMax:state.moodMax},
    after:{money:settled.money,mood:settled.mood,exp:settled.exp,moodMax:settled.moodMax},
    moneyDelta:settled.moneyDelta,moodDelta:settled.moodDelta,expDelta:settled.expDelta,
    conditionNote:settled.conditionNote,talentNote:settled.talentNote};
  const ended=settled.mood===0 ? 'mood' : state.position===routeFor(state.mode).length-1 ? 'complete' : null;
  return {...state,money:settled.money,mood:settled.mood,moodMax:settled.moodMax,exp:settled.exp,memoUsed:settled.memoUsed,
    turn:state.turn+1,history:[...state.history,record],ended,phase:'feedback',seasonRecovery:0};
}

export function advance(state) {
  if (state.phase !== 'feedback') return state;
  if (state.ended) return {...state,phase:'finished',active:null};
  return {...state,phase:'ready',active:null,die:null};
}

export function snapshot(state) {
  return {version:SAVE_VERSION,mode:state.mode,name:state.name,talent:state.talent,phase:state.phase,
    moves:state.history.map(h=>({die:h.die,choice:h.choice})),pendingDie:state.phase==='choice'?state.die:null};
}

export function restore(saved) {
  try {
    if (saved?.version!==SAVE_VERSION || !['full','demo'].includes(saved.mode) || !Array.isArray(saved.moves) ||
      !['ready','choice','feedback','finished'].includes(saved.phase) || typeof saved.name !== 'string' ||
      !Object.hasOwn(TALENTS,saved.talent) || (saved.phase!=='choice' && saved.pendingDie!==null)) return null;
    let s=newGame(saved.mode,{name:saved.name,talent:saved.talent});
    if(saved.moves.length>s.total || s.name!==saved.name) return null;
    for(let i=0;i<saved.moves.length;i++) {
      if(s.phase!=='ready') return null;
      const m=saved.moves[i];
      s=choose(land(s,m.die),m.choice);
      if(i<saved.moves.length-1 || saved.phase!=='feedback') s=advance(s);
    }
    if(saved.phase==='choice') s=land(s,saved.pendingDie);
    if(s.phase!==saved.phase) return null;
    return s;
  } catch { return null; }
}

export function summarize(state) {
  const keyChoices=state.history.filter(h=>h.isChoice);
  const counts={};
  for(const h of keyChoices) counts[h.style]=(counts[h.style]||0)+1;
  const style=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]?.[0];
  const endings={mood:['下一站，先照顾自己','情绪归零，这一程暂时结束。你的努力没有被抹去；暂停只是游戏结果，不是对现实人生的判断。'],
    complete:state.mood>=55 && state.money>=4500 ? ['有余量的生活家','你带着生活储备和心里的余量走过四季。每一次取舍都在描画自己的生活。'] :
      state.mood<30 ? ['努力赶路，也记得休息','你完成了这段旅程。收入和经历很珍贵，也请为恢复精力留一点空间。'] :
      state.money<2200 ? ['把日子过得有温度','你完成了旅程，也付出了生活预算。资金归零并不是这局的失败条件，下一程仍可重新积累。'] :
      ['走出了，自己的四季','你没有拿到一张标准答案，而是留下了一段属于自己的行程。']};
  const [title,description]=endings[state.ended] || ['这一程的记录','回看已经做出的选择。'];
  const highestCost=[...state.history].filter(h=>h.moneyDelta<0).sort((a,b)=>a.moneyDelta-b.moneyDelta)[0];
  const biggestDrain=[...state.history].filter(h=>h.moodDelta<0).sort((a,b)=>a.moodDelta-b.moodDelta)[0];
  const professionalTier=state.exp>=150 ? '独立咨询阶段' : state.exp>=70 ? '项目骨干阶段' : state.exp>=30 ? '完成转正准备' : '新人积累阶段';
  return {title,description,style:style ? STYLE_NAMES[style] : '尚未经历分叉选择',counts,highestCost,biggestDrain,professionalTier,keyChoices,
    observations:[`本局专业底气 ${state.exp} 点：${professionalTier}，只代表游戏进度。`,
      highestCost ? `「${highestCost.title}」是本局最大支出，可回看当时的取舍。` : '这一程没有发生支出，不代表现实生活无需预算。',
      `实际停靠 ${state.turn} 处、做出 ${keyChoices.length} 次选择；骰子跨过的格子不算亲历。`],
    sourceIds:[...new Set(state.history.flatMap(h=>h.sources))],seasons:[...new Set(state.history.map(h=>h.season))].map(s=>SEASONS[s].name)};
}
