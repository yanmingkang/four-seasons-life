import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
const require=createRequire(import.meta.url),sharp=require('C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
const root=new URL('../test-results/',import.meta.url),proof=new URL('art-refinement/',root);
const width=1560,height=1050,panelW=740,panelH=388;
const text=Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f8f4e9"/><g font-family="Microsoft YaHei, sans-serif" fill="#304638"><text x="40" y="48" font-size="27" font-weight="bold">美术改进对照 · 游戏实机</text><text x="40" y="84" font-size="16">相同界面区域截图；模型取景随细节范围自动调整。原始参考图未改动。</text><text x="40" y="120" font-size="20">改进前</text><text x="800" y="120" font-size="20">本轮改进后</text><text x="40" y="557" font-size="20">大学图书馆 · 窗框、屋檐、花箱与材质</text><text x="40" y="1000" font-size="20">急诊输液室 · 墙面层次、窗帘、床护栏与推车</text></g></svg>`);
const inputs=[['art-refinement/before-building-01.png',40,140],['reference-integration/building-01.png',800,140],['art-refinement/before-scene-18.png',40,583],['reference-integration/scene-18.png',800,583]];
const panels=[];
for(const [name,left,top] of inputs){const input=await sharp(fileURLToPath(new URL(name,root))).extract({left:262,top:237,width:916,height:480}).resize(panelW,panelH).png().toBuffer();panels.push({input,left,top});}
const output=fileURLToPath(new URL('comparison.png',proof));await sharp(text).composite(panels).png().toFile(output);console.log(output);
