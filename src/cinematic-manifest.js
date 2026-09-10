// Local video slots for the eight clips agreed in the 2026-09-09 meeting.
// Keep src null until an actual, reviewed video exists in public/cinematics/.
export const CINEMATIC_MANIFEST = Object.freeze([
  {cell:6,title:'客户会议室',theme:'presentation',beat:['提案前十分钟，主讲人突然离场。','聚光灯亮起，所有人的目光转向你。','这一次，如何接住意外？']},
  {cell:11,title:'攻坚作战室',theme:'incident',beat:['深夜，安静的办公室突然亮起警报。','旧系统出错，屏幕上的消息接连跳出。','抢修眼前，还是争取长期的改变？']},
  {cell:13,title:'跨部评审厅',theme:'review',beat:['上线倒计时，协作群又跳出一条消息。','责任被推到你面前，记录仍在手里。','澄清事实，也要选择沟通的方式。']},
  {cell:15,title:'合租卫生间',theme:'home',beat:['洗漱台上，又留下了没有收拾的东西。','一件小事，牵出了许多没说出口的话。','你想怎样开始这次对话？']},
  {cell:18,title:'急诊输液室',theme:'care',beat:['深夜，输液室只听得见轻轻的滴答。','伴侣需要照料，明早的汇报也在等待。','先安顿好眼前的人，再作决定。']},
  {cell:22,title:'校友宴会厅',theme:'banquet',beat:['水晶灯下，旧同学又聊起收入和前程。','名片和酒杯来回传递，你握住自己的杯子。','别人的节奏，会改变你的答案吗？']},
  {cell:27,title:'猎头会客室',theme:'offer',beat:['一份新的机会，被轻轻推到桌面中央。','翻到下一页，优厚条件后还有约束条款。','收入与自由，都值得认真掂量。']},
  {cell:31,title:'人事谈话间',theme:'departure',beat:['办公室很安静，桌面上放着离职协议。','你把自己的工作记录整理在一旁。','为这一段告别，选择下一步。']},
].map(item=>Object.freeze({id:`cell-${String(item.cell).padStart(2,'0')}`,durationMs:4000,src:null,poster:null,...item,beat:Object.freeze(item.beat)})));

export function getCinematic(eventOrId) {
  if(typeof eventOrId?.cinematicId==='string')return CINEMATIC_MANIFEST.find(item=>item.id===eventOrId.cinematicId)??null;
  const id=typeof eventOrId==='string'?eventOrId:eventOrId?.cinematicId??eventOrId?.id;
  const cell=typeof eventOrId==='number'?eventOrId:eventOrId?.cell;
  return CINEMATIC_MANIFEST.find(item=>item.id===id||item.cell===cell)??null;
}
