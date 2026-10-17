/** Cliente API — wrapper fino sobre fetch con manejo uniforme de errores. */

const LIST_CACHE_TTL = 20_000;
const listCache = new Map();
let listCacheVersion = 0;

function invalidateLists() {
  listCacheVersion += 1;
  listCache.clear();
}

async function request(method, url, body, opts = {}) {
  const res = await fetch(url, {
    method,
    headers: body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    body: body == null ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    ...opts,
  });
  const ct = res.headers.get('content-type') || '';
  if (!res.ok) {
    let detail = null;
    try { detail = ct.includes('json') ? await res.json() : await res.text(); } catch { /* vacío */ }
    const msg = detail?.error || res.statusText || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.details = detail;
    throw err;
  }
  if (ct.includes('json')) return res.json();
  return res;
}

async function write(method, url, body) {
  const result = await request(method, url, body);
  invalidateLists();
  return result;
}

async function post(url, body) {
  const result = await request('POST', url, body);
  const path = new URL(url, globalThis.location?.href || 'http://localhost').pathname;
  if (path !== '/api/builds/generate' && path !== '/api/builds/score-preview') invalidateLists();
  return result;
}

export const api = {
  get: (url, opts) => request('GET', url, undefined, opts),
  post,
  patch: (url, body) => write('PATCH', url, body),
  del: (url) => write('DELETE', url),
  /**
   * Load every page from the standard paginated API envelope.
   * The server caps pageSize at 200, so callers cannot accidentally omit rows
   * by requesting a larger number and unwrapping only the first response.
   */
  async getAll(url, { pageSize = 200, maxPages = 1000, signal, cache = true } = {}) {
    const target = new URL(url, globalThis.location?.href || 'http://localhost');
    const requestedSize = Math.max(1, Math.min(200, Math.floor(Number(pageSize) || 200)));
    target.searchParams.delete('page');
    target.searchParams.set('pageSize', String(requestedSize));
    const cacheKey = `${target.pathname}${target.search}`;
    const cached = cache ? listCache.get(cacheKey) : null;
    if (signal?.aborted) {
      const abortError = new Error('La pantalla ya no está activa.');
      abortError.name = 'AbortError';
      throw abortError;
    }
    if (cached && cached.expiresAt > Date.now()) return cached.rows;
    const cacheVersion = listCacheVersion;
    const rows = [];

    for (let page = 1; page <= maxPages; page += 1) {
      target.searchParams.set('page', String(page));
      target.searchParams.set('pageSize', String(requestedSize));
      const requestUrl = `${target.pathname}${target.search}`;
      const result = await request('GET', requestUrl, undefined, signal ? { signal } : {});
      if (Array.isArray(result)) {
        const all = page === 1 ? result : rows.concat(result);
        if (cache && cacheVersion === listCacheVersion) {
          listCache.set(cacheKey, { rows: all, expiresAt: Date.now() + LIST_CACHE_TTL });
        }
        return all;
      }

      const batch = ['data', 'rows', 'items', 'results', 'entries']
        .map((key) => result?.[key])
        .find(Array.isArray) || [];
      rows.push(...batch);
      const total = Number(result?.total);
      if (!batch.length || (Number.isFinite(total) && rows.length >= total)
        || (!Number.isFinite(total) && batch.length < requestedSize)) {
        if (cache && cacheVersion === listCacheVersion) {
          listCache.set(cacheKey, { rows, expiresAt: Date.now() + LIST_CACHE_TTL });
          if (listCache.size > 32) listCache.delete(listCache.keys().next().value);
        }
        return rows;
      }
    }

    throw new Error(`La lista supera el límite seguro de ${maxPages} páginas.`);
  },
  /** Subida multipart (imágenes). */
  upload: (url, formData) => write('POST', url, formData),
  /** Descarga de archivo exportado → dispara save-as del navegador. */
  async download(url, fallbackName = 'export.bin') {
    const res = await fetch(url);
    if (!res.ok) {
      let detail = null;
      try { detail = await res.json(); } catch { /* texto */ }
      throw new Error(detail?.error || `HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const dispo = res.headers.get('content-disposition') || '';
    const m = dispo.match(/filename="?([^";]+)"?/);
    const a = document.createElement('a');
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = m?.[1] || fallbackName;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  },
};

/** Querystring desde objeto (omite null/undefined/''). */
export function qs(params) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== null && v !== undefined && v !== '') p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}
