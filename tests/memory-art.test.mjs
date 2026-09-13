import test from 'node:test';
import assert from 'node:assert/strict';
import {MEMORY_ART,methodMemoryArt} from '../src/memory-art.js';
import {getMemoryAlbum} from '../src/memory-album.js';
import {mountMemoryAlbum} from '../src/memory-album-ui.js';
import {newGame,land,choose,advance} from '../src/engine.js';
import {completeMemoryFixture,earlyMemoryFixture} from './memory-fixtures.mjs';

// Unit fixture: begin immediately before this cell, then settle one legal move.
// This is not a playthrough and does not alter the game's random dice.
const atCell=number=>({...advance(choose(land({...newGame('full',{enriched:true}),position:number-2,season:Math.floor((number-1)/10)},1),0)),ended:'mood'});

test('editorial art is a bounded immutable local manifest, separate from actual scene stills',()=>{
  assert.ok(Object.isFrozen(MEMORY_ART));
  assert.equal(new Set(Object.values(MEMORY_ART).map(art=>art.src)).size,5);
  for(const [key,art] of Object.entries(MEMORY_ART)){
    assert.ok(Object.isFrozen(art));assert.equal(art.key,key);
    assert.equal(art.src,`/art/ending-v1/${key}.png`);
    assert.match(art.alt,/非本局场景留影/);assert.doesNotMatch(art.src,/memories|cell-/);
  }
});

test('hospital method uses accompaniment artwork while its choice keeps the actual hospital scene',()=>{
  const state=atCell(18),before=JSON.stringify(state),album=getMemoryAlbum(state);
  const choice=album.pages.find(page=>page.kind==='choice'),method=album.pages.find(page=>page.kind==='method');
  assert.equal(album.method.moment.eventId,'cell-18');assert.equal(album.method.source.id,'care_coordination');
  assert.equal(choice.moment.image,'/art/memories/cell-18.webp');
  assert.equal(method.artwork.src,'/art/ending-v1/accompany.png');
  assert.notEqual(choice.moment.image,method.artwork.src);
  assert.equal(method.moment.image,choice.moment.image); // Provenance stays unchanged.
  assert.equal(method.moment.choice,choice.moment.choice);
  assert.equal(JSON.stringify(state),before);
});

test('source-aware themes follow the selected method instead of a cover image or another choice',()=>{
  const cases=[['care_budget','accompany'],['records','communicate'],['skills','grow'],['microbreak','rest']];
  for(const [sourceId,key] of cases){
    const method={moment:{eventId:'cell-18'},source:{id:sourceId}};
    assert.equal(methodMemoryArt(method,{eventId:'cell-13'}),MEMORY_ART[key]);
    assert.equal(methodMemoryArt(method),methodMemoryArt(method));
  }
  assert.equal(methodMemoryArt({source:{id:'care_budget'}}),MEMORY_ART.grow);
});

test('complete and early albums preserve actual records, sources and season pages',()=>{
  for(const state of [completeMemoryFixture(),earlyMemoryFixture(),atCell(18)]){
    const album=getMemoryAlbum(state),again=getMemoryAlbum(state);
    assert.deepEqual(album,again);
    assert.equal(album.pages[0].artwork,MEMORY_ART.cover);
    for(const page of album.pages){
      if(page.moment)assert.ok(state.history.some(record=>record.eventId===page.moment.eventId&&record.choiceLabel===page.moment.choice));
      if(page.kind==='season'||page.kind==='choice'){
        assert.equal(page.artwork,undefined);assert.match(page.moment.image,/^\/art\/memories\/cell-\d{2}\.webp$/);
      }
    }
    const method=album.pages.find(page=>page.kind==='method');
    assert.notEqual(method.artwork.src,album.dilemma.image);
    assert.ok(state.history.find(record=>record.eventId===album.method.moment.eventId).sources.includes(album.method.source.id));
  }
});

test('missing source uses a neutral illustration without synthesizing a method or a visit',()=>{
  for(const [number,key] of [[18,'grow'],[14,'rest']]){
    const state=atCell(number);state.history.forEach(record=>{record.sources=[];});
    const album=getMemoryAlbum(state),method=album.pages.find(page=>page.kind==='method');
    assert.equal(album.method,null);assert.equal(method.artwork,MEMORY_ART[key]);
    assert.equal(method.moment.eventId,`cell-${String(number).padStart(2,'0')}`);
    assert.equal(album.count,1);assert.equal(album.pages.filter(page=>page.kind==='season').length,1);
  }
  const empty=getMemoryAlbum(newGame('full'));
  assert.equal(empty.pages[0].artwork,MEMORY_ART.cover);assert.equal(empty.hero,null);
  assert.deepEqual(empty.pages.map(page=>page.kind),['cover','share']);
  assert.equal(methodMemoryArt(null),MEMORY_ART.grow);
});

function renderPage(album,kind,t){
  const previous=globalThis.document;globalThis.document={activeElement:null};
  t.after(()=>{globalThis.document=previous;});
  const images=[],host={innerHTML:'',contains:()=>false,closest:()=>null,
    addEventListener(){},removeEventListener(){},querySelector:()=>({}),
    querySelectorAll(){
      for(const match of this.innerHTML.matchAll(/<img src="([^"]+)" alt="([^"]+)"/g))images.push({src:match[1],alt:match[2],hidden:false,nextElementSibling:{hidden:true}});
      return images;
    }};
  const dispose=mountMemoryAlbum(host,album,{index:album.pages.findIndex(page=>page.kind===kind)});
  t.after(dispose);return {host,images};
}

test('method rendering labels the illustration and never presents it as a numbered scene photo',t=>{
  const album=getMemoryAlbum(atCell(18)),{host,images}=renderPage(album,'method',t);
  assert.match(host.innerHTML,/data-memory-art="accompany"/);assert.match(host.innerHTML,/>方法插画</);
  assert.doesNotMatch(host.innerHTML,/src="\/art\/memories|18 \/ 急诊输液室/);
  assert.equal(images.length,1);assert.match(images[0].alt,/非本局场景留影/);
  assert.ok(host.innerHTML.includes(album.method.source.url));assert.ok(host.innerHTML.includes(album.method.text));
});

test('an illustration load failure shows text in place and never reloads the duplicated event photo',t=>{
  const {images}=renderPage(getMemoryAlbum(atCell(18)),'method',t),img=images[0],src=img.src;
  img.onerror();assert.equal(img.hidden,true);assert.equal(img.nextElementSibling.hidden,false);assert.equal(img.src,src);
});

test('cover keeps its main illustration and adds only a small scene verified by title evidence',t=>{
  const album=getMemoryAlbum(atCell(18)),{host,images}=renderPage(album,'cover',t);
  assert.equal(images[0].src,MEMORY_ART.cover.src);assert.match(host.innerHTML,/>回忆意象</);
  assert.equal(images.length,2);assert.equal(images[1].src,album.coverMoment.image);
  assert.match(host.innerHTML,/class="memory-cover-print"/);
  assert.ok(album.titleEvidence.some(proof=>proof.eventId===album.coverMoment.eventId));
  assert.match(host.innerHTML,/故事停在夏季/);assert.doesNotMatch(host.innerHTML,/四季成章/);
});

test('cover folds title evidence and only earned commemorations into one compact receipt',t=>{
  const album=getMemoryAlbum(atCell(18));
  const moment=album.coverMoment;
  album.commemorations=[{id:'earned-only',name:'本局纪念',reason:'这条理由来自本局已核验的记录。',evidence:[{kind:'event',eventId:moment.eventId,turn:moment.turn,choice:0}],moments:[moment]}];
  const {host}=renderPage(album,'cover',t);
  assert.match(host.innerHTML,/class="memory-commemoration">本局纪念/);
  assert.match(host.innerHTML,/<details class="memory-evidence memory-title-evidence">/);
  assert.ok(host.innerHTML.includes(`「${moment.title}」：${moment.choice}`));
  assert.doesNotMatch(host.innerHTML,/尚未解锁|待解锁|<details[^>]*\bopen\b/);
});

test('old album mocks and an empty history do not create title photos or badges',t=>{
  const album=getMemoryAlbum(newGame('full'));
  delete album.journeyTitle;delete album.commemorations;delete album.coverMoment;
  const {host,images}=renderPage(album,'cover',t);
  assert.equal(images.length,1);assert.equal(images[0].src,MEMORY_ART.cover.src);
  assert.doesNotMatch(host.innerHTML,/memory-cover-print|memory-commemoration|memory-title-evidence/);
});
