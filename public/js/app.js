/**
 * app.js — Shell de MINDUN LABS: router hash, nav, contexto compartido.
 * Cada pantalla: public/js/screens/<name>.js exporta { title, mount(el, ctx) }.
 */
import { api } from './api/client.js';

const root = document.getElementById('screen-root');
const navEl = document.getElementById('pagenav');
const mobileNavEl = document.getElementById('mobile-nav');

/** Registro de pantallas → import dinámico. */
const SCREENS = {
  inventario: { title: 'Inventario', load: () => import('./screens/inventory.js') },
  catalogo: { title: 'Catálogo', load: () => import('./screens/catalog.js') },
  builds: { title: 'Builds', load: () => import('./screens/builds.js') },
  combos: { title: 'Combinaciones', load: () => import('./screens/combos.js') },
  tiers: { title: 'Tier Lists', load: () => import('./screens/tierlists.js') },
  comparar: { title: 'Comparar', load: () => import('./screens/compare.js') },
  tablas: { title: 'Tablas', load: () => import('./screens/tables.js') },
  perfil: { title: 'Perfil', load: () => import('./screens/profile.js') },
  importar: { title: 'Importar/Exportar', load: () => import('./screens/importExport.js') },
  ajustes: { title: 'Ajustes', load: () => import('./screens/settings.js') },
};

const NAV_ORDER = ['inventario', 'catalogo', 'builds', 'combos', 'tiers', 'comparar', 'tablas', 'perfil', 'importar', 'ajustes'];
const MOBILE_PRIMARY = ['inventario', 'catalogo', 'builds', 'perfil'];
const MOBILE_MORE = NAV_ORDER.filter((key) => !MOBILE_PRIMARY.includes(key));
const NAV_ICONS = {
  inventario: '▦', catalogo: '◇', builds: '⚒', perfil: '●', more: '•••',
};
let closeMoreMenu = null;

/** Bus de eventos ligero para desacoplar pantallas. */
const bus = {
  _l: new Map(),
  on(ev, fn) { (this._l.get(ev) || this._l.set(ev, []).get(ev)).push(fn); return () => this.off(ev, fn); },
  off(ev, fn) { this._l.set(ev, (this._l.get(ev) || []).filter((f) => f !== fn)); },
  emit(ev, data) { (this._l.get(ev) || []).forEach((f) => f(data)); },
};

let unmountCurrent = null;
let activeController = null;
let routeVersion = 0;

function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'inventario';
  const [name, ...rest] = hash.split('/');
  const screen = SCREENS[name] ? name : 'inventario';
  return { screen, param: rest.join('/') || null };
}

async function mount() {
  const version = ++routeVersion;
  const { screen, param } = route();
  closeMoreMenu?.();
  palette?.close();
  window.dispatchEvent(new Event('mindun:routechange'));
  updateActiveNav(screen);
  activeController?.abort();
  activeController = new AbortController();
  if (unmountCurrent) { try { unmountCurrent(); } catch { /* noop */ } unmountCurrent = null; }
  root.replaceChildren();
  const screenHost = document.createElement('div');
  screenHost.className = 'screen-mount';
  root.appendChild(screenHost);
  try {
    const mod = await SCREENS[screen].load();
    if (version !== routeVersion) return;
    const signal = activeController.signal;
    const screenApi = {
      ...api,
      get: (url, opts = {}) => api.get(url, { ...opts, signal }),
      getAll: (url, opts = {}) => api.getAll(url, { ...opts, signal }),
    };
    const ctx = {
      api: screenApi, bus, param, navigate, prefs: loadPrefs(), signal,
      isActive: () => version === routeVersion && !signal.aborted,
    };
    const cleanup = await mod.mount(screenHost, ctx);
    if (version !== routeVersion) {
      try { cleanup?.(); } catch { /* noop */ }
      return;
    }
    unmountCurrent = typeof cleanup === 'function' ? cleanup : null;
    document.title = `MINDUN LABS — ${SCREENS[screen].title}`;
  } catch (err) {
    if (version !== routeVersion) return;
    screenHost.innerHTML = `<div class="screen-page"><div class="wrap"><div class="mc-empty">
      <p class="pixel">Error cargando la pantalla</p>
      <p>${escapeHtml(err.message)}</p></div></div></div>`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'mc-btn';
    retry.textContent = 'Recargar';
    retry.addEventListener('click', () => location.reload());
    screenHost.querySelector('.mc-empty')?.appendChild(retry);
    console.error(err);
  }
}

function navigate(path) { location.hash = `#/${path}`; }

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem('mindun.prefs') || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    const { equipped: _equipped, ...uiPrefs } = saved;
    return uiPrefs;
  } catch { return {}; }
}

function applyPrefs(prefs = {}) {
  const size = Number(prefs.cardSize);
  if (Number.isFinite(size) && size >= 48 && size <= 140) {
    document.documentElement.style.setProperty('--card-size', `${size}px`);
  }
  document.documentElement.style.setProperty('--card-gap', prefs.density === 'compact' ? '4px' : '8px');
}

export function savePrefs(patch) {
  const prefs = { ...loadPrefs(), ...patch };
  localStorage.setItem('mindun.prefs', JSON.stringify(prefs));
  applyPrefs(prefs);
  bus.emit('prefs:changed', prefs);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Topbar: recursos + accesos ----------

let topbarRefresh = 0;
async function paintTopbar() {
  const resEl = document.getElementById('topbar-resources');
  const version = ++topbarRefresh;
  try {
    const [meta, profile] = await Promise.all([
      api.get('/api/meta'),
      api.get('/api/profile'),
    ]);
    if (version !== topbarRefresh) return;
    const localPrefs = loadPrefs();
    const { equipped: _equipped, ...profileUiPrefs } = profile?.prefs || {};
    const mergedPrefs = { ...profileUiPrefs, ...localPrefs };
    applyPrefs(mergedPrefs);
    if (JSON.stringify(mergedPrefs) !== JSON.stringify(localPrefs)) {
      localStorage.setItem('mindun.prefs', JSON.stringify(mergedPrefs));
      bus.emit('prefs:changed', mergedPrefs);
    }
    resEl.innerHTML = `
      <span class="topbar__res" title="Nivel del jugador">
        <svg class="ico" viewBox="0 0 16 16"><path fill="#46c765" d="M8 0l2 5h-2v3h2l-2 5-2-5h2V5H6z"/></svg>
        ${profile?.level ?? '—'}</span>
      <span class="topbar__res" title="Poder">
        <svg class="ico" viewBox="0 0 16 16"><path fill="#e6a329" d="M2 9h4V5h4v4h4l-6 6z"/></svg>
        ${profile?.power ?? '—'}</span>
      <span class="topbar__res" title="Copias en inventario">
        <svg class="ico" viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" fill="none" stroke="#a25cd6" stroke-width="2"/></svg>
        ${meta?.counts?.inventory ?? 0}</span>`;
  } catch {
    if (version !== topbarRefresh) return;
    resEl.innerHTML = '<span class="muted pixel-sm">sin conexión</span>';
  }
}

function updateActiveNav(screen) {
  document.querySelectorAll('.pagenav a, .mobile-nav__item[data-screen]').forEach((a) => {
    const active = a.dataset.screen === screen;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const moreButton = mobileNavEl?.querySelector('[data-more]');
  const moreActive = MOBILE_MORE.includes(screen);
  moreButton?.classList.toggle('active', moreActive);
  if (moreButton) moreButton.setAttribute('aria-expanded', 'false');
}

function paintNav() {
  navEl.innerHTML = NAV_ORDER.map(
    (k) => `<a href="#/${k}" data-screen="${k}">${escapeHtml(SCREENS[k].title)}</a>`,
  ).join('');
  if (!mobileNavEl) return;
  mobileNavEl.replaceChildren();
  for (const key of MOBILE_PRIMARY) {
    const link = document.createElement('a');
    link.className = 'mobile-nav__item';
    link.href = `#/${key}`;
    link.dataset.screen = key;
    link.innerHTML = `<span class="mobile-nav__icon" aria-hidden="true">${NAV_ICONS[key]}</span><span>${escapeHtml(SCREENS[key].title)}</span>`;
    mobileNavEl.appendChild(link);
  }
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'mobile-nav__item';
  more.dataset.more = '';
  more.setAttribute('aria-haspopup', 'dialog');
  more.setAttribute('aria-expanded', 'false');
  more.innerHTML = `<span class="mobile-nav__icon" aria-hidden="true">${NAV_ICONS.more}</span><span>Más</span>`;
  more.addEventListener('click', () => openMobileMore(more));
  mobileNavEl.appendChild(more);
}

function openMobileMore(trigger) {
  const existing = document.querySelector('.mobile-more-overlay');
  if (existing) return;
  const overlay = document.createElement('div');
  overlay.className = 'mobile-more-overlay';
  const panel = document.createElement('section');
  panel.className = 'mobile-more-sheet';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Más secciones');
  const heading = document.createElement('div');
  heading.className = 'mobile-more-sheet__head';
  const title = document.createElement('h2');
  title.textContent = 'Más secciones';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'mc-iconbtn';
  closeButton.setAttribute('aria-label', 'Cerrar menú');
  closeButton.textContent = '×';
  heading.append(title, closeButton);
  const list = document.createElement('div');
  list.className = 'mobile-more-sheet__links';
  for (const key of MOBILE_MORE) {
    const link = document.createElement('a');
    link.href = `#/${key}`;
    link.textContent = SCREENS[key].title;
    link.addEventListener('click', close);
    list.appendChild(link);
  }
  panel.append(heading, list);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  trigger.setAttribute('aria-expanded', 'true');

  function close() {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    trigger.setAttribute('aria-expanded', 'false');
    if (closeMoreMenu === close) closeMoreMenu = null;
    trigger.focus();
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
  }
  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) close();
  });
  closeButton.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  closeMoreMenu = close;
  list.querySelector('a')?.focus();
}

// ---------- Búsqueda global (Ctrl/Cmd + K) ----------

let palette = null;

function openPalette() {
  if (palette) return;
  const ov = document.createElement('div');
  ov.className = 'mc-overlay search-palette';
  ov.innerHTML = `
    <div class="mc-modal" role="dialog" aria-modal="true" aria-label="Búsqueda global" style="max-width:560px">
      <div class="mc-modal__head">
        <h2 class="pixel-sm">Buscar</h2>
        <button class="mc-iconbtn" type="button" aria-label="Cerrar (Esc)">✕</button>
      </div>
      <div class="mc-modal__body" style="padding:10px">
        <input class="mc-input" id="pal-input" type="search" placeholder="Nombre, alias, efecto, encantamiento…" autocomplete="off">
        <div id="pal-results" style="margin-top:8px"></div>
      </div>
    </div>`;
  document.body.appendChild(ov);
  const input = ov.querySelector('#pal-input');
  const resultsEl = ov.querySelector('#pal-results');
  let ownedIds = null;
  let rows = [];
  let active = -1;
  let searchVersion = 0;
  let timer = null;

  const close = () => {
    clearTimeout(timer);
    searchVersion += 1;
    ov.remove();
    palette = null;
  };
  const jump = (item) => {
    close();
    const target = item._owned ? 'inventario' : 'catalogo';
    sessionStorage.setItem('mindun.jump', JSON.stringify({ screen: target, search: item.name }));
    if (route().screen === target) mount(); // ya estamos ahí: remontar para aplicar el salto
    else navigate(target);
  };
  const paint = () => {
    resultsEl.innerHTML = '';
    rows.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'pal-row' + (i === active ? ' pal-row--active' : '');
      b.innerHTML = `
        ${it.imagePath ? `<img src="${it.imagePath}" alt="" loading="lazy">` : '<span class="pal-row__ph"></span>'}
        <span class="pal-row__name">${escapeHtml(it.name)}</span>
        <span class="pal-row__meta">${escapeHtml(it.rarity ?? '')} · ${escapeHtml(it.category ?? '')}${it._owned ? ' · en inventario' : ''}</span>`;
      b.addEventListener('click', () => jump(it));
      b.addEventListener('mousemove', () => { active = i; paint(); });
      resultsEl.appendChild(b);
    });
    if (!rows.length && input.value.trim()) {
      resultsEl.innerHTML = '<p class="muted" style="padding:8px">Sin resultados.</p>';
    }
  };
  input.addEventListener('input', () => {
    const version = ++searchVersion;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (!q) { rows = []; paint(); return; }
      try {
        if (!ownedIds) {
          const inv = await api.getAll('/api/inventory');
          if (version !== searchVersion || !ov.isConnected) return;
          ownedIds = new Set(inv.map((e) => e.itemId ?? e.item_id));
        }
        const res = await api.get(`/api/items?search=${encodeURIComponent(q)}&pageSize=9`);
        if (version !== searchVersion || !ov.isConnected) return;
        rows = (res.data || res.items || []).map((it) => ({ ...it, _owned: ownedIds.has(it.id) }));
        active = rows.length ? 0 : -1;
        paint();
      } catch (error) {
        if (version === searchVersion && ov.isConnected) {
          resultsEl.textContent = '';
          const p = document.createElement('p');
          p.className = 'muted';
          p.style.padding = '8px';
          p.textContent = `Error de búsqueda: ${error.message}`;
          resultsEl.appendChild(p);
        }
      }
    }, 180);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows.length) { active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length; paint(); }
    } else if (e.key === 'Enter' && rows[active]) jump(rows[active]);
  });
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });
  ov.querySelector('.mc-iconbtn').addEventListener('click', close);
  palette = { close };
  input.focus();
}

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    palette ? palette.close() : openPalette();
  } else if (e.key === 'Escape' && palette) palette.close();
});

window.addEventListener('hashchange', mount);
bus.on('data:changed', paintTopbar);
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  if (error?.name === 'AbortError') return;
  event.preventDefault();
  console.error(error);
  const host = document.getElementById('toasts');
  if (!host) return;
  const notice = document.createElement('div');
  notice.className = 'toast toast--error';
  notice.setAttribute('role', 'alert');
  notice.textContent = error?.message || 'No se pudo completar la acción. Inténtalo de nuevo.';
  host.appendChild(notice);
  setTimeout(() => notice.remove(), 6000);
});

paintNav();
applyPrefs(loadPrefs());
mount();
paintTopbar();

export { bus, navigate, api };
