/**
 * screens/inventory.js — Pantalla principal: layout 3 zonas de la captura
 * (personaje | cuadrícula | detalle), filtros, copias, encantamientos.
 */
import { escapeHtml } from '../app.js';
import { createCharacterViewer } from '../three/characterViewer.js';
import { confirmDialog } from '../ui/confirm.js';
import { enchantSlotsEditor, enchantDropdown, acceptsEnchants } from '../ui/enchantSlots.js';
import { openItemPicker } from '../ui/itemPicker.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { itemTitle } from '../ui/format.js';

export const title = 'Inventario';

// ---------- iconos SVG de categorías (pixel-ish, inline) ----------
const ICONS = {
  all: '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6"/><rect x="9" y="1" width="6" height="6"/><rect x="1" y="9" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/></svg>',
  melee_weapon: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M14 1L9 6l-1-1-1 1 1 1-1 1 1 1 5-5 2-3-1-1zM6 9l-5 5 1 1 5-5z"/></svg>',
  ranged_weapon: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M11 1c-4 2-6 6-6 14M11 1c2 4 2 10 0 14M11 8H3"/><path d="M3 6l2 2-2 2"/></svg>',
  armor: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1L2 4v4c0 4 3 6 6 7 3-1 6-3 6-7V4L8 1z"/></svg>',
  artifact: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6 1h4v3l3 8a3 3 0 01-3 3H6a3 3 0 01-3-3l3-8V1z"/></svg>',
  enchantment: '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l2 4 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z"/></svg>',
};
const CAT_ORDER = [
  { key: null, label: 'Todos', icon: 'all' },
  { key: 'melee_weapon', label: 'Cuerpo a cuerpo', icon: 'melee_weapon' },
  { key: 'ranged_weapon', label: 'A distancia', icon: 'ranged_weapon' },
  { key: 'armor', label: 'Armaduras', icon: 'armor' },
  { key: 'artifact', label: 'Artefactos', icon: 'artifact' },
];
const RARITY_LABEL = { common: 'COMÚN', rare: 'RARO', unique: 'ÚNICO', gilded: 'DORADO', special: 'ESPECIAL', unknown: 'DESCONOCIDA' };
const CAT_LABEL = { melee_weapon: 'Cuerpo a cuerpo', ranged_weapon: 'A distancia', armor: 'Armadura', artifact: 'Artefacto', enchantment: 'Encantamiento' };
const TYPE_FOR_ENCH = { melee_weapon: ['melee', 'universal'], ranged_weapon: ['ranged', 'universal'], armor: ['armor', 'universal'] };
const EQUIP_SLOT_CATEGORIES = Object.freeze({
  melee: 'melee_weapon', ranged: 'ranged_weapon', armor: 'armor',
  art1: 'artifact', art2: 'artifact', art3: 'artifact',
});

export async function mount(el, ctx) {
  const { api, bus, signal } = ctx;
  const state = {
    entries: [], enchants: [], meta: null, profile: null,
    itemsById: new Map(),
    selectedId: null, filters: { category: null, search: '', sort: 'power-desc' },
    prefs: { ...(ctx.prefs || {}) },
    viewer: null,
  };

  el.innerHTML = `
    <section class="screen-home">
      <div class="zone-character">
        <div class="equip-row" id="equip-top"></div>
        <div class="char-stage" id="char-stage">
          <div class="char-fallback">
            <span class="pixel">Sin WebGL</span>
            <span>El personaje 3D necesita WebGL. El resto de la app sigue disponible.</span>
          </div>
        </div>
        <div class="char-badges">
          <div class="char-badge"><span class="char-badge__label">NIVEL</span><span class="char-badge__value" id="char-level">—</span></div>
          <div class="char-badge"><span class="char-badge__label">PODER</span><span class="char-badge__value" id="char-power">—</span></div>
        </div>
        <div class="equip-row" id="equip-bottom"></div>
      </div>
      <div class="zone-grid">
        <div class="catbar" id="catbar"></div>
        <div class="row">
          <div class="searchbar grow">
            <input class="mc-input" id="inv-search" type="search" placeholder="Buscar por nombre, alias, efecto…" aria-label="Buscar en inventario">
          </div>
          <select class="mc-select" id="inv-sort" style="max-width:190px" aria-label="Ordenar">
            <option value="power-desc">Poder ↓</option>
            <option value="power-asc">Poder ↑</option>
            <option value="name">Nombre</option>
            <option value="rarity">Rareza</option>
            <option value="updatedAt">Recientes</option>
          </select>
          <button class="mc-iconbtn" id="inv-add" title="Añadir copia al inventario" aria-label="Añadir copia">＋</button>
        </div>
        <div class="inv-scroll"><div class="mc-grid" id="inv-grid"></div>
          <div id="inv-empty" class="hidden"></div></div>
      </div>
      <aside class="zone-detail" id="detail" aria-live="polite"></aside>
    </section>`;

  // ---------- helpers locales ----------
  const $ = (s) => el.querySelector(s);

  // ---------- carga ----------
  async function loadAll() {
    const [inv, ench, meta, profile] = await Promise.all([
      api.getAll('/api/inventory'),
      api.getAll('/api/enchantments'),
      api.get('/api/meta').catch(() => null),
      api.get('/api/profile').catch(() => null),
    ]);
    state.entries = inv.map(normEntry);
    state.enchants = ench;
    state.meta = meta;
    state.profile = profile;
    if (!state.entries.length) renderEmpty();
    else {
      if (!state.selectedId || !state.entries.find((e) => e.id === state.selectedId)) {
        state.selectedId = state.entries[0].id;
      }
      renderAll();
    }
  }

  /** Normaliza una copia del API (camelCase dominio) al shape interno snake. */
  const normEntry = (r) => ({
    ...r,
    id: r.id,
    item_id: r.item_id ?? r.itemId,
    quantity: r.quantity ?? 1,
    power_level: r.power_level ?? r.powerLevel ?? null,
    item_level: r.item_level ?? r.itemLevel ?? null,
    is_favorite: r.is_favorite ?? r.isFavorite ?? 0,
    is_gilded: r.is_gilded ?? r.isGilded ?? 0,
    selected_enchant_ids: r.selected_enchant_ids ?? r.selectedEnchantIds ?? [null, null, null],
    enchant_tiers: r.enchant_tiers ?? r.enchantTiers ?? [],
    notes: r.notes ?? null,
    updated_at: r.updated_at ?? r.updatedAt,
  });

  /** Traduce campos internos snake → body camelCase que acepta el API. */
  const toApiPatch = (b) => ({
    ...(b.quantity !== undefined && { quantity: b.quantity }),
    ...(b.power_level !== undefined && { powerLevel: b.power_level }),
    ...(b.item_level !== undefined && { itemLevel: b.item_level }),
    ...(b.is_favorite !== undefined && { isFavorite: !!b.is_favorite }),
    ...(b.is_gilded !== undefined && { isGilded: !!b.is_gilded }),
    ...(b.selected_enchant_ids !== undefined && { selectedEnchantIds: b.selected_enchant_ids }),
    ...(b.enchant_tiers !== undefined && { enchantTiers: b.enchant_tiers }),
    ...(b.gilded_enchantment_id !== undefined && { gildedEnchantmentId: b.gilded_enchantment_id }),
    ...(b.notes !== undefined && { notes: b.notes }),
  });

  /** Columna tolerante a prefijos del join (x, item_x o itemX). */
  const camel = (s) => `item${s.replace(/(^|_)(\w)/g, (_m, _p, c) => c.toUpperCase())}`;
  const col = (e, name) => e[name] ?? e[`item_${name}`] ?? e[camel(name)];

  const entryItem = (e) => ({
    id: e.item_id || e.itemId,
    name: e.localized_name || col(e, 'name'),
    rarity: col(e, 'rarity') || 'unknown',
    category: col(e, 'category'),
    imagePath: col(e, 'image') || col(e, 'image_path') || col(e, 'imagePath'),
  });

  // ---------- zona izquierda: personaje + equipo ----------
  function renderCharacter() {
    const p = state.profile || {};
    $('#char-level').textContent = p.level ?? '—';
    $('#char-power').textContent = p.power ?? '—';
    if (!state.viewer) {
      try {
        state.viewer = createCharacterViewer($('#char-stage'), {
          paused: state.prefs.motion3d === false,
        });
      } catch { $('#char-stage').classList.add('no-webgl'); }
    }
    state.viewer?.setPaused(state.prefs.motion3d === false);
    renderEquip();
  }

  function renderEquip() {
    const eq = state.profile?.prefs?.equipped || {};
    $('#equip-top').innerHTML = '';
    $('#equip-bottom').innerHTML = '';
    const slots = [
      { key: 'melee', label: 'Cuerpo a cuerpo', category: 'melee_weapon', zone: 'top' },
      { key: 'ranged', label: 'A distancia', category: 'ranged_weapon', zone: 'top' },
      { key: 'armor', label: 'Armadura', category: 'armor', zone: 'top' },
      { key: 'art1', label: 'Artefacto 1', category: 'artifact', zone: 'bottom' },
      { key: 'art2', label: 'Artefacto 2', category: 'artifact', zone: 'bottom' },
      { key: 'art3', label: 'Artefacto 3', category: 'artifact', zone: 'bottom' },
    ];
    for (const s of slots) {
      const host = s.zone === 'top' ? $('#equip-top') : $('#equip-bottom');
      const entryId = eq[s.key];
      const candidate = entryId ? state.entries.find((e) => e.id === entryId) : null;
      const entry = candidate && candidate.quantity > 0 && entryItem(candidate).category === s.category
        ? candidate
        : null;
      const div = document.createElement('button');
      div.type = 'button';
      div.className = `equip-slot ${entry ? '' : 'empty'}`;
      div.title = entry ? `${s.label}: ${entryItem(entry).name}. Clic para cambiar o retirar.`
        : `${s.label}: vacío. Clic para elegir una copia.`;
      div.setAttribute('aria-label', div.title);
      div.setAttribute('aria-pressed', entry ? 'true' : 'false');
      if (entry) {
        const it = entryItem(entry);
        div.innerHTML = it.imagePath
          ? `<img src="${it.imagePath}" alt="${escapeHtml(it.name)}"><span class="equip-slot__power">${entry.power_level ?? ''}</span>`
          : `<div class="mc-img-missing">${escapeHtml(it.name?.[0] || '?')}</div>`;
      } else {
        const short = { melee: 'Melee', ranged: 'Distancia', armor: 'Armadura', art1: 'Artef.', art2: 'Artef.', art3: 'Artef.' }[s.key] || s.label;
        div.innerHTML = `<span class="muted equip-slot__label">${short}</span>`;
      }
      div.addEventListener('click', () => openInventoryEntryPicker(s, entry, Boolean(entryId)));
      host.append(div);
    }
  }

  function openInventoryEntryPicker(slot, currentEntry, isAssigned = false) {
    const options = state.entries.filter((entry) =>
      entry.quantity > 0 && entryItem(entry).category === slot.category);
    const body = document.createElement('div');
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'mc-input';
    search.placeholder = `Buscar ${slot.label.toLowerCase()}…`;
    search.setAttribute('aria-label', `Buscar ${slot.label.toLowerCase()}`);
    const list = document.createElement('div');
    list.className = 'inv-pick-list';
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent = `${options.length} copia${options.length === 1 ? '' : 's'} compatible${options.length === 1 ? '' : 's'}`;
    body.append(search, hint, list);

    const renderOptions = () => {
      const query = search.value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      list.innerHTML = '';
      const hits = options.filter((entry) => {
        const item = fullItem(entry);
        const haystack = [
          entryItem(entry).name, item.name, item.localizedName,
          ...(item.aliases || []), entry.power_level,
        ].filter(Boolean).join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return haystack.includes(query);
      });
      if (!hits.length) {
        const empty = document.createElement('p');
        empty.className = 'muted inv-pick-list__empty';
        empty.textContent = options.length ? 'No hay copias que coincidan.' : 'No tienes copias compatibles en el inventario.';
        list.appendChild(empty);
        return;
      }
      for (const entry of hits) {
        const item = { ...fullItem(entry), ...entryItem(entry) };
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'inv-pick-option';
        const image = document.createElement('span');
        image.className = 'inv-pick-option__image';
        if (item.imagePath) {
          const img = document.createElement('img');
          img.src = item.imagePath;
          img.alt = '';
          img.loading = 'lazy';
          img.addEventListener('error', () => {
            const fallback = document.createElement('span');
            fallback.className = 'mc-img-missing';
            fallback.textContent = item.name?.[0] || '?';
            img.replaceWith(fallback);
          }, { once: true });
          image.appendChild(img);
        } else {
          const fallback = document.createElement('span');
          fallback.className = 'mc-img-missing';
          fallback.textContent = item.name?.[0] || '?';
          image.appendChild(fallback);
        }
        const details = document.createElement('span');
        details.className = 'inv-pick-option__details';
        const name = document.createElement('strong');
        name.textContent = item.localizedName || item.localized_name || item.name || 'Sin nombre';
        const meta = document.createElement('span');
        meta.textContent = `Poder ${entry.power_level ?? '—'} · Cantidad ${entry.quantity}`;
        details.append(name, meta);
        const badge = document.createElement('span');
        badge.className = 'mc-tag';
        badge.textContent = entry.id === currentEntry?.id ? 'Equipado' : 'Elegir';
        row.append(image, details, badge);
        row.addEventListener('click', async () => {
          row.disabled = true;
          const saved = await setEquipped(slot.key, entry.id);
          if (saved) modal.close();
          else row.disabled = false;
        });
        list.appendChild(row);
      }
    };
    search.addEventListener('input', renderOptions);
    renderOptions();

    const modal = openModal({
      title: `Equipar · ${slot.label}`,
      body,
      wide: true,
      actions: [
        ...(isAssigned ? [{
          label: 'Retirar del espacio',
          kind: 'danger',
          onClick: () => setEquipped(slot.key, null),
        }] : []),
        { label: 'Cerrar', kind: 'ghost', onClick: () => {} },
      ],
    });
  }

  // ---------- barra de categorías ----------
  function renderCatbar() {
    const bar = $('#catbar');
    bar.innerHTML = '<span class="catbar__label">Filtrar</span>';
    for (const c of CAT_ORDER) {
      const b = document.createElement('button');
      b.className = `mc-iconbtn ${state.filters.category === c.key ? 'active' : ''}`;
      b.innerHTML = ICONS[c.icon];
      b.title = c.label;
      b.setAttribute('aria-label', c.label);
      b.onclick = () => { state.filters.category = c.key; renderCatbar(); renderGrid(); };
      bar.append(b);
    }
  }

  // ---------- grid ----------
  const rarityRank = { unique: 0, gilded: 1, special: 2, rare: 3, common: 4, unknown: 5 };
  function filtered() {
    let rows = state.entries;
    const f = state.filters;
    if (f.category) rows = rows.filter((e) => entryItem(e).category === f.category);
    if (f.search) {
      const q = f.search.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      rows = rows.filter((e) => {
        const hay = [e.item_name, e.itemName, e.localized_name, e.itemLocalizedName,
          e.name, e.item_slug, e.itemSlug, e.notes]
          .filter(Boolean).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        return hay.includes(q);
      });
    }
    const cmp = {
      'power-desc': (a, b) => (b.power_level ?? -1) - (a.power_level ?? -1),
      'power-asc': (a, b) => (a.power_level ?? 999) - (b.power_level ?? 999),
      name: (a, b) => String(entryItem(a).name).localeCompare(String(entryItem(b).name), 'es'),
      rarity: (a, b) => rarityRank[entryItem(a).rarity] - rarityRank[entryItem(b).rarity],
      updatedAt: (a, b) => String(b.updated_at).localeCompare(String(a.updated_at)),
    }[f.sort];
    return [...rows].sort(cmp);
  }

  function card(entry) {
    const it = entryItem(entry);
    const div = document.createElement('div');
    div.className = `mc-card rarity-${it.rarity} ${entry.id === state.selectedId ? 'selected' : ''}`;
    div.dataset.entryId = entry.id;
    div.setAttribute('role', 'button');
    div.tabIndex = 0;
    div.title = it.name;
    const sel = (entry.selected_enchant_ids || []).filter(Boolean).length;
    div.innerHTML = `
      ${it.imagePath ? `<img src="${it.imagePath}" alt="${escapeHtml(it.name)}" loading="lazy">` : `<div class="mc-img-missing">${escapeHtml(it.name?.[0] || '?')}</div>`}
      ${sel ? `<span class="mc-card__badge">${sel}◈</span>` : ''}
      ${entry.is_favorite ? '<span class="mc-card__fav">★</span>' : ''}
      ${entry.quantity > 1 ? `<span class="mc-card__qty">×${entry.quantity}</span>` : ''}
      ${state.prefs.showPower !== false && entry.power_level != null ? `<span class="mc-card__power">⚔${entry.power_level}</span>` : ''}`;
    div.querySelector('img')?.addEventListener('error', (e) => {
      e.target.outerHTML = `<div class="mc-img-missing">${escapeHtml(it.name?.[0] || '?')}</div>`;
    });
    const select = async () => {
      state.selectedId = entry.id;
      // en tablet/móvil el detalle es un drawer: ábrelo al seleccionar
      if (innerWidth <= 1100) $('#detail').classList.add('open');
      renderGrid(); renderDetail();
      await ensureItem(entryItem(entry).id);
      if (state.selectedId === entry.id) renderDetail();
    };
    div.onclick = select;
    div.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(); } };
    return div;
  }

  function renderGrid() {
    const grid = $('#inv-grid');
    const rows = filtered();
    grid.innerHTML = '';
    $('#inv-empty').classList.toggle('hidden', rows.length > 0);
    if (!rows.length) {
      $('#inv-empty').innerHTML = `<div class="mc-empty"><p class="pixel">Sin resultados</p>
        <p>No hay copias que coincidan con el filtro.</p></div>`;
      return;
    }
    for (const e of rows) grid.append(card(e));
  }

  function renderEmpty() {
    $('#inv-grid').innerHTML = '';
    $('#inv-empty').classList.remove('hidden');
    $('#inv-empty').innerHTML = `<div class="mc-empty">
      <p class="pixel">Inventario vacío</p>
      <p>Tu catálogo tiene <strong>${state.meta?.counts?.items ?? '…'}</strong> objetos conocidos.
         Marca los que posees para empezar.</p>
      <div class="row">
        <button class="mc-btn mc-btn--primary" id="empty-add">＋ Añadir primera copia</button>
        <button class="mc-btn" id="empty-catalog">Ir al catálogo</button>
      </div></div>`;
    $('#empty-add').onclick = openAddEntry;
    $('#empty-catalog').onclick = () => ctx.navigate('catalogo');
    renderCatbar(); renderCharacter(); renderDetail();
  }

  // ---------- panel derecho: detalle ----------
  function renderDetail() {
    const host = $('#detail');
    const e = state.entries.find((x) => x.id === state.selectedId);
    if (!e) {
      host.innerHTML = `<div class="mc-empty"><p class="pixel">Sin selección</p>
        <p>Elige un objeto de la cuadrícula para ver su ficha.</p></div>`;
      return;
    }
    const it = entryItem(e);
    const fi = fullItem(e);
    const rarity = it.rarity || 'unknown';
    const passives = fi.passiveEffects || safeJson(col(e, 'passive_effects')) || [];
    const uniques = fi.uniqueEffects || safeJson(col(e, 'unique_effects')) || [];
    const locations = fi.locations || safeJson(col(e, 'locations')) || [];
    const runes = fi.runes || safeJson(col(e, 'runes')) || [];
    const builtIn = fi.builtInEnchantment ?? col(e, 'built_in_enchantment');
    host.innerHTML = `
      <div class="detail__head">
        <div>
          <div class="detail__power">${e.power_level ?? '—'}<small>PODER</small></div>
          <span class="rarity-tag ${rarity}">${RARITY_LABEL[rarity] || rarity}</span>
        </div>
        <div class="detail__img">${it.imagePath ? `<img src="${it.imagePath}" alt="${escapeHtml(it.name)}">` : `<div class="mc-img-missing">${escapeHtml(it.name?.[0] || '?')}</div>`}</div>
      </div>
      <button class="mc-iconbtn hidden" id="detail-close" aria-label="Cerrar detalle" style="position:absolute;top:8px;right:8px;z-index:2">✕</button>
      <h1 class="detail__name">${escapeHtml(it.name)}</h1>
      <div class="detail__sub">${CAT_LABEL[it.category] || it.category}
        ${e.item_level != null ? ` · Nivel ${e.item_level}` : ''}
        ${e.quantity > 1 ? ` · ×${e.quantity} copias` : ''}
        ${e.is_gilded ? ' · <span class="rarity-tag gilded">DORADO</span>' : ''}</div>
      <div class="detail__stats">
        ${passives.map((p) => `<div class="stat-row"><span class="ico">◇</span><span class="v">${escapeHtml(p)}</span></div>`).join('')}
        ${uniques.map((p) => `<div class="stat-row passive"><span class="ico">◆</span><span class="v">${escapeHtml(p)}</span></div>`).join('')}
        ${builtIn ? `<div class="stat-row"><span class="ico">◈</span><span class="k">Encantamiento fijo:</span><span class="v">${escapeHtml(builtIn)}</span></div>` : ''}
        ${(fi.comboLength ?? col(e, 'combo_length')) ? `<div class="stat-row"><span class="ico">⟳</span><span class="k">Combo:</span><span class="v">${fi.comboLength ?? col(e, 'combo_length')} golpes</span></div>` : ''}
        ${runes.length ? `<div class="stat-row"><span class="ico">ᚱ</span><span class="k">Runas:</span><span class="v">${runes.map(escapeHtml).join(' ')}</span></div>` : ''}
        ${locations.length ? `<div class="stat-row"><span class="ico">⌂</span><span class="k">Se obtiene en:</span><span class="v">${locations.map(escapeHtml).join(', ')}</span></div>` : ''}
        ${(fi.source ?? col(e, 'source')) ? `<div class="stat-row"><span class="ico">⌕</span><span class="k">Fuente:</span><span class="v">${escapeHtml(fi.source ?? col(e, 'source'))}</span></div>` : ''}
      </div>
      ${(fi.description ?? col(e, 'description')) ? `<p class="detail__desc">${escapeHtml(fi.description ?? col(e, 'description'))}</p>` : ''}
      ${e.notes ? `<p class="detail__desc" style="font-style:normal">📝 ${escapeHtml(e.notes)}</p>` : ''}
      <h3 class="detail__section-title">Encantamientos</h3>
      <div id="ench-slots"></div>
      <div class="row wrap" style="margin-top:26px; justify-content:center">
        <button class="mc-btn mc-btn--sm" id="btn-equip">Equipar</button>
        <button class="mc-btn mc-btn--sm" id="btn-fav">${e.is_favorite ? '★ Favorito' : '☆ Favorito'}</button>
        <button class="mc-btn mc-btn--sm" id="btn-edit">Editar</button>
        <button class="mc-btn mc-btn--sm" id="btn-dup">Duplicar</button>
        <button class="mc-btn mc-btn--sm mc-btn--danger" id="btn-del">${e.quantity > 1 ? 'Desarmar 1 unidad' : 'Desarmar copia'}</button>
        ${e.quantity > 1 ? '<button class="mc-btn mc-btn--sm mc-btn--danger" id="btn-del-stack">Desarmar pila</button>' : ''}
      </div>
      <div class="row" style="margin-top:10px; justify-content:center">
        <button class="mc-iconbtn" id="qty-minus" title="${e.quantity <= 1 ? 'La cantidad mínima es una copia' : 'Quitar una unidad'}" aria-label="${e.quantity <= 1 ? 'Cantidad mínima alcanzada' : 'Quitar una unidad'}" ${e.quantity <= 1 ? 'disabled' : ''}>−</button>
        <span class="pixel-sm">Cantidad: ${e.quantity}</span>
        <button class="mc-iconbtn" id="qty-plus" title="Añadir una unidad" aria-label="Añadir una unidad">＋</button>
      </div>`;

    renderEnchSlots(e);
    const closeBtn = $('#detail-close');
    closeBtn.classList.toggle('hidden', innerWidth > 1100);
    closeBtn.onclick = () => $('#detail').classList.remove('open');
    bindBusy($('#btn-fav'), () => patch(e, { is_favorite: e.is_favorite ? 0 : 1 }));
    bindBusy($('#btn-dup'), async () => {
      try {
        await api.post(`/api/inventory/${e.id}/duplicate`);
        await refreshAfterMutation();
        toast.success('Copia duplicada');
      } catch (error) { toast.error(`No se pudo duplicar: ${error.message}`); }
    });
    bindBusy($('#btn-del'), () => dismantleEntry(e, false));
    bindBusy($('#btn-del-stack'), () => dismantleEntry(e, true));
    $('#btn-equip').onclick = () => equipDialog(e);
    $('#btn-edit').onclick = () => editDialog(e);
    bindBusy($('#qty-minus'), () => e.quantity > 1 ? patch(e, { quantity: e.quantity - 1 }) : undefined);
    bindBusy($('#qty-plus'), () => patch(e, { quantity: e.quantity + 1 }));
  }

  function bindBusy(button, action) {
    if (!button) return;
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try { await action(); }
      finally {
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      }
    });
  }

  function safeJson(v) { if (Array.isArray(v)) return v; try { return JSON.parse(v || '[]'); } catch { return []; } }

  /** Ficha completa del ítem desde catálogo (pasivos, ubicaciones, descripción…). */
  async function ensureItem(itemId) {
    if (!itemId || state.itemsById.has(itemId)) return;
    try { state.itemsById.set(itemId, await api.get(`/api/items/${itemId}`)); }
    catch { state.itemsById.set(itemId, null); }
  }
  const fullItem = (e) => state.itemsById.get(entryItem(e).id) || {};

  // ---- encantamientos: editor compartido (rombos + dropdown con iconos) ----
  function enchOptionsFor(e) {
    const types = TYPE_FOR_ENCH[entryItem(e).category] || [];
    return state.enchants.filter((en) => types.includes(en.enchant_type || en.enchantType));
  }

  function renderEnchSlots(e) {
    const host = $('#ench-slots');
    if (!host) return;
    host.innerHTML = '';
    const options = enchOptionsFor(e);
    if (!options.length && !TYPE_FOR_ENCH[entryItem(e).category]?.length) {
      host.innerHTML = '<p class="muted" style="font-size:11px;margin:0">Los artefactos no admiten encantamientos.</p>';
      return;
    }
    const sel = Array.isArray(e.selected_enchant_ids)
      ? e.selected_enchant_ids
      : safeJson(e.selected_enchant_ids) || [null, null, null];
    const tiers = Array.isArray(e.enchant_tiers) ? e.enchant_tiers : safeJson(e.enchant_tiers) || [];
    const ed = enchantSlotsEditor({
      item: fullItem(e),
      selectedIds: sel,
      tiers,
      optionsBySlot: [options, options, options],
      onChange: (ids, nextTiers) => patch(e, {
        selected_enchant_ids: ids,
        enchant_tiers: nextTiers,
      }),
      onTiersChange: (t) => patch(e, { enchant_tiers: t }),
    });
    host.appendChild(ed);
  }

  // ---- equipar (lógico: guarda en profile.prefs.equipped) ----
  function equipDialog(e) {
    const cat = entryItem(e).category;
    const slot = [
      { key: 'melee', label: 'Cuerpo a cuerpo', category: 'melee_weapon' },
      { key: 'ranged', label: 'A distancia', category: 'ranged_weapon' },
      { key: 'armor', label: 'Armadura', category: 'armor' },
    ].find((s) => s.category === cat);
    const box = document.createElement('div');
    if (slot) {
      if (e.quantity < 1) {
        toast('No puedes equipar una copia con cantidad cero.', 'warn');
        return;
      }
      box.innerHTML = `<p>Espacio: <strong>${slot.label}</strong></p>`;
      openModal({
        title: `Equipar · ${slot.label}`,
        body: box,
        actions: [
          ...(state.profile?.prefs?.equipped?.[slot.key] === e.id ? [{
            label: 'Retirar',
            kind: 'danger',
            onClick: () => setEquipped(slot.key, null),
          }] : []),
          { label: 'Equipar aquí', kind: 'primary', onClick: () => setEquipped(slot.key, e.id) },
          { label: 'Cancelar', kind: 'ghost', onClick: () => {} },
        ],
      });
    } else if (cat === 'artifact') {
      if (e.quantity < 1) {
        toast('No puedes equipar una copia con cantidad cero.', 'warn');
        return;
      }
      box.innerHTML = '<p>Elige en qué espacio equipar esta copia:</p>';
      openModal({
        title: 'Equipar artefacto',
        body: box,
        actions: [
          ...[1, 2, 3].map((n) => ({
            label: `Espacio ${n}${state.profile?.prefs?.equipped?.[`art${n}`] === e.id ? ' · equipado' : ''}`,
            onClick: () => setEquipped(`art${n}`, e.id),
          })),
          { label: 'Cancelar', kind: 'ghost', onClick: () => {} },
        ],
      });
    } else {
      box.innerHTML = '<p>Esta categoría no es equipable.</p>';
      openModal({ title: 'Equipar', body: box });
    }
  }

  async function setEquipped(slotKey, entryId) {
    const slotCategory = EQUIP_SLOT_CATEGORIES[slotKey];
    if (!slotCategory) {
      toast('El espacio de equipo no es válido.', 'error');
      return false;
    }

    const equipped = { ...(state.profile?.prefs?.equipped || {}) };
    if (entryId) {
      const entry = state.entries.find((candidate) => candidate.id === entryId);
      if (!entry || entry.quantity < 1) {
        toast('Esta copia ya no está disponible para equipar.', 'error');
        return false;
      }
      if (entryItem(entry).category !== slotCategory) {
        toast('Esta copia no es compatible con el espacio elegido.', 'error');
        return false;
      }
      Object.entries(equipped).forEach(([key, id]) => {
        if (id === entryId && key !== slotKey && EQUIP_SLOT_CATEGORIES[key] !== slotCategory) {
          delete equipped[key];
        }
      });
      const usedElsewhere = Object.entries(equipped)
        .filter(([key, id]) => key !== slotKey && id === entryId).length;
      if (equipped[slotKey] !== entryId && usedElsewhere >= entry.quantity) {
        toast(`Tienes ${entry.quantity} copia(s); retira una antes de equiparla en otro espacio.`, 'warn');
        return false;
      }
      equipped[slotKey] = entryId;
    } else {
      delete equipped[slotKey];
    }

    try {
      state.profile = await api.patch('/api/profile', {
        prefs: { ...(state.profile?.prefs || {}), equipped },
      });
      renderEquip();
      toast(entryId ? 'Equipo actualizado' : 'Se retiró el objeto del espacio.', 'success');
      return true;
    } catch (error) {
      toast(`No se pudo actualizar el equipo: ${error.message}`, 'error');
      return false;
    }
  }

  async function dismantleEntry(entry, wholeStack) {
    const quantity = Math.max(1, Math.floor(Number(entry.quantity) || 1));
    const removeCount = wholeStack ? quantity : 1;
    const remaining = quantity - removeCount;
    const equipped = state.profile?.prefs?.equipped || {};
    const equippedCount = Object.entries(equipped)
      .filter(([slot, id]) => id === entry.id && EQUIP_SLOT_CATEGORIES[slot] === entryItem(entry).category)
      .length;
    const itemName = entryItem(entry).name;

    if (remaining < equippedCount) {
      toast.warn('Retira primero esta copia de los espacios de equipo.');
      return;
    }
    const message = wholeStack
      ? `Se eliminarán las ${quantity} unidades de «${itemName}». Esta acción no se puede deshacer.`
      : quantity > 1
        ? `Se quitará una unidad de «${itemName}». Quedarán ${remaining}.`
        : `Se eliminará la última copia de «${itemName}».`;
    const ok = await confirmDialog({
      title: wholeStack ? 'Desarmar pila' : 'Desarmar una unidad',
      message,
      danger: true,
      confirmLabel: wholeStack ? 'Desarmar pila' : 'Desarmar',
    });
    if (!ok) return;

    try {
      if (remaining > 0) {
        await api.patch(`/api/inventory/${entry.id}`, { quantity: remaining });
      } else {
        await api.del(`/api/inventory/${entry.id}`);
        state.selectedId = null;
        const nextEquipped = Object.fromEntries(
          Object.entries(equipped).filter(([, id]) => id !== entry.id),
        );
        if (Object.keys(nextEquipped).length !== Object.keys(equipped).length) {
          try {
            state.profile = await api.patch('/api/profile', {
              prefs: { ...(state.profile?.prefs || {}), equipped: nextEquipped },
            });
          } catch {
            toast.warn('La copia se retiró, pero no se pudieron limpiar sus espacios equipados.');
          }
        }
      }
      await refreshAfterMutation();
      toast.success(remaining > 0 ? `Quedaron ${remaining} unidad(es).` : 'Copia desarmada.');
    } catch (error) {
      toast.error(`No se pudo desarmar: ${error.message}`);
    }
  }

  // ---- edición rápida de la copia ----
  function editDialog(e) {
    const it = entryItem(e);
    const box = document.createElement('div');
    box.innerHTML = `
      <label class="mc-label">Poder</label>
      <input class="mc-input" id="f-power" type="number" min="1" max="300" value="${e.power_level ?? ''}">
      <label class="mc-label">Nivel del objeto</label>
      <input class="mc-input" id="f-level" type="number" min="1" max="300" value="${e.item_level ?? ''}">
      <label class="mc-label">Cantidad</label>
      <input class="mc-input" id="f-qty" type="number" min="1" step="1" value="${Math.max(1, e.quantity)}">
      <label class="mc-check"><input type="checkbox" id="f-gilded" ${e.is_gilded ? 'checked' : ''}> Objeto dorado (gilded)</label>
      <div id="f-gilded-ench" style="margin:4px 0 8px"></div>
      <label class="mc-label">Nombre en español</label>
      <input class="mc-input" id="f-loc" value="${escapeHtml(col(e, 'localized_name') || '')}" placeholder="Túnica de brasas…">
      <label class="mc-label">Notas</label>
      <textarea class="mc-textarea" id="f-notes" rows="3">${escapeHtml(e.notes || '')}</textarea>`;
    const editError = document.createElement('p');
    editError.className = 'mc-field-error';
    box.appendChild(editError);
    // Encantamiento dorado: dropdown con iconos (visible solo si es dorado)
    const gildedHost = box.querySelector('#f-gilded-ench');
    const gildedChk = box.querySelector('#f-gilded');
    let gildedId = e.gildedEnchantmentId ?? e.gilded_enchantment_id ?? null;
    const gildedOpts = acceptsEnchants(it.category) ? enchOptionsFor(e) : [];
    if (gildedOpts.length) {
      const lab = document.createElement('p');
      lab.className = 'mc-label';
      lab.style.margin = '0 0 4px';
      lab.textContent = 'Encantamiento dorado';
      const dd = enchantDropdown({
        options: gildedOpts,
        value: gildedId,
        placeholder: 'Elegir encantamiento dorado…',
        onPick: (id) => { gildedId = id; },
      });
      gildedHost.append(lab, dd);
      const sync = () => gildedHost.classList.toggle('hidden', !gildedChk.checked);
      gildedChk.addEventListener('change', sync);
      sync();
    }
    openModal({
      title: `Editar — ${it.name}`, body: box,
      actions: [{
        label: 'Guardar', kind: 'primary', onClick: async () => {
          const quantity = Number(box.querySelector('#f-qty').value);
          if (!Number.isInteger(quantity) || quantity < 1) {
            editError.textContent = 'La cantidad debe ser un número entero de al menos 1.';
            return false;
          }
          editError.textContent = '';
          const patchBody = {
            power_level: box.querySelector('#f-power').value ? Number(box.querySelector('#f-power').value) : null,
            item_level: box.querySelector('#f-level').value ? Number(box.querySelector('#f-level').value) : null,
            quantity,
            is_gilded: box.querySelector('#f-gilded').checked ? 1 : 0,
            gilded_enchantment_id: box.querySelector('#f-gilded').checked ? gildedId : null,
            notes: box.querySelector('#f-notes').value || null,
          };
          const loc = box.querySelector('#f-loc').value.trim();
          if (!(await patch(e, patchBody))) return false;
          if (loc !== (col(e, 'localized_name') || '')) {
            try {
              await api.patch(`/api/items/${entryItem(e).id}`, { localizedName: loc || null });
              await refreshAfterMutation();
            }
            catch (error) { toast.error(`No se guardó el nombre localizado: ${error.message}`); return false; }
          }
        },
      }],
    });
  }

  // ---- añadir copia desde catálogo ----
  async function openAddEntry() {
    try {
      const item = await openItemPicker({ api, title: 'Añadir copia al inventario' });
      if (!item) return;
      await api.post('/api/inventory', { itemId: item.id, quantity: 1 });
      await refreshAfterMutation();
      toast.success(`${itemTitle(item)} añadido`);
    } catch (error) {
      toast.error(`No se pudo añadir la copia: ${error.message}`);
    }
  }

  // ---------- ciclo ----------
  async function patch(e, body) {
    try {
      await api.patch(`/api/inventory/${e.id}`, toApiPatch(body));
    } catch (error) {
      toast.error(`No se pudo guardar: ${error.message}`);
      return false;
    }
    await refreshAfterMutation();
    return true;
  }

  async function reload() {
    if (signal?.aborted) return;
    const prev = state.selectedId;
    const [inv, profile] = await Promise.all([
      api.getAll('/api/inventory'),
      api.get('/api/profile').catch(() => state.profile),
    ]);
    if (signal?.aborted) return;
    state.entries = inv.map(normEntry);
    state.profile = profile;
    state.selectedId = prev && state.entries.find((e) => e.id === prev) ? prev : state.entries[0]?.id;
    renderAll();
  }

  async function refreshAfterMutation() {
    if (!signal?.aborted) {
      try { await reload(); }
      catch (error) {
        if (!signal?.aborted) toast.warn(`Guardado, pero no se pudo refrescar el inventario: ${error.message}`);
      }
    }
    bus.emit('data:changed', { source: 'inventory' });
  }

  function renderAll() {
    renderCatbar(); renderGrid(); renderDetail(); renderCharacter();
  }

  // ---------- eventos de filtros ----------
  $('#inv-search').addEventListener('input', (ev) => { state.filters.search = ev.target.value; renderGrid(); });

  $('#inv-sort').addEventListener('change', (ev) => { state.filters.sort = ev.target.value; renderGrid(); });
  $('#inv-add').onclick = openAddEntry;
  const offDataChanged = bus.on('data:changed', (event) => {
    if (event?.source === 'inventory') return;
    reload().catch((error) => {
      if (!signal?.aborted) toast.error(`No se pudo actualizar el inventario: ${error.message}`);
    });
  });
  const offPrefsChanged = bus.on('prefs:changed', (prefs) => {
    state.prefs = { ...state.prefs, ...(prefs || {}) };
    renderGrid();
    state.viewer?.setPaused(state.prefs.motion3d === false);
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    offDataChanged();
    offPrefsChanged();
    signal?.removeEventListener('abort', dispose);
    try { state.viewer?.dispose(); } catch { /* noop */ }
    state.viewer = null;
  };
  signal?.addEventListener('abort', dispose, { once: true });

  // Salto desde la búsqueda global (Ctrl+K): precarga el filtro antes de loadAll
  let jumpSearch = null;
  try {
    const jump = JSON.parse(sessionStorage.getItem('mindun.jump') || 'null');
    if (jump?.screen === 'inventario' && jump.search) {
      sessionStorage.removeItem('mindun.jump');
      jumpSearch = jump.search;
      state.filters.search = jumpSearch;
      $('#inv-search').value = jumpSearch;
    }
  } catch { /* noop */ }

  try {
    await loadAll();
  } catch (err) {
    dispose();
    if (signal?.aborted) return;
    el.innerHTML = `<div class="mc-empty"><p class="pixel">Error al cargar</p>
      <p>${escapeHtml(err.message)} — ¿está el servidor en marcha? (npm start)</p></div>`;
    return;
  }

  // Seleccionar la tarjeta del salto una vez cargadas las entradas
  if (jumpSearch) {
    const card = [...document.querySelectorAll('.mc-card')].find((c) =>
      (c.title || '').toLowerCase().includes(jumpSearch.toLowerCase()));
    card?.click();
  }

  return dispose;
}
