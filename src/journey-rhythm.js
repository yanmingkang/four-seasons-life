// Versioned, fictional workload rules. Only actual choices count, never elapsed
// time, skipped tiles, AI replies or a judgement of the player's personality.
export const RHYTHM_SCHEMA = 3;
// Keep schema 1–3 journals exactly replayable. New journeys charge five more
// points only for the selected incident's negative base mood, never for rest,
// a neutral option, or each subsequent talent/protection/fatigue calculation.
export const NEGATIVE_MOOD_SCHEMA = 4;
export const EXTRA_NEGATIVE_MOOD_COST = 5;
export const FATIGUE_MAX = 10;
// 2 = sustained pressure, 1 = extra work, 0 = ordinary pace, negative = rest.
// Explicitly authored per choice: overnight care is demanding despite its warmth.
export const CHOICE_EFFORT = Object.freeze([
  [0,1,-1],[1,1,1],[-2,-1,1],[1,1,2],[-2,1,-2],
  [2,0,1],[-2,0,-1],[1,0,2],[1,1,0],[2,-2,1],
  [2,0,1],[-3,1,-2],[2,1,1],[-3,-2,1],[1,0,0],
  [1,2,-2],[2,1,1],[2,2,1],[1,2,-3],[2,-2,1],
  [-3,1,-2],[0,1,1],[1,1,0],[-3,0,-3],[1,2,-2],
  [1,2,-1],[2,1,1],[0,0,2],[1,2,0],[0,2,0],
  [2,1,1],[-3,-2,-2],[1,1,2],[2,2,1],[-3,-3,-2],
  [1,1,0],[2,1,2],[-10,-5,-4],[-2,0,0],[0,0,0],
].map(row=>Object.freeze(row)));

export const hasRhythm = state => state.life?.schema >= RHYTHM_SCHEMA;
export const effortFor = (number,index) => CHOICE_EFFORT[number-1]?.[index] ?? 0;

export function resolveRhythmOption(state,option,index) {
  if(!hasRhythm(state))return option;
  const resolved={...option,effort:effortFor(state.active.number,index)};
  // Keep one rare, complete holiday (38). Everyday warmth restores a portion,
  // not a fresh full meter. Do not change schema 1/2 journals on replay.
  const recovery={12:20,24:20,35:25,39:15}[state.active.number];
  if(option.fillMood && recovery!==undefined){
    resolved.fillMood=false;resolved.mood=recovery;
    if(state.active.number===12)resolved.lesson='被陪伴的片刻可以缓一缓；恢复需要时间，不必一次整理好所有感受。';
  }
  // The engine has already resolved threshold success/failure before here.
  // Charge once before existing talent multipliers, shields and fatigue costs.
  if(state.life.schema>=NEGATIVE_MOOD_SCHEMA && resolved.mood<0){
    resolved.mood-=EXTRA_NEGATIVE_MOOD_COST;
  }
  return resolved;
}

export function settleStrain(previous,effort) {
  const before=previous||{fatigue:0,streak:0};
  const streak=effort>0?before.streak+1:0;
  const consecutive=effort===2?before.streak>=1:before.streak>=2;
  const addition=effort>0?effort+(consecutive?1:0):effort===0?-1:effort;
  const fatigue=Math.max(0,Math.min(FATIGUE_MAX,before.fatigue+addition));
  const cost=effort>0?Math.max(0,fatigue-3)*2:0;
  return {strain:{fatigue,streak},cost,change:fatigue-before.fatigue};
}

export function relieveStrain(life,amount) {
  if(life.schema<RHYTHM_SCHEMA||!life.strain)return;
  life.strain={fatigue:Math.max(0,life.strain.fatigue-amount),streak:0};
}

export function fatigueStatus(state) {
  if(!hasRhythm(state))return null;
  const f=state.life.strain.fatigue;
  return f>=8?{level:'high',label:'疲惫累积',hint:'这阵子承受了不少，留些时间恢复。'}:
    f>=4?{level:'medium',label:'有些疲惫',hint:'连续忙碌留下了疲惫，休息可以缓解。'}:
    {level:'low',label:'尚有余力',hint:'留意自己的节奏，也可以提前休息。'};
}
