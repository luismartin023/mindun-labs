/**
 * ui/itemCard.js — Tarjeta de ítem .mc-card con marco de rareza e insignias.
 * Imagen: item.imagePath (absoluta /images/...); onerror → .mc-img-missing inicial.
 */
import { itemTitle } from './format.js';

/** Placeholder con la inicial del nombre (cuando falta imagen). */
export function missingImg(name) {
  const d = document.createElement('div');
  d.className = 'mc-img-missing';
  d.textContent = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return d;
}

const ENCHANTED_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/></svg>';

/**
 * @param {object} opts
 * @param {object} [opts.item]   CatalogItem.
 * @param {object} [opts.entry]  InventoryEntry (insignias de copia).
 * @param {number} [opts.size]   px fijos (si no, ocupa la celda del grid).
 * @param {boolean} [opts.showPower=true]
 * @param {boolean} [opts.showQty=true]
 * @param {boolean} [opts.showFav=true]
 * @param {boolean} [opts.selected]
 * @param {boolean} [opts.draggable]
 * @param {Function} [opts.onClick]
 * @param {Function} [opts.onContext]  Menú contextual (click derecho).
 * @param {string} [opts.title]  Tooltip (por defecto nombre del ítem).
 * @returns {HTMLElement}
 */
export function itemCard({
  item, entry, size, showPower = true, showQty = true, showFav = true,
  selected = false, draggable = false, onClick, onContext, title,
} = {}) {
  const el = document.createElement('div');
  const rarity = entry?.isGilded ? 'gilded' : (item?.rarity || 'unknown');
  el.className = `mc-card rarity-${rarity}${selected ? ' selected' : ''}`;
  el.title = title || itemTitle(item);
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  if (size) { el.style.width = `${size}px`; el.style.flex = '0 0 auto'; }

  const name = itemTitle(item);
  if (item?.imagePath) {
    const img = document.createElement('img');
    img.src = item.imagePath;
    img.alt = name;
    img.loading = 'lazy';
    img.draggable = false;
    img.addEventListener('error', () => { img.replaceWith(missingImg(name)); }, { once: true });
    el.appendChild(img);
  } else {
    el.appendChild(missingImg(name));
  }

  // Insignias
  if (showFav && entry?.isFavorite) {
    const f = document.createElement('span');
    f.className = 'mc-card__fav';
    f.textContent = '★';
    f.title = 'Favorito';
    el.appendChild(f);
  }
  if (entry?.isGilded) {
    const g = document.createElement('span');
    g.className = 'mc-card__badge';
    g.textContent = 'G';
    g.title = 'Dorado (gilded)';
    el.appendChild(g);
  }
  const hasEnch = Array.isArray(entry?.selectedEnchantIds) && entry.selectedEnchantIds.some(Boolean);
  if (hasEnch) {
    const e = document.createElement('span');
    e.className = 'mc-card__enchanted';
    if (entry?.isGilded) e.style.left = '16px';
    e.title = 'Con encantamientos elegidos';
    e.innerHTML = ENCHANTED_SVG;
    el.appendChild(e);
  }
  if (showPower && entry?.powerLevel !== null && entry?.powerLevel !== undefined) {
    const p = document.createElement('span');
    p.className = 'mc-card__power';
    p.textContent = entry.powerLevel;
    p.title = 'Poder';
    el.appendChild(p);
  }
  if (showQty && (entry?.quantity ?? 0) > 1) {
    const q = document.createElement('span');
    q.className = 'mc-card__qty';
    q.textContent = `×${entry.quantity}`;
    q.title = 'Cantidad';
    el.appendChild(q);
  }

  if (draggable) el.draggable = true;
  if (onClick) {
    el.addEventListener('click', (ev) => onClick(ev));
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onClick(ev); }
    });
  }
  if (onContext) {
    el.addEventListener('contextmenu', (ev) => { ev.preventDefault(); onContext(ev); });
  }
  return el;
}
