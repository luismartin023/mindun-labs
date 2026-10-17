/**
 * ui/enchantSlots.js — Selección de encantamientos SIN teclear:
 * dropdown con iconos + buscador, editor de 3 espacios (rombos) con niveles
 * I/II/III, selector simple y picker múltiple con chips.
 */
import { enchantName } from './format.js';
import { escapeHtml } from '../app.js';

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

const ROMAN = ['I', 'II', 'III', 'IV'];

/** Opciones de encantamiento por espacio según la ficha del ítem.
 *  Si el ítem declara enchantmentSlots se usan; si no, todos los compatibles. */
export function slotOptionsFor(item, enchMap) {
  const bySlot = [[], [], []];
  const slots = Array.isArray(item?.enchantmentSlots) ? item.enchantmentSlots : [];
  if (slots.length) {
    for (const s of slots) {
      const idx = Math.min(2, Math.max(0, (s.slotIndex || 1) - 1));
      bySlot[idx] = (s.options || []).map((o) =>
        enchMap[o.enchantmentId] || { id: o.enchantmentId, name: o.enchantmentId });
    }
  } else if (acceptsEnchants(item?.category)) {
    const compat = compatibleEnchantments(Object.values(enchMap || {}), item.category);
    bySlot[0] = bySlot[1] = bySlot[2] = compat;
  }
  return bySlot;
}

function enchIcon(ench, counterRotate = false) {
  if (!ench) {
    const g = document.createElement('span');
    g.className = 'muted';
    g.textContent = '◇';
    if (counterRotate) g.style.transform = 'rotate(-45deg)';
    return g;
  }
  if (ench.imagePath) {
    const img = document.createElement('img');
    img.src = ench.imagePath;
    img.alt = enchantName(ench);
    img.draggable = false;
    if (counterRotate) img.style.transform = 'rotate(-45deg)';
    img.addEventListener('error', () => img.replaceWith(initial(ench, counterRotate)), { once: true });
    return img;
  }
  return initial(ench, counterRotate);
}

function initial(ench, counterRotate) {
  const s = document.createElement('span');
  if (counterRotate) s.style.transform = 'rotate(-45deg)';
  s.style.fontFamily = 'var(--font-pixel)';
  s.style.fontSize = '12px';
  s.style.color = 'var(--accent-purple)';
  s.textContent = (enchantName(ench) || '?').charAt(0).toUpperCase();
  return s;
}

const TYPE_LABEL = { melee: 'Cuerpo a cuerpo', ranged: 'A distancia', armor: 'Armadura', universal: 'Universal' };

/** Nivel máximo registrado de un encantamiento (tiers[] del seed). */
const maxTier = (ench) => Math.max(1, Math.min(4, (ench?.tiers || []).length || 1));

/**
 * Lista de opciones con buscador + iconos (role=listbox).
 * Devuelve el panel; onPick(null) = "vaciar".
 */
function optionPanel({ options, selectedId, onPick, title = 'Elegir encantamiento', allowEmpty = true }) {
  const panel = document.createElement('div');
  panel.className = 'ench-dd__panel';
  panel.setAttribute('role', 'listbox');
  panel.setAttribute('aria-label', title);

  const search = document.createElement('input');
  search.className = 'mc-input ench-dd__search';
  search.type = 'search';
  search.placeholder = 'Filtrar encantamientos…';
  search.setAttribute('aria-label', 'Filtrar encantamientos');
  panel.appendChild(search);

  const list = document.createElement('div');
  list.className = 'ench-dd__list';
  panel.appendChild(list);

  function row(ench, id) {
    const opt = document.createElement('div');
    opt.className = `ench-option${selectedId === id ? ' chosen' : ''}`;
    opt.setAttribute('role', 'option');
    opt.setAttribute('aria-selected', selectedId === id ? 'true' : 'false');
    opt.tabIndex = -1;
    const ic = document.createElement('span');
    ic.className = 'ench-option__icon';
    ic.appendChild(enchIcon(ench, false));
    const nm = document.createElement('span');
    nm.className = 'nm';
    if (!ench) {
      nm.classList.add('muted');
      nm.textContent = '— Vaciar espacio —';
    } else {
      nm.innerHTML = escapeHtml(enchantName(ench));
      if (ench.localizedName && ench.localizedName !== ench.name) {
        const sub = document.createElement('span');
        sub.className = 'muted ench-option__es';
        sub.textContent = ench.localizedName;
        nm.appendChild(sub);
      }
    }
    opt.append(ic, nm);
    if (ench?.enchantType) {
      const t = document.createElement('span');
      t.className = 'tier';
      t.textContent = `${TYPE_LABEL[ench.enchantType] || ench.enchantType} · Nv.${maxTier(ench)}`;
      opt.appendChild(t);
    }
    opt.addEventListener('click', () => onPick(id));
    opt.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onPick(id); }
      if (ev.key === 'ArrowDown') { ev.preventDefault(); opt.nextElementSibling?.focus(); }
      if (ev.key === 'ArrowUp') { ev.preventDefault(); (opt.previousElementSibling || search).focus(); }
    });
    return opt;
  }

  function draw(filter = '') {
    const q = filter.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    list.innerHTML = '';
    if (allowEmpty) list.appendChild(row(null, null));
    const hits = options.filter((e) => !q ||
      `${e.name} ${e.localizedName || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q));
    for (const e of hits) list.appendChild(row(e, e.id));
    if (!hits.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.style.padding = '8px';
      p.textContent = `Sin encantamientos para «${filter}».`;
      list.appendChild(p);
    }
  }
  draw();
  search.addEventListener('input', () => draw(search.value));
  search.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); list.querySelector('.ench-option')?.focus(); }
  });
  return { panel, search };
}

/**
 * Dropdown de encantamiento (botón con icono+nombre → panel buscable).
 * @param {object} opts
 * @param {object[]} opts.options    EnchantmentRecord[]
 * @param {string|null} [opts.value] id seleccionado
 * @param {Function} opts.onPick     (id|null) => {}
 * @param {string} [opts.placeholder]
 * @param {boolean} [opts.allowEmpty=true] incluye "Vaciar"
 * @returns {HTMLElement}
 */
export function enchantDropdown({ options = [], value = null, onPick, placeholder = 'Elegir encantamiento…', allowEmpty = true } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ench-dd';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mc-btn ench-dd__btn';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');

  const paint = () => {
    const ench = options.find((e) => e.id === value) || null;
    btn.innerHTML = '';
    const ic = document.createElement('span');
    ic.className = 'ench-option__icon';
    ic.appendChild(enchIcon(ench, false));
    const nm = document.createElement('span');
    nm.className = ench ? 'nm' : 'nm muted';
    nm.textContent = ench ? enchantName(ench) : placeholder;
    const caret = document.createElement('span');
    caret.className = 'ench-dd__caret';
    caret.textContent = '▾';
    btn.append(ic, nm, caret);
  };
  paint();
  wrap.appendChild(btn);

  let open = false;
  const closePanel = () => { open = false; btn.setAttribute('aria-expanded', 'false'); wrap.querySelector('.ench-dd__panel')?.remove(); };
  btn.addEventListener('click', () => {
    if (open) { closePanel(); return; }
    open = true;
    btn.setAttribute('aria-expanded', 'true');
    const { panel, search } = optionPanel({
      options, selectedId: value, allowEmpty,
      onPick: (id) => { value = id; paint(); closePanel(); onPick?.(id); },
    });
    wrap.appendChild(panel);
    search.focus();
  });
  const onDoc = (ev) => { if (open && !wrap.contains(ev.target)) closePanel(); };
  document.addEventListener('pointerdown', onDoc);
  wrap.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && open) { ev.stopPropagation(); closePanel(); btn.focus(); } });
  // limpieza al desconectar del DOM
  new MutationObserver((muts, obs) => {
    if (!wrap.isConnected) { document.removeEventListener('pointerdown', onDoc); obs.disconnect(); }
  }).observe(document.body, { childList: true, subtree: true });
  return wrap;
}

/**
 * Editor de 3 espacios con dropdowns con icono por espacio + niveles.
 * @param {object} opts
 * @param {object} [opts.item]           CatalogItem (contexto)
 * @param {(string|null)[]} opts.selectedIds
 * @param {Array<Array<object>>} [opts.optionsBySlot]
 * @param {{enchantmentId:string,tier:number}[]} [opts.tiers] niveles actuales
 * @param {Function} [opts.onChange]     (ids[3]) => {}
 * @param {Function} [opts.onTiersChange] ([{enchantmentId,tier}]) => {}
 * @returns {HTMLElement}
 */
export function enchantSlotsEditor({ item, selectedIds = [], optionsBySlot = [], tiers = [], onChange, onTiersChange } = {}) {
  const ids = [...(selectedIds || [])].slice(0, 3);
  while (ids.length < 3) ids.push(null);
  const tierMap = Object.fromEntries((tiers || []).map((t) => [t.enchantmentId, t.tier]));

  const wrap = document.createElement('div');
  wrap.className = 'ench-editor';
  const slotsRow = document.createElement('div');
  slotsRow.className = 'ench-slots';
  wrap.appendChild(slotsRow);

  const findEnch = (id) => {
    if (!id) return null;
    for (const opts of optionsBySlot) {
      const hit = (opts || []).find((e) => e.id === id);
      if (hit) return hit;
    }
    return null;
  };

  const closeAll = () => wrap.querySelectorAll('.ench-slot-dd').forEach((d) => { d.style.display = 'none'; });
  const onDoc = (ev) => { if (!wrap.contains(ev.target)) closeAll(); };
  document.addEventListener('pointerdown', onDoc);
  wrap.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeAll(); });
  new MutationObserver((muts, obs) => {
    if (!wrap.isConnected) { document.removeEventListener('pointerdown', onDoc); obs.disconnect(); }
  }).observe(document.body, { childList: true, subtree: true });

  function render() {
    slotsRow.innerHTML = '';
    let anyTier = false;

    ids.forEach((id, i) => {
      const ench = id ? findEnch(id) : null;
      // Columna: rombo + etiqueta + nivel + dropdown anclado
      const col = document.createElement('div');
      col.className = 'ench-col';

      const slot = document.createElement('div');
      slot.className = `ench-slot${id ? ' filled' : ''}`;
      slot.title = ench ? `${enchantName(ench)} — clic para cambiar` : `Espacio ${i + 1} vacío — clic para elegir`;
      slot.setAttribute('role', 'button');
      slot.setAttribute('aria-haspopup', 'listbox');
      slot.setAttribute('aria-label', slot.title);
      slot.tabIndex = 0;
      if (ench) slot.appendChild(enchIcon(ench));
      col.appendChild(slot);

      const n = document.createElement('span');
      n.className = 'ench-slot__n';
      n.textContent = ench ? enchantName(ench) : `Espacio ${i + 1}`;
      col.appendChild(n);

      // nivel I/II/III bajo el rombo si el encantamiento tiene tiers
      if (ench && maxTier(ench) > 1) {
        anyTier = true;
        const group = document.createElement('div');
        group.className = 'ench-tier-pick';
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', `Nivel de ${enchantName(ench)}`);
        for (let t = 1; t <= maxTier(ench); t++) {
          const c = document.createElement('button');
          c.type = 'button';
          c.className = `ench-tier-chip${(tierMap[ench.id] ?? maxTier(ench)) === t ? ' on' : ''}`;
          c.textContent = ROMAN[t - 1];
          c.title = `${enchantName(ench)} nivel ${ROMAN[t - 1]}`;
          c.addEventListener('click', (ev) => {
            ev.stopPropagation();
            tierMap[ench.id] = t;
            onTiersChange?.(Object.entries(tierMap).map(([enchantmentId, tier]) => ({ enchantmentId, tier })));
            render();
          });
          group.appendChild(c);
        }
        col.appendChild(group);
      } else if (ench) {
        const lv = document.createElement('span');
        lv.className = 'muted ench-slot__n';
        lv.textContent = `Nv.${ROMAN[maxTier(ench) - 1]}`;
        col.appendChild(lv);
      }

      // dropdown anclado bajo la columna
      const ddWrap = document.createElement('div');
      ddWrap.className = 'ench-slot-dd';
      ddWrap.style.display = 'none';
      const taken = new Set(ids.filter((x, j) => j !== i && x));
      const opts = (optionsBySlot[i] || []).filter((o) => !taken.has(o.id));
      const { panel, search } = optionPanel({
        options: opts,
        selectedId: id,
        title: `Encantamiento — espacio ${i + 1}`,
        onPick: (newId) => {
          const old = ids[i];
          ids[i] = newId;
          if (!newId && old) delete tierMap[old];
          ddWrap.style.display = 'none';
          onChange?.([...ids]);
          render();
        },
      });
      ddWrap.appendChild(panel);
      col.appendChild(ddWrap);

      const toggle = () => {
        const show = ddWrap.style.display === 'none';
        closeAll();
        if (show) { ddWrap.style.display = 'block'; search.focus(); }
      };
      slot.addEventListener('click', toggle);
      slot.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
        if (ev.key === 'Escape') closeAll();
      });

      slotsRow.appendChild(col);
    });

    if (!anyTier && ids.every((x) => !x)) {
      const hint = document.createElement('p');
      hint.className = 'muted';
      hint.style.cssText = 'margin:4px 0 0;font-size:10px;width:100%';
      hint.textContent = 'Clic en un rombo para elegir; el nivel se ajusta con los chips I/II/III.';
      slotsRow.appendChild(hint);
    }
  }

  render();
  return wrap;
}

/**
 * Picker múltiple: chips con icono+✕ + dropdown para añadir.
 * @param {object} opts
 * @param {object[]} opts.options
 * @param {string[]} [opts.values]
 * @param {Function} opts.onChange  (ids[]) => {}
 * @param {string} [opts.placeholder]
 * @returns {HTMLElement}
 */
export function enchantChipsPicker({ options = [], values = [], onChange, placeholder = 'Añadir encantamiento…' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'ench-chips-picker';
  const chips = document.createElement('div');
  chips.className = 'ench-chips';
  wrap.appendChild(chips);

  const byId = Object.fromEntries(options.map((e) => [e.id, e]));

  function draw() {
    chips.innerHTML = '';
    for (const id of values) {
      const ench = byId[id];
      const c = document.createElement('span');
      c.className = 'ench-chip';
      if (ench?.imagePath) {
        const img = document.createElement('img');
        img.src = ench.imagePath; img.alt = '';
        c.appendChild(img);
      }
      const nm = document.createElement('span');
      nm.textContent = ench ? enchantName(ench) : id;
      const x = document.createElement('button');
      x.type = 'button';
      x.textContent = '✕';
      x.title = 'Quitar';
      x.setAttribute('aria-label', `Quitar ${enchantName(ench)}`);
      x.addEventListener('click', () => {
        values = values.filter((v) => v !== id);
        onChange?.([...values]);
        draw();
      });
      c.append(nm, x);
      chips.appendChild(c);
    }
    const dd = enchantDropdown({
      options: options.filter((o) => !values.includes(o.id)),
      value: null,
      placeholder,
      allowEmpty: false,
      onPick: (id) => {
        if (id && !values.includes(id)) {
          values = [...values, id];
          onChange?.([...values]);
          draw();
        }
      },
    });
    dd.style.minWidth = '190px';
    chips.appendChild(dd);
  }
  draw();
  return wrap;
}
