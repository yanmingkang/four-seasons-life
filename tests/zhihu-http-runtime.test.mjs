import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Real workerd fetch/Request semantics, with ALL outbound traffic replaced by
// an in-process fake. No env files, provider credentials or external API calls.
const root = fileURLToPath(new URL('../', import.meta.url));
const worker = `
import { createZhihuHttpExecutor, createZhihuHttpSearch } from './server/zhihu-http.mjs';
export default { async fetch(request) {
  const mode = new URL(request.url).pathname;
  const controller = new AbortController();
  if (mode === '/aborted') controller.abort();
  const options = { secret: 'synthetic-runtime-fixture-not-real' };
  // Reproduce the old implementation as a control, without changing production.
  if (mode === '/old-error') options.fetchImpl = (url, init) => fetch(url, { ...init, redirect: 'error' });
  try {
    const execute = mode === '/search' ? createZhihuHttpSearch(options) : createZhihuHttpExecutor(options);
    const result = await execute('synthetic runtime fixture', { signal: controller.signal, count: 3 });
    return Response.json({ ok: true, result: JSON.parse(result) });
  } catch (error) {
    return Response.json({ ok: false, name: error.name, code: error.code });
  }
} };`;

test('workerd transport accepts manual mode and rejects redirects without external traffic', async t => {
  const compiled = await build({ stdin: { contents: worker, resolveDir: root, sourcefile: 'runtime-fixture.mjs' },
    bundle: true, write: false, platform: 'neutral', format: 'esm', target: 'es2022', external: ['node:*'] });
  const outbound = [];
  let redirectStatus = null;
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true, script: compiled.outputFiles[0].text,
    compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'],
    outboundService: async request => {
      const url = new URL(request.url);
      // The fake intercepts every destination, including any accidental redirect.
      // There is deliberately no fetch() or fall-through network implementation.
      outbound.push({ origin: url.origin, path: url.pathname, method: request.method });
      assert.equal(url.origin, 'https://developer.zhihu.com');
      assert.equal(request.headers.get('Authorization'), 'Bearer synthetic-runtime-fixture-not-real');
      assert.match(request.headers.get('X-Request-Timestamp'), /^\d{10}$/);
      if (redirectStatus) return new Response('synthetic redirect body', {
        status: redirectStatus, headers: { Location: 'https://redirect-must-not-be-contacted.invalid/' },
      });
      if (url.pathname === '/api/v1/content/zhihu_search') {
        assert.equal(url.searchParams.get('Query'), 'synthetic runtime fixture');
        assert.equal(url.searchParams.get('Count'), '3');
        return Response.json({ Code: 0, Data: { Items: [{ Title: '合成资料', Url: 'https://www.zhihu.com/question/123' }] } });
      }
      assert.equal(url.pathname, '/v1/chat/completions');
      const body = await request.json(); assert.equal(body.messages[0].content, 'synthetic runtime fixture');
      assert.equal(body.stream, false);
      return Response.json({ choices: [{ message: { content: '合成模型回应' } }] });
    },
  }));
  const invoke = async path => (await mf.dispatchFetch(`http://localhost${path}`)).json();
  try {
    await t.test('old redirect:error fails before any outbound request', async () => {
      assert.deepEqual(await invoke('/old-error'), { ok: false, name: 'ZhihuHttpError', code: 'unavailable' });
      assert.equal(outbound.length, 0);
    });
    await t.test('real adapter default fetch sends and decodes one model request', async () => {
      const result = await invoke('/model'); assert.equal(result.ok, true);
      assert.equal(result.result.choices[0].message.content, '合成模型回应');
      assert.equal(outbound.length, 1); assert.equal(outbound.at(-1).method, 'POST');
    });
    await t.test('real adapter default fetch sends and decodes one search request', async () => {
      const result = await invoke('/search'); assert.equal(result.ok, true);
      assert.equal(result.result.Code, 0); assert.equal(result.result.Data.Items.length, 1);
      assert.equal(outbound.length, 2); assert.equal(outbound.at(-1).method, 'GET');
    });
    await t.test('aborted requests still stop before outbound traffic', async () => {
      assert.deepEqual(await invoke('/aborted'), { ok: false, name: 'ZhihuHttpError', code: 'aborted' });
      assert.equal(outbound.length, 2);
    });
    for (const status of [301, 302, 303, 307, 308]) {
      await t.test(`HTTP ${status} never follows Location or resends credentials`, async () => {
        redirectStatus = status;
        for (const path of ['/model', '/search']) {
          const before = outbound.length;
          assert.deepEqual(await invoke(path), { ok: false, name: 'ZhihuHttpError', code: 'http_error' });
          assert.equal(outbound.length, before + 1, 'Exactly one request; no redirect or retry');
          assert.equal(outbound.at(-1).origin, 'https://developer.zhihu.com');
        }
      });
    }
    assert.equal(outbound.length, 12);
  } finally { await mf.dispose(); }
});
