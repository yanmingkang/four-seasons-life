// Presentation-only progress: keep this outside the engine snapshot and history.
// It records an invitation, not an AI request, completed practice or reward.
const KINDS=new Set(['natural','fallback','ending']);
const NATURAL_EVENTS=new Set(['cell-11','cell-13']);
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);

export function createInvitationProgress(){
  return {version:1,seen:false,resolved:false,kind:null};
}

function readProgress(raw){
  if(!raw || typeof raw!=='object' || Array.isArray(raw))return null;
  const prototype=Object.getPrototypeOf(raw);
  if(prototype!==Object.prototype && prototype!==null)return null;
  if(!['version','seen','resolved','kind'].every(key=>own(raw,key)))return null;
  if(raw.version!==1 || typeof raw.seen!=='boolean' || typeof raw.resolved!=='boolean')return null;
  if(raw.seen ? !KINDS.has(raw.kind) : raw.resolved || raw.kind!==null)return null;
  // Do not copy chat, names, arbitrary fields or properties such as __proto__.
  return {version:1,seen:raw.seen,resolved:raw.resolved,kind:raw.kind};
}

function settledHistory(state){
  if(!Array.isArray(state?.history))return [];
  return state.history.filter(record=>record && /^cell-(?:0[1-9]|[1-3]\d|40)$/.test(record.eventId) && Number.isInteger(record.turn) && record.turn>0 && Number.isInteger(record.choice) && record.choice>=0 && record.choice<=2);
}

export function restoreInvitationProgress(raw,state){
  const valid=readProgress(raw);
  if(valid)return valid;
  // Old saves have no invitation metadata. An actual settled natural event can
  // prove that its entry was available, not that the player completed practice.
  if(settledHistory(state).some(record=>NATURAL_EVENTS.has(record.eventId))){
    return {version:1,seen:true,resolved:false,kind:'natural'};
  }
  return createInvitationProgress();
}

export function getInvitationPlacement(state,meta){
  if(!state || typeof state!=='object')return null;
  const progress=restoreInvitationProgress(meta,state),history=settledHistory(state);
  // An exhausted or completed run gets its optional ending entry, never an
  // extra interruption because its final settlement happened to be the third.
  if(state.ended && !progress.seen)return 'ending';
  if(state.phase!=='feedback')return null;
  if(NATURAL_EVENTS.has(history.at(-1)?.eventId))return 'natural';
  // Preserve a previously available focus scene even on its final feedback;
  // this is the original event entry, not a second independent invitation.
  if(state.ended)return null;
  if(progress.seen && !progress.resolved && progress.kind==='fallback')return 'fallback';
  if(!progress.seen && history.length>=3)return 'fallback';
  return null;
}

export function markInvitationSeen(meta,kind){
  const progress=readProgress(meta)||createInvitationProgress();
  if(progress.seen || !KINDS.has(kind))return progress;
  return {version:1,seen:true,resolved:false,kind};
}

export function resolveInvitation(meta){
  const progress=readProgress(meta)||createInvitationProgress();
  // Resolving a nonexistent invitation must not manufacture a visit or kind.
  return progress.seen?{...progress,resolved:true}:progress;
}
