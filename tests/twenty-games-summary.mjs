// Read only the new 20-game browser evidence. No simulation or game/server work.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {restore} from '../src/engine.js';
import {getLifeTitleReport} from '../src/life-titles.js';
import {getMemoryAlbum} from '../src/memory-album.js';

const out=new URL('../test-results/twenty-games/',import.meta.url);
const filenames=(await fs.readdir(out)).filter(name=>/^report-[\d-]+\.json$/.test(name)).sort();
const reports=await Promise.all(filenames.map(async file=>({file,data:JSON.parse(await fs.readFile(new URL(file,out),'utf8'))})));
const selected=new Map(),duplicates=[];
for(const {file,data} of reports)for(const game of data.games||[]){
  if(!Number.isInteger(game.game)||game.game<1||game.game>20)continue;
  const old=selected.get(game.game);
  if(old)duplicates.push({game:game.game,files:[old.file,file]});
  if(!old||(!old.game.completed&&game.completed)||Boolean(old.game.completed)===Boolean(game.completed)&&String(game.finishedAt||'')>String(old.game.finishedAt||''))selected.set(game.game,{game,file});
}
const available=[...selected.values()].sort((a,b)=>a.game.game-b.game.game);
const games=available.filter(({game})=>game.completed&&game.final&&game.durationMilliseconds>0).map(({game})=>game);
const turns=games.flatMap(game=>game.turns.map(turn=>({game,turn})));
const mean=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const quantile=(values,p)=>{if(!values.length)return null;const a=values.slice().sort((a,b)=>a-b),i=(a.length-1)*p,lo=Math.floor(i);return a[lo]+(a[Math.ceil(i)]-a[lo])*(i-lo);};
const stats=values=>({n:values.length,min:values.length?Math.min(...values):null,p25:quantile(values,.25),median:quantile(values,.5),mean:mean(values),p75:quantile(values,.75),max:values.length?Math.max(...values):null});
const countBy=(rows,fn)=>rows.reduce((result,row)=>{const key=String(fn(row));result[key]=(result[key]||0)+1;return result;},{});
const sum=values=>values.reduce((a,b)=>a+b,0);
const fraction=(part,total)=>total?part/total:null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const snapshots=new Map();
function beforeChoice(game,turn){
  if(!snapshots.has(game.game))snapshots.set(game.game,(game.trace?.writes||[]).map(write=>({at:write.at,state:restore(write.record?.game)})).filter(write=>write.state));
  return snapshots.get(game.game).filter(write=>write.at<=turn.timing.clicked&&write.state.phase==='choice'&&write.state.turn===turn.turn-1&&write.state.active?.id===turn.history.eventId).at(-1)?.state;
}
const zeroResource=[];
for(const {game,turn} of turns){
  const h=turn.history;
  if(![h.moneyDelta,h.moodDelta,h.expDelta].every(value=>value===0))continue;
  const before=beforeChoice(game,turn),after=turn.life;
  assert.ok(before?.life&&after,`Need real saved before/after life at game ${game.game} turn ${turn.turn}`);
  const changedFields=['strain','companion','inventory','buffs','flags','chains','business','loan','homePlanned','treeholeUsed','usedItems','mentorQuestion'].filter(key=>!same(before.life[key],after[key]));
  const relationshipFields=['relationship','longDistance','coldWar','supportTurns','interactions'].filter(key=>!same(before.life.companion?.[key],after.companion?.[key]));
  zeroResource.push({game:game.game,turn:turn.turn,cell:turn.cell,event:turn.eventTitle,choice:h.choiceLabel,
    before:turn.beforeChoice,after:turn.after,changedFields,relationshipFields,
    fatigueBefore:before.life.strain?.fatigue,fatigueAfter:after.strain?.fatigue,
    companionMessageChanged:before.life.companion?.lastMessage!==after.companion?.lastMessage,
    narrative:h.result,note:h.talentNote||'',moodWasAtCap:h.before.mood===h.before.moodMax});
}
const gameRows=games.map(game=>{
  const title=getLifeTitleReport(game.final),album=getMemoryAlbum(game.final);
  assert.equal(title.title,game.title,`Actual report title consistency in game ${game.game}`);
  return {game:game.game,strategy:game.strategy,talent:game.talent,viewport:game.viewport,
    completed:game.completed,passed:game.passed,turns:game.turns.length,ending:game.ending,endingCell:game.endingCell,
    prematureMoodEnding:game.ending==='mood'&&game.endingCell<game.final.total,
    durationSeconds:game.durationMilliseconds/1000,loadSeconds:game.loadMilliseconds/1000,
    minimumMood:game.minimumMood,finalMood:game.final.mood,finalMoney:game.final.money,maximumFatigue:game.maximumFatigue,
    zeroMoneySeen:game.turns.some(t=>[t.before.money,t.beforeChoice.money,t.after.money].includes(0)),
    title:title.title,titleId:title.titleId,titleReason:title.titleReason,titleEvidence:title.titleEvidence,
    dilemma:{number:album.dilemma?.number,title:album.dilemma?.title,choice:album.dilemma?.choice},
    goldenVisited:[10,20,30].filter(cell=>game.turns.some(t=>t.cell===cell)),
    practiceEntryKinds:game.practiceEntries.map(entry=>entry.kind),practiceRounds:game.practiceSessions.length*2,
    practiceMilliseconds:sum(game.practiceSessions.map(session=>session.milliseconds||0)),
    videos:game.cinematics?.videos||0,nativeEnded:game.cinematics?.ended||0,
    zeroResourceTurns:zeroResource.filter(item=>item.game===game.game).length,
    stagesSeconds:Object.fromEntries(Object.entries(game.stagesMilliseconds||{}).map(([key,value])=>[key,value/1000])),
    resourceFailureCount:game.resourceFailures.length,issues:game.issues,
    automaticOdenTurns:game.turns.filter(t=>/关东煮自动守护/.test(t.history.talentNote||'')).map(t=>t.turn),
    treeholeRescueTurns:game.turns.filter(t=>/树洞回声：/.test(t.history.talentNote||'')).map(t=>t.turn),
    supportActions:game.supportActions.filter(action=>action.type!=='inventory-inspection').map(({turn,type,id,before,after})=>({turn,type,id,before,after})),
  };
});
const stageNames=[...new Set(games.flatMap(game=>Object.keys(game.stagesMilliseconds||{})))];
const totalMs=sum(games.map(g=>g.durationMilliseconds));
const stages=Object.fromEntries(stageNames.map(stage=>{
  const values=games.map(g=>(g.stagesMilliseconds?.[stage]||0)/1000),totalSeconds=sum(values);
  return [stage,{...stats(values),totalSeconds,shareOfMeasuredMainline:fraction(totalSeconds,totalMs/1000)}];
}));
const locked=['preparing','casting','landed','walking','arriving','transition','season','cinematic'];
const motionMs=sum(locked.map(stage=>sum(games.map(g=>g.stagesMilliseconds?.[stage]||0))));
const videos=games.flatMap(game=>(game.trace?.videos||[]).map(video=>({game:game.game,...video})));
const sessions=games.flatMap(game=>game.practiceSessions.map(session=>({game:game.game,...session})));
const early=gameRows.filter(game=>game.prematureMoodEnding);
const summary={
  generatedAt:new Date().toISOString(),source:'Only this run’s twenty-games real browser reports; reading/replaying recorded saves is validation, not additional gameplay.',
  completed:games.length,expected:20,allTwentyCompleted:games.length===20,allCompletedPassed:games.length===20&&games.every(game=>game.passed),
  uncompleted:available.filter(({game})=>!game.completed).map(({game,file})=>({game:game.game,file,failure:game.failure||null})),
  notStarted:Array.from({length:20},(_,i)=>i+1).filter(number=>!selected.has(number)),duplicates,
  files:reports.map(({file,data})=>({file,phase:data.phase,indexSha256:data.build?.indexSha256})),
  sameProductionBuild:new Set(reports.map(({data})=>data.build?.indexSha256).filter(Boolean)).size===1,
  methods:{realUI:true,newSaves:true,seededDiceEntropy:true,noForcedLandings:true,normalSpeed:true,noRealApiCalls:true,
    sampleLimit:'20 scripted intention strategies are not a representative sample of humans; premature-ending frequency is only descriptive of this sample.',
    timeLimit:'Mainline times stop at visible finished stage. Automatic clicks, normal animation, entry/stability waits and in-mainline screenshots are included; no human reading or thinking was measured.',
    inspectionLimit:'inspectionMilliseconds also includes pre-start/post-ending screenshots, so it is never subtracted wholesale from mainline duration.',
    waitingLimit:'Ready/choice/feedback include script operations and are not described as mandatory game waiting. Locked phase totals include real staged visuals and any captures inside those phases.',
    verificationLimit:'No external reachability, live model quality, billing, sound or representative device-performance claim.'},
  endings:{counts:countBy(gameRows,g=>g.ending),prematureMood:early.length,prematureMoodGames:early.map(g=>g.game),sampleProportion:fraction(early.length,games.length),moodAtFinalTile:gameRows.filter(g=>g.ending==='mood'&&g.endingCell===40).map(g=>g.game)},
  timing:{mainlineSeconds:stats(gameRows.map(g=>g.durationSeconds)),loadSeconds:stats(gameRows.map(g=>g.loadSeconds)),turns:stats(gameRows.map(g=>g.turns)),stages,
    lockedVisualPhaseSeconds:motionMs/1000,lockedVisualPhaseShare:fraction(motionMs,totalMs),lockedPhases:locked},
  resources:{finalMood:stats(gameRows.map(g=>g.finalMood)),minimumMood:stats(gameRows.map(g=>g.minimumMood)),maximumFatigue:stats(gameRows.map(g=>g.maximumFatigue)),
    fatigueAtOrAbove8Turns:turns.filter(({turn})=>turn.after.fatigue>=8).length,fatigueMaxTurns:turns.filter(({turn})=>turn.after.fatigue===10).length,
    totalTurns:turns.length,zeroMoneyGames:gameRows.filter(g=>g.zeroMoneySeen).map(g=>g.game),
    fullMoodAfterSettlementTurns:turns.filter(({turn})=>turn.history.after.mood===turn.history.after.moodMax).length,
    odenRescueGames:gameRows.filter(g=>g.automaticOdenTurns.length).map(g=>({game:g.game,turns:g.automaticOdenTurns})),
    treeholeRescueGames:gameRows.filter(g=>g.treeholeRescueTurns.length).map(g=>({game:g.game,turns:g.treeholeRescueTurns}))},
  strategies:Object.fromEntries(['random','career','boundary','support'].map(strategy=>{
    const rows=gameRows.filter(g=>g.strategy===strategy);return [strategy,{n:rows.length,prematureMood:rows.filter(g=>g.prematureMoodEnding).length,
      durationSeconds:stats(rows.map(g=>g.durationSeconds)),turns:stats(rows.map(g=>g.turns)),finalMood:stats(rows.map(g=>g.finalMood)),minimumMood:stats(rows.map(g=>g.minimumMood)),titleCounts:countBy(rows,g=>g.title),talents:countBy(rows,g=>g.talent)}];
  })),
  titles:{counts:countBy(gameRows,g=>g.title),ids:countBy(gameRows,g=>g.titleId),reasonsFromRealEvidence:gameRows.every(g=>g.titleEvidence?.length>0),
    limitation:'Neutral titles avoid invented support/business histories. This sample does not actively execute business test/launch, so absence of the business title is not evidence that it is unreachable.'},
  memories:{dilemmaCellCounts:countBy(gameRows,g=>g.dilemma.number),terminalDilemmaGames:gameRows.filter(g=>g.dilemma.number===40).map(g=>g.game),
    ungroundedPages:games.flatMap(g=>g.memoryPages.filter(page=>!page.grounded).map(page=>({game:g.game,page:page.i}))),
    failedImages:games.flatMap(g=>g.memoryPages.flatMap(page=>page.imgs.filter(img=>!img.loaded).map(img=>({game:g.game,page:page.i,...img}))))},
  practice:{gamesWithEntry:gameRows.filter(g=>g.practiceEntryKinds.length).length,missingEntryGames:gameRows.filter(g=>!g.practiceEntryKinds.length).map(g=>g.game),
    entryKindCounts:countBy(games.flatMap(g=>g.practiceEntries),entry=>entry.kind),sessions:sessions.length,completedFallbackSessions:sessions.filter(s=>s.fallbackLabeled&&s.gameUnchanged).length,
    unchangedAll:sessions.every(s=>s.gameUnchanged),sessionMilliseconds:stats(sessions.map(s=>s.milliseconds)),observedEntryIsNotUserDiscoveryOrLiveAI:true},
  cinematics:{videos:videos.length,nativeEnded:videos.filter(v=>v.ended).length,cellCounts:countBy(videos,v=>v.cell),noVideoGames:gameRows.filter(g=>g.videos===0).map(g=>g.game),
    errors:videos.flatMap(v=>v.events.filter(e=>e.event==='error').map(e=>({game:v.game,cell:v.cell,...e}))),fallbackTransitions:games.flatMap(g=>(g.cinematics?.fallbackTransitions||[]).map(entry=>({game:g.game,...entry})))},
  threeResourceZero:{count:zeroResource.length,totalTurns:turns.length,proportion:fraction(zeroResource.length,turns.length),games:[...new Set(zeroResource.map(row=>row.game))],
    cellCounts:countBy(zeroResource,row=>row.cell),moodAlreadyAtCap:zeroResource.filter(row=>row.moodWasAtCap).length,
    excludingFinalTileCount:zeroResource.filter(row=>row.cell!==40).length,
    excludingFinalTileNoOtherTrackedSystemChange:zeroResource.filter(row=>row.cell!==40&&!row.changedFields.length).length,
    fatigueChanged:zeroResource.filter(r=>r.fatigueBefore!==r.fatigueAfter).length,relationshipSystemChanged:zeroResource.filter(r=>r.relationshipFields.length).length,
    inventoryOrBuffChanged:zeroResource.filter(r=>r.changedFields.some(field=>['inventory','buffs','usedItems'].includes(field))).length,
    branchChanged:zeroResource.filter(r=>r.changedFields.some(field=>['flags','chains','business','loan','homePlanned'].includes(field))).length,
    anyOtherTrackedSystemChange:zeroResource.filter(r=>r.changedFields.length).length,noOtherTrackedSystemChange:zeroResource.filter(r=>!r.changedFields.length).length,
    limitation:'Counts are real net settlement deltas. Zero resources do not imply a useless choice: fatigue, relationships, items, branches or narrative can still change. Categories can overlap.',rows:zeroResource},
  errors:{page:games.flatMap(g=>g.errors.map(message=>({game:g.game,message}))),webgl:games.flatMap(g=>g.glErrors.map(message=>({game:g.game,message}))),
    resource:games.flatMap(g=>g.resourceFailures.map(failure=>({game:g.game,...failure}))),blockedExternal:games.flatMap(g=>g.externalBlocked.map(request=>({game:g.game,...request}))),
    issues:games.flatMap(g=>g.issues.map(issue=>({game:g.game,...issue})))},
  games:gameRows,
};
await fs.writeFile(new URL('summary.json',out),JSON.stringify(summary,null,2));
console.log(JSON.stringify({completed:summary.completed,allTwentyCompleted:summary.allTwentyCompleted,allPassed:summary.allCompletedPassed,endings:summary.endings,
  time:summary.timing.mainlineSeconds,lockedShare:summary.timing.lockedVisualPhaseShare,titles:summary.titles.counts,terminalDilemmas:summary.memories.terminalDilemmaGames,
  zeroResource:{count:zeroResource.length,denominator:turns.length,changed:summary.threeResourceZero.anyOtherTrackedSystemChange},practice:summary.practice,
  videos:summary.cinematics.videos,ended:summary.cinematics.nativeEnded,errors:summary.errors.issues.length},null,2));
