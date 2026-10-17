/**
 * screens/tierlists.js — Listas de tier + editor con drag&drop.
 * Alternativas accesibles: clic/doble-clic abre modal con motivo + Subir/Bajar.
 * "Sugerir" propone orden por rareza localmente y SIEMPRE pide confirmación.
 */
import { escapeHtml } from '../app.js';
import { qs } from '../api/client.js';
import { openModal } from '../ui/modal.js';
import { confirmDialog } from '../ui/confirm.js';
import { toast } from '../ui/toast.js';
import { itemCard } from '../ui/itemCard.js';
import { emptyState } from '../ui/emptyState.js';
import { openItemPicker } from '../ui/itemPicker.js';
import {
  asList, categoryLabel, itemTitle,
  CATEGORY_LABELS, RARITY_ORDER,
} from '../ui/format.js';

export const title = 'Tier Lists';

const ROW_COLORS = ['#e45a55', '#e6a329', '#e8c33a', '#83c96c', '#5aa9e6', '#a25cd6', '#a9a49e'];
const DEFAULT_ROWS = [
  { key: 's', label: 'S', color: '#e45a55' },
  { key: 'a', label: 'A', color: '#e6a329' },
  { key: 'b', label: 'B', color: '#e8c33a' },
  { key: 'c', label: 'C', color: '#83c96c' },
  { key: 'd', label: 'D', color: '#5aa9e6' },
];
const CAT_OPTIONS = [['mixed', 'Mixta'], ...Object.entries(CATEGORY_LABELS).filter(([k]) => k !== 'enchantment' && k !== 'mixed')];

function rowKey() { return `r${Math.random().toString(36).slice(2, 8)}`; }

/** Heurística local de sugerencia: rareza + riqueza de efectos. Nunca automática. */
function heuristicScore(item) {
  const r = RARITY_ORDER[item?.rarity] ?? 0;
  return r * 20
    + (item?.uniqueEffects?.length || 0) * 3
    + (item?.passiveEffects?.length || 0) * 2
    + (item?.enchantmentSlots?.length || 0);
}

export async function mount(el, ctx) {
  const { api, bus, navigate } = ctx;
  const state = { lists: [], itemsById: {}, current: null, draft: null, dirty: false };

  el.innerHTML = `<div class="screen-page"><div class="wrap" id="tl-wrap"></div></div>`;
  const wrap = el.querySelector('#tl-wrap');

  // ================= Vista: lista de tier lists =================
  async function renderList() {
    wrap.innerHTML = `<div class="row wrap">
      <h2 class="pixel-sm" style="margin:0">Tier Lists</h2>
      <span class="muted pixel-sm">${state.lists.length} lista${state.lists.length === 1 ? '' : 's'}</span>
      <span class="grow"></span>
      <button class="mc-btn mc-btn--primary" id="tl-new">＋ Nueva lista</button>
    </div>
    <div id="tl-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px"></div>`;
    wrap.querySelector('#tl-new').addEventListener('click', createListModal);
    const listEl = wrap.querySelector('#tl-list');
    if (!state.lists.length) {
      listEl.appendChild(emptyState({
        icon: '♜', title: 'Sin tier lists',
        message: 'Crea una lista para ordenar ítems por filas S, A, B…',
        actionLabel: 'Nueva lista', onAction: createListModal,
      }));
      return;
    }
    for (const l of state.lists) {
      const card = document.createElement('div');
      card.className = 'mc-panel';
      card.innerHTML = `<div class="row"><h3 class="pixel-sm" style="margin:0">${escapeHtml(l.name)}</h3>
        <span class="mc-tag">${escapeHtml(categoryLabel(l.category))}</span>
        <span class="grow"></span>
        <span class="muted pixel-sm">${(l.entries || []).length} ítems</span></div>
        ${l.criteria ? `<p class="muted" style="font-size:12px;margin:8px 0 0">${escapeHtml(l.criteria)}</p>` : ''}
        <div class="row wrap" style="margin-top:10px"></div>`;
      const acts = card.querySelector('.row.wrap');
      const mk = (label, kind, fn) => {
        const b = document.createElement('button');
        b.className = `mc-btn mc-btn--sm${kind ? ` mc-btn--${kind}` : ''}`;
        b.innerHTML = escapeHtml(label);
        b.addEventListener('click', fn);
        acts.appendChild(b);
      };
      mk('Abrir', 'primary', () => openEditor(l));
      mk('Exportar', null, () => exportListModal(l));
      mk('Borrar', 'danger', async () => {
        if (!(await confirmDialog({ title: 'Borrar tier list', message: `¿Borrar «${l.name}»?`, danger: true, confirmLabel: 'Borrar' }))) return;
        try {
          await api.del(`/api/tierlists/${l.id}`);
          toast.success('Lista borrada');
          bus.emit('data:changed');
          await loadLists();
          renderList();
        } catch (e) { toast.error(e.message); }
      });
      listEl.appendChild(card);
    }
  }

  function exportListModal(l) {
    const body = document.createElement('div');
    body.innerHTML = `<p class="muted">Formato para «${escapeHtml(l.name)}»:</p>`;
    openModal({
      title: 'Exportar tier list',
      body,
      actions: ['pdf', 'xlsx', 'txt'].map((f) => ({
        label: f.toUpperCase(),
        onClick: async () => {
          try { await api.download(`/api/export/tierlist/${l.id}?format=${f}`, `tierlist-${l.id}.${f}`); }
          catch (e) { toast.error(`Exportación fallida: ${e.message}`); }
        },
      })).concat([{ label: 'Cancelar', kind: 'ghost', onClick: () => {} }]),
    });
  }

  function createListModal() {
    const body = document.createElement('div');
    const nameI = document.createElement('input');
    nameI.className = 'mc-input';
    nameI.placeholder = 'Nombre de la lista *';
    const catS = document.createElement('select');
    catS.className = 'mc-select';
    for (const [v, l] of CAT_OPTIONS) {
      const o = document.createElement('option');
      o.value = v; o.innerHTML = escapeHtml(l);
      catS.appendChild(o);
    }
    const crit = document.createElement('textarea');
    crit.className = 'mc-textarea';
    crit.rows = 3;
    crit.placeholder = 'Criterios de ordenación (opcional)';
    const mk = (t, i) => { const l = document.createElement('label'); l.className = 'mc-label'; l.innerHTML = escapeHtml(t); const d = document.createElement('div'); d.append(l, i); return d; };
    body.append(mk('Nombre *', nameI), mk('Categoría', catS), mk('Criterios', crit));
    openModal({
      title: 'Nueva tier list',
      body,
      actions: [
        { label: 'Cancelar', kind: 'ghost', onClick: () => {} },
        {
          label: 'Crear', kind: 'primary',
          onClick: async () => {
            if (!nameI.value.trim()) { toast.warn('Ponle un nombre.'); return false; }
            try {
              const created = await api.post('/api/tierlists', {
                name: nameI.value.trim(),
                category: catS.value,
                criteria: crit.value.trim() || null,
                rows: DEFAULT_ROWS.map((r) => ({ ...r })),
                entries: [],
              });
              toast.success('Lista creada');
              bus.emit('data:changed');
              await loadLists();
              const l = state.lists.find((x) => x.id === created?.id) || created;
              openEditor(l);
            } catch (e) { toast.error(e.message); return false; }
          },
        },
      ],
    });
  }

  // ================= Vista: editor =================
  async function openEditor(list) {
    let full = list;
    try { full = await api.get(`/api/tierlists/${list.id}`); } catch { /* usar lo que hay */ }
    state.current = full;
    state.draft = JSON.parse(JSON.stringify({
      name: full.name, criteria: full.criteria || '', category: full.category || 'mixed',
      rows: full.rows || [], entries: full.entries || [],
    }));
    state.dirty = false;

    const poolable = state.draft.category === 'mixed'
      ? Object.values(state.itemsById)
      : Object.values(state.itemsById).filter((i) => i.category === state.draft.category);
    const poolableIds = new Set(poolable.map((i) => i.id));

    wrap.innerHTML = `<div class="row wrap">
      <button class="mc-btn mc-btn--sm" id="tl-back">← Volver</button>
      <input class="mc-input" id="tl-name" style="max-width:240px">
      <span class="mc-tag" id="tl-cat"></span>
      <span class="grow"></span>
      <button class="mc-btn mc-btn--sm" id="tl-suggest" title="Propuesta automática por rareza (requiere confirmación)">Sugerir</button>
      <button class="mc-btn mc-btn--sm" id="tl-row-new">＋ Fila</button>
      <button class="mc-btn mc-btn--sm" id="tl-add" title="Añadir ítem a la lista">＋ Ítem</button>
      <button class="mc-btn mc-btn--sm" id="tl-export">Exportar</button>
      <button class="mc-btn mc-btn--primary" id="tl-save" disabled>Guardar</button>
    </div>
    <input class="mc-input" id="tl-crit" placeholder="Criterios de la lista (opcional)" style="font-size:12px">
    <div id="tl-rows"></div>
    <p class="mc-label" style="margin-top:14px">Sin clasificar</p>
    <div class="tier-pool" id="tl-pool"></div>`;

    const nameI = wrap.querySelector('#tl-name');
    nameI.value = state.draft.name;
    nameI.addEventListener('input', () => { state.draft.name = nameI.value; markDirty(); });
    wrap.querySelector('#tl-cat').textContent = categoryLabel(state.draft.category);
    const critI = wrap.querySelector('#tl-crit');
    critI.value = state.draft.criteria || '';
    critI.addEventListener('input', () => { state.draft.criteria = critI.value; markDirty(); });

    const saveBtn = wrap.querySelector('#tl-save');
    function markDirty() { state.dirty = true; saveBtn.disabled = false; }

    wrap.querySelector('#tl-back').addEventListener('click', async () => {
      if (state.dirty && !(await confirmDialog({ title: 'Cambios sin guardar', message: '¿Salir y perder los cambios?', confirmLabel: 'Salir' }))) return;
      navigate('tiers');
      renderList();
    });
    wrap.querySelector('#tl-row-new').addEventListener('click', () => rowModal(null));
    wrap.querySelector('#tl-export').addEventListener('click', () => exportListModal(full));
    wrap.querySelector('#tl-suggest').addEventListener('click', suggest);
    wrap.querySelector('#tl-add').addEventListener('click', async () => {
      const it = await openItemPicker({
        api,
        category: state.draft.category === 'mixed' ? undefined : state.draft.category,
        title: 'Añadir ítem a la lista',
        excludeIds: state.draft.entries.map((e) => e.itemId),
      });
      if (!it) return;
      poolableIds.add(it.id);
      state.itemsById[it.id] = it;
      state.draft.entries.push({ itemId: it.id, rowKey: null });
      markDirty(); renderRows();
    });
    saveBtn.addEventListener('click', save);

    async function save() {
      try {
        await api.patch(`/api/tierlists/${full.id}`, {
          name: state.draft.name,
          criteria: state.draft.criteria || null,
          rows: state.draft.rows,
          entries: state.draft.entries.filter((e) => e.rowKey),
        });
        state.dirty = false;
        saveBtn.disabled = true;
        toast.success('Tier list guardada');
        bus.emit('data:changed');
        await loadLists();
      } catch (e) { toast.error(`No se pudo guardar: ${e.message}`); }
    }

    function entryAt(itemId) {
      return state.draft.entries.find((e) => e.itemId === itemId);
    }
    function ensureEntry(itemId) {
      let en = entryAt(itemId);
      if (!en) { en = { itemId, rowKey: null }; state.draft.entries.push(en); }
      return en;
    }
    function moveTo(itemId, key) {
      ensureEntry(itemId).rowKey = key;
      markDirty(); renderRows();
    }

    // --- drag & drop ---
    function dropZone(zone, key) {
      zone.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; zone.style.outline = '2px dashed var(--accent-gold)'; });
      zone.addEventListener('dragleave', () => { zone.style.outline = ''; });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.style.outline = '';
        const id = e.dataTransfer.getData('text/plain');
        if (id) moveTo(id, key);
      });
    }

    function rowModal(row) {
      // crear o renombrar fila
      const body = document.createElement('div');
      const li = document.createElement('input');
      li.className = 'mc-input';
      li.value = row?.label || '';
      li.placeholder = 'Etiqueta de la fila (S, A, B…)';
      const ci = document.createElement('input');
      ci.type = 'color';
      ci.value = row?.color || ROW_COLORS[state.draft.rows.length % ROW_COLORS.length];
      ci.style.width = '60px';
      ci.style.height = '34px';
      const mk = (t, i) => { const l = document.createElement('label'); l.className = 'mc-label'; l.innerHTML = escapeHtml(t); const d = document.createElement('div'); d.append(l, i); return d; };
      body.append(mk('Etiqueta *', li), mk('Color', ci));
      openModal({
        title: row ? `Renombrar fila ${row.label}` : 'Nueva fila',
        body,
        actions: [
          { label: 'Cancelar', kind: 'ghost', onClick: () => {} },
          {
            label: 'Aceptar', kind: 'primary',
            onClick: () => {
              if (!li.value.trim()) { toast.warn('La fila necesita etiqueta.'); return false; }
              if (row) { row.label = li.value.trim(); row.color = ci.value; }
              else state.draft.rows.push({ key: rowKey(), label: li.value.trim(), color: ci.value });
              markDirty(); renderRows();
            },
          },
        ],
      });
    }

    function entryModal(itemId) {
      const item = state.itemsById[itemId];
      const en = ensureEntry(itemId);
      const body = document.createElement('div');
      const h = document.createElement('p');
      h.className = 'pixel-sm';
      h.style.margin = '0 0 8px';
      h.textContent = itemTitle(item);
      body.appendChild(h);

      const reasonI = document.createElement('input');
      reasonI.className = 'mc-input';
      reasonI.placeholder = 'Motivo del rango (opcional)';
      reasonI.value = en.reason || '';
      const notesI = document.createElement('textarea');
      notesI.className = 'mc-textarea';
      notesI.rows = 2;
      notesI.placeholder = 'Notas';
      notesI.value = en.notes || '';
      const mk = (t, i) => { const l = document.createElement('label'); l.className = 'mc-label'; l.innerHTML = escapeHtml(t); const d = document.createElement('div'); d.append(l, i); return d; };
      body.append(mk('Motivo', reasonI), mk('Notas', notesI));

      const idx = state.draft.rows.findIndex((r) => r.key === en.rowKey);
      const moveRow = document.createElement('div');
      moveRow.className = 'row wrap';
      moveRow.style.marginTop = '10px';
      const up = document.createElement('button');
      up.className = 'mc-btn mc-btn--sm';
      up.textContent = '▲ Subir rango';
      up.disabled = idx <= 0;
      up.addEventListener('click', () => { en.rowKey = state.draft.rows[idx - 1].key; markDirty(); renderRows(); m.close(); });
      const down = document.createElement('button');
      down.className = 'mc-btn mc-btn--sm';
      down.textContent = '▼ Bajar rango';
      down.disabled = idx === -1 || idx >= state.draft.rows.length - 1;
      down.addEventListener('click', () => { en.rowKey = state.draft.rows[idx + 1].key; markDirty(); renderRows(); m.close(); });
      const poolBtn = document.createElement('button');
      poolBtn.className = 'mc-btn mc-btn--sm mc-btn--ghost';
      poolBtn.textContent = 'Quitar de las filas';
      poolBtn.disabled = idx === -1;
      poolBtn.addEventListener('click', () => { en.rowKey = null; markDirty(); renderRows(); m.close(); });
      moveRow.append(up, down, poolBtn);
      body.appendChild(moveRow);

      // Accesibilidad: mover directo a una fila concreta (sin drag&drop)
      const moveSelWrap = document.createElement('div');
      moveSelWrap.className = 'row';
      moveSelWrap.style.marginTop = '8px';
      const moveSel = document.createElement('select');
      moveSel.className = 'mc-select';
      moveSel.innerHTML = '<option value="">— Sin clasificar —</option>' +
        state.draft.rows.map((r) => `<option value="${escapeHtml(r.key)}">${escapeHtml(r.label)}</option>`).join('');
      moveSel.value = en.rowKey || '';
      const moveBtn = document.createElement('button');
      moveBtn.className = 'mc-btn mc-btn--sm';
      moveBtn.textContent = 'Mover a fila';
      moveBtn.addEventListener('click', () => {
        en.rowKey = moveSel.value || null;
        markDirty(); renderRows(); m.close();
      });
      moveSelWrap.append(moveSel, moveBtn);
      body.appendChild(moveSelWrap);

      const m = openModal({
        title: `Ítem: ${itemTitle(item)}`,
        body,
        actions: [
          { label: 'Cerrar', kind: 'ghost', onClick: () => {} },
          {
            label: 'Guardar', kind: 'primary',
            onClick: () => {
              en.reason = reasonI.value.trim() || undefined;
              en.notes = notesI.value.trim() || undefined;
              markDirty();
            },
          },
        ],
      });
    }

    function cardEl(it, placed) {
      const card = itemCard({
        item: it, size: 48, showPower: false, showQty: false, showFav: false,
        draggable: true,
        onClick: () => entryModal(it.id),
        onContext: () => entryModal(it.id),
        title: `${itemTitle(it)} — clic para motivo/mover`,
      });
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', it.id);
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dblclick', () => entryModal(it.id));
      return card;
    }

    function renderRows() {
      const rowsEl = wrap.querySelector('#tl-rows');
      const poolEl = wrap.querySelector('#tl-pool');
      rowsEl.innerHTML = '';
      poolEl.innerHTML = '';

      for (const row of state.draft.rows) {
        const r = document.createElement('div');
        r.className = 'tier-row';
        const lab = document.createElement('div');
        lab.className = 'tier-row__label';
        lab.style.background = row.color || 'var(--bg-panel-deep)';
        lab.style.color = '#1d1819';
        lab.textContent = row.label;
        lab.title = 'Doble clic para renombrar';
        lab.addEventListener('dblclick', () => rowModal(row));
        const items = document.createElement('div');
        items.className = 'tier-row__items';
        dropZone(items, row.key);
        for (const en of state.draft.entries.filter((e) => e.rowKey === row.key)) {
          const it = state.itemsById[en.itemId];
          if (it) items.appendChild(cardEl(it, true));
        }
        const tools = document.createElement('div');
        tools.style.display = 'flex';
        tools.style.flexDirection = 'column';
        tools.style.gap = '4px';
        tools.style.marginLeft = '6px';
        const ren = document.createElement('button');
        ren.className = 'mc-iconbtn';
        ren.innerHTML = '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M11 1l4 4-9 9H2v-4l9-9zm-7 12h1l7-7-1-1-7 7v1z"/></svg>';
        ren.title = 'Renombrar fila';
        ren.addEventListener('click', () => rowModal(row));
        const del = document.createElement('button');
        del.className = 'mc-iconbtn';
        del.innerHTML = '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M4 2h8v1H4zM3 4h10l-1 10H4L3 4z"/></svg>';
        del.title = 'Borrar fila (sus ítems vuelven al pool)';
        del.addEventListener('click', async () => {
          if (!(await confirmDialog({ title: 'Borrar fila', message: `¿Borrar la fila «${row.label}»? Sus ítems quedarán sin clasificar.`, confirmLabel: 'Borrar', danger: true }))) return;
          state.draft.entries.forEach((e) => { if (e.rowKey === row.key) e.rowKey = null; });
          state.draft.rows = state.draft.rows.filter((r) => r.key !== row.key);
          markDirty(); renderRows();
        });
        tools.append(ren, del);
        r.append(lab, items, tools);
        rowsEl.appendChild(r);
      }
      if (!state.draft.rows.length) {
        rowsEl.appendChild(emptyState({
          icon: '☰', title: 'Sin filas', message: 'Crea la primera fila de la lista.',
          actionLabel: '＋ Nueva fila', onAction: () => rowModal(null),
        }));
      }

      // pool: items de la categoría sin fila asignada
      dropZone(poolEl, null);
      const placed = new Set(state.draft.entries.filter((e) => e.rowKey).map((e) => e.itemId));
      const unplaced = [...poolableIds]
        .filter((id) => !placed.has(id))
        .map((id) => state.itemsById[id])
        .filter(Boolean);
      if (!unplaced.length) {
        poolEl.innerHTML = '<span class="muted" style="font-size:12px">Todos los ítems de esta categoría están clasificados.</span>';
      }
      for (const it of unplaced) poolEl.appendChild(cardEl(it, false));
    }

    async function suggest() {
      const candidates = [...poolableIds].map((id) => state.itemsById[id]).filter(Boolean);
      if (!state.draft.rows.length || !candidates.length) {
        toast.warn('Se necesitan filas e ítems para sugerir.');
        return;
      }
      const sorted = [...candidates].sort((a, b) => heuristicScore(b) - heuristicScore(a));
      const n = state.draft.rows.length;
      const proposal = sorted.map((it, i) => ({
        item: it,
        rowKey: state.draft.rows[Math.min(n - 1, Math.floor(i * n / sorted.length))].key,
      }));
      // vista previa — NUNCA se aplica sin confirmar
      const body = document.createElement('div');
      const intro = document.createElement('p');
      intro.className = 'muted';
      intro.style.fontSize = '12px';
      intro.textContent = 'Propuesta por rareza y efectos registrados. Revisa antes de aplicar: no es una valoración definitiva.';
      body.appendChild(intro);
      for (const row of state.draft.rows) {
        const its = proposal.filter((p) => p.rowKey === row.key).map((p) => p.item);
        if (!its.length) continue;
        const rowEl = document.createElement('div');
        rowEl.className = 'stat-row';
        rowEl.innerHTML = `<span class="k" style="color:${escapeHtml(row.color)}">${escapeHtml(row.label)}</span><span class="v">${its.map((i) => escapeHtml(itemTitle(i))).join(' · ')}</span>`;
        body.appendChild(rowEl);
      }
      openModal({
        title: 'Sugerencia de orden (vista previa)',
        body,
        wide: true,
        actions: [
          { label: 'Descartar', kind: 'ghost', onClick: () => {} },
          {
            label: 'Aplicar propuesta', kind: 'primary',
            onClick: () => {
              for (const p of proposal) ensureEntry(p.item.id).rowKey = p.rowKey;
              markDirty(); renderRows();
              toast.info('Propuesta aplicada — recuerda guardar.');
            },
          },
        ],
      });
    }

    renderRows();
  }

  async function loadLists() {
    try {
      state.lists = asList(await api.get('/api/tierlists'));
    } catch (e) {
      toast.error(`No se pudieron cargar las listas: ${e.message}`);
      state.lists = [];
    }
  }

  // arranque
  wrap.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    const items = asList(await api.get(`/api/items${qs({ pageSize: 5000 })}`));
    state.itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
  } catch { toast.warn('Catálogo no disponible.'); }
  await loadLists();

  if (ctx.param) {
    const target = state.lists.find((l) => l.id === ctx.param);
    if (target) { openEditor(target); return; }
    toast.warn('Lista no encontrada.');
  }
  renderList();
}
