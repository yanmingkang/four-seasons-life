import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const privateRoot=path.join(root,'.private-share');
export const SHARE_STATUSES=Object.freeze(['pending','active','closed','failed']);
export function renderShareNote(config,status,remainingCount=0){
  if(!SHARE_STATUSES.includes(status))throw new Error('Unknown sharing status.');
  const label={pending:'准备中 · 尚未发布',active:'正在分享 · 公网登录页已验证',closed:'已关闭',failed:'启动或关闭未完成'}[status];
  let detail;
  if(status==='active'){
    if(!config.publicHost||!config.passcode)throw new Error('Verified host and passcode are required before activation.');
    detail=`网址：https://${config.publicHost}\n访问口令：${config.passcode}\n\n这是本次试玩的独立口令，不是知乎账号密码。请只发给受邀朋友。\n你的电脑、游戏试玩服务和转发工具需要保持运行。关机、睡眠或断网后，链接可能失效。`;
  }else{
    detail='请勿继续转发上一次的网址或口令。本文件当前不展示可分享的访问凭据。';
    if(status==='pending')detail+='\n正在准备服务并验证公网登录页；完成之前不能视为分享成功。';
    if(status==='closed')detail+='\n本次记录的分享进程已确认退出。重新启动后会生成新的链接与口令。';
    if(status==='failed')detail+=remainingCount>0?'\n仍有进程未确认退出，旧链接可能仍可访问。请重试「停止试玩分享.cmd」，不要假定分享已关闭。':'\n本次分享未能完成；记录的分享进程已确认退出。可稍后重新启动。';
  }
  return `四时人生 · 朋友试玩\n状态：${label}\n\n${detail}\n\n关闭分享：双击项目目录中的「停止试玩分享.cmd」。不会关闭本机 4173 游戏。\n重新启动：双击「启动试玩分享.cmd」。\nAI 与知乎检索会使用分享者已配置的官方额度；访问或额度受限时仍可使用备用回顾。\n\n此文件只保存在 .private-share 私有目录，不会发给浏览器，也不应上传 GitHub。\n`;
}
async function storeStatus(configPath,config,status,remainingCount=0){
  const note=renderShareNote(config,status,remainingCount);
  config.status=status;config.remainingProcessCount=remainingCount;config.updatedAt=new Date().toISOString();
  await fs.writeFile(configPath,JSON.stringify(config,null,2),{mode:0o600});
  await fs.writeFile(path.join(privateRoot,'share-info.txt'),'\uFEFF'+note,{mode:0o600});
  const result={status,note:path.join(privateRoot,'share-info.txt'),cleanupPending:remainingCount>0};
  if(status==='active'){result.url=`https://${config.publicHost}`;result.passcode=config.passcode;}
  return result;
}
async function main(){
const [action,arg,value,remaining]=process.argv.slice(2);
if(action==='create'){
  const runRoot=path.resolve(arg),expected=path.join(privateRoot,'runs')+path.sep;
  if(!runRoot.startsWith(expected))throw new Error('Run path outside private playtest directory.');
  await fs.mkdir(runRoot,{recursive:true});
  const passcode=randomBytes(12).toString('base64url');
  const config={passcode,gatewayPort:4175,upstreamPort:4174,secureCookies:true,status:'pending'};
  await fs.writeFile(path.join(runRoot,'config.json'),JSON.stringify(config,null,2),{flag:'wx',mode:0o600});
  await fs.writeFile(path.join(privateRoot,'share-info.txt'),'\uFEFF'+renderShareNote(config,'pending'),{mode:0o600});
  console.log(path.join(runRoot,'config.json'));
}else if(action==='publish'){
  const configPath=path.resolve(arg);if(!configPath.startsWith(privateRoot+path.sep))throw new Error('Private path required.');
  const url=new URL(value);if(url.protocol!=='https:'||!url.hostname.endsWith('.trycloudflare.com'))throw new Error('Unexpected public tunnel URL.');
  const config=JSON.parse(await fs.readFile(configPath,'utf8'));config.publicHost=url.host;
  console.log(JSON.stringify(await storeStatus(configPath,config,'pending')));
}else if(action==='status'){
  const configPath=path.resolve(arg);if(!configPath.startsWith(privateRoot+path.sep))throw new Error('Private path required.');
  const count=Number(remaining??0);if(!Number.isInteger(count)||count<0)throw new Error('Invalid remaining process count.');
  const config=JSON.parse(await fs.readFile(configPath,'utf8'));
  console.log(JSON.stringify(await storeStatus(configPath,config,value,count)));
}else if(action==='check-url'){
  const url=new URL(arg);if(url.protocol!=='https:'||!url.hostname.endsWith('.trycloudflare.com'))throw new Error('Unexpected share URL.');
  let ready=false,reason='unreachable';
  const deadline=Date.now()+240000;
  while(Date.now()<deadline){
    try{const response=await fetch(url.origin+'/__share/login',{signal:AbortSignal.timeout(7000)});const html=await response.text();if(response.status===200&&html.includes('name="code"')){ready=true;break;}reason=`HTTP ${response.status}`;}catch(error){reason=error.cause?.code||error.name;}
    await new Promise(resolve=>setTimeout(resolve,1500));
  }
  if(!ready){console.error(`Public login check failed: ${reason}.`);process.exitCode=1;}
}else throw new Error('Expected create, publish, status or check-url.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
