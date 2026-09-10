import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENTS} from '../src/events.js';
import {SOURCES} from '../src/sources.js';
import {METHOD_STORAGE_KEY,PRESET_METHOD,makeMethodCard,loadMethodCards,collectMethodCard,methodCardMarkup,methodNotebookMarkup} from '../src/method-cards.js';

const event=EVENTS.find(item=>item.id==='cell-13');
const record=(choice=0)=>({eventId:event.id,choice});
const session=(tip='先核对一条已有记录，再约定共同确认的时间。',tipMode='live')=>({done:true,turn:2,tip,tipMode});
const card=(tip,choice=0)=>makeMethodCard(record(choice),session(tip));
const fields=['choice','eventId','mode','tip','turns','version'];
function memory(raw=null){
  let value=raw;const calls={reads:[],writes:[]};
  return {calls,getItem(key){calls.reads.push(key);return value;},setItem(key,next){calls.writes.push({key,value:next});value=next;},raw:()=>value};
}

test('only three actual cell-13 choices create cards and incomplete or invalid sessions use the fixed preset',()=>{
  for(const choice of [0,1,2]){
    const value=makeMethodCard(record(choice),null);
    assert.equal(value.choice,choice);assert.equal(value.tip,PRESET_METHOD);assert.equal(value.mode,'preset');assert.equal(value.turns,0);
    assert.deepEqual(Object.keys(value).sort(),fields);
  }
  for(const bad of [null,{},record(-1),record(3),record('0'),record(1.2),{eventId:'cell-11',choice:0}])assert.throws(()=>makeMethodCard(bad,null));
  for(const badSession of [undefined,{done:false,turn:1,tip:'不应提前暴露的内容',tipMode:'live'},
    {...session(),turn:1},{...session(),done:'true'},session(' '),session('字'.repeat(301)),session('伪造模式的提示','unknown'),session('不是固定预设','preset')]){
    const value=makeMethodCard(record(),badSession);
    assert.equal(value.tip,PRESET_METHOD);assert.equal(value.mode,'preset');
  }
  for(const mode of ['live','cache','fallback']){
    const value=makeMethodCard(record(),session('  先指出一条可核对的记录。  ',mode));
    assert.equal(value.tip,'先指出一条可核对的记录。');assert.equal(value.mode,mode);assert.equal(value.turns,2);
  }
});

test('creating or displaying a card never saves; collection is the only storage write',()=>{
  const storage=memory();const value=card();
  assert.ok(methodCardMarkup(value).includes(value.tip));
  assert.ok(methodNotebookMarkup([value]).includes(value.tip));
  assert.deepEqual(storage.calls,{reads:[],writes:[]});
  assert.deepEqual(loadMethodCards(storage),[]);assert.equal(storage.calls.writes.length,0);
  assert.equal(collectMethodCard(storage,value),true);
  assert.deepEqual(storage.calls.writes.map(write=>write.key),[METHOD_STORAGE_KEY]);
  assert.deepEqual(loadMethodCards(storage),[value]);
});

test('raw player messages, transcripts, draft text and caller-provided sources never enter a saved card',()=>{
  const stateRecord={...record(2),sources:['https://evil.example'],choiceLabel:'FORGED_CHOICE',history:['PRIVATE_GAME_HISTORY']};
  const practice={...session(),rows:[{role:'player',text:'PRIVATE_CHAT_BODY'},{role:'npc',text:'PRIVATE_NPC_BODY'}],draft:'PRIVATE_DRAFT',clientId:'PRIVATE_CLIENT_ID',sessionId:'PRIVATE_SESSION_TOKEN'};
  const value=makeMethodCard(stateRecord,practice),storage=memory();
  const forgedExtra={...value,rows:practice.rows,draft:practice.draft,sourceIds:['evil'],url:'https://evil.example',npc:'PRIVATE_NPC_BODY'};
  assert.equal(collectMethodCard(storage,forgedExtra),true);
  assert.doesNotMatch(storage.raw(),/PRIVATE_|evil\.example|sourceIds|rows|draft|npc/);
  assert.deepEqual(Object.keys(JSON.parse(storage.raw())[0]).sort(),fields);
  storage.setItem(METHOD_STORAGE_KEY,JSON.stringify([forgedExtra]));
  assert.deepEqual(loadMethodCards(storage),[value]);
  assert.doesNotMatch(methodCardMarkup(forgedExtra),/PRIVATE_|evil\.example|FORGED_CHOICE/);
});

test('invalid stored entries are discarded while known fields are preserved and normalized',()=>{
  const good=card();
  const invalid=[null,[],{},false,17,{...good,version:2},{...good,eventId:'cell-06'},
    {...good,choice:-1},{...good,choice:3},{...good,choice:'1'},{...good,tip:''},{...good,tip:'  '},
    {...good,tip:'字'.repeat(301)},{...good,tip:{}},{...good,mode:'administrator'},
    {...good,turns:0},{...good,turns:1},{...good,turns:3},{...good,turns:'2'},
    {...good,mode:'preset',tip:'来源不明却冒充固定预设'}];
  const storage=memory(JSON.stringify([...invalid,{...good,tip:` ${good.tip} `,chat:'DROP_ME'}]));
  assert.deepEqual(loadMethodCards(storage),[good]);
  assert.equal(storage.calls.writes.length,0);
  for(const value of invalid){assert.equal(collectMethodCard(storage,value),false);assert.equal(methodCardMarkup(value),'');}
  assert.equal(storage.calls.writes.length,0);
  assert.match(methodNotebookMarkup(invalid),/还没有方法卡/);
  for(const value of [null,undefined,{},'bad'])assert.match(methodNotebookMarkup(value),/还没有方法卡/);
});

test('collection and load deduplicate the same choice and trimmed reminder, keeping at most 12 most recent cards',()=>{
  const storage=memory(),same=card();
  assert.equal(collectMethodCard(storage,same),true);
  assert.equal(collectMethodCard(storage,{...same,tip:` ${same.tip} `,mode:'cache'}),true);
  assert.equal(loadMethodCards(storage).length,1);assert.equal(loadMethodCards(storage)[0].mode,'cache');
  assert.equal(collectMethodCard(storage,{...same,choice:1}),true);
  assert.equal(loadMethodCards(storage).length,2,'different choices are not silently merged');
  for(let i=0;i<18;i++)assert.equal(collectMethodCard(storage,card(`本次方法 ${i}：先核对记录。`,i%3)),true);
  const saved=loadMethodCards(storage);assert.equal(saved.length,12);
  assert.equal(saved[0].tip,'本次方法 6：先核对记录。');assert.equal(saved.at(-1).tip,'本次方法 17：先核对记录。');
  storage.setItem(METHOD_STORAGE_KEY,JSON.stringify([...saved,saved[0],saved[0],{...saved[0],mode:'fallback'}]));
  const loaded=loadMethodCards(storage);assert.equal(loaded.length,12);assert.equal(loaded.at(-1).tip,saved[0].tip);assert.equal(loaded.at(-1).mode,'fallback');
  assert.equal((methodNotebookMarkup([...saved,...saved]).match(/class="method-card"/g)||[]).length,12);
});

test('corrupt, non-array, inaccessible and write-denied storage degrade without erasing unread data',()=>{
  for(const raw of ['{broken','null','{}','"text"','42']){
    const storage=memory(raw);
    assert.deepEqual(loadMethodCards(storage),[]);assert.equal(collectMethodCard(storage,card()),false);
    assert.equal(storage.raw(),raw);assert.equal(storage.calls.writes.length,0);
  }
  let writes=0;
  const unreadable={getItem(){throw new Error('denied');},setItem(){writes++;}};
  assert.deepEqual(loadMethodCards(unreadable),[]);assert.equal(collectMethodCard(unreadable,card()),false);assert.equal(writes,0);
  const getterThrows={get getItem(){throw new Error('forbidden');}};
  for(const storage of [null,undefined,{},getterThrows]){assert.deepEqual(loadMethodCards(storage),[]);assert.equal(collectMethodCard(storage,card()),false);}
  const prior=JSON.stringify([card()]);
  const writeDenied={getItem(){return prior;},setItem(){throw new Error('quota exceeded');}};
  assert.deepEqual(loadMethodCards(writeDenied),[card()]);assert.equal(collectMethodCard(writeDenied,card('另一个提示。')),false);assert.equal(writeDenied.getItem(),prior);
});

test('card sources come only from the event registry and all links remain exact trusted HTTPS Zhihu destinations',()=>{
  const markup=methodCardMarkup({...card(),sources:[{url:'javascript:alert(1)'}],sourceIds:['__proto__'],url:'https://evil.example'});
  const links=[...markup.matchAll(/<a href="([^"]+)" target="_blank" rel="noopener noreferrer">/g)].map(match=>match[1].replaceAll('&amp;','&'));
  assert.deepEqual(links,event.sources.map(id=>new URL(SOURCES[id].url).href));
  for(const href of links){const url=new URL(href);assert.equal(url.protocol,'https:');assert.ok(['www.zhihu.com','zhuanlan.zhihu.com'].includes(url.hostname));}
  assert.doesNotMatch(markup,/javascript:|evil\.example|__proto__/);
});

test('malicious-looking tip is escaped as readable text, never executable markup or a new link',()=>{
  const payload='<img src=x onerror="window.__xss=1"> & <script>alert(1)</script> \' "';
  const value=card(payload),markup=methodCardMarkup(value);
  assert.match(markup,/&lt;img src=x onerror=&quot;window\.__xss=1&quot;&gt;/);
  assert.match(markup,/&amp; &lt;script&gt;alert\(1\)&lt;\/script&gt; &#39; &quot;/);
  assert.doesNotMatch(markup,/<img|<script|<iframe/);
  assert.equal((markup.match(/<a href=/g)||[]).length,event.sources.length);
  const storage=memory();collectMethodCard(storage,value);
  assert.doesNotMatch(methodNotebookMarkup(loadMethodCards(storage)),/<img|<script|<iframe/);
  assert.match(methodCardMarkup(makeMethodCard(record(),null)),/预设方法 · 非实时 AI/);
  assert.match(methodCardMarkup(makeMethodCard(record(),session(undefined,'fallback'))),/预设练习 · 非实时 AI/);
});
