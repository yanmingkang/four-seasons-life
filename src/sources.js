import {SOURCE_ADDITIONS} from './source-additions-2026-09-11.js';
// Initial eight entries: authorized Zhihu CLI, 2026-09-08.
// Later entries carry their own evidence level; see references/practice-source-audit-2026-09-10.md.
// These are discussion sources, not verification of the fictional outcomes or game numbers.
export const SOURCES = {
  records: {
    id: 'records', title: '工作中有必要「事事留痕」吗？作为职场新人，哪些自我保护的方式是必要的？',
    author: '北海皆非', url: 'https://www.zhihu.com/question/1900496947028144604/answer/1901295850753352108',
    idea: '把会议要点、任务清单和重要沟通整理下来，既帮助协作，也便于复盘；记录本身并不能自动证明谁对谁错。',
    query: '职场新人 会议纪要 工作留痕', scope: '记录习惯与沟通方法'
  },
  teamwork: {
    id: 'teamwork', title: '跨部门合作时对方推卸责任怎么办？',
    author: '知乎知了', url: 'https://www.zhihu.com/question/2077293497325982256/answer/2077724562452756046',
    idea: '协作卡住可能来自职责、收益和信息没有对齐。先确认谁负责什么，再讨论资源与合作方式。',
    query: '职场 被甩锅 跨部门协作', scope: '合作中的职责与资源'
  },
  structure: {
    id: 'structure', title: 'HRD先活下来08｜公司越强调“协同”，部门为什么反而越容易互相甩锅？',
    author: '张一石', url: 'https://zhuanlan.zhihu.com/p/2076337402474512973',
    idea: '不同部门各自完成指标，也可能让共同交付失败。事件保留资源限制，不把所有冲突归咎于某个人的态度。',
    query: '跨部门 协作 目标 责任', scope: '组织条件造成的合作困难'
  },
  rest: {
    id: 'rest', title: '有哪些方法能快速释放工作压力？',
    author: 'meinvling', url: 'https://www.zhihu.com/question/2069678618465376143/answer/2075172526385280357',
    idea: '答主分享了自己下班运动、利用周边场馆放松的经历。适合自己的休息方式，也值得留在日程里。',
    query: '如何缓解职场内耗 下班 休息', scope: '个人休息经验；非医疗建议'
  },
  friends: {
    id: 'friends', title: '步入社会工作后怎么样跟以前的同学们相处？',
    author: '月牙', url: 'https://www.zhihu.com/question/2059859184703778979/answer/2074821228762875797',
    idea: '相处可以围绕共同回忆和生活，不必用收入互相比较；维系让彼此舒服的关系，也需要边界。',
    query: '职场 同学聚会 攀比', scope: '社交与比较心态'
  },
  transition: {
    id: 'transition', title: '中年了，你敢辞职吗？',
    author: '晶姑娘的复盘笔记', url: 'https://www.zhihu.com/question/1913873349446206376/answer/2077081467574809084',
    idea: '答主回顾转型试错，谈到现金余量、合作规则与自身适配。别人的热门方向，不一定适合自己的条件。',
    query: '中年转型 先尝试 副业', scope: '一位答主的转型反思'
  },
  skills: {
    id: 'skills', title: '哪些职场能力最能决定个人竞争力？',
    author: '小野草', url: 'https://www.zhihu.com/question/2077302368480277695/answer/2079267782932304608',
    idea: '遇到复杂工作时，可以先拆分问题、对齐信息，再尝试小范围实践。能力需要放到具体工作中检验。',
    query: '职场 升职天花板 能力 可迁移', scope: '拆解问题与实践学习'
  },
  impromptu: {
    id: 'impromptu', title: '大会上，领导突然点名让你发言，该怎么办？',
    author: '上班情绪签', url: 'https://www.zhihu.com/question/595768316/answer/2078082509473108512',
    idea: '临时开口时，可以先整理表达顺序，把核心判断说清楚；不熟悉的部分仍需另行确认。',
    query: '领导 临时 点名 发言', scope: '临场表达方法，不是客户提案成功保证',
    evidence: 'CLI 搜索片段，未读取完整原文', checkedAt: '2026-09-10'
  },
  incident: {
    id: 'incident', title: '6.4 技术风险管理流程',
    author: 'Thepoly', url: 'https://zhuanlan.zhihu.com/p/2079977313287008845',
    idea: '故障处理中需要明确沟通与决策分工，处置之后再记录过程、安排复盘。',
    query: '系统故障 应急 修复 复盘 技术债', scope: '一篇项目流程文章；不采用其中的指标或时限作为技术标准',
    evidence: 'CLI 搜索片段，未读取完整原文', checkedAt: '2026-09-10'
  },
  household: {
    id: 'household', title: '《再见爱人 2》艾威从不做家务都是 Lisa 在做，婚姻中家务分配重要吗？该如何合理分配？',
    author: '深刻如此', url: 'https://www.zhihu.com/question/566804752/answer/2759543741',
    idea: '对家务范围和清洁标准的理解可能不同，可以先说明各自需要，再协商能承担的部分。',
    query: '夫妻 家务 分工 沟通', scope: '家务协商观点，非心理测评或关系结局预测',
    evidence: 'CLI 搜索片段，未读取完整原文', checkedAt: '2026-09-10'
  },
  care_topic: {
    id: 'care_topic', title: '异地打拼，父母生病该怎么办，如何平衡工作和照顾父母？',
    author: '作者待核对', url: 'https://www.zhihu.com/question/614409286',
    idea: '这个知乎提问也在讨论：工作安排与照料责任同时到来时，如何面对取舍。',
    query: '异地打拼 父母生病 平衡工作 照顾父母', scope: '仅确认提问主题；未采用回答中的医疗服务推荐',
    evidence: '仅提问主题，具体经验与作者待补核', sourceKind: 'question', checkedAt: '2026-09-10'
  },
  offer_questions: {
    id: 'offer_questions', title: '确认offer前问清楚的事，和offer回复技巧',
    author: 'offer先生', url: 'https://zhuanlan.zhihu.com/p/1995532556754501663',
    idea: '回应录用邀约前，先问清收入构成、工作安排和答复期限，而不只看一个总数。',
    query: 'offer 薪资 构成 工作时间 确认', scope: '录用前的信息核对，不判断合同效力或补偿权益',
    evidence: '公开搜索返回正文，未另行登录核验', checkedAt: '2026-09-10'
  },
  handover: {
    id: 'handover', title: '如何做好离职的工作交接？',
    author: '作者待核对', url: 'https://www.zhihu.com/question/634352417',
    idea: '交接前可以约定时间与流程，并整理正在进行的工作、待办事项和交付记录。',
    query: '如何做好离职的工作交接', scope: '问题页可见回答的交接方法；未取得具体答主身份',
    evidence: '公开搜索返回问题页回答片段；具体作者待核对', sourceKind: 'question', checkedAt: '2026-09-10'
  },
  clients: {
    id: 'clients', title: '自由职业初期，如何快速积累客户和稳定的收入来源？',
    author: '民谣如诗', url: 'https://www.zhihu.com/question/2064314688725431185/answer/2065089826932765626',
    idea: '获客往往要经历展示作品、建立信任和持续积累。游戏借用这一讨论主题，不采用回答中的收入预测或固定时间承诺。',
    query: '自由职业 如何获得 第一个客户', scope: '获客需要积累的观点'
  },
  care_coordination: {
    id:'care_coordination', title:'在至亲的亲人住院一周的时候，你工作比较忙，是选择请护工还是请假跟家人轮流照顾？',
    author:'萧澄', url:'https://www.zhihu.com/question/1923012989029680504/answer/2071259121635140487',
    idea:'答主回忆家人住院时，因工作、接送孩子与做饭都有时间限制，家属一起商量陪护、请假和其他生活事务的安排。',
    query:'家人生病 陪护 工作 分工 请假', scope:'一位答主的家庭协调经历；不采用诊疗过程、费用、护理质量或服务推荐',
    evidence:'官方 CLI 返回作者、回答直链与内容片段；未读取完整原文', evidenceLevel:'excerpt', checkedAt:'2026-09-11'
  },
  care_budget: {
    id:'care_budget', title:'父母需要照护，家人该不该停工：先把这7笔账算清',
    author:'光与萤火', url:'https://zhuanlan.zhihu.com/p/2071709396963422507',
    idea:'文章建议把工作时间、接送与家务等任务一起列清，确认各人的承担时段，并为临时无法到场留出替补安排。',
    query:'家人生病 陪护 工作 分工 请假', scope:'只采用时间盘点、家庭分工和替补思路；不采用假期权利、医疗操作或服务适用性结论',
    evidence:'官方 CLI 返回作者、文章链接与内容片段；未读取完整原文', evidenceLevel:'excerpt', checkedAt:'2026-09-11'
  },
  handover_checklist: {
    id:'handover_checklist', title:'马上离职了，工作交接上应该注意什么呢？',
    author:'侃大山', url:'https://www.zhihu.com/question/1928749704344221413/answer/1930915999596643377',
    idea:'答主把交接前准备分为已完成、进行中和待办事项，记录进度、时间节点与相关人，也整理工作过程中的经验供接手者沟通核对。',
    query:'离职 工作交接 清单 时间 安排', scope:'离职已确定后的交接准备；不用于判断补偿、解除是否合法或要求传递个人账号密码',
    evidence:'官方 CLI 返回作者、回答直链与内容片段；未读取完整原文', evidenceLevel:'excerpt', checkedAt:'2026-09-11'
  },
  listening: {
    id:'listening', title:'当伴侣向你倾诉问题时，如何提供有效的「情绪价值」？',
    author:'知乎用户h0Ggrs', url:'https://www.zhihu.com/question/617118379/answer/3174965837',
    idea:'答主建议倾诉时先积极倾听，试着理解感受与需求，不急着给指导或替对方解决问题。',
    query:'伴侣 倾听 情绪 不急着 解决问题', scope:'一位答主的倾听观点；不把对方一概当成只需要安慰，也不保证倾听能解决现实问题',
    evidence:'官方 CLI 返回显示作者、回答直链与内容片段；未读取完整原文', evidenceLevel:'excerpt', checkedAt:'2026-09-11'
  },
  offscreen: {
    id:'offscreen', title:'下班后除了刷手机还能干什么？',
    author:'沐梓舒', url:'https://www.zhihu.com/question/1931653326077927680/answer/2056882400681109178',
    idea:'答主列举散步、做饭、手作、与朋友喝茶和记录温暖小事等下班活动，为空闲时间提供不同选择。',
    query:'下班 放松 不看手机 休息', scope:'活动灵感清单；不采用生理效果、性格变化或必须完成的自律要求',
    evidence:'官方 CLI 返回作者、回答直链与内容片段；未读取完整原文', evidenceLevel:'excerpt', checkedAt:'2026-09-11'
  },
  microbreak: {
    id:'microbreak', title:'越休息越累的人，都做错了这件事（不是刷手机）',
    author:'KnowYourself', url:'https://zhuanlan.zhihu.com/p/1981656989181425150',
    idea:'文章列举离开屏幕看看窗外、与同事短聊、认真喝一杯热饮，以及用做饭、整理房间等活动完成下班后的切换。',
    query:'下班 放松 不看手机 休息', scope:'只采用微休息和生活切换的活动建议；不复述神经机制、固定休息频率或健康效果',
    evidence:'官方 CLI 返回作者、文章链接与内容片段；未读取完整原文', evidenceLevel:'excerpt', checkedAt:'2026-09-11'
  },
  distance_planning: {
    id:'distance_planning', title:'异地恋情侣应该如何规划，才能更顺利地结束异地？',
    author:'作者待核对', url:'https://www.zhihu.com/question/1985667502030726023/answer/1986010474861577107',
    idea:'可见回答片段讨论共同核对城市、工作、生活成本与时间安排，并提前商量居住预算及工作地点。',
    query:'异地恋 工作 城市 规划 沟通', scope:'伴侣的共同规划思路；不采用文中举例时限，不把迁移视为必须妥协或关系成功保证',
    evidence:'官方 CLI 返回回答直链与内容片段，但作者字段为空；未读取完整原文', evidenceLevel:'author-pending', checkedAt:'2026-09-11', archived:true
  },
  ...SOURCE_ADDITIONS
};
// Derive evidence states from the source itself, including old saved references.
// A new named replacement must never silently upgrade an older source ID.
export const sourceEvidenceLevel=source=>source?.evidenceLevel??(
  source?.sourceKind==='question'&&source.evidence?.startsWith('仅提问')?'topic-only':
  !source?.author||source.author==='作者待核对'?'author-pending':
  source.evidence?.startsWith('公开搜索返回正文')?'indexed-text':'excerpt');
export const SOURCE_NOTE = '剧情为综合改编，资金与情绪变化是游戏规则；知乎原文提供讨论背景，不代表作者经历了本局事件或认可本局结算。';
