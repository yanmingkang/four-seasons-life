// Authored fictional rehearsal. No scores, resource deltas, or game mutations.
export const PRACTICE_MAX_TURNS=2;
export const PRACTICE_MAX_LENGTH=240;
export const PRACTICE_SCENES=Object.freeze({
  'cell-11':Object.freeze({
    id:'cell-11',title:'临时加班，怎样说清边界',npcName:'虚构项目负责人',
    context:'旧模块故障之后的一次沟通演练。已选方案不变，练习说明自己能承担的部分、交接时间和需要的支持；不要求玩家必须拒绝或答应加班。',
    opening:'明早还要交付，今晚你能承担哪一部分？',
    openings:Object.freeze([
      '你刚才加入了排查。那今晚后续的事也都由你负责，可以吗？',
      '你提出先保障运行、再安排整理。可明早就要交付，今晚怎么办？',
      '你提出轮值并负责记录。交接之前，谁来跟进还没解决的问题？',
    ]),
    localReplies:Object.freeze(['我听到了你的安排。如果还有未完成的部分，我们什么时候再对齐一次？','好，这次练习先停在这里，把还需要共同确认的安排留出来。']),
    localTip:'下次可以把“我能负责的部分、需要的支持、下一次确认时间”放进同一句话里。',
  }),
  'cell-13':Object.freeze({
    id:'cell-13',title:'责任争执，怎样把话说回来',npcName:'虚构协作同事',
    context:'上线延期后的跨部门沟通演练。玩家已选择一种核对责任的方式；练习回应质疑、说明可核对事实与下一步，不把虚构同事当成真实知乎作者。',
    opening:'所以，你是在说这都是我们的问题？',
    openings:Object.freeze([
      '你在群里发了时间线。所以，你是在说这都是我们的问题？',
      '你把材料交给了协调人。是已经认定责任在我们这边了吗？',
      '你约大家一起复盘。可我们已经很忙了，还要再解释一遍吗？',
    ]),
    localReplies:Object.freeze(['那我们先看哪些已经确认的记录？还不确定的部分，你想怎么一起核对？','这次练习先到这里，分歧可以继续核对，不必马上达成同一种解释。']),
    localTip:'说明一条可核对的事实后，再约定谁整理待确认事项、何时一起核对。',
  }),
});

export function getPracticeScene(eventId){return typeof eventId==='string'&&Object.hasOwn(PRACTICE_SCENES,eventId)?PRACTICE_SCENES[eventId]:null;}
export function practiceForState(state){return state?.phase==='feedback'&&state.history?.length?getPracticeScene(state.history.at(-1).eventId):null;}
export function practiceOpening(scene,record){return scene?.openings?.[record?.choice]||scene?.opening||'';}
