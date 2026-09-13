import test from 'node:test';
import assert from 'node:assert/strict';
import {EVENTS} from '../src/events.js';
import {LIFE_CHAPTERS} from '../src/season-chapters.js';
import {eventTheme,arrivalTheme,arrivalTransition,cancelArrivalTransition,ARRIVAL_DURATION} from '../src/transitions.js';

test('all forty destination events have season-specific arrival art, independent of event category',()=>{
  const marks=['花','光','叶','雪'],motifs=['petals','sunlight','leaves','snow'];
  for(const event of EVENTS){
    const original=JSON.stringify(event),theme=arrivalTheme(event.kind,event.season),chapter=LIFE_CHAPTERS[event.season];
    assert.equal(theme.mark,marks[event.season]);assert.equal(theme.motif,motifs[event.season]);
    assert.equal(theme.caption,`${chapter.name} · ${chapter.stage}`);assert.equal(theme.id,eventTheme(event.kind).id);
    assert.ok(theme.label.length<=16);assert.equal(JSON.stringify(event),original);
    if(event.season===3)assert.ok(!/叶|花香|盛夏/.test(theme.label+theme.mark));
  }
});

test('all twenty season/category combinations retain the event mood and have distinct concise copy',()=>{
  const lines=new Set();
  for(const kind of ['治愈','机会','抉择','相遇','挑战'])for(let season=0;season<4;season++){
    const theme=arrivalTheme(kind,season);assert.equal(theme.id,eventTheme(kind).id);lines.add(theme.label);
  }
  assert.equal(lines.size,20);
  assert.deepEqual(arrivalTheme('成长',1),arrivalTheme('机会',1));
  for(const value of [null,undefined,'3',-1,4,NaN,Infinity,1.5])assert.equal(arrivalTheme('',value).season,0);
  assert.equal(arrivalTheme('治愈',3).mark,'雪');assert.equal(arrivalTheme('治愈',2).mark,'叶');
});

// Minimal DOM + controlled frame clock: checks lifecycle, not visual layout.
function harness(t){
  let now=0,id=0;const frames=new Map(),listeners=new Set(),containers=[];
  class Element{
    constructor(className=''){this.className=className;this.dataset={};this.hidden=true;this.children=[];this.textContent='';this.offsetWidth=100;this.attributes={};
      const classes=new Set(),styles=new Map();this.classList={add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name)};this.style={setProperty:(key,value)=>styles.set(key,value),getPropertyValue:key=>styles.get(key)};}
    append(node){this.children.push(node);}prepend(node){this.children.unshift(node);}setAttribute(key,value){this.attributes[key]=value;}
    get childElementCount(){return this.children.length;}
    querySelector(selector){return this.children.find(e=>e.className===selector.slice(1))||null;}
  }
  const doc={hidden:false,createElement:()=>new Element(),addEventListener:(event,fn)=>listeners.add(fn),removeEventListener:(event,fn)=>listeners.delete(fn)};
  const overrides={document:doc,performance:{now:()=>now},requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:key=>frames.delete(key),matchMedia:()=>({matches:false})};
  const previous=Object.fromEntries(Object.keys(overrides).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(overrides))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  t.after(()=>{containers.forEach(cancelArrivalTransition);for(const key of Object.keys(overrides)){if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key];}});
  return {doc,frames,listeners,
    container(){const c=new Element('arrival-transition');for(const name of ['shape','mark','caption','title'])c.append(new Element(`arrival-${name}`));containers.push(c);return c;},
    advance(ms){for(let left=ms;left>0;){const step=Math.min(20,left);now+=step;left-=step;const queued=[...frames.entries()];frames.clear();queued.forEach(([,fn])=>fn(now));}},
    visibility(hidden){doc.hidden=hidden;listeners.forEach(fn=>fn());}
  };
}

test('normal arrival lasts one brief beat, then hides and releases its frame/listener',async t=>{
  const h=harness(t),c=h.container(),pending=arrivalTransition(c,'治愈',()=>true,{season:3});
  assert.equal(c.dataset.season,'3');assert.equal(c.dataset.motif,'snow');assert.equal(c.querySelector('.arrival-mark').textContent,'雪');
  assert.equal(c.querySelector('.arrival-atmosphere').childElementCount,12);assert.equal(c.hidden,false);
  assert.equal(c.style.getPropertyValue('--arrival-duration'),`${ARRIVAL_DURATION}ms`);
  h.advance(ARRIVAL_DURATION-20);assert.equal(c.hidden,false);h.advance(20);
  assert.equal((await pending).mark,'雪');assert.equal(c.hidden,true);assert.equal(c.classList.contains('playing'),false);
  assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);
});

test('reduced motion uses a stable short presentation; twenty reuses never accumulate particles',async t=>{
  const h=harness(t),c=h.container();
  for(let i=0;i<20;i++){
    const pending=arrivalTransition(c,'治愈',()=>true,{season:i%4,reducedMotion:true});
    assert.equal(c.dataset.reduced,'true');assert.equal(c.style.getPropertyValue('--arrival-duration'),'360ms');
    h.advance(340);assert.equal(c.hidden,false);h.advance(20);assert.equal((await pending).season,i%4);
    assert.equal(c.querySelector('.arrival-atmosphere').childElementCount,12);
  }
  assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);
});

test('dialog/portrait callback and page visibility pause without consuming the visible duration',async t=>{
  const h=harness(t),c=h.container();let paused=false;
  const pending=arrivalTransition(c,'相遇',()=>true,{season:1,isPaused:()=>paused});
  h.advance(400);paused=true;h.advance(2000);assert.equal(c.hidden,false);assert.equal(c.dataset.paused,'true');
  paused=false;h.visibility(true);h.advance(2000);assert.equal(c.hidden,false);assert.equal(c.dataset.paused,'true');
  h.visibility(false);h.advance(700);assert.equal(c.hidden,false);h.advance(20);
  assert.equal((await pending).season,1);assert.equal(h.listeners.size,0);
});

test('cancel, stale revision and replacement cannot leave old seasonal art on the new journey',async t=>{
  const h=harness(t),c=h.container();
  const old=arrivalTransition(c,'治愈',()=>true,{season:2});h.advance(100);
  const replacement=arrivalTransition(c,'治愈',()=>true,{season:3});assert.equal(await old,null);
  assert.equal(c.hidden,false);assert.equal(c.querySelector('.arrival-mark').textContent,'雪');
  h.advance(ARRIVAL_DURATION);assert.equal((await replacement).mark,'雪');
  let current=true;const stale=arrivalTransition(c,'抉择',()=>current,{season:1});current=false;h.advance(20);
  assert.equal(await stale,null);assert.equal(c.hidden,true);
  const cancelled=arrivalTransition(c,'挑战',()=>true,{season:0});cancelArrivalTransition(c);cancelArrivalTransition(c);
  assert.equal(await cancelled,null);assert.equal(c.hidden,true);assert.equal(h.frames.size,0);assert.equal(h.listeners.size,0);
  assert.equal(await arrivalTransition(c,'治愈',()=>false,{season:2}),null);
  assert.equal(await arrivalTransition(null,'治愈'),null);
});
