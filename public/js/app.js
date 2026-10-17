/**
 * app.js — Shell de MINDUN LABS: router hash, nav, contexto compartido.
 * Cada pantalla: public/js/screens/<name>.js exporta { title, mount(el, ctx) }.
 */
import { api } from './api/client.js';

const root = document.getElementById('screen-root');
const navEl = document.getElementById('pagenav');

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

/** Bus de eventos ligero para desacoplar pantallas. */
const bus = {
  _l: new Map(),
  on(ev, fn) { (this._l.get(ev) || this._l.set(ev, []).get(ev)).push(fn); return () => this.off(ev, fn); },
  off(ev, fn) { this._l.set(ev, (this._l.get(ev) || []).filter((f) => f !== fn)); },
  emit(ev, data) { (this._l.get(ev) || []).forEach((f) => f(data)); },
};

let unmountCurrent = null;

function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'inventario';
  const [name, ...rest] = hash.split('/');
  const screen = SCREENS[name] ? name : 'inventario';
  return { screen, param: rest.join('/') || null };
}

async function mount() {
  const { screen, param } = route();
  document.querySelectorAll('.pagenav a').forEach((a) =>
    a.classList.toggle('active', a.dataset.screen === screen));
  if (unmountCurrent) { try { unmountCurrent(); } catch { /* noop */ } unmountCurrent = null; }
  root.innerHTML = '';
  try {
    const mod = await SCREENS[screen].load();
    const ctx = { api, bus, param, navigate, prefs: loadPrefs() };
    unmountCurrent = await mod.mount(root, ctx) || null;
    document.title = `MINDUN LABS — ${SCREENS[screen].title}`;
  } catch (err) {
    root.innerHTML = `<div class="screen-page"><div class="wrap"><div class="mc-empty">
      <p class="pixel">Error cargando la pantalla</p>
      <p>${escapeHtml(err.message)}</p>
      <button class="mc-btn" onclick="location.reload()">Recargar</button></div></div></div>`;
    console.error(err);
  }
}

function navigate(path) { location.hash = `#/${path}`; }

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem('mindun.prefs') || '{}'); } catch { return {}; }
}
export function savePrefs(patch) {
  localStorage.setItem('mindun.prefs', JSON.stringify({ ...loadPrefs(), ...patch }));
  bus.emit('prefs:changed', loadPrefs());
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- Topbar: recursos + accesos ----------

async function paintTopbar() {
  const resEl = document.getElementById('topbar-resources');
  try {
    const meta = await api.get('/api/meta');
    const profile = await api.get('/api/profile');
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
    resEl.innerHTML = '<span class="muted pixel-sm">sin conexión</span>';
  }
}

function paintNav() {
  navEl.innerHTML = NAV_ORDER.map(
    (k) => `<a href="#/${k}" data-screen="${k}">${SCREENS[k].title}</a>`,
  ).join('');
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

  const close = () => { ov.remove(); palette = null; };
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
  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (!q) { rows = []; paint(); return; }
      try {
        if (!ownedIds) {
          const inv = await api.get('/api/inventory?pageSize=500');
          ownedIds = new Set((inv.data || inv.items || []).map((e) => e.itemId ?? e.item_id));
        }
        const res = await api.get(`/api/items?search=${encodeURIComponent(q)}&pageSize=9`);
        rows = (res.data || res.items || []).map((it) => ({ ...it, _owned: ownedIds.has(it.id) }));
        active = rows.length ? 0 : -1;
        paint();
      } catch { resultsEl.innerHTML = '<p class="muted" style="padding:8px">Error de búsqueda.</p>'; }
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

paintNav();
mount();
paintTopbar();

export { bus, navigate, api };
