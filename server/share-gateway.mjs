import http from 'node:http';
import net from 'node:net';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {REFERENCE_IMAGES} from '../src/reference-art-manifest.js';
import {CINEMATIC_MANIFEST} from '../src/cinematic-manifest.js';

const digest = value => createHash('sha256').update(value).digest();
const loopback = address => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address);
const API_METHODS = new Map([['/api/health', 'GET'], ['/api/ai/status', 'GET'], ['/api/narrate', 'POST'], ['/api/experience', 'GET'], ['/api/practice', 'POST']]);
// Keep legacy exact paths for compatibility, plus only the current manifest's
// eight films and covers. Never expose delivery directories or internal notes.
const CINEMATIC_STATIC_PATHS = new Set([
  ...['06','11','13','15','18','22','27','31']
    .flatMap(cell => ['mp4','webm','jpg','webp'].map(extension => `/cinematics/cell-${cell}.${extension}`)),
  ...CINEMATIC_MANIFEST.flatMap(item=>[item.src,item.poster]),
]);
// Only the shipped atlases and the exact 55 in-game reference images. Do not
// expose the source DOCX, delivery notes, other artwork, or the whole directory.
const ART_STATIC_PATHS = new Set(['/art/season-trees-v2.png', '/art/life-landmarks-v1.png',...REFERENCE_IMAGES.map(image=>image.url)]);
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
};
const DEFAULT_LIMITS = {
  loginFailures: 5, loginWindowMs: 15 * 60 * 1000, loginGlobal: 80,
  apiSession: 30, apiIp: 45, apiGlobal: 60, apiWindowMs: 60 * 1000,
  apiDailyGlobal: 160, sessionTtlMs: 12 * 60 * 60 * 1000, maxSessions: 256,
  maxRateEntries: 2048, maxConcurrentApi: 2, bodyBytes: 8192, loginBodyBytes: 1024,
  bodyTimeoutMs: 15000, apiTimeoutMs: 50000, staticTimeoutMs: 30000, apiResponseBytes: 512 * 1024, staticResponseBytes: 24 * 1024 * 1024,
};

function normalizeHost(value, scheme) {
  if (typeof value !== 'string' || value.length > 255 || !/^[a-z\d.-]+(?::\d{1,5})?$/i.test(value)) return null;
  try {
    const url = new URL(`${scheme}://${value}`);
    if (!url.hostname || url.hostname.startsWith('.') || url.hostname.endsWith('.') || url.hostname.includes('..')) return null;
    return url.host.toLowerCase();
  } catch { return null; }
}

function safeTarget(raw) {
  if (typeof raw !== 'string' || raw.length > 2048 || !raw.startsWith('/') || raw.startsWith('//')) return null;
  const [pathname] = raw.split('?');
  // Validate before URL normalization can erase traversal segments. Production names
  // are ASCII; percent-encoded path components and backslashes are never necessary.
  if (/[\\%#\x00-\x20\x7f]/.test(pathname) || pathname.includes('//')) return null;
  if (/\.map$/i.test(pathname)) return null;
  if (pathname.split('/').some(segment => segment.startsWith('.'))) return null;
  const staticPath = pathname === '/' || pathname === '/boot-watchdog.js' || /^\/(?:assets|models|characters)\/[a-z\d_-]+(?:\/[a-z\d_-]+)*(?:\.[a-z\d_-]+)?$/i.test(pathname) || CINEMATIC_STATIC_PATHS.has(pathname) || ART_STATIC_PATHS.has(pathname);
  if (!staticPath && !API_METHODS.has(pathname) && !['/__share/login', '/__share/logout'].includes(pathname)) return null;
  return { pathname, path: raw, api: API_METHODS.has(pathname), staticPath };
}

async function readBody(req, maximum, timeout) {
  if (Number(req.headers['content-length']) > maximum) { req.resume(); throw Object.assign(new Error('body too large'), { status: 413 }); }
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    const finish = (error) => {
      clearTimeout(timer);
      req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onAbort);
      if (error) { req.resume(); reject(error); } else resolve(Buffer.concat(chunks));
    };
    const onData = chunk => { size += chunk.length; if (size > maximum) finish(Object.assign(new Error('body too large'), { status: 413 })); else chunks.push(chunk); };
    const onEnd = () => finish();
    const onError = () => finish(Object.assign(new Error('body interrupted'), { status: 400 }));
    const onAbort = () => onError();
    const timer = setTimeout(() => finish(Object.assign(new Error('body timed out'), { status: 408 })), timeout);
    req.on('data', onData); req.on('end', onEnd); req.on('error', onError); req.on('aborted', onAbort);
  });
}

export function createShareGateway({ passcode, upstream = 'http://127.0.0.1:4174', secureCookies = true, publicHost, now = Date.now, limits: overrides = {}, renderLogin: injectedLogin } = {}) {
  if (typeof passcode !== 'string' || passcode.length < 8 || passcode.length > 256) throw new Error('A share passcode of 8–256 characters is required.');
  const origin = new URL(upstream);
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.port === '4173' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('The upstream must be a fixed loopback production service, never development port 4173.');
  }
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  for (const value of Object.values(limits)) if (!Number.isFinite(value) || value <= 0) throw new Error('Invalid gateway limit.');
  const scheme = secureCookies ? 'https' : 'http';
  const fixedHost = publicHost ? normalizeHost(publicHost, scheme) : null;
  if (publicHost && !fixedHost) throw new Error('Invalid public share host.');
  const passcodeHash = digest(passcode);
  const cookieName = secureCookies ? '__Host-four_seasons_share' : 'four_seasons_share';
  const sessions = new Map(), rates = new Map();
  let activeApis = 0;
  const pageRenderer = injectedLogin ? Promise.resolve(injectedLogin) : import('./share-login.mjs').then(module => module.renderLogin);

  function hit(key, maximum, duration, consume = true) {
    let entry = rates.get(key);
    if (!entry || entry.expires <= now()) {
      if (!consume) return true;
      if (rates.size >= limits.maxRateEntries) for (const [id, value] of rates) if (value.expires <= now()) rates.delete(id);
      if (rates.size >= limits.maxRateEntries) return false;
      entry = { count: 0, expires: now() + duration }; rates.set(key, entry);
    }
    if (entry.count >= maximum) return false;
    if (consume) entry.count += 1;
    return true;
  }

  function sessionFor(req) {
    const pieces = String(req.headers.cookie || '').split(';').map(piece => piece.trim()).filter(piece => piece.startsWith(`${cookieName}=`));
    if (pieces.length !== 1) return null;
    const token = pieces[0].slice(cookieName.length + 1);
    if (!/^[a-z\d_-]{43}$/i.test(token)) return null;
    const key = digest(token).toString('hex'), session = sessions.get(key);
    if (!session || session.expires <= now()) { sessions.delete(key); return null; }
    return { key, ...session };
  }

  function cookie(token, lifetime) {
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(lifetime / 1000)}${secureCookies ? '; Secure' : ''}`;
  }

  function send(res, status, value, type = 'application/json; charset=utf-8') {
    if (res.headersSent || res.destroyed) return;
    res.writeHead(status, { 'Content-Type': type });
    res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
  }
  const redirect = (res, destination) => { res.writeHead(303, { Location: destination }); res.end(); };
  const reject = (res, status) => send(res, status, { error: status === 429 ? '请求过于频繁，请稍后再试。' : '请求暂时无法处理。' });

  function proxy(req, res, target, body) {
    return new Promise(resolve => {
      let settled = false, timer, upstreamResponse;
      const done = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
      const headers = { accept: target.api ? 'application/json' : '*/*' };
      // Short cinematic files use the existing bounded full-response proxy.
      // Range and conditional headers are intentionally not forwarded: a Range
      // request receives the whole 200 response, not a misleading partial body.
      if (body) { headers['content-type'] = 'application/json'; headers['content-length'] = String(body.length); }
      // Build a fresh header set. Never send browser cookies, authorization, Cloudflare,
      // forwarding headers or the public Host to the private production process.
      const upstreamRequest = http.request({ hostname: '127.0.0.1', port: origin.port, path: target.path, method: req.method, headers, agent: false }, response => {
        upstreamResponse = response;
        const maximum = target.api ? limits.apiResponseBytes : limits.staticResponseBytes;
        if (response.statusCode >= 300 && response.statusCode < 400 || Number(response.headers['content-length']) > maximum) {
          response.destroy(); reject(res, 502); done(); return;
        }
        const allowed = {};
        for (const name of ['content-type', 'content-length', 'content-encoding']) if (response.headers[name] !== undefined) allowed[name] = response.headers[name];
        // Browsers need the same-origin policy on documents for same-origin POST
        // Origin headers. This still suppresses referrers to every external site.
        if (/^text\/html(?:;|$)/i.test(response.headers['content-type'] || '')) res.setHeader('Referrer-Policy', 'same-origin');
        res.writeHead(response.statusCode || 502, allowed);
        let bytes = 0;
        response.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maximum) { response.destroy(); res.destroy(); done(); }
        });
        response.on('error', () => { res.destroy(); done(); });
        response.on('end', done);
        response.pipe(res);
      });
      upstreamRequest.on('error', () => { if (!res.headersSent) reject(res, 502); else res.destroy(); done(); });
      timer = setTimeout(() => {
        if (!res.headersSent) reject(res, 504); else res.destroy();
        upstreamResponse?.destroy(); upstreamRequest.destroy(); done();
      }, target.api ? limits.apiTimeoutMs : limits.staticTimeoutMs);
      res.on('close', () => { upstreamResponse?.destroy(); upstreamRequest.destroy(); done(); });
      req.on('aborted', () => { upstreamRequest.destroy(); done(); });
      upstreamRequest.end(body);
    });
  }

  const server = http.createServer({ headersTimeout: 10000, requestTimeout: 15000, keepAliveTimeout: 5000, maxHeaderSize: 8192 }, async (req, res) => {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(key, value);
    try {
      if (!loopback(req.socket.remoteAddress)) return reject(res, 403);
      const host = normalizeHost(req.headers.host, scheme);
      if (!host || fixedHost && host !== fixedHost) return reject(res, 403);
      const expectedOrigin = `${scheme}://${host}`;
      if (req.headers.origin && req.headers.origin !== expectedOrigin) return reject(res, 403);
      const target = safeTarget(req.url);
      if (!target) return reject(res, 404);
      const entryNavigation = req.method === 'GET' && ['/', '/__share/login'].includes(target.pathname)
        && req.headers['sec-fetch-mode'] === 'navigate' && req.headers['sec-fetch-dest'] === 'document';
      if (req.headers['sec-fetch-site'] === 'cross-site' && !entryNavigation) return reject(res, 403);
      const cfIp = req.headers['cf-connecting-ip'];
      const ip = typeof cfIp === 'string' && net.isIP(cfIp) ? cfIp : req.socket.remoteAddress;
      const csrfOkay = () => req.headers.origin === expectedOrigin;
      if (target.pathname === '/__share/login') {
        res.setHeader('Referrer-Policy', 'same-origin');
        if (req.method === 'GET') return send(res, 200, (await pageRenderer)({ error: '' }), 'text/html; charset=utf-8');
        if (req.method !== 'POST') return reject(res, 405);
        if (!csrfOkay()) return reject(res, 403);
        if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reject(res, 415);
        // Reserve the IP attempt synchronously before reading the body. Otherwise
        // concurrent slow forms could all pass the same pre-failure check.
        if (!hit(`failure:${ip}`, limits.loginFailures, limits.loginWindowMs) || !hit('login:global', limits.loginGlobal, limits.loginWindowMs)) {
          res.setHeader('Retry-After', String(Math.ceil(limits.loginWindowMs / 1000))); return reject(res, 429);
        }
        const body = await readBody(req, limits.loginBodyBytes, limits.bodyTimeoutMs), form = new URLSearchParams(body.toString('utf8'));
        if ([...form.keys()].length !== 1 || !form.has('code')) return reject(res, 400);
        const supplied = form.get('code');
        if (!timingSafeEqual(digest(supplied), passcodeHash)) {
          return send(res, 401, (await pageRenderer)({ error: '访问口令不正确，请稍后再试。' }), 'text/html; charset=utf-8');
        }
        rates.delete(`failure:${ip}`);
        const previous = sessionFor(req); if (previous) sessions.delete(previous.key);
        for (const [key, value] of sessions) if (value.expires <= now()) sessions.delete(key);
        while (sessions.size >= limits.maxSessions) sessions.delete(sessions.keys().next().value);
        const token = randomBytes(32).toString('base64url');
        sessions.set(digest(token).toString('hex'), { expires: now() + limits.sessionTtlMs });
        res.setHeader('Set-Cookie', cookie(token, limits.sessionTtlMs));
        return redirect(res, '/');
      }
      if (target.pathname === '/__share/logout') {
        if (req.method !== 'POST') return reject(res, 405);
        if (!csrfOkay()) return reject(res, 403);
        const session = sessionFor(req); if (session) sessions.delete(session.key);
        res.setHeader('Set-Cookie', cookie('', 0));
        return redirect(res, '/__share/login');
      }
      const session = sessionFor(req);
      if (!session) return target.api ? send(res, 401, { error: '请先输入试玩口令。' }) : redirect(res, '/__share/login');
      if (target.api ? req.method !== API_METHODS.get(target.pathname) : !['GET', 'HEAD'].includes(req.method)) return reject(res, 405);
      if (req.method === 'POST' && !csrfOkay()) return reject(res, 403);
      if (req.method !== 'POST' && Number(req.headers['content-length']) > 0) return reject(res, 400);
      if (target.api) {
        if (!hit(`api:session:${session.key}`, limits.apiSession, limits.apiWindowMs) || !hit(`api:ip:${ip}`, limits.apiIp, limits.apiWindowMs) || !hit('api:global', limits.apiGlobal, limits.apiWindowMs) || !hit('api:daily', limits.apiDailyGlobal, 24 * 60 * 60 * 1000)) {
          res.setHeader('Retry-After', String(Math.ceil(limits.apiWindowMs / 1000))); return reject(res, 429);
        }
        if (activeApis >= Math.min(2, limits.maxConcurrentApi)) { res.setHeader('Retry-After', '2'); return reject(res, 429); }
        activeApis += 1;
      }
      try {
        let body;
        if (req.method !== 'POST' && req.headers['transfer-encoding']) {
          // HTTP/2-to-HTTP/1 proxies may represent a bodyless GET/HEAD as chunked.
          // Consume only its empty terminator; reject actual bytes, unsupported
          // encodings and stalled bodies before opening any upstream request.
          if (req.headers['transfer-encoding'].trim().toLowerCase() !== 'chunked') return reject(res, 400);
          try { await readBody(req, 0, Math.min(limits.bodyTimeoutMs, 5000)); }
          catch (error) { if (error.status === 413) error.status = 400; throw error; }
        }
        if (req.method === 'POST') {
          if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) return reject(res, 415);
          body = await readBody(req, limits.bodyBytes, limits.bodyTimeoutMs);
        }
        await proxy(req, res, target, body);
      }
      finally { if (target.api) activeApis -= 1; }
    } catch (error) {
      if ([400, 408, 413].includes(error.status)) res.setHeader('Connection', 'close');
      reject(res, [400, 408, 413].includes(error.status) ? error.status : 500);
    }
  });
  server.on('upgrade', (_req, socket) => { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (!process.env.SHARE_CONFIG_PATH) throw new Error('Missing share configuration.');
    const config = JSON.parse((await fs.readFile(process.env.SHARE_CONFIG_PATH, 'utf8')).replace(/^\uFEFF/, ''));
    const gatewayPort = Number(config.gatewayPort ?? 4175), upstreamPort = Number(config.upstreamPort ?? 4174);
    if (![gatewayPort, upstreamPort].every(port => Number.isInteger(port) && port >= 1024 && port <= 65535) || gatewayPort === upstreamPort || gatewayPort === 4173) throw new Error('Invalid share ports.');
    const server = createShareGateway({ passcode: config.passcode, upstream: `http://127.0.0.1:${upstreamPort}`, publicHost: config.publicHost, secureCookies: true });
    server.on('error', () => { console.error('Share gateway could not start.'); process.exitCode = 1; });
    server.listen(gatewayPort, '127.0.0.1', () => console.log(`Share gateway listening on loopback port ${gatewayPort}.`));
  } catch { console.error('Share gateway configuration is unavailable or invalid.'); process.exitCode = 1; }
}
