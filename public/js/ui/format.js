/**
 * ui/format.js — Etiquetas y formateo compartido (textos en español).
 * Réplica en frontend de las constantes de `server/domain/model.js`.
 */
import { escapeHtml } from '../app.js';

export const RARITY_LABELS = Object.freeze({
  common: 'Común', rare: 'Raro', unique: 'Único',
  gilded: 'Dorado', special: 'Especial', unknown: 'Desconocida',
});

/** Orden de valoración de rarezas (para ordenar y heurísticas). */
export const RARITY_ORDER = Object.freeze({
  common: 0, rare: 1, unique: 2, gilded: 3, special: 4, unknown: 5,
});

export const CATEGORY_LABELS = Object.freeze({
  melee_weapon: 'Cuerpo a cuerpo', ranged_weapon: 'A distancia',
  armor: 'Armadura', artifact: 'Artefacto', enchantment: 'Encantamiento',
  mixed: 'Mixta',
});

export const GOAL_LABELS = Object.freeze({
  tank: 'Tanque', boss_damage: 'Daño a jefes', mob_clear: 'Limpieza de masas',
  crowd_control: 'Control de masas', mobility: 'Movilidad',
  poison_damage: 'Daño de veneno', fire_damage: 'Daño de fuego',
  lightning_damage: 'Daño de rayo', souls: 'Almas', balanced: 'Equilibrada',
});

export const STATUS_LABELS = Object.freeze({
  verified: 'Verificado', user_entered: 'Manual',
  imported: 'Importado', unverified: 'Sin verificar',
});

export const rarityLabel = (r) => RARITY_LABELS[r] || RARITY_LABELS.unknown;
export const categoryLabel = (c) => CATEGORY_LABELS[c] || (c ? String(c) : 'Sin categoría');
export const goalLabel = (g) => GOAL_LABELS[g] || g || 'Sin objetivo';
export const statusLabel = (s) => STATUS_LABELS[s] || s || 'Sin verificar';
export const itemTitle = (item) => item?.localizedName || item?.name || 'Sin nombre';
export const enchantName = (e) => e?.localizedName || e?.name || 'Sin nombre';
export const powerText = (p) => (p === null || p === undefined || p === '' ? '—' : String(p));
export const yesNo = (v) => (v === null || v === undefined ? null : v ? 'Sí' : 'No');

export function fmtDate(iso) {
  if (!iso) return 'Sin registrar';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Sin registrar';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(iso) {
  if (!iso) return 'Sin registrar';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Sin registrar';
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Chips .mc-tag para una lista de etiquetas (HTML string). */
export function tagsHtml(tags) {
  const list = Array.isArray(tags) ? tags : [];
  if (!list.length) return '<span class="muted">Sin etiquetas</span>';
  return list.map((t) => `<span class="mc-tag">${escapeHtml(t)}</span>`).join('');
}

/** Tag de rareza con marco + etiqueta de texto (HTML string). */
export function rarityTag(rarity) {
  const r = rarity || 'unknown';
  return `<span class="rarity-tag ${escapeHtml(r)}">${escapeHtml(rarityLabel(r))}</span>`;
}

/**
 * Fila de estadística estilo .stat-row (HTML string).
 * `v` ausente → "Sin registrar" atenuado. `opts.html` si v ya es HTML.
 * `opts.passive` → clase .passive (verde esmeralda).
 */
export function statRow(k, v, opts = {}) {
  let inner;
  if (v === null || v === undefined || (Array.isArray(v) && !v.length) || v === '') {
    inner = '<span class="v muted">Sin registrar</span>';
  } else {
    const val = Array.isArray(v) ? v.join(', ') : v;
    inner = `<span class="v">${opts.html ? val : escapeHtml(val)}</span>`;
  }
  return `<div class="stat-row${opts.passive ? ' passive' : ''}"><span class="k">${escapeHtml(k)}</span>${inner}</div>`;
}

/**
 * Normaliza respuestas de listado: acepta array directo o
 * { items | rows | results | data | entries, total }.
 */
export function asList(res) {
  if (Array.isArray(res)) return res;
  for (const k of ['items', 'rows', 'results', 'data', 'entries', 'builds', 'tierlists', 'enchantments', 'assets', 'views']) {
    if (Array.isArray(res?.[k])) return res[k];
  }
  return [];
}

/** Divide texto por comas/saltos de línea → array limpio. */
export function splitList(text) {
  return String(text ?? '')
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** number | null — nunca NaN ni 0 falso. */
export function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Descarga un objeto como archivo JSON (Blob + save-as). */
export function downloadJson(obj, filename = 'datos.json') {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Lee un File como texto (Promise). */
export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error || new Error('No se pudo leer el archivo'));
    r.readAsText(file);
  });
}
