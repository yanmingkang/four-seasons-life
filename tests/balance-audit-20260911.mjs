// Read-only balance audit against the same enriched schema as the player UI.
// Program simulations are not human playtests or real-browser timing evidence.
import assert from 'node:assert/strict';
import {mkdir, writeFile, readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {newGame, land, choose, advance, previewChoice, TALENTS, RULES, snapshot, restore} from '../src/engine.js';
import {EVENTS} from '../src/events.js';
import {routeFor} from '../src/route.js';

const runs = Number(process.env.BALANCE_AUDIT_RUNS || 10000);
assert.ok(Number.isInteger(runs) && runs > 0 && runs <= 100000);
const seed = 20260911;
const startedAt = new Date().toISOString();
const outputDir = new URL('../test-results/ten-games/', import.meta.url);
const mulberry = initial => {
  let value=initial>>>0;
  return () => {value+=0x6D2B79F5;let t=value;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
};
const stats = values => {
  const sorted=[...values].sort((a,b)=>a-b);
  const q=p=>sorted[Math.max(0,Math.ceil(p*sorted.length)-1)]??null;
  return {min:sorted[0]??null,p10:q(.1),p25:q(.25),median:q(.5),p75:q(.75),p90:q(.9),p95:q(.95),max:sorted.at(-1)??null,mean:sorted.length?Number((sorted.reduce((a,b)=>a+b,0)/sorted.length).toFixed(4)):null};
};
const rawMood = (state,option) => {
  const threshold=option.threshold;
  const resolved=threshold?{...option,...(state.exp>=threshold.exp?threshold.success:threshold.failure)}:option;
  // Intentional drain avoids full-heal choices. It does not see future dice.
  return resolved.fillMood ? state.moodMax-state.mood+1000 : resolved.mood;
};

function simulate({talent,strategy,run,fixedDice=null}) {
  const diceRandom=mulberry(seed+run*37),choiceRandom=mulberry((seed^0x1F3ACB2D)+run*53);
  let state=newGame('full',{talent,enriched:true});
  let minMood=state.mood,zeroMoney=false,lowMood=false,criticalMood=false;
  const trace=[];
  while(!state.ended) {
    const die=fixedDice?.[state.turn]??1+Math.floor(diceRandom()*6);
    state=land(state,die);
    const available=state.active.options.map((option,index)=>({index,option,p:previewChoice(state,option)})).filter(item=>!item.p.disabled);
    assert.ok(available.length);
    let chosen=available[Math.floor(choiceRandom()*available.length)];
    if(strategy!=='random') {
      const score=item=>strategy==='cash'?item.p.money:strategy==='mood'?item.p.mood:strategy==='career'?item.p.exp:-rawMood(state,item.option);
      const best=Math.max(...available.map(score));
      // Random ties avoid favoring option A when money or experience are equal.
      const ties=available.filter(item=>score(item)===best);
      chosen=ties[Math.floor(choiceRandom()*ties.length)];
    }
    const before={money:state.money,mood:state.mood,exp:state.exp};
    const cell=state.active.number,title=state.active.title,label=chosen.option.label;
    state=advance(choose(state,chosen.index));
    assert.ok(state.money>=0 && state.mood>=0 && state.exp>=0 && state.turn<=40);
    minMood=Math.min(minMood,state.mood);
    zeroMoney ||= state.money===0;
    lowMood ||= state.mood<40;
    criticalMood ||= state.mood<20;
    trace.push({turn:state.turn,die,cell,title,choice:chosen.index,label,before,after:{money:state.money,mood:state.mood,exp:state.exp},note:state.history.at(-1).talentNote});
  }
  assert.equal(state.phase,'finished');
  return {state,minMood,zeroMoney,lowMood,criticalMood,trace};
}

const groups=[];
for(const talent of Object.keys(TALENTS)) for(const strategy of ['random','cash','mood','career','drain']) {
  const g={talent,talentLabel:TALENTS[talent],strategy,runs,complete:0,mood:0,other:0,earlyMoodEnds:0,finishLineMoodEnds:0,
    odenProtectedRuns:0,odenUses:0,treeholeProtectedRuns:0,lowMoodRuns:0,criticalMoodRuns:0,
    zeroMoneyRuns:0,zeroMoneyButComplete:0,finalZeroMoneyButComplete:0,allThreeGoldenVisited:0,
    firstMoodFailure:null,firstActualEarlyMoodFailure:null,firstZeroMoneyCompletion:null};
  const turns=[],completedTurns=[],minMoods=[],finalMoods=[],finalMoney=[],cinematics=[];
  for(let run=0;run<runs;run++) {
    const {state,minMood,zeroMoney,lowMood,criticalMood,trace}=simulate({talent,strategy,run});
    g[state.ended in g?state.ended:'other']++;
    g.earlyMoodEnds+=Number(state.ended==='mood' && state.position<39);
    g.finishLineMoodEnds+=Number(state.ended==='mood' && state.position===39);
    if(state.ended==='complete') completedTurns.push(state.turn);
    turns.push(state.turn);minMoods.push(minMood);finalMoods.push(state.mood);finalMoney.push(state.money);
    cinematics.push(state.history.filter(record=>EVENTS[record.tile].cinematicId).length);
    const autoOden=state.life.usedItems.filter(item=>item.id==='oden' && item.automatic).length;
    g.odenProtectedRuns+=Number(autoOden>0);g.odenUses+=autoOden;g.treeholeProtectedRuns+=Number(state.life.treeholeUsed);
    g.zeroMoneyRuns+=Number(zeroMoney);g.lowMoodRuns+=Number(lowMood);g.criticalMoodRuns+=Number(criticalMood);
    if(zeroMoney && state.ended==='complete') {
      g.zeroMoneyButComplete++;
      if(!g.firstZeroMoneyCompletion) g.firstZeroMoneyCompletion={run,trace};
    }
    g.finalZeroMoneyButComplete+=Number(state.money===0 && state.ended==='complete');
    g.allThreeGoldenVisited+=Number([10,20,30].every(cell=>state.history.some(record=>record.tile+1===cell)));
    if(state.ended==='mood' && !g.firstMoodFailure) {
      const saved=snapshot(state);assert.equal(restore(saved)?.ended,'mood');
      g.firstMoodFailure={run,trace,snapshot:saved};
    }
    if(state.ended==='mood' && state.position<39 && !g.firstActualEarlyMoodFailure) {
      const saved=snapshot(state);assert.equal(restore(saved)?.ended,'mood');
      g.firstActualEarlyMoodFailure={run,trace,snapshot:saved};
    }
  }
  Object.assign(g,{completionPercent:100*g.complete/runs,moodEndPercent:100*g.mood/runs,earlyMoodEndPercent:100*g.earlyMoodEnds/runs,
    turns:stats(turns),completedTurns:stats(completedTurns),minimumMood:stats(minMoods),finalMood:stats(finalMoods),finalMoney:stats(finalMoney),cinematicCount:stats(cinematics)});
  groups.push(g);
  console.log(JSON.stringify({talent,strategy,complete:g.complete,earlyMood:g.earlyMoodEnds,finishLineMood:g.finishLineMoodEnds,meanTurns:g.turns.mean,minMood:g.minimumMood.min,odenRuns:g.odenProtectedRuns,treeholeRuns:g.treeholeProtectedRuns}));
}

const constantOneDrain=Object.keys(TALENTS).map(talent=> {
  const {state,minMood,trace}=simulate({talent,strategy:'drain',run:0,fixedDice:Array(40).fill(1)});
  return {talent,strategy:'drain',note:'Adversarial fixture: force every die to 1 and deliberately choose lowest raw emotion outcome; not a probability estimate.',ended:state.ended,turns:state.turn,minMood,trace};
});
const eventProfiles=EVENTS.map(event=>({cell:event.number,title:event.title,season:event.season,cinematic:!!event.cinematicId,golden:!!event.golden,
  options:event.options.map(option=>({label:option.label,money:option.money,mood:option.mood,exp:option.exp,fillMood:!!option.fillMood,moodMaxBonus:option.moodMaxBonus||0,threshold:option.threshold||null})),
  hasFreeNonnegativeMoodOption:event.options.some(option=>option.money>=0 && option.mood>=0 && !option.threshold),
  hasFullHeal:event.options.some(option=>option.fillMood)}));
const expectedRolls=[0];for(let length=1;length<=40;length++) {expectedRolls[length]=1;for(let die=1;die<=6;die++)expectedRolls[length]+=expectedRolls[Math.max(0,length-die)]/6;}
const hashes={};for(const file of ['src/engine.js','src/life-systems.js','src/events.js','src/route.js'])hashes[file]=createHash('sha256').update(await readFile(new URL(`../${file}`,import.meta.url))).digest('hex');
const baseOptions=eventProfiles.flatMap(event=>event.options);
const report={startedAt,finishedAt:new Date().toISOString(),seed,runsPerTalentStrategy:runs,totalSimulations:groups.length*runs,
  methodology:{mode:'full',routeLength:routeFor('full').length,enriched:true,lifeSchema:newGame('full',{enriched:true}).life.schema,
    legacy:false,manualItems:false,manualCompanion:false,manualBusiness:false,manualHome:false,automaticProtections:true,
    dice:'Independent seeded uniform 1..6; same per-run dice stream across talent/strategy groups.',
    choices:'Random chooses uniformly among enabled options; cash/mood/career greedily maximize immediate preview resource with random ties. These see hidden outcomes, unlike ordinary players. drain minimizes raw resolved mood and avoids full heals.',
    limitation:'Program simulations only: no human reading/thinking, actual browser rendering, wall-clock gameplay timing, AI calls or real-user failure-rate claim.'},
  rules:RULES,hashes,expectedFullRouteRollsWithoutEarlyEnd:expectedRolls[40],
  eventSummary:{note:'Base option definitions; threshold success/failure branches are resolved separately during each simulation.',
    cellsWithFreeNonnegativeMoodOption:eventProfiles.filter(event=>event.hasFreeNonnegativeMoodOption).length,
    fullHealCells:eventProfiles.filter(event=>event.hasFullHeal).map(event=>event.cell),
    negativeBaseOptions:baseOptions.filter(option=>option.mood<0).length,
    negativeBaseMoodCounts:Object.fromEntries([...new Set(baseOptions.filter(option=>option.mood<0).map(option=>option.mood))].map(value=>[value,baseOptions.filter(option=>option.mood===value).length])),
    positiveBaseOptions:baseOptions.filter(option=>option.mood>0).length,
    fullHealBaseOptions:baseOptions.filter(option=>option.fillMood).length,
    neutralBaseOptions:baseOptions.filter(option=>option.mood===0 && !option.fillMood).length},
  groups,constantOneDrain,eventProfiles};
await mkdir(outputDir,{recursive:true});
await writeFile(new URL('balance.json',outputDir),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({report:fileURLToPath(new URL('balance.json',outputDir)),totalSimulations:report.totalSimulations,expectedFullRouteRollsWithoutEarlyEnd:report.expectedFullRouteRollsWithoutEarlyEnd,eventSummary:report.eventSummary}));
