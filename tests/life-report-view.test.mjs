import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,land,choose,advance,previewChoice,interactCompanion} from '../src/engine.js';
import {REVIEW_CELLS,getTenDecisionReview,tenDecisionReviewMarkup,getSeasonReview,getEndingReflection,endingReflectionMarkup,endingReflectionText} from '../src/life-report-view.js';
import {EVENTS} from '../src/events.js';
import {SOURCES} from '../src/sources.js';

const best=state=>state.active.options.map((option,index)=>({index,p:previewChoice(state,option)})).filter(row=>!row.p.disabled).sort((a,b)=>b.p.mood-a.p.mood||b.p.exp-a.p.exp)[0].index;
const step=(state,die=1)=>{const landed=land(state,die);return advance(choose(landed,best(landed)));};
function complete(){let state=newGame('full',{enriched:true});while(!state.ended)state=step(state);return state;}

test('ten fixed review nodes distinguish landed, skipped, future and pending without inventing choices',()=>{
  let state=newGame('full',{enriched:true});
  state=step(step(state,6),6);
  const rows=getTenDecisionReview(state);
  assert.deepEqual(rows.map(row=>row.number),[6,10,13,15,18,20,22,27,30,31]);
  assert.equal(rows[0].status,'visited');assert.equal(rows[0].record.choiceLabel,state.history[0].choiceLabel);
  assert.equal(rows[1].status,'skipped');assert.equal(rows[1].record,null);assert.equal(rows[1].statusLabel,'本局未停靠');
  assert.equal(rows[2].status,'ahead');assert.equal(rows[2].record,null);
  const pending=getTenDecisionReview(land(state,1)).find(row=>row.number===13);
  assert.equal(pending.status,'pending');assert.equal(pending.record,null);
  const demo=getTenDecisionReview(newGame('demo',{enriched:true}));
  assert.equal(demo.find(row=>row.number===30).status,'outside');
  assert.equal(demo.find(row=>row.number===10).status,'ahead');
});

test('a complete traversal records all ten nodes and displays actual before/after state',()=>{
  const state=complete(),before=structuredClone(state),rows=getTenDecisionReview(state),markup=tenDecisionReviewMarkup(state);
  assert.equal(state.ended,'complete');assert.equal(rows.length,10);assert.ok(rows.every(row=>row.record));
  assert.match(markup,/亲历 10 \/ 10/);assert.match(markup,/class="report-fold ten-decision-review" open/);
  assert.equal((markup.match(/data-review-cell=/g)||[]).length,10);
  for(const row of rows){assert.ok(markup.includes(row.record.choiceLabel));assert.ok(markup.includes(`¥${row.record.before.money.toLocaleString('zh-CN')} → ¥${row.record.after.money.toLocaleString('zh-CN')}`));}
  assert.deepEqual(state,before);
});

test('causal review requires a settled destination and only connects explicit asset origins',()=>{
  const state=complete();
  const spring=getTenDecisionReview(state).find(row=>row.number===10);
  assert.ok(spring.outgoing.length>0);
  assert.ok(spring.outgoing.every(cause=>state.history.includes(cause.record)));
  const incomplete={...state,history:state.history.filter(record=>record.tile<10)};
  assert.equal(getTenDecisionReview(incomplete).find(row=>row.number===10).outgoing.length,0);
  const home=state.history.find(record=>record.eventId==='cell-30');
  const assetState={...state,history:state.history.map(record=>record===home?{...record,choice:0}:record),life:{...state.life,business:{...state.life.business,origin:'cell-30'},transactions:[
    {kind:'home',turn:home.turn,title:'真实首付',result:'已确认首付'},
    {kind:'business',turn:home.turn+1,title:'真实小样',result:'已验证小样'},
    {kind:'companion',turn:home.turn+1,title:'另一次交流',result:'已经交流'}
  ]}};
  assert.deepEqual(getTenDecisionReview(assetState).find(row=>row.number===30).transactions.map(row=>row.title),['真实首付','真实小样']);
});

test('four season chapter totals reconcile event settlements and independent actions at boundaries',()=>{
  let state=newGame('full',{enriched:true});
  state=interactCompanion(state,'share');
  while(!state.ended){state=land(state,1);if(state.active.number===11)state=interactCompanion(state,'share');state=advance(choose(state,best(state)));}
  const chapters=getSeasonReview(state);
  assert.equal(chapters.length,4);assert.equal(chapters[0].actions.length,1);assert.equal(chapters[1].actions.length,1);
  for(const [key,initial] of [['money',5000],['mood',100],['exp',10]])assert.equal(initial+chapters.reduce((sum,chapter)=>sum+chapter.delta[key],0),state[key]);
  const reflection=getEndingReflection(state);
  assert.equal(reflection.complete,true);assert.match(endingReflectionMarkup(state),/四时人生总结/);
  assert.doesNotMatch(endingReflectionMarkup(state),/全部 40.*停靠/);
  const crossed=step(step(newGame('full',{enriched:true}),6),6);
  assert.match(tenDecisionReviewMarkup(crossed),/这次掷骰越过了这一格/);
});

test('unfinished book uses exact curated excerpt with author and its actual originating event',()=>{
  const event=EVENTS.find(event=>event.sources.some(id=>SOURCES[id]?.excerpt));
  const source=event.sources.map(id=>SOURCES[id]).find(source=>source.excerpt);
  const state={...newGame('full',{enriched:true}),name:'旅人',ended:'mood',season:event.season,history:[{eventId:event.id,title:event.title,choiceLabel:event.options[0].label,sources:event.sources,season:event.season,tile:event.number-1,turn:1}]};
  const reflection=getEndingReflection(state),markup=endingReflectionMarkup(state),text=endingReflectionText(state);
  assert.equal(reflection.source.id,source.id);assert.equal(reflection.sourceRecord.title,event.title);
  assert.equal(reflection.source.excerpt,source.excerpt);assert.match(markup,/未竟之书/);assert.match(markup,/核对片段摘录/);
  assert.ok(markup.includes(source.author));assert.ok(text.includes(source.excerpt));assert.ok(text.includes(source.url));
  assert.doesNotMatch(markup,/已核验全文|真实失败经历|死亡/);
  assert.equal(endingReflectionMarkup(newGame()),'');
});

test('historical text, source-related headings and participant name remain inert in all report sections',()=>{
  const attack='<img src=x onerror="alert(1)"> & <script>bad()</script>';
  const state=step(newGame('full',{enriched:true}),6);
  state.ended='mood';state.name=attack;
  Object.assign(state.history[0],{title:attack,choiceLabel:attack,result:attack,lesson:attack,conditionNote:attack,talentNote:attack});
  const escaped='&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &lt;script&gt;bad()&lt;/script&gt;';
  for(const markup of [tenDecisionReviewMarkup(state),endingReflectionMarkup(state)]){assert.ok(markup.includes(escaped));assert.doesNotMatch(markup,/<img src=x|<script>/);}
});
