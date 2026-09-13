import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {REFERENCE_IMAGES} from '../src/reference-art-manifest.js';
import {CINEMATIC_MANIFEST} from '../src/cinematic-manifest.js';

export const RELEASE_LIMITS = Object.freeze({maxFiles:20000, maxFileBytes:25*1024*1024});
// Explicit original in-engine ending renders; never upload rejected image drafts.
export const ENDING_ART_FILES = Object.freeze(['cover','accompany','communicate','grow','rest'].map(name=>`art/ending-v1/${name}.png`));
export const CLOUD_HEADERS = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: same-origin
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'
`;
const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
const REQUIRED = [
  'index.html', 'boot-watchdog.js', 'share-card-licenses.txt',
  'art/season-trees-v2.png', 'art/life-landmarks-v1.png',
  ...['idle','wave','work','play','sleep'].map(name=>`characters/${name}.gif`),
  ...Array.from({length:40},(_,i)=>`art/memories/cell-${String(i+1).padStart(2,'0')}.webp`),
  ...ENDING_ART_FILES,
  ...REFERENCE_IMAGES.map(image=>image.url.slice(1)),
  ...CINEMATIC_MANIFEST.flatMap(item=>[item.src.slice(1),item.poster.slice(1)]),
  'models/city/LICENSE.txt', 'models/nature/LICENSE.txt',
];
const EXACT = new Set(REQUIRED);
const SECRET_PATTERNS = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['provider-token', /\b(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['embedded-credential', /(?:api[_-]?key|access[_-]?secret|client[_-]?secret|refresh[_-]?token|password)["']?\s*[:=]\s*["'][A-Za-z0-9_+\/-]{24,}["']/i],
  ['credential-url', /https?:\/\/[^\s/"']+:[^\s/@"']+@/],
];
const fail = (code, name='') => { throw new Error(`Cloud release ${code}${name?`: ${name}`:''}`); };

export function assertSafeReleasePath(name) {
  if(typeof name!=='string'||!name||!/^[-A-Za-z0-9_./]+$/.test(name)||name.startsWith('/')||name.includes('//'))fail('unsafe-path');
  const parts=name.split('/');
  if(parts.some(part=>!part||part.startsWith('.')))fail('hidden-or-traversal-path');
  if(parts.some(part=>/^(?:server|tests?|test-results|scripts|tools|src|node_modules|references|private|secrets?|auth\.json|credentials?(?:\..*)?)$/i.test(part))||/\.(?:pem|key|pfx|p12|env)$/i.test(name))fail('forbidden-path',name);
  return name;
}

export function isRuntimeAsset(name) {
  assertSafeReleasePath(name);
  if(EXACT.has(name))return true;
  // Only Vite's content-hashed production chunks, never an arbitrary source JS file.
  if(/^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(?:js|css|wasm|woff2?|ttf|png|jpe?g|webp|gif|svg|mp3|ogg|wav|glb|bin)$/.test(name))return true;
  return /^models\/(?:city|nature)\/[A-Za-z0-9_-]+\.(?:glb|gltf|bin|png|jpe?g|webp)$/.test(name);
}

export function validateReleaseLimits(files, limits=RELEASE_LIMITS) {
  if(files.length>limits.maxFiles)fail('file-count-limit');
  for(const file of files)if(!Number.isSafeInteger(file.bytes)||file.bytes<0||file.bytes>limits.maxFileBytes)fail('file-size-limit',file.path);
}

function scanCredentials(buffer,name) {
  const text=buffer.toString('utf8');
  for(const [rule,pattern] of SECRET_PATTERNS)if(pattern.test(text))fail(`secret-detected-${rule}`,name);
}

function beneath(root, name) {
  const absolute=path.resolve(root,name);
  const relative=path.relative(root,absolute);
  if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative))fail('outside-root');
  return absolute;
}

async function noLinks(root, relative='') {
  const pieces=relative?relative.split('/'):[];
  let current=root;
  for(let i=-1;i<pieces.length;i++) {
    if(i>=0)current=path.join(current,pieces[i]);
    const info=await fs.lstat(current);
    if(info.isSymbolicLink())fail('symbolic-link',relative||'root');
  }
}

async function inventory(root) {
  await noLinks(root);
  const output=[];
  let entriesSeen=0;
  async function visit(relative) {
    const entries=await fs.readdir(relative?beneath(root,relative):root,{withFileTypes:true});
    for(const entry of entries.sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      const name=relative?`${relative}/${entry.name}`:entry.name;
      if(++entriesSeen>100000)fail('inventory-bound');
      if(entry.isSymbolicLink())fail('symbolic-link',name);
      assertSafeReleasePath(name);
      if(entry.isDirectory())await visit(name);
      else if(entry.isFile())output.push(name);
      else fail('non-regular-file',name);
    }
  }
  await visit('');
  return output.sort();
}

async function readChecked(root,name) {
  await noLinks(root,name);
  const absolute=beneath(root,name),info=await fs.stat(absolute);
  if(!info.isFile())fail('not-a-file',name);
  validateReleaseLimits([{path:name,bytes:info.size}]);
  const buffer=await fs.readFile(absolute);
  if(buffer.length!==info.size)fail('changed-during-read',name);
  scanCredentials(buffer,name);
  return buffer;
}

function validateDependencies(buffers) {
  const exists=name=>{if(!buffers.has(name))fail('missing-dependency',name);};
  for(const name of REQUIRED)exists(name);
  for(const [name,buffer] of buffers) {
    if(!/\.(?:html|js|css|gltf)$/.test(name))continue;
    const text=buffer.toString('utf8');
    if(name==='index.html'&&(/\/@vite\/client|\bsrc=["']\/src\//.test(text)))fail('development-index');
    for(const match of text.matchAll(/["'(](\/(?:assets|art|characters|cinematics|models)\/[A-Za-z0-9_./-]+\.(?:js|css|gif|png|jpe?g|webp|glb|gltf|bin|mp4|woff2?|mp3|ogg|wav))["')?#]/g))exists(match[1].slice(1));
    if(name.startsWith('assets/'))for(const match of text.matchAll(/["']\.\/([A-Za-z0-9_-]+\.(?:js|css))["']/g))exists(`assets/${match[1]}`);
    if(name.endsWith('.gltf')) {
      let gltf;try{gltf=JSON.parse(text);}catch{fail('invalid-gltf',name);}
      for(const entry of [...(gltf.buffers||[]),...(gltf.images||[])])if(entry.uri&&!entry.uri.startsWith('data:')) {
        assertSafeReleasePath(entry.uri);
        exists(path.posix.join(path.posix.dirname(name),entry.uri));
      }
    }
  }
  if(!/\bsrc=["']\/assets\/[A-Za-z0-9_-]+\.js["']/.test(buffers.get('index.html').toString('utf8')))fail('missing-production-entry');
}

async function verifyAssetFiles(assetsDirectory, files) {
  const names=new Set(files.map(file=>file.path));
  for(const name of REQUIRED)if(!names.has(name))fail('missing-dependency',name);
  if(!names.has('_headers'))fail('missing-generated-headers');
  for(const file of files) {
    if(file.path!=='_headers'&&!isRuntimeAsset(file.path))fail('release-file-not-allowed',file.path);
    if(!/^[a-f0-9]{64}$/.test(file.sha256))fail('invalid-digest',file.path);
  }
  const all=await inventory(assetsDirectory);
  if(JSON.stringify(all)!==JSON.stringify(files.map(file=>file.path).sort()))fail('release-file-set-changed');
  for(const file of files) {
    const buffer=await readChecked(assetsDirectory,file.path);
    if(buffer.length!==file.bytes||sha256(buffer)!==file.sha256)fail('release-content-changed',file.path);
    if(file.path==='_headers'&&buffer.toString('utf8')!==CLOUD_HEADERS)fail('generated-headers-changed');
  }
  return true;
}

export async function verifyCloudRelease(assetsDirectory,files) {
  const directory=path.dirname(assetsDirectory);
  await noLinks(directory);
  let marker;
  try {await noLinks(directory,'RELEASE.json');marker=JSON.parse(await fs.readFile(path.join(directory,'RELEASE.json'),'utf8'));}
  catch {fail('release-not-ready');}
  const releaseId=sha256(JSON.stringify(files));
  if(marker.schema!==1||marker.releaseId!==releaseId||marker.filesCount!==files.length||path.basename(directory)!==releaseId)fail('invalid-release-marker');
  validateReleaseLimits(files);
  return verifyAssetFiles(assetsDirectory,files);
}

/** Build an immutable deployment-only directory. No API calls, environment reads or source mutation. */
export async function prepareCloudRelease({projectRoot=PROJECT,referenceImages=REFERENCE_IMAGES}={}) {
  // Fixture injection may replace only hashes, never the mandatory reference paths/count.
  if(JSON.stringify(referenceImages.map(image=>image.url))!==JSON.stringify(REFERENCE_IMAGES.map(image=>image.url)))fail('reference-manifest-paths-changed');
  const root=path.resolve(projectRoot);
  await noLinks(root);
  const dist=beneath(root,'dist'),publicRoot=beneath(root,'public');
  const input=await inventory(dist),buffers=new Map(),excluded=[];
  for(const name of input) {
    if(!isRuntimeAsset(name)){excluded.push(name);continue;}
    const buffer=await readChecked(dist,name);
    // Public runtime assets must match the current working copy; stale dist is not a release.
    if(name!=='index.html'&&!name.startsWith('assets/')) {
      const original=await readChecked(publicRoot,name);
      if(sha256(buffer)!==sha256(original))fail('stale-public-copy-rebuild-required',name);
    }
    buffers.set(name,buffer);
  }
  validateDependencies(buffers);
  for(const image of referenceImages)if(sha256(buffers.get(image.url.slice(1)))!==image.sha256)fail('reference-image-hash-mismatch',image.url.slice(1));
  // Cloudflare interprets this control file; never trust a supplied dist/_headers.
  buffers.set('_headers',Buffer.from(CLOUD_HEADERS));
  const files=[...buffers].sort(([a],[b])=>a.localeCompare(b,'en')).map(([name,buffer])=>({path:name,bytes:buffer.length,sha256:sha256(buffer)})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  validateReleaseLimits(files);
  const releaseId=sha256(JSON.stringify(files));
  const relative=`.cloud-release/releases/${releaseId}/assets`;
  const releaseBase=beneath(root,'.cloud-release');
  await fs.mkdir(releaseBase,{recursive:true});await noLinks(root,'.cloud-release');
  const releases=path.join(releaseBase,'releases');
  await fs.mkdir(releases,{recursive:true});await noLinks(root,'.cloud-release/releases');
  const releaseDirectory=path.join(releases,releaseId),assetsDirectory=path.join(releaseDirectory,'assets');
  let reused=false;
  try {await fs.lstat(releaseDirectory);await noLinks(releases,releaseId);await verifyCloudRelease(assetsDirectory,files);reused=true;}
  catch(error) {
    if(error.code!=='ENOENT')throw error;
    // An existing incomplete release is never overwritten or repaired in place.
    try {await fs.lstat(releaseDirectory);fail('incomplete-existing-release');}catch(check){if(check.code!=='ENOENT')throw check;}
    // Exclusively create a new content-addressed version. Large-directory rename
    // is unreliable under Windows scanners; an unready version is never returned
    // or accepted by verifyCloudRelease. Failures remain for inspection, not reuse.
    await fs.mkdir(releaseDirectory);
    await fs.mkdir(assetsDirectory);
    for(const file of files) {
      const destination=beneath(assetsDirectory,file.path);
      await fs.mkdir(path.dirname(destination),{recursive:true});
      await fs.writeFile(destination,buffers.get(file.path),{flag:'wx'});
    }
    await verifyAssetFiles(assetsDirectory,files);
    await fs.writeFile(path.join(releaseDirectory,'RELEASE.json'),`${JSON.stringify({schema:1,releaseId,filesCount:files.length})}\n`,{flag:'wx'});
    await verifyCloudRelease(assetsDirectory,files);
  }
  const report={schema:1,releaseId,assetsDirectory:relative,reused,filesCount:files.length,totalBytes:files.reduce((total,file)=>total+file.bytes,0),largestFile:files.reduce((a,b)=>a.bytes>b.bytes?a:b),limits:RELEASE_LIMITS,required:{referenceImages:REFERENCE_IMAGES.length,memoryImages:40,endingImages:ENDING_ART_FILES.length,cinematics:CINEMATIC_MANIFEST.length,posters:CINEMATIC_MANIFEST.length},excluded,files};
  const results=beneath(root,'test-results');
  await fs.mkdir(results,{recursive:true});await noLinks(root,'test-results');
  const reportPath=path.join(results,'cloud-release.json');
  try {await noLinks(results,'cloud-release.json');}catch(error){if(error.code!=='ENOENT')throw error;}
  await fs.writeFile(reportPath,`${JSON.stringify(report,null,2)}\n`);
  return {...report,absoluteAssetsDirectory:assetsDirectory};
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  if(process.argv.length>2)throw new Error('This bounded release command does not accept path overrides.');
  const report=await prepareCloudRelease();
  console.log(JSON.stringify({releaseId:report.releaseId,assetsDirectory:report.absoluteAssetsDirectory,files:report.filesCount,bytes:report.totalBytes,reused:report.reused,report:'test-results/cloud-release.json'},null,2));
}
