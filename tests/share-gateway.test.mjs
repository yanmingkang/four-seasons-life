import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createShareGateway } from '../server/share-gateway.mjs';
import { CINEMATIC_MANIFEST } from '../src/cinematic-manifest.js';

const passcode = 'test-only-passcode-9824';
const host = 'play.example.test';
const origin = `https://${host}`;

async function fixture(t, options = {}, responder) {
  const requests = [];
  const upstream = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      requests.push({ url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() });
      if (responder) return responder(req, res);
      res.writeHead(200, { 'Content-Type': req.url.startsWith('/api/') ? 'application/json' : 'text/plain', 'Set-Cookie': 'PRIVATE_UPSTREAM_COOKIE=must-not-escape', 'Cache-Control': 'public', 'X-Private-Upstream': 'must-not-escape' });
      res.end(req.url.startsWith('/api/') ? '{"mode":"fallback","text":"safe test response"}' : 'production asset');
    });
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const gateway = createShareGateway({ passcode, upstream: `http://127.0.0.1:${upstream.address().port}`, publicHost: host, ...options,
    renderLogin: options.renderLogin || (({ error }) => `<html><body><form method="post" action="/__share/login"><input name="code" type="password"></form><p>${error}</p></body></html>`) });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  t.after(async () => {
    gateway.closeAllConnections(); upstream.closeAllConnections();
    await Promise.all([new Promise(resolve => gateway.close(resolve)), new Promise(resolve => upstream.close(resolve))]);
  });
  const port = gateway.address().port;
  const request = (pathname, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method, headers: { host, ...headers }, agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString(), bytes: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject); req.end(body);
  });
  const login = (code = passcode, ip = '203.0.113.11') => request('/__share/login', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': ip }, body: new URLSearchParams({ code }).toString() });
  const token = async (ip) => {
    const response = await login(passcode, ip); assert.equal(response.status, 303);
    return response.headers['set-cookie'][0].split(';')[0];
  };
  return { request, login, token, requests, port };
}

test('gateway rejects development and non-loopback upstream configuration', () => {
  for (const upstream of ['http://127.0.0.1:4173', 'http://example.com:4174', 'https://127.0.0.1:4174', 'http://127.0.0.1:4174/src/', 'http://u:p@127.0.0.1:4174']) {
    assert.throws(() => createShareGateway({ passcode, upstream }));
  }
  assert.throws(() => createShareGateway({ passcode: 'tiny' }));
  assert.throws(() => createShareGateway({ passcode, publicHost: 'https://wrong.example/' }));
});

test('exact first-edition art files require authentication while source documents and unknown files stay private',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/art/first-edition/image1.jpeg')).status,303);
  const cookie=await f.token();
  for(const file of ['image1.jpeg','image17.png','image55.png'])assert.equal((await f.request(`/art/first-edition/${file}`,{headers:{cookie}})).status,200);
  for(const file of ['image56.png','README.md','初版.docx','image1.png','.env'])assert.equal((await f.request(`/art/first-edition/${encodeURIComponent(file)}`,{headers:{cookie}})).status,404);
});

test('external boot script keeps authentication and strict CSP, without opening other root files', async t => {
  const f=await fixture(t);
  assert.equal((await f.request('/boot-watchdog.js')).status,303);
  const cookie=await f.token();
  const response=await f.request('/boot-watchdog.js',{headers:{cookie}});
  assert.equal(response.status,200);
  assert.match(response.headers['content-security-policy'],/script-src 'self';/);
  assert.doesNotMatch(response.headers['content-security-policy'],/script-src[^;]*unsafe-inline/);
  for(const pathname of ['/boot-watchdog.js.map','/boot-other.js','/config.json','/package.json'])assert.equal((await f.request(pathname,{headers:{cookie}})).status,404);
});

test('anonymous API is 401, document/assets including HEAD redirect, and login has no upstream access', async t => {
  const f = await fixture(t);
  for (const [path, method] of [['/', 'GET'], ['/assets/index-a.js', 'GET'], ['/models/city/building_A.gltf', 'HEAD']]) {
    const result = await f.request(path, { method }); assert.equal(result.status, 303); assert.equal(result.headers.location, '/__share/login');
  }
  assert.equal((await f.request('/api/health')).status, 401);
  assert.equal((await f.request('/api/narrate', { method: 'POST', body: '{}' })).status, 401);
  const login = await f.request('/__share/login');
  assert.equal(login.status, 200); assert.match(login.body, /name="code"/);
  assert.equal(login.headers['cache-control'], 'no-store');
  assert.equal(login.headers['referrer-policy'], 'same-origin');
  assert.equal(f.requests.length, 0);
});

test('opaque secure cookies work, forged sessions fail, logout revokes the token', async t => {
  const f = await fixture(t);
  const loggedIn = await f.login();
  assert.equal(loggedIn.status, 303); assert.equal(loggedIn.headers.location, '/');
  const setCookie = loggedIn.headers['set-cookie'][0];
  assert.match(setCookie, /^__Host-four_seasons_share=[A-Za-z0-9_-]{43};/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=43200']) assert.ok(setCookie.includes(flag));
  assert.doesNotMatch(setCookie, /Domain=/);
  const cookie = setCookie.split(';')[0];
  assert.equal((await f.request('/api/health', { headers: { cookie } })).status, 200);
  assert.equal((await f.request('/api/health', { headers: { cookie: '__Host-four_seasons_share=' + 'x'.repeat(43) } })).status, 401);
  assert.equal((await f.request('/api/health', { headers: { cookie: `${cookie}; ${cookie}` } })).status, 401);
  const logout = await f.request('/__share/logout', { method: 'POST', headers: { cookie, origin } });
  assert.equal(logout.status, 303); assert.match(logout.headers['set-cookie'][0], /Max-Age=0/);
  assert.equal((await f.request('/api/health', { headers: { cookie } })).status, 401);
});

test('login failure limit is per trusted proxy IP and global attempts are bounded', async t => {
  let clock = 1000;
  const f = await fixture(t, { now: () => clock, limits: { loginFailures: 2, loginGlobal: 4, loginWindowMs: 1000 } });
  assert.equal((await f.login('wrong-code')).status, 401);
  assert.equal((await f.login('wrong-code')).status, 401);
  assert.equal((await f.login()).status, 429);
  assert.equal((await f.login('wrong-code', '203.0.113.12')).status, 401);
  assert.equal((await f.login('wrong-code', '203.0.113.13')).status, 401);
  assert.equal((await f.login(passcode, '203.0.113.14')).status, 429);
  clock += 1001;
  assert.equal((await f.login()).status, 303);
  assert.equal(f.requests.length, 0);
});

test('parallel login requests cannot race past the per-IP attempt budget', async t => {
  const f = await fixture(t, { limits: { loginFailures: 2 } });
  const results = await Promise.all(Array.from({ length: 8 }, () => f.login('wrong-test-code')));
  assert.equal(results.filter(result => result.status === 401).length, 2);
  assert.equal(results.filter(result => result.status === 429).length, 6);
  assert.equal(f.requests.length, 0);
});

test('CSRF, hostile Host, cross-site fetch and unexpected form fields are rejected', async t => {
  const f = await fixture(t), cookie = await f.token();
  for (const headers of [{ cookie, origin: 'https://evil.test' }, { cookie, origin: 'null' }, { cookie }, { cookie, origin, 'sec-fetch-site': 'cross-site' }, { cookie, origin, host: 'evil.test' }]) {
    assert.equal((await f.request('/api/narrate', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' })).status, 403);
  }
  assert.equal((await f.request('/__share/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'null' }, body: `code=${passcode}` })).status, 403);
  for (const body of [`code=${passcode}&extra=x`, `code=${passcode}&code=${passcode}`]) {
    assert.equal((await f.request('/__share/login', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body })).status, 400);
  }
  assert.equal(f.requests.length, 0);
});

test('cross-site top-level entry navigations work but cross-site API, assets and forms stay blocked', async t => {
  const f = await fixture(t);
  const navigation = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
  const entry = await f.request('/', { headers: navigation });
  assert.equal(entry.status, 303); assert.equal(entry.headers.location, '/__share/login');
  assert.equal((await f.request(entry.headers.location, { headers: navigation })).status, 200);
  const cookie = await f.token();
  for (const pathname of ['/api/health', '/assets/index-a.js']) assert.equal((await f.request(pathname, { headers: { cookie, ...navigation } })).status, 403);
  assert.equal((await f.request('/', { headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' } })).status, 403);
  assert.equal((await f.request('/__share/login', { method: 'POST', headers: { origin, ...navigation, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: passcode }).toString() })).status, 403);
  assert.equal(f.requests.length, 0);
});

test('allowlist rejects source, dot paths, encoded traversal, slash and sourcemaps before proxying', async t => {
  const f = await fixture(t), cookie = await f.token();
  for (const target of ['/src/main.js', '/.env', '/server.mjs', '/api/unknown', '/assets/../server.mjs', '/assets/./index.js', '/assets/%2e%2e/server.mjs', '/models%2fcity/building_A.gltf', '/assets/%252e%252e/server.mjs', '/assets\\index.js', '/assets/index.js.map', '/assets/source.map', '//assets/index.js', 'http://evil.test/']) {
    assert.equal((await f.request(target, { headers: { cookie } })).status, 404, target);
  }
  assert.equal(f.requests.length, 0);
  for (const target of ['/', '/assets/index-ab12.js', '/models/city/building_A.gltf', '/models/nature/tree_oak.glb', '/characters/wave.gif']) {
    assert.equal((await f.request(target, { headers: { cookie } })).status, 200, target);
  }
});

test('all eight legacy cinematic clips and optional covers require login for both GET and HEAD', async t => {
  const f = await fixture(t);
  for (const cell of ['06','11','13','15','18','22','27','31']) {
    for (const extension of ['mp4','webm','jpg','webp']) {
      for (const method of ['GET','HEAD']) {
        const target = `/cinematics/cell-${cell}.${extension}`;
        const result = await f.request(target, { method });
        assert.equal(result.status,303,`${method} ${target}`);
        assert.equal(result.headers.location,'/__share/login');
      }
    }
  }
  assert.equal(f.requests.length,0);
});

for (const atlas of ['season-trees-v2.png', 'life-landmarks-v1.png']) {
test(`the shipped ${atlas} atlas requires login for GET and HEAD`, async t => {
  const f = await fixture(t);
  for (const method of ['GET', 'HEAD']) {
    for (const headers of [{}, { cookie: '__Host-four_seasons_share=' + 'x'.repeat(43) }]) {
      const result = await f.request(`/art/${atlas}`, { method, headers });
      assert.equal(result.status, 303);
      assert.equal(result.headers.location, '/__share/login');
      if (method === 'HEAD') assert.equal(result.bytes.length, 0);
    }
  }
  assert.equal(f.requests.length, 0);
});

test(`authenticated ${atlas} preserves PNG bytes and MIME for GET and bodyless HEAD without leaking credentials`, async t => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1sAAAAASUVORK5CYII=', 'base64');
  const f = await fixture(t, {}, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Set-Cookie': 'PRIVATE_ART_COOKIE=must-not-escape' });
    res.end(png);
  });
  const cookie = await f.token();
  for (const method of ['GET', 'HEAD']) {
    const result = await f.request(`/art/${atlas}`, { method, headers: {
      cookie, authorization: 'Bearer TEST_ONLY_ART_SENTINEL', 'cf-connecting-ip': '203.0.113.44', 'x-forwarded-for': '203.0.113.99',
    } });
    assert.equal(result.status, 200);
    assert.equal(result.headers['content-type'], 'image/png');
    assert.equal(Number(result.headers['content-length']), png.length);
    assert.deepEqual(result.bytes, method === 'HEAD' ? Buffer.alloc(0) : png);
    assert.equal(result.headers['set-cookie'], undefined);
    assert.equal(result.headers['cache-control'], 'no-store');
    assert.equal(result.headers['x-content-type-options'], 'nosniff');
    assert.equal(f.requests.at(-1).url, `/art/${atlas}`);
    assert.equal(f.requests.at(-1).method, method);
    for (const name of ['cookie', 'authorization', 'cf-connecting-ip', 'x-forwarded-for']) assert.equal(f.requests.at(-1).headers[name], undefined);
  }
  const chunked = await f.request(`/art/${atlas}`, { headers: { cookie, 'transfer-encoding': 'chunked' } });
  assert.equal(chunked.status, 200); assert.deepEqual(chunked.bytes, png);
  assert.equal(f.requests.at(-1).headers['transfer-encoding'], undefined);
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await f.request(`/art/${atlas}`, { method, headers: { cookie, origin } })).status, 405);
  assert.equal(f.requests.length, 3);
});
}

test('unknown art, README, altered atlas names and traversal are rejected before proxying', async t => {
  const f = await fixture(t), cookie = await f.token();
  for (const target of [
    '/art/', '/art/README.md', '/art/README.MD', '/art/season-trees.png', '/art/season-trees-v1.png',
    '/art/season-trees-v2.webp', '/art/season-trees-v2.PNG', '/art/Season-trees-v2.png',
    '/art/season-trees-v2.png.js', '/art/season-trees-v2.png.map', '/art/season-trees-v2.png/extra',
    '/art/sub/season-trees-v2.png', '/art/.env', '/art/../server.mjs', '/art/./season-trees-v2.png',
    '/art/%2e%2e/server.mjs', '/art/%252e%252e/server.mjs', '/art%2fseason-trees-v2.png',
    '/art//season-trees-v2.png', '/art\\season-trees-v2.png',
    '/art/life-landmarks.png', '/art/life-landmarks-v2.png', '/art/life-landmarks-v1.webp',
    '/art/life-landmarks-v1.PNG', '/art/Life-landmarks-v1.png', '/ART/life-landmarks-v1.png',
    '/art/life-landmarks-v1.png.js', '/art/life-landmarks-v1.png.map', '/art/life-landmarks-v1.png/extra',
    '/art/life-landmarks-v1.png;extra', '/art/life-landmarks-v1.png.', '/art/sub/life-landmarks-v1.png',
    '/art/./life-landmarks-v1.png', '/art/../art/life-landmarks-v1.png',
    '/art/%6cife-landmarks-v1.png', '/art/life-landmarks-v1%2epng',
    '/art%2flife-landmarks-v1.png', '/art//life-landmarks-v1.png', '/art\\life-landmarks-v1.png',
  ]) {
    for (const headers of [{}, { cookie }]) for (const method of ['GET', 'HEAD']) {
      assert.equal((await f.request(target, { headers, method })).status, 404, `${method} ${target}`);
    }
  }
  assert.equal(f.requests.length, 0);
});

test('life-landmark atlas keeps the existing static timeout and response-size bounds', async t => {
  const stalled = await fixture(t, { limits: { staticTimeoutMs: 25 } }, () => {});
  const timedOut = await stalled.request('/art/life-landmarks-v1.png', { headers: { cookie: await stalled.token() } });
  assert.equal(timedOut.status, 504);
  assert.doesNotMatch(timedOut.body, /127\.0\.0\.1|passcode|Error:|\.mjs/);
  const oversized = await fixture(t, { limits: { staticResponseBytes: 16 } }, (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': '17' });
    res.end(Buffer.alloc(17));
  });
  assert.equal((await oversized.request('/art/life-landmarks-v1.png', { headers: { cookie: await oversized.token() } })).status, 502);
});

test('authenticated legacy cinematic paths and cover formats remain compatible without forwarding credentials', async t => {
  const types = {mp4:'video/mp4',webm:'video/webm',jpg:'image/jpeg',webp:'image/webp'};
  const f = await fixture(t, {}, (req,res) => {
    const extension = req.url.split('.').at(-1);
    res.writeHead(200,{'Content-Type':types[extension],'Set-Cookie':'PRIVATE_MEDIA_COOKIE=must-not-escape','X-Private-Upstream':'must-not-escape'});
    res.end('local media fixture');
  });
  const cookie = await f.token();
  for (const cell of ['06','11','13','15','18','22','27','31']) {
    for (const extension of Object.keys(types)) {
      const target = `/cinematics/cell-${cell}.${extension}`;
      const result = await f.request(target,{headers:{cookie,authorization:'Bearer TEST_ONLY_MEDIA_SENTINEL','cf-connecting-ip':'203.0.113.44','x-forwarded-for':'203.0.113.99'}});
      assert.equal(result.status,200,target);assert.equal(result.body,'local media fixture');
      assert.equal(result.headers['content-type'],types[extension]);
      assert.equal(result.headers['set-cookie'],undefined);assert.equal(result.headers['x-private-upstream'],undefined);
      assert.equal(result.headers['cache-control'],'no-store');assert.equal(result.headers['x-content-type-options'],'nosniff');
      assert.match(result.headers['content-security-policy'],/media-src 'self' blob:;/);
      assert.match(result.headers['content-security-policy'],/frame-ancestors 'none'/);
      for (const name of ['cookie','authorization','cf-connecting-ip','x-forwarded-for']) assert.equal(f.requests.at(-1).headers[name],undefined);
    }
  }
  const head = await f.request('/cinematics/cell-06.mp4',{method:'HEAD',headers:{cookie}});
  assert.equal(head.status,200);assert.equal(head.body,'');assert.equal(f.requests.length,33);
});

test('cinematic unknown names, README, source files, nested paths and traversal never reach upstream', async t => {
  const f = await fixture(t),cookie = await f.token();
  const denied = [
    '/cinematics/','/cinematics/README.md','/cinematics/README.MD','/cinematics/cinematic-manifest.js',
    '/cinematics/cell-08.mp4','/cinematics/cell-40.mp4','/cinematics/cell-6.mp4','/cinematics/Cell-06.mp4',
    '/cinematics/cell-06.MP4','/cinematics/cell-06.png','/cinematics/cell-06.jpeg','/cinematics/cell-06.gif',
    '/cinematics/cell-06.mp4.js','/cinematics/cell-06.mp4.map','/cinematics/cell-06.mp4/extra',
    '/cinematics/sub/cell-06.mp4','/cinematics/.env','/cinematics/../server.mjs',
    '/cinematics/./cell-06.mp4','/cinematics/%2e%2e/server.mjs','/cinematics/%252e%252e/server.mjs',
    '/cinematics%2fcell-06.mp4','/cinematics//cell-06.mp4','/cinematics\\cell-06.mp4',
  ];
  for (const target of denied) {
    assert.equal((await f.request(target,{headers:{cookie}})).status,404,target);
    assert.equal((await f.request(target)).status,404,`anonymous ${target}`);
  }
  assert.equal(f.requests.length,0);
});

test('cinematic Range requests remain bounded full responses and unsupported methods remain blocked', async t => {
  const body='small local clip';
  const f = await fixture(t, {}, (_req,res) => {
    res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':Buffer.byteLength(body),'Accept-Ranges':'bytes'});res.end(body);
  });
  const cookie=await f.token();
  const result=await f.request('/cinematics/cell-06.mp4',{headers:{cookie,range:'bytes=1-3','if-range':'test-only-etag'}});
  assert.equal(result.status,200);assert.equal(result.body,body);
  assert.equal(Number(result.headers['content-length']),Buffer.byteLength(body));
  assert.equal(result.headers['content-range'],undefined);assert.equal(result.headers['accept-ranges'],undefined);
  assert.equal(f.requests[0].headers.range,undefined);assert.equal(f.requests[0].headers['if-range'],undefined);
  for(const method of ['POST','PUT','DELETE'])assert.equal((await f.request('/cinematics/cell-06.mp4',{method,headers:{cookie,origin}})).status,405);
  assert.equal(f.requests.length,1);
});

test('manifest films and posters require login, allow exact GET/HEAD paths and preserve full-response Range behavior', async t => {
  const body='manifest-only local media fixture';
  const f=await fixture(t,{},(req,res)=>{
    res.writeHead(200,{'Content-Type':req.url.endsWith('.mp4')?'video/mp4':'image/jpeg','Content-Length':Buffer.byteLength(body)});res.end(body);
  });
  const paths=CINEMATIC_MANIFEST.flatMap(item=>[item.src,item.poster]);assert.equal(new Set(paths).size,16);
  for(const target of paths)for(const method of ['GET','HEAD']){
    const response=await f.request(target,{method});assert.equal(response.status,303,target);assert.equal(response.headers.location,'/__share/login');
  }
  assert.equal(f.requests.length,0,'Anonymous users never reach the media upstream');
  const cookie=await f.token();
  for(const target of paths){
    const result=await f.request(target,{headers:{cookie}});assert.equal(result.status,200,target);assert.equal(result.body,body);
    assert.equal(result.headers['content-type'],target.endsWith('.mp4')?'video/mp4':'image/jpeg');
    const head=await f.request(target,{method:'HEAD',headers:{cookie}});assert.equal(head.status,200,target);assert.equal(head.body,'');
    for(const name of ['cookie','authorization'])assert.equal(f.requests.at(-1).headers[name],undefined);
  }
  for(const item of CINEMATIC_MANIFEST.filter(item=>[8,31].includes(item.cell))){
    const result=await f.request(item.src,{headers:{cookie,range:'bytes=0-127'}});
    assert.equal(result.status,200);assert.equal(result.body,body);assert.equal(result.headers['content-range'],undefined);
    assert.equal(f.requests.at(-1).headers.range,undefined,'Gateway keeps its documented bounded full-response policy');
  }
  const count=f.requests.length;
  for(const target of [
    '/cinematics/team-20260912/README.md','/cinematics/team-20260912/media.json','/cinematics/team-20260912/cell-13.mp4',
    '/cinematics/team-20260912-repaired-20260913/','/cinematics/team-20260912-repaired-20260913/README.md',
    '/cinematics/team-20260912-repaired-20260913/media.json','/cinematics/team-20260912-repaired-20260913/cell-06.mp4',
    '/cinematics/team-20260912-repaired-20260913/cell-08.mp4.map','/cinematics/team-20260912-repaired-20260913/cell-08.mp4/extra',
  ])assert.equal((await f.request(target,{headers:{cookie}})).status,404,target);
  assert.equal(f.requests.length,count,'Only exact manifest files reach upstream, never directories, reports or unknown films');
});

test('upstream headers contain no session, authentication, Cloudflare or forwarded identity', async t => {
  const f = await fixture(t), cookie = await f.token();
  const body = '{"kind":"summary","game":{"version":2}}';
  const response = await f.request('/api/narrate', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json', authorization: 'Bearer TEST_ONLY_SENTINEL', 'cf-connecting-ip': '203.0.113.44', 'x-forwarded-for': '203.0.113.99', forwarded: 'for=203.0.113.98' }, body });
  assert.equal(response.status, 200);
  const received = f.requests[0];
  for (const field of ['cookie', 'authorization', 'origin', 'cf-connecting-ip', 'x-forwarded-for', 'forwarded']) assert.equal(received.headers[field], undefined);
  assert.match(received.headers.host, /^127\.0\.0\.1:/); assert.equal(received.body, body);
  assert.equal(response.headers['set-cookie'], undefined); assert.equal(response.headers['x-private-upstream'], undefined);
  assert.equal(response.headers['cache-control'], 'no-store'); assert.equal(response.headers['referrer-policy'], 'no-referrer');
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.match(response.headers['content-security-policy'], /script-src 'self';/);
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.doesNotMatch(response.headers['content-security-policy'], /unsafe-eval|script-src[^;]*unsafe-inline/);
});

test('session expiration and bounded session storage invalidate old tokens', async t => {
  let clock = 1000;
  const f = await fixture(t, { now: () => clock, limits: { maxSessions: 1, sessionTtlMs: 2000 } });
  const first = await f.token(), second = await f.token('203.0.113.12');
  assert.equal((await f.request('/api/health', { headers: { cookie: first } })).status, 401);
  assert.equal((await f.request('/api/health', { headers: { cookie: second } })).status, 200);
  clock += 2001;
  assert.equal((await f.request('/api/health', { headers: { cookie: second } })).status, 401);
});

test('API session and global limits stop requests before upstream and reset with time', async t => {
  let clock = 1000;
  const f = await fixture(t, { now: () => clock, limits: { apiSession: 1, apiGlobal: 2, apiWindowMs: 1000 } });
  const one = await f.token(), two = await f.token('203.0.113.12'), three = await f.token('203.0.113.13');
  assert.equal((await f.request('/api/health', { headers: { cookie: one } })).status, 200);
  assert.equal((await f.request('/api/health', { headers: { cookie: one } })).status, 429);
  assert.equal((await f.request('/api/health', { headers: { cookie: two } })).status, 200);
  assert.equal((await f.request('/api/health', { headers: { cookie: three } })).status, 429);
  assert.equal(f.requests.length, 2);
  clock += 1001;
  assert.equal((await f.request('/api/health', { headers: { cookie: one } })).status, 200);
});

test('API IP limits survive session rotation and the daily request ceiling survives minute resets', async t => {
  let clock = 1000;
  const f = await fixture(t, { now: () => clock, limits: { apiIp: 1, apiDailyGlobal: 2, apiWindowMs: 1000 } });
  const one = await f.token(), two = await f.token();
  assert.equal((await f.request('/api/health', { headers: { cookie: one, 'cf-connecting-ip': '203.0.113.20' } })).status, 200);
  assert.equal((await f.request('/api/health', { headers: { cookie: two, 'cf-connecting-ip': '203.0.113.20' } })).status, 429);
  assert.equal((await f.request('/api/health', { headers: { cookie: two, 'cf-connecting-ip': '203.0.113.21' } })).status, 200);
  clock += 1001;
  assert.equal((await f.request('/api/health', { headers: { cookie: one, 'cf-connecting-ip': '203.0.113.20' } })).status, 429);
  assert.equal(f.requests.length, 2);
});

test('body limits, blocked methods and proxy timeouts fail without leaking internal details', async t => {
  const f = await fixture(t, { limits: { bodyBytes: 24, loginBodyBytes: 128, apiTimeoutMs: 25 } }, (_req, _res) => {});
  const cookie = await f.token();
  assert.equal((await f.request('/__share/login', { method: 'POST', headers: { origin, 'content-type': 'application/x-www-form-urlencoded' }, body: 'code=' + 'x'.repeat(129) })).status, 413);
  assert.equal((await f.request('/api/narrate', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: 'x'.repeat(25) })).status, 413);
  assert.equal((await f.request('/assets/index.js', { method: 'POST', headers: { cookie, origin }, body: '{}' })).status, 405);
  const timedOut = await f.request('/api/narrate', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(timedOut.status, 504);
  assert.doesNotMatch(timedOut.body, /127\.0\.0\.1|4174|passcode|Error:|\.mjs/);
});

test('empty chunked GET and HEAD bodies survive proxy conversion but any actual bytes are rejected', async t => {
  const f = await fixture(t), cookie = await f.token();
  const headers = { cookie, 'transfer-encoding': 'chunked' };
  for (const [pathname, method] of [['/models/nature/flower_redA.glb', 'GET'], ['/models/nature/tree_oak.glb', 'HEAD'], ['/models/city/firehydrant.bin', 'GET'], ['/api/health', 'GET']]) {
    assert.equal((await f.request(pathname, { method, headers })).status, 200, `${method} ${pathname}`);
    assert.equal(f.requests.at(-1).body, '');
    assert.equal(f.requests.at(-1).headers['transfer-encoding'], undefined);
  }
  const allowedRequests = f.requests.length;
  for (const [pathname, method] of [['/models/nature/tree_oak.glb', 'GET'], ['/models/nature/tree_oak.glb', 'HEAD'], ['/api/health', 'GET']]) {
    assert.equal((await f.request(pathname, { method, headers, body: 'x' })).status, 400);
    assert.equal((await f.request(pathname, { method, headers: { cookie, 'content-length': '1' }, body: 'x' })).status, 400);
  }
  assert.equal(f.requests.length, allowedRequests);
});

test('chunked bodyless requests cannot hold an API slot indefinitely', async t => {
  const f = await fixture(t, { limits: { bodyTimeoutMs: 30, maxConcurrentApi: 1 } }), cookie = await f.token();
  let client;
  const result = new Promise((resolve, reject) => {
    client = http.request({ hostname: '127.0.0.1', port: f.port, path: '/api/health', method: 'GET', agent: false,
      headers: { host, cookie, 'transfer-encoding': 'chunked' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    client.on('error', reject); client.flushHeaders();
  });
  t.after(() => client.destroy());
  assert.equal(await result, 408); assert.equal(f.requests.length, 0);
  assert.equal((await f.request('/api/health', { headers: { cookie } })).status, 200);
});

test('only two API requests reach upstream concurrently, and slots are released', async t => {
  const pending = [];
  const f = await fixture(t, { limits: { apiTimeoutMs: 1000 } }, (_req, res) => pending.push(res));
  const cookie = await f.token();
  const first = f.request('/api/health', { headers: { cookie } }), second = f.request('/api/health', { headers: { cookie } });
  for (let attempts = 0; pending.length < 2 && attempts < 50; attempts++) await delay(5);
  assert.equal(pending.length, 2);
  assert.equal((await f.request('/api/health', { headers: { cookie } })).status, 429);
  pending.forEach(res => { res.writeHead(200); res.end('ok'); });
  assert.equal((await first).status, 200); assert.equal((await second).status, 200);
  const third = f.request('/api/health', { headers: { cookie } });
  for (let attempts = 0; pending.length < 3 && attempts < 50; attempts++) await delay(5);
  pending[2].end('ok'); assert.equal((await third).status, 200);
});

test('API concurrency is reserved before slow POST bodies finish, and stalled bodies time out', async t => {
  const f = await fixture(t, { limits: { bodyTimeoutMs: 150 } }), cookie = await f.token();
  const startSlow = () => {
    let client;
    const result = new Promise((resolve, reject) => {
      client = http.request({ hostname: '127.0.0.1', port: f.port, path: '/api/narrate', method: 'POST', agent: false,
        headers: { host, origin, cookie, 'content-type': 'application/json', 'content-length': '2' } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      client.on('error', reject); client.write('{');
    });
    t.after(() => client.destroy());
    return { client, result };
  };
  const one = startSlow(), two = startSlow();
  await delay(20);
  assert.equal((await f.request('/api/health', { headers: { cookie } })).status, 429);
  assert.equal(f.requests.length, 0);
  one.client.end('}'); two.client.end('}');
  assert.equal(await one.result, 200); assert.equal(await two.result, 200);
  const stalled = startSlow();
  assert.equal(await stalled.result, 408);
  assert.equal((await f.request('/api/health', { headers: { cookie } })).status, 200);
});

test('authenticated HTML retains same-origin referrers while static files do not', async t => {
  const f = await fixture(t, {}, (req, res) => { res.writeHead(200, { 'Content-Type': req.url === '/' ? 'text/html; charset=utf-8' : 'text/javascript' }); res.end('fixture'); });
  const cookie = await f.token();
  assert.equal((await f.request('/', { headers: { cookie } })).headers['referrer-policy'], 'same-origin');
  assert.equal((await f.request('/assets/index-a.js', { headers: { cookie } })).headers['referrer-policy'], 'no-referrer');
});

test('real Chrome logs in and sends a same-origin JSON POST through the gateway', { skip: process.env.RUN_SHARE_BROWSER !== '1' }, async t => {
  const { createRequire } = await import('node:module');
  const { renderLogin } = await import('../server/share-login.mjs');
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'C:/Users/25293/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const f = await fixture(t, { secureCookies: false, publicHost: undefined, renderLogin }, (req, res) => {
    res.writeHead(req.url === '/api/narrate' ? 400 : 200, { 'Content-Type': req.url === '/' ? 'text/html; charset=utf-8' : 'application/json' });
    res.end(req.url === '/' ? '<!doctype html><title>Authenticated fixture</title><h1>Fixture game</h1>' : '{"error":"invalid mock game"}');
  });
  const localOrigin = `http://127.0.0.1:${f.port}`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true }); t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`${localOrigin}/`);
  await page.locator('input[name="code"]').fill(passcode);
  await Promise.all([page.waitForURL(`${localOrigin}/`), page.locator('button[type="submit"]').click()]);
  const outgoing = page.waitForRequest(request => request.url() === `${localOrigin}/api/narrate`);
  const result = await page.evaluate(async () => {
    const response = await fetch('/api/narrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid json' });
    return { status: response.status, body: await response.text() };
  });
  assert.equal((await (await outgoing).allHeaders()).origin, localOrigin);
  assert.equal(result.status, 400); assert.match(result.body, /invalid mock game/);
  assert.equal(f.requests.at(-1).url, '/api/narrate');
  assert.equal(f.requests.at(-1).headers.origin, undefined);
});

test('upstream redirects and WebSocket upgrades are never forwarded to the browser', async t => {
  const f = await fixture(t, {}, (_req, res) => { res.writeHead(302, { Location: 'http://127.0.0.1:4174/private' }); res.end(); });
  const cookie = await f.token();
  const response = await f.request('/', { headers: { cookie } });
  assert.equal(response.status, 502); assert.equal(response.headers.location, undefined);
  const upgrade = await f.request('/', { headers: { cookie, connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' } });
  assert.equal(upgrade.status, 403); assert.equal(f.requests.length, 1);
});

test('practice requires the share session and allows only the exact POST path', async t => {
  const f=await fixture(t);
  for(const method of ['GET','POST'])assert.equal((await f.request('/api/practice',{method,body:method==='POST'?'{}':undefined})).status,401);
  const cookie=await f.token(),headers={cookie,origin,'content-type':'application/json'};
  for(const method of ['GET','HEAD','PUT','PATCH','DELETE','OPTIONS'])assert.equal((await f.request('/api/practice',{method,headers})).status,405,method);
  for(const pathname of ['/api/practice/','/api/practice/extra','/api/practice.json','/api/practices','/api/Practice','/api/practice%2f','/api/%70ractice','/api//practice','/api/../api/practice','/api/practice;extra']){
    assert.equal((await f.request(pathname,{method:'POST',headers,body:'{}'})).status,404,pathname);
  }
  assert.equal(f.requests.length,0);
  const body=JSON.stringify({game:{version:4},clientId:'b214f5d9-4c1c-4704-a7ab-e8be46ce43d6',sessionId:'test-only-session',turn:2,message:'我先核对沟通记录，再确认下一步。'});
  const response=await f.request('/api/practice',{method:'POST',headers:{...headers,authorization:'Bearer TEST_ONLY_PRACTICE_SENTINEL','cf-connecting-ip':'203.0.113.44','x-forwarded-for':'203.0.113.99',forwarded:'for=203.0.113.98','x-oauth-token':'TEST_ONLY_OAUTH_SENTINEL'},body});
  assert.equal(response.status,200);assert.equal(f.requests.length,1);
  assert.equal(f.requests[0].url,'/api/practice');assert.equal(f.requests[0].method,'POST');assert.equal(f.requests[0].body,body);
  for(const field of ['cookie','authorization','origin','cf-connecting-ip','x-forwarded-for','forwarded','x-oauth-token'])assert.equal(f.requests[0].headers[field],undefined,field);
  assert.equal(f.requests[0].headers['content-type'],'application/json');assert.match(f.requests[0].headers.host,/^127\.0\.0\.1:/);
  assert.equal(response.headers['set-cookie'],undefined);assert.equal(response.headers['x-private-upstream'],undefined);assert.equal(response.headers['cache-control'],'no-store');
});

test('practice keeps strict same-origin, content-type and body bounds before forwarding', async t => {
  const f=await fixture(t,{limits:{bodyBytes:64}}),cookie=await f.token();
  for(const headers of [{cookie},{cookie,origin:'null'},{cookie,origin:'https://evil.test'},{cookie,origin,'sec-fetch-site':'cross-site'},{cookie,origin,host:'evil.test'}]){
    assert.equal((await f.request('/api/practice',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'})).status,403);
  }
  assert.equal((await f.request('/api/practice',{method:'POST',headers:{cookie,origin,'content-type':'text/plain'},body:'{}'})).status,415);
  const large=await f.request('/api/practice',{method:'POST',headers:{cookie,origin,'content-type':'application/json','content-length':'65'},body:'x'.repeat(65)});
  assert.equal(large.status,413);assert.equal(f.requests.length,0);assert.doesNotMatch(large.body,/TEST_ONLY|passcode|127\.0\.0\.1|Error:|\.mjs/);
  assert.equal((await f.request('/api/practice',{method:'POST',headers:{cookie,origin,'content-type':'application/json; charset=utf-8'},body:'{}'})).status,200);
  assert.equal(f.requests.length,1);
});

test('practice consumes the same session, IP, global and daily budgets as narration', async t => {
  let clock=1000;
  const session=await fixture(t,{now:()=>clock,limits:{apiSession:2}}),cookie=await session.token();
  const headers={cookie,origin,'content-type':'application/json'};
  assert.equal((await session.request('/api/practice',{method:'POST',headers,body:'{}'})).status,200);
  assert.equal((await session.request('/api/narrate',{method:'POST',headers,body:'{}'})).status,200);
  assert.equal((await session.request('/api/practice',{method:'POST',headers,body:'{}'})).status,429);assert.equal(session.requests.length,2);
  const ip=await fixture(t,{limits:{apiIp:1}}),ipOne=await ip.token(),ipTwo=await ip.token();
  assert.equal((await ip.request('/api/practice',{method:'POST',headers:{cookie:ipOne,origin,'content-type':'application/json'},body:'{}'})).status,200);
  assert.equal((await ip.request('/api/narrate',{method:'POST',headers:{cookie:ipTwo,origin,'content-type':'application/json'},body:'{}'})).status,429);
  const global=await fixture(t,{now:()=>clock,limits:{apiGlobal:1,apiDailyGlobal:2,apiWindowMs:1000}}),one=await global.token(),two=await global.token();
  assert.equal((await global.request('/api/practice',{method:'POST',headers:{cookie:one,origin,'content-type':'application/json','cf-connecting-ip':'203.0.113.31'},body:'{}'})).status,200);
  assert.equal((await global.request('/api/narrate',{method:'POST',headers:{cookie:two,origin,'content-type':'application/json','cf-connecting-ip':'203.0.113.32'},body:'{}'})).status,429);
  clock+=1001;
  assert.equal((await global.request('/api/practice',{method:'POST',headers:{cookie:two,origin,'content-type':'application/json'},body:'{}'})).status,200);
  clock+=1001;
  assert.equal((await global.request('/api/practice',{method:'POST',headers:{cookie:one,origin,'content-type':'application/json'},body:'{}'})).status,429);assert.equal(global.requests.length,2);
});

test('practice shares concurrent API slots and releases them on completion', async t => {
  const pending=[];
  const f=await fixture(t,{limits:{apiTimeoutMs:1500}},(_req,res)=>pending.push(res)),cookie=await f.token(),headers={cookie,origin,'content-type':'application/json'};
  const one=f.request('/api/practice',{method:'POST',headers,body:'{}'}),two=f.request('/api/narrate',{method:'POST',headers,body:'{}'});
  for(let attempts=0;pending.length<2&&attempts<50;attempts++)await delay(5);
  assert.equal(pending.length,2);
  assert.equal((await f.request('/api/practice',{method:'POST',headers,body:'{}'})).status,429);
  pending.forEach(res=>res.end('{}'));assert.equal((await one).status,200);assert.equal((await two).status,200);
  const next=f.request('/api/practice',{method:'POST',headers,body:'{}'});
  for(let attempts=0;pending.length<3&&attempts<50;attempts++)await delay(5);
  pending[2].end('{}');assert.equal((await next).status,200);
});

test('practice retains bounded upstream timeout and response sizes',async t=>{
  const stalled=await fixture(t,{limits:{apiTimeoutMs:25}},()=>{}),cookie=await stalled.token();
  const timeout=await stalled.request('/api/practice',{method:'POST',headers:{cookie,origin,'content-type':'application/json'},body:'{}'});
  assert.equal(timeout.status,504);assert.doesNotMatch(timeout.body,/passcode|127\.0\.0\.1|Error:|\.mjs/);
  const large=await fixture(t,{limits:{apiResponseBytes:16}},(_req,res)=>{res.writeHead(200,{'Content-Type':'application/json','Content-Length':'17'});res.end('x'.repeat(17));});
  assert.equal((await large.request('/api/practice',{method:'POST',headers:{cookie:await large.token(),origin,'content-type':'application/json'},body:'{}'})).status,502);
});
