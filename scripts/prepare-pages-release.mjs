import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {prepareCloudRelease,verifyCloudRelease} from './prepare-cloud-release.mjs';

// Derive Pages deployment from the audited immutable release, never public/ or
// the repository. Original game assets are untouched and not deleted.
const root=fileURLToPath(new URL('../',import.meta.url));
const release=await prepareCloudRelease();
await verifyCloudRelease(release.absoluteAssetsDirectory,release.files);
const compiled=await build({entryPoints:[path.join(root,'server/pages-worker.mjs')],bundle:true,write:false,
  platform:'browser',format:'esm',target:'es2022',minify:true,sourcemap:false,metafile:true});
const worker=compiled.outputFiles[0].contents;
if(Object.values(compiled.metafile.inputs).some(i=>i.imports.some(x=>x.external)))throw Error('Pages entry cannot import external modules');
const controls={
  '_worker.js':worker,
  '_routes.json':Buffer.from(JSON.stringify({version:1,include:['/','/index','/index.html','/api/*'],exclude:[]})),
  // Prevent Pages' default SPA fallback from serving HTML at private paths.
  '404.html':Buffer.from('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>未找到页面</title><h1>这个地方还没有路</h1><a href="/">返回四季</a></html>'),
};
const buffers=new Map();
for(const file of release.files)buffers.set(file.path,await fs.readFile(path.join(release.absoluteAssetsDirectory,file.path)));
for(const [name,content] of Object.entries(controls))buffers.set(name,content);
const hash=b=>createHash('sha256').update(b).digest('hex');
const files=[...buffers].map(([name,buffer])=>({path:name,bytes:buffer.length,sha256:hash(buffer)})).sort((a,b)=>a.path.localeCompare(b.path,'en'));
const releaseId=hash(JSON.stringify(files));
const parent=path.join(root,'.cloud-release/pages');await fs.mkdir(parent,{recursive:true});
for(const dir of [path.join(root,'.cloud-release'),parent])if((await fs.lstat(dir)).isSymbolicLink())throw Error('Symlink release parent refused');
const directory=path.join(parent,releaseId),assets=path.join(directory,'assets');
try{
  await fs.mkdir(directory);await fs.mkdir(assets);
  for(const file of files){const target=path.join(assets,file.path);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,buffers.get(file.path),{flag:'wx'});}
  await fs.writeFile(path.join(directory,'RELEASE.json'),JSON.stringify({releaseId,sourceRelease:release.releaseId,files}),{flag:'wx'});
}catch(e){if(e.code!=='EEXIST')throw e;}
if((await fs.lstat(directory)).isSymbolicLink()||(await fs.lstat(assets)).isSymbolicLink())throw Error('Symlink release refused');
const marker=JSON.parse(await fs.readFile(path.join(directory,'RELEASE.json'),'utf8'));
if(marker.releaseId!==releaseId||JSON.stringify(marker.files)!==JSON.stringify(files))throw Error('Incomplete or changed Pages release');
for(const file of files){
  const target=path.join(assets,file.path),stat=await fs.lstat(target);
  if(!stat.isFile()||stat.isSymbolicLink()||hash(await fs.readFile(target))!==file.sha256)throw Error('Pages release verification failed');
}
const all=await fs.readdir(assets,{recursive:true,withFileTypes:true});
if(all.some(x=>x.isSymbolicLink())||all.filter(x=>x.isFile()).length!==files.length)throw Error('Unexpected Pages release content');
const report={releaseId,sourceRelease:release.releaseId,assetsDirectory:assets,filesCount:files.length,files,
  routing:'Only entry and API invoke Pages Function; public static assets stay on free static delivery. Preview entry/API rejected; static preview assets may be public.',
  secretStorage:'Existing Worker only; no duplicated provider or visitor secrets in Pages.'};
await fs.writeFile(path.join(root,'test-results/pages-release.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({releaseId,sourceRelease:release.releaseId,assetsDirectory:assets,filesCount:files.length}));
