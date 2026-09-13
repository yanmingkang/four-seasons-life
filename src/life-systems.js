// Fictional, deterministic game systems. None of these meters describe a real person.
import {hasRhythm,settleStrain,relieveStrain} from './journey-rhythm.js';
import {getLifeTitleReport} from './life-titles.js';
export {LIFE_TITLES} from './life-titles.js';
export const LIFE_SCHEMA = 4;
export const LIFE_SCHEMAS = Object.freeze([1,2,3,4]);
export const LIFE_ACTION_LIMIT = 224;
export const LIFE_SAVE_BYTES = 8192;
export const HOME_RULES = Object.freeze({downPayment:60000,principal:240000,payment:2000});
const LEGACY_ITEM_DEFS = Object.freeze([
  {id:'memo',name:'留痕备忘录',description:'收好记录，抵挡下一次职场事件的负面情绪；仅一次。',price:0},
  {id:'earplugs',name:'降噪耳塞',description:'接下来的三次事件结算，负面情绪减少三成。',price:0},
  {id:'coffee',name:'冰美式',description:'花费 100 元，恢复 20 点情绪；每回合最多一杯。',price:100},
  {id:'onsen',name:'温泉旅行券',description:'花费 10,000 元，上限增加 10 点并恢复全部情绪。',price:10000},
  {id:'mentor',name:'前辈便签',description:'当前选择时提出中立的思考问题，不提供最佳选项或统计。',price:0},
  {id:'legal',name:'法务指南',description:'整理留痕和协商问题，下次争议事件的情绪消耗减半；不保证现实法律结果。',price:0},
  {id:'communication',name:'沟通修复卡',description:'约好一次重新沟通，解除本局冷战状态。',price:0},
  {id:'oden',name:'热关东煮',description:'情绪低于 20 时可用，恢复 35 点情绪。',price:0},
].map(Object.freeze));
export const ITEM_DEFS = Object.freeze([
  {id:'memo',name:'留痕备忘录',category:'防御型道具',useMode:'手动准备 / 稳健天赋自动',description:'准备后免疫下一次职场事件的负面情绪；稳健防守型首次遇到第 13 格甩锅时可自动触发。',scene:'职场留痕、责任争执与需求沟通；只保护情绪，不改变资金或专业。',acquisition:'稳健防守型开局 1 份；实际完成第 4、25 格各获得 1 份。',limits:'每份仅一次。提前使用开局备忘录，会消耗首次甩锅的自动保护。',price:0},
  {id:'earplugs',name:'物理降噪耳塞',category:'被动防护道具',useMode:'手动装备 / 持续 3 次结算',description:'装备后，接下来的 3 次事件结算中，免疫流言或攀比事件的负面情绪。',scene:'第 8 格「未经确认的合并风声」、第 22 格「名片之间的比较」。',acquisition:'开局 1 副；实际完成第 11 格再获得 1 副。',limits:'其他事件不减伤，但同样消耗 1 次持续次数；效果期间不能重复装备。',price:0},
  {id:'coffee',name:'咖啡续命兑换券',category:'即时消耗道具',useMode:'背包手动使用',description:'消耗 100 元（0.01 万元）与 1 张券，立即恢复 20 点情绪。',scene:'赶工后或情绪不足时，随时给自己一小段休息。',acquisition:'开局 2 张；实际完成第 14、35 格各获得 1 张。',limits:'每回合最多 1 杯；情绪已满不可用，恢复不超过上限。',price:100},
  {id:'onsen',name:'深山温泉度假卡',category:'高阶恢复道具',useMode:'秋冬季手动使用',description:'消耗 10,000 元（1 万元），情绪上限永久增加 10 点，并恢复至新上限。',scene:'秋季或冬季，留出一段完整的休假。',acquisition:'开局 1 张；实际完成第 38 格再获得 1 张。',limits:'仅秋冬可用；本局上限最多 180 点，每回合最多用 1 张。',price:10000},
  {id:'mentor',name:'前辈长谈便签',category:'策略型锦囊',useMode:'遇到选择时手动使用',description:'展开当前选项的游戏规则预览与待核实问题，帮助比较取舍。',scene:'尤其适合第 10、20、30 格黄金抉择，也可用于其他选择。',acquisition:'开局 1 张；实际完成第 5、16 格各获得 1 张。',limits:'仅展示本局确定规则与实际来源，不把案例当成功率，也不指定最佳人生路线。',price:0},
  {id:'legal',name:'劳动合同法务指南',category:'防御反击道具',useMode:'手动准备 / 下次争议触发',description:'准备留痕与协商清单，下次争议事件的负面情绪消耗减半。',scene:'第 13、27、31、36 格的责任、合同与协商场景。',acquisition:'开局 1 份；实际完成第 27 格再获得 1 份。',limits:'每份仅一次，不额外发放补偿；本局数值不代表现实中必定获得 N+2。',price:0},
  {id:'communication',name:'非暴力沟通回执卡',category:'情感调解道具',useMode:'冷战时手动使用',description:'解除当前冷战，关系值恢复 20 点，重新约好沟通。',scene:'共同生活发生摩擦后，与刘看雨把需要温和说清。',acquisition:'开局 1 张；实际完成第 23 格再获得 1 张。',limits:'仅冷战时可用；关系不超过 100，异地状态仍由你们的路线决定。',price:0},
  {id:'oden',name:'深夜一盒温热关东煮',category:'羁绊守护道具',useMode:'低情绪自动守护 / 也可手动',description:'事件结算后情绪低于 20 点，背包有库存便自动消耗 1 份，恢复 35 点情绪。',scene:'刘看雨带来一份热食，先接住这次低落。',acquisition:'开局 1 份；实际完成第 12、32 格各获得 1 份。',limits:'低于 20 点时也可手动使用；恢复不超过上限。自动守护优先于每局一次的树洞保护。',price:0},
].map(Object.freeze));
export const INVENTORY_ITEMS = ITEM_DEFS;
const itemDefs=state=>(state.life?.schema===1?LEGACY_ITEM_DEFS:ITEM_DEFS).map(item=>{
  if(item.id==='mentor')return {...item,description:'留下一组中立问题，帮你核对条件、表达需要，不揭示选项收益。',limits:'不预测结果，不比较数值，也不指定最佳人生路线。'};
  if(hasRhythm(state)&&item.id==='coffee')return {...item,description:item.description+' 这段休息也会缓解疲惫。',limits:'每回合最多 1 杯；情绪已满且没有疲惫时不可用。'};
  if(hasRhythm(state)&&item.id==='onsen')return {...item,description:item.description+' 完整休假也会清除积累的疲惫。'};
  if(hasRhythm(state)&&['memo','earplugs','legal'].includes(item.id))return {...item,description:item.description+' 保护事件本身的消耗，不抹去之前累积的疲惫。'};
  return item;
});
const ITEM_IDS = new Set(ITEM_DEFS.map(item=>item.id));
const WORK_CELLS = new Set([4,6,8,9,11,13,16,17,19,25,26,27,31,34,36]);
const LEGAL_CELLS = new Set([13,27,31,36]);
const NOISE_CELLS = new Set([8,22]);
const DROP_TABLE = {4:'memo',5:'mentor',11:'earplugs',12:'oden',14:'coffee',16:'mentor',23:'communication',25:'memo',27:'legal',32:'oden',35:'coffee',38:'onsen'};
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const copy=life=>({...life,...(life.strain?{strain:{...life.strain}}:{}),inventory:{...life.inventory},buffs:{...life.buffs},companion:{...life.companion,interactions:[...life.companion.interactions]},flags:{...life.flags},chains:[...life.chains],business:{...life.business},loan:life.loan?{...life.loan}:null,usedItems:[...life.usedItems],transactions:[...life.transactions],notices:[...life.notices]});

export function createLife(talent,schema=LIFE_SCHEMA) {
  return {schema,...(schema>=3?{strain:{fatigue:0,streak:0}}:{}),actions:[],inventory:{memo:talent==='defense'?1:0,earplugs:1,coffee:2,onsen:1,mentor:1,legal:1,communication:1,oden:1},
    buffs:{earplugs:0,memo:false,legal:false,longTerm:false,resilience:false},
    companion:{name:'刘看雨',relationship:55,longDistance:false,coldWar:false,supportTurns:0,interactions:[],lastMessage:'把彼此的生活放进计划，也给不同的感受留一点位置。'},
    flags:{},chains:[],business:{stage:'none',lastTurn:-1,earned:0},loan:null,homePlanned:false,treeholeUsed:false,usedItems:[],transactions:[],mentorQuestion:'',notices:[]};
}

function recordLifeTransaction(before,after,kind,title) {
  const values=state=>({money:state.money,mood:state.mood,exp:state.exp,moodMax:state.moodMax});
  const record={transaction:true,kind,title,choiceLabel:title,turn:before.turn,phase:before.phase,order:before.life.actions.length,
    before:values(before),after:values(after),moneyDelta:after.money-before.money,moodDelta:after.mood-before.mood,expDelta:after.exp-before.exp,
    result:after.life.notices.join(' '),lesson:'这是本局独立生活行动的实际结算，不另算一次路线停靠。'};
  return {...after,life:{...after.life,transactions:[...after.life.transactions,record]}};
}

export function appendLifeAction(state,action) {
  if(!state.life)return state;
  if(state.life.actions.length>=LIFE_ACTION_LIMIT)throw new Error('本局行动记录已达上限');
  return {...state,life:{...state.life,actions:[...state.life.actions,action]}};
}

function requireLive(state) {
  if(!state.life || state.ended || !['ready','choice','feedback'].includes(state.phase) || state.mood<=0)throw new Error('此时不能进行生活行动');
}

export function itemDisabledReason(state,id) {
  const item=itemDefs(state).find(entry=>entry.id===id);
  if(!item)return '未知道具';
  if(!state.life || state.ended || !['ready','choice','feedback'].includes(state.phase) || state.mood<=0)return '本局已结束或未启用生活扩展';
  if(!state.life.inventory[id])return '背包中暂时没有这件道具';
  if(state.life.usedItems.some(entry=>entry.turn===state.turn && entry.id===id))return '本回合已经使用过';
  if(state.money<item.price)return `储备金不足，需要 ${item.price.toLocaleString('zh-CN')} 元`;
  if(id==='onsen' && state.life.schema>=2 && state.season<2)return '秋季或冬季才能安排温泉假期';
  if(id==='mentor' && state.phase!=='choice')return '遇到选择时再打开这张便签';
  if(id==='memo' && state.life.buffs.memo)return '已准备一份留痕记录';
  if(id==='earplugs' && state.life.buffs.earplugs>0)return '耳塞效果仍在持续';
  if(id==='legal' && state.life.buffs.legal)return '已准备协商清单';
  if(id==='communication' && !state.life.companion.coldWar)return '目前没有需要解除的冷战';
  if(id==='oden' && state.mood>=20)return '情绪低于 20 时才能使用';
  if(id==='coffee' && state.mood===state.moodMax && !(hasRhythm(state)&&state.life.strain.fatigue>0))return '情绪已满，暂时无需补充';
  return '';
}

export function getInventory(state) {
  return itemDefs(state).map(item=>({...item,count:state.life?.inventory[item.id]||0,usable:!itemDisabledReason(state,item.id),disabledReason:itemDisabledReason(state,item.id),...(item.id==='earplugs'?{remaining:state.life?.buffs.earplugs||0}:{})}));
}

export function useItem(state,id) {
  requireLive(state);
  if(typeof id!=='string' || !ITEM_IDS.has(id))throw new Error('未知道具');
  const disabled=itemDisabledReason(state,id); if(disabled)throw new Error(disabled);
  const life=copy(state.life),item=itemDefs(state).find(entry=>entry.id===id);
  life.inventory[id]--; life.usedItems.push({id,turn:state.turn});
  let mood=state.mood,moodMax=state.moodMax,memoUsed=state.memoUsed;
  if(id==='memo'){life.buffs.memo=true;memoUsed=true;}
  if(id==='earplugs')life.buffs.earplugs=3;
  if(id==='coffee')mood=Math.min(moodMax,mood+20);
  if(id==='onsen'){moodMax=Math.min(180,moodMax+10);mood=moodMax;}
  if(id==='mentor')life.mentorQuestion=life.schema===1?`面对「${state.active.title}」，你目前已核实哪些条件？哪项安排需要与相关人确认？做完选择后，准备怎样回看这次取舍？`:`面对「${state.active.title}」，先比较下方各方案在本局的资金、情绪与专业变化，再想一想：哪些条件已核实？哪些承诺需要与相关人确认？你更愿意承担哪一种代价？来源经验可帮助提问，但不代表你的未来结果。`;
  if(id==='legal')life.buffs.legal=true;
  if(id==='communication'){life.companion.coldWar=false;life.companion.relationship=clamp(life.companion.relationship+(life.schema===1?10:20),0,100);life.companion.lastMessage='你们约好重新开口，把尚未说清的事分开讨论。';}
  if(id==='oden')mood=Math.min(moodMax,mood+35);
  if(hasRhythm(state)){
    if(id==='coffee')relieveStrain(life,2);
    if(id==='onsen')relieveStrain(life,10);
    if(id==='mentor')life.mentorQuestion='哪些条件已经确认？你现在最想照顾什么？还有哪件事需要和对方商量？';
  }
  life.notices=[`已使用${item.name}${item.price?`，支出 ${item.price.toLocaleString('zh-CN')} 元`:''}。`];
  if(life.strain?.fatigue<state.life.strain?.fatigue)life.notices.push('停下来歇了一会儿，积累的疲惫缓解了。');
  return appendLifeAction(recordLifeTransaction(state,{...state,money:state.money-item.price,mood,moodMax,memoUsed,life},'item',`使用${item.name}`),['i',id]);
}

export function getCompanion(state) {
  if(!state.life)return null;
  const companion=state.life.companion;
  const canInteract=!state.ended && ['ready','choice','feedback'].includes(state.phase) && !companion.interactions.some(entry=>entry.season===state.season);
  return {...companion,status:companion.coldWar?'冷战中':companion.longDistance?'异地相处':'一起生活',canInteract,disabledReason:canInteract?'':state.ended?'这一程已经结束':'本季已经进行过一次专心交流'};
}

export function interactCompanion(state,choice) {
  requireLive(state);
  if(!['listen','share','promise'].includes(choice))throw new Error('无效的伴侣交流');
  if(!getCompanion(state).canInteract)throw new Error('每季只能进行一次伴侣交流');
  const life=copy(state.life),c=life.companion;
  c.interactions.push({season:state.season,choice,turn:state.turn});
  let mood=state.mood,exp=state.exp;
  if(choice==='listen'){c.relationship=clamp(c.relationship+12,0,100);mood=Math.min(state.moodMax,mood+6);c.lastMessage='刘看雨说完最近的担心，你把自己的理解复述给对方听。';}
  if(choice==='share'){c.relationship=clamp(c.relationship+7,0,100);mood=Math.min(state.moodMax,mood+3);exp+=5;c.lastMessage='你们各自分享一件真实经历，也承认还有没想清的部分。';}
  if(choice==='promise'){c.relationship=clamp(c.relationship+9,0,100);c.supportTurns=2;c.coldWar=false;c.lastMessage='你们约定下一次联系和分工，接下来的两次事件会有彼此的支持。';}
  life.notices=[c.lastMessage];
  return appendLifeAction(recordLifeTransaction(state,{...state,life,mood,exp},'companion',`与刘看雨${{listen:'专心倾听',share:'分享经历',promise:'约定下一次'}[choice]}`),['r',choice]);
}

function cause(flag,target,text){return {id:`${flag.eventId}-${target}`,from:flag.eventId,to:target,choice:flag.choice,reason:text};}

export function enrichLanding(state,event) {
  const life=copy(state.life),causes=[];
  const spring=life.flags.spring,summer=life.flags.summer,autumn=life.flags.autumn;
  if(spring && event.season===1) {
    const text=spring.choice===0?'春天在高铁口接下远方岗位，留下了异地安排；这次你们需要先核对行程和能提供的支持。':spring.choice===1?'春天在高铁口选择留在本地，日历上留下共同生活的时间；这一季仍要持续商量工作和分工。':'春天选择短期驻场，往返的经历给了你比较两种节奏的具体依据。';
    causes.push(cause(spring,event.id,text));
  }
  if(summer && event.season>=2) {
    const text=summer.choice===0?'夏天接受外派之后，远程支持成为日常；面对眼前的家事，你们先约定联系时间与实际能承担的部分。':summer.choice===1?'夏天暂缓外派，为陪伴留出的时间延续到现在；新的计划可以从共同能承担的节奏开始。':'夏天约好的分段外派仍在执行，眼前的安排需要和下一次返程日期对齐。';
    causes.push(cause(summer,event.id,text));
  }
  if(autumn && event.season===3)causes.push(cause(autumn,event.id,autumn.choice===0?(life.loan?'秋天的安家规划已经落实首付，接下来需要安排每次停靠后的房贷付款。':'秋天选择了安家方向，目前仍在规划阶段，买房需要另行确认首付。'):autumn.choice===1?'秋天为小规模创业验证保留了空间，之前记录的需求现在可以继续试验与复盘。':'秋天决定维持目前住处，年度计划给这次取舍留出了缓冲。'));
  if(['idea','tested','awaiting'].includes(life.business.stage))causes.push({id:`business-${event.id}`,from:life.business.origin||'cell-29',to:event.id,reason:life.business.stage==='idea'?'合作邀请仍停留在需求设想，你可以进行一次有预算上限的小样验证。':life.business.stage==='tested'?'小样验证留下了反馈；你可以据此试运营，也可以停止投入。':'试运营已安排，完成眼前事件后将按事先写明的游戏规则结算。'});
  for(const item of causes)if(!life.chains.some(chain=>chain.id===item.id))life.chains.push(item);
  life.mentorQuestion='';life.notices=[];
  return {...state,life,active:causes.length?{...event,scene:`${event.scene}\n\n${causes.map(entry=>entry.reason).join('\n')}`,dynamicScene:causes.map(entry=>entry.reason).join('\n'),causes}:event};
}

// Called on the already resolved base option, before the ledger is committed.
export function previewLife(state,resolved,baseMoodChange) {
  const life=copy(state.life),notes=[];
  let moodChange=baseMoodChange,moneyChange=0,expChange=0,resultSuffix='';
  let memoUsed=state.memoUsed;
  const number=state.active.number;
  if(moodChange<0 && WORK_CELLS.has(number) && (life.buffs.memo || (state.talent==='defense' && !memoUsed && number===13 && life.inventory.memo>0))) {
    if(life.buffs.memo)life.buffs.memo=false;else life.inventory.memo--;
    moodChange=0;memoUsed=true;notes.push('留痕备忘录抵挡本次职场情绪消耗；道具已消耗一次');
  }
  if(moodChange<0 && life.buffs.legal && LEGAL_CELLS.has(number)){moodChange=-Math.ceil(-moodChange/2);life.buffs.legal=false;notes.push('法务指南帮助整理协商清单，本局争议情绪消耗减半；不是现实法律保证');}
  if(moodChange<0 && life.buffs.earplugs>0 && (life.schema===1 || NOISE_CELLS.has(number))){
    moodChange=life.schema===1?-Math.ceil(-moodChange*0.7):0;
    notes.push(life.schema===1?'降噪耳塞：负面情绪消耗减少三成':'物理降噪耳塞：本次流言或攀比引起的情绪消耗已免疫');
  }
  if(moodChange<0 && life.buffs.longTerm){moodChange=-Math.ceil(-moodChange*0.8);notes.push('长期主义：负面情绪消耗减少两成');}
  if(moodChange<0 && life.buffs.resilience){moodChange=-Math.ceil(-moodChange*0.8);notes.push('韧性练习：负面情绪消耗减少两成');}
  if(moodChange<0 && life.companion.supportTurns>0 && !life.companion.coldWar){moodChange=Math.min(0,moodChange+3);notes.push('共同约定：本次情绪消耗减少 3 点');}
  if(life.buffs.earplugs>0)life.buffs.earplugs--;
  if(life.companion.supportTurns>0)life.companion.supportTurns--;
  if(hasRhythm(state)){
    if(notes.some(note=>/备忘录|耳塞|法务指南/.test(note)))notes.push('道具防护仅作用于事件本身，不抵消之前累积的疲惫');
    const fatigue=settleStrain(life.strain,resolved.effort??0);
    life.strain=fatigue.strain;moodChange-=fatigue.cost;
    if(fatigue.cost)notes.push(`累积疲惫：本次额外消耗 ${fatigue.cost} 点情绪；休息能够缓解`);
    else if(fatigue.change>0)notes.push('这次忙碌留下了疲惫；休息能够缓解');
    else if(fatigue.change<0)notes.push('节奏放缓，积累的疲惫有所缓解');
  }
  if(life.loan && life.loan.remaining>0){
    const due=Math.min(life.loan.remaining,HOME_RULES.payment);
    if(state.money+resolved.money>=due){moneyChange-=due;life.loan.remaining-=due;life.loan.paid+=due;notes.push(`房贷按次还款 ${due.toLocaleString('zh-CN')} 元`);}
    else{life.loan.deferred++;notes.push('本次储备不足，房贷延期一次；资金不会变成负数');}
  }
  if(life.business.stage==='awaiting'){life.business.stage='operating';life.business.earned+=12000;moneyChange+=12000;expChange+=10;resultSuffix='此前的小样试运营完成了本局约定的交付，收到 12,000 元游戏营业收入。';notes.push('小样试运营结算：收入 12,000 元、专业积累 10 点；不是现实回报预测');}
  return {life,moodChange,moneyChange,expChange,memoUsed,notes,resultSuffix};
}

export function settleLife(state,index,settled) {
  const life=settled.lifePreview || copy(state.life),number=state.active.number,c=life.companion;
  const notes=[];
  if([10,20,30].includes(number)) {
    const key={10:'spring',20:'summer',30:'autumn'}[number];
    life.flags[key]={eventId:state.active.id,choice:index,label:state.active.options[index].label,turn:state.turn+1};
  }
  if(number===10 || number===20){
    c.longDistance=index!==1;c.relationship=clamp(c.relationship+(index===0?-12:index===1?12:-3),0,100);
    if(c.longDistance && c.relationship<35)c.coldWar=true;
  }
  if(number===15 && index===0){c.relationship=clamp(c.relationship-10,0,100);c.coldWar=true;notes.push(life.schema===1?'你们暂时进入冷战；每季交流或沟通修复卡可以推进重新沟通。':'你们暂时进入冷战；每季交流中的「约定下一次」，或背包里的非暴力沟通回执卡，都可以推进重新沟通。');}
  if([3,12,18,23,24,35].includes(number) && state.active.options[index].style==='connect')c.relationship=clamp(c.relationship+6,0,100);
  if(number===21){life.buffs.longTerm=true;notes.push('获得长期主义：今后的负面情绪消耗减少两成。');}
  if(number===32){life.buffs.resilience=true;notes.push('获得韧性练习：今后的负面情绪消耗减少两成，仅表示游戏机制。');}
  if(number===29 && index!==2 && life.business.stage==='none'){life.business={stage:'idea',origin:'cell-29',lastTurn:-1,earned:0};notes.push('合作支线开启：可在生活面板验证小样，再决定试运营或停止。');}
  if(number===30 && index===1 && life.business.stage==='none'){life.business={stage:'idea',origin:'cell-30',lastTurn:-1,earned:0};notes.push('探索支线开启：先验证小样，再决定后续投入。');}
  if(number===30 && index===0){life.homePlanned=true;notes.push('安家计划已建立；储备足够时，可在生活面板明确确认首付。');}
  const drop=DROP_TABLE[number];
  if(drop && life.inventory[drop]<6){life.inventory[drop]++;notes.push(`收获道具：${itemDefs(state).find(item=>item.id===drop).name}。`);}
  life.notices=notes;
  return {...settled,lifePreview:life,lifeNote:notes.join(' ')};
}

export function getHome(state) {
  if(!state.life)return null;
  const canBuy=state.life.homePlanned && !state.life.loan && !state.ended && ['ready','feedback'].includes(state.phase) && state.money>=HOME_RULES.downPayment;
  return {...HOME_RULES,planned:state.life.homePlanned,owned:!!state.life.loan,loan:state.life.loan,canBuy,disabledReason:canBuy?'':state.ended?'本局已经结束':state.life.loan?'已支付首付':!state.life.homePlanned?'需先在第 30 格建立安家计划':state.phase==='choice'?'请先完成眼前的选择':'首付需要 60,000 元储备金'};
}

export function purchaseHome(state) {
  requireLive(state);const home=getHome(state);if(!home.canBuy)throw new Error(home.disabledReason);
  const life=copy(state.life);life.loan={principal:HOME_RULES.principal,remaining:HOME_RULES.principal,paid:0,deferred:0,purchasedTurn:state.turn};
  const text='安家规划之后，你明确确认了购买：支付 60,000 元首付，形成 240,000 元游戏房贷；以后每次事件结算尝试还款 2,000 元，储备不足会记为延期。';
  life.notices=[text];
  const history=state.history.map(record=>record.eventId==='cell-30' && record.choice===0?{...record,result:text,lesson:'这是追加确认后的游戏资产结果；房屋价格、房贷和延期机制都是剧情规则，不是现实购房或信贷建议。'}:record);
  return appendLifeAction(recordLifeTransaction(state,{...state,money:state.money-HOME_RULES.downPayment,history,life},'home','确认安家首付'),['h']);
}

export function getBusiness(state) {
  if(!state.life)return null;
  const business=state.life.business,live=!state.ended && ['ready','choice','feedback'].includes(state.phase) && business.lastTurn!==state.turn;
  return {...business,canTest:live && business.stage==='idea' && state.money>=2000 && state.mood>5,canLaunch:live && business.stage==='tested' && state.money>=8000,canPause:live && ['idea','tested'].includes(business.stage)};
}

export function interactBusiness(state,choice) {
  requireLive(state);const available=getBusiness(state);
  if(!['test','launch','pause'].includes(choice) || !available[{test:'canTest',launch:'canLaunch',pause:'canPause'}[choice]])throw new Error('当前不能进行这项合作支线行动');
  const life=copy(state.life);life.business.lastTurn=state.turn;
  let money=state.money,mood=state.mood,exp=state.exp;
  if(choice==='test'){life.business.stage='tested';money-=2000;mood-=5;exp+=10;life.notices=['你用 2,000 元制作小样，记录真实需求和未解决的问题；专业积累增加 10，准备消耗 5 点情绪。'];}
  if(choice==='launch'){life.business.stage='awaiting';money-=8000;life.notices=['你确认 8,000 元的试运营预算；下一次完成事件后按本局规则结算 12,000 元营业收入。'];}
  if(choice==='pause'){life.business.stage='closed';life.notices=['你把现有记录收好，向伙伴说明这轮验证先到这里，没有继续追加投入。'];}
  return appendLifeAction(recordLifeTransaction(state,{...state,life,money,mood,exp},'business',`合作支线：${{test:'验证小样',launch:'确认试运营',pause:'暂停验证'}[choice]}`),['b',choice]);
}

export function rescueTreehole(state,mood,life,moodMax=state.moodMax) {
  if(life.schema>=2 && mood<20 && life.inventory.oden>0){
    const next={...life,inventory:{...life.inventory,oden:life.inventory.oden-1},usedItems:[...life.usedItems,{id:'oden',turn:state.turn,automatic:true}]};
    const recovered=Math.min(moodMax,mood+35);
    return {mood:recovered,life:next,note:`深夜一盒温热关东煮自动守护：刘看雨把热食递到你手里，本次恢复 ${recovered-mood} 点情绪，消耗 1 份；树洞保护${life.treeholeUsed?'已用过':'仍然保留'}。`};
  }
  if(mood!==0 || life.treeholeUsed)return {mood,life,note:''};
  return {mood:15,life:{...life,treeholeUsed:true},note:'树洞回声：这一局有人接住了你的倾诉，情绪恢复到 15；本局仅一次。这是游戏保护，不是现实心理判断或治疗效果。'};
}

export function getLifeReport(state) {
  const life=state.life;if(!life)return null;
  const titleReport=getLifeTitleReport(state),history=Array.isArray(state.history)?state.history:[];
  const prioritized=[...history].sort((a,b)=>([10,20,29,30,31,32,40].includes(b.tile+1)?100:0)+Math.abs(b.moneyDelta)/1000+Math.abs(b.moodDelta)-(([10,20,29,30,31,32,40].includes(a.tile+1)?100:0)+Math.abs(a.moneyDelta)/1000+Math.abs(a.moodDelta)));
  const timeline=prioritized.slice(0,10).sort((a,b)=>a.turn-b.turn).map(record=>({eventId:record.eventId,title:record.title,turn:record.turn,choice:record.choiceLabel,result:record.result,reason:life.chains.filter(chain=>chain.to===record.eventId).map(chain=>chain.reason).join(' ')||'来自本局实际停靠与已结算的选择。',moneyDelta:record.moneyDelta,moodDelta:record.moodDelta}));
  const achievements=[
    {id:'four-seasons',name:'走过四季',unlocked:new Set(history.map(record=>record.season)).size===4,description:'在四个季节各实际停靠过一次。'},
    {id:'three-crossroads',name:'三次人生岔路',unlocked:!!life.flags.spring && !!life.flags.summer && !!life.flags.autumn,description:'亲历第 10、20、30 格并留下选择。'},
    {id:'communication',name:'把话说到一起',unlocked:life.companion.interactions.length===4,description:'四季各进行一次专心交流。'},
    {id:'inventory',name:'背包里的办法',unlocked:new Set(life.usedItems.map(item=>item.id)).size>=4,description:'实际使用四种不同道具。'},
    {id:'home',name:'有了自己的灯',unlocked:!!life.loan,description:'明确确认并实际支付一笔首付。'},
    {id:'business',name:'从小样开始',unlocked:life.business.stage==='operating',description:'完成小样验证、试运营及后续结算。'},
    {id:'treehole',name:'有人听见',unlocked:life.treeholeUsed,description:'触发本局一次树洞保护。'},
    {id:'habits',name:'慢慢长出力量',unlocked:life.buffs.longTerm && life.buffs.resilience,description:'实际经历第 21 和第 32 格，获得两项持续练习。'},
  ];
  return {...titleReport,timeline,chains:life.chains,achievements,assets:{home:getHome(state),business:getBusiness(state)},treehole:{used:life.treeholeUsed,remaining:life.treeholeUsed?0:1},companion:getCompanion(state),notices:life.notices,inventory:getInventory(state),transactions:life.transactions};
}
