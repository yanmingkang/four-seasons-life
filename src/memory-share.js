import QRCode from 'qrcode';
import {memoryShareData} from './memory-album.js';

// Only package-owned scene stills are loaded, never user URLs or page screenshots.
export function loadMemoryImage(src,doc,{timeout=4000}={}){
  if(!/^\/art\/memories\/cell-\d{2}\.webp$/.test(src||''))return Promise.resolve(null);
  return new Promise(resolve=>{
    const image=new doc.defaultView.Image();let done=false;
    const finish=value=>{if(done)return;done=true;clearTimeout(timer);image.onload=null;image.onerror=null;resolve(value);};
    const timer=setTimeout(()=>finish(null),timeout);
    image.onload=()=>finish(image.naturalWidth&&image.naturalHeight?image:null);image.onerror=()=>finish(null);image.src=src;
  });
}
export async function renderMemoryCard(state,{url='',document:doc=globalThis.document,imageTimeout=4000}={}){
  const data=memoryShareData(state,url),canvas=doc.createElement('canvas');canvas.width=1000;canvas.height=2250;
  const c=canvas.getContext('2d');if(!c)throw Error('浏览器暂不支持生成图片，完整手记仍可下载。');
  await Promise.race([doc.fonts?.ready||Promise.resolve(),new Promise(resolve=>setTimeout(resolve,1200))]);
  const paths=[...new Set([data.hero?.image,...data.seasons.map(s=>s.moment?.image)].filter(Boolean))];
  const loaded=await Promise.all(paths.map(async path=>[path,await loadMemoryImage(path,doc,{timeout:imageTimeout})]));
  const images=new Map(loaded);data.missingImages=loaded.filter(([,image])=>!image).map(([path])=>path);
  const rect=(x,y,w,h,color)=>{c.fillStyle=color;c.fillRect(x,y,w,h);};
  const font=(size,weight=400)=>{c.font=`${weight} ${size}px "Microsoft YaHei", sans-serif`;};
  const text=(str,x,y,size=24,color='#405a49',weight=400)=>{font(size,weight);c.fillStyle=color;c.fillText(String(str),x,y);};
  const wrap=(str,x,y,width,size=24,color='#405a49',maxLines=3)=>{
    font(size);const chars=Array.from(String(str)),lines=[];let line='';
    for(const ch of chars){if(c.measureText(line+ch).width>width&&line){lines.push(line);line='';}line+=ch;}if(line)lines.push(line);
    lines.slice(0,maxLines).forEach((line,i)=>text(i===maxLines-1&&lines.length>maxLines?`${line.slice(0,-1)}…`:line,x,y+i*size*1.55,size,color));
    return y+Math.min(lines.length,maxLines)*size*1.55;
  };
  const photo=(moment,x,y,w,h)=>{
    rect(x,y,w,h,'#d5dcd6');const image=images.get(moment?.image);
    if(image){const scale=Math.min(w/image.width,h/image.height),iw=image.width*scale,ih=image.height*scale;c.drawImage(image,x+(w-iw)/2,y+(h-ih)/2,iw,ih);}
    else{text(moment?.location||'这一季，尚未写下',x+24,y+h/2,24,'#768272');if(moment)text('画面暂缺 · 选择已经留下',x+24,y+h/2+40,18,'#768272');}
  };
  rect(0,0,1000,2250,'#f9f5e9');
  text('知乎四时  /  我的回忆册',65,67,23,'#688066');
  text('这一程，属于我的四季回忆。',65,137,43,'#294638',600);
  text(`${data.complete?'四季成章':'未竟之书'} · ${data.title} · ${data.count} 段亲历`,65,183,23,'#728067');
  wrap(data.titleReason,65,222,870,20,'#53684f',2);
  if(data.commemorations.length)wrap(`经历纪念 · ${data.commemorations.map(item=>item.name).join(' / ')}`,65,289,870,18,'#8b7048',1);
  photo(data.hero,65,315,870,485);
  rect(65,755,870,45,'#fffcf0');text(`${String(data.hero.number).padStart(2,'0')} / ${data.hero.location}`,84,784,20,'#5e745c');text('游戏 3D 场景留影',713,784,18,'#7a826e');
  text('四季里，真正留下的片段',65,854,28,'#3d5945',600);
  data.seasons.forEach((season,i)=>{
    const x=65+(i%2)*446,y=883+Math.floor(i/2)*289;
    rect(x,y,423,270,season.tint);text(`${season.name} / ${season.moment?.location||'尚未写下'}`,x+14,y+32,23,'#53684f');
    if(season.moment){photo(season.moment,x+12,y+45,399,157);wrap(season.moment.choice,x+16,y+229,388,20,'#54664c',2);}
    else{rect(x+12,y+45,399,157,'#eeeede');text('这一页留白。',x+123,y+132,23,'#8b917e');}
  });
  rect(65,1483,870,1,'#c9d1bc');text('如果是你，会怎么选？',65,1531,28,'#3b5845',600);
  wrap(data.dilemma.title,65,1575,870,25,'#53684f',1);
  wrap(`我当时选择：${data.dilemma.choice}`,65,1620,870,26,'#334f3c',2);
  rect(65,1703,870,1,'#c9d1bc');text('带走的一小步',65,1752,28,'#3b5845',600);
  const method=data.method;
  if(method){
    wrap(`下次，${method.when}时`,65,1795,870,21,'#758168',1);
    wrap(method.text,65,1838,870,27,'#3c5844',3);
    wrap(`知乎 · ${method.source.author} / ${method.source.title}`,65,1973,630,19,'#3e6b92',2);
    text('相关讨论整理，非答主原话',65,2043,18,'#79846d');
    wrap(method.source.url,65,2079,630,17,'#697b65',3);
  }else{wrap('把这次选择里还没想清楚的问题，留给下一次尝试。',65,1810,870,27,'#3c5844',3);text('本局没有可对应的来源记录，不补写答主建议。',65,1973,20,'#748168');}
  const qr=doc.createElement('canvas');await QRCode.toCanvas(qr,data.qrText,{width:184,margin:4,errorCorrectionLevel:'M',color:{dark:'#304d3d',light:'#fffdf3'}});
  c.drawImage(qr,751,1960,184,184);text(data.qrLabel,772,2173,19,'#5b7056');
  text('虚构体验，不预测人生。仅分享本局选择，不含姓名或练习对话。',65,2207,17,'#7c8573');
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('图片生成失败，请重试或下载完整手记。')),'image/png'));
  return {blob,data,canvas};
}
