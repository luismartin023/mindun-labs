/**
 * screens/profile.js — Perfil del jugador, estadísticas honestas y preferencias.
 * Nada de números inventados: si un dato falta se muestra "—".
 */
import { escapeHtml, savePrefs } from '../app.js';
import { toast } from '../ui/toast.js';
import { emptyState } from '../ui/emptyState.js';
import {
  categoryLabel, fmtDateTime, rarityLabel,
} from '../ui/format.js';

export const title = 'Perfil';

/** Extrae el primer número finito entre varias rutas posibles. */
function pickNum(obj, ...paths) {
  for (const p of paths) {
    let cur = obj;
    for (const k of p.split('.')) cur = cur?.[k];
    if (Number.isFinite(cur)) return cur;
  }
  return null;
}

function statCard(label, value, title = '') {
  const d = document.createElement('div');
  d.className = 'mc-panel mc-panel--deep';
  d.style.textAlign = 'center';
  d.style.padding = '10px';
  const v = document.createElement('div');
  v.className = 'pixel';
  v.style.fontSize = '16px';
  v.style.color = 'var(--accent-gold)';
  v.textContent = value === null || value === undefined ? '—' : String(value);
  const l = document.createElement('div');
  l.className = 'pixel-sm muted';
  l.style.fontSize = '7px';
  l.style.marginTop = '6px';
  l.innerHTML = escapeHtml(label);
  d.append(v, l);
  if (title) d.title = title;
  return d;
}

export async function mount(el, ctx) {
  const { api, bus, prefs } = ctx;

  el.innerHTML = `<div class="screen-page"><div class="wrap">
    <h2 class="pixel-sm" style="margin:0">Perfil</h2>
    <div class="mc-panel" id="p-form"></div>
    <p class="mc-label">Estadísticas del inventario</p>
    <div id="p-stats" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px"></div>
    <div id="p-stats-detail" class="mc-panel mc-panel--deep"></div>
    <div class="mc-panel" id="p-review"></div>
    <div class="mc-panel" id="p-prefs"></div>
  </div></div>`;

  const formEl = el.querySelector('#p-form');
  const statsEl = el.querySelector('#p-stats');
  const detailEl = el.querySelector('#p-stats-detail');
  const reviewEl = el.querySelector('#p-review');
  const prefsEl = el.querySelector('#p-prefs');

  let profile = null;
  try {
    profile = await api.get('/api/profile');
  } catch (e) {
    formEl.appendChild(emptyState({
      icon: '⚠', title: 'Perfil no disponible', message: e.message,
    }));
    return () => {};
  }

  // ---------- Formulario de perfil ----------
  const nameI = document.createElement('input');
  nameI.className = 'mc-input';
  nameI.value = profile?.displayName || '';
  const lvlI = document.createElement('input');
  lvlI.className = 'mc-input';
  lvlI.type = 'number';
  lvlI.value = profile?.level ?? '';
  const powI = document.createElement('input');
  powI.className = 'mc-input';
  powI.type = 'number';
  powI.value = profile?.power ?? '';
  const notesI = document.createElement('textarea');
  notesI.className = 'mc-textarea';
  notesI.rows = 3;
  notesI.value = profile?.notes || '';

  const mkField = (t, i) => {
    const d = document.createElement('div');
    const l = document.createElement('label');
    l.className = 'mc-label';
    l.innerHTML = escapeHtml(t);
    d.append(l, i);
    return d;
  };
  const row = document.createElement('div');
  row.className = 'row wrap';
  row.style.alignItems = 'flex-start';
  const f1 = mkField('Nombre visible', nameI); f1.style.flex = '2 1 200px';
  const f2 = mkField('Nivel', lvlI); f2.style.flex = '1 1 90px';
  const f3 = mkField('Poder', powI); f3.style.flex = '1 1 90px';
  row.append(f1, f2, f3);
  const saveB = document.createElement('button');
  saveB.className = 'mc-btn mc-btn--primary';
  saveB.textContent = 'Guardar perfil';
  saveB.addEventListener('click', async () => {
    try {
      await api.patch('/api/profile', {
        displayName: nameI.value.trim() || 'Jugador',
        level: lvlI.value === '' ? null : Number(lvlI.value),
        power: powI.value === '' ? null : Number(powI.value),
        notes: notesI.value.trim() || null,
      });
      toast.success('Perfil guardado');
      bus.emit('data:changed');
    } catch (e) { toast.error(`No se pudo guardar: ${e.message}`); }
  });
  formEl.append(row, mkField('Notas', notesI), saveB);

  // ---------- Estadísticas ----------
  let summary = null;
  let meta = null;
  try { summary = await api.get('/api/stats/summary'); } catch { /* sin stats */ }
  try { meta = await api.get('/api/meta'); } catch { /* sin meta */ }

  statsEl.innerHTML = '';
  const cards = [
    ['Copias totales', pickNum(summary, 'copies', 'totalCopies', 'inventory.total', 'inventory.copies', 'totals.copies') ?? pickNum(meta, 'counts.inventory')],
    ['Tipos distintos', pickNum(summary, 'distinctItems', 'distinct', 'catalog.items', 'totals.items') ?? pickNum(meta, 'counts.items')],
    ['Favoritos', pickNum(summary, 'favorites', 'favs', 'inventory.favorites')],
    ['Builds', pickNum(summary, 'builds', 'totals.builds') ?? pickNum(meta, 'counts.builds')],
    ['Tier lists', pickNum(summary, 'tierlists', 'totals.tierlists') ?? pickNum(meta, 'counts.tierlists')],
    ['Pendientes de verificación', pickNum(summary, 'pendingVerification', 'unverified', 'catalog.unverified')],
  ];
  for (const [l, v] of cards) statsEl.appendChild(statCard(l, v));

  // desglose por categoría / rareza (solo si hay datos reales)
  const byCat = summary?.byCategory || summary?.bycategory || summary?.categories || {};
  const byRar = summary?.byRarity || summary?.rarities || {};
  detailEl.innerHTML = '';
  const hasCat = Object.keys(byCat).length;
  const hasRar = Object.keys(byRar).length;
  if (hasCat || hasRar) {
    const cols = document.createElement('div');
    cols.className = 'row wrap';
    cols.style.alignItems = 'flex-start';
    if (hasCat) {
      const d = document.createElement('div');
      d.style.flex = '1 1 200px';
      d.innerHTML = `<p class="mc-label" style="margin-top:0">Por categoría</p>` +
        Object.entries(byCat).map(([k, v]) =>
          `<div class="stat-row"><span class="k">${escapeHtml(categoryLabel(k))}</span><span class="v">${escapeHtml(v)}</span></div>`).join('');
      cols.appendChild(d);
    }
    if (hasRar) {
      const d = document.createElement('div');
      d.style.flex = '1 1 200px';
      d.innerHTML = `<p class="mc-label" style="margin-top:0">Por rareza</p>` +
        Object.entries(byRar).map(([k, v]) =>
          `<div class="stat-row"><span class="k">${escapeHtml(rarityLabel(k))}</span><span class="v">${escapeHtml(v)}</span></div>`).join('');
      cols.appendChild(d);
    }
    detailEl.appendChild(cols);
  } else {
    detailEl.innerHTML = '<p class="muted" style="margin:0;font-size:12px">Sin desglose disponible todavía.</p>';
  }

  // ---------- Última revisión ----------
  reviewEl.innerHTML = '';
  const revRow = document.createElement('div');
  revRow.className = 'row wrap';
  const revTxt = document.createElement('span');
  revTxt.innerHTML = `<span class="k muted">Última revisión del inventario:</span> <strong>${escapeHtml(fmtDateTime(profile?.lastReviewedAt))}</strong>`;
  const revBtn = document.createElement('button');
  revBtn.className = 'mc-btn mc-btn--sm';
  revBtn.textContent = 'Marcar revisión hecha hoy';
  revBtn.addEventListener('click', async () => {
    try {
      await api.patch('/api/profile', { lastReviewedAt: new Date().toISOString() });
      revTxt.innerHTML = `<span class="k muted">Última revisión del inventario:</span> <strong>${escapeHtml(fmtDateTime(new Date().toISOString()))}</strong>`;
      toast.success('Revisión registrada');
      bus.emit('data:changed');
    } catch (e) { toast.error(e.message); }
  });
  revRow.append(revTxt, revBtn);
  reviewEl.appendChild(revRow);

  // ---------- Preferencias visuales ----------
  prefsEl.innerHTML = '<p class="mc-label" style="margin-top:0">Preferencias</p>';
  // tamaño de tarjeta
  const sizeRow = document.createElement('div');
  sizeRow.className = 'row';
  const sizeLab = document.createElement('span');
  sizeLab.className = 'muted';
  sizeLab.style.fontSize = '12px';
  sizeLab.textContent = 'Tamaño de tarjeta';
  const sizeR = document.createElement('input');
  sizeR.type = 'range';
  sizeR.min = '48'; sizeR.max = '140'; sizeR.step = '4';
  sizeR.value = String(prefs?.cardSize || profile?.prefs?.cardSize || 76);
  sizeR.style.accentColor = 'var(--accent-gold)';
  const sizeV = document.createElement('span');
  sizeV.className = 'pixel-sm';
  sizeV.textContent = `${sizeR.value}px`;
  sizeR.addEventListener('input', () => {
    document.documentElement.style.setProperty('--card-size', `${sizeR.value}px`);
    sizeV.textContent = `${sizeR.value}px`;
    savePrefs({ cardSize: Number(sizeR.value) });
    patchPrefs({ cardSize: Number(sizeR.value) });
  });
  sizeRow.append(sizeLab, sizeR, sizeV);
  prefsEl.appendChild(sizeRow);

  // movimiento reducido / 3D
  const motL = document.createElement('label');
  motL.className = 'mc-check';
  const motC = document.createElement('input');
  motC.type = 'checkbox';
  motC.checked = (prefs?.motion3d ?? profile?.prefs?.motion3d) !== false;
  motL.append(motC, Object.assign(document.createElement('span'), { textContent: 'Animaciones / personaje 3D' }));
  motC.addEventListener('change', () => {
    savePrefs({ motion3d: motC.checked });
    patchPrefs({ motion3d: motC.checked });
    toast.info(motC.checked ? 'Animaciones activadas' : 'Movimiento reducido');
  });
  prefsEl.appendChild(motL);

  async function patchPrefs(patch) {
    try {
      const current = (await api.get('/api/profile'))?.prefs || {};
      await api.patch('/api/profile', { prefs: { ...current, ...patch } });
    } catch { /* prefs remotas opcionales */ }
  }
}
