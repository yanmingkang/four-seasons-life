import { createHash, randomBytes } from 'node:crypto';
import { feedbackSnapshot } from '../src/engine.js';
import { SOURCES } from '../src/sources.js';
import { MODEL, MAX_BODY_BYTES, NarrativeInputError, validateNarrativeInput,
  narrativePrompt, extractFinalText, fallbackNarrative } from './ai-core.mjs';
import { PracticeInputError, validatePracticeInput, practicePrompt,
  extractPracticeOutput, fallbackPractice } from './practice.mjs';
import { createZhihuHttpExecutor, createZhihuHttpSearch } from './zhihu-http.mjs';

const MINUTE = 60_000, DAY = 24 * 60 * MINUTE, SESSION_TTL = 10 * MINUTE;
const PREFIX = 'cloud-game:v1:', INDEX = `${PREFIX}expiry`, MAX_RECORDS = 1024;
const hash = value => createHash('sha256').update(value).digest('hex');
const cached = value => ({ ...value, mode: ['fallback', 'curated'].includes(value.mode) ? value.mode : 'cache' });
const unavailableReason = '实时回应暂不可用，已使用本局记录。';

class RequestError extends Error {
  constructor(status, message = '请求暂时无法处理，请稍后再试。') { super(message); this.status = status; }
}
const json = (status, value) => new Response(JSON.stringify(value), { status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} });

async function inputBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) throw new RequestError(415, '请发送 JSON 格式的游戏记录。');
  const declared = request.headers.get('content-length');
  if (declared !== null && !/^\d+$/.test(declared)) throw new RequestError(400);
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    await request.body?.cancel().catch(() => {});
    throw new RequestError(413, '游戏记录过大。');
  }
  if (!request.body) throw new RequestError(400, '游戏记录不是有效 JSON。');
  const reader = request.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '', timer;
  try {
    const reading = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) throw new RequestError(413, '游戏记录过大。');
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      return JSON.parse(text);
    })();
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { reject(new RequestError(408)); void reader.cancel().catch(() => {}); }, 15_000);
    });
    return await Promise.race([reading, deadline]);
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, '游戏记录不是有效 JSON。');
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

// This service is internal to one Durable Object. The edge must overwrite both
// identity headers after validating its signed visitor cookie, never forward
// browser-provided identity. The DO also serializes handle() calls. Transactions
// below keep charging atomic and survive service reconstruction/hibernation.
export function createCloudGameService({ storage, secret, now = Date.now, execute, search } = {}) {
  if (!storage || !['get', 'put', 'delete', 'transaction'].every(name => typeof storage[name] === 'function')) throw new TypeError('Persistent transactional storage is required.');
  let modelExecute = typeof execute === 'function' ? execute : null;
  let searchExecute = typeof search === 'function' ? search : null;
  if (!modelExecute || !searchExecute) {
    try {
      modelExecute ||= createZhihuHttpExecutor({ secret });
      searchExecute ||= createZhihuHttpSearch({ secret });
    } catch { /* Unconfigured deployments remain playable without networking. */ }
  }
  const pending = new Map();
  let activeModel = null, activeSearch = null;
  // Bounded, non-sensitive operational status. Never expose an upstream message,
  // response, URL, prompt, identity or credential through diagnostics.
  let lastFailure = null;

  // Values have explicit TTLs; the small index removes expired conversations
  // even when a different visitor makes the next request. Never evict a live
  // budget to make space: capacity/storage failures fail closed before a call.
  async function transaction(fn) {
    return storage.transaction(async raw => {
      const timestamp = now();
      const index = (await raw.get(INDEX)) || {};
      let changed = false;
      for (const [key, expires] of Object.entries(index)) {
        if (expires <= timestamp) { await raw.delete(key); delete index[key]; changed = true; }
      }
      const tx = {
        async get(key) {
          const entry = await raw.get(`${PREFIX}${key}`);
          if (entry === undefined) return null;
          if (!entry || !Number.isFinite(entry.expires)) throw new RequestError(503);
          if (entry.expires <= timestamp) {
            await raw.delete(`${PREFIX}${key}`); delete index[`${PREFIX}${key}`]; changed = true; return null;
          }
          return entry.value;
        },
        async put(key, value, expires) {
          const full = `${PREFIX}${key}`;
          if (!Object.hasOwn(index, full) && Object.keys(index).length >= MAX_RECORDS) throw new RequestError(503);
          if (!Number.isFinite(expires) || expires <= timestamp || expires > now() + DAY) throw new RequestError(503);
          await raw.put(full, { expires, value }); index[full] = expires; changed = true;
        },
        async delete(key) {
          const full = `${PREFIX}${key}`;
          await raw.delete(full); delete index[full]; changed = true;
        },
        nextCleanupAt() {
          const deadlines = Object.values(index);
          return deadlines.length ? Math.min(...deadlines) : null;
        },
      };
      const result = await fn(tx);
      if (changed) await raw.put(INDEX, index);
      return result;
    });
  }

  async function once(key, signature, work) {
    const previous = pending.get(key);
    if (previous) {
      if (previous.signature === signature) return cached(await previous.promise);
      // Changed settled messages are checked against the stored first result;
      // they cannot race a pending turn and overwrite its transcript.
      await previous.promise;
      return once(key, signature, work);
    }
    if (pending.size >= 128) throw new RequestError(429);
    const entry = { signature, promise: Promise.resolve().then(work) };
    pending.set(key, entry);
    try { return await entry.promise; }
    finally { if (pending.get(key) === entry) pending.delete(key); }
  }

  const dayNumber = () => Math.floor(now() / DAY);
  async function count(tx, key) {
    const value = await tx.get(key);
    if (value !== null && (!Number.isInteger(value) || value < 0)) throw new RequestError(503);
    return value || 0;
  }
  async function reserve(kind, identity) {
    return transaction(async tx => {
      if (await tx.get(`cooldown:${kind}`)) return { ok: false, reason: 'cooldown' };
      const day = dayNumber(), minute = Math.floor(now() / MINUTE);
      const globalKey = `budget:${kind}:${day}`, visitorKey = `budget:visitor:${day}:${identity.visitor}`;
      const ipKey = `budget:ip:${minute}:${identity.ip}`;
      const globalCount = await count(tx, globalKey), ipCount = await count(tx, ipKey);
      const visitorCount = kind === 'model' ? await count(tx, visitorKey) : 0;
      if (globalCount >= 80 || visitorCount >= 20) return { ok: false, reason: 'daily' };
      if (ipCount >= 8) return { ok: false, reason: 'rate' };
      const endOfDay = (day + 1) * DAY;
      await tx.put(globalKey, globalCount + 1, endOfDay);
      if (kind === 'model') await tx.put(visitorKey, visitorCount + 1, endOfDay);
      await tx.put(ipKey, ipCount + 1, (minute + 1) * MINUTE);
      return { ok: true };
    });
  }

  async function provider(kind, identity, argument, parse) {
    const executor = kind === 'model' ? modelExecute : searchExecute;
    if (!executor) return { ok: false, reason: 'not_configured' };
    if (kind === 'model' ? activeModel : activeSearch) return { ok: false, reason: 'busy' };
    const work = (async () => {
      const allowance = await reserve(kind, identity);
      if (!allowance.ok) return allowance;
      const controller = new AbortController();
      let timer;
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => { controller.abort(); reject(new Error('upstream unavailable')); }, kind === 'model' ? 21_000 : 12_000);
        });
        const output = await Promise.race([
          Promise.resolve().then(() => executor(argument, { signal: controller.signal, ...(kind === 'search' ? { count: 3 } : {}) })), timeout,
        ]);
        const value=parse(output);
        lastFailure=null;
        return { ok: true, value };
      } catch (error) {
        const allowedCodes=new Set(['not_configured','invalid_request','request_too_large','response_too_large','http_error','invalid_response','aborted','unavailable']);
        lastFailure={kind,code:allowedCodes.has(error?.code)?error.code:'processing_error',
          ...(Number.isInteger(error?.status)&&error.status>=400&&error.status<=599?{status:error.status}:{})};
        await transaction(tx => tx.put(`cooldown:${kind}`, true, now() + MINUTE));
        return { ok: false, reason: 'unavailable' };
      } finally { clearTimeout(timer); }
    })();
    if (kind === 'model') activeModel = work; else activeSearch = work;
    try { return await work; }
    finally { if (kind === 'model') activeModel = null; else activeSearch = null; }
  }

  async function narrate(input, identity) {
    const state = validateNarrativeInput(input), kind = input.kind;
    const key = `narrative:${hash(JSON.stringify([identity.visitor, kind, feedbackSnapshot(state)]))}`;
    const fallback = { mode: 'fallback', model: MODEL, text: fallbackNarrative(kind, state), reason: unavailableReason };
    return once(key, key, async () => {
      const prior = await transaction(tx => tx.get(key));
      if (prior) return cached(prior.response || fallback);
      // A pending marker prevents an interrupted request from being blindly
      // billed again after the service is rebuilt before its result was saved.
      await transaction(tx => tx.put(key, { response: fallback, pending: true }, now() + DAY));
      const outcome = await provider('model', identity, narrativePrompt(kind, state), output => extractFinalText(output, kind));
      const result = outcome.ok ? { mode: 'live', model: MODEL, text: outcome.value } : fallback;
      await transaction(tx => tx.put(key, { response: result }, now() + (outcome.ok ? DAY : MINUTE)));
      return result;
    });
  }

  async function practice(input, identity) {
    const valid = validatePracticeInput(input);
    const owner = hash(`${identity.visitor}\n${valid.clientId}`);
    const startKey = `practice-start:${hash(`${owner}\n${valid.canonical}`)}`;
    const signature = hash(JSON.stringify([valid.turn, valid.message, valid.sessionId || null]));
    return once(startKey, signature, async () => {
      let entry = await transaction(async tx => {
        const start = await tx.get(startKey);
        const token = valid.sessionId || start?.token;
        const previous = token ? await tx.get(`practice:${hash(token)}`) : null;
        if (valid.sessionId && !previous) throw new RequestError(400, '练习已过期，请关闭后重新开始。');
        if (previous) {
          if (previous.owner !== owner || previous.canonical !== valid.canonical) throw new RequestError(400, '练习与当前事件不匹配。');
          if (!valid.sessionId && previous.firstMessage !== valid.message) throw new RequestError(400, '练习已经开始，请沿用当前对话。');
          return previous;
        }
        const created = { token: randomBytes(24).toString('base64url'), owner, canonical: valid.canonical,
          firstMessage: valid.message, transcript: [], results: [], pending: null };
        await tx.put(`practice:${hash(created.token)}`, created, now() + SESSION_TTL);
        await tx.put(startKey, { token: created.token }, now() + SESSION_TTL);
        return created;
      });
      const prior = entry.results[valid.turn - 1];
      if (prior) {
        if (prior.message !== valid.message) throw new RequestError(400, '这一轮已经提交，不能修改已结算的内容。');
        return cached(prior.response);
      }
      if (entry.transcript.length >= 2 || valid.turn !== entry.transcript.length + 1) throw new RequestError(400, '请按顺序完成两轮练习。');
      if (entry.pending && (entry.pending.turn !== valid.turn || entry.pending.message !== valid.message)) throw new RequestError(400, '上一句话已提交，请沿用原内容。');
      const interrupted = !!entry.pending;
      entry.pending = { turn: valid.turn, message: valid.message };
      await transaction(tx => tx.put(`practice:${hash(entry.token)}`, entry, now() + SESSION_TTL));
      const outcome = interrupted ? { ok: false } : await provider('model', identity,
        practicePrompt(valid.state, entry.transcript, valid.message), output => extractPracticeOutput(output, valid.turn));
      const fields = outcome.ok ? outcome.value : fallbackPractice(valid.last.eventId, valid.turn);
      const result = { mode: outcome.ok ? 'live' : 'fallback', model: MODEL, sessionId: entry.token,
        turn: valid.turn, done: valid.turn === 2, npc: fields.npc, ...(valid.turn === 2 ? { tip: fields.tip } : {}) };
      entry = { ...entry, pending: null, transcript: [...entry.transcript, { player: valid.message, npc: result.npc }],
        results: [...entry.results, { message: valid.message, response: result }] };
      await transaction(async tx => {
        await tx.put(`practice:${hash(entry.token)}`, entry, now() + SESSION_TTL);
        await tx.put(startKey, { token: entry.token }, now() + SESSION_TTL);
      });
      return result;
    });
  }

  function searchItems(output) {
    const body = JSON.parse(output);
    if (![0, '0'].includes(body?.Code) || !Array.isArray(body.Data?.Items)) throw new Error('invalid search');
    return body.Data.Items.slice(0, 10).filter(item => {
      try {
        if (typeof item.Url !== 'string' || item.Url.length > 2048) return false;
        const url = new URL(item.Url);
        return url.protocol === 'https:' && !url.username && !url.password && !url.port
          && ['www.zhihu.com', 'zhuanlan.zhihu.com'].includes(url.hostname);
      } catch { return false; }
    }).slice(0, 3).map(item => ({
      title: String(item.Title || '').replace(/<[^>]*>/g, '').slice(0, 160),
      author: String(item.AuthorName || '作者未返回').replace(/<[^>]*>/g, '').slice(0, 80),
      url: item.Url, excerpt: String(item.ContentText || '').replace(/<[^>]*>/g, '').slice(0, 150),
    }));
  }

  async function experience(source, identity) {
    const key = `search:${source.id}`;
    const fallback = { mode: 'curated', message: '实时检索暂不可用，仍可查看本事件已整理的知乎参考。',
      items: [{ title: source.title, author: source.author, url: source.url, excerpt: source.idea }] };
    return once(key, key, async () => {
      const prior = await transaction(tx => tx.get(key));
      if (prior) return cached(prior.response);
      await transaction(tx => tx.put(key, { response: fallback, pending: true }, now() + MINUTE));
      const outcome = await provider('search', identity, source.query, searchItems);
      const live = outcome.ok && outcome.value.length > 0;
      const result = live ? { mode: 'live', items: outcome.value } : fallback;
      await transaction(tx => tx.put(key, { response: result }, now() + (live ? 15 * MINUTE : MINUTE)));
      return result;
    });
  }

  async function handle(request) {
    try {
      const url = new URL(request.url), path = url.pathname;
      if (!['/api/narrate', '/api/practice', '/api/experience', '/api/ai/status'].includes(path)) throw new RequestError(404);
      const visitor = request.headers.get('X-Game-Visitor'), ip = request.headers.get('X-Game-Ip');
      if (!/^[A-Za-z0-9_-]{24,128}$/.test(visitor || '') || !/^[A-Za-z0-9_-]{32,128}$/.test(ip || '')) throw new RequestError(401, '请重新打开试玩页面。');
      const identity = { visitor: hash(visitor), ip: hash(ip) };
      const isPost = ['/api/narrate', '/api/practice'].includes(path);
      if (request.method !== (isPost ? 'POST' : 'GET')) throw new RequestError(405);
      if (path !== '/api/experience' && url.search) throw new RequestError(400);
      if (isPost) {
        const input = await inputBody(request);
        return json(200, await (path === '/api/narrate' ? narrate(input, identity) : practice(input, identity)));
      }
      if (request.headers.has('content-length') && request.headers.get('content-length') !== '0') throw new RequestError(400);
      if (path === '/api/experience') {
        const sourceId = url.searchParams.get('source');
        if ([...url.searchParams.keys()].length !== 1 || !Object.hasOwn(SOURCES, sourceId)) throw new RequestError(400, '未知的经验主题。');
        return json(200, await experience(SOURCES[sourceId], identity));
      }
      const available = await transaction(async tx => !await tx.get('cooldown:model') && await count(tx, `budget:model:${dayNumber()}`) < 80
        && await count(tx, `budget:visitor:${dayNumber()}:${identity.visitor}`) < 20);
      return json(200, { model: MODEL, provider: '知乎直答', transport: 'official-http',
        configured: !!modelExecute, available: !!modelExecute && available, fallback: true,
        ...(lastFailure?{lastFailure}:{}),
        note: modelExecute ? '已配置官方 HTTP 接口；实时响应仍取决于权限、额度和网络。' : '实时回应未配置，可继续使用本局回顾。' });
    } catch (error) {
      if (error instanceof RequestError) return json(error.status, { error: error.message });
      if (error instanceof NarrativeInputError || error instanceof PracticeInputError) return json(400, { error: error.message });
      // Never serialize upstream/storage exceptions, prompts or player messages.
      return json(503, { error: '服务暂时不可用，请稍后再试。' });
    }
  }
  // The owner schedules a Durable Object alarm at this deadline, then calls
  // cleanup() again from alarm(). Lazy pruning alone would leave an idle
  // object's expired player conversations on disk indefinitely.
  const cleanup = () => transaction(tx => tx.nextCleanupAt());
  return { handle, cleanup };
}
