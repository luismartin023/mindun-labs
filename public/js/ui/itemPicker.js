/**
 * ui/itemPicker.js — Modal de selección de un ítem del catálogo.
 * Devuelve Promise<item|null>. Búsqueda local + categoría bloqueada.
 */
import { qs } from '../api/client.js';
import { escapeHtml } from '../app.js';
import { openModal } from './modal.js';
import { itemCard } from './itemCard.js';
import { emptyState } from './emptyState.js';
import { asList, categoryLabel, itemTitle } from './format.js';

/**
 * @param {object} opts
 * @param {object} opts.api
 * @param {string} [opts.category]     Bloquea el grid a una categoría.
 * @param {string} [opts.title]
 * @param {string[]} [opts.excludeIds]
 * @param {boolean} [opts.onlyOwned]
 */
export function openItemPicker({ api, category, title, excludeIds = [], onlyOwned = false } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let items = [];
    let q = '';

    const body = document.createElement('div');

    const bar = document.createElement('div');
    bar.className = 'searchbar';
    const input = document.createElement('input');
    input.className = 'mc-input';
    input.type = 'search';
    input.placeholder = 'Buscar ítem…';
    input.addEventListener('input', () => { q = input.value; renderGrid(); });
    bar.appendChild(input);
    if (category) {
      const tag = document.createElement('span');
      tag.className = 'mc-tag';
      tag.innerHTML = escapeHtml(categoryLabel(category));
      bar.appendChild(tag);
    }
    if (onlyOwned) {
      const tag = document.createElement('span');
      tag.className = 'mc-tag';
      tag.textContent = 'Solo poseídos';
      bar.appendChild(tag);
    }

    const grid = document.createElement('div');
    grid.className = 'mc-grid';
    grid.style.setProperty('--card-size', '62px');
    grid.style.marginTop = '12px';
    grid.style.minHeight = '90px';
    grid.innerHTML = '<p class="muted">Cargando ítems…</p>';

    body.append(bar, grid);

    const m = openModal({
      title: title || 'Elegir ítem',
      body,
      wide: true,
      onClose: () => done(null),
      actions: [{ label: 'Cancelar', kind: 'ghost', onClick: () => done(null) }],
    });

    function done(v) {
      if (settled) return;
      settled = true;
      if (m.el.isConnected) m.close();
      resolve(v ?? null);
    }

    function matches(it) {
      const s = q.trim().toLowerCase();
      if (!s) return true;
      const hay = [it.name, it.localizedName, ...(it.aliases || []), ...(it.tags || [])]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(s);
    }

    function renderGrid() {
      grid.innerHTML = '';
      const list = items.filter(matches);
      if (!list.length) {
        grid.appendChild(emptyState({
          icon: '▤',
          title: 'Sin resultados',
          message: onlyOwned ? 'No posees ítems que coincidan.' : 'Prueba con otro nombre.',
        }));
        return;
      }
      for (const it of list.slice(0, 400)) {
        grid.appendChild(itemCard({ item: it, size: 60, onClick: () => done(it) }));
      }
    }

    api.get(`/api/items${qs({ category, owned: onlyOwned ? 1 : undefined, pageSize: 2000 })}`)
      .then((res) => {
        items = asList(res).filter((i) => !excludeIds.includes(i.id));
        renderGrid();
      })
      .catch((err) => {
        grid.innerHTML = `<p class="muted">Error cargando ítems: ${escapeHtml(err.message)}</p>`;
      });
  });
}
