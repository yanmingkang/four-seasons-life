// Recalculate titles for the same 20 archived browser games. This script never
// opens a browser, starts a game, selects a seed, rolls dice, or calls an API.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {restore,snapshot,getLifeReport} from '../src/engine.js';
import {getJourneyTitleReport} from '../src/journey-titles.js';
import {getExperienceTitleReport,getLifeTitleReport,LIFE_TITLES} from '../src/life-titles.js';
import {getMemoryAlbum,memoryShareData} from '../src/memory-album.js';
import {shareCardData} from '../src/share-card.js';

const root=new URL('../',import.meta.url);
// These are the original report files cited in the September 13 browser report.
// Do not include later runs or choose histories according to their new titles.
const sources=[
  'test-results/twenty-games/report-1.json',
  'test-results/twenty-games/report-2-5-8-11-14-17-20.json',
  'test-results/twenty-games/report-3-6-9-12-15-18.json',
  'test-results/twenty-games/report-4-7-10-13-16-19.json',
];
const sha=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const countBy=(rows,fn)=>rows.reduce((counts,row)=>{const key=String(fn(row));counts[key]=(counts[key]||0)+1;return counts;},{});
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))freeze(child);}return value;};
const resourceState=state=>({money:state.money,mood:state.mood,moodMax:state.moodMax,exp:state.exp,life:state.life});
const endingState=state=>({ended:state.ended,phase:state.phase,position:state.position,season:state.season,turn:state.turn,total:state.total});
const md=value=>String(value??'').replaceAll('|','\\|').replaceAll('\n',' ');
const sourceRows=[],archived=[];
for(const file of sources){
  const contents=await fs.readFile(new URL(file,root));
  const data=JSON.parse(contents.toString('utf8'));
  assert.ok(Array.isArray(data.games),`${file}: original games are missing`);
  sourceRows.push({file,sha256:sha(contents),bytes:contents.length,games:data.games.map(game=>game.game),choicePolicy:data.method?.choicePolicy||null});
  for(const game of data.games)archived.push({game,file});
}
archived.sort((a,b)=>a.game.game-b.game.game);
assert.deepEqual(archived.map(({game})=>game.game),Array.from({length:20},(_,index)=>index+1),'Need exactly the original 20 games, without duplicates or replacement games');

function eventEvidence(proofs,state,label){
  assert.ok(Array.isArray(proofs),`${label}: evidence must be an array`);
  return proofs.map(proof=>{
    assert.equal(proof.kind,'event',`${label}: a daily title requires settled event evidence`);
    const actual=state.history.find(record=>record.eventId===proof.eventId&&record.turn===proof.turn&&record.choice===proof.choice);
    assert.ok(actual,`${label}: evidence must match a real event, turn and choice`);
    return {eventId:actual.eventId,turn:actual.turn,choice:actual.choice,title:actual.title,choiceLabel:actual.choiceLabel};
  });
}

const games=[];
for(const {game,file} of archived){
  const label=`game ${game.game}`;
  assert.equal(game.completed,true,`${label}: the archived browser run did not finish`);
  assert.ok(game.final&&game.durationMilliseconds>0,`${label}: original final state/timing is missing`);
  const writeIndex=game.trace?.writes?.length-1;
  const saved=game.trace?.writes?.[writeIndex]?.record?.game;
  assert.ok(saved,`${label}: the final browser save is missing; do not manufacture one`);
  const savedBefore=structuredClone(saved),originalBefore=structuredClone(game.final);
  const state=restore(saved);
  assert.ok(state,`${label}: the original save must restore legally`);
  assert.deepEqual(state,game.final,`${label}: legal replay must reproduce the original complete state`);
  assert.deepEqual(snapshot(state),saved,`${label}: replay must retain the exact original save journal`);
  assert.deepEqual(saved.moves,state.history.map(({die,choice})=>({die,choice})),`${label}: original dice and choices must be preserved`);
  freeze(state);

  // The compatibility evaluator retains the previous strict special-title rules.
  // Its result must still agree with the title actually recorded in the old UI.
  const old=getExperienceTitleReport(state);
  assert.equal(old.title,game.title,`${label}: old title rules or archived baseline changed`);
  const daily=getJourneyTitleReport(state),report=getLifeTitleReport(state);
  const life=getLifeReport(state),album=getMemoryAlbum(state);
  const memoryShare=memoryShareData(state),card=shareCardData(state);
  assert.deepEqual(getJourneyTitleReport(structuredClone(state)),daily,`${label}: daily title selection must be deterministic`);
  assert.deepEqual(getLifeTitleReport(structuredClone(state)),report,`${label}: combined report must be deterministic`);
  for(const [name,value] of [['combined report',report],['life report',life],['memory album',album],['memory share',memoryShare],['share card',card]]){
    assert.equal(value?.title,daily.title,`${label}: ${name} must use the same daily title`);
  }
  assert.equal(report.titleId,daily.titleId);
  assert.equal(report.titleReason,daily.titleReason);
  assert.deepEqual(report.titleEvidence,daily.titleEvidence);
  assert.deepEqual(album.titleEvidence,daily.titleEvidence,`${label}: memory evidence must remain intact`);
  assert.deepEqual(report.titles,old.titles,`${label}: the four original special title gates must be retained`);
  const expectedCommemorations=old.titles.filter(title=>title.unlocked).map(title=>title.id);
  if(old.titleId==='restarted')expectedCommemorations.push('restarted');
  assert.deepEqual(report.commemorations.map(item=>item.id),expectedCommemorations,`${label}: special memories must come only from old strict evidence`);
  assert.deepEqual(album.commemorations.map(item=>item.id),expectedCommemorations,`${label}: album special memories must match the report`);

  const evidence=eventEvidence(daily.titleEvidence,state,label);
  const distinctEvents=new Set(evidence.map(proof=>proof.eventId));
  if(daily.titleId==='traveler')assert.equal(evidence.length,0,`${label}: neutral fallback must not invent evidence`);
  else assert.ok(distinctEvents.size>=2,`${label}: a named daily title needs at least two different actual events`);
  assert.ok(typeof daily.titleReason==='string'&&daily.titleReason.length>0,`${label}: an explanation is required`);

  assert.deepEqual(state,originalBefore,`${label}: report generation must not mutate any original game state`);
  assert.deepEqual(saved,savedBefore,`${label}: report generation must not mutate the source save`);
  assert.deepEqual(game.final,originalBefore,`${label}: archived final state must remain unchanged`);
  assert.deepEqual(resourceState(state),resourceState(game.final),`${label}: resources and life systems must remain unchanged`);
  assert.deepEqual(endingState(state),endingState(game.final),`${label}: ending and location must remain unchanged`);
  assert.deepEqual(state.history,game.final.history,`${label}: the full event history must remain unchanged`);
  games.push({game:game.game,strategy:game.strategy,source:file,snapshotWriteIndex:writeIndex,
    old:{title:game.title,titleId:old.titleId,commemorations:expectedCommemorations},
    daily:{title:daily.title,titleId:daily.titleId,reason:daily.titleReason,evidence,distinctEvents:distinctEvents.size,
      counts:daily.journeyTitle.counts,selectionReason:daily.journeyTitle.selectionReason,rule:daily.journeyTitle.rule},
    commemorations:report.commemorations,historyLength:state.history.length,
    ending:endingState(state),prematureMoodEnding:state.ended==='mood'&&state.position<state.total-1,
    resources:{money:state.money,mood:state.mood,moodMax:state.moodMax,exp:state.exp},
    identity:{snapshotSha256:sha(saved),historySha256:sha(state.history),resourcesAndLifeSha256:sha(resourceState(state)),stateSha256:sha(state)},
    checks:{restoredStateExactlyMatchesArchive:true,originalDiceAndChoicesUnchanged:true,resourcesAndLifeUnchanged:true,historyUnchanged:true,endingUnchanged:true,inputStateNotMutated:true,deterministic:true,titleConsumersAgree:true}});
}

assert.equal(games.reduce((sum,game)=>sum+game.historyLength,0),230,'The original set contains exactly 230 actual event choices');
const originalSummary=JSON.parse(await fs.readFile(new URL('test-results/twenty-games/summary.json',root),'utf8'));
const oldCounts=countBy(games,game=>game.old.title);
assert.deepEqual(oldCounts,originalSummary.titles.counts,'Old distribution must agree with the independent archived summary');
for(const source of sourceRows){
  assert.equal(sha(await fs.readFile(new URL(source.file,root))),source.sha256,`${source.file}: original report file changed during replay`);
}
const titleCounts=countBy(games,game=>game.daily.title);
const commemorations=Object.fromEntries([...LIFE_TITLES.map(title=>[title.name,0]),['重新出发的行路人',0]]);
for(const game of games)for(const title of game.commemorations)commemorations[title.name]=(commemorations[title.name]||0)+1;
const strategyLabels={random:'随机选择',career:'事业投入',boundary:'边界休息',support:'可见道具支持'};
const repeated=Object.entries(titleCounts).filter(([,count])=>count>1).map(([title,count])=>{
  const group=games.filter(game=>game.daily.title===title),strategyCounts=countBy(group,game=>game.strategy);
  const most=group.filter(game=>game.daily.rule==='most-events').length;
  const tied=group.filter(game=>game.daily.rule==='latest-action').map(game=>game.game);
  const supportPolicy=group.some(game=>game.daily.titleId==='forward')?
    '原报告的choicePolicy注明：可见道具支持组沿用事业组的可见选项表，再使用道具或倾听；两组日常事件选择主题相近，因此会得到相同主称号。':'';
  return {title,count,strategyCounts,
    games:group.map(game=>({game:game.game,counts:game.daily.counts,selectionReason:game.daily.selectionReason,evidence:game.daily.evidence})),
    explanation:`分别来自${Object.entries(strategyCounts).map(([strategy,n])=>`${strategyLabels[strategy]||strategy}${n}局`).join('、')}；${most}局由同类地点数严格最多选中${tied.length?`，${tied.length}局（${tied.join('、')}）在并列最多时采用最近行动`:''}。${supportPolicy}各局的不同真实事件仍分别保留，没有按局号轮换、配额分配或重新选种子。`};
});
const implementation=[];
for(const file of ['src/journey-titles.js','src/life-titles.js','src/life-systems.js','src/memory-album.js','src/share-card.js'])implementation.push({file,sha256:sha(await fs.readFile(new URL(file,root)))});
const result={date:'2026-09-13',scope:'Recalculate titles from the exact 20 archived browser save journals; no new browser playthrough or API call.',
  sources:sourceRows,implementation,gameCount:games.length,actualEventCount:230,duplicateOrReplacementGames:0,
  baseline:{titleCounts:oldCounts,specialTitleGames:games.filter(game=>game.old.commemorations.length).length},
  current:{titleCounts,commemorationCounts:commemorations,namedTitleGames:games.filter(game=>game.daily.titleId!=='traveler').length,
    namedTitlesHaveTwoDistinctRealEvents:games.filter(game=>game.daily.titleId!=='traveler').every(game=>game.daily.distinctEvents>=2),
    neutralFallbackGames:games.filter(game=>game.daily.titleId==='traveler').map(game=>game.game)},
  endings:{complete:games.filter(game=>game.ending.ended==='complete').length,prematureMood:games.filter(game=>game.prematureMoodEnding).length,
    preserved:true,limitation:'原20局没有情绪耗尽提前结束，因此本重算不能作为提前结局浏览器流程的覆盖证明。'},
  checks:{allOriginalSavesRestore:true,allOriginalFinalStatesExactlyReproduced:true,allOriginalFilesUnchanged:true,
    allResourcesAndLifeSystemsUnchanged:true,allHistoriesUnchanged:true,allEndingsUnchanged:true,allConsumersAgree:true,
    newGames:0,newDiceRolls:0,apiCalls:0,seedSelectionOrAdjustment:false},
  repeatedTitles:repeated,games};

const distributionRows=Object.entries(titleCounts).map(([title,count])=>`| ${md(title)} | ${count} | ${games.filter(game=>game.daily.title===title).map(game=>game.game).join('、')} |`).join('\n');
const specialRows=Object.entries(commemorations).map(([title,count])=>`| ${md(title)} | ${count} |`).join('\n');
const gameRows=games.map(game=>`| ${game.game} | ${md(strategyLabels[game.strategy]||game.strategy)} | ${md(game.daily.title)} | ${game.historyLength} | ${game.resources.money} / ${game.resources.mood} / ${game.resources.exp} | ${md(game.commemorations.map(title=>title.name).join('、')||'无')} |`).join('\n');
const evidenceSections=games.map(game=>`### 第 ${game.game} 局：${game.daily.title}\n\n${game.daily.reason}\n\n${game.daily.evidence.length?game.daily.evidence.map(proof=>`- 第 ${proof.turn} 次停靠，${proof.eventId}「${proof.title}」：${proof.choiceLabel}。`).join('\n'):'中性兜底：证据不足，不追加未发生的故事。'}\n\n判定计数：${Object.entries(game.daily.counts||{}).map(([key,count])=>`${key}=${count}`).join('，')}。${game.daily.selectionReason||''}`).join('\n\n');
const sourceLinks=sourceRows.map(source=>`- [${source.file.split('/').at(-1)}](../${source.file})；原记录 SHA256：\`${source.sha256}\`。`).join('\n');
const markdown=`# 两层旅途称号：原20局记录重算验收\n\n日期：2026-09-13。运行命令：\`node tests/journey-titles-replay.mjs\`。\n\n## 结果\n\n原20局主称号均为“四季行路人”（20/20）。同一批存档重算后得到 ${Object.keys(titleCounts).length} 种日常旅途称号，${games.filter(game=>game.daily.titleId!=='traveler').length}/20 局获得至少两处不同真实事件支持的日常称号；中性兜底 ${result.current.neutralFallbackGames.length} 局。特殊纪念 ${games.filter(game=>game.commemorations.length).length}/20 局。\n\n这是对既有浏览器试玩记录的称号重算。没有重开20局，也没有新截图、新投骰、修改骰子、选择新种子、API调用或外网发布。\n\n| 新日常称号 | 局数 | 原局编号 |\n| --- | --- | --- |\n${distributionRows}\n\n## 特殊纪念仍由原严格规则判定\n\n日常主称号与特殊纪念分别展示。逐局核对旧规则结果仍与原浏览器保存的旧称号一致，四个旧特殊称号的 unlocked、理由和证据保持一致。\n\n| 特殊纪念 | 本20局数量 |\n| --- | --- |\n${specialRows}\n\n本样本未实际推进完整经营支线，不能由“0次小步经营探索者”推出该纪念无法达成，也不能为了增加种类降低门槛。\n\n## 同一历史与资源的核对\n\n四份原始报告包含20个唯一局号、230次真实事件选择。每局都取最后一次浏览器写盘的 record.game，使用生产 restore 验证完整 moves 与 extension.actions；恢复出的整个对象与原 game.final 深比较一致。没有用人工拼凑的终局替代存档。\n\n称号生成前冻结状态，生成后再次核对整份状态、完整历史、骰子与选择、资金/情绪/专业及整个 life 系统、终局位置与 ended，全部未变；原四份报告的 SHA256 在运行前后相同。重复调用返回相同结果。生活报告、回忆录、回忆分享和旧分享卡的数据主称号全部一致。\n\n终点通关仍为 ${result.endings.complete}/20，情绪耗尽提前结束仍为 ${result.endings.prematureMood}/20。原20局没有提前结束样本，本报告不能证明提前结局浏览器流程已被覆盖。\n\n| 原局 | 原策略 | 新日常称号 | 原事件数 | 原终局：资金 / 情绪 / 专业 | 特殊纪念 |\n| --- | --- | --- | --- | --- | --- |\n${gameRows}\n\n## 重复称号的说明\n\n${repeated.map(group=>`- ${group.title}：${group.count}局（${group.games.map(game=>game.game).join('、')}）。${group.explanation}`).join('\n')}\n\n出现重复是相同动作主题命中相同规则的结果；本验收不设“必须凑齐全部称号”的配额。下列逐局证据保留不同经历，计数与平票说明写入JSON，便于复核。未在本样本出现的类别不作不可达结论。\n\n## 每局实际证据\n\n证据按 eventId、turn、choice 三项同时匹配原历史；每个非中性称号至少含两个不同 eventId。\n\n${evidenceSections}\n\n## 可复核文件\n\n${sourceLinks}\n- [原20局试玩报告](./20局试玩报告-2026-09-13.md)。\n- [原20局统计](../test-results/twenty-games/summary.json)。\n- [本次机器可读结果](../test-results/journey-titles-replay.json)，含源文件和实现文件哈希、逐局状态哈希与逐项断言结果。\n- [独立重算脚本](../tests/journey-titles-replay.mjs)。\n\n这些检查验证数据层称号生成与引用关系，不替代新版本页面的视觉验收、手机真机体验或实时AI验收。\n`;
await fs.writeFile(new URL('test-results/journey-titles-replay.json',root),`${JSON.stringify(result,null,2)}\n`,'utf8');
await fs.writeFile(new URL('docs/两层旅途称号验收-2026-09-13.md',root),markdown,'utf8');
console.log(JSON.stringify({games:result.gameCount,events:result.actualEventCount,old:oldCounts,daily:titleCounts,special:commemorations,
  twoDistinctRealEvents:result.current.namedTitlesHaveTwoDistinctRealEvents,neutralFallbackGames:result.current.neutralFallbackGames,
  prematureMoodEndings:result.endings.prematureMood,originalStateUnchanged:true,result:'test-results/journey-titles-replay.json',report:'docs/两层旅途称号验收-2026-09-13.md'},null,2));
