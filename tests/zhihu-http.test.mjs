import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODEL, createModelGate, createNarrator, extractFinalText } from '../server/ai-core.mjs';
import { createNarrator as createLocalNarrator } from '../server/ai.mjs';
import { createZhihuHttpExecutor, createZhihuHttpSearch, ZhihuHttpError,
  MAX_ZHIHU_REQUEST_BYTES, MAX_ZHIHU_RESPONSE_BYTES, MAX_ZHIHU_QUERY_BYTES } from '../server/zhihu-http.mjs';

const secret = 'test-only-secret-never-real';
const completion = JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '你给这次沟通留出了一点空间，可以带着已经做出的选择继续前行。' } }] });
const searchResult = JSON.stringify({ Code: 0, Message: 'success', Data: { Items: [{ Title: '沟通边界', Url: 'https://www.zhihu.com/question/123/answer/456?utm_source=example' }], HasMore: false } });
const response = text => new Response(text, { headers: { 'Content-Type': 'application/json' } });

test('HTTP executor uses only documented fields, fixed official host, Bearer and second timestamp', async () => {
  const controller = new AbortController();
  let calls = 0;
  const before = Math.floor(Date.now() / 1000);
  const execute = createZhihuHttpExecutor({ secret, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://developer.zhihu.com/v1/chat/completions');
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.signal, controller.signal);
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.match(options.headers['X-Request-Timestamp'], /^\d{10}$/);
    assert.ok(Number(options.headers['X-Request-Timestamp']) >= before);
    assert.ok(Number(options.headers['X-Request-Timestamp']) <= Math.floor(Date.now() / 1000));
    assert.deepEqual(JSON.parse(options.body), { model: MODEL, messages: [{ role: 'user', content: '仅供服务端确认的游戏记录。' }], stream: false });
    assert.equal(options.body.includes(secret), false);
    return response(completion);
  } });
  const result = await execute('仅供服务端确认的游戏记录。', { signal: controller.signal });
  assert.equal(result, completion);
  assert.match(extractFinalText(result, 'event'), /这次沟通/);
  assert.equal(calls, 1);
});

test('HTTP search encodes the query and preserves the official result envelope and provenance URL', async () => {
  const controller = new AbortController();
  const search = createZhihuHttpSearch({ secret, fetchImpl: async (href, options) => {
    const url = new URL(href);
    assert.equal(url.origin, 'https://developer.zhihu.com');
    assert.equal(url.pathname, '/api/v1/content/zhihu_search');
    assert.deepEqual([...url.searchParams], [['Query', '沟通 & https://elsewhere.test/?x=1'], ['Count', '3']]);
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.signal, controller.signal);
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    assert.match(options.headers['X-Request-Timestamp'], /^\d{10}$/);
    return response(searchResult);
  } });
  assert.equal(await search(' 沟通 & https://elsewhere.test/?x=1 ', { signal: controller.signal }), searchResult);
});

test('missing credentials and invalid input fail before network access', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return response(completion); };
  for (const value of [undefined, '', '   ', 'secret\nheader', 'x'.repeat(4097)]) {
    assert.throws(() => createZhihuHttpExecutor({ secret: value, fetchImpl }), error => error instanceof ZhihuHttpError && error.code === 'not_configured');
  }
  const execute = createZhihuHttpExecutor({ secret, fetchImpl });
  for (const prompt of [undefined, null, 1, '', ' \n ']) await assert.rejects(execute(prompt), { code: 'invalid_request' });
  await assert.rejects(execute('字'.repeat(MAX_ZHIHU_REQUEST_BYTES / 2)), { code: 'request_too_large' });
  const search = createZhihuHttpSearch({ secret, fetchImpl });
  for (const count of [0, 11, '3', 1.5]) await assert.rejects(search('沟通', { count }), { code: 'invalid_request' });
  await assert.rejects(search('字'.repeat(MAX_ZHIHU_QUERY_BYTES)), { code: 'request_too_large' });
  assert.equal(calls, 0);
});

test('server-generated prompts can exceed the inbound snapshot limit within the outbound limit', async () => {
  let calls = 0;
  const execute = createZhihuHttpExecutor({ secret, fetchImpl: async (_url, { body }) => {
    calls++;
    assert.ok(new TextEncoder().encode(body).byteLength > 8192);
    assert.ok(new TextEncoder().encode(body).byteLength < MAX_ZHIHU_REQUEST_BYTES);
    return response(completion);
  } });
  assert.equal(await execute('已核对的事件记录。'.repeat(1200)), completion);
  assert.equal(calls, 1);
});

test('provider, parsing and network failures never expose response content or retry', async () => {
  const sensitive = `${secret} private-player-message`;
  const factories = [
    () => new Response(sensitive, { status: 401 }),
    () => new Response(sensitive, { status: 429 }),
    () => response(JSON.stringify({ error: { message: sensitive } })),
    () => response(`invalid JSON ${sensitive}`),
    () => response('[]'),
    () => response('{}'),
    () => { throw new Error(sensitive); },
  ];
  for (const factory of factories) {
    let calls = 0;
    const execute = createZhihuHttpExecutor({ secret, fetchImpl: async () => { calls++; return factory(); } });
    await assert.rejects(execute('a private-player-message'), error => {
      assert.ok(error instanceof ZhihuHttpError);
      assert.equal(error.cause, undefined);
      assert.doesNotMatch(`${error.message} ${error.stack} ${JSON.stringify(error)}`, /test-only-secret-never-real|private-player-message/);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test('search API errors and malformed envelopes remain failures rather than empty results', async () => {
  for (const body of [{ Code: 20001, Message: secret }, { Code: 0, Data: {} }, { Data: { Items: [] } }, { Code: null, Data: { Items: [] } }]) {
    const search = createZhihuHttpSearch({ secret, fetchImpl: async () => response(JSON.stringify(body)) });
    await assert.rejects(search('沟通'), { code: 'invalid_response' });
  }
});

test('oversized declared and streamed responses are cancelled before parsing', async () => {
  let declaredCancelled = false;
  const declared = createZhihuHttpExecutor({ secret, fetchImpl: async () => new Response(new ReadableStream({
    cancel() { declaredCancelled = true; },
  }), { headers: { 'Content-Length': String(MAX_ZHIHU_RESPONSE_BYTES + 1) } }) });
  await assert.rejects(declared('记录'), { code: 'response_too_large' });
  assert.equal(declaredCancelled, true);

  let streamedCancelled = false, chunks = 0;
  const streamed = createZhihuHttpExecutor({ secret, fetchImpl: async () => new Response(new ReadableStream({
    pull(controller) { chunks++; controller.enqueue(new Uint8Array(64 * 1024)); },
    cancel() { streamedCancelled = true; },
  })) });
  await assert.rejects(streamed('记录'), { code: 'response_too_large' });
  assert.equal(streamedCancelled, true);
  assert.ok(chunks <= 34, 'Reading must stop at the byte limit, with at most one buffered chunk.');
});

test('bounded streaming decoder handles Chinese characters split between chunks', async () => {
  const bytes = new TextEncoder().encode(completion);
  let offset = 0;
  const execute = createZhihuHttpExecutor({ secret, fetchImpl: async () => new Response(new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      controller.enqueue(bytes.slice(offset, offset + 1)); offset++;
    },
  })) });
  assert.equal(await execute('记录'), completion);
});

test('invalid UTF-8 cancels an unfinished provider response before the gate releases it', async () => {
  let streamCancelled = false;
  const execute = createZhihuHttpExecutor({ secret, fetchImpl: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array([0xff])); },
    cancel() { streamCancelled = true; },
  })) });
  const gate = createModelGate({ execute, timeoutMs: 1000 });
  assert.deepEqual(await gate.run('记录'), { ok: false, reason: 'unavailable' });
  assert.equal(streamCancelled, true);
  assert.equal(gate.status().active, false);
});

test('aborted requests never start and model gate deadlines abort the same HTTP request', async () => {
  const cancelled = new AbortController(); cancelled.abort(new Error(secret));
  let calls = 0, observedSignal;
  const execute = createZhihuHttpExecutor({ secret, fetchImpl: async (_url, { signal }) => {
    calls++; observedSignal = signal;
    return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error(secret)), { once: true }));
  } });
  await assert.rejects(execute('记录', { signal: cancelled.signal }), { code: 'aborted' });
  assert.equal(calls, 0);
  const gate = createModelGate({ execute, timeoutMs: 10 });
  assert.deepEqual(await gate.run('记录'), { ok: false, reason: 'unavailable' });
  assert.equal(observedSignal.aborted, true);
  assert.equal(calls, 1);
  assert.equal(gate.status().coolingDown, true);
});

test('portable and local narrator entry points keep explicit transport metadata', () => {
  assert.equal(createNarrator({ transport: 'official-http' }).status().transport, 'official-http');
  assert.equal(createLocalNarrator().status().transport, 'official-cli');
});
