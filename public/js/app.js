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

window.addEventListener('hashchange', mount);
bus.on('data:changed', paintTopbar);

paintNav();
mount();
paintTopbar();

export { bus, navigate, api };
