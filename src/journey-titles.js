import {EVENTS} from './events.js';

// These names describe this run's choices, not personality, wealth or success.
export const JOURNEY_TITLES = Object.freeze([
  {id:'forward',name:'向前探路的人',description:'在不同地点学习方法、接下任务或尝试合作。'},
  {id:'clarify',name:'把问题问清的人',description:'在不同地点核对信息、整理记录或澄清问题。'},
  {id:'boundary',name:'守住边界的人',description:'在不同地点明确职责、承诺或可以承担的范围。'},
  {id:'companionship',name:'留出陪伴的人',description:'在不同地点为刘看雨或家人安排具体的相处与照料。'},
  {id:'rest',name:'给生活留白的人',description:'在不同地点主动休息、暂停工作或放慢节奏。'},
  {id:'mixed',name:'边赶路边歇脚的人',description:'至少两次投入与两次休息同样突出，其他选择没有成为主线。'},
].map(Object.freeze));

const action=(type,phrase)=>Object.freeze({type,phrase});
const skip=reason=>Object.freeze({type:null,phrase:'',reason});

// An explicit event ID + zero-based choice table. Never infer a category from
// style, resource changes, a record's free text, board position or an ending.
// Phrases describe the selected action, including an attempt when a result has
// a skill gate. Unrelated socialising and retrospective statements stay neutral.
export const JOURNEY_TITLE_CHOICE_RULES = Object.freeze(Object.fromEntries(Object.entries({
  'cell-02':[
    action('clarify','收好了录用约定与面试笔记'),
    action('clarify','问起另一份岗位的日常'),
    action('forward','接下了会场的临时整理工作'),
  ],
  'cell-03':[
    action('companionship','和刘看雨在阳台坐了一会儿'),
    action('companionship','请人接手大件后一起整理小屋'),
    action('forward','动手组装收纳架、安顿房间'),
  ],
  'cell-04':[
    action('clarify','核对了遗漏日期并更新纪要'),
    action('clarify','请前辈一起回听会议录音'),
    action('clarify','为下次会议做了确认清单'),
  ],
  'cell-05':[
    action('forward','在热饮旁记下前辈的方法'),
    action('forward','把便签里的方法试成操作示例'),
    action('rest','把茶水间的空隙留给了散步'),
  ],
  'cell-06':[
    action('forward','尝试接过临时的上台讲解'),
    action('boundary','说明主讲变动并协调接替的人'),
    action('boundary','把现场演示限定在验证过的部分'),
  ],
  'cell-07':[
    action('rest','给自己留了一段不看手机的时间'),
    action('clarify','把想问的话整理成具体问题'),
    skip('参加朋友桌游不等于与刘看雨或家人相处，也不直接证明休息。'),
  ],
  'cell-08':[
    action('clarify','尝试向熟悉流程的人核对消息'),
    skip('等待正式通知本身不证明职责边界或主动休息。'),
    action('clarify','整理了业务依赖与交接清单'),
  ],
  'cell-09':[
    action('forward','带着成果与计划参加了评审'),
    action('clarify','请带教挑出了材料的薄弱处'),
    action('boundary','把复盘范围限定在已确认的成果'),
  ],
  'cell-10':[
    action('forward','接下了远方的新岗位'),
    action('companionship','把留在本地的陪伴放进计划'),
    action('forward','用短期驻场试着了解新生活'),
  ],
  'cell-11':[
    action('forward','加入了旧模块的故障排查'),
    action('forward','为系统重构争取了时间与资源'),
    action('clarify','在轮值排查中整理故障时间线'),
  ],
  'cell-12':[
    action('companionship','和刘看雨吃着热食慢慢回家'),
    action('clarify','在回家前把明天的交接写清'),
    action('companionship','和刘看雨一起坐车回家'),
  ],
  'cell-13':[
    action('clarify','用时间线把事实带回讨论'),
    action('clarify','把记录交给协调人共同核对'),
    action('clarify','邀各方逐项核对共同复盘单'),
  ],
  'cell-14':[
    action('rest','放下手机吃完了一顿热早饭'),
    skip('与邻居交流近况不等于刘看雨或家人的具体陪伴。'),
    skip('安排工作顺序本身不证明新任务、核对或主动休息。'),
  ],
  'cell-15':[
    action('boundary','讲清了家务与开支的分工边界'),
    action('companionship','先分担家务并约好继续谈'),
    action('boundary','和刘看雨试行了家务轮值表'),
  ],
  'cell-16':[
    action('clarify','把进度卡点与所需支持说具体'),
    action('forward','和执行同事一起做了交接演练'),
    action('boundary','说明手头容量并暂停接新任务'),
  ],
  'cell-17':[
    action('forward','带着负责的项目成果接受复盘'),
    action('forward','邀请伙伴共同展示项目成果'),
    action('clarify','接下了会后的问题与文档整理'),
  ],
  'cell-18':[
    action('companionship','请同事代讲，自己留在病房'),
    action('forward','确认护理安排后回去准备汇报'),
    action('companionship','和家属轮班，在交接后回病房'),
  ],
  'cell-19':[
    action('boundary','写清了能承担的职责与所需支持'),
    action('forward','用一次试讲检验新岗位的期待'),
    action('rest','把这一季的休假安排放在前面'),
  ],
  'cell-20':[
    action('forward','接下了外派的新职责'),
    action('companionship','暂缓外派，为身边的人腾出时间'),
    action('companionship','把定期回来的安排写进分段外派'),
  ],
  'cell-21':[
    action('rest','在下一季的日历上留出了空白'),
    action('forward','和朋友组织了一次经验交换'),
    skip('听老朋友近况不直接证明刘看雨或家人的陪伴、主动休息。'),
  ],
  'cell-22':[
    skip('退出名片比较不直接证明职责、承诺或工作范围的边界。'),
    skip('夸大前景交换名片不作为学习、核对或合作的证据。'),
    action('clarify','追问了校友失败项目的具体过程'),
  ],
  'cell-23':[
    action('boundary','和刘看雨说明了共同承担的计划'),
    action('clarify','分别听取两家人的关切并列成清单'),
    action('boundary','把家庭决定的边界留给当事人'),
  ],
  'cell-24':[
    action('companionship','在天台认真听完彼此的担心'),
    action('clarify','把担心拆成可以核对的事项'),
    action('rest','约好改日再聊，让疲惫的今晚停一停'),
  ],
  'cell-25':[
    action('clarify','把问题与尝试写进脱敏案例集'),
    action('clarify','和旧同事互审案例中的遗漏'),
    action('rest','留下常用清单后早点合上电脑'),
  ],
  'cell-26':[
    action('forward','和同行交换方法及适用条件'),
    action('forward','接下了需要准备练习的工作坊'),
    action('forward','旁听感兴趣的小组并带走新问题'),
  ],
  'cell-27':[
    action('forward','确认约束后接下了新的岗位'),
    action('boundary','对不能承担的合同限制提出协商'),
    action('boundary','把试合作限定为具体项目交付'),
  ],
  'cell-28':[
    action('clarify','核对了储备与可以承担的安排'),
    action('clarify','请朋友帮忙核对生活清单'),
    action('forward','接下了范围清楚的短期整理工作'),
  ],
  'cell-29':[
    action('forward','和旧同事讨论了合作与小规模验证'),
    action('forward','做出小样去听陌生用户的反馈'),
    action('boundary','说明暂时无法加入合作的限制'),
  ],
  'cell-30':[
    action('companionship','和刘看雨看房并整理安家期待'),
    action('forward','把新方向先做成访谈与试做'),
    action('companionship','和刘看雨约好了居住与生活的节奏'),
  ],
  'cell-31':[
    action('clarify','在离场协商中核对记录与方案'),
    action('clarify','补齐了经历证明与交接资料'),
    action('boundary','确认了限期交接的职责与期限'),
  ],
  'cell-32':[
    action('rest','在上楼前给自己留了十分钟'),
    action('rest','记下未完事项，留到明早再处理'),
    action('companionship','邀家人吃顿热饭并聊聊近况'),
  ],
  'cell-33':[
    action('companionship','和家人分担照料支出与安排'),
    action('companionship','先和家人协调可用的照料支持'),
    action('companionship','调整日程接过了家人的照料班次'),
  ],
  'cell-34':[
    action('boundary','向客户说明范围并提交合作方案'),
    action('forward','先从范围明确的小项目开始合作'),
    action('forward','邀请互补伙伴共同承接模块'),
  ],
  'cell-35':[
    action('rest','关掉工作提醒，把夜晚留给生活'),
    action('forward','慢慢试做了一道想学的新菜'),
    action('rest','把工作消息放下，与老朋友喝了一晚茶'),
  ],
  'cell-36':[
    action('clarify','陪前同事整理材料并寻找咨询窗口'),
    action('clarify','把获准分享的流程整理成匿名清单'),
    action('boundary','说明帮助的限度并提供咨询入口'),
  ],
  'cell-37':[
    action('forward','为店铺筹备落实了第一笔投入'),
    action('forward','先实地考察店铺、记录待验证的问题'),
    action('forward','用周末摊位试着接待客人'),
  ],
  'cell-38':[
    action('rest','用休假安排给自己一段离线时间'),
    action('rest','留在家里睡足、散步，慢慢休假'),
    action('forward','在假期试了一堂感兴趣的手作课'),
  ],
  'cell-39':[
    skip('回望遗憾的表态不增加某类日常行动的次数。'),
    skip('给过去写信的回顾不增加某类日常行动的次数。'),
    action('forward','和年轻伙伴交流弯路与新的问题'),
  ],
}).map(([eventId,choices])=>[eventId,Object.freeze(choices)])));

const eventsById=new Map(EVENTS.map(event=>[event.id,event]));
const ordinaryTitles=JOURNEY_TITLES.filter(title=>title.id!=='mixed');
const proof=record=>({kind:'event',eventId:record.eventId,turn:record.turn,choice:record.choice});
const chronological=(a,b)=>a.turn-b.turn || a.eventId.localeCompare(b.eventId) || a.choice-b.choice;

function recordedActions(state) {
  const unique=new Map();
  for(const record of Array.isArray(state?.history)?state.history:[]) {
    if(!record || !Number.isInteger(record.turn) || record.turn<1 || !Number.isInteger(record.choice) || record.choice<0)continue;
    const event=eventsById.get(record.eventId);
    if(!event?.options[record.choice])continue;
    const rule=JOURNEY_TITLE_CHOICE_RULES[record.eventId]?.[record.choice];
    if(!rule)continue; // Both routes start at cell-01 and finish at cell-40.
    const previous=unique.get(record.eventId);
    // A linear route cannot settle the same event with contradictory choices.
    // Keep duplicates of one choice once; discard a conflicting event entirely.
    if(previous===null)continue;
    if(previous && previous.choice!==record.choice){unique.set(record.eventId,null);continue;}
    if(!previous || record.turn<previous.turn)unique.set(record.eventId,{...proof(record),...rule});
  }
  return [...unique.values()].filter(Boolean).sort(chronological);
}

export function getJourneyTitleReport(state={}) {
  const records=recordedActions(state);
  const groups=Object.fromEntries(ordinaryTitles.map(title=>[title.id,records.filter(record=>record.type===title.id)]));
  const counts=Object.fromEntries(ordinaryTitles.map(title=>[title.id,groups[title.id].length]));
  const most=Math.max(0,...Object.values(counts));
  const tied=ordinaryTitles.filter(title=>counts[title.id]===most);
  let selected,chosen=[],reason,selectionReason,rule='insufficient-history';

  // Mixed is a tie between the two actual kinds of action, not a summed score
  // that can overtake a more frequent clarification, boundary or family theme.
  const mixed=counts.forward>=2 && counts.forward===counts.rest &&
    ['clarify','boundary','companionship'].every(id=>counts[id]<counts.forward);
  if(mixed) {
    selected=JOURNEY_TITLES.find(title=>title.id==='mixed');
    chosen=[...groups.forward.slice(-2),...groups.rest.slice(-2)].sort(chronological);
    reason=`你${groups.forward.at(-1).phrase}，也${groups.rest.at(-1).phrase}。`;
    selectionReason=`投入与休息各来自${counts.forward}个不同地点，同为这段旅程最多的选择。`;
    rule='balanced-leading-actions';
  } else if(most>=2) {
    // Fixed metadata order is the final fallback for malformed same-turn ties.
    selected=tied.reduce((best,title)=>groups[title.id].at(-1).turn>groups[best.id].at(-1).turn?title:best);
    chosen=groups[selected.id].slice(-2);
    reason=`你${chosen[0].phrase}，也${chosen[1].phrase}。`;
    const recent=groups[selected.id].at(-1).turn;
    const sameTurn=tied.filter(title=>groups[title.id].at(-1).turn===recent).length>1;
    rule=tied.length===1?'most-events':sameTurn?'fixed-order':'latest-action';
    selectionReason=tied.length===1?`这类选择来自${most}个不同地点，是这段旅程最多的一类。`:
      sameTurn?'同类地点数和最近行动回合相同，按称号列表的固定顺序选取。':
        `有多类选择同为${most}个地点，采用最近一次行动所属的称号。`;
  } else {
    selected={id:'traveler',name:'旅途留白'};
    const remembered=records.at(-1);
    if(remembered) {
      chosen=[remembered];
      const event=eventsById.get(remembered.eventId);
      const phrase=remembered.phrase || `在「${event.title}」选择了${event.options[remembered.choice].label}`;
      reason=`这一程，你${phrase}；更多故事可以慢慢展开。`;
    } else {
      reason='这一程还留有空白，已有的选择可以慢慢回看。';
    }
    selectionReason='同一类选择至少需要来自两个不同地点，才为这一程命名称号。';
  }

  const evidence=chosen.map(proof);
  const journeyTitle={...selected,reason,evidence,counts,selectionReason,rule,matchedEventCount:records.filter(record=>record.type).length};
  return {title:selected.name,titleId:selected.id,titleReason:reason,titleEvidence:evidence,journeyTitle};
}
