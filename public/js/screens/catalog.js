/**
 * screens/catalog.js — Explorador del catálogo completo.
 * Filtros por categoría/rareza/búsqueda/orden, vista grid o tabla
 * (persistida en prefs), detalle en modal y alta de ítems.
 */
import { escapeHtml, savePrefs } from '../app.js';
import { qs } from '../api/client.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { itemCard } from '../ui/itemCard.js';
import { itemFormModal } from '../ui/itemForm.js';
import { dataTable } from '../ui/dataTable.js';
import { emptyState } from '../ui/emptyState.js';
import {
  asList, categoryLabel, enchantName, fmtDate, itemTitle,
  rarityTag, statRow, statusLabel, tagsHtml,
  CATEGORY_LABELS, RARITY_ORDER,
} from '../ui/format.js';

export const title = 'Catálogo';

const CATS = ['', 'melee_weapon', 'ranged_weapon', 'armor', 'artifact'];
const CAT_LABELS = { '': 'Todas', ...CATEGORY_LABELS };
const SORTS = [
  ['name', 'Nombre'],
  ['rarity', 'Rareza'],
  ['category', 'Categoría'],
];
const COMPARE_KEY = 'mindun.compare';

function getCompare() {
  try { return JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]'); } catch { return []; }
}

export async function mount(el, ctx) {
  const { api, bus } = ctx;
  const state = {
    items: [],
    filters: { category: '', rarity: '', search: '', sort: 'name', order: 'asc' },
    view: ctx.prefs?.catalogView === 'table' ? 'table' : 'grid',
    enchMap: null,
  };
  let table = null;
  let searchTimer = null;

  el.innerHTML = `<div class="screen-page"><div class="wrap" id="cat-wrap">
    <div class="row wrap">
      <h2 class="pixel-sm" style="margin:0">Catálogo</h2>
      <span class="muted pixel-sm" id="cat-count"></span>
      <span class="grow"></span>
      <button class="mc-btn mc-btn--sm" id="v-grid" title="Vista cuadrícula">▦</button>
      <button class="mc-btn mc-btn--sm" id="v-table" title="Vista tabla">☰</button>
      <button class="mc-btn mc-btn--primary" id="new-item">＋ Nuevo ítem</button>
    </div>
    <div class="catbar" id="catbar"><span class="catbar__label">Categoría</span></div>
    <div class="searchbar" id="filters" style="flex-wrap:wrap">
      <input class="mc-input" id="f-search" type="search" placeholder="Buscar por nombre, alias o etiqueta…">
      <select class="mc-select" id="f-rarity" style="width:auto">
        <option value="">Todas las rarezas</option>
        <option value="common">Común</option><option value="rare">Raro</option>
        <option value="unique">Único</option><option value="gilded">Dorado</option>
        <option value="special">Especial</option><option value="unknown">Desconocida</option>
      </select>
      <select class="mc-select" id="f-sort" style="width:auto"></select>
      <button class="mc-btn mc-btn--sm" id="f-order" title="Cambiar orden">Asc ↑</button>
    </div>
    <div id="cat-content"></div>
  </div></div>`;

  const $ = (s) => el.querySelector(s);
  const content = $('#cat-content');
  const countEl = $('#cat-count');

  // Chips de categoría
  const catbar = $('#catbar');
  for (const c of CATS) {
    const b = document.createElement('button');
    b.className = 'mc-iconbtn';
    b.style.width = 'auto';
    b.style.padding = '0 10px';
    b.style.fontSize = '8px';
    b.style.fontFamily = 'var(--font-pixel)';
    b.dataset.cat = c;
    b.innerHTML = escapeHtml(CAT_LABELS[c]);
    b.addEventListener('click', () => {
      state.filters.category = c;
      catbar.querySelectorAll('.mc-iconbtn').forEach((x) => x.classList.toggle('active', x.dataset.cat === c));
      render();
    });
    catbar.appendChild(b);
  }
  catbar.querySelector('.mc-iconbtn').classList.add('active');

  const sortSel = $('#f-sort');
  for (const [v, l] of SORTS) {
    const o = document.createElement('option');
    o.value = v; o.innerHTML = escapeHtml(l);
    sortSel.appendChild(o);
  }

  $('#f-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.filters.search = e.target.value; render(); }, 200);
  });
  $('#f-rarity').addEventListener('change', (e) => { state.filters.rarity = e.target.value; render(); });
  sortSel.addEventListener('change', (e) => { state.filters.sort = e.target.value; render(); });
  $('#f-order').addEventListener('click', (e) => {
    state.filters.order = state.filters.order === 'asc' ? 'desc' : 'asc';
    e.currentTarget.textContent = state.filters.order === 'asc' ? 'Asc ↑' : 'Desc ↓';
    render();
  });
  $('#v-grid').addEventListener('click', () => setView('grid'));
  $('#v-table').addEventListener('click', () => setView('table'));
  $('#new-item').addEventListener('click', () =>
    itemFormModal({ api, onSaved: load }));

  // Salto desde la búsqueda global (Ctrl+K): precarga el filtro
  try {
    const jump = JSON.parse(sessionStorage.getItem('mindun.jump') || 'null');
    if (jump?.screen === 'catalogo' && jump.search) {
      sessionStorage.removeItem('mindun.jump');
      state.filters.search = jump.search;
      const inp = $('#f-search');
      inp.value = jump.search;
      setTimeout(() => inp.focus(), 60);
    }
  } catch { /* noop */ }

  function setView(v) {
    state.view = v;
    savePrefs({ catalogView: v });
    render();
  }

  async function getEnchMap() {
    if (!state.enchMap) {
      try {
        state.enchMap = Object.fromEntries(
          asList(await api.get('/api/enchantments?pageSize=2000')).map((e) => [e.id, e]));
      } catch { state.enchMap = {}; }
    }
    return state.enchMap;
  }

  function filtered() {
    const { category, rarity, search, sort, order } = state.filters;
    const q = search.trim().toLowerCase();
    let out = state.items.filter((it) => {
      if (category && it.category !== category) return false;
      if (rarity && it.rarity !== rarity) return false;
      if (q) {
        const hay = [it.name, it.localizedName, ...(it.aliases || []), ...(it.tags || [])]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = order === 'asc' ? 1 : -1;
    const key = (it) => sort === 'rarity' ? (RARITY_ORDER[it.rarity] ?? 9)
      : sort === 'category' ? categoryLabel(it.category)
      : itemTitle(it).toLowerCase();
    out = [...out].sort((a, b) => {
      const va = key(a); const vb = key(b);
      if (typeof va === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'es') * dir;
    });
    return out;
  }

  function render() {
    const list = filtered();
    countEl.textContent = `${list.length} ítem${list.length === 1 ? '' : 's'}`;
    content.innerHTML = '';
    if (!list.length) {
      content.appendChild(emptyState({
        icon: '▤', title: 'Catálogo vacío',
        message: state.items.length ? 'Ningún ítem coincide con los filtros.' : 'Todavía no hay ítems en el catálogo.',
        actionLabel: 'Nuevo ítem', onAction: () => itemFormModal({ api, onSaved: load }),
      }));
      return;
    }
    if (state.view === 'grid') {
      const grid = document.createElement('div');
      grid.className = 'mc-grid';
      if (ctx.prefs?.cardSize) grid.style.setProperty('--card-size', `${ctx.prefs.cardSize}px`);
      for (const it of list) {
        grid.appendChild(itemCard({
          item: it, showPower: false, showQty: false, showFav: false,
          onClick: () => openDetail(it),
        }));
      }
      content.appendChild(grid);
    } else {
      table = dataTable({
        rows: list,
        pageSize: 30,
        onRow: openDetail,
        emptyMsg: 'Ningún ítem coincide con los filtros.',
        columns: [
          {
            key: 'img', label: '', sortable: false, width: '42px',
            render: (it) => it.imagePath
              ? `<img class="cell-img" src="${escapeHtml(it.imagePath)}" alt="">`
              : '<span class="muted">·</span>',
            searchText: () => '',
          },
          { key: 'name', label: 'Nombre', render: (it) => escapeHtml(itemTitle(it)) },
          { key: 'category', label: 'Categoría', render: (it) => escapeHtml(categoryLabel(it.category)), sortValue: (it) => categoryLabel(it.category) },
          { key: 'rarity', label: 'Rareza', render: (it) => rarityTag(it.rarity), sortValue: (it) => RARITY_ORDER[it.rarity] ?? 9 },
          { key: 'tags', label: 'Etiquetas', sortable: false, render: (it) => tagsHtml(it.tags), searchText: (it) => (it.tags || []).join(' ') },
          { key: 'dataStatus', label: 'Estado', render: (it) => `<span class="muted">${escapeHtml(statusLabel(it.dataStatus))}</span>` },
        ],
      });
      content.appendChild(table.el);
    }
  }

  async function openDetail(it) {
    const enchMap = await getEnchMap();
    const body = document.createElement('div');

    const head = document.createElement('div');
    head.className = 'detail__head';
    const imgWrap = document.createElement('div');
    imgWrap.className = 'detail__img';
    if (it.imagePath) {
      const img = document.createElement('img');
      img.src = it.imagePath;
      img.alt = itemTitle(it);
      img.addEventListener('error', () => {
        const d = document.createElement('div');
        d.className = 'mc-img-missing';
        d.textContent = itemTitle(it).charAt(0).toUpperCase();
        img.replaceWith(d);
      }, { once: true });
      imgWrap.appendChild(img);
    } else {
      const d = document.createElement('div');
      d.className = 'mc-img-missing';
      d.textContent = itemTitle(it).charAt(0).toUpperCase();
      imgWrap.appendChild(d);
    }
    const tWrap = document.createElement('div');
    tWrap.className = 'detail__title';
    tWrap.innerHTML = `<div class="detail__name">${escapeHtml(itemTitle(it))}</div>
      <div class="detail__sub">${it.localizedName ? escapeHtml(it.name) + ' · ' : ''}${escapeHtml(categoryLabel(it.category))} ${it.internalId ? '· <span class="muted">' + escapeHtml(it.internalId) + '</span>' : ''}</div>
      <div style="margin-top:8px">${rarityTag(it.rarity)} <span class="mc-tag">${escapeHtml(statusLabel(it.dataStatus))}</span></div>`;
    head.append(imgWrap, tWrap);
    body.appendChild(head);

    const stats = document.createElement('div');
    stats.className = 'detail__stats';
    const yesNo = (v) => (v === null || v === undefined ? null : v ? 'Sí' : 'No');
    stats.innerHTML = [
      statRow('Familia', it.groupOf),
      statRow('Encantamiento fijo', it.builtInEnchantment),
      statRow('Runas', (it.runes || []).join(' ') || null),
      statRow('Ubicaciones', it.locations),
      statRow('DLC', it.dlc),
      statRow('Usa almas', yesNo(it.soulRequiring ?? it.acceptsSoul)),
      statRow('Longitud de combo', it.comboLength),
      statRow('Fuente', it.source),
      statRow('Actualizado', fmtDate(it.updatedAt)),
    ].join('');
    body.appendChild(stats);

    if (Array.isArray(it.attributes) && it.attributes.length) {
      const h = document.createElement('p');
      h.className = 'detail__section-title';
      h.textContent = '— Atributos —';
      const div = document.createElement('div');
      div.className = 'detail__stats';
      div.innerHTML = it.attributes.map((a) =>
        statRow(a.label || '', `${a.value ?? '—'}${a.unit ? ` ${a.unit}` : ''}`)).join('');
      body.append(h, div);
    }

    if (it.passiveEffects?.length) {
      const h = document.createElement('p');
      h.className = 'detail__section-title';
      h.textContent = '— Propiedades —';
      const div = document.createElement('div');
      div.className = 'detail__stats';
      div.innerHTML = it.passiveEffects.map((p) => statRow('•', p, { passive: true })).join('');
      body.append(h, div);
    }
    if (it.uniqueEffects?.length) {
      const h = document.createElement('p');
      h.className = 'detail__section-title';
      h.textContent = '— Efecto único —';
      const div = document.createElement('div');
      div.className = 'detail__stats';
      div.innerHTML = it.uniqueEffects.map((p) => statRow('◆', p)).join('');
      body.append(h, div);
    }

    if (it.enchantmentSlots?.length) {
      const h = document.createElement('p');
      h.className = 'detail__section-title';
      h.textContent = '— Espacios de encantamiento posibles —';
      const div = document.createElement('div');
      for (const s of [...it.enchantmentSlots].sort((a, b) => (a.slotIndex || 0) - (b.slotIndex || 0))) {
        const names = (s.options || []).map((o) =>
          enchantName(enchMap[o.enchantmentId] || { name: o.enchantmentId }));
        const row = document.createElement('div');
        row.className = 'stat-row';
        row.innerHTML = `<span class="k">Espacio ${s.slotIndex ?? '·'}</span><span class="v">${names.length ? names.map(escapeHtml).join(' · ') : '<span class="muted">Sin registrar</span>'}</span>`;
        div.appendChild(row);
      }
      body.append(h, div);
    }

    if (it.tags?.length) {
      const h = document.createElement('p');
      h.className = 'detail__section-title';
      h.textContent = '— Etiquetas —';
      const div = document.createElement('div');
      div.innerHTML = tagsHtml(it.tags);
      body.append(h, div);
    }

    if (it.description) {
      const d = document.createElement('div');
      d.className = 'detail__desc';
      d.textContent = it.description;
      body.appendChild(d);
    }

    openModal({
      title: itemTitle(it),
      body,
      wide: true,
      actions: [
        {
          label: 'Añadir a mi inventario', kind: 'primary', closeOnClick: false,
          onClick: async () => {
            try {
              await api.post('/api/inventory', { itemId: it.id, quantity: 1 });
              toast.success(`«${itemTitle(it)}» añadido al inventario`);
              bus.emit('data:changed');
            } catch (e) { toast.error(`No se pudo añadir: ${e.message}`); }
          },
        },
        {
          label: 'Editar', closeOnClick: false,
          onClick: () => itemFormModal({ api, item: it, onSaved: load }),
        },
        {
          label: 'Comparar', closeOnClick: false,
          onClick: () => {
            const set = getCompare().filter((x) => x !== it.id);
            if (set.length >= 4) { toast.warn('Ya hay 4 ítems en la comparación.'); return; }
            set.push(it.id);
            localStorage.setItem(COMPARE_KEY, JSON.stringify(set));
            toast.info(`Comparación: ${set.length}/4 ítems. Abre «Comparar».`);
          },
        },
        { label: 'Cerrar', kind: 'ghost', onClick: () => {} },
      ],
    });
  }

  async function load() {
    content.innerHTML = '<p class="muted">Cargando catálogo…</p>';
    try {
      state.items = asList(await api.get(`/api/items${qs({ pageSize: 5000 })}`));
    } catch (e) {
      content.innerHTML = '';
      content.appendChild(emptyState({
        icon: '⚠', title: 'No se pudo cargar el catálogo',
        message: e.message, actionLabel: 'Reintentar', onAction: load,
      }));
      return;
    }
    render();
  }

  await load();
  return () => { clearTimeout(searchTimer); };
}
