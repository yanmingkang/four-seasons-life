// Keep the already-published content-hashed JS/CSS during a Pages/Worker rollout.
// No old HTML, configuration, credential files or arbitrary directories copied.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isRuntimeAsset} from './prepare-cloud-release.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const config=JSON.parse(await fs.readFile(path.join(root,'deploy/pages/wrangler.jsonc'),'utf8'));
const relative=config.pages_build_output_dir;
if(!/^\.\.\/\.\.\/\.cloud-release\/pages\/[a-f0-9]{64}\/assets$/.test(relative))throw Error('Expected audited previous Pages release');
const source=path.resolve(root,'deploy/pages',relative),directory=path.dirname(source);
for(const folder of [source,directory,path.join(root,'dist'),path.join(root,'dist/assets')]){
  if((await fs.lstat(folder)).isSymbolicLink())throw Error('Symbolic link refused');
}
const marker=JSON.parse(await fs.readFile(path.join(directory,'RELEASE.json'),'utf8'));
const hash=value=>createHash('sha256').update(value).digest('hex');
if(!Array.isArray(marker.files)||marker.releaseId!==path.basename(directory)||hash(JSON.stringify(marker.files))!==marker.releaseId)throw Error('Previous release manifest mismatch');
let retained=0;
for(const file of marker.files){
  if(!/^assets\/[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(file.path))continue;
  if(!isRuntimeAsset(file.path))throw Error('Non-runtime chunk refused');
  const old=path.join(source,file.path),target=path.join(root,'dist',file.path),stat=await fs.lstat(old);
  if(stat.isSymbolicLink()||!stat.isFile())throw Error('Invalid previous asset');
  const contents=await fs.readFile(old);
  if(contents.length!==file.bytes||hash(contents)!==file.sha256)throw Error('Previous chunk changed');
  try{
    const current=await fs.lstat(target);
    if(current.isSymbolicLink()||!current.isFile()||hash(await fs.readFile(target))!==file.sha256)throw Error('Hashed chunk collision');
  }catch(error){
    if(error.code!=='ENOENT')throw error;
    await fs.copyFile(old,target,fs.constants.COPYFILE_EXCL);retained++;
  }
}
console.log(JSON.stringify({priorRelease:marker.releaseId,retainedChunks:retained}));
