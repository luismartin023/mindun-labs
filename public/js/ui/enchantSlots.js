/**
 * ui/enchantSlots.js — Editor de 3 espacios de encantamiento (rombos .ench-slot)
 * y rombo de solo lectura. Compatibilidad por tipo de ítem según dominio.
 */
import { enchantName } from './format.js';

/** Tipo de encantamiento compatible con cada categoría de equipo. */
const ENCH_TYPE_BY_CAT = Object.freeze({
  melee_weapon: 'melee', ranged_weapon: 'ranged', armor: 'armor',
});

/** Encantamientos compatibles con una categoría de ítem (incluye 'universal'). */
export function compatibleEnchantments(list, category) {
  const t = ENCH_TYPE_BY_CAT[category];
  if (!t) return [];
  return (list || []).filter((e) => e.enchantType === t || e.enchantType === 'universal');
}

/** ¿La categoría admite espacios de encantamiento? (artefactos: no). */
export function acceptsEnchants(category) {
  return Boolean(ENCH_TYPE_BY_CAT[category]);
}

function enchImgOrInitial(ench) {
  if (ench?.imagePath) {
    const img = document.createElement('img');
    img.src = ench.imagePath;
    img.alt = enchantName(ench);
    img.draggable = false;
    img.addEventListener('error', () => img.replaceWith(initial(ench)), { once: true });
    return img;
  }
  return initial(ench);
}

function initial(ench) {
  const s = document.createElement('span');
  s.style.transform = 'rotate(-45deg)';
  s.style.fontFamily = 'var(--font-pixel)';
  s.style.fontSize = '12px';
  s.style.color = 'var(--accent-purple)';
  s.textContent = (enchantName(ench) || '?').charAt(0).toUpperCase();
  return s;
}

/** Rombo pequeño de solo lectura con el icono del encantamiento. */
export function enchantDiamond(ench) {
  const d = document.createElement('div');
  d.className = `ench-slot${ench ? ' filled' : ''}`;
  d.style.cursor = 'default';
  d.style.width = '40px';
  d.style.height = '40px';
  if (ench) {
    d.title = enchantName(ench);
    d.appendChild(enchImgOrInitial(ench));
  }
  return d;
}

/**
 * Editor de 3 espacios. optionsBySlot: [[enchantment,...] x3].
 * @param {object} opts
 * @param {object} [opts.item]           CatalogItem (contexto/título).
 * @param {(string|null)[]} opts.selectedIds
 * @param {Array<Array<object>>} [opts.optionsBySlot]
 * @param {Function} [opts.onChange]     Recibe nueva selección [e1,e2,e3].
 * @returns {HTMLElement}
 */
export function enchantSlotsEditor({ item, selectedIds = [], optionsBySlot = [], onChange } = {}) {
  const ids = [...(selectedIds || [])].slice(0, 3);
  while (ids.length < 3) ids.push(null);

  const wrap = document.createElement('div');
  const slotsRow = document.createElement('div');
  slotsRow.className = 'ench-slots';
  const pickerWrap = document.createElement('div');
  wrap.append(slotsRow, pickerWrap);

  let openSlot = -1;

  function findEnch(id, slotIdx) {
    if (!id) return null;
    const local = (optionsBySlot[slotIdx] || []).find((e) => e.id === id);
    if (local) return local;
    for (const opts of optionsBySlot) {
      const hit = (opts || []).find((e) => e.id === id);
      if (hit) return hit;
    }
    return null;
  }

  function render() {
    slotsRow.innerHTML = '';
    pickerWrap.innerHTML = '';

    ids.forEach((id, i) => {
      const ench = id ? findEnch(id, i) : null;
      const slot = document.createElement('div');
      slot.className = `ench-slot${id ? ' filled' : ''}`;
      slot.title = ench ? enchantName(ench) : `Espacio ${i + 1} vacío`;
      slot.setAttribute('role', 'button');
      slot.tabIndex = 0;
      if (ench) slot.appendChild(enchImgOrInitial(ench));
      const n = document.createElement('span');
      n.className = 'ench-slot__n';
      n.textContent = `Espacio ${i + 1}`;
      slot.appendChild(n);
      const toggle = () => { openSlot = openSlot === i ? -1 : i; render(); };
      slot.addEventListener('click', toggle);
      slot.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
      });
      slotsRow.appendChild(slot);
    });

    if (openSlot >= 0) {
      const picker = document.createElement('div');
      picker.className = 'ench-picker';

      const empty = document.createElement('div');
      empty.className = `ench-option${ids[openSlot] ? '' : ' chosen'}`;
      empty.innerHTML = '<span class="nm muted">Vaciar espacio</span>';
      empty.addEventListener('click', () => {
        ids[openSlot] = null;
        onChange?.([...ids]);
        openSlot = -1;
        render();
      });
      picker.appendChild(empty);

      for (const ench of optionsBySlot[openSlot] || []) {
        const opt = document.createElement('div');
        opt.className = `ench-option${ids[openSlot] === ench.id ? ' chosen' : ''}`;
        const icon = document.createElement('span');
        icon.style.width = '26px';
        icon.style.height = '26px';
        icon.style.display = 'inline-flex';
        icon.style.alignItems = 'center';
        icon.style.justifyContent = 'center';
        icon.appendChild(enchImgOrInitial(ench));
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = enchantName(ench);
        opt.append(icon, nm);
        const maxTier = Array.isArray(ench.tiers) && ench.tiers.length ? ench.tiers.length : null;
        if (maxTier) {
          const t = document.createElement('span');
          t.className = 'tier';
          t.textContent = `Nv.${maxTier}`;
          opt.appendChild(t);
        }
        opt.addEventListener('click', () => {
          ids[openSlot] = ench.id;
          onChange?.([...ids]);
          openSlot = -1;
          render();
        });
        picker.appendChild(opt);
      }

      if (!(optionsBySlot[openSlot] || []).length) {
        const hint = document.createElement('p');
        hint.className = 'muted';
        hint.style.margin = '4px 0';
        hint.textContent = 'No hay encantamientos registrados para este espacio.';
        picker.appendChild(hint);
      }
      pickerWrap.appendChild(picker);
    }
  }

  render();
  return wrap;
}
