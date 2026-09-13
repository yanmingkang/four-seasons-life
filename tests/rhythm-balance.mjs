// Deterministic strategy simulations, NOT human playtests or browser timings.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {newGame,land,choose,advance,previewChoice,snapshot,restore} from '../src/engine.js';
import {effortFor} from '../src/journey-rhythm.js';
const out=new URL('../test-results/journey-rhythm/',import.meta.url);
const seed=20260912,runs=2000;
const random=initial=>{let v=initial>>>0;return()=>{v+=0x6D2B79F5;let t=v;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};};
const groups=[];
for(const lifeSchema of [2,3])for(const strategy of ['random','cash','career','rest','pressure']){
  const group={lifeSchema,strategy,runs:0,early:0,finishLineMood:0,complete:0,totalTurns:0,completedMood:0,lowMood:0,autoOden:0};
  for(const talent of ['defense','ambitious','optimistic'])for(let run=0;run<runs;run++){
    const dice=random(seed+run*37),tie=random((seed^0x1F3ACB2D)+run*53);
    let s=newGame('full',{enriched:true,lifeSchema,talent}),low=false;
    while(!s.ended){
      s=land(s,1+Math.floor(dice()*6));
      const all=s.active.options.map((o,i)=>({i,p:previewChoice(s,o)})).filter(e=>!e.p.disabled);
      const score=e=>strategy==='cash'?e.p.money:strategy==='career'?e.p.exp:strategy==='rest'?-effortFor(s.active.number,e.i):effortFor(s.active.number,e.i);
      const best=strategy==='random'?all:all.filter(e=>score(e)===Math.max(...all.map(score)));
      s=advance(choose(s,best[Math.floor(tie()*best.length)].i));low||=s.mood<40;
      assert.ok(s.money>=0&&s.mood>=0&&s.mood<=s.moodMax);
    }
    group.runs++;group.early+=+(s.ended==='mood'&&s.position<39);group.finishLineMood+=+(s.ended==='mood'&&s.position===39);
    group.complete+=+(s.ended==='complete');group.totalTurns+=s.turn;group.completedMood+=s.ended==='complete'?s.mood:0;group.lowMood+=+low;
    group.autoOden+=+s.life.usedItems.some(i=>i.id==='oden'&&i.automatic);
    if(run===0)assert.deepEqual(restore(snapshot(s)),s);
  }
  group.earlyPercent=+(100*group.early/group.runs).toFixed(3);group.meanTurns=+(group.totalTurns/group.runs).toFixed(3);
  group.completedMoodMean=+(group.completedMood/group.complete).toFixed(2);groups.push(group);console.log(JSON.stringify(group));
}
await mkdir(out,{recursive:true});
await writeFile(new URL('balance.json',out),JSON.stringify({seed,runsPerTalent:runs,totalRuns:groups.reduce((n,g)=>n+g.runs,0),scope:'Full route, uniform six-sided dice, three talents weighted equally, no inheritance/manual tools/companion actions; automatic guards enabled. Oracle strategies read hidden values/effort only in this offline audit, never in the player UI. Not human failure rates or real minutes.',groups},null,2));
