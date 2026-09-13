import QRCode from 'qrcode';
import {EVENTS} from './events.js';
import {SOURCES} from './sources.js';
import {getLifeReport,summarize} from './engine.js';

export const SHARE_REPORT_POINTS=Object.freeze([6,10,13,15,18,20,22,27,30,31]);

const finite=value=>Number.isFinite(value)?value:0;
const signed=value=>Number.isFinite(value)?`${value>0?'+':''}${value.toLocaleString('zh-CN')}`:'未记录';
const reportPoint=(state,number)=>{
  const event=EVENTS[number-1],record=state.history.find(h=>h.eventId===event.id);
  return {number,golden:[10,20,30].includes(number),title:event.title,visited:!!record,
    choice:record?.choiceLabel||'',result:record?.result||'',
    change:record?`储备 ${signed(record.moneyDelta)} 元 · 情绪 ${signed(record.moodDelta)} · 专业 ${signed(record.expDelta)}`:'本局未停靠，无选择记录。',
    consequence:record?[...new Set((state.life?.chains||[]).filter(chain=>chain.from===record.eventId&&state.history.some(settled=>settled.eventId===chain.to)).map(chain=>chain.reason).filter(Boolean))].join(' '):''};
};

// A local address is never advertised as a playable public URL. On a local
// preview the QR contains a compact, readable dilemma, not someone's save.
export function publicShareUrl(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)return null;
    const h=u.hostname.toLowerCase().replace(/\.+$/,'');if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.startsWith('[')||/^\d+(\.\d+){3}$/.test(h)||!h.includes('.'))return null;
    u.search='';u.hash='';return u.href;
  }catch{return null;}
}
export function shareCardData(state,url=''){
  if(!state?.history?.length)throw new Error('先走过一段故事，再留下旅途明信片。');
  const life=getLifeReport(state),report=summarize(state);
  const moment=state.history.find(h=>h.eventId==='cell-13')||state.history.find(h=>[10,20,30].includes(h.tile+1))||state.history.at(-1);
  const event=EVENTS.find(e=>e.id===moment.eventId),playUrl=publicShareUrl(url);
  const question=event?.title||moment.title,options=(event?.options||[]).map(o=>o.label);
  const challenge=`知乎四时 · 换成你，会怎么选？\n${question}\n${options.map((v,i)=>`${i+1}. ${v}`).join('\n')}\n虚构情景，由知乎讨论启发。`;
  // No player name, free-text NPC practice, storage journal or credentials.
  const finished=!!state.ended;
  return {title:life?.title||report.title,ended:state.ended==='complete'?'走过四季':state.ended?'旅程暂歇':'仍在路上',money:state.money,mood:state.mood,exp:state.exp,
    count:state.history.length,question,options,choice:moment.choiceLabel,
    moments:(life?.timeline||state.history.map(h=>({title:h.title,choice:h.choiceLabel}))).slice(-3).map(x=>({title:x.title,choice:x.choice})),
    source:(moment.sources||[]).map(id=>SOURCES[id]).find(Boolean)||null,
    qrText:playUrl||challenge,qrLabel:playUrl?'扫码进入游戏':'扫码读这道题',publicUrl:playUrl,
    format:finished?'life-report':'postcard',reportName:finished?'刘看山的四时人生总结':'我的四季明信片',
    ...(finished?{reportPoints:SHARE_REPORT_POINTS.map(number=>reportPoint(state,number)),
      description:report.description,
      summary:`实际停靠 ${state.history.length} 处，经历 ${new Set(state.history.map(h=>h.season)).size} 个季节；留下 ${state.history.filter(h=>h.isChoice).length} 次分叉选择。`,
      motto:state.ended!=='complete'?'故事停在这里，重新出发的权利仍在你手里。':state.mood>=55?'把余量留给生活，也把温柔留给自己。':state.exp>=150?'走得更远的同时，也给自己留一处歇脚的灯。':'你认真做过的每个选择，都在成为自己的路。',
      achievements:(life?.titles||[]).filter(entry=>entry.unlocked).map(({id,name})=>({id,name})),
      radar:[{label:'储备金',value:finite(state.money),maximum:800000,unit:'元'},
        {label:'情绪',value:finite(state.mood),maximum:Math.max(1,finite(state.moodMax)||100),unit:'点'},
        {label:'专业',value:finite(state.exp),maximum:150,unit:'点'}],
      sourceCount:new Set(state.history.flatMap(h=>h.sources||[])).size}: {})};
}

export async function renderShareCard(state,{url='',document:doc=globalThis.document}={}){
  const data=shareCardData(state,url);
  if(data.format==='life-report')return renderLifeReport(data,doc);
  const canvas=doc.createElement('canvas');canvas.width=900;canvas.height=1440;
  const c=canvas.getContext('2d');if(!c)throw new Error('浏览器暂不支持生成图片。');
  c.fillStyle='#f5f0df';c.fillRect(0,0,900,1440);
  const rect=(x,y,w,h,color,r=0)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();};
  const text=(s,x,y,size=24,color='#4e5e50',weight=400)=>{c.fillStyle=color;c.font=`${weight} ${size}px "Microsoft YaHei", sans-serif`;c.fillText(s,x,y);};
  const wrap=(s,x,y,maxWidth,size=22,color='#5a6658',maxLines=4)=>{let line='',lines=0;c.font=`400 ${size}px "Microsoft YaHei", sans-serif`;const chars=Array.from(String(s));for(let i=0;i<chars.length;i++){if(c.measureText(line+chars[i]).width>maxWidth&&line){text(line,x,y,size,color);lines++;y+=size*1.55;line='';if(lines>=maxLines-1){let remaining=chars.slice(i).join('');while(c.measureText(remaining).width>maxWidth-24)remaining=remaining.slice(0,-1);text(remaining+(i+remaining.length<chars.length?'…':''),x,y,size,color);return y+size*1.55;}}line+=chars[i];}if(line){text(line,x,y,size,color);y+=size*1.55;}return y;};
  // Four coloured native landscape panels preserve the game's seasonal identity.
  const colors=[['#f0d4c3','#d39b98'],['#c6dab7','#7e9c69'],['#ead4a0','#c89859'],['#d4e2de','#9eb8b6']];
  colors.forEach(([bg,tree],i)=>{const x=45+i*202.5;rect(x,44,202.5,202,bg);rect(x+104,95,11,122,'#8d7b60');for(const [dx,dy,r] of [[-20,0,32],[15,-18,35],[44,12,29],[8,37,37]]){c.fillStyle=tree;c.beginPath();c.arc(x+92+dx,96+dy,r,0,Math.PI*2);c.fill();}text(['春','夏','秋','冬'][i],x+18,221,24,'#586850',600);});
  // A winding path and understated small leaf details, all local drawing.
  c.strokeStyle='#fffae8';c.lineWidth=13;c.beginPath();c.moveTo(60,244);c.bezierCurveTo(160,140,235,282,350,235);c.bezierCurveTo(530,165,700,280,842,208);c.stroke();
  text('知乎四时',60,302,26,'#7f8d70',600);text('我的四季明信片',60,358,44,'#405944',600);
  text(data.title,60,410,29,'#907346',600);text(`${data.ended} · ${data.count} 段亲历`,60,449,19,'#9b947e');
  const stats=[['●',data.money.toLocaleString('zh-CN'),'储备金','#b69853'],['♥',data.mood,'情绪','#bc8d7c'],['✦',data.exp,'专业','#8aa481']];
  stats.forEach(([icon,value,label,color],i)=>{const x=60+i*263;rect(x,483,248,99,'#fffbef',14);text(icon,x+16,534,28,color);text(String(value),x+60,527,29,'#5a6654',600);text(label,x+60,555,17,'#969581');});
  rect(60,609,780,343,'#fffaf0',18);text('换成你，会怎么选？',86,650,25,'#6c8060',600);let y=wrap(data.question,86,696,720,29,'#435b47',2)+5;
  data.options.forEach((option,i)=>{y=wrap(`${['一','二','三'][i]}  ${option}`,86,y,713,20,'#6f715f',2)+9;});
  text('走过的三个片段',60,996,22,'#718366',600);
  data.moments.forEach((moment,i)=>{const lineY=1040+i*44;text(`${i+1}`,65,lineY,18,'#a79a75');wrap(moment.title,100,lineY,710,20,'#747765',1);});
  const qr=doc.createElement('canvas');await QRCode.toCanvas(qr,data.qrText,{width:160,margin:2,errorCorrectionLevel:'M',color:{dark:'#405544',light:'#fffdf4'}});c.drawImage(qr,672,1200,160,160);
  text(data.qrLabel,668,1390,18,'#7c876f');text('经验有来处，人生无标准答案。',60,1229,22,'#5d7357',600);
  if(data.source){wrap(`知乎讨论 · ${data.source.author||'作者待核对'}`,60,1270,555,18,'#8c8a78',1);wrap(data.source.title,60,1303,555,17,'#8c8a78',2);}
  text('虚构游戏 · 只记录本局经历',60,1380,16,'#a09a86');
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败，请重试。')),'image/png'));
  return {blob,data,canvas};
}

// Finished games get a complete, local report. Only the deliberately selected
// fields above reach this renderer; the save and private dialogue do not.
async function renderLifeReport(data,doc){
  const canvas=doc.createElement('canvas');canvas.width=900;
  const c=canvas.getContext('2d');if(!c)throw new Error('浏览器暂不支持生成图片。');
  const font=(size,weight=400)=>`${weight} ${size}px "Microsoft YaHei", sans-serif`;
  const lines=(value,width,size,max=20)=>{
    c.font=font(size);const rows=[];let row='';
    for(const ch of Array.from(String(value||''))){
      if(ch==='\n'){rows.push(row);row='';continue;}
      if(row&&c.measureText(row+ch).width>width){rows.push(row);row='';}
      row+=ch;
    }
    if(row)rows.push(row);
    if(rows.length>max){rows.length=max;while(c.measureText(rows[max-1]+'…').width>width)rows[max-1]=rows[max-1].slice(0,-1);rows[max-1]+='…';}
    return rows;
  };
  const sections=data.reportPoints.map(point=>{
    const title=lines(point.title,665,24,2),choice=lines(point.visited?`我的选择：${point.choice}`:point.change,716,22,6);
    const result=lines(point.result,716,20,5),consequence=lines(point.consequence?`后续影响：${point.consequence}`:'',716,18,3);
    return {...point,titleLines:title,choiceLines:choice,resultLines:result,consequenceLines:consequence,
      height:58+title.length*34+choice.length*34+(result.length?14+result.length*31:0)+(consequence.length?12+consequence.length*28:0)+(point.visited?44:0)};
  });
  const timelineY=926,footerY=timelineY+sections.reduce((sum,point)=>sum+point.height+16,0)+18;
  canvas.height=footerY+338;
  const rect=(x,y,w,h,color,r=0)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();};
  const text=(value,x,y,size=22,color='#4b5c4d',weight=400)=>{c.fillStyle=color;c.font=font(size,weight);c.fillText(String(value),x,y);};
  const paragraph=(rows,x,y,size=22,color='#4b5c4d',leading=size*1.55,weight=400)=>{for(const row of rows){text(row,x,y,size,color,weight);y+=leading;}return y;};
  c.fillStyle='#f6f1e2';c.fillRect(0,0,900,canvas.height);
  ['#ce91a0','#77936e','#c39953','#8fabba'].forEach((color,index)=>rect(index*225,0,225,12,color));
  // Small seasonal leaves give the long report the same visual identity as the town.
  ['春','夏','秋','冬'].forEach((label,index)=>{const x=666+index*46;c.fillStyle=['#cb96a0','#809b6f','#c2a05f','#8ba9b7'][index];c.beginPath();c.ellipse(x,64,13,23,-Math.PI/5,0,2*Math.PI);c.fill();text(label,x-8,72,15,'#fffaf0',600);});
  text('知乎四时 · 人生长卷',60,78,23,'#7b8569',600);
  text(data.reportName,60,144,41,'#3e5847',600);
  text(`${data.ended}  /  ${data.title}`,60,188,24,'#967746',600);
  rect(60,216,780,96,'#e7ecdc',14);
  paragraph(lines(data.motto,724,25,2),86,254,25,'#536c50',37,600);
  const stats=[['储备金',`${finite(data.money).toLocaleString('zh-CN')} 元`],['情绪',`${data.mood} 点`],['专业',`${data.exp} 点`]];
  stats.forEach(([label,value],index)=>{const x=60+263*index;rect(x,338,248,100,'#fffbf1',12);text(label,x+20,371,18,'#8e8d78');text(value,x+20,411,27,'#4e634e',600);});
  rect(60,460,780,356,'#fffbf1',16);
  text('留下的三维足迹',84,502,23,'#5a7252',600);
  const center={x:261,y:659},radius=102,angles=[-Math.PI/2,Math.PI/6,5*Math.PI/6];
  for(const proportion of [0.25,0.5,0.75,1]){
    c.beginPath();angles.forEach((a,i)=>{const x=center.x+Math.cos(a)*radius*proportion,y=center.y+Math.sin(a)*radius*proportion;i?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.strokeStyle='#d9dfcd';c.lineWidth=1;c.stroke();
    text(`${proportion*100}%`,center.x+6,center.y-radius*proportion+5,12,'#9b9f8d');
  }
  angles.forEach(angle=>{c.beginPath();c.moveTo(center.x,center.y);c.lineTo(center.x+Math.cos(angle)*radius,center.y+Math.sin(angle)*radius);c.strokeStyle='#d9dfcd';c.stroke();});
  c.beginPath();data.radar.forEach((axis,index)=>{const ratio=Math.max(0,Math.min(1,axis.value/axis.maximum));const x=center.x+Math.cos(angles[index])*radius*ratio,y=center.y+Math.sin(angles[index])*radius*ratio;index?c.lineTo(x,y):c.moveTo(x,y);});c.closePath();c.fillStyle='#9db08c80';c.fill();c.strokeStyle='#718865';c.lineWidth=3;c.stroke();
  c.textAlign='center';text('储备金',261,537,18,'#6d7c5c');text('情绪',374,738,18,'#6d7c5c');text('专业',146,738,18,'#6d7c5c');c.textAlign='start';
  text('图中 100% 的参考值',467,551,20,'#65795b',600);
  data.radar.forEach((axis,index)=>text(`${axis.label}  ${axis.maximum.toLocaleString('zh-CN')} ${axis.unit}`,467,593+index*37,19,'#7b826c'));
  paragraph(lines('超出参考值按满格绘图，实际数值见上方。三轴仅为游戏记录，不是人生评分。',324,17,3),467,713,17,'#92937f',26);
  paragraph(lines(data.summary,760,20,2),60,853,20,'#76816b',30);
  text('十个选择坐标',60,904,26,'#486448',600);text('7 次微观选择 · 3 道黄金难题',471,903,19,'#929278');
  let y=timelineY;
  sections.forEach(point=>{
    rect(60,y,780,point.height,point.visited?'#fffbf1':'#eeeee2',12);
    rect(76,y+19,44,39,point.golden?'#e8d1a5':'#e7eada',8);text(String(point.number).padStart(2,'0'),85,y+46,20,point.golden?'#947340':'#718365',600);
    let cursor=paragraph(point.titleLines,135,y+47,24,point.visited?'#4e664e':'#939784',34,600)+12;
    cursor=paragraph(point.choiceLines,86,cursor,22,point.visited?'#5a6c54':'#969987',34);
    if(point.resultLines.length)cursor=paragraph(point.resultLines,86,cursor+14,20,'#858772',31);
    if(point.consequenceLines.length)cursor=paragraph(point.consequenceLines,86,cursor+12,18,'#997e50',28);
    if(point.visited)text(point.change,86,y+point.height-22,17,'#879374');
    y+=point.height+16;
  });
  text('经验有来处，人生无标准答案。',60,footerY+26,24,'#5d7357',600);
  paragraph(lines(data.description,548,20,3),60,footerY+67,20,'#868671',30);
  text(`本局涉及 ${data.sourceCount} 条来源 · 知乎讨论启发`,60,footerY+183,17,'#95947e');
  if(data.source){paragraph(lines(`来源示例：${data.source.author||'作者待核对'} · ${data.source.title}`,548,16,2),60,footerY+215,16,'#999782',25);}
  const qr=doc.createElement('canvas');await QRCode.toCanvas(qr,data.qrText,{width:160,margin:2,errorCorrectionLevel:'M',color:{dark:'#405544',light:'#fffdf4'}});c.drawImage(qr,674,footerY+52,160,160);
  c.textAlign='center';text(data.qrLabel,754,footerY+244,17,'#7c876f');c.textAlign='start';
  text('虚构游戏 · 仅记录本局实际经历 · 长结果已节选',60,footerY+301,16,'#a09a86');
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片生成失败，请重试。')),'image/png'));
  return {blob,data,canvas};
}
