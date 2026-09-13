// Pages advanced-mode entry. The release builder copies this as _worker.js.
// Keep this exact origin in sync with the backend's PUBLIC_ORIGIN after the
// production Pages project is confirmed. Preview deployments never call it.
export const PAGES_PRODUCTION_ORIGIN = 'https://zhihu-four-seasons.pages.dev';

const ERROR_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
};
const safeError = (status, error) => new Response(JSON.stringify({ error }), {
  status,
  headers: { ...ERROR_HEADERS, ...(status === 503 ? { 'Retry-After': '30' } : {}) },
});

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.origin !== PAGES_PRODUCTION_ORIGIN) {
        return safeError(421, '请使用正式试玩地址');
      }

      const backendRoute = url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/api/');
      const binding = backendRoute ? env?.GAME_BACKEND : env?.ASSETS;
      if (typeof binding?.fetch !== 'function') {
        return safeError(503, '试玩服务暂不可用，请稍后重试');
      }

      // Service binding, never a network fetch to workers.dev. Pass the original
      // Request untouched: URL/Origin/Cookie/body carry the browser's identity,
      // and the backend remains responsible for same-origin and session checks.
      // Preserve the response too, including Set-Cookie, CSP, Range and 404s.
      return await binding.fetch(request);
    } catch {
      // Binding errors can contain internal addresses or diagnostics. Do not
      // reflect them to the visitor or turn a failure into an open proxy.
      return safeError(503, '试玩服务暂不可用，请稍后重试');
    }
  },
};
