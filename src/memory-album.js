import {EVENTS,SEASONS} from './events.js';
import {getLifeReport,summarize} from './engine.js';
import {getEventGrounding} from './event-grounding.js';
import {SOURCES} from './sources.js';
import {publicShareUrl} from './share-card.js';
import {MEMORY_ART,methodMemoryArt} from './memory-art.js';

const short=(value,max=68)=>{const text=String(value||'');return text.length>max?`${text.slice(0,max-1)}…`:text;};
const eventOf=record=>EVENTS.find(event=>event.id===record?.eventId);
export const memoryImage=record=>eventOf(record)?`/art/memories/${eventOf(record).id}.webp`:null;
// This whitelist deliberately excludes names, journals, free-text practice and
// unvisited events. Historical choices remain authoritative, not recalculated.
function momentOf(record){
  const event=eventOf(record);if(!event||!Number.isInteger(record.choice)||!record.choiceLabel)return null;
  return {eventId:event.id,number:event.number,season:event.season,location:event.location,
    title:String(record.title||event.title),choice:String(record.choiceLabel),result:short(record.result),
    image:memoryImage(record),turn:record.turn};
}
const priorities=[13,20,30,10,6,11,15,18,22,27,31];
function selectDilemma(history){
  for(const number of priorities){const h=history.find(record=>eventOf(record)?.number===number);if(h)return h;}
  return history.at(-1)||null;
}
function methodFor(records){
  for(const record of records.filter(Boolean)){
    const grounding=getEventGrounding(record);
    const consideration=grounding?.considerations.find(item=>(record.sources||[]).includes(item.sourceId)&&SOURCES[item.sourceId]);
    if(!consideration)continue;
    const source=SOURCES[consideration.sourceId];
    if(!/^https:\/\/(?:www\.|zhuanlan\.)?zhihu\.com\//.test(source.url))continue;
    return {moment:momentOf(record),when:consideration.when,text:consideration.idea,
      source:{id:consideration.sourceId,title:source.title,author:source.author,url:source.url,
        evidence:source.evidence||'仅核对相关片段，未读取完整原文',scope:source.scope||'',checkedAt:source.checkedAt||''},
      boundary:grounding.boundary,attribution:'相关讨论整理，非答主原话'};
  }
  return null;
}
// Names and choices on the title receipt come only from settled stops in this
// run. Transaction evidence keeps its verified reason, never a made-up place.
function titleRecord(record={},history=[]){
  const evidence=[],moments=[];
  for(const proof of Array.isArray(record.evidence)?record.evidence:[]){
    if(!proof||typeof proof!=='object')continue;
    if(['event','automatic-oden'].includes(proof.kind)){
      const actual=history.find(entry=>entry.eventId===proof.eventId&&entry.turn===proof.turn&&entry.choice===proof.choice);
      const event=eventOf(actual);
      if(!actual||!event?.options[actual.choice])continue;
      evidence.push({kind:proof.kind,eventId:event.id,turn:actual.turn,choice:actual.choice});
      if(!moments.some(moment=>moment.eventId===event.id&&moment.turn===actual.turn))moments.push({...momentOf(actual),title:event.title});
    }else if(proof.kind==='transaction'&&typeof proof.action==='string'&&Number.isInteger(proof.turn)&&Number.isInteger(proof.order)){
      evidence.push({kind:'transaction',action:proof.action,choice:typeof proof.choice==='string'||Number.isInteger(proof.choice)?proof.choice:'',turn:proof.turn,order:proof.order});
    }
  }
  return {id:String(record.id||''),name:String(record.name||''),reason:String(record.reason||''),evidence,moments};
}
export function getMemoryAlbum(state={}){
  const history=(Array.isArray(state.history)?state.history:[]).filter(record=>momentOf(record));
  const dilemmaRecord=selectDilemma(history),dilemma=momentOf(dilemmaRecord);
  const seasons=SEASONS.map((season,index)=>{
    const records=history.filter(record=>eventOf(record).season===index);
    const focus=records.find(record=>record.style==='connect')||records.find(record=>eventOf(record).golden)||records.at(-1);
    return {index,name:season.name,en:season.en,stage:season.title,color:season.color,tint:season.tint,
      count:records.length,moment:momentOf(focus)};
  });
  const fallbackHero=momentOf(history.find(record=>record.style==='connect')||dilemmaRecord);
  const method=methodFor([dilemmaRecord,...history.slice().reverse()]);
  const complete=state.ended==='complete',last=history.at(-1);
  const endSeason=last?SEASONS[eventOf(last).season].name:SEASONS[state.season??0]?.name||'春';
  const lifeReport=history.length?(getLifeReport(state)||summarize(state)):null;
  const journeyTitle=titleRecord(lifeReport?.journeyTitle||{id:lifeReport?.titleId,name:lifeReport?.title,reason:lifeReport?.titleReason,evidence:lifeReport?.titleEvidence},history);
  const title=history.length?(journeyTitle.name||lifeReport?.title):'尚未写下的故事';
  const titleReason=journeyTitle.reason;
  const commemorations=(Array.isArray(lifeReport?.commemorations)?lifeReport.commemorations:[])
    .filter(record=>record&&record.unlocked!==false).map(record=>titleRecord(record,history)).filter(record=>record.name&&record.reason&&record.evidence.length);
  // Mixed keeps four proofs for its two-plus-two threshold, while its sentence
  // names each category's latest action. The newest proof always matches it.
  const coverCandidates=journeyTitle.id==='mixed'?journeyTitle.moments.slice(-1):journeyTitle.moments;
  const coverMoment=coverCandidates.find(moment=>moment.eventId!==dilemma?.eventId)||coverCandidates[0]||null;
  const hero=coverMoment||fallbackHero;
  const pages=[{kind:'cover',label:'序',moment:coverMoment,artwork:MEMORY_ART.cover},
    ...seasons.filter(season=>season.moment).map(season=>({kind:'season',label:season.name,season,moment:season.moment})),
    ...(dilemma?[{kind:'choice',label:'取舍',moment:dilemma}]:[]),
    ...(history.length?[{kind:'method',label:'带走',moment:method?.moment||dilemma,artwork:methodMemoryArt(method,dilemma)}]:[]),
    {kind:'share',label:'留念',moment:hero}];
  return {title,titleId:journeyTitle.id,titleReason,titleEvidence:journeyTitle.evidence,journeyTitle,commemorations,coverMoment,complete,endSeason,count:history.length,mode:state.mode==='demo'?'快速体验':'完整旅程',
    subtitle:complete?'走到终点，也把走过的路留住。':`故事停在${endSeason}季。已写下的这一程，仍然完整。`,
    hero,seasons,dilemma,method,pages};
}
export function memoryShareData(state,url=''){
  const album=getMemoryAlbum(state);if(!album.count)throw Error('先走过一段故事，再留下回忆。');
  const publicUrl=publicShareUrl(url),event=eventOf(album.dilemma),options=event?.options.map(o=>o.label)||[];
  return {...album,publicUrl,qrLabel:publicUrl?'扫码进入游戏':'扫码读这道题',
    qrText:publicUrl||`知乎四时 · 换成你，会怎么选？\n${album.dilemma.title}\n${options.map((v,i)=>`${i+1}. ${v}`).join('\n')}\n虚构情景，由知乎讨论启发。`};
}
