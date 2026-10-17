/** Cliente API — wrapper fino sobre fetch con manejo uniforme de errores. */

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

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url) => request('DELETE', url),
  /** Subida multipart (imágenes). */
  upload: (url, formData) => request('POST', url, formData),
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
    a.href = URL.createObjectURL(blob);
    a.download = m?.[1] || fallbackName;
    a.click();
    URL.revokeObjectURL(a.href);
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
