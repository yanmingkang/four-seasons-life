import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SOURCES } from './src/sources.js';
import { createNarrator, createModelGate, NarrativeInputError, MAX_BODY_BYTES } from './server/ai.mjs';
import { createPractice, PracticeInputError } from './server/practice.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const production=process.argv.includes('--production');
const port=Number(process.env.PORT || 4173);
// A private playtest can serve an immutable build without publishing the dev
// server or changing the files currently used by another local session.
const productionRoot=path.resolve(process.env.GAME_DIST_ROOT || path.join(root,'dist'));
let vite=null;
const cache=new Map();
let lastFetch=0;
const run=promisify(execFile);
const modelGate=createModelGate();
const narrator=createNarrator({gate:modelGate});
const practice=createPractice({gate:modelGate});
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/api/health') return send(res,200,{ok:true,game:'four-seasons-life'});
    if(url.pathname==='/api/ai/status') {
      if(req.method!=='GET') return send(res,405,{error:'只支持读取'});
      const cli=process.env.ZHIHU_CLI_PATH || path.join(process.env.LOCALAPPDATA||'', 'ZhihuCLI','current','zhihu-cli.exe');
      const installed=await fs.access(cli).then(()=>true,()=>false);
      const status=narrator.status();
      return send(res,200,{...status,configured:installed,available:installed && status.available,note:installed?'已接入官方 CLI；实际响应取决于账号权限、额度和网络。':'未找到官方 CLI，将使用本局记录生成回顾。'});
    }
    if(url.pathname==='/api/narrate'||url.pathname==='/api/practice') {
      if(req.method!=='POST') return send(res,405,{error:'只支持 POST'});
      if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']||'')) return send(res,415,{error:'请发送 JSON 格式的游戏记录'});
      if(Number(req.headers['content-length'])>MAX_BODY_BYTES) {req.resume();return send(res,413,{error:'游戏记录过大'});}
      const chunks=[];
      let bytes=0;
      for await(const chunk of req) {
        bytes+=chunk.length;
        if(bytes>MAX_BODY_BYTES) {req.resume();return send(res,413,{error:'游戏记录过大'});}
        chunks.push(chunk);
      }
      let input;
      try {input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
      catch {return send(res,400,{error:'游戏记录不是有效 JSON'});}
      try {return send(res,200,await (url.pathname==='/api/practice'?practice.respond(input):narrator.narrate(input)));}
      catch(error) {if(error instanceof NarrativeInputError||error instanceof PracticeInputError)return send(res,400,{error:error.message});throw error;}
    }
    if(url.pathname==='/api/experience') {
      if(req.method!=='GET') return send(res,405,{error:'只支持读取'});
      const sourceId=url.searchParams.get('source');
      const s=Object.hasOwn(SOURCES,sourceId)?SOURCES[sourceId]:null;
      if(!s) return send(res,400,{error:'未知的经验主题'});
      const cached=cache.get(s.id);
      if(cached && Date.now()-cached.at<15*60*1000) return send(res,200,{mode:'cache',items:cached.items});
      const fallback={mode:'curated',message:'实时检索暂不可用，仍可查看本事件已核对的知乎来源。',items:[{title:s.title,author:s.author,url:s.url,excerpt:s.idea}]};
      if(Date.now()-lastFetch<3000) return send(res,200,fallback);
      lastFetch=Date.now();
      const cli=process.env.ZHIHU_CLI_PATH || path.join(process.env.LOCALAPPDATA||'', 'ZhihuCLI','current','zhihu-cli.exe');
      try {
        const {stdout}=await run(cli,['search','zhihu','--query',s.query,'--count','3'],{timeout:12000,maxBuffer:2*1024*1024,windowsHide:true});
        const body=JSON.parse(stdout);
        if(Number(body.Code)!==0 || !Array.isArray(body.Data?.Items)) throw new Error('search unavailable');
        const items=body.Data.Items.filter(i=>{
          try {const u=new URL(i.Url);return u.protocol==='https:' && ['www.zhihu.com','zhuanlan.zhihu.com'].includes(u.hostname);}catch{return false;}
        }).map(i=>({title:String(i.Title||''),author:String(i.AuthorName||'作者未返回'),url:i.Url,excerpt:String(i.ContentText||'').replace(/<[^>]*>/g,'').slice(0,150)}));
        if(!items.length) return send(res,200,fallback);
        cache.set(s.id,{at:Date.now(),items});
        return send(res,200,{mode:'live',items});
      } catch {return send(res,200,fallback);}
    }
    if(url.pathname.startsWith('/api/')) return send(res,404,{error:'接口不存在'});
    if(vite) return vite.middlewares(req,res,()=>{res.writeHead(404);res.end('Not found');});
    const dist=productionRoot;
    const target=path.resolve(dist,`.${decodeURIComponent(url.pathname)}`);
    if(target!==dist && !target.startsWith(dist+path.sep)) {res.writeHead(403);return res.end('Forbidden');}
    let file=target;
    try {if((await fs.stat(file)).isDirectory()) file=path.join(file,'index.html');} catch {
      if(path.extname(file)||/^\/(?:assets|models|characters|cinematics)(?:\/|$)/.test(url.pathname)){res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});return res.end('Not found');}
      file=path.join(dist,'index.html');
    }
    const ext=path.extname(file);
    const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.gif':'image/gif','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.gltf':'model/gltf+json','.glb':'model/gltf-binary','.mp4':'video/mp4','.webm':'video/webm'};
    const data=await fs.readFile(file);
    res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream','Content-Length':data.length});res.end(data);
  }catch {if(!res.headersSent){res.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});res.end('页面暂不可用，请确认已安装依赖并完成构建。');}}
});
server.on('error',err=>{console.error(err.code==='EADDRINUSE'?`端口 ${port} 已被占用，请打开现有页面或设置 PORT。`:err.message);process.exit(1);});
server.on('close',()=>practice.dispose());
// Keep development updates on this game's own port. Multiple local previews
// must not compete for Vite's default 24678 socket or reload another preview.
if(!production)vite=await (await import('vite')).createServer({root,server:{middlewareMode:true,ws:{server,clientPort:port}},appType:'spa'});
server.listen(port,'127.0.0.1',()=>console.log(`四时人生已启动：http://127.0.0.1:${port}`));
