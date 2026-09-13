// Read-only pacing analysis. No game rules, saved journeys, or API requests are changed.
import fs from 'node:fs/promises';
import {EVENTS} from '../src/events.js';
import {routeFor} from '../src/route.js';
import {CINEMATIC_MANIFEST} from '../src/cinematic-manifest.js';
import {DICE_THROW_DURATION} from '../src/dice.js';
import {compactScene} from '../src/presentation.js';

const route=routeFor('full'),length=route.length;
const cinematicCells=new Set(CINEMATIC_MANIFEST.map(item=>item.cell));
// Exact fair-d6 landing probabilities conditional on reaching the end with no early ending.
// Position 0 is before station 1. Overshooting stops at station 40.
const mass=Array.from({length:length+1},()=>new Map());
mass[0].set('0,0',1);
const hit=Array(length+1).fill(0);
for(let position=0;position<length;position++){
  for(const [key,probability] of mass[position]){
    const [turns,mask]=key.split(',').map(Number);
    for(let die=1;die<=6;die++){
      const next=Math.min(length,position+die);
      const nextMask=mask|({10:1,20:2,30:4}[next]||0);
      const nextKey=`${turns+1},${nextMask}`;
      mass[next].set(nextKey,(mass[next].get(nextKey)||0)+probability/6);
      hit[next]+=probability/6;
    }
  }
}
const distribution={},milestoneMasks={};
for(const [key,probability] of mass[length]){
  const [turns,mask]=key.split(',').map(Number);
  distribution[turns]=(distribution[turns]||0)+probability;
  milestoneMasks[mask]=(milestoneMasks[mask]||0)+probability;
}
const expectedTurns=Object.entries(distribution).reduce((sum,[n,p])=>sum+Number(n)*p,0);
function quantile(q){let cumulative=0;for(const [n,p] of Object.entries(distribution)){cumulative+=p;if(cumulative>=q)return Number(n);}return length;}
const expectedClips=[...cinematicCells].reduce((sum,n)=>sum+hit[n],0);
const expectedEventChars=EVENTS.reduce((sum,event)=>sum+hit[event.number]*(event.title.length+compactScene(event.scene).preview.length+event.prompt.length+event.options.reduce((s,o)=>s+o.label.length,0)),0);
const noPractice=Array(length+1).fill(0);noPractice[0]=1;
for(let position=0;position<length;position++)for(let die=1;die<=6;die++){
  const next=Math.min(length,position+die);
  if(![11,13].includes(next))noPractice[next]+=noPractice[position]/6;
}
const expectedDistance=[0];
for(let n=1;n<=10;n++)expectedDistance[n]=1+Array.from({length:6},(_,i)=>expectedDistance[Math.max(0,n-i-1)]/6).reduce((s,x)=>s+x,0);
const nominal={
  walkingSeconds:40*1.8,
  diceSeconds:expectedTurns*DICE_THROW_DURATION/1000,
  diceResultHoldSeconds:expectedTurns*.24,
  arrivalSeconds:expectedTurns*.52,
  transitionSeconds:expectedTurns*.76,
  chapterSeconds:4*3,
  cinematicSeconds:expectedClips*4,
};
const report={
  createdAt:new Date().toISOString(),
  scope:'Exact route-only calculation, not browser or human playtime. Assumes fair d6, full route, no early ending; clips and chapters not skipped. No AI calls.',
  expectedTurns,turns:{min:Math.ceil(length/6),p10:quantile(.1),p50:quantile(.5),p90:quantile(.9),max:length},
  expectedCinematicStops:expectedClips,
  optionalCommunicationPractice:{cells:[11,13],atLeastOneProbability:1-noPractice[length],neitherProbability:noPractice[length],note:'Only in-route encounter; homepage has a separate always-available practice sample.'},
  threeLifeDecisions:{cells:[10,20,30],hitProbabilities:[10,20,30].map(cell=>({cell,probability:hit[cell]})),
    allThreeProbability:milestoneMasks[7]||0,noneProbability:milestoneMasks[0]||0},
  nominalAnimationSeconds:nominal,totalNominalAnimationSeconds:Object.values(nominal).reduce((s,n)=>s+n,0),
  omissions:'Does not include load/render stalls, alignment turns, auto-depart 0.6s/turn if enabled, reading/thinking, AI practice, browsing scenes/sources or reading ending report.',
  unimplementedIdea:{description:'If station 10/20/30 become mandatory season stops and excess die steps are discarded (diagnostic counterfactual, not a code change)',expectedTurns:expectedDistance[10]*4,extraTurns:expectedDistance[10]*4-expectedTurns},
  expectedVisibleDecisionCharacters:expectedEventChars,
  landingProbabilities:EVENTS.map(event=>({cell:event.number,title:event.title,probability:hit[event.number],cinematic:cinematicCells.has(event.number)})),
  rollCountDistribution:distribution,
};
await fs.mkdir(new URL('../test-results/ten-games/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../test-results/ten-games/pacing.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,landingProbabilities:undefined,rollCountDistribution:undefined},null,2));
