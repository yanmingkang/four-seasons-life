// Deliberately invalid summary request: validation must reject BEFORE any
// narrator/model execution. This proves the local backend can replay the new
// rules without spending API quota or changing a browser's saved journey.
import assert from 'node:assert/strict';
import {newGame,land,choose,snapshot} from '../src/engine.js';
import {validateNarrativeInput} from '../server/ai-core.mjs';

const base='http://127.0.0.1:4173';
const expected=process.argv.includes('--expect-legacy')?'请先完成一次有效的事件选择':'本局结束后才能生成总结';
const game=choose(land(newGame('full',{enriched:true,name:'本地规则检查',talent:'defense'}),4),0);
assert.equal(game.life.schema,4);assert.equal(game.mood,80);assert.equal(game.ended,null);
const input={kind:'summary',game:snapshot(game)};
assert.throws(()=>validateNarrativeInput(input),/本局结束后才能生成总结/);
const health=await fetch(`${base}/api/health`,{signal:AbortSignal.timeout(5000)});
assert.deepEqual(await health.json(),{ok:true,game:'four-seasons-life'});
const result=await fetch(`${base}/api/narrate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(5000)});
assert.equal(result.status,400,'Unfinished summary must never reach narration');
const body=await result.json();assert.equal(body.error,expected);
console.log(JSON.stringify({localUrl:base,backendReplaysSchema4:body.error==='本局结束后才能生成总结',validationError:body.error,modelCalls:0,userStorageChanged:false}));
