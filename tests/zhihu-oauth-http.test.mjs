import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZhihuAuthorizationUrl, createZhihuOAuthClient } from '../server/zhihu-oauth-http.mjs';

const redirectUri = 'https://zhihu-four-seasons.pages.dev/api/auth/zhihu/callback';
const options = { appId: 'public-app-id', appKey: 'private-app-key', redirectUri };
const state = 'a'.repeat(64), secretCode = 'private-authorization-code', secretToken = 'private-oauth-token';
const tokenBody = { access_token: secretToken, token_type: 'Bearer', expires_in: 3600 };
const profileBody = '{"uid":969570047710216200,"fullname":"四季旅人","hash_id":"hash-identity","email":"never-return@example.com","phone_no":"private-phone","avatar_path":"https://picx.zhimg.com/example.png"}';
const response = (body, init = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), {
  ...init, headers: { 'Content-Type': 'application/json', ...init.headers },
});
function clientWith(replies, more = {}) {
  const calls = [];
  const client = createZhihuOAuthClient({ ...options, ...more, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(url, init) : next;
  } });
  return { client, calls };
}
async function rejectsSafely(client) {
  await assert.rejects(client.authenticate(secretCode), error => {
    assert.equal(error.name, 'OAuthTransportError');
    assert.equal(error.message, '知乎登录暂时未能完成，请重新尝试。');
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(String(error), /private-|never-return|api-key|upstream-detail/);
    return true;
  });
}

test('authorization URL has the exact registered callback and state, not secret/scopes/PKCE', () => {
  const url = new URL(buildZhihuAuthorizationUrl({ ...options, state }));
  assert.equal(url.origin + url.pathname, 'https://openapi.zhihu.com/authorize');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    app_id: options.appId, response_type: 'code', redirect_uri: redirectUri, state,
  });
  assert.equal(url.searchParams.has('app_key'), false);
});

test('authorization rejects unsafe state, app id and callback values', () => {
  for (const changes of [
    { state: 'short' }, { state: `${state}&next=bad` }, { appId: 'bad\napp' },
    { redirectUri: 'http://127.0.0.1/callback' }, { redirectUri: 'https://user:pass@example.com/callback' },
    { redirectUri: `${redirectUri}#fragment` }, { redirectUri: `${redirectUri}?next=other` },
  ]) assert.throws(() => buildZhihuAuthorizationUrl({ ...options, state, ...changes }), /知乎登录暂时未能完成/);
});

test('exchange is form POST; profile uses OAuth Bearer only; int64 uid stays exact', async () => {
  const { client, calls } = clientWith([response(tokenBody), response(profileBody)]);
  const result = await client.authenticate(secretCode);
  assert.deepEqual(result, { profile: { id: '969570047710216200', name: '四季旅人' }, expiresIn: 3600 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://openapi.zhihu.com/access_token');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.deepEqual(Object.fromEntries(calls[0].init.body), {
    app_id: options.appId, app_key: options.appKey, grant_type: 'authorization_code', redirect_uri: redirectUri, code: secretCode,
  });
  assert.equal(calls[1].url, 'https://openapi.zhihu.com/user');
  assert.deepEqual(calls[1].init.headers, { Authorization: `Bearer ${secretToken}`, Accept: 'application/json' });
  assert.equal(calls[1].init.method, 'GET');
  assert.equal(calls[1].init.redirect, 'manual');
  assert.equal(calls[0].init.signal, calls[1].init.signal);
  assert.doesNotMatch(JSON.stringify(result), /token|email|phone|avatar|headline|description/);
});

test('20000 wrappers support data and raw fields without interpreting success as error', async () => {
  const { client } = clientWith([
    response({ code: 20000, data: tokenBody }),
    response('{"code":20000,"data":{"uid":9223372036854775807,"fullname":"最大整数"}}'),
  ]);
  assert.deepEqual(await client.authenticate(secretCode), { profile: { id: '9223372036854775807', name: '最大整数' }, expiresIn: 3600 });
  const second = clientWith([response({ code: 20000, ...tokenBody }), response({ code: 20000, hash_id: 'abc_123-xyz', fullname: '昵称' })]);
  assert.equal((await second.client.authenticate(secretCode)).profile.id, 'abc_123-xyz');
});

test('JSON strings and escaped digits are not rewritten while preserving uid', async () => {
  const { client } = clientWith([response(tokenBody), response('{"uid":969570047710216201,"fullname":"第123站：\\\"旅人\\\"\\u0031"}')]);
  assert.deepEqual((await client.authenticate(secretCode)).profile, { id: '969570047710216201', name: '第123站："旅人"1' });
});

test('valid identity with an unavailable display name gets a minimal fallback', async () => {
  for (const fullname of [undefined, null, '', '   ']) {
    const { client } = clientWith([response(tokenBody), response({ uid: '969570047710216200', fullname })]);
    assert.deepEqual((await client.authenticate(secretCode)).profile, { id: '969570047710216200', name: '知乎旅人' });
  }
  const { client } = clientWith([response(tokenBody), response({ uid: null, hash_id: 'hash-identity', fullname: null })]);
  assert.deepEqual((await client.authenticate(secretCode)).profile, { id: 'hash-identity', name: '知乎旅人' });
});

test('missing or malformed token fields and error wrappers fail before requesting user', async () => {
  for (const body of [
    {}, { code: 404, data: 'private-upstream-detail' }, { code: 0, data: tokenBody },
    { ...tokenBody, access_token: 'bad\ntoken' }, { ...tokenBody, token_type: 'Basic' },
    { ...tokenBody, expires_in: 0 }, { ...tokenBody, expires_in: -1 },
    { ...tokenBody, expires_in: 1.5 }, { ...tokenBody, expires_in: 99_999_999_999_999_999 },
    { ...tokenBody, expires_in: null }, { ...tokenBody, access_token: null },
  ]) {
    const { client, calls } = clientWith([response(body)]);
    await rejectsSafely(client);
    assert.equal(calls.length, 1);
  }
});

test('HTTP 200 missing user, rounded-looking uid, controls and malformed JSON do not log in', async () => {
  for (const body of [
    { code: 404, data: 'User don\'t exist' }, {}, [], null,
    '{"uid":9.695700477102162e17,"fullname":"昵称"}',
    '{"uid":9223372036854775808,"fullname":"昵称"}',
    '{"uid":-1,"fullname":"昵称"}', '{"uid":001,"fullname":"昵称"}',
    '{123:1,"uid":123,"fullname":"昵称"}',
    { uid: '1', fullname: 123 }, { uid: '1', fullname: 'bad\nname' },
    { uid: null, fullname: '昵称' }, { uid: null, hash_id: null }, { uid: null, hash_id: '' },
    { hash_id: 'bad space', fullname: '昵称' }, { uid: '1', fullname: 'x'.repeat(101) },
    '{"uid":123,"fullname":"unterminated}',
  ]) {
    const { client } = clientWith([response(tokenBody), response(body)]);
    await rejectsSafely(client);
  }
});

test('upstream redirects and non-2xx replies are never followed or retried', async () => {
  for (const status of [301, 302, 307, 400, 401, 429, 500]) {
    const { client, calls } = clientWith([response('private-upstream-detail', { status, headers: { Location: 'https://evil.example/steal' } })]);
    await rejectsSafely(client);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.redirect, 'manual');
  }
  const { client, calls } = clientWith([response(tokenBody), response({}, { status: 302, headers: { Location: 'https://evil.example/profile' } })]);
  await rejectsSafely(client);
  assert.equal(calls.length, 2);
});

test('network errors are replaced, not attached as a secret-bearing cause', async () => {
  const { client, calls } = clientWith([new Error(`private-api-key ${options.appKey}`)]);
  await rejectsSafely(client);
  assert.equal(calls.length, 1);
});

test('JSON response bodies are bounded with and without content-length', async () => {
  for (const oversized of [
    response(tokenBody, { headers: { 'Content-Length': '999999999' } }),
    response(`{"padding":"${'x'.repeat(128 * 1024)}"}`),
    response(tokenBody, { headers: { 'Content-Length': '-10' } }),
    response(tokenBody, { headers: { 'Content-Type': 'text/html' } }),
    new Response(new Uint8Array([0xff, 0xfe]), { headers: { 'Content-Type': 'application/json' } }),
  ]) {
    const { client } = clientWith([oversized]);
    await rejectsSafely(client);
  }
});

test('one deadline covers both calls and handles a fetch implementation ignoring abort', async () => {
  const { client, calls } = clientWith([
    async () => { await new Promise(resolve => setTimeout(resolve, 25)); return response(tokenBody); },
    () => new Promise(() => {}),
  ], { timeoutMs: 60 });
  const started = performance.now();
  await rejectsSafely(client);
  assert.equal(calls.length, 2);
  assert.ok(performance.now() - started < 1000);
  assert.equal(calls[1].init.signal.aborted, true);
});

test('deadline cancels a stalled response stream', async () => {
  let cancelled = false;
  const stalled = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } });
  const { client } = clientWith([stalled], { timeoutMs: 25 });
  await rejectsSafely(client);
  assert.equal(cancelled, true);
});

test('late token response is cancelled after the deadline and never starts profile fetch', async () => {
  let cancelled = false, resolveToken;
  const { client, calls } = clientWith([() => new Promise(resolve => { resolveToken = resolve; })], { timeoutMs: 20 });
  await rejectsSafely(client);
  resolveToken(new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }));
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(cancelled, true);
  assert.equal(calls.length, 1);
});

test('invalid client configuration is rejected before any request', () => {
  for (const changes of [{ appKey: '' }, { appKey: 'key\nvalue' }, { timeoutMs: 0 }, { timeoutMs: 30_001 }, { fetchImpl: null }]) {
    assert.throws(() => createZhihuOAuthClient({ ...options, ...changes }), /知乎登录暂时未能完成/);
  }
});

test('invalid authorization code is rejected without making requests', async () => {
  const { client, calls } = clientWith([]);
  for (const code of ['', null, 'bad\ncode', 'x'.repeat(4097)]) await assert.rejects(client.authenticate(code), /知乎登录暂时未能完成/);
  assert.equal(calls.length, 0);
});
