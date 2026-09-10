import test from 'node:test';
import assert from 'node:assert/strict';
import {newGame,land,snapshot} from '../src/engine.js';
import {JOURNEY_STORAGE_KEY,loadSavedJourney} from '../src/journey-storage.js';

function memoryStorage(entries={}){
  const values=new Map(Object.entries(entries));
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
}
const legacyKey='four-seasons-life-v3';
const record=JSON.stringify({game:snapshot(land(newGame('full'),2)),seconds:37});

test('current storage key matches v4 game rules',()=>assert.equal(JOURNEY_STORAGE_KEY,'four-seasons-life-v4'));
test('v4 record under legacy key is copied once without changing legacy bytes',()=>{
  const storage=memoryStorage({[legacyKey]:record});
  assert.deepEqual(loadSavedJourney(storage),JSON.parse(record));
  assert.equal(storage.getItem(JOURNEY_STORAGE_KEY),record);
  assert.equal(storage.getItem(legacyKey),record);
  const newer=JSON.stringify({game:snapshot(newGame('demo')),seconds:0});
  storage.setItem(JOURNEY_STORAGE_KEY,newer);
  assert.deepEqual(loadSavedJourney(storage),JSON.parse(newer));
  assert.equal(storage.getItem(legacyKey),record);
});
test('v1/v2/v3 records are not replayed as v4 and all old slots stay intact',()=>{
  for(const version of [1,2,3]){
    const old=JSON.stringify({game:{...JSON.parse(record).game,version},seconds:37});
    const storage=memoryStorage({[legacyKey]:old,[`four-seasons-life-v${version}`]:old});
    assert.equal(loadSavedJourney(storage),null);
    assert.equal(storage.getItem(JOURNEY_STORAGE_KEY),null);
    assert.equal(storage.getItem(legacyKey),old);
    assert.equal(storage.getItem(`four-seasons-life-v${version}`),old);
  }
});
test('corrupt existing v4 slot is not overwritten by automatic migration',()=>{
  const storage=memoryStorage({[JOURNEY_STORAGE_KEY]:'broken json',[legacyKey]:record});
  assert.equal(loadSavedJourney(storage),null);
  assert.equal(storage.getItem(JOURNEY_STORAGE_KEY),'broken json');
  assert.equal(storage.getItem(legacyKey),record);
});
test('failed localStorage reads are safe and blocked migration still allows in-memory resume',()=>{
  assert.equal(loadSavedJourney({getItem(){throw Error('blocked');}}),null);
  const storage=memoryStorage({[legacyKey]:record});storage.setItem=()=>{throw Error('quota');};
  assert.deepEqual(loadSavedJourney(storage),JSON.parse(record));
  assert.equal(storage.getItem(legacyKey),record);
});
