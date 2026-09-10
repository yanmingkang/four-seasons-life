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
  }
};
export const SOURCE_NOTE = '剧情为综合改编，资金与情绪变化是游戏规则；知乎原文提供讨论背景，不代表作者经历了本局事件或认可本局结算。';
