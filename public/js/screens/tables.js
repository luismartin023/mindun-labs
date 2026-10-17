/**
 * screens/tables.js — Tablas configurables por dataset.
 * Columnas activables, vistas guardadas (POST /api/table-views),
 * preset "Pendientes de verificación" y exportación del dataset.
 */
import { escapeHtml } from '../app.js';
import { openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { dataTable } from '../ui/dataTable.js';
import { emptyState } from '../ui/emptyState.js';
import {
  categoryLabel, fmtDate, goalLabel, itemTitle, rarityTag,
  statusLabel, enchantName,
} from '../ui/format.js';

export const title = 'Tablas';

const imgCol = {
  key: '_img', label: '', sortable: false, width: '42px',
  render: (r) => r.imagePath
    ? `<img class="cell-img" src="${escapeHtml(r.imagePath)}" alt="">`
    : '<span class="muted">·</span>',
  searchText: () => '',
};

function dsInventory(itemsById) {
  return {
    label: 'Inventario',
    exportType: 'inventory',
    fetch: async (api) => api.getAll('/api/inventory')
      .map((e) => ({ ...e, item: itemsById[e.itemId] })),
    columns: [
      { key: '_img', label: '', sortable: false, width: '42px', render: (r) => r.item?.imagePath ? `<img class="cell-img" src="${escapeHtml(r.item.imagePath)}" alt="">` : '<span class="muted">·</span>', searchText: () => '' },
      { key: 'item', label: 'Ítem', render: (r) => escapeHtml(itemTitle(r.item || { name: r.itemId })), sortValue: (r) => itemTitle(r.item || { name: '' }) },
      { key: 'quantity', label: 'Cant.' },
      { key: 'powerLevel', label: 'Poder', render: (r) => r.powerLevel ?? '<span class="muted">—</span>' },
      { key: 'itemLevel', label: 'Nivel', render: (r) => r.itemLevel ?? '<span class="muted">—</span>' },
      { key: 'isFavorite', label: 'Fav', render: (r) => (r.isFavorite ? '★' : ''), sortValue: (r) => (r.isFavorite ? 1 : 0) },
      { key: 'isGilded', label: 'Dorado', render: (r) => (r.isGilded ? 'Sí' : ''), sortValue: (r) => (r.isGilded ? 1 : 0) },
      { key: 'enchs', label: 'Encantamientos', sortable: false, render: (r) => (r.selectedEnchantIds || []).filter(Boolean).length || '<span class="muted">—</span>', searchText: () => '' },
      { key: 'notes', label: 'Notas', sortable: false, render: (r) => escapeHtml(r.notes || '') },
      { key: 'updatedAt', label: 'Actualizado', render: (r) => `<span class="muted">${fmtDate(r.updatedAt)}</span>`, sortValue: (r) => r.updatedAt || '' },
    ],
  };
}

const DATASETS = (itemsById, enchMap) => ({
  inventory: dsInventory(itemsById),
  catalog: {
    label: 'Catálogo',
    exportType: 'catalog',
    fetch: async (api) => api.getAll('/api/items'),
    columns: [
      imgCol,
      { key: 'name', label: 'Nombre', render: (r) => escapeHtml(itemTitle(r)) },
      { key: 'localizedName', label: 'Nombre EN', render: (r) => escapeHtml(r.name || '') },
      { key: 'category', label: 'Categoría', render: (r) => escapeHtml(categoryLabel(r.category)), sortValue: (r) => categoryLabel(r.category) },
      { key: 'rarity', label: 'Rareza', render: (r) => rarityTag(r.rarity), sortValue: (r) => r.rarity },
      { key: 'tags', label: 'Etiquetas', sortable: false, render: (r) => (r.tags || []).map((t) => `<span class="mc-tag">${escapeHtml(t)}</span>`).join(''), searchText: (r) => (r.tags || []).join(' ') },
      { key: 'dataStatus', label: 'Estado', render: (r) => `<span class="muted">${escapeHtml(statusLabel(r.dataStatus))}</span>` },
      { key: 'updatedAt', label: 'Actualizado', render: (r) => `<span class="muted">${fmtDate(r.updatedAt)}</span>`, sortValue: (r) => r.updatedAt || '' },
    ],
  },
  enchantments: {
    label: 'Encantamientos',
    exportType: 'enchantments',
    fetch: async (api) => api.getAll('/api/enchantments'),
    columns: [
      imgCol,
      { key: 'name', label: 'Nombre', render: (r) => escapeHtml(enchantName(r)) },
      { key: 'enchantType', label: 'Tipo', render: (r) => `<span class="mc-tag">${escapeHtml(r.enchantType || '?')}</span>` },
      { key: 'tiers', label: 'Niveles', render: (r) => (r.tiers || []).length || '<span class="muted">—</span>', sortValue: (r) => (r.tiers || []).length },
      { key: 'builtInto', label: 'Fijo en', sortable: false, render: (r) => (r.builtInto || []).length ? escapeHtml(r.builtInto.join(', ')) : '<span class="muted">—</span>' },
      { key: 'dataStatus', label: 'Estado', render: (r) => `<span class="muted">${escapeHtml(statusLabel(r.dataStatus))}</span>` },
    ],
  },
  builds: {
    label: 'Builds',
    exportType: 'builds',
    fetch: async (api) => api.getAll('/api/builds'),
    columns: [
      { key: 'name', label: 'Nombre', render: (r) => escapeHtml(r.name || '') },
      { key: 'goal', label: 'Objetivo', render: (r) => r.goal ? `<span class="mc-tag">${escapeHtml(goalLabel(r.goal))}</span>` : '<span class="muted">—</span>' },
      { key: 'slots', label: 'Piezas', render: (r) => [r.meleeItemId, r.rangedItemId, r.armorItemId, ...(r.artifactItemIds || [])].filter(Boolean).length, sortValue: (r) => [r.meleeItemId, r.rangedItemId, r.armorItemId, ...(r.artifactItemIds || [])].filter(Boolean).length, searchText: () => '' },
      { key: 'score', label: 'Puntuación', render: (r) => r.score?.total != null ? `★ ${r.score.total}` : '<span class="muted">—</span>', sortValue: (r) => r.score?.total ?? -1 },
      { key: 'status', label: 'Estado', render: (r) => `<span class="muted">${escapeHtml(r.status || '')}</span>` },
      { key: 'updatedAt', label: 'Actualizado', render: (r) => `<span class="muted">${fmtDate(r.updatedAt)}</span>`, sortValue: (r) => r.updatedAt || '' },
    ],
  },
  tierlists: {
    label: 'Tier lists',
    exportType: 'tierlists',
    fetch: async (api) => api.getAll('/api/tierlists'),
    columns: [
      { key: 'name', label: 'Nombre', render: (r) => escapeHtml(r.name || '') },
      { key: 'category', label: 'Categoría', render: (r) => escapeHtml(categoryLabel(r.category)) },
      { key: 'rows', label: 'Filas', render: (r) => (r.rows || []).length, sortValue: (r) => (r.rows || []).length, searchText: () => '' },
      { key: 'entries', label: 'Ítems', render: (r) => (r.entries || []).filter((e) => e.rowKey).length, sortValue: (r) => (r.entries || []).length, searchText: () => '' },
      { key: 'criteria', label: 'Criterios', sortable: false, render: (r) => escapeHtml(r.criteria || '') },
      { key: 'updatedAt', label: 'Actualizado', render: (r) => `<span class="muted">${fmtDate(r.updatedAt)}</span>`, sortValue: (r) => r.updatedAt || '' },
    ],
  },
});

export async function mount(el, ctx) {
  const { api } = ctx;
  const state = {
    dataset: 'inventory',
    itemsById: {},
    enchMap: {},
    rows: [],
    table: null,
    pendingOnly: false,
    views: [],
  };

  el.innerHTML = `<div class="screen-page"><div class="wrap">
    <div class="row wrap">
      <h2 class="pixel-sm" style="margin:0">Tablas</h2>
      <select class="mc-select" id="ds-sel" style="width:auto"></select>
      <span class="grow"></span>
      <button class="mc-btn mc-btn--sm" id="cols-btn">Columnas ▾</button>
      <button class="mc-btn mc-btn--sm" id="pending-btn" title="Solo filas con estado distinto de verificado">Pendientes de verificación</button>
    </div>
    <div class="row wrap">
      <select class="mc-select" id="views-sel" style="width:auto;max-width:220px"><option value="">— Vistas guardadas —</option></select>
      <button class="mc-btn mc-btn--sm" id="save-view">Guardar vista</button>
      <span class="grow"></span>
      <span class="muted pixel-sm">Exportar:</span>
      <button class="mc-btn mc-btn--sm" data-fmt="xlsx">XLSX</button>
      <button class="mc-btn mc-btn--sm" data-fmt="txt">TXT</button>
      <button class="mc-btn mc-btn--sm" data-fmt="pdf">PDF</button>
    </div>
    <div id="cols-pop" class="mc-panel hidden" style="position:absolute;z-index:30;max-width:280px"></div>
    <div id="table-host"></div>
  </div></div>`;

  const $ = (s) => el.querySelector(s);
  const host = $('#table-host');
  const dsSel = $('#ds-sel');
  const colsPop = $('#cols-pop');

  // precargar catálogo + encantamientos ANTES de construir datasets (joins)
  try {
    const [items, enchs] = await Promise.all([
      api.getAll('/api/items').catch(() => []),
      api.getAll('/api/enchantments').catch(() => []),
    ]);
    state.itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
    state.enchMap = Object.fromEntries(enchs.map((e) => [e.id, e]));
  } catch { /* tolerante */ }

  const datasets = DATASETS(state.itemsById, state.enchMap);
  for (const [k, d] of Object.entries(datasets)) {
    const o = document.createElement('option');
    o.value = k; o.innerHTML = escapeHtml(d.label);
    dsSel.appendChild(o);
  }
  dsSel.value = state.dataset;
  dsSel.addEventListener('change', () => { state.dataset = dsSel.value; state.pendingOnly = false; loadDataset(); });

  $('#pending-btn').addEventListener('click', () => {
    state.pendingOnly = !state.pendingOnly;
    $('#pending-btn').classList.toggle('mc-btn--primary', state.pendingOnly);
    applyRows();
  });

  // popover de columnas
  $('#cols-btn').addEventListener('click', () => {
    colsPop.classList.toggle('hidden');
    if (colsPop.classList.contains('hidden') || !state.table) return;
    colsPop.innerHTML = '<p class="mc-label" style="margin-top:0">Columnas visibles</p>';
    const visible = new Set(state.table.visibleColumnKeys());
    for (const key of state.table.allColumnKeys()) {
      const col = datasets[state.dataset].columns.find((c) => c.key === key);
      const l = document.createElement('label');
      l.className = 'mc-check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = visible.has(key);
      cb.addEventListener('change', () => state.table.setColumnVisible(key, cb.checked));
      l.append(cb, Object.assign(document.createElement('span'), { textContent: col?.label || key }));
      colsPop.appendChild(l);
    }
  });

  // vistas guardadas
  async function loadViews() {
    try {
      state.views = await api.getAll('/api/table-views');
    } catch { state.views = []; }
    const sel = $('#views-sel');
    sel.innerHTML = '<option value="">— Vistas guardadas —</option>';
    for (const v of state.views.filter((x) => x.dataset === state.dataset)) {
      const o = document.createElement('option');
      o.value = v.id;
      o.innerHTML = escapeHtml(v.name);
      sel.appendChild(o);
    }
  }

  $('#views-sel').addEventListener('change', () => {
    const v = state.views.find((x) => x.id === $('#views-sel').value);
    if (!v || !state.table) return;
    const cfg = v.config || {};
    if (Array.isArray(cfg.columns)) {
      const want = new Set(cfg.columns);
      for (const key of state.table.allColumnKeys()) {
        state.table.setColumnVisible(key, want.has(key));
      }
    }
    if (cfg.sortKey) state.table.setSort(cfg.sortKey, cfg.sortDir === 'desc' ? -1 : 1);
    if (cfg.search !== undefined) state.table.setSearch(cfg.search);
    toast.info(`Vista «${v.name}» aplicada`);
  });

  $('#save-view').addEventListener('click', () => {
    if (!state.table) return;
    const body = document.createElement('div');
    const nameI = document.createElement('input');
    nameI.className = 'mc-input';
    nameI.placeholder = 'Nombre de la vista *';
    const l = document.createElement('label');
    l.className = 'mc-label';
    l.textContent = 'Nombre *';
    body.append(l, nameI);
    openModal({
      title: 'Guardar vista de tabla',
      body,
      actions: [
        { label: 'Cancelar', kind: 'ghost', onClick: () => {} },
        {
          label: 'Guardar', kind: 'primary',
          onClick: async () => {
            if (!nameI.value.trim()) { toast.warn('Ponle un nombre.'); return false; }
            try {
              await api.post('/api/table-views', {
                name: nameI.value.trim(),
                dataset: state.dataset,
                config: { columns: state.table.visibleColumnKeys() },
              });
              toast.success('Vista guardada');
              await loadViews();
            } catch (e) { toast.error(e.message); return false; }
          },
        },
      ],
    });
  });

  // exportación del dataset actual
  el.querySelectorAll('[data-fmt]').forEach((b) => {
    b.addEventListener('click', async () => {
      const fmt = b.dataset.fmt;
      const type = datasets[state.dataset].exportType;
      try {
        await api.download(`/api/export/${type}?format=${fmt}`, `${type}.${fmt}`);
      } catch (e) { toast.error(`Exportación no disponible: ${e.message}`); }
    });
  });

  function applyRows() {
    if (!state.table) return;
    const rows = state.pendingOnly
      ? state.rows.filter((r) => (r.dataStatus ?? r.item?.dataStatus) !== 'verified')
      : state.rows;
    state.table.setRows(rows);
  }

  async function loadDataset() {
    host.innerHTML = '<p class="muted">Cargando…</p>';
    colsPop.classList.add('hidden');
    const ds = datasets[state.dataset];
    try {
      state.rows = await ds.fetch(api);
    } catch (e) {
      host.innerHTML = '';
      host.appendChild(emptyState({
        icon: '⚠', title: `No se pudo cargar «${ds.label}»`,
        message: e.message, actionLabel: 'Reintentar', onAction: loadDataset,
      }));
      return;
    }
    state.table = dataTable({
      columns: ds.columns,
      rows: [],
      pageSize: 25,
      searchable: true,
      emptyMsg: 'Sin filas.',
    });
    host.innerHTML = '';
    host.appendChild(state.table.el);
    applyRows();
    await loadViews();
  }

  await loadDataset();
}
