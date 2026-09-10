import {SAVE_VERSION,restore} from './engine.js';

export const JOURNEY_STORAGE_KEY=`four-seasons-life-v${SAVE_VERSION}`;
const LEGACY_STORAGE_KEY='four-seasons-life-v3';

function validRecord(raw){
  try{const record=JSON.parse(raw);return record&&restore(record.game)?record:null;}catch{return null;}
}

// An early v4 build saved under the v3 key. Copy only a replay-valid v4 record;
// keep all legacy bytes untouched and never displace an existing v4 slot.
export function loadSavedJourney(storage){
  let current;
  try{current=storage.getItem(JOURNEY_STORAGE_KEY);}catch{return null;}
  if(current!==null)return validRecord(current);
  let previous;
  try{previous=storage.getItem(LEGACY_STORAGE_KEY);}catch{return null;}
  const record=validRecord(previous);
  if(!record)return null;
  try{storage.setItem(JOURNEY_STORAGE_KEY,previous);}catch{}
  return record;
}
