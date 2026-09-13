import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareCloudRelease,verifyCloudRelease,isRuntimeAsset,assertSafeReleasePath,validateReleaseLimits,RELEASE_LIMITS,CLOUD_HEADERS,ENDING_ART_FILES} from '../scripts/prepare-cloud-release.mjs';
import {REFERENCE_IMAGES} from '../src/reference-art-manifest.js';
import {CINEMATIC_MANIFEST} from '../src/cinematic-manifest.js';

const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const fixtureParent=path.join(project,'test-results','cloud-release-fixtures');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');

async function fixture(t) {
  await fs.mkdir(fixtureParent,{recursive:true});
  const root=await fs.mkdtemp(path.join(fixtureParent,'case-'));
  t.after(async()=>{
    // This exact generated directory, not public/dist or a workspace root.
    const resolved=await fs.realpath(root),parent=await fs.realpath(fixtureParent);
    assert.equal(path.dirname(resolved),parent);
    assert.match(path.basename(resolved),/^case-/);
    await fs.rm(resolved,{recursive:true,force:false});
  });
  async function write(name,content='fixture-runtime',where='both') {
    for(const area of where==='both'?['public','dist']:[where]) {
      const target=path.join(root,area,...name.split('/'));
      await fs.mkdir(path.dirname(target),{recursive:true});
      await fs.writeFile(target,content);
    }
  }
  const referenceImages=REFERENCE_IMAGES.map(image=>({...image,sha256:hash(`reference-${image.id}`)}));
  for(const image of referenceImages)await write(image.url.slice(1),`reference-${image.id}`);
  for(let i=1;i<=40;i++)await write(`art/memories/cell-${String(i).padStart(2,'0')}.webp`);
  for(const name of ENDING_ART_FILES)await write(name);
  for(const item of CINEMATIC_MANIFEST)for(const url of [item.src,item.poster])await write(url.slice(1));
  for(const name of ['boot-watchdog.js','share-card-licenses.txt','art/season-trees-v2.png','art/life-landmarks-v1.png','models/city/LICENSE.txt','models/nature/LICENSE.txt',...['idle','wave','work','play','sleep'].map(name=>`characters/${name}.gif`)])await write(name);
  await write('models/city/car.gltf',JSON.stringify({buffers:[{uri:'car.bin'}],images:[{uri:'texture.png'}]}));
  await write('models/city/car.bin');await write('models/city/texture.png');
  await write('index.html','<script type="module" src="/assets/index-Abc12345.js"></script><script src="/boot-watchdog.js"></script>','dist');
  await write('assets/index-Abc12345.js','import "./main-Abc12345.js";','dist');
  await write('assets/main-Abc12345.js','const art="/art/first-edition/image1.jpeg";','dist');
  return {root,write,options:{projectRoot:root,referenceImages}};
}

test('whitelist keeps the complete current runtime, not code or older delivery files',()=>{
  for(const image of REFERENCE_IMAGES)assert.equal(isRuntimeAsset(image.url.slice(1)),true);
  for(const item of CINEMATIC_MANIFEST)for(const url of [item.src,item.poster])assert.equal(isRuntimeAsset(url.slice(1)),true);
  assert.equal(isRuntimeAsset('boot-watchdog.js'),true);
  assert.equal(isRuntimeAsset('models/city/LICENSE.txt'),true);
  for(const name of ENDING_ART_FILES)assert.equal(isRuntimeAsset(name),true);
  assert.equal(isRuntimeAsset('art/ending-v1/rejected-draft.png'),false);
  for(const name of ['README.md','art/memories/README.md','models/city/notes.txt','assets/main.js','assets/main-Abc12345.js.map','cinematics/cell-13.mp4','cinematics/team-20260912/cell-08.mp4','cinematics/team-20260912/cell-31.mp4','_headers'])assert.equal(isRuntimeAsset(name),false,name);
  for(const name of ['.env','art/.hidden/a.png','../index.html','/index.html','assets\\a.js','art/%2e%2e/a','server/private.mjs','tests/a.js','auth.json'])assert.throws(()=>assertSafeReleasePath(name));
});

test('immutable release preserves all required assets; rerun verifies and reuses identical version',async t=>{
  const f=await fixture(t);
  await f.write('art/memories/README.md','delivery notes');
  await f.write('cinematics/cell-13.mp4','retired film');
  await f.write('_headers','/*\n Access-Control-Allow-Origin: *','dist');
  const first=await prepareCloudRelease(f.options),second=await prepareCloudRelease(f.options);
  assert.equal(first.reused,false);assert.equal(second.reused,true);assert.equal(first.releaseId,second.releaseId);
  assert.deepEqual(first.required,{referenceImages:55,memoryImages:40,endingImages:5,cinematics:8,posters:8});
  assert.match(first.assetsDirectory,/^\.cloud-release\/releases\/[a-f0-9]{64}\/assets$/);
  assert.equal(await fs.readFile(path.join(first.absoluteAssetsDirectory,'_headers'),'utf8'),CLOUD_HEADERS);
  assert.equal(first.files.some(file=>/README|cell-13\.mp4/.test(file.path)),false);
  assert.equal(await fs.readFile(path.join(f.root,'public/cinematics/cell-13.mp4'),'utf8'),'retired film');
  const report=JSON.parse(await fs.readFile(path.join(f.root,'test-results/cloud-release.json'),'utf8'));
  assert.equal(JSON.stringify(report).includes(f.root),false,'no private absolute paths in report');
  assert.equal(await verifyCloudRelease(first.absoluteAssetsDirectory,first.files),true);
  await fs.writeFile(path.join(first.absoluteAssetsDirectory,'boot-watchdog.js'),'tampered');
  await assert.rejects(prepareCloudRelease(f.options),/release-content-changed/);
});

test('changed runtime gets a new directory and leaves previous release untouched',async t=>{
  const f=await fixture(t),first=await prepareCloudRelease(f.options);
  await f.write('assets/main-Abc12345.js','const changed=true;','dist');
  const second=await prepareCloudRelease(f.options);
  assert.notEqual(first.releaseId,second.releaseId);
  assert.equal(await verifyCloudRelease(first.absoluteAssetsDirectory,first.files),true);
});

test('incomplete content-addressed release is neither deployed nor overwritten',async t=>{
  const f=await fixture(t),first=await prepareCloudRelease(f.options);
  await fs.unlink(path.join(path.dirname(first.absoluteAssetsDirectory),'RELEASE.json'));
  await assert.rejects(verifyCloudRelease(first.absoluteAssetsDirectory,first.files),/release-not-ready/);
  await assert.rejects(prepareCloudRelease(f.options),/release-not-ready/);
});

test('missing memory, current film or reference image fails closed',async t=>{
  const f=await fixture(t);
  for(const name of ['art/memories/cell-40.webp',ENDING_ART_FILES[0],CINEMATIC_MANIFEST[0].src.slice(1),REFERENCE_IMAGES[54].url.slice(1)]) {
    const location=path.join(f.root,'dist',name),original=await fs.readFile(location);
    await fs.unlink(location);
    await assert.rejects(prepareCloudRelease(f.options),/missing-dependency/);
    await fs.writeFile(location,original);
  }
});

test('stale dist public copy, missing model dependency and wrong reference hash are refused',async t=>{
  const f=await fixture(t);
  await f.write('characters/idle.gif','changed-public','public');
  await assert.rejects(prepareCloudRelease(f.options),/stale-public-copy/);
  await f.write('characters/idle.gif');
  await f.write('models/city/car.gltf',JSON.stringify({buffers:[{uri:'missing.bin'}]}));
  await assert.rejects(prepareCloudRelease(f.options),/missing-dependency/);
  await f.write('models/city/car.gltf','{}');
  await f.write(REFERENCE_IMAGES[0].url.slice(1),'incorrect-reference');
  await assert.rejects(prepareCloudRelease(f.options),/reference-image-hash-mismatch/);
});

test('missing dynamic Vite chunk and development entry are refused',async t=>{
  const f=await fixture(t);
  await f.write('assets/index-Abc12345.js','import "./missing-Abc12345.js";','dist');
  await assert.rejects(prepareCloudRelease(f.options),/missing-dependency/);
  await f.write('assets/index-Abc12345.js','const okay=true;','dist');
  await f.write('index.html','<script src="/@vite/client"></script>','dist');
  await assert.rejects(prepareCloudRelease(f.options),/development-index/);
});

test('secret values never enter output or errors; hidden credentials abort without being read',async t=>{
  const f=await fixture(t),fake='sk-'+('FAKE_TEST_NOT_A_REAL_KEY').repeat(2);
  await f.write('assets/main-Abc12345.js',`const token="${fake}";`,'dist');
  await assert.rejects(prepareCloudRelease(f.options),error=>/secret-detected/.test(error.message)&&!error.message.includes(fake));
  await f.write('assets/main-Abc12345.js','const safe=true;','dist');
  await f.write('.env','fake-hidden','dist');
  await assert.rejects(prepareCloudRelease(f.options),/hidden-or-traversal/);
});

test('limits enforce 25 MiB per file and 20,000 files including generated headers',async t=>{
  validateReleaseLimits([{path:'okay',bytes:RELEASE_LIMITS.maxFileBytes}]);
  assert.throws(()=>validateReleaseLimits([{path:'too-large',bytes:RELEASE_LIMITS.maxFileBytes+1}]),/file-size-limit/);
  assert.throws(()=>validateReleaseLimits(Array.from({length:20001},()=>({path:'a',bytes:1}))),/file-count-limit/);
  const f=await fixture(t),target=path.join(f.root,'dist/art/season-trees-v2.png');
  const handle=await fs.open(target,'w');await handle.truncate(RELEASE_LIMITS.maxFileBytes+1);await handle.close();
  await assert.rejects(prepareCloudRelease(f.options),/file-size-limit/);
});

test('directory junctions/symlinks cannot be published or used as release output',async t=>{
  const f=await fixture(t),external=path.join(f.root,'outside');await fs.mkdir(external);
  await fs.symlink(external,path.join(f.root,'dist/linked'),'junction');
  await assert.rejects(prepareCloudRelease(f.options),/symbolic-link/);
  await fs.unlink(path.join(f.root,'dist/linked'));
  await fs.symlink(external,path.join(f.root,'.cloud-release'),'junction');
  await assert.rejects(prepareCloudRelease(f.options),/symbolic-link/);
  assert.deepEqual(await fs.readdir(external),[]);
});

test('reference fixture injection cannot omit or replace any required reference path',async t=>{
  const f=await fixture(t);
  await assert.rejects(prepareCloudRelease({...f.options,referenceImages:f.options.referenceImages.slice(1)}),/reference-manifest-paths-changed/);
});
