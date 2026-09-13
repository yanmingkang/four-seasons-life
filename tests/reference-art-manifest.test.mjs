import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {EVENTS} from '../src/events.js';
import {REFERENCE_IMAGES,CELL_ART,REFERENCE_GLOBAL_IDS,getCellArt,getReferenceImage} from '../src/reference-art-manifest.js';

const assetRoot=new URL('../public/art/first-edition/',import.meta.url);
const originals=process.env.REFERENCE_ART_ORIGINAL_DIR||fileURLToPath(new URL('../../素材核对/初版-20260911/media/',import.meta.url));
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function dimensions(bytes){
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  assert.equal(bytes.readUInt16BE(0),0xffd8,'expected PNG or JPEG original');
  const frames=new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);
  let offset=2;
  while(offset+3<bytes.length){
    assert.equal(bytes[offset],0xff,'invalid JPEG marker');
    while(bytes[offset]===0xff)offset++;
    const marker=bytes[offset++];
    if(marker===0xd9||marker===0xda)break;
    if(marker===0x01||marker>=0xd0&&marker<=0xd7)continue;
    const length=bytes.readUInt16BE(offset);assert.ok(length>=2&&offset+length<=bytes.length);
    if(frames.has(marker))return {height:bytes.readUInt16BE(offset+3),width:bytes.readUInt16BE(offset+5)};
    offset+=length;
  }
  throw new Error('JPEG dimensions not found');
}

test('all 55 original files exist byte-for-byte with recorded hashes and decoded dimensions',()=>{
  assert.equal(REFERENCE_IMAGES.length,55);
  assert.deepEqual(REFERENCE_IMAGES.map(image=>image.id),Array.from({length:55},(_,index)=>index+1));
  assert.deepEqual(readdirSync(assetRoot).sort(),REFERENCE_IMAGES.map(image=>image.file).sort());
  for(const image of REFERENCE_IMAGES){
    const bytes=readFileSync(new URL(image.file,assetRoot));
    assert.equal(bytes.length,image.bytes,image.file);
    assert.equal(sha256(bytes),image.sha256,image.file);
    assert.deepEqual(dimensions(bytes),{width:image.width,height:image.height},image.file);
  }
  assert.equal(REFERENCE_IMAGES.reduce((sum,image)=>sum+image.bytes,0),91537364);
});

test('copied hashes also match the independently extracted original files when present',{skip:!existsSync(originals)},()=>{
  for(const image of REFERENCE_IMAGES){
    const original=readFileSync(path.join(originals,image.file));
    assert.equal(sha256(original),sha256(readFileSync(new URL(image.file,assetRoot))),image.file);
  }
});

test('forty mappings follow the actual event locations and every image has explicit reciprocal ownership',()=>{
  assert.equal(CELL_ART.length,40);
  assert.deepEqual(REFERENCE_GLOBAL_IDS,[1,2]);
  for(const event of EVENTS){
    const art=getCellArt(event),ids=[...art.exterior,...art.interior,...art.shared];
    assert.equal(art.cell,event.number);assert.equal(art.title,event.location);assert.equal(art.season,event.season);
    assert.ok(art.referenceNotes&&art.architecturalKind);
    assert.ok(ids.length>0);assert.equal(new Set(ids).size,ids.length);
    for(const id of art.exterior)assert.equal(getReferenceImage(id).kind,'exterior');
    for(const id of art.interior)assert.equal(getReferenceImage(id).kind,'interior');
    for(const id of ids){assert.ok(getReferenceImage(id));assert.ok(getReferenceImage(id).cellIds.includes(art.cell));}
    for(const id of art.shared)assert.ok(getReferenceImage(id).cellIds.length>1);
  }
  for(const image of REFERENCE_IMAGES){
    assert.ok(['character','exterior','interior'].includes(image.kind));
    assert.ok(image.label&&image.variant);
    if(image.global){assert.equal(image.kind,'character');assert.deepEqual(image.cellIds,[]);}
    else assert.ok(image.cellIds.length>0);
    for(const number of image.cellIds){const cell=getCellArt(number);assert.ok(cell);assert.ok([...cell.exterior,...cell.interior,...cell.shared].includes(image.id));}
  }
});

test('references contain only unique local image URLs and omit the NULL Word placeholder',()=>{
  assert.equal(new Set(REFERENCE_IMAGES.map(image=>image.url)).size,55);
  assert.equal(new Set(REFERENCE_IMAGES.map(image=>image.file)).size,55);
  for(const image of REFERENCE_IMAGES){
    assert.match(image.file,/^image(?:[1-9]|[1-4][0-9]|5[0-5])\.(?:png|jpeg)$/);
    assert.equal(image.url,`/art/first-edition/${image.file}`);
    assert.doesNotMatch(image.url,/https?:|NULL|\.\.|[?#]/);
    assert.match(image.sha256,/^[a-f0-9]{64}$/);
  }
});

test('shared office references and original document numbering cannot shift game cells 7 8 or 9',()=>{
  assert.deepEqual(getCellArt(7).exterior,[10]);assert.deepEqual(getCellArt(7).shared,[9]);
  assert.deepEqual(getCellArt(8).interior,[11]);
  assert.deepEqual(getCellArt(9).shared,[7,8]);
  assert.deepEqual(getReferenceImage(8).cellIds,[4,5,6,9,31]);
  assert.deepEqual(getReferenceImage(9).cellIds,[7,24]);
  assert.deepEqual(getCellArt(22).interior,[]);assert.match(getCellArt(22).referenceNotes,/仅引用28/);
  assert.deepEqual(getCellArt(35).interior,[]);assert.equal(getReferenceImage(50).kind,'exterior');
});

test('lookup helpers accept real event IDs without manufacturing missing art and keep all catalogs immutable',()=>{
  assert.strictEqual(getCellArt({id:'cell-07'}),getCellArt(7));
  assert.strictEqual(getCellArt({eventId:'cell-31'}),getCellArt(31));
  assert.strictEqual(getCellArt({cell:40}),getCellArt(40));
  for(const value of [null,undefined,0,41,1.5,'7','cell-7','cell-00','__proto__',{},NaN])assert.equal(getCellArt(value),null);
  for(const value of [null,undefined,0,56,1.5,'1',{},NaN])assert.equal(getReferenceImage(value),null);
  assert.ok(Object.isFrozen(REFERENCE_IMAGES));assert.ok(Object.isFrozen(CELL_ART));
  for(const image of REFERENCE_IMAGES){assert.ok(Object.isFrozen(image));assert.ok(Object.isFrozen(image.cellIds));}
  for(const cell of CELL_ART){assert.ok(Object.isFrozen(cell));for(const group of ['exterior','interior','shared'])assert.ok(Object.isFrozen(cell[group]));}
});
