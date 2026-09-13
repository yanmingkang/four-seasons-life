import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, land, choose, advance, snapshot } from '../src/engine.js';
import { SOURCES } from '../src/sources.js';
import { INVITATION_PRACTICE_ID } from '../src/invitation-practice.js';
import { MODEL } from '../server/ai-core.mjs';
import { createCloudGameService } from '../server/cloud-service.mjs';

const MINUTE = 60_000, DAY = 24 * 60 * MINUTE;
const VISITOR = 'test-visitor-aaaaaaaaaaaaaaaa', IP = 'a'.repeat(64);
const firstFields = { npc: '我们先把卡点说具体，你希望从哪一个交付节点开始核对？' };
const finalFields = { npc: '这项安排可以带回团队确认，还没谈定的部分先不作承诺。', tip: '下次在邀约里写明希望先核对的一个节点。' };
const completion = content => JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content,
  reasoning_content: 'PRIVATE_REASONING_NEVER_RETURN' } }] });
const modelReply = prompt => completion(prompt.includes('"userTurn":')
  ? JSON.stringify(prompt.includes('"userTurn":2') ? finalFields : firstFields)
  : '你给这次沟通留出了一点空间，可以带着已经做出的选择继续前行。');

// Each transaction stages structured-cloned writes and commits atomically.
// Tests use no filesystem, network, credentials or live Cloudflare bindings.
class MemoryStorage {
  constructor(initial = new Map()) { this.data = structuredClone(initial); this.tail = Promise.resolve(); this.fail = false; }
  async get(key) { if (this.fail) throw new Error('PRIVATE_STORAGE_ERROR'); return structuredClone(this.data.get(key)); }
  async put(key, value) { this.data.set(key, structuredClone(value)); }
  async delete(key) { return this.data.delete(key); }
  transaction(callback) {
    const work = this.tail.then(async () => {
      if (this.fail) throw new Error('PRIVATE_STORAGE_ERROR');
      const copy = structuredClone(this.data);
      const tx = { get: async key => structuredClone(copy.get(key)),
        put: async (key, value) => { copy.set(key, structuredClone(value)); },
        delete: async key => copy.delete(key) };
      const result = await callback(tx);
      this.data = copy;
      return structuredClone(result);
    });
    this.tail = work.catch(() => {});
    return work;
  }
}

function setup(options = {}) {
  const storage = options.storage || new MemoryStorage();
  const clock = options.clock || { value: Date.UTC(2026, 8, 13, 0, 0, 1) };
  const calls = [], searches = [];
  const execute = options.execute || (async (prompt, args) => { calls.push({ prompt, signal: args.signal }); return modelReply(prompt); });
  const search = options.search || (async (query, args) => {
    searches.push({ query, count: args.count, signal: args.signal });
    return JSON.stringify({ Code: 0, Data: { Items: [{ Title: '真实返回的讨论标题', AuthorName: '测试作者',
      Url: 'https://www.zhihu.com/question/123/answer/456', ContentText: '可供核对的搜索摘要。' }] } });
  });
  const config = { storage, now: () => clock.value, execute, search };
  return { storage, clock, calls, searches, config, service: createCloudGameService(config),
    rebuild: () => createCloudGameService(config) };
}

function request(path, input, { visitor = VISITOR, ip = IP, headers = {}, method = input === undefined ? 'GET' : 'POST', raw } = {}) {
  return new Request(`https://internal.invalid${path}`, { method,
    headers: { 'X-Game-Visitor': visitor, 'X-Game-Ip': ip, ...(input === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    ...(input === undefined ? {} : { body: raw ?? JSON.stringify(input) }) });
}
async function call(service, path, input, options) {
  const response = await service.handle(request(path, input, options));
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.match(response.headers.get('Content-Type'), /application\/json/);
  return { status: response.status, body: await response.json() };
}
function eventInput(name = '验收旅人') {
  return { kind: 'event', game: snapshot(choose(land(newGame('full', { name, enriched: true, lifeSchema: 4 }), 6), 2)) };
}

test('operational failure status only exposes fixed codes and bounded HTTP status, never provider data', async () => {
  const error=new Error('PRIVATE_ERROR_SECRET_AND_PLAYER_MESSAGE');
  Object.assign(error,{code:'http_error',status:403,cause:'PRIVATE_PROVIDER_BODY'});
  const env=setup({execute:async()=>{throw error;}});
  await call(env.service,'/api/narrate',eventInput());
  const status=await call(env.service,'/api/ai/status');
  assert.deepEqual(status.body.lastFailure,{kind:'model',code:'http_error',status:403});
  assert.doesNotMatch(JSON.stringify(status.body),/PRIVATE_/);
  const unknown=setup({execute:async()=>{throw Object.assign(new Error('PRIVATE_BODY'),{code:'PRIVATE_SECRET',status:700});}});
  await call(unknown.service,'/api/narrate',eventInput());
  assert.deepEqual((await call(unknown.service,'/api/ai/status')).body.lastFailure,{kind:'model',code:'processing_error'});
});
function summaryInput() {
  let state = newGame('full', { name: '总结验收', talent: 'defense', enriched: true, lifeSchema: 4 });
  for (const [die, choice] of [[6,2],[6,0],[1,0],[6,0],[6,2],[6,1],[6,1],[6,0]]) state = advance(choose(land(state, die), choice));
  assert.equal(state.ended, 'complete');
  return { kind: 'summary', game: snapshot(state) };
}
function practiceInput(overrides = {}) {
  const game = snapshot(choose(land(newGame('demo', { name: '沟通验收', enriched: true, lifeSchema: 4 }), 5), 0));
  return { game, clientId: 'test-practice-client-aaaaaaaaaaaa', turn: 1, message: '能否先共同核对一个交接节点？', ...overrides };
}

test('cloud service requires transactional persistence and internal verified visitor identities', async () => {
  assert.throws(() => createCloudGameService(), /storage/i);
  const t = setup();
  for (const options of [{ visitor: '' }, { visitor: 'short' }, { ip: '' }, { ip: 'raw-ip-address' }]) {
    assert.equal((await call(t.service, '/api/ai/status', undefined, options)).status, 401);
  }
  assert.equal((await call(t.service, '/api/unknown')).status, 404);
  assert.equal((await call(t.service, '/api/ai/status', {})).status, 405);
  const result = await call(t.service, '/api/ai/status');
  assert.equal(result.status, 200);
  assert.equal(result.body.configured, true);
  assert.equal(result.body.transport, 'official-http');
  assert.equal(t.calls.length, 0);
});

test('unconfigured cloud service stays offline and returns explicit playable fallbacks', async () => {
  const storage = new MemoryStorage(), service = createCloudGameService({ storage });
  const status = await call(service, '/api/ai/status');
  assert.equal(status.body.configured, false);
  assert.equal(status.body.available, false);
  assert.equal((await call(service, '/api/narrate', eventInput())).body.mode, 'fallback');
  const first = await call(service, '/api/practice', practiceInput());
  assert.equal(first.body.mode, 'fallback');
  assert.equal((await call(service, '/api/practice', practiceInput({ turn: 2, sessionId: first.body.sessionId }))).body.done, true);
  assert.equal((await call(service, '/api/experience?source=records')).body.mode, 'curated');
  assert.equal([...storage.data.keys()].some(key => key.includes('budget:model:')), false);
});

test('JSON methods, actual UTF-8 byte limits, malformed bodies and invalid engine replays stop before provider', async () => {
  const t = setup();
  for (const [expected, options] of [
    [415, { headers: { 'Content-Type': 'text/plain' } }],
    [413, { headers: { 'Content-Length': '8193' } }],
    [400, { raw: '{ invalid JSON' }],
    [413, { raw: JSON.stringify({ text: '字'.repeat(3000) }) }],
  ]) assert.equal((await call(t.service, '/api/narrate', eventInput(), options)).status, expected);
  for (const input of [null, [], {}, { kind: 'event', game: {} }, { kind: 'summary', game: eventInput().game }]) {
    assert.equal((await call(t.service, '/api/narrate', input)).status, 400);
  }
  assert.equal((await call(t.service, '/api/narrate', undefined)).status, 405);
  assert.equal((await call(t.service, '/api/narrate?url=https://evil.test', eventInput())).status, 400);
  const streamRequest = new Request('https://internal.invalid/api/narrate', { method: 'POST', duplex: 'half',
    headers: { 'Content-Type': 'application/json', 'X-Game-Visitor': VISITOR, 'X-Game-Ip': IP },
    body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9000)); controller.close(); } }) });
  assert.equal((await t.service.handle(streamRequest)).status, 413);
  assert.equal(t.calls.length, 0);
});

test('event and complete summary reuse validated prompts, persist cache and isolate visitors', async () => {
  const t = setup(), event = eventInput(), summary = summaryInput(), before = structuredClone(event);
  Object.assign(event.game, { history: [{ title: 'FORGED_PRIVATE_HISTORY' }], money: 999999999 });
  const first = await call(t.service, '/api/narrate', event);
  assert.equal(first.body.mode, 'live'); assert.equal(first.body.model, MODEL);
  assert.doesNotMatch(t.calls[0].prompt, /FORGED_PRIVATE_HISTORY|999999999/);
  assert.equal((await call(t.rebuild(), '/api/narrate', before)).body.mode, 'cache');
  assert.equal(t.calls.length, 1);
  assert.equal((await call(t.rebuild(), '/api/narrate', before, { visitor: 'test-visitor-bbbbbbbbbbbbbbbb' })).body.mode, 'live');
  assert.equal((await call(t.rebuild(), '/api/narrate', summary)).body.mode, 'live');
  assert.match(t.calls.at(-1).prompt, /顺利通关|complete/);
  assert.equal(t.calls.length, 3);
  assert.doesNotMatch(JSON.stringify(first.body), /PRIVATE_REASONING|X-Game-|test-visitor|history/);
  t.clock.value += DAY + 1;
  await call(t.service, '/api/ai/status');
  assert.equal([...t.storage.data.keys()].filter(key => key !== 'cloud-game:v1:expiry').length, 0);
});

test('identical concurrent narrative requests perform one provider call and independently readable responses', async () => {
  let unblock, started;
  const ready = new Promise(resolve => { started = resolve; });
  const t = setup({ execute: async prompt => { started(); await new Promise(resolve => { unblock = resolve; }); return modelReply(prompt); } });
  const first = call(t.service, '/api/narrate', eventInput());
  await ready;
  const duplicate = call(t.service, '/api/narrate', eventInput());
  unblock();
  const results = await Promise.all([first, duplicate]);
  assert.deepEqual(results.map(result => result.body.mode).sort(), ['cache', 'live']);
  assert.equal(results[0].body.text, results[1].body.text);
  const budget = [...t.storage.data].find(([key]) => key.includes('budget:model:'));
  assert.equal(budget[1].value, 1);
});

test('two-round practice survives service reconstruction, owns transcript, deduplicates and rejects changed settled turns', async () => {
  const t = setup(), initial = practiceInput();
  const first = await call(t.service, '/api/practice', initial);
  assert.equal(first.status, 200); assert.equal(first.body.mode, 'live'); assert.equal('tip' in first.body, false);
  assert.match(first.body.sessionId, /^[A-Za-z0-9_-]{32}$/);
  const repeated = await call(t.rebuild(), '/api/practice', initial);
  assert.equal(repeated.body.mode, 'cache'); assert.equal(repeated.body.sessionId, first.body.sessionId);
  const secondInput = { ...initial, turn: 2, sessionId: first.body.sessionId, message: '我先把待确认事项发出来，再邀请双方确认。',
    transcript: [{ player: 'FORGED_TRANSCRIPT' }], npc: 'FORGED_NPC' };
  const second = await call(t.rebuild(), '/api/practice', secondInput);
  assert.equal(second.body.mode, 'live'); assert.equal(second.body.done, true); assert.equal(second.body.tip, finalFields.tip);
  assert.match(t.calls[1].prompt, /能否先共同核对一个交接节点/);
  assert.ok(t.calls[1].prompt.includes(firstFields.npc));
  assert.doesNotMatch(t.calls[1].prompt, /FORGED_/);
  assert.equal((await call(t.rebuild(), '/api/practice', secondInput)).body.mode, 'cache');
  for (const bad of [
    { ...initial, message: '修改已经说过的话。' },
    { ...secondInput, message: '修改已经结算的第二轮。' },
    { ...secondInput, turn: 3 }, { ...secondInput, sessionId: undefined },
  ]) assert.equal((await call(t.rebuild(), '/api/practice', bad)).status, 400);
  assert.equal(t.calls.length, 2);
});

test('matching client IDs cannot cross visitors, sessions or canonical event choices', async () => {
  const t = setup(), initial = practiceInput();
  const first = (await call(t.service, '/api/practice', initial)).body;
  assert.equal((await call(t.rebuild(), '/api/practice', { ...initial, turn: 2, sessionId: first.sessionId },
    { visitor: 'test-visitor-bbbbbbbbbbbbbbbb' })).status, 400);
  const other = (await call(t.service, '/api/practice', initial, { visitor: 'test-visitor-bbbbbbbbbbbbbbbb' })).body;
  assert.equal(other.mode, 'live'); assert.notEqual(other.sessionId, first.sessionId);
  assert.equal((await call(t.service, '/api/practice', { ...initial, turn: 2, sessionId: first.sessionId,
    clientId: 'test-practice-client-bbbbbbbbbbbb' })).status, 400);
  const changedGame = snapshot(choose(land(newGame('demo', { enriched: true }), 5), 1));
  assert.equal((await call(t.service, '/api/practice', { ...initial, game: changedGame, turn: 2, sessionId: first.sessionId })).status, 400);
  assert.equal(t.calls.length, 2);
});

test('independent invitation rehearsal retains its explicit hypothetical scope without game mutations', async () => {
  const t = setup();
  const input = { rehearsal: { id: INVITATION_PRACTICE_ID }, clientId: 'test-practice-client-aaaaaaaaaaaa', turn: 1, message: '可以先确定一个共同核对的节点吗？' };
  const response = await call(t.service, '/api/practice', input);
  assert.equal(response.body.mode, 'live');
  assert.match(t.calls[0].prompt, /独立假设|不是玩家/);
  assert.equal((await call(t.service, '/api/practice', { ...input, game: eventInput().game })).status, 400);
});

test('practice TTL deletes transcripts lazily, expires tokens and permits a clean later start', async () => {
  const t = setup(), input = practiceInput({ message: 'PRIVATE_TEST_MESSAGE_ONLY' });
  const first = (await call(t.service, '/api/practice', input)).body;
  assert.ok(JSON.stringify([...t.storage.data]).includes(input.message));
  t.clock.value += 10 * MINUTE;
  await call(t.rebuild(), '/api/ai/status');
  assert.equal(JSON.stringify([...t.storage.data]).includes(input.message), false);
  assert.equal((await call(t.rebuild(), '/api/practice', { ...input, turn: 2, sessionId: first.sessionId })).status, 400);
  const again = (await call(t.rebuild(), '/api/practice', input)).body;
  assert.equal(again.mode, 'live'); assert.notEqual(again.sessionId, first.sessionId);
});

test('cleanup exposes the next persisted deadline and removes idle private conversations for DO alarms', async () => {
  const t = setup();
  assert.equal(await t.service.cleanup(), null);
  await call(t.service, '/api/practice', practiceInput({ message: 'PRIVATE_ALARM_TEST_MESSAGE' }));
  assert.equal(await t.service.cleanup(), Math.ceil(t.clock.value / MINUTE) * MINUTE);
  t.clock.value += 10 * MINUTE;
  const next = await t.rebuild().cleanup();
  assert.equal(next, Math.ceil(t.clock.value / DAY) * DAY);
  assert.equal(JSON.stringify([...t.storage.data]).includes('PRIVATE_ALARM_TEST_MESSAGE'), false);
  t.clock.value += DAY;
  assert.equal(await t.rebuild().cleanup(), null);
  assert.deepEqual([...t.storage.data], [['cloud-game:v1:expiry', {}]]);
});

test('concurrent first-turn retries preserve one session and one charge', async () => {
  let unblock, started;
  const ready = new Promise(resolve => { started = resolve; });
  const t = setup({ execute: async prompt => { started(); await new Promise(resolve => { unblock = resolve; }); return modelReply(prompt); } });
  const first = call(t.service, '/api/practice', practiceInput());
  await ready;
  const duplicate = call(t.service, '/api/practice', practiceInput());
  unblock();
  const [one, two] = await Promise.all([first, duplicate]);
  assert.equal(one.body.sessionId, two.body.sessionId);
  assert.deepEqual([one.body.mode, two.body.mode].sort(), ['cache', 'live']);
  assert.equal([...t.storage.data].find(([key]) => key.includes('budget:model:'))[1].value, 1);
});

test('per-visitor model budget persists across service reconstruction and client ID rotation', async () => {
  const t = setup();
  for (let i = 0; i < 21; i++) {
    t.clock.value += MINUTE;
    const result = await call(t.rebuild(), '/api/practice', practiceInput({ clientId: `client-${String(i).padStart(24, '0')}` }));
    assert.equal(result.body.mode, i < 20 ? 'live' : 'fallback');
  }
  assert.equal(t.calls.length, 20);
  assert.equal((await call(t.rebuild(), '/api/ai/status')).body.available, false);
});

test('global daily model ceiling is persistent and a new visitor cannot reset it', async () => {
  const t = setup();
  for (let i = 0; i < 81; i++) {
    const identity = { visitor: `test-visitor-${String(Math.floor(i / 20)).padStart(24, '0')}`, ip: String(i).padStart(64, '0') };
    const response = await call(t.rebuild(), '/api/narrate', eventInput(`第${i}位验收`), identity);
    assert.equal(response.body.mode, i < 80 ? 'live' : 'fallback');
  }
  assert.equal(t.calls.length, 80);
  t.clock.value += DAY;
  assert.equal((await call(t.rebuild(), '/api/narrate', eventInput('新一天'))).body.mode, 'live');
  assert.equal(t.calls.length, 81);
});

test('IP minute ceiling covers narration and both practice turns and survives visitor rotation', async () => {
  const t = setup(), input = practiceInput();
  const first = (await call(t.service, '/api/practice', input)).body;
  await call(t.service, '/api/practice', { ...input, turn: 2, sessionId: first.sessionId });
  for (let i = 0; i < 7; i++) {
    const response = await call(t.rebuild(), '/api/narrate', eventInput(`同网${i}`), { visitor: `test-visitor-${String(i).padStart(24, '0')}` });
    assert.equal(response.body.mode, i < 6 ? 'live' : 'fallback');
  }
  assert.equal(t.calls.length, 8);
  t.clock.value += MINUTE;
  assert.equal((await call(t.rebuild(), '/api/narrate', eventInput('下分钟'))).body.mode, 'live');
  assert.equal(t.calls.length, 9);
});

test('provider failures and invalid output are redacted, cached as fallback and cool down across reconstruction', async () => {
  let attempts = 0;
  const t = setup({ execute: async () => { attempts++; throw new Error('PRIVATE_SECRET PRIVATE_PLAYER upstream-path'); } });
  const input = eventInput();
  const result = await call(t.service, '/api/narrate', input);
  assert.equal(result.status, 200); assert.equal(result.body.mode, 'fallback');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|upstream-path/);
  assert.equal((await call(t.rebuild(), '/api/narrate', input)).body.mode, 'fallback');
  assert.equal((await call(t.rebuild(), '/api/practice', practiceInput())).body.mode, 'fallback');
  assert.equal(attempts, 1);
  assert.equal((await call(t.rebuild(), '/api/ai/status')).body.available, false);
  t.clock.value += MINUTE;
  const recovered = createCloudGameService({ ...t.config, execute: async prompt => { attempts++; return modelReply(prompt); } });
  assert.equal((await call(recovered, '/api/narrate', input)).body.mode, 'live');
  assert.equal(attempts, 2);
  const unsafe = setup({ execute: async () => completion(JSON.stringify({ npc: 'PRIVATE', tip: 'PRIVATE' })) });
  assert.equal((await call(unsafe.service, '/api/practice', practiceInput())).body.mode, 'fallback');
});

test('interrupted persisted practice requests settle a safe fallback without billing the lost turn again', async () => {
  let unblock, started;
  const ready = new Promise(resolve => { started = resolve; });
  const t = setup({ execute: async prompt => { started(); await new Promise(resolve => { unblock = resolve; }); return modelReply(prompt); } });
  const initial = practiceInput(), original = call(t.service, '/api/practice', initial);
  await ready;
  // Simulate the only object being rebuilt from its last committed disk state;
  // the old simulated request finishes only in a separate, discarded store.
  const disk = new MemoryStorage(t.storage.data);
  let retries = 0;
  const rebuilt = createCloudGameService({ storage: disk, now: t.config.now, execute: async prompt => { retries++; return modelReply(prompt); } });
  const restored = await call(rebuilt, '/api/practice', initial);
  assert.equal(restored.body.mode, 'fallback'); assert.equal(retries, 0);
  const second = await call(rebuilt, '/api/practice', { ...initial, turn: 2, sessionId: restored.body.sessionId });
  assert.equal(second.body.done, true); assert.equal(second.body.mode, 'live'); assert.equal(retries, 1);
  unblock(); await original;
});

test('interrupted narration uses its persisted fallback marker rather than double billing after reconstruction', async () => {
  let unblock, started;
  const ready = new Promise(resolve => { started = resolve; });
  const t = setup({ execute: async prompt => { started(); await new Promise(resolve => { unblock = resolve; }); return modelReply(prompt); } });
  const original = call(t.service, '/api/narrate', eventInput());
  await ready;
  const disk = new MemoryStorage(t.storage.data);
  let retries = 0;
  const rebuilt = createCloudGameService({ storage: disk, now: t.config.now, execute: async prompt => { retries++; return modelReply(prompt); } });
  assert.equal((await call(rebuilt, '/api/narrate', eventInput())).body.mode, 'fallback');
  assert.equal(retries, 0);
  unblock(); await original;
});

test('upstream deadline aborts its signal, stores fallback and keeps error details private', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let start, observed;
  const ready = new Promise(resolve => { start = resolve; });
  const game = setup({ execute: async (_prompt, { signal }) => {
    observed = signal; start();
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('PRIVATE_TIMEOUT')), { once: true }));
  } });
  const pending = call(game.service, '/api/narrate', eventInput());
  await ready;
  t.mock.timers.tick(21_000);
  const result = await pending;
  assert.equal(observed.aborted, true);
  assert.equal(result.body.mode, 'fallback');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_TIMEOUT/);
  assert.equal((await call(game.rebuild(), '/api/ai/status')).body.available, false);
});

test('search accepts only one fixed public source, filters results and shares a 15-minute cache safely', async () => {
  const searches = [], t = setup({ search: async (query, options) => {
    searches.push({ query, count: options.count });
    return JSON.stringify({ Code: '0', Data: { Items: [
      { Title: 'BAD', Url: 'https://evil.test/article' }, { Title: 'BAD', Url: 'https://me:pass@www.zhihu.com/question/1' },
      { Title: '<b>讨论</b>', AuthorName: '<i>答主</i>', Url: 'https://www.zhihu.com/question/123/answer/456', ContentText: '<b>摘要</b>'.repeat(200) },
    ] } });
  } });
  for (const path of ['/api/experience', '/api/experience?source=__proto__', '/api/experience?source=records&query=private', '/api/experience?source=records&source=records']) {
    assert.equal((await call(t.service, path)).status, 400);
  }
  assert.equal(searches.length, 0);
  const first = await call(t.service, '/api/experience?source=records');
  assert.equal(first.body.mode, 'live'); assert.equal(first.body.items.length, 1);
  assert.equal(first.body.items[0].title, '讨论'); assert.equal(first.body.items[0].author, '答主');
  assert.equal(first.body.items[0].excerpt.length, 150);
  assert.deepEqual(searches, [{ query: SOURCES.records.query, count: 3 }]);
  assert.equal((await call(t.rebuild(), '/api/experience?source=records', undefined, { visitor: 'test-visitor-bbbbbbbbbbbbbbbb' })).body.mode, 'cache');
  assert.equal(searches.length, 1);
  t.clock.value += 15 * MINUTE;
  assert.equal((await call(t.rebuild(), '/api/experience?source=records')).body.mode, 'live');
  assert.equal(searches.length, 2);
});

test('search has its own persistent daily allowance, cooldown and curated fallback', async () => {
  const t = setup();
  for (let i = 0; i < 81; i++) {
    t.clock.value += 16 * MINUTE;
    assert.equal((await call(t.rebuild(), '/api/experience?source=records')).body.mode, i < 80 ? 'live' : 'curated');
  }
  assert.equal(t.searches.length, 80); assert.equal(t.calls.length, 0);
  const failed = setup({ search: async () => { throw new Error('PRIVATE_SEARCH_EXCEPTION'); } });
  const result = await call(failed.service, '/api/experience?source=records');
  assert.equal(result.body.mode, 'curated'); assert.doesNotMatch(JSON.stringify(result), /PRIVATE_SEARCH_EXCEPTION/);
  assert.equal((await call(failed.rebuild(), '/api/experience?source=records')).body.mode, 'curated');
});

test('storage errors fail closed, do not call upstream and never leak storage details', async () => {
  const t = setup(); t.storage.fail = true;
  const response = await call(t.service, '/api/narrate', eventInput());
  assert.equal(response.status, 503); assert.equal(t.calls.length, 0);
  assert.doesNotMatch(JSON.stringify(response), /PRIVATE_STORAGE_ERROR/);
});

test('capacity exhaustion cannot evict unexpired counters or silently open new model allowance', async () => {
  const t = setup(), index = {};
  for (let i = 0; i < 1024; i++) index[`cloud-game:v1:occupied:${i}`] = t.clock.value + DAY;
  t.storage.data.set('cloud-game:v1:expiry', index);
  const before = structuredClone(t.storage.data);
  assert.equal((await call(t.service, '/api/narrate', eventInput())).status, 503);
  assert.equal(t.calls.length, 0);
  assert.deepEqual(t.storage.data, before);
});
