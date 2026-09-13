// Server-only Zhihu OAuth transport. Tokens are used once for /user, never returned.
const AUTHORIZE_URL = 'https://openapi.zhihu.com/authorize';
const TOKEN_URL = 'https://openapi.zhihu.com/access_token';
const USER_URL = 'https://openapi.zhihu.com/user';
const MAX_JSON_BYTES = 128 * 1024;
const FAILURE = '知乎登录暂时未能完成，请重新尝试。';

class OAuthTransportError extends Error {
  constructor() { super(FAILURE); this.name = 'OAuthTransportError'; }
}
const fail = () => { throw new OAuthTransportError(); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const opaque = (value, max) => typeof value === 'string' && value.length > 0
  && value.length <= max && !/[\s\u0000-\u001f\u007f]/u.test(value);

function validateApplication(appId, redirectUri) {
  if (!opaque(appId, 256) || typeof redirectUri !== 'string' || redirectUri.length > 2048) fail();
  let url;
  try { url = new URL(redirectUri); } catch { fail(); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search
      || url.href !== redirectUri) fail();
}

export function buildZhihuAuthorizationUrl({ appId, redirectUri, state } = {}) {
  validateApplication(appId, redirectUri);
  if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(state)) fail();
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({ app_id: appId, response_type: 'code', redirect_uri: redirectUri, state });
  return url.href;
}

// JSON.parse would round an int64 uid before a normal reviver can see it. Quote
// uid integer values first. Other fields retain their types, so a numeric name
// cannot accidentally pass string validation. Decimal/exponent uid is rejected.
function parseLosslessIntegers(text) {
  let output = '', cursor = 0, lastString = '', lastSignificant = '';
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === '"') {
      const start = cursor++;
      let closed = false;
      while (cursor < text.length) {
        if (text[cursor] === '\\') { cursor += 2; continue; }
        if (text[cursor++] === '"') { closed = true; break; }
      }
      if (!closed) fail();
      const token = text.slice(start, cursor);
      lastString = JSON.parse(token);
      lastSignificant = '"';
      output += token;
    } else if (char === '-' || /[0-9]/.test(char)) {
      const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(cursor))?.[0];
      if (!token) fail();
      // Quoting an illegal numeric object key must not accidentally repair JSON.
      if (/^\s*:/.test(text.slice(cursor + token.length))) fail();
      output += lastSignificant === ':' && lastString === 'uid' && /^-?\d+$/.test(token) ? `"${token}"` : token;
      lastSignificant = 'value';
      cursor += token.length;
    } else {
      output += char;
      if (!/\s/.test(char)) lastSignificant = char;
      cursor++;
    }
  }
  return JSON.parse(output);
}

function payload(value) {
  if (!record(value)) fail();
  if (Object.hasOwn(value, 'code')) {
    if (value.code !== '20000' && value.code !== 20000) fail();
    return record(value.data) ? value.data : value;
  }
  return value;
}

function positiveInteger(value, max) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value))) fail();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > max) fail();
  return parsed;
}

function minimalProfile(value) {
  const user = payload(value);
  let id;
  if (Object.hasOwn(user, 'uid') && user.uid !== null) {
    if (typeof user.uid !== 'string' || !/^[1-9]\d{0,19}$/.test(user.uid)) fail();
    // The documented field is an unsigned-looking positive int64 identity.
    if (BigInt(user.uid) > 9223372036854775807n) fail();
    id = user.uid;
  } else if (typeof user.hash_id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(user.hash_id)) {
    id = user.hash_id;
  } else fail();
  if (user.fullname !== undefined && user.fullname !== null && typeof user.fullname !== 'string') fail();
  const suppliedName = user.fullname ?? '';
  if (suppliedName.length > 100 || /[\u0000-\u001f\u007f-\u009f]/u.test(suppliedName)) fail();
  const name = suppliedName.trim() || '知乎旅人';
  return { id, name };
}

export function createZhihuOAuthClient({ appId, appKey, redirectUri, fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  validateApplication(appId, redirectUri);
  if (!opaque(appKey, 4096) || typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs)
      || timeoutMs < 1 || timeoutMs > 30_000) fail();

  return {
    async authenticate(code) {
      if (!opaque(code, 4096)) fail();
      const controller = new AbortController(), readers = new Set();
      let timer;
      const stillActive = () => { if (controller.signal.aborted) fail(); };
      const cancelReaders = () => {
        for (const reader of readers) void reader.cancel().catch(() => {});
      };
      const readJson = async response => {
        if (controller.signal.aborted) {
          void response?.body?.cancel().catch(() => {});
          fail();
        }
        stillActive();
        if (!response?.ok || response.status < 200 || response.status >= 300 || !response.body) {
          void response?.body?.cancel().catch(() => {});
          fail();
        }
        const type = response.headers.get('content-type');
        const length = response.headers.get('content-length');
        if ((type && !/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(type))
            || (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_JSON_BYTES))) {
          void response.body.cancel().catch(() => {});
          fail();
        }
        const reader = response.body.getReader();
        readers.add(reader);
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let bytes = 0, text = '', completed = false;
        try {
          for (;;) {
            stillActive();
            const { done, value } = await reader.read();
            stillActive();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > MAX_JSON_BYTES) fail();
            text += decoder.decode(value, { stream: true });
          }
          text += decoder.decode();
          const parsed = parseLosslessIntegers(text);
          completed = true;
          return parsed;
        } finally {
          readers.delete(reader);
          if (!completed) void reader.cancel().catch(() => {});
          reader.releaseLock();
        }
      };
      const execute = async () => {
        const tokenResponse = await fetchImpl(TOKEN_URL, {
          method: 'POST', redirect: 'manual', signal: controller.signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: new URLSearchParams({ app_id: appId, app_key: appKey, grant_type: 'authorization_code', redirect_uri: redirectUri, code }),
        });
        const token = payload(await readJson(tokenResponse));
        if (!opaque(token.access_token, 8192) || typeof token.token_type !== 'string'
            || token.token_type.toLowerCase() !== 'bearer') fail();
        const expiresIn = positiveInteger(token.expires_in, 31_536_000);
        stillActive();
        const profileResponse = await fetchImpl(USER_URL, {
          method: 'GET', redirect: 'manual', signal: controller.signal,
          headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
        });
        const profile = minimalProfile(await readJson(profileResponse));
        stillActive();
        return { profile, expiresIn };
      };
      try {
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            cancelReaders();
            reject(new OAuthTransportError());
          }, timeoutMs);
        });
        return await Promise.race([execute(), deadline]);
      } catch {
        // Never attach a cause, upstream body, authorization code, key or token.
        throw new OAuthTransportError();
      } finally {
        clearTimeout(timer);
        controller.abort();
        cancelReaders();
      }
    },
  };
}
