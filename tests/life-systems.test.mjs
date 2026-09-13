import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newGame,land,choose,advance,previewChoice,restore,snapshot,summarize,getInventory,useItem,getCompanion,interactCompanion,getHome,purchaseHome,getBusiness,interactBusiness,getLifeReport,ITEM_DEFS} from '../src/engine.js';
import {EVENTS} from '../src/events.js';

// Freeze the existing item-mechanics suite to its original schema; rhythm has its own suite.
const fresh=(options={})=>newGame('full',{enriched:true,lifeSchema:2,...options});
const at=(number,resources={},options={})=>land({...fresh(options),position:number-2,season:Math.floor((number-1)/10),...resources},1);
const best=state=>state.active.options.map((option,index)=>({index,preview:previewChoice(state,option)})).filter(item=>!item.preview.disabled).sort((a,b)=>b.preview.mood-a.preview.mood || b.preview.exp-a.preview.exp)[0].index;
function playTo(number,choices={},state=fresh()){
  while(state.position<number-1 && !state.ended){state=land(state,1);state=advance(choose(state,choices[state.active.number]??best(state)));}
  return state;
}
function checkReplay(state){assert.deepEqual(restore(snapshot(state)),state);assert.ok(new TextEncoder().encode(JSON.stringify(snapshot(state))).length<=8192);}

test('enrichment is opt-in and all eight inventory items describe bounded actual effects',()=>{
  assert.equal(newGame().life,undefined);assert.equal(snapshot(newGame()).extension,undefined);
  const state=fresh();assert.equal(state.enriched,true);assert.equal(getInventory(state).length,8);assert.equal(new Set(ITEM_DEFS.map(item=>item.id)).size,8);
  for(const item of getInventory(state)){assert.ok(item.description);assert.equal(typeof item.usable,'boolean');assert.ok(Number.isInteger(item.count));assert.ok(item.count>=0);}
  assert.equal(state.life.inventory.memo,1);assert.equal(fresh({talent:'ambitious'}).life.inventory.memo,0);
  checkReplay(state);
});

test('legacy coffee and onsen retain prices and unrestricted season when replayed',()=>{
  let state=at(4,{mood:40,money:12000},{lifeSchema:1});state=useItem(state,'coffee');assert.equal(state.money,11900);assert.equal(state.mood,60);assert.equal(state.life.inventory.coffee,1);
  assert.throws(()=>useItem(state,'coffee'),/本回合/);
  state=useItem(state,'onsen');assert.equal(state.money,1900);assert.equal(state.moodMax,110);assert.equal(state.mood,110);assert.equal(state.life.inventory.onsen,0);
  assert.throws(()=>useItem(at(4,{money:99,mood:20}),'coffee'),/储备金不足/);
  assert.throws(()=>useItem(at(4,{money:9999,mood:20}),'onsen'),/储备金不足/);
});

test('legacy earplugs retain three-settlement general damage reduction',()=>{
  let state=useItem(at(4,{mood:80},{lifeSchema:1}),'earplugs');
  assert.equal(previewChoice(state,state.active.options[0]).moodDelta,-11);
  state=choose(state,0);assert.equal(state.life.buffs.earplugs,2);
  state=choose(land(advance(state),1),0);assert.equal(state.life.buffs.earplugs,1);
  state=choose(land(advance(state),1),0);assert.equal(state.life.buffs.earplugs,0);
  assert.throws(()=>useItem(useItem(at(4,{mood:80}),'earplugs'),'earplugs'));
});

test('defense memo is a single inventory effect shared with the old automatic defense',()=>{
  let automatic=choose(at(13,{mood:50}),0);
  assert.equal(automatic.mood,50);assert.equal(automatic.memoUsed,true);assert.equal(automatic.life.inventory.memo,0);
  let manual=choose(useItem(at(11,{mood:50}),'memo'),0);
  assert.equal(manual.mood,50);assert.equal(manual.memoUsed,true);assert.equal(manual.life.buffs.memo,false);assert.equal(manual.life.inventory.memo,0);
  manual=choose(land(advance(manual),2),0);assert.equal(manual.mood,40);assert.equal(manual.life.inventory.memo,0);
});

test('mentor questions are neutral, legal guidance is an explicit game aid, and oden has a strict threshold',()=>{
  assert.throws(()=>useItem(fresh(),'mentor'),/遇到选择/);
  const mentor=useItem(at(27),'mentor');assert.match(mentor.life.mentorQuestion,/核实|确认/);assert.doesNotMatch(mentor.life.mentorQuestion,/最佳|成功率|%|第一项|第二项/);
  const legal=choose(useItem(at(27,{mood:80},{talent:'optimistic'}),'legal'),0);
  assert.equal(legal.mood,75);assert.equal(legal.life.buffs.legal,false);assert.match(legal.history.at(-1).talentNote,/不是现实法律保证/);
  assert.throws(()=>useItem(at(4,{mood:20}),'oden'),/低于 20/);
  assert.equal(useItem(at(4,{mood:19}),'oden').mood,54);
});

test('companion communication is once per season and repairs preserve independent long-distance state',()=>{
  let state=interactCompanion(fresh(),'listen');assert.equal(state.life.companion.relationship,67);assert.equal(getCompanion(state).canInteract,false);
  assert.throws(()=>interactCompanion(state,'share'),/每季/);assert.throws(()=>interactCompanion(fresh(),'unknown'),/无效/);
  state=choose(at(10),0);assert.equal(state.life.companion.longDistance,true);
  state=land(advance(state),5);state=choose(state,0);assert.equal(state.life.companion.coldWar,true);
  state=useItem(state,'communication');assert.equal(state.life.companion.coldWar,false);assert.equal(state.life.companion.longDistance,true);
  state=interactCompanion(state,'promise');assert.equal(state.life.companion.supportTurns,2);
});

test('both spring and summer decisions change later landed scenes without replacing authored options',()=>{
  const first=choose(at(10),0),local=choose(at(10),1);
  const farScene=land(advance(first),2),localScene=land(advance(local),2);
  assert.match(farScene.active.dynamicScene,/异地/);assert.match(localScene.active.dynamicScene,/留在本地/);
  assert.ok(farScene.active.scene.startsWith(EVENTS[11].scene));assert.strictEqual(farScene.active.options,EVENTS[11].options);
  const summer=choose(at(20),2),autumn=land(advance(summer),3);
  assert.match(autumn.active.dynamicScene,/分段外派/);assert.equal(autumn.active.causes[0].from,'cell-20');
  assert.equal(getLifeReport(autumn).chains[0].to,'cell-23');
});

test('long-term habits and resilience apply only after their actual settled cells',()=>{
  let state=choose(at(21,{mood:50}),0);assert.equal(state.life.buffs.longTerm,true);
  state=land(advance(state),1);assert.equal(previewChoice(state,state.active.options[1]).moodDelta,-4);
  state=choose(at(32,{mood:50}),0);assert.equal(state.life.buffs.resilience,true);
  state=land({...advance(state),position:25},1);assert.equal(previewChoice(state,state.active.options[0]).moodDelta,-8);
  const skipped=land(fresh(),6);assert.equal(skipped.life.buffs.longTerm,false);assert.equal(skipped.life.buffs.resilience,false);
});

test('legacy treehole rescues once; finished and ending feedback cannot be revived',()=>{
  let state=choose(at(4,{mood:1},{talent:'optimistic',lifeSchema:1}),0);assert.equal(state.mood,15);assert.equal(state.life.treeholeUsed,true);assert.equal(state.ended,null);
  state=land({...advance(state),position:9,season:1,mood:1},1);state=choose(state,0);assert.equal(state.mood,0);assert.equal(state.ended,'mood');
  for(const terminal of [state,advance(state)]){
    for(const action of [()=>useItem(terminal,'oden'),()=>interactCompanion(terminal,'listen'),()=>purchaseHome(terminal),()=>interactBusiness(terminal,'test')])assert.throws(action);
    assert.equal(terminal.mood,0);
  }
});

test('house planning requires separate affordable purchase and loan never makes cash negative',()=>{
  let state=choose(at(30,{money:60000}),0);assert.equal(getHome(state).planned,true);assert.equal(getHome(state).owned,false);assert.match(state.history.at(-1).result,/没有购买/);
  assert.throws(()=>purchaseHome({...state,money:59999}),/60,000/);
  state=purchaseHome(state);assert.equal(state.money,0);assert.equal(state.life.loan.remaining,240000);assert.match(state.history.at(-1).result,/确认了购买/);assert.doesNotMatch(state.history.at(-1).result,/没有购买/);
  assert.throws(()=>purchaseHome(state),/已支付/);
  state=choose(land(advance(state),1),1);assert.equal(state.money,0);assert.equal(state.life.loan.deferred,1);assert.equal(state.life.loan.remaining,240000);
  state=choose(land({...advance(state),money:2000},1),0);assert.equal(state.money,0);assert.equal(state.life.loan.remaining,238000);assert.equal(state.life.loan.paid,2000);
});

test('business requires sequential test and launch actions and pays only at the following settlement',()=>{
  let state=choose(at(29,{money:20000,mood:80}),0);assert.equal(getBusiness(state).stage,'idea');assert.throws(()=>interactBusiness(state,'launch'));
  state=interactBusiness(state,'test');assert.equal(state.money,18000);assert.equal(state.mood,75);assert.equal(state.life.business.stage,'tested');assert.throws(()=>interactBusiness(state,'launch'));
  state=choose(land(advance(state),1),2);state=interactBusiness(state,'launch');assert.equal(state.money,10000);assert.equal(state.life.business.stage,'awaiting');
  state=choose(land(advance(state),1),1);assert.equal(state.life.business.stage,'operating');assert.equal(state.life.business.earned,12000);assert.equal(state.money,22000);assert.match(state.history.at(-1).result,/试运营/);
  assert.throws(()=>interactBusiness(state,'launch'));
  assert.equal(interactBusiness(choose(at(29),0),'pause').life.business.stage,'closed');
  assert.equal(choose(at(29),2).life.business.stage,'none');
});

test('all phases, companion choices, drops, purchases and business settlements replay from commands',()=>{
  for(const talent of ['defense','ambitious','optimistic']){
    let state=fresh({talent});state=interactCompanion(state,'share');checkReplay(state);
    while(!state.ended){
      state=land(state,1);checkReplay(state);
      if(getCompanion(state).canInteract)state=interactCompanion(state,'promise');
      if(state.active.number===4 && getInventory(state).find(item=>item.id==='mentor').usable)state=useItem(state,'mentor');
      const special={20:0,27:0,29:0,30:0};
      state=choose(state,special[state.active.number]??best(state));
      if(getHome(state).canBuy)state=purchaseHome(state);
      if(getBusiness(state).canTest)state=interactBusiness(state,'test');
      else if(getBusiness(state).canLaunch)state=interactBusiness(state,'launch');
      checkReplay(state);state=advance(state);checkReplay(state);
    }
    assert.equal(state.ended,'complete');assert.ok(state.life.loan);assert.equal(state.life.business.stage,'operating');
    const report=getLifeReport(state);assert.equal(report.timeline.length,10);assert.equal(report.titles.length,4);assert.equal(report.achievements.length,8);assert.ok(report.chains.length>=2);
    assert.equal(summarize(state).achievementTitle,report.title);assert.notEqual(summarize(state).title,undefined);
    for(const point of report.timeline)assert.ok(state.history.some(record=>record.eventId===point.eventId));
  }
});

test('replay rejects unknown, duplicate, out-of-phase, oversized and post-ending commands',()=>{
  const saved=snapshot(fresh());
  const invalid=[{schema:99,actions:[]},{schema:1,actions:[],inventory:{coffee:99}},{schema:1,actions:[['r','cheat']]},{schema:1,actions:[['c',0]]},{schema:1,actions:[['a']]},{schema:1,actions:[['h']]},{schema:1,actions:[['i','onsen']]},{schema:1,actions:[['r','listen'],['r','share']]},{schema:1,actions:Array.from({length:225},()=>['a'])},{schema:1,actions:[['r','listen','extra']]}];
  for(const extension of invalid)assert.equal(restore({...saved,extension}),null,JSON.stringify(extension).slice(0,80));
  assert.equal(restore({...saved,name:'x'.repeat(8193)}),null);
  const active=land(fresh(),1),tampered=snapshot(active);tampered.moves=[{die:1,choice:0}];assert.equal(restore(tampered),null);
  let ended=playTo(40);const final=snapshot(ended);final.extension.actions.push(['i','coffee']);assert.equal(restore(final),null);
  assert.equal(restore({...saved,money:99999999,mood:99999,inventory:{coffee:99}}).money,5000);
  assert.equal(restore({...saved,extension:{...saved.extension,legacy:{proof:{...saved,phase:'finished'}}}}),null);
});


test('schema 2 inventory explains scenes, acquisition and exact new effects',()=>{
  const state=fresh();assert.equal(state.life.schema,2);
  for(const item of getInventory(state))for(const field of ['name','category','useMode','description','scene','acquisition','limits'])assert.ok(item[field],`${item.id}.${field}`);
  for(const season of [0,1])assert.throws(()=>useItem(at(4,{season,money:12000,mood:40}),'onsen'),/秋季或冬季/);
  for(const season of [2,3]){const used=useItem(at(24,{season,money:12000,mood:40}),'onsen');assert.equal(used.money,2000);assert.equal(used.moodMax,110);assert.equal(used.mood,110);}
  const coffee=useItem(at(4,{mood:90}),'coffee');assert.equal(coffee.mood,100);assert.equal(coffee.money,4900);
  const cold=choose(at(15,{mood:70}),0),relation=cold.life.companion.relationship;
  const repaired=useItem(cold,'communication');assert.equal(repaired.life.companion.relationship,relation+20);assert.equal(repaired.life.companion.coldWar,false);
  assert.equal(getInventory(fresh({lifeSchema:1})).find(item=>item.id==='coffee').name,'冰美式');
});

test('new earplugs protect rumor/comparison scenes only and expire after exactly three settlements',()=>{
  for(const number of [8,22]){
    const state=useItem(at(number,{mood:80,exp:10}),'earplugs'),option=number===8?0:1;
    const preview=previewChoice(state,state.active.options[option]);assert.equal(preview.moodDelta,0);assert.match(preview.talentNote,/免疫/);
    assert.equal(state.life.buffs.earplugs,3,'preview never consumes live state');
  }
  let state=useItem(at(4,{mood:80}),'earplugs');assert.equal(previewChoice(state,state.active.options[0]).moodDelta,-15);
  state=choose(state,0);assert.equal(state.life.buffs.earplugs,2);
  state=choose(land(advance(state),1),0);assert.equal(state.life.buffs.earplugs,1);
  state=choose(land(advance(state),1),2);assert.equal(state.life.buffs.earplugs,0);
});

test('oden auto rescues below twenty, consumes inventory before treehole and cannot mutate preview inputs',()=>{
  let state=at(4,{mood:34},{talent:'optimistic'}),preview=previewChoice(state,state.active.options[0]);
  assert.equal(preview.mood,54);assert.equal(preview.lifePreview.inventory.oden,0);assert.equal(preview.lifePreview.treeholeUsed,false);
  assert.equal(state.life.inventory.oden,1);assert.equal(state.life.usedItems.length,0);
  state=choose(state,0);assert.equal(state.mood,54);assert.equal(state.life.usedItems.at(-1).automatic,true);assert.match(state.history.at(-1).talentNote,/关东煮自动守护/);
  const boundary=choose(at(4,{mood:35},{talent:'optimistic'}),0);assert.equal(boundary.mood,20);assert.equal(boundary.life.inventory.oden,1);
  state=land({...advance(state),position:9,season:1,mood:1},1);state=choose(state,0);assert.equal(state.mood,15);assert.equal(state.life.treeholeUsed,true);
  state=land({...advance(state),position:9,season:1,mood:1},1);state=choose(state,0);assert.equal(state.mood,0);assert.equal(state.ended,'mood');
  assert.throws(()=>useItem(state,'oden'),/此时不能/);
});

test('old schema journals replay their original effects while new journals retain schema 2',()=>{
  for(const lifeSchema of [1,2]){
    let state=fresh({lifeSchema,talent:'ambitious'});state=useItem(state,'earplugs');
    state=choose(land(state,4),0);checkReplay(state);
    assert.equal(snapshot(state).extension.schema,lifeSchema);assert.equal(state.mood,lifeSchema===1?88:83);
    while(!state.ended){state=land(advance(state),1);state=choose(state,best(state));}
    state=advance(state);checkReplay(state);
  }
});
