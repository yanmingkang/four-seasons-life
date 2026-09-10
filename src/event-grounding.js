// Curated paraphrases, never quotations, outcome evidence, or a preferred choice.
// Each condition must point to a mapped source. Do not fill evidence gaps with AI.
const entries = {
  'cell-06': {
    sourceIds: ['impromptu'], status: 'excerpt',
    echo: '临时开口时，先理清表达顺序，再把核心判断说清楚。',
    considerations: [
      {when:'突然被要求发言',idea:'可以先说明这是初步判断，给自己整理思路的空间。',sourceId:'impromptu'},
      {when:'熟悉材料却容易讲散',idea:'先说核心结论，再补背景与细节。',sourceId:'impromptu'}
    ], boundary:'来源讨论临场表达；客户是否接受和专业值变化属于虚构规则。'
  },
  'cell-11': {
    sourceIds: ['incident'], status: 'excerpt',
    echo: '先确认应急分工，再把后续整理与复盘单独安排。',
    considerations: [
      {when:'正在处置故障',idea:'明确谁沟通、谁决策，再推进约定的应急方案。',sourceId:'incident'},
      {when:'临时处置已经结束',idea:'记录过程与教训，为后续复盘留下依据。',sourceId:'incident'}
    ], boundary:'借用分工与复盘思路，不代表应当通宵，也不提供具体技术处置标准。'
  },
  'cell-13': {
    sourceIds: ['records','teamwork'], status: 'excerpt',
    echo: '先把可核对的事实和职责放回讨论，记录不等于对人的判决。',
    considerations: [
      {when:'各方对经过说法不同',idea:'整理任务与重要沟通，分清已有记录和待确认事项。',sourceId:'records'},
      {when:'事实清楚但合作仍卡住',idea:'再核对职责、资源和共同交付的安排。',sourceId:'teamwork'}
    ], boundary:'两条经验针对不同卡点，不是人为划分的对立阵营，也不保证争议立即消失。'
  },
  'cell-15': {
    sourceIds: ['household'], status: 'excerpt',
    echo: '先说清彼此对家务的理解，再协商各自能承担的部分。',
    considerations: [
      {when:'分工一直模糊',idea:'把家务的大类说清楚，再讨论各自能承担什么。',sourceId:'household'},
      {when:'双方清洁标准不同',idea:'讨论共同能接受的标准，不急着把差异归结为态度。',sourceId:'household'}
    ], boundary:'来源提供协商角度；一次沟通不能保证长期关系改善。'
  },
  'cell-18': {
    sourceIds: ['care_topic'], status: 'topic-only',
    echo: '工作与照料同时到来，这个难题也有人在知乎提出。',
    considerations: [],
    boundary:'当前只确认同题提问。轮班、代讲与陪护选项是游戏创作，尚不能称为已核实的知乎经验；不提供医疗建议。'
  },
  'cell-22': {
    sourceIds: ['friends'], status: 'excerpt',
    echo: '同学之间可以聊共同经历，不必只用收入衡量彼此。',
    considerations: [
      {when:'话题开始围绕收入比较',idea:'也可以把交流留给共同回忆和各自的生活。',sourceId:'friends'},
      {when:'相处让自己不舒服',idea:'维系关系的同时，为自己保留合适的边界。',sourceId:'friends'}
    ], boundary:'这是一位答主的相处观点，不是知乎用户的选择比例。'
  },
  'cell-27': {
    sourceIds: ['offer_questions'], status: 'indexed-text',
    echo: '先问清收入构成与工作安排，再回应眼前的邀约。',
    considerations: [
      {when:'邀约中的总数很吸引人',idea:'问清哪些收入是固定的，哪些依赖条件。',sourceId:'offer_questions'},
      {when:'日常安排还不明确',idea:'核对工作时间和答复期限，再考虑自己的安排。',sourceId:'offer_questions'}
    ], boundary:'仅采用信息核对方法；限制条款是否合法、本局报酬是否现实，均不是这篇来源证明的结论。'
  },
  'cell-31': {
    sourceIds: ['handover'], status: 'author-pending',
    echo: '把正在做的事与待办写清楚，再约定交接的时间和范围。',
    considerations: [
      {when:'交接还未开始',idea:'先与接手方确认时间与流程安排。',sourceId:'handover'},
      {when:'工作尚有未完成部分',idea:'记录目前进展与待办，方便双方继续核对。',sourceId:'handover'}
    ], boundary:'仅据问题页可见回答整理，具体作者仍待核对。不采用账号密码移交建议，也不判断补偿或劳动权益。'
  }
};
export const EVENT_GROUNDING=Object.freeze(Object.fromEntries(Object.entries(entries).map(([id,value])=>[id,Object.freeze({
  ...value,sourceIds:Object.freeze(value.sourceIds),considerations:Object.freeze(value.considerations.map(item=>Object.freeze(item)))
})])));
export const getEventGrounding=eventOrRecord=>{
  const id=eventOrRecord?.eventId??eventOrRecord?.id;
  return typeof id==='string'&&Object.hasOwn(EVENT_GROUNDING,id)?EVENT_GROUNDING[id]:null;
};
