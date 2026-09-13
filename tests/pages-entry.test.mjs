import test from 'node:test';
import assert from 'node:assert/strict';
import pages, { PAGES_PRODUCTION_ORIGIN as ORIGIN } from '../server/pages-entry.mjs';

function bindings({ backendStatus = 200, assetStatus = 200 } = {}) {
  const calls = [];
  return { calls, env: {
    GAME_BACKEND: { async fetch(request) { calls.push({ kind: 'backend', request }); return new Response('backend', { status: backendStatus }); } },
    ASSETS: { async fetch(request) { calls.push({ kind: 'asset', request }); return new Response('asset', { status: assetStatus }); } },
  } };
}

test('only the exact HTTPS production Pages origin is accepted', async () => {
  assert.equal(ORIGIN, 'https://zhihu-four-seasons.pages.dev');
  for (const origin of [
    'https://preview.zhihu-four-seasons.pages.dev',
    'https://123abc.zhihu-four-seasons.pages.dev',
    'https://zhihu-four-seasons.pages.dev.evil.example',
    'https://zhihu-four-seasons.sishi-life-005336.workers.dev',
    'http://zhihu-four-seasons.pages.dev',
    'https://zhihu-four-seasons.pages.dev:8443',
    'http://127.0.0.1:8789',
  ]) {
    const { env, calls } = bindings();
    for (const path of ['/', '/assets/main.js', '/api/narrate']) {
      const response = await pages.fetch(new Request(`${origin}${path}`, { headers: { Origin: ORIGIN, Host: new URL(ORIGIN).host } }), env);
      assert.equal(response.status, 421, `${origin}${path}`);
      assert.deepEqual(await response.json(), { error: '请使用正式试玩地址' });
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.equal(response.headers.has('Access-Control-Allow-Origin'), false);
    }
    assert.deepEqual(calls, [], 'Preview hosts cannot touch production quota or static bindings');
  }
});

test('home, index and every /api/ route use the backend without changing URL or query', async () => {
  const { env, calls } = bindings();
  for (const path of ['/', '/?from=share', '/index.html', '/index.html?v=2', '/api/health', '/api/narrate', '/api/practice', '/api/experience?source=cross-team', '/api/unknown?x=%2F%2B']) {
    const request = new Request(`${ORIGIN}${path}`);
    const response = await pages.fetch(request, env), call = calls.at(-1);
    assert.equal(response.status, 200); assert.equal(call.kind, 'backend');
    assert.equal(call.request, request); assert.equal(call.request.url, `${ORIGIN}${path}`);
  }
});

test('POST request, origin, cookie, fetch metadata and complete body are preserved', async () => {
  const content = JSON.stringify({ kind: 'event', message: '只使用合成测试输入', list: [1, 2, 3] });
  const request = new Request(`${ORIGIN}/api/narrate?audit=body`, { method: 'POST', headers: {
    Origin: ORIGIN, Cookie: '__Host-four-seasons-visitor=synthetic-fixture',
    'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'X-Synthetic-Test': 'preserved',
  }, body: content });
  let called = 0;
  const response = await pages.fetch(request, { GAME_BACKEND: { async fetch(received) {
    called++; assert.equal(received, request); assert.equal(received.method, 'POST');
    assert.equal(received.headers.get('Origin'), ORIGIN);
    assert.equal(received.headers.get('Cookie'), '__Host-four-seasons-visitor=synthetic-fixture');
    assert.equal(received.headers.get('Sec-Fetch-Site'), 'same-origin');
    assert.equal(received.headers.get('X-Synthetic-Test'), 'preserved');
    assert.equal(received.bodyUsed, false); assert.equal(await received.text(), content);
    return new Response('accepted');
  } } });
  assert.equal(called, 1); assert.equal(await response.text(), 'accepted');
});

test('streamed request bytes are not consumed, re-encoded or truncated by the entry', async () => {
  const chunks = [Uint8Array.from([0, 255, 17]), Uint8Array.from([33, 128, 64, 0])];
  const request = new Request(`${ORIGIN}/api/practice`, { method: 'POST', duplex: 'half',
    body: new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close(); } }) });
  const response = await pages.fetch(request, { GAME_BACKEND: { async fetch(received) {
    assert.equal(received, request); assert.equal(received.bodyUsed, false);
    assert.deepEqual([...new Uint8Array(await received.arrayBuffer())], [0, 255, 17, 33, 128, 64, 0]);
    return new Response(null, { status: 204 });
  } } });
  assert.equal(response.status, 204);
});

test('the backend retains same-origin enforcement; the entry does not repair a hostile Origin', async () => {
  const request = new Request(`${ORIGIN}/api/narrate`, { method: 'POST',
    headers: { Origin: 'https://preview.zhihu-four-seasons.pages.dev', 'Sec-Fetch-Site': 'cross-site' }, body: '{}' });
  const denied = new Response('blocked by backend', { status: 403 });
  const response = await pages.fetch(request, { GAME_BACKEND: { async fetch(received) {
    assert.equal(received.headers.get('Origin'), 'https://preview.zhihu-four-seasons.pages.dev');
    assert.equal(received.headers.get('Sec-Fetch-Site'), 'cross-site'); return denied;
  } } });
  assert.equal(response, denied); assert.equal(response.status, 403);
});

test('assets and non-API paths use ASSETS; their original 404 is retained', async () => {
  const { env, calls } = bindings({ assetStatus: 404 });
  for (const path of ['/assets/main.js', '/art/memories/cell-01.png', '/cinematics/cell-06.mp4', '/favicon.ico', '/missing', '/api', '/API/health', '/index.html/other']) {
    const request = new Request(`${ORIGIN}${path}`), response = await pages.fetch(request, env);
    assert.equal(response.status, 404); assert.equal(await response.text(), 'asset');
    assert.equal(calls.at(-1).kind, 'asset'); assert.equal(calls.at(-1).request, request);
  }
});

test('static HEAD and Range remain native; backend is not involved in media delivery', async () => {
  const request = new Request(`${ORIGIN}/cinematics/cell-06.mp4`, { method: 'HEAD', headers: { Range: 'bytes=0-1023' } });
  const original = new Response(null, { status: 206, headers: {
    'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-1023/2048', 'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=3600', ETag: 'synthetic-etag',
  } });
  const result = await pages.fetch(request, { ASSETS: { async fetch(received) {
    assert.equal(received, request); assert.equal(received.method, 'HEAD');
    assert.equal(received.headers.get('Range'), 'bytes=0-1023'); return original;
  } } });
  assert.equal(result, original); assert.equal(result.status, 206);
  assert.equal(result.headers.get('Content-Range'), 'bytes 0-1023/2048');
  assert.equal(result.headers.get('Cache-Control'), 'public, max-age=3600');
});

test('backend response identity, visitor cookie, content security and no-store survive unchanged', async () => {
  const original = new Response('<!doctype html>synthetic game', { status: 200, headers: {
    'Content-Type': 'text/html; charset=utf-8',
    'Set-Cookie': '__Host-four-seasons-visitor=synthetic; Path=/; Secure; HttpOnly; SameSite=Lax',
    'Cache-Control': 'private, no-store', 'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
  } });
  const result = await pages.fetch(new Request(`${ORIGIN}/`), { GAME_BACKEND: { fetch: async () => original } });
  assert.equal(result, original);
  assert.match(result.headers.get('Set-Cookie'), /Secure; HttpOnly; SameSite=Lax/);
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(result.headers.get('Content-Security-Policy'), "default-src 'self'; frame-ancestors 'none'");
  assert.equal(result.headers.has('Access-Control-Allow-Origin'), false);
});

test('unknown API, unsupported home method and reserved callback remain backend decisions', async () => {
  for (const [path, method, status] of [['/api/unknown', 'GET', 404], ['/', 'POST', 405], ['/api/auth/zhihu/callback?code=synthetic', 'GET', 503]]) {
    const { env, calls } = bindings({ backendStatus: status });
    const result = await pages.fetch(new Request(`${ORIGIN}${path}`, { method }), env);
    assert.equal(result.status, status); assert.equal(calls.length, 1); assert.equal(calls[0].kind, 'backend');
  }
});

test('missing or malformed route binding returns a readable safe 503, never a network fallback', async () => {
  for (const [path, env] of [['/', undefined], ['/api/practice', {}], ['/api/narrate', { GAME_BACKEND: {} }], ['/index.html', { GAME_BACKEND: { fetch: 7 } }], ['/assets/missing.js', {}]]) {
    const result = await pages.fetch(new Request(`${ORIGIN}${path}`), env);
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: '试玩服务暂不可用，请稍后重试' });
    assert.equal(result.headers.get('Retry-After'), '30'); assert.equal(result.headers.get('Cache-Control'), 'no-store');
  }
});

test('thrown backend and asset diagnostics are not reflected or retried', async () => {
  for (const path of ['/api/narrate', '/assets/main.js']) {
    let calls = 0;
    const bad = { async fetch() { calls++; throw Error('synthetic private diagnostic: INTERNAL_ENDPOINT synthetic-token'); } };
    const result = await pages.fetch(new Request(`${ORIGIN}${path}`), { GAME_BACKEND: bad, ASSETS: bad });
    assert.equal(result.status, 503); assert.equal(calls, 1);
    const body = await result.text(); assert.doesNotMatch(body, /private|INTERNAL_ENDPOINT|synthetic-token/);
    assert.match(body, /试玩服务暂不可用/);
    assert.equal(result.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.match(result.headers.get('Content-Security-Policy'), /default-src 'none'/);
    assert.equal(result.headers.has('Access-Control-Allow-Origin'), false);
  }
});

test('a preview origin is denied before even inspecting a missing backend binding', async () => {
  const response = await pages.fetch(new Request('https://branch.zhihu-four-seasons.pages.dev/api/narrate'), undefined);
  assert.equal(response.status, 421);
});
