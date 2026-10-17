/**
 * ui/filters.js — Barra de filtros reactiva.
 * fields: {type:'search'|'select'|'check', key, label, options?, placeholder?}
 * Emite criterios parciales: onChange({key: valor}) en cada cambio.
 */
import { escapeHtml } from '../app.js';

export function filtersBar({ fields = [], values = {}, onChange } = {}) {
  const bar = document.createElement('div');
  bar.className = 'searchbar';
  bar.style.flexWrap = 'wrap';

  for (const f of fields) {
    if (f.type === 'search') {
      const input = document.createElement('input');
      input.className = 'mc-input';
      input.type = 'search';
      input.placeholder = f.placeholder || f.label || 'Buscar…';
      input.value = values[f.key] ?? '';
      input.addEventListener('input', () => onChange?.({ [f.key]: input.value }));
      bar.appendChild(input);
    } else if (f.type === 'select') {
      const wrap = document.createElement('label');
      wrap.className = 'row';
      wrap.style.gap = '6px';
      const lab = document.createElement('span');
      lab.className = 'pixel-sm muted';
      lab.innerHTML = escapeHtml(f.label || f.key);
      const sel = document.createElement('select');
      sel.className = 'mc-select';
      sel.style.width = 'auto';
      for (const o of f.options || []) {
        const opt = document.createElement('option');
        opt.value = o.value ?? o;
        opt.innerHTML = escapeHtml(o.label ?? o);
        if ((values[f.key] ?? '') === opt.value) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', () => onChange?.({ [f.key]: sel.value }));
      wrap.append(lab, sel);
      bar.appendChild(wrap);
    } else if (f.type === 'check') {
      const lab = document.createElement('label');
      lab.className = 'mc-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = Boolean(values[f.key]);
      const sp = document.createElement('span');
      sp.innerHTML = escapeHtml(f.label || f.key);
      lab.append(cb, sp);
      cb.addEventListener('change', () => onChange?.({ [f.key]: cb.checked }));
      bar.appendChild(lab);
    }
  }
  return bar;
}
