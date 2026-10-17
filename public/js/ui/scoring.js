/**
 * ui/scoring.js — Criterios de puntuación, editor de pesos (sliders 0-10)
 * y desglose de puntuación en barras. Compartido por builds/combos/compare.
 */
import { escapeHtml } from '../app.js';

/** Criterios reconocidos por el motor de puntuación (dominio). */
export const SCORE_CRITERIA = Object.freeze([
  ['survival', 'Supervivencia'],
  ['meleeDamage', 'Daño cuerpo a cuerpo'],
  ['rangedDamage', 'Daño a distancia'],
  ['mobDamage', 'Daño a grupos'],
  ['bossDamage', 'Daño a jefes'],
  ['control', 'Control de masas'],
  ['mobility', 'Movilidad'],
  ['healing', 'Curación'],
  ['cooldown', 'Enfriamiento'],
  ['enchantSynergy', 'Sinergia de encantamientos'],
  ['ownership', 'Ya lo poseo'],
]);

const CRITERIA_MAP = new Map(SCORE_CRITERIA);
export const criterionLabel = (k) => CRITERIA_MAP.get(k) || k;

/**
 * Sliders 0-10 por criterio. Emite el mapa completo {criterio: peso}.
 * @param {object} opts
 * @param {Object<string,number>} [opts.values]  Pesos actuales (defecto 5).
 * @param {Function} [opts.onChange]
 * @returns {HTMLElement}
 */
export function weightsEditor({ values = {}, onChange, criteria = SCORE_CRITERIA } = {}) {
  const current = {};
  for (const [k] of criteria) current[k] = Number.isFinite(values[k]) ? values[k] : 5;

  const wrap = document.createElement('div');
  wrap.style.display = 'grid';
  wrap.style.gridTemplateColumns = 'repeat(auto-fill, minmax(230px, 1fr))';
  wrap.style.gap = '8px 18px';

  for (const [key, label] of criteria) {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 90px 22px';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    const lab = document.createElement('span');
    lab.style.fontSize = '12px';
    lab.innerHTML = escapeHtml(label);
    lab.title = label;

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '10';
    range.step = '1';
    range.value = String(current[key]);
    range.style.accentColor = 'var(--accent-gold)';
    range.setAttribute('aria-label', `Peso de ${label}`);

    const num = document.createElement('span');
    num.className = 'pixel-sm';
    num.style.textAlign = 'right';
    num.textContent = range.value;

    range.addEventListener('input', () => {
      current[key] = Number(range.value);
      num.textContent = range.value;
      onChange?.({ ...current });
    });

    row.append(lab, range, num);
    wrap.appendChild(row);
  }
  return wrap;
}

/**
 * Desglose de puntuación: barras por criterio.
 * Dimensión sin datos → "Sin datos" atenuado (nunca 0 falso).
 * @param {object|null} score  {total, breakdown:{crit:{value,max,reason}}, notes}
 */
export function scoreBreakdownEl(score, criteria = SCORE_CRITERIA) {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.gap = '6px';

  const head = document.createElement('div');
  head.className = 'row';
  const total = document.createElement('strong');
  total.className = 'pixel-sm';
  total.style.color = 'var(--accent-gold)';
  total.textContent = `Puntuación: ${score?.total ?? '—'}`;
  const est = document.createElement('span');
  est.className = 'muted';
  est.style.fontSize = '11px';
  est.textContent = 'Estimación según tus criterios';
  head.append(total, est);
  wrap.appendChild(head);

  const bd = score?.breakdown || {};
  const keys = bd && Object.keys(bd).length
    ? criteria.map(([k]) => k).filter((k) => k in bd).concat(Object.keys(bd).filter((k) => !CRITERIA_MAP.has(k)))
    : criteria.map(([k]) => k);

  for (const key of keys) {
    const entry = bd[key] || {};
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = 'minmax(110px, 1fr) 2fr 54px';
    row.style.alignItems = 'center';
    row.style.gap = '8px';
    if (entry.reason) row.title = entry.reason;

    const lab = document.createElement('span');
    lab.style.fontSize = '11px';
    lab.className = entry.value === null || entry.value === undefined ? 'muted' : '';
    lab.innerHTML = escapeHtml(criterionLabel(key));

    const barWrap = document.createElement('div');
    barWrap.style.background = 'var(--bg-inset)';
    barWrap.style.height = '8px';
    barWrap.style.borderRadius = '2px';
    barWrap.style.overflow = 'hidden';
    const fill = document.createElement('div');
    const pct = entry.value !== null && entry.value !== undefined && entry.max
      ? Math.max(0, Math.min(100, (entry.value / entry.max) * 100))
      : 0;
    fill.style.width = `${pct}%`;
    fill.style.height = '100%';
    fill.style.background = 'var(--accent-gold)';
    barWrap.appendChild(fill);

    const val = document.createElement('span');
    val.className = 'pixel-sm';
    val.style.textAlign = 'right';
    val.style.fontSize = '11px';
    if (entry.value === null || entry.value === undefined) {
      val.textContent = 'Sin datos';
      val.classList.add('muted');
    } else {
      val.textContent = `${Math.round(entry.value * 10) / 10}`;
    }

    row.append(lab, barWrap, val);
    wrap.appendChild(row);
  }

  if (Array.isArray(score?.notes) && score.notes.length) {
    const n = document.createElement('p');
    n.className = 'muted';
    n.style.fontSize = '11px';
    n.style.margin = '4px 0 0';
    n.textContent = score.notes.join(' · ');
    wrap.appendChild(n);
  }
  return wrap;
}

/** Texto breve de score para insignias: "★ 72" o "—". */
export function scoreBadgeText(score) {
  const t = score?.total;
  return t === null || t === undefined ? '★ —' : `★ ${Math.round(t * 10) / 10}`;
}

/** Resumen de breakdown para tooltip (title). */
export function scoreTitleAttr(score) {
  const bd = score?.breakdown || {};
  const lines = Object.entries(bd).map(([k, v]) =>
    `${criterionLabel(k)}: ${v?.value === null || v?.value === undefined ? 'Sin datos' : v.value}`);
  return ['Estimación según tus criterios', ...lines].join('\n');
}
