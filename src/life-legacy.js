import {restore,snapshot,getLifeReport,verifyLifeLegacy} from './engine.js';

export const LEGACY_KEY='four-seasons-life-legacy-v1';
const LIMIT=8192;
const MAX_CLAIMS=40;
const empty=()=>({proof:null,upgrade:null,available:false,completed:false,failed:false,expBonus:0,moodMaxBonus:0,claimedIds:[],title:''});
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;

// A local deduplication key, not an identity, signature, or anti-cheat service.
export function journeyFingerprint(saved) {
  const input=JSON.stringify(saved),hashes=[2166136261,2246822519,3266489917,668265263];
  for(let i=0;i<input.length;i++)for(let j=0;j<hashes.length;j++)hashes[j]=Math.imul(hashes[j]^input.charCodeAt(i),16777619+j*2)>>>0;
  return hashes.map(value=>value.toString(16).padStart(8,'0')).join('');
}

function validClaims(ids){return Array.isArray(ids) && ids.length<=MAX_CLAIMS && ids.every(id=>typeof id==='string' && /^[0-9a-f]{32}$/.test(id)) && new Set(ids).size===ids.length;}

export function loadLegacy(storage) {
  try {
    storage=storage??globalThis.localStorage;
    const raw=storage?.getItem(LEGACY_KEY);if(typeof raw!=='string' || new TextEncoder().encode(raw).length>LIMIT)return empty();
    const saved=JSON.parse(raw);
    if(![1,2].includes(saved?.schema) || !validClaims(saved.claimedIds) || (saved.schema===1 && saved.upgrade))return empty();
    const checked=verifyLifeLegacy(saved);
    if(!checked || (saved.schema===1 && !checked.completed))return empty();
    return {...checked,available:true,claimedIds:[...saved.claimedIds],title:checked.failed?'受挫抗体':getLifeReport(restore(checked.proof)).title};
  } catch{return empty();}
}

export function claimLegacy(state,storage) {
  try {
    storage=storage??globalThis.localStorage;
    if(!state?.life || state.phase!=='finished' || !['complete','mood'].includes(state.ended))return {claimed:false,reason:'完成本局结算后，才能保存遗产。',legacy:loadLegacy(storage)};
    const saved=snapshot(state),checked=restore(saved);
    if(!checked?.life || checked.phase!=='finished' || checked.ended!==state.ended || !['complete','mood'].includes(checked.ended))return {claimed:false,reason:'旅程记录未通过重放校验。',legacy:loadLegacy(storage)};
    const legacy=loadLegacy(storage),id=journeyFingerprint(saved);
    if(legacy.claimedIds.includes(id))return {claimed:false,alreadyClaimed:true,reason:'这段旅程的遗产已经保存。',legacy};
    if(legacy.claimedIds.length>=MAX_CLAIMS)return {claimed:false,reason:'本地结局记录已达上限，已有固定遗产仍可使用。',legacy};
    const inherited=checked.life.legacyProof?verifyLifeLegacy({proof:checked.life.legacyProof,...(checked.life.legacyUpgrade?{upgrade:checked.life.legacyUpgrade}:{})}):null;
    let proof=legacy.proof||inherited?.proof||saved,upgrade=legacy.upgrade||inherited?.upgrade||null;
    let verified=verifyLifeLegacy({proof,upgrade});
    const missing=checked.ended==='complete'?!verified?.completed:!verified?.failed;
    if(missing){
      // Independent journeys need no dependency; inherited journeys name exactly
      // the verified original proof and never embed a proof inside another proof.
      const sameBase=inherited && journeyFingerprint(inherited.proof)===journeyFingerprint(proof);
      if(!inherited || sameBase){
        const nextProof=structuredClone(saved);delete nextProof.extension.legacy;
        upgrade={proof:nextProof,fromBase:!!inherited};
      }else if(inherited.completed && inherited.failed){proof=inherited.proof;upgrade=inherited.upgrade;}
      else if(restore(inherited.proof)?.ended===checked.ended){upgrade={proof:inherited.proof,fromBase:false};}
      else return {claimed:false,reason:'已有遗产已保留；这份跨记录继承无法在容量内合并。',legacy};
      verified=verifyLifeLegacy({proof,upgrade});
    }
    if(!verified)return {claimed:false,reason:'遗产记录未通过重放校验，已有遗产仍保留。',legacy};
    const record={schema:2,proof:verified.proof,...(verified.upgrade?{upgrade:verified.upgrade}:{}),claimedIds:[...legacy.claimedIds,id]};
    if(bytes(record)>LIMIT)return {claimed:false,reason:'本地遗产记录超出容量上限，已有遗产仍保留。',legacy};
    storage.setItem(LEGACY_KEY,JSON.stringify(record));
    const reason=verified.failed?(verified.completed?'已保留两段旅程：下次开局专业 +5，受挫抗体让情绪上限 +10；固定保留，不重复叠加。':'已留下受挫抗体：下次开局情绪与上限 +10；固定保留，不重复叠加。'):'已留下这段旅程：下次开局专业和情绪上限各增加 5，固定保留、不叠加。';
    return {claimed:true,reason,legacy:loadLegacy(storage)};
  } catch{return {claimed:false,reason:'浏览器暂时无法保存遗产；本局结局仍然有效。',legacy:empty()};}
}
