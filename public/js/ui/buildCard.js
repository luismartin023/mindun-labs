/**
 * ui/buildCard.js — Panel compacto de build: nombre, objetivo, 6 minislots,
 * insignia de puntuación y acciones.
 */
import { escapeHtml } from '../app.js';
import { itemCard } from './itemCard.js';
import { goalLabel } from './format.js';
import { scoreBadgeText, scoreTitleAttr } from './scoring.js';

const SLOT_DEFS = [
  ['meleeItemId', 'Cuerpo a cuerpo'],
  ['rangedItemId', 'A distancia'],
  ['armorItemId', 'Armadura'],
];

function emptySlot(label, size) {
  const d = document.createElement('div');
  d.className = 'equip-slot empty';
  d.style.width = `${size}px`;
  d.style.height = `${size}px`;
  d.title = `${label}: sin asignar`;
  const s = document.createElement('span');
  s.className = 'muted pixel-sm';
  s.style.fontSize = '11px';
  s.textContent = '?';
  d.appendChild(s);
  return d;
}

/**
 * @param {object} opts
 * @param {object} opts.build
 * @param {Object<string,object>} [opts.itemsById]
 * @param {number}  [opts.size=44]
 * @param {Function} [opts.onOpen]      Editar/abrir
 * @param {Function} [opts.onDuplicate]
 * @param {Function} [opts.onExport]
 * @param {Function} [opts.onDelete]
 * @param {{label:string,onClick:Function,kind?:string}[]} [opts.extraActions]
 */
export function buildCard({ build, itemsById = {}, size = 44, onOpen, onDuplicate, onExport, onDelete, extraActions = [] } = {}) {
  const panel = document.createElement('div');
  panel.className = 'mc-panel';

  // Cabecera: nombre + objetivo + score
  const head = document.createElement('div');
  head.className = 'row';
  const name = document.createElement('h3');
  name.className = 'pixel-sm';
  name.style.margin = '0';
  name.innerHTML = escapeHtml(build?.name || 'Sin nombre');
  head.appendChild(name);
  if (build?.goal) {
    const g = document.createElement('span');
    g.className = 'mc-tag';
    g.innerHTML = escapeHtml(goalLabel(build.goal));
    head.appendChild(g);
  }
  const grow = document.createElement('span');
  grow.className = 'grow';
  head.appendChild(grow);
  const score = document.createElement('span');
  score.className = 'pixel-sm';
  score.style.color = 'var(--accent-gold)';
  score.textContent = scoreBadgeText(build?.score);
  score.title = scoreTitleAttr(build?.score);
  head.appendChild(score);
  panel.appendChild(head);

  // Minislots: melee, ranged, armor + 3 artefactos
  const slots = document.createElement('div');
  slots.className = 'row wrap';
  slots.style.marginTop = '10px';
  const slotIds = [
    ...SLOT_DEFS.map(([k, l]) => [build?.[k], l]),
    ...[0, 1, 2].map((i) => [build?.artifactItemIds?.[i], `Artefacto ${i + 1}`]),
  ];
  for (const [itemId, label] of slotIds) {
    const item = itemId ? itemsById[itemId] : null;
    if (item) {
      slots.appendChild(itemCard({
        item, size, showPower: false, showQty: false, showFav: false,
        title: `${label}: ${item.localizedName || item.name}`,
        onClick: onOpen ? () => onOpen(build) : undefined,
      }));
    } else {
      slots.appendChild(emptySlot(label, size));
    }
  }
  panel.appendChild(slots);

  // Acciones
  const acts = [...extraActions];
  if (onOpen) acts.push({ label: 'Abrir', onClick: () => onOpen(build) });
  if (onDuplicate) acts.push({ label: 'Duplicar', onClick: () => onDuplicate(build) });
  if (onExport) acts.push({ label: 'Exportar', onClick: () => onExport(build) });
  if (onDelete) acts.push({ label: 'Borrar', kind: 'danger', onClick: () => onDelete(build) });
  if (acts.length) {
    const row = document.createElement('div');
    row.className = 'row wrap';
    row.style.marginTop = '10px';
    for (const a of acts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `mc-btn mc-btn--sm${a.kind ? ` mc-btn--${a.kind}` : ''}`;
      b.innerHTML = escapeHtml(a.label);
      b.addEventListener('click', a.onClick);
      row.appendChild(b);
    }
    panel.appendChild(row);
  }
  return panel;
}
