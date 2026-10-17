/**
 * screens/compare.js — Comparación lado a lado de 2-4 ítems o de 2 builds.
 * Celdas que difieren se resaltan (fondo ámbar suave); ausente = "Sin registrar".
 */
import { escapeHtml } from '../app.js';
import { toast } from '../ui/toast.js';
import { itemCard } from '../ui/itemCard.js';
import { emptyState } from '../ui/emptyState.js';
import { openItemPicker } from '../ui/itemPicker.js';
import { openModal } from '../ui/modal.js';
import { SCORE_CRITERIA, criterionLabel } from '../ui/scoring.js';
import {
  asList, categoryLabel, enchantName, goalLabel, itemTitle,
  rarityTag, powerText,
} from '../ui/format.js';

export const title = 'Comparar';

const DIFF = 'rgba(230,163,41,.10)';
const COMPARE_KEY = 'mindun.compare';
const DRAFTS_KEY = 'mindun.compareBuilds';

const getCompare = () => { try { return JSON.parse(localStorage.getItem(COMPARE_KEY) || '[]'); } catch { return []; } };
const getDrafts = () => { try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]'); } catch { return []; } };
const MISSING = '<span class="muted">Sin registrar</span>';

export async function mount(el, ctx) {
  const { api, bus } = ctx;
  const state = {
    mode: 'items',
    itemIds: [],
    itemsById: {},
    entriesByItem: {},
    enchMap: {},
    builds: [],
    buildIds: [null, null],
    savedComparisonId: null,
  };

  el.innerHTML = `<div class="screen-page"><div class="wrap">
    <div class="row wrap">
      <h2 class="pixel-sm" style="margin:0">Comparar</h2>
      <div class="row" id="mode-row">
        <button class="mc-btn mc-btn--sm" data-mode="items">Ítems</button>
        <button class="mc-btn mc-btn--sm mc-btn--ghost" data-mode="builds">Builds</button>
      </div>
      <span class="grow"></span>
      <button class="mc-btn mc-btn--sm" id="cmp-save">Guardar comparación</button>
      <button class="mc-btn mc-btn--sm" id="cmp-export">Exportar</button>
    </div>
    <div id="cmp-picker"></div>
    <div id="cmp-table"></div>
    <p class="mc-label">Comparaciones guardadas</p>
    <div id="cmp-saved" class="row wrap"></div>
  </div></div>`;

  const pickerEl = el.querySelector('#cmp-picker');
  const tableEl = el.querySelector('#cmp-table');
  const savedEl = el.querySelector('#cmp-saved');

  el.querySelectorAll('#mode-row .mc-btn').forEach((b) => {
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      el.querySelectorAll('#mode-row .mc-btn').forEach((x) =>
        x.classList.toggle('mc-btn--ghost', x !== b));
      render();
    });
  });
  el.querySelector('#cmp-save').addEventListener('click', saveComparison);
  el.querySelector('#cmp-export').addEventListener('click', exportMenu);

  // ---------- datos ----------
  async function preload() {
    const [items, enchs, inv, builds] = await Promise.all([
      api.get('/api/items?pageSize=5000').then(asList).catch(() => []),
      api.get('/api/enchantments?pageSize=2000').then(asList).catch(() => []),
      api.get('/api/inventory').then(asList).catch(() => []),
      api.get('/api/builds').then(asList).catch(() => []),
    ]);
    state.itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
    state.enchMap = Object.fromEntries(enchs.map((e) => [e.id, e]));
    for (const en of inv) (state.entriesByItem[en.itemId] ||= []).push(en);
    state.builds = builds;
    // set desde catálogo
    for (const id of getCompare()) {
      if (state.itemsById[id] && !state.itemIds.includes(id) && state.itemIds.length < 4) {
        state.itemIds.push(id);
      }
    }
  }

  // ---------- selector ----------
  function renderPicker() {
    pickerEl.innerHTML = '';
    if (state.mode === 'items') {
      const row = document.createElement('div');
      row.className = 'row wrap';
      state.itemIds.forEach((id, i) => {
        const it = state.itemsById[id];
        const cell = document.createElement('div');
        cell.style.display = 'flex';
        cell.style.flexDirection = 'column';
        cell.style.alignItems = 'center';
        cell.style.gap = '4px';
        if (it) cell.appendChild(itemCard({ item: it, size: 60, showPower: false, showQty: false, showFav: false }));
        const rm = document.createElement('button');
        rm.className = 'mc-btn mc-btn--sm mc-btn--ghost';
        rm.textContent = 'Quitar';
        rm.addEventListener('click', () => { state.itemIds.splice(i, 1); state.savedComparisonId = null; render(); });
        cell.appendChild(rm);
        row.appendChild(cell);
      });
      if (state.itemIds.length < 4) {
        const add = document.createElement('button');
        add.className = 'mc-btn mc-btn--sm';
        add.textContent = '＋ Añadir ítem';
        add.addEventListener('click', async () => {
          const it = await openItemPicker({ api, title: 'Añadir a la comparación', excludeIds: state.itemIds });
          if (it) { state.itemIds.push(it.id); state.savedComparisonId = null; render(); }
        });
        row.appendChild(add);
      }
      pickerEl.appendChild(row);
      const hint = document.createElement('p');
      hint.className = 'muted';
      hint.style.fontSize = '11px';
      hint.textContent = 'Elige entre 2 y 4 ítems. También puedes marcarlos desde el Catálogo.';
      pickerEl.appendChild(hint);
    } else {
      const row = document.createElement('div');
      row.className = 'row wrap';
      const drafts = getDrafts();
      const options = [
        ...state.builds.map((b) => ({ id: b.id, label: b.name })),
        ...drafts.map((d, i) => ({ id: `draft:${i}`, label: `${d.build?.name || 'Sugerencia'} (no guardada)` })),
      ];
      [0, 1].forEach((slot) => {
        const sel = document.createElement('select');
        sel.className = 'mc-select';
        sel.style.maxWidth = '260px';
        sel.innerHTML = `<option value="">— Build ${slot + 1} —</option>` +
          options.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join('');
        sel.value = state.buildIds[slot] || '';
        sel.addEventListener('change', () => { state.buildIds[slot] = sel.value || null; state.savedComparisonId = null; render(); });
        row.appendChild(sel);
      });
      pickerEl.appendChild(row);
    }
  }

  function buildFromRef(ref) {
    if (!ref) return null;
    if (ref.startsWith('draft:')) return getDrafts()[Number(ref.slice(6))] || null;
    const b = state.builds.find((x) => x.id === ref);
    return b ? { build: b, score: b.score } : null;
  }

  // ---------- tabla comparativa ----------
  function diffCell(td, values, i) {
    const distinct = new Set(values.map((v) => JSON.stringify(v ?? null)));
    if (distinct.size > 1) td.style.background = DIFF;
  }

  function renderItemsTable() {
    const items = state.itemIds.map((id) => state.itemsById[id]).filter(Boolean);
    if (items.length < 2) {
      tableEl.innerHTML = '';
      tableEl.appendChild(emptyState({
        icon: '⚖', title: 'Elige al menos 2 ítems',
        message: 'Añade ítems desde aquí o desde el Catálogo (botón Comparar).',
      }));
      return;
    }
    const entryOf = (it) => state.entriesByItem[it.id]?.[0] || null;

    const rows = [
      ['', (it) => {
        const c = itemCard({ item: it, size: 56, showPower: false, showQty: false, showFav: false });
        const d = document.createElement('div');
        d.appendChild(c);
        return d;
      }, null],
      ['Nombre', (it) => `<strong>${escapeHtml(itemTitle(it))}</strong>`, (it) => itemTitle(it)],
      ['Rareza', (it) => rarityTag(it.rarity), (it) => it.rarity],
      ['Categoría', (it) => escapeHtml(categoryLabel(it.category)), (it) => it.category],
      ['Poder (tu copia)', (it) => {
        const p = entryOf(it)?.powerLevel;
        return p == null ? MISSING : `<span class="pixel-sm">${powerText(p)}</span>`;
      }, (it) => entryOf(it)?.powerLevel ?? null],
      ['Efectos pasivos', (it) => it.passiveEffects?.length
        ? `<ul style="margin:0;padding-left:16px">${it.passiveEffects.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
        : MISSING, (it) => (it.passiveEffects || []).join('|') || null],
      ['Efectos únicos', (it) => it.uniqueEffects?.length
        ? `<ul style="margin:0;padding-left:16px">${it.uniqueEffects.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>`
        : MISSING, (it) => (it.uniqueEffects || []).join('|') || null],
      ['Ubicaciones', (it) => it.locations?.length ? escapeHtml(it.locations.join(', ')) : MISSING, (it) => (it.locations || []).join('|') || null],
      ['Encantamiento fijo', (it) => it.builtInEnchantment ? escapeHtml(it.builtInEnchantment) : MISSING, (it) => it.builtInEnchantment || null],
      ['Encantamientos elegidos', (it) => {
        const ids = entryOf(it)?.selectedEnchantIds?.filter(Boolean) || [];
        if (!ids.length) return MISSING;
        return ids.map((id) => escapeHtml(enchantName(state.enchMap[id] || { name: id }))).join(' · ');
      }, (it) => (entryOf(it)?.selectedEnchantIds || []).join('|') || null],
      ['Etiquetas', (it) => it.tags?.length ? it.tags.map((t) => `<span class="mc-tag">${escapeHtml(t)}</span>`).join('') : MISSING, (it) => (it.tags || []).join('|') || null],
      ['Notas', (it) => {
        const n = entryOf(it)?.notes || it.userNotes;
        return n ? escapeHtml(n) : MISSING;
      }, (it) => entryOf(it)?.notes || it.userNotes || null],
    ];

    const wrapT = document.createElement('div');
    wrapT.className = 'mc-table-wrap';
    const t = document.createElement('table');
    t.className = 'mc-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><th></th>${items.map((it) => `<th>${escapeHtml(itemTitle(it))}</th>`).join('')}</tr>`;
    t.appendChild(thead);
    const tb = document.createElement('tbody');
    for (const [label, render, keyOf] of rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('td');
      th.className = 'muted pixel-sm';
      th.textContent = label;
      tr.appendChild(th);
      const keys = items.map((it) => (keyOf ? keyOf(it) : null));
      items.forEach((it, i) => {
        const td = document.createElement('td');
        const v = render(it);
        if (v instanceof Node) td.appendChild(v); else td.innerHTML = v;
        if (keyOf) diffCell(td, keys, i);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    wrapT.appendChild(t);
    tableEl.innerHTML = '';
    tableEl.appendChild(wrapT);
  }

  function renderBuildsTable() {
    const refs = state.buildIds.map(buildFromRef);
    const valid = refs.filter(Boolean);
    if (valid.length < 2) {
      tableEl.innerHTML = '';
      tableEl.appendChild(emptyState({
        icon: '⚖', title: 'Elige 2 builds',
        message: 'Selecciona builds guardadas o sugerencias de Combinaciones.',
      }));
      return;
    }
    const builds = valid.map((v) => v.build || v);
    const scores = valid.map((v) => v.score ?? (v.build?.score));

    const slotName = (b, key, idx) => {
      const id = key === 'artifact' ? b.artifactItemIds?.[idx] : b[key];
      const it = id ? state.itemsById[id] : null;
      return { html: it ? escapeHtml(itemTitle(it)) : MISSING, val: id || null };
    };

    const critKeys = SCORE_CRITERIA.map(([k]) => k);
    const rows = [
      ['Nombre', (b) => `<strong>${escapeHtml(b.name || 'Sin nombre')}</strong>`, (b) => b.name],
      ['Objetivo', (b) => b.goal ? `<span class="mc-tag">${escapeHtml(goalLabel(b.goal))}</span>` : MISSING, (b) => b.goal],
      ['Estilo', (b) => b.playstyle ? escapeHtml(b.playstyle) : MISSING, (b) => b.playstyle || null],
      ['Cuerpo a cuerpo', (b) => slotName(b, 'meleeItemId').html, (b) => slotName(b, 'meleeItemId').val],
      ['A distancia', (b) => slotName(b, 'rangedItemId').html, (b) => slotName(b, 'rangedItemId').val],
      ['Armadura', (b) => slotName(b, 'armorItemId').html, (b) => slotName(b, 'armorItemId').val],
      ...[0, 1, 2].map((i) => [`Artefacto ${i + 1}`, (b) => slotName(b, 'artifact', i).html, (b) => slotName(b, 'artifact', i).val]),
      ['Puntuación', (b, i) => scores[i]?.total != null
        ? `<span class="pixel-sm" style="color:var(--accent-gold)">★ ${scores[i].total}</span>`
        : MISSING, (b, i) => scores[i]?.total ?? null],
      ...critKeys.map((ck) => [
        `· ${criterionLabel(ck)}`,
        (b, i) => {
          const v = scores[i]?.breakdown?.[ck]?.value;
          return v === null || v === undefined ? MISSING : String(Math.round(v * 10) / 10);
        },
        (b, i) => scores[i]?.breakdown?.[ck]?.value ?? null,
      ]),
    ];

    const wrapT = document.createElement('div');
    wrapT.className = 'mc-table-wrap';
    const t = document.createElement('table');
    t.className = 'mc-table';
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr><th></th>${builds.map((b) => `<th>${escapeHtml(b.name || 'Sin nombre')}</th>`).join('')}</tr>`;
    t.appendChild(thead);
    const tb = document.createElement('tbody');
    const note = document.createElement('p');
    note.className = 'muted';
    note.style.fontSize = '11px';
    note.textContent = 'Puntuación: estimación según los criterios de cada build.';
    for (const [label, render, keyOf] of rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('td');
      th.className = 'muted pixel-sm';
      th.textContent = label;
      tr.appendChild(th);
      const keys = builds.map((b, i) => (keyOf ? keyOf(b, i) : null));
      builds.forEach((b, i) => {
        const td = document.createElement('td');
        td.innerHTML = render(b, i);
        if (keyOf) diffCell(td, keys, i);
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    wrapT.appendChild(t);
    tableEl.innerHTML = '';
    tableEl.append(wrapT, note);
  }

  function render() {
    renderPicker();
    if (state.mode === 'items') renderItemsTable(); else renderBuildsTable();
  }

  // ---------- guardar / exportar ----------
  async function ensureSaved() {
    if (state.savedComparisonId) return state.savedComparisonId;
    const kind = state.mode;
    const refIds = kind === 'items'
      ? state.itemIds
      : state.buildIds.filter((r) => r && !r.startsWith('draft:'));
    const res = await api.post('/api/comparisons', {
      kind,
      refIds,
      name: kind === 'items'
        ? state.itemIds.map((id) => itemTitle(state.itemsById[id])).join(' vs ')
        : state.buildIds.map((r) => buildFromRef(r)?.build?.name || buildFromRef(r)?.name || '?').join(' vs '),
      criteria: 'Comparación manual',
    });
    state.savedComparisonId = res?.id || null;
    return state.savedComparisonId;
  }

  async function saveComparison() {
    try {
      const id = await ensureSaved();
      if (!id) { toast.warn('La comparación se guardó pero sin id de retorno.'); return; }
      toast.success('Comparación guardada');
      bus.emit('data:changed');
      renderSaved();
    } catch (e) { toast.error(`No se pudo guardar: ${e.message}`); }
  }

  function exportMenu() {
    const body = document.createElement('div');
    body.innerHTML = '<p class="muted">Se guardará la comparación y se descargará el archivo.</p>';
    openModal({
      title: 'Exportar comparación',
      body,
      actions: ['pdf', 'txt'].map((f) => ({
        label: f.toUpperCase(),
        onClick: async () => {
          try {
            const id = await ensureSaved();
            if (!id) { toast.error('No hay id de comparación para exportar.'); return false; }
            await api.download(`/api/export/comparison/${id}?format=${f}`, `comparacion.${f}`);
            renderSaved();
          } catch (e) { toast.error(`Exportación fallida: ${e.message}`); return false; }
        },
      })).concat([{ label: 'Cancelar', kind: 'ghost', onClick: () => {} }]),
    });
  }

  async function renderSaved() {
    let list = [];
    try { list = asList(await api.get('/api/comparisons')); } catch { /* sin endpoint */ }
    savedEl.innerHTML = '';
    if (!list.length) {
      savedEl.innerHTML = '<span class="muted" style="font-size:12px">Aún no hay comparaciones guardadas.</span>';
      return;
    }
    for (const c of list.slice(0, 12)) {
      const tag = document.createElement('span');
      tag.className = 'mc-tag';
      tag.style.cursor = 'pointer';
      tag.title = 'Clic para borrar';
      tag.innerHTML = `${escapeHtml(c.name || c.kind)} ✕`;
      tag.addEventListener('click', async () => {
        try { await api.del(`/api/comparisons/${c.id}`); toast.success('Borrada'); bus.emit('data:changed'); renderSaved(); }
        catch (e) { toast.error(e.message); }
      });
      savedEl.appendChild(tag);
    }
  }

  await preload();
  render();
  renderSaved();
}
