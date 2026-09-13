import { MODEL } from './ai-core.mjs';

const API_ORIGIN = 'https://developer.zhihu.com';
export const MAX_ZHIHU_REQUEST_BYTES = 128 * 1024;
export const MAX_ZHIHU_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_ZHIHU_QUERY_BYTES = 2048;
const encoder = new TextEncoder();

// Do not attach an upstream exception, URL, prompt or response to these errors:
// provider failures can echo credentials or private player messages.
export class ZhihuHttpError extends Error {
  constructor(code = 'unavailable', status) {
    super('Zhihu service is unavailable');
    this.name = 'ZhihuHttpError';
    this.code = code;
    if(Number.isInteger(status)&&status>=400&&status<=599)this.status=status;
  }
}

function assertConfiguration(secret, fetchImpl) {
  if (typeof secret !== 'string' || !/^[\x21-\x7e]{1,4096}$/.test(secret)) throw new ZhihuHttpError('not_configured');
  if (typeof fetchImpl !== 'function') throw new ZhihuHttpError('not_configured');
}

async function readBoundedJson(response) {
  const length = response.headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_ZHIHU_RESPONSE_BYTES)) {
    await response.body?.cancel().catch(() => {});
    throw new ZhihuHttpError('response_too_large');
  }
  if (!response.body) throw new ZhihuHttpError('invalid_response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let bytes = 0, text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_ZHIHU_RESPONSE_BYTES) {
        throw new ZhihuHttpError('response_too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  let json;
  try { json = JSON.parse(text); }
  catch { throw new ZhihuHttpError('invalid_response'); }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new ZhihuHttpError('invalid_response');
  return { text, json };
}

function createRequest({ secret, fetchImpl }) {
  assertConfiguration(secret, fetchImpl);
  return async (url, { body, signal } = {}) => {
    try {
      signal?.throwIfAborted();
      const response = await fetchImpl(url, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${secret}`,
          'X-Request-Timestamp': String(Math.floor(Date.now() / 1000)),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        ...(body === undefined ? {} : { body }),
        signal,
        // Workerd rejects redirect:'error' before sending the request. Manual
        // mode is portable and never forwards the credential to Location.
        redirect: 'manual',
      });
      if (!response.ok) {
        // This also rejects every 3xx response; never follow or expose Location.
        await response.body?.cancel().catch(() => {});
        throw new ZhihuHttpError('http_error',response.status);
      }
      return await readBoundedJson(response);
    } catch (error) {
      if (error instanceof ZhihuHttpError) throw error;
      throw new ZhihuHttpError(signal?.aborted ? 'aborted' : 'unavailable');
    }
  };
}

// Executor contract matches the local CLI: one prompt in, one non-streaming
// Chat Completions JSON string out. The model gate owns timeout and retry policy.
export function createZhihuHttpExecutor({ secret, fetchImpl = fetch } = {}) {
  const request = createRequest({ secret, fetchImpl });
  return async (prompt, { signal } = {}) => {
    if (typeof prompt !== 'string' || !prompt.trim()) throw new ZhihuHttpError('invalid_request');
    const body = JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: prompt }], stream: false });
    if (encoder.encode(body).byteLength > MAX_ZHIHU_REQUEST_BYTES) throw new ZhihuHttpError('request_too_large');
    const { text, json } = await request(`${API_ORIGIN}/v1/chat/completions`, { body, signal });
    if (json.error || !Array.isArray(json.choices) || !json.choices.length) throw new ZhihuHttpError('invalid_response');
    return text;
  };
}

// Search keeps the official Code/Data/Items envelope, including provenance URLs.
// The caller maps the bounded results for presentation and supplies its deadline.
export function createZhihuHttpSearch({ secret, fetchImpl = fetch } = {}) {
  const request = createRequest({ secret, fetchImpl });
  return async (query, { count = 3, signal } = {}) => {
    if (typeof query !== 'string' || !query.trim() || !Number.isInteger(count) || count < 1 || count > 10) throw new ZhihuHttpError('invalid_request');
    if (encoder.encode(query).byteLength > MAX_ZHIHU_QUERY_BYTES) throw new ZhihuHttpError('request_too_large');
    const url = new URL(`${API_ORIGIN}/api/v1/content/zhihu_search`);
    url.search = new URLSearchParams({ Query: query.trim(), Count: String(count) }).toString();
    const { text, json } = await request(url.href, { signal });
    if ((json.Code !== 0 && json.Code !== '0') || !Array.isArray(json.Data?.Items)) throw new ZhihuHttpError('invalid_response');
    return text;
  };
}
