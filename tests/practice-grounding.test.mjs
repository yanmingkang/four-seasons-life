import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPracticeOutput,practicePrompt} from '../server/practice.mjs';
import {createSampleState} from '../src/sample-scenario.js';
const output=npc=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({npc})}}]});
test('practice cannot claim to have read a document or discovered unprovided record facts',()=>{
  for(const text of ['这两条在记录里都有，起点定了，时间线才好对。','记录显示这件事是你们的问题。','我看过会议纪要，里面写了结论。','从你的记录可以看出，这是上次修改的问题。'])assert.throws(()=>extractPracticeOutput(output(text),1));
  assert.equal(extractPracticeOutput(output('我们先核对哪一个交付节点？还没有确认的部分，请相关同事补充。'),1).npc,'我们先核对哪一个交付节点？还没有确认的部分，请相关同事补充。');
  assert.match(practicePrompt(createSampleState(0),[],'请核对交付时间。'),/没有读取任何真实项目文件/);
});
