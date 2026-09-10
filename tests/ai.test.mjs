import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { newGame, land, choose, advance, snapshot } from '../src/engine.js';
import { MODEL, createNarrator, validateNarrativeInput, narrativePrompt, extractFinalText } from '../server/ai.mjs';

const finalText = '刘看山轻轻点头：你把问题说清楚，也给自己留了喘息的空间。得到同伴的支持，需要一次具体的表达；为这次沟通付出的预算，也值得留在之后的安排里。';
const answer = text => JSON.stringify({ choices: [{ message: { reasoning_content: 'PRIVATE_REASONING_MUST_NOT_LEAK', content: text }, finish_reason: 'stop' }] });
const eventState = (die = 1, choice = 0) => choose(land(newGame('demo'), die), choice);
const eventInput = (die = 1, choice = 0) => ({ kind: 'event', game: snapshot(eventState(die, choice)) });
function complete() {
  let s = newGame('demo');
  for (const [die, choice] of [[1, 0], [3, 1], [3, 0], [5, 0]]) s = advance(choose(land(s, die), choice));
  return s;
}

test('only settled events and real endings can request narration', () => {
  for (const input of [null, { kind: 'other' }, { kind: 'event', game: snapshot(newGame()) },
    { kind: 'event', game: snapshot(land(newGame(), 1)) },
    { kind: 'event', game: snapshot(advance(eventState())) },
    { kind: 'summary', game: eventInput().game },
    { kind: 'event', game: { ...eventInput().game, moves: [{ die: 9, choice: 0 }] } }]) {
    assert.throws(() => validateNarrativeInput(input));
  }
  assert.equal(validateNarrativeInput(eventInput()).history.length, 1);
  assert.equal(validateNarrativeInput({ kind: 'summary', game: snapshot(complete()) }).ended, 'complete');
});

test('server replay, not client facts, controls prompt and fallback', async () => {
  let prompt;
  const ai = createNarrator({ execute: async p => { prompt = p; return answer(finalText); } });
  const input = eventInput();
  Object.assign(input.game, { money: 99999999, ended: 'complete', scene: 'INJECTED_FACT', history: [{ choiceLabel: 'INJECTED_CHOICE' }] });
  const result = await ai.narrate(input);
  assert.equal(result.mode, 'live');
  assert.equal(result.model, MODEL);
  assert.equal(result.text, finalText);
  assert.ok(!JSON.stringify(result).includes('PRIVATE_REASONING'));
  assert.ok(!prompt.includes('99999999') && !prompt.includes('INJECTED_'));
  assert.match(prompt, /从毕业那天出发/);
  assert.match(prompt, /带着行囊出发/);
  assert.match(prompt, /5000/);
  assert.match(prompt, /"exp":10/);
});

test('finished linear-route prompt retains final choice and separates route length from turns', () => {
  const s = complete();
  const prompt = narrativePrompt('event', s);
  assert.ok(prompt.includes(s.history.at(-1).choiceLabel));
  assert.ok(prompt.includes(s.history.at(-1).result));
  const summary = narrativePrompt('summary', s);
  assert.ok(summary.includes(s.history[0].choiceLabel));
  assert.ok(summary.includes(s.history.at(-1).choiceLabel));
  assert.ok(summary.includes('"turnsCompleted":4'));
  assert.ok(summary.includes('"routeLength":12'));
  assert.ok(summary.includes('"routePosition":11'));
  assert.ok(!summary.includes('"totalTurns"'));
});

test('AI replay accepts the complete 40-cell route and rejects obsolete v1, v2 and v3 records', () => {
  let state = newGame('full');
  for (const choice of [1, 0, 0, 0, 1, 0, 0]) state = advance(choose(land(state, 6), choice));
  const game = snapshot(state);
  assert.equal(game.version, 4);
  const replayed = validateNarrativeInput({ kind: 'summary', game });
  assert.equal(replayed.total, 40);
  assert.equal(replayed.position, 39);
  assert.equal(replayed.turn, 7);
  assert.deepEqual(replayed.history.map(h => h.tile), [5, 11, 17, 23, 29, 35, 39]);
  const prompt = narrativePrompt('summary', replayed);
  assert.match(prompt, /"routeLength":40/);
  assert.match(prompt, /"turnsCompleted":7/);
  assert.throws(() => validateNarrativeInput({ kind: 'summary', game: { ...game, version: 1 } }));
  assert.throws(() => validateNarrativeInput({ kind: 'summary', game: { ...game, version: 2 } }));
  assert.throws(() => validateNarrativeInput({ kind: 'summary', game: { ...game, version: 3 } }));
});

test('a v4 third choice is replayed into the narrative and cannot be substituted by a legacy move',()=>{
  const state=eventState(1,2),game=snapshot(state);
  const replayed=validateNarrativeInput({kind:'event',game});
  assert.equal(replayed.history[0].choice,2);
  assert.match(narrativePrompt('event',replayed),/和室友拍完毕业照再告别/);
  assert.throws(()=>validateNarrativeInput({kind:'event',game:{...game,version:3}}));
});

test('cache reuses equivalent snapshots, expires, and separates summary from event', async () => {
  let calls = 0, time = 100000;
  const ai = createNarrator({ execute: async () => { calls++; return answer(finalText); }, now: () => time, cacheTtlMs: 1000 });
  const game = snapshot(complete());
  assert.equal((await ai.narrate({ kind: 'event', game })).mode, 'live');
  assert.equal((await ai.narrate({ kind: 'event', game: { ...game, phase: 'feedback' } })).mode, 'cache');
  assert.equal((await ai.narrate({ kind: 'summary', game })).mode, 'live');
  assert.equal(calls, 2);
  time += 1001;
  assert.equal((await ai.narrate({ kind: 'summary', game })).mode, 'live');
  assert.equal(calls, 3);
});

test('same in-flight request shares one call; other simultaneous events fallback', async () => {
  let finish, calls = 0;
  const ai = createNarrator({ execute: () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const first = ai.narrate(eventInput());
  const duplicate = ai.narrate(eventInput());
  const busy = await ai.narrate(eventInput(2));
  assert.equal(busy.mode, 'fallback');
  assert.equal(calls, 1);
  finish(answer(finalText));
  assert.equal((await first).mode, 'live');
  assert.equal((await duplicate).mode, 'cache');
});

test('last event followed immediately by summary waits and generates once for duplicate summaries', async () => {
  const jobs = [];
  let active = 0, maxActive = 0;
  const ai = createNarrator({ execute: async prompt => {
    active += 1; maxActive = Math.max(maxActive, active);
    try { return await new Promise(resolve => jobs.push({ prompt, resolve })); }
    finally { active -= 1; }
  } });
  const game = snapshot(complete());
  const event = ai.narrate({ kind: 'event', game: { ...game, phase: 'feedback' } });
  const summary = ai.narrate({ kind: 'summary', game });
  const duplicate = ai.narrate({ kind: 'summary', game: { ...game, phase: 'feedback' } });
  await delay(0);
  assert.equal(jobs.length, 1);
  jobs[0].resolve(answer(finalText));
  assert.equal((await event).mode, 'live');
  await delay(0);
  assert.equal(jobs.length, 2);
  assert.match(jobs[1].prompt, /结合至少两个具体选择/);
  jobs[1].resolve(answer(finalText));
  assert.equal((await summary).mode, 'live');
  assert.equal((await duplicate).mode, 'cache');
  assert.equal(maxActive, 1);
});

test('summary waiting queue has one slot; other summaries and events fallback without calls', async () => {
  const jobs = [];
  const ai = createNarrator({ execute: () => new Promise(resolve => jobs.push(resolve)) });
  const game = snapshot(complete());
  const event = ai.narrate(eventInput());
  const summary = ai.narrate({ kind: 'summary', game });
  const different = { ...game, talent: 'optimistic' };
  const overflow = await ai.narrate({ kind: 'summary', game: different });
  assert.equal(overflow.mode, 'fallback');
  assert.match(overflow.reason, /排队/);
  assert.equal((await ai.narrate(eventInput(2))).mode, 'fallback');
  assert.equal(jobs.length, 1);
  jobs[0](answer(finalText));
  await event;
  await delay(0);
  jobs[1](answer(finalText));
  assert.equal((await summary).mode, 'live');
});

test('queued summary wait expires without aborting the active event or consuming another call', async () => {
  let finish, eventSignal, calls = 0;
  const ai = createNarrator({ timeoutMs: 200, summaryTimeoutMs: 15, execute: (_, { signal }) => {
    calls += 1; eventSignal = signal;
    return new Promise(resolve => { finish = resolve; });
  } });
  const event = ai.narrate(eventInput());
  const result = await ai.narrate({ kind: 'summary', game: snapshot(complete()) });
  assert.equal(result.mode, 'fallback');
  assert.match(result.reason, /等待超时/);
  assert.equal(calls, 1);
  assert.equal(eventSignal.aborted, false);
  finish(answer(finalText));
  assert.equal((await event).mode, 'live');
});

test('queued summary execution shares the total wait budget and aborts when it is exhausted', async () => {
  let calls = 0, summarySignal;
  const ai = createNarrator({ timeoutMs: 500, summaryTimeoutMs: 60, execute: async (_, { signal }) => {
    calls += 1;
    if (calls === 1) { await delay(20); return answer(finalText); }
    summarySignal = signal;
    return new Promise(() => {});
  } });
  const event = ai.narrate(eventInput());
  const started = performance.now();
  const summary = ai.narrate({ kind: 'summary', game: snapshot(complete()) });
  await event;
  assert.equal((await summary).mode, 'fallback');
  assert.equal(calls, 2);
  assert.equal(summarySignal.aborted, true);
  assert.ok(performance.now() - started < 200, 'must not use a fresh 500 ms model timeout after waiting');
});

test('failure suppresses raw errors and protects quota with cooldown', async () => {
  let calls = 0;
  const ai = createNarrator({ execute: async () => { calls++; throw new Error('SECRET_TOKEN_SHOULD_NOT_LEAK'); } });
  const failed = await ai.narrate(eventInput());
  assert.equal(failed.mode, 'fallback');
  assert.match(failed.text, /答辩结束了/);
  assert.ok(!JSON.stringify(failed).includes('SECRET_TOKEN'));
  await ai.narrate(eventInput(2));
  assert.equal(calls, 1);
});

test('timeout aborts subprocess and resolves with game records', async () => {
  let signal;
  const ai = createNarrator({ execute: async (_, options) => { signal = options.signal; return new Promise(() => {}); }, timeoutMs: 10 });
  const result = await ai.narrate(eventInput());
  assert.equal(result.mode, 'fallback');
  assert.equal(signal.aborted, true);
});

test('bounded daily calls still permit cached responses', async () => {
  let calls = 0;
  const ai = createNarrator({ dailyLimit: 1, execute: async () => { calls++; return answer(finalText); } });
  await ai.narrate(eventInput());
  assert.equal((await ai.narrate(eventInput())).mode, 'cache');
  assert.equal((await ai.narrate(eventInput(2))).mode, 'fallback');
  assert.equal(calls, 1);
});

test('missing final text, analysis blocks, links, malformed and truncated outputs fallback', () => {
  for (const raw of [
    '{"choices":[{"message":{"reasoning_content":"DO_NOT_USE_THIS"}}]}',
    answer('<think>internal reasoning</think>final answer'),
    answer('请访问 https://invented.example 阅读我找到的新资料。'),
    '{not-json}',
    JSON.stringify({ choices: [{ message: { content: finalText }, finish_reason: 'length' }] }),
  ]) assert.throws(() => extractFinalText(raw, 'event'));
  assert.ok(extractFinalText(answer(finalText.repeat(4)), 'event').length <= 150);
  assert.ok(extractFinalText(answer(finalText.repeat(6)), 'summary').length <= 250);
});

test('summary fallback faithfully describes both completion and early termination', async () => {
  const ai = createNarrator({ execute: async () => { throw new Error('offline'); } });
  const completed = await ai.narrate({ kind: 'summary', game: snapshot(complete()) });
  assert.equal(completed.mode, 'fallback');
  assert.match(completed.text, /在“从毕业那天出发”中/);
  let s = newGame('full', {talent:'ambitious'});
  // Walk past the recovery places while selecting costly emotional options.
  for (const [die,choice] of [[4,0],[2,0],[1,0],[3,0],[1,0],[2,0]]) s=advance(choose(land(s,die),choice));
  assert.equal(s.ended, 'mood');
  const stopped = await ai.narrate({ kind: 'summary', game: snapshot(s) });
  assert.match(stopped.text, /情绪归零/);
  assert.doesNotMatch(stopped.text, /顺利通关/);
});
