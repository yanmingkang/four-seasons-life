import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,land,choose,advance,previewChoice} from '../src/engine.js';
import {EVENTS} from '../src/events.js';
import {publicShareUrl,shareCardData,SHARE_REPORT_POINTS} from '../src/share-card.js';

const fresh=()=>newGame('full',{enriched:true,name:'PRIVATE_PLAYER_NAME'});
const settled=()=>choose(land(fresh(),1),0);

test('public game URLs require HTTPS and discard search and fragment credentials',()=>{
  assert.equal(publicShareUrl('https://four-seasons.example.com/play?access_token=PRIVATE_TOKEN#PRIVATE_SECRET'),'https://four-seasons.example.com/play');
  for(const url of ['',null,'not a url','/play','http://four-seasons.example.com/','javascript:alert(1)','file:///game/index.html','https://name:password@four-seasons.example.com/'])assert.equal(publicShareUrl(url),null,String(url));
});

test('localhost, private addresses and alternate numeric host syntax cannot become public QR targets',()=>{
  const urls=[
    'https://localhost/','https://LOCALHOST:4173/','https://play.localhost/','https://printer.local/','https://localname/',
    'https://localhost./','https://play.localhost./','https://printer.local./',
    'https://127.0.0.1:4173/','https://127.1/','https://2130706433/','https://0x7f000001/',
    'https://10.1.2.3/','https://172.16.0.1/','https://172.31.255.254/','https://192.168.1.1/',
    'https://169.254.1.1/','https://100.64.0.1/','https://0.0.0.0/',
    'https://[::1]/','https://[fc00::1]/','https://[fe80::1]/','https://[::ffff:192.168.1.2]/'
  ];
  for(const url of urls)assert.equal(publicShareUrl(url),null,url);
});

test('a share card contains no player name, free-form practice, session identifiers or credentials',()=>{
  const state=settled();
  Object.assign(state,{email:'PRIVATE_EMAIL',accessSecret:'PRIVATE_ACCESS_SECRET',oauthToken:'PRIVATE_OAUTH_TOKEN',
    practice:{rows:[{role:'player',text:'PRIVATE_PLAYER_CHAT'},{role:'npc',text:'PRIVATE_NPC_CHAT'}],draft:'PRIVATE_DRAFT',sessionId:'PRIVATE_SESSION_ID'},
    apiKey:'PRIVATE_API_KEY'});
  state.life.companion.lastMessage='PRIVATE_COMPANION_TEXT';
  state.life.mentorQuestion='PRIVATE_MENTOR_TEXT';
  state.life.notices=['PRIVATE_NOTICE'];
  state.history[0].transcript=['PRIVATE_HISTORICAL_CHAT'];
  const before=structuredClone(state);
  for(const url of ['http://localhost:4173/','https://four-seasons.example.com/?token=PRIVATE_URL_TOKEN#PRIVATE_URL_FRAGMENT']){
    const data=shareCardData(state,url),serialized=JSON.stringify(data);
    assert.doesNotMatch(serialized,/PRIVATE_/);
    for(const field of ['name','email','practice','history','snapshot','accessSecret','oauthToken','apiKey','sessionId','draft'])assert.ok(!Object.hasOwn(data,field),field);
    assert.equal(data.count,1);
    assert.equal(data.choice,state.history[0].choiceLabel);
    assert.equal(data.money,state.money);assert.equal(data.mood,state.mood);assert.equal(data.exp,state.exp);
    assert.deepEqual(data.options,EVENTS[0].options.map(option=>option.label));
  }
  assert.deepEqual(state,before);
});

test('local and invalid URLs share readable dilemma text and never claim to enter an online game',()=>{
  const state=settled();
  for(const url of ['', 'http://localhost:4173/', 'https://localhost./', 'https://192.168.1.2/', 'https://[::1]/']){
    const data=shareCardData(state,url);
    assert.equal(data.publicUrl,null,url);
    assert.equal(data.qrLabel,'扫码读这道题');
    assert.match(data.qrText,/换成你，会怎么选/);
    assert.ok(data.qrText.includes(EVENTS[0].title));
    for(const [index,option] of EVENTS[0].options.entries())assert.ok(data.qrText.includes(`${index+1}. ${option.label}`));
    assert.doesNotMatch(data.qrText,/https?:|localhost|扫码进入游戏|PRIVATE_/);
  }
  const data=shareCardData(state,'https://four-seasons.example.com/game?share=ignored#ignored');
  assert.equal(data.qrLabel,'扫码进入游戏');
  assert.equal(data.qrText,'https://four-seasons.example.com/game');
  assert.equal(data.publicUrl,data.qrText);
});

test('the shared question and at most three moments come from actual visited events',()=>{
  let state=fresh();
  for(const die of [6,6,1,1]){
    state=land(state,die);
    const choices=state.active.options.map((option,index)=>({index,preview:previewChoice(state,option)})).filter(item=>!item.preview.disabled).sort((a,b)=>b.preview.mood-a.preview.mood);
    state=advance(choose(state,choices[0].index));
  }
  const data=shareCardData(state),chosen=state.history.find(record=>record.eventId==='cell-13');
  assert.equal(data.count,4);
  assert.equal(data.question,EVENTS[12].title);
  assert.equal(data.choice,chosen.choiceLabel);
  assert.equal(data.moments.length,3);
  for(const moment of data.moments)assert.ok(state.history.some(record=>record.title===moment.title&&record.choiceLabel===moment.choice));
  assert.ok(chosen.sources.includes(data.source.id));
});

test('a blank journey has no fabricated postcard or fake visited moment',()=>{
  for(const state of [undefined,null,{},fresh(),newGame()])assert.throws(()=>shareCardData(state),/先走过一段故事/);
});

const finished=()=>{
  let state=fresh();
  while(!state.ended){
    state=land(state,1);
    const choices=state.active.options.map((option,index)=>({index,p:previewChoice(state,option)})).filter(({p})=>!p.disabled).sort((a,b)=>b.p.mood-a.p.mood);
    state=advance(choose(state,choices[0].index));
  }
  return state;
};

test('a finished report contains the ten fixed choice coordinates and their settled outcomes',()=>{
  const state=finished(),data=shareCardData(state);
  assert.equal(state.ended,'complete');assert.equal(data.format,'life-report');
  assert.equal(data.reportName,'刘看山的四时人生总结');
  assert.deepEqual(data.reportPoints.map(point=>point.number),[6,10,13,15,18,20,22,27,30,31]);
  assert.deepEqual(SHARE_REPORT_POINTS,data.reportPoints.map(point=>point.number));
  assert.deepEqual(data.reportPoints.filter(point=>point.golden).map(point=>point.number),[10,20,30]);
  for(const point of data.reportPoints){
    const record=state.history.find(record=>record.tile+1===point.number);
    assert.equal(point.visited,true);assert.equal(point.choice,record.choiceLabel);assert.equal(point.result,record.result);
    assert.ok(point.change.includes(String(record.moodDelta)));assert.ok(point.change.includes(String(record.expDelta)));
  }
  assert.deepEqual(data.radar.map(axis=>axis.value),[state.money,state.mood,state.exp]);
  assert.equal(data.radar[1].maximum,state.moodMax);assert.ok(data.motto.length>10);
});

test('unfinished postcards keep their format and skipped report points do not fabricate choices',()=>{
  const state=settled();assert.equal(shareCardData(state).format,'postcard');
  state.ended='mood';state.mood=0;
  const data=shareCardData(state);
  assert.equal(data.format,'life-report');assert.equal(data.ended,'旅程暂歇');
  for(const point of data.reportPoints){assert.equal(point.visited,false);assert.equal(point.choice,'');assert.equal(point.result,'');assert.equal(point.change,'本局未停靠，无选择记录。');}
  assert.match(data.motto,/重新出发/);assert.match(data.summary,/实际停靠 1 处/);
});

test('finished report excludes private conversations and shows missing historical deltas honestly',()=>{
  const state=finished();Object.assign(state,{name:'PRIVATE_NAME',practice:{draft:'PRIVATE_DRAFT'},accessSecret:'PRIVATE_SECRET'});
  state.life.companion.lastMessage='PRIVATE_COMPANION';state.life.mentorQuestion='PRIVATE_MENTOR';state.life.notices=['PRIVATE_NOTICE'];
  state.history[5].transcript=['PRIVATE_TRANSCRIPT'];delete state.history[5].expDelta;
  const data=shareCardData(state);
  assert.doesNotMatch(JSON.stringify(data),/PRIVATE_/);
  assert.match(data.reportPoints[0].change,/专业 未记录/);
  assert.equal(data.radar[0].maximum,800000);assert.equal(data.radar[2].maximum,150);
});

test('report consequences include only settled destinations, even when an active landing creates a chain',()=>{
  const state=finished();
  state.history=state.history.filter(record=>record.tile<20);
  state.life.chains=[
    {from:'cell-10',to:'cell-18',reason:'已发生的关系影响'},
    {from:'cell-10',to:'cell-18',reason:'已发生的关系影响'},
    {from:'cell-10',to:'cell-22',reason:'尚未结算的比较场景'},
  ];
  const point=shareCardData(state).reportPoints.find(point=>point.number===10);
  assert.equal(point.consequence,'已发生的关系影响');
  assert.doesNotMatch(point.consequence,/尚未结算/);
});
