/**
 * screens/builds.js — Builds guardadas + editor con puntuación en vivo.
 * La puntuación se etiqueta siempre como estimación de los criterios del usuario.
 */
import { escapeHtml } from '../app.js';
import { qs } from '../api/client.js';
import { openModal } from '../ui/modal.js';
import { confirmDialog } from '../ui/confirm.js';
import { toast } from '../ui/toast.js';
import { itemCard } from '../ui/itemCard.js';
import { buildCard } from '../ui/buildCard.js';
import { emptyState } from '../ui/emptyState.js';
import { openItemPicker } from '../ui/itemPicker.js';
import { enchantSlotsEditor, acceptsEnchants, slotOptionsFor } from '../ui/enchantSlots.js';
import { weightsEditor, scoreBreakdownEl } from '../ui/scoring.js';
import {
  asList, goalLabel, itemTitle, GOAL_LABELS,
} from '../ui/format.js';

export const title = 'Builds';

const SLOTS = [
  { key: 'meleeItemId', cat: 'melee_weapon', label: 'Cuerpo a cuerpo' },
  { key: 'rangedItemId', cat: 'ranged_weapon', label: 'A distancia' },
  { key: 'armorItemId', cat: 'armor', label: 'Armadura' },
];

function emptyBuild() {
  return {
    name: '', goal: 'balanced', playstyle: '',
    meleeItemId: null, rangedItemId: null, armorItemId: null,
    artifactItemIds: [null, null, null],
    enchantChoices: {}, weights: {}, notes: '', status: 'saved',
  };
}

/** Normaliza meta.buildGoals → [[key,label]]. */
function goalOptions(meta) {
  const g = meta?.buildGoals || meta?.goals || Object.keys(GOAL_LABELS);
  if (Array.isArray(g)) {
    return g.map((x) => (typeof x === 'string' ? [x, goalLabel(x)] : [x.value || x.key || x.id, x.label || goalLabel(x.value || x.key)]));
  }
  if (g && typeof g === 'object') return Object.entries(g).map(([k, v]) => [k, typeof v === 'string' ? v : (v.label || goalLabel(k))]);
  return Object.keys(GOAL_LABELS).map((k) => [k, goalLabel(k)]);
}

export async function mount(el, ctx) {
  const { api, bus } = ctx;
  const state = { builds: [], itemsById: {}, enchMap: {}, goals: [] };

  el.innerHTML = `<div class="screen-page"><div class="wrap">
    <div class="row wrap">
      <h2 class="pixel-sm" style="margin:0">Builds</h2>
      <span class="muted pixel-sm" id="b-count"></span>
      <span class="grow"></span>
      <button class="mc-btn mc-btn--primary" id="new-build">＋ Nueva build</button>
    </div>
    <p class="muted" style="margin:0;font-size:12px">La puntuación es una estimación según tus criterios, no una verdad absoluta.</p>
    <div id="b-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px"></div>
  </div></div>`;

  const listEl = el.querySelector('#b-list');
  const countEl = el.querySelector('#b-count');

  el.querySelector('#new-build').addEventListener('click', () => openEditor(null));

  function renderList() {
    listEl.innerHTML = '';
    countEl.textContent = `${state.builds.length} guardada${state.builds.length === 1 ? '' : 's'}`;
    if (!state.builds.length) {
      listEl.appendChild(emptyState({
        icon: '⚒', title: 'Sin builds todavía',
        message: 'Crea tu primera combinación de equipo y artefactos.',
        actionLabel: 'Nueva build', onAction: () => openEditor(null),
      }));
      return;
    }
    for (const b of state.builds) {
      listEl.appendChild(buildCard({
        build: b,
        itemsById: state.itemsById,
        onOpen: () => openEditor(b),
        onDuplicate: async (bb) => {
          try {
            await api.post(`/api/builds/${bb.id}/duplicate`, {});
            toast.success('Build duplicada');
            bus.emit('data:changed');
            load();
          } catch (e) { toast.error(`No se pudo duplicar: ${e.message}`); }
        },
        onExport: (bb) => exportMenu(bb),
        onDelete: async (bb) => {
          const ok = await confirmDialog({
            title: 'Borrar build', danger: true, confirmLabel: 'Borrar',
            message: `¿Borrar «${bb.name}»? Esta acción no se puede deshacer.`,
          });
          if (!ok) return;
          try {
            await api.del(`/api/builds/${bb.id}`);
            toast.success('Build borrada');
            bus.emit('data:changed');
            load();
          } catch (e) { toast.error(`No se pudo borrar: ${e.message}`); }
        },
      }));
    }
  }

  function exportMenu(b) {
    const body = document.createElement('div');
    body.innerHTML = `<p class="muted">Elige el formato de exportación para «${escapeHtml(b.name)}».</p>`;
    openModal({
      title: 'Exportar build',
      body,
      actions: [
        { label: 'PDF', onClick: async () => { await dl(b, 'pdf'); } },
        { label: 'TXT', onClick: async () => { await dl(b, 'txt'); } },
        { label: 'Cancelar', kind: 'ghost', onClick: () => {} },
      ],
    });
  }

  async function dl(b, fmt) {
    try {
      await api.download(`/api/export/build/${b.id}?format=${fmt}`, `build-${b.id}.${fmt}`);
    } catch (e) { toast.error(`Exportación fallida: ${e.message}`); }
  }

  // ---------- Editor ----------
  function openEditor(build) {
    const draft = build ? JSON.parse(JSON.stringify(build)) : emptyBuild();
    draft.artifactItemIds = [...(draft.artifactItemIds || [])].slice(0, 3);
    while (draft.artifactItemIds.length < 3) draft.artifactItemIds.push(null);
    draft.enchantChoices = draft.enchantChoices || {};
    draft.weights = draft.weights || {};
    const isNew = !build?.id;

    const body = document.createElement('div');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';

    // campos básicos
    const nameI = document.createElement('input');
    nameI.className = 'mc-input';
    nameI.placeholder = 'Nombre de la build *';
    nameI.value = draft.name || '';
    nameI.addEventListener('input', () => { draft.name = nameI.value; });

    const goalSel = document.createElement('select');
    goalSel.className = 'mc-select';
    for (const [v, l] of state.goals) {
      const o = document.createElement('option');
      o.value = v; o.innerHTML = escapeHtml(l);
      if (v === draft.goal) o.selected = true;
      goalSel.appendChild(o);
    }
    goalSel.addEventListener('change', () => { draft.goal = goalSel.value; schedulePreview(); });

    const styleI = document.createElement('input');
    styleI.className = 'mc-input';
    styleI.placeholder = 'Estilo de juego (p. ej. agresiva, sigilosa…)';
    styleI.value = draft.playstyle || '';
    styleI.addEventListener('input', () => { draft.playstyle = styleI.value; });

    const rowF = document.createElement('div');
    rowF.className = 'row wrap';
    const f1 = document.createElement('div'); f1.style.flex = '1 1 200px'; f1.appendChild(nameI);
    const f2 = document.createElement('div'); f2.style.flex = '1 1 160px'; f2.appendChild(goalSel);
    const f3 = document.createElement('div'); f3.style.flex = '1 1 200px'; f3.appendChild(styleI);
    rowF.append(f1, f2, f3);
    body.appendChild(rowF);

    // slots de equipo
    const slotsTitle = document.createElement('p');
    slotsTitle.className = 'mc-label';
    slotsTitle.textContent = 'Equipo';
    const slotsRow = document.createElement('div');
    slotsRow.className = 'row wrap';
    body.append(slotsTitle, slotsRow);

    // encantamientos por ítem
    const enchTitle = document.createElement('p');
    enchTitle.className = 'mc-label';
    enchTitle.textContent = 'Encantamientos elegidos por pieza';
    const enchWrap = document.createElement('div');
    enchWrap.style.display = 'flex';
    enchWrap.style.flexDirection = 'column';
    enchWrap.style.gap = '6px';
    body.append(enchTitle, enchWrap);

    // pesos
    const wTitle = document.createElement('p');
    wTitle.className = 'mc-label';
    wTitle.textContent = 'Pesos de los criterios (0–10)';
    body.appendChild(wTitle);
    body.appendChild(weightsEditor({
      values: draft.weights,
      onChange: (w) => { draft.weights = w; schedulePreview(); },
    }));

    // vista previa de puntuación
    const pvTitle = document.createElement('p');
    pvTitle.className = 'mc-label';
    pvTitle.textContent = 'Estimación en vivo';
    const pvBox = document.createElement('div');
    pvBox.className = 'mc-panel mc-panel--deep';
    pvBox.innerHTML = '<p class="muted" style="margin:0">Sin datos de puntuación todavía.</p>';
    body.append(pvTitle, pvBox);

    function equippedItemIds() {
      return [draft.meleeItemId, draft.rangedItemId, draft.armorItemId, ...draft.artifactItemIds].filter(Boolean);
    }

    function renderSlots() {
      slotsRow.innerHTML = '';
      const defs = [
        ...SLOTS.map((s) => ({ ...s, get: () => draft[s.key], set: (v) => { draft[s.key] = v; } })),
        ...[0, 1, 2].map((i) => ({
          cat: 'artifact', label: `Artefacto ${i + 1}`,
          get: () => draft.artifactItemIds[i],
          set: (v) => { draft.artifactItemIds[i] = v; },
        })),
      ];
      for (const d of defs) {
        const cell = document.createElement('div');
        cell.style.display = 'flex';
        cell.style.flexDirection = 'column';
        cell.style.alignItems = 'center';
        cell.style.gap = '4px';
        const item = d.get() ? state.itemsById[d.get()] : null;
        const card = item
          ? itemCard({ item, size: 52, showPower: false, showQty: false, showFav: false, title: `${d.label}: ${itemTitle(item)}`, onClick: pick })
          : (() => {
              const s = document.createElement('div');
              s.className = 'equip-slot empty';
              s.style.width = '52px'; s.style.height = '52px';
              s.setAttribute('role', 'button'); s.tabIndex = 0;
              const plus = document.createElement('span');
              plus.className = 'pixel muted'; plus.textContent = '+';
              s.appendChild(plus);
              s.addEventListener('click', pick);
              s.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') pick(); });
              return s;
            })();
        async function pick() {
          const chosen = await openItemPicker({ api, category: d.cat, title: d.label });
          if (!chosen) return;
          d.set(chosen.id);
          renderSlots();
          renderEnchants();
          schedulePreview();
        }
        const lab = document.createElement('span');
        lab.className = 'muted pixel-sm';
        lab.style.fontSize = '7px';
        lab.textContent = d.label;
        cell.append(card, lab);
        if (item) {
          const rm = document.createElement('button');
          rm.className = 'mc-btn mc-btn--sm mc-btn--ghost';
          rm.textContent = 'Quitar';
          rm.addEventListener('click', () => { d.set(null); delete draft.enchantChoices[item.id]; renderSlots(); renderEnchants(); schedulePreview(); });
          cell.appendChild(rm);
        }
        slotsRow.appendChild(cell);
      }
    }

    function renderEnchants() {
      enchWrap.innerHTML = '';
      const gearIds = [draft.meleeItemId, draft.rangedItemId, draft.armorItemId].filter(Boolean);
      if (!gearIds.length) {
        enchWrap.innerHTML = '<p class="muted" style="margin:0;font-size:12px">Equipo un arma o armadura para elegir encantamientos.</p>';
        return;
      }
      for (const id of gearIds) {
        const item = state.itemsById[id];
        if (!item || !acceptsEnchants(item.category)) continue;
        const row = document.createElement('div');
        row.className = 'mc-panel mc-panel--deep';
        row.style.padding = '8px 12px';
        const h = document.createElement('p');
        h.className = 'pixel-sm';
        h.style.margin = '0 0 2px';
        h.style.fontSize = '8px';
        h.textContent = itemTitle(item);
        row.appendChild(h);
        row.appendChild(enchantSlotsEditor({
          item,
          selectedIds: draft.enchantChoices[id] || [null, null, null],
          optionsBySlot: slotOptionsFor(item, state.enchMap),
          onChange: (ids) => { draft.enchantChoices[id] = ids; schedulePreview(); },
        }));
        enchWrap.appendChild(row);
      }
    }

    // vista previa (debounce)
    let pvTimer = null;
    function schedulePreview() {
      clearTimeout(pvTimer);
      pvTimer = setTimeout(runPreview, 450);
    }
    async function runPreview() {
      if (!equippedItemIds().length) {
        pvBox.innerHTML = '<p class="muted" style="margin:0">Equipo al menos una pieza para estimar.</p>';
        return;
      }
      pvBox.innerHTML = '<p class="muted" style="margin:0">Calculando…</p>';
      try {
        const res = await api.post('/api/builds/score-preview', draft);
        const score = res?.total !== undefined ? res : res?.score;
        pvBox.innerHTML = '';
        pvBox.appendChild(scoreBreakdownEl(score));
      } catch {
        pvBox.innerHTML = '<p class="muted" style="margin:0">Vista previa no disponible.</p>';
      }
    }

    renderSlots();
    renderEnchants();
    runPreview();

    const err = document.createElement('div');
    err.className = 'mc-field-error';
    body.appendChild(err);

    openModal({
      title: isNew ? 'Nueva build' : `Editar build — ${build.name}`,
      body,
      wide: true,
      onClose: () => clearTimeout(pvTimer),
      actions: [
        { label: 'Cancelar', kind: 'ghost', onClick: () => {} },
        {
          label: isNew ? 'Crear build' : 'Guardar cambios',
          kind: 'primary',
          onClick: async () => {
            err.textContent = '';
            if (!draft.name?.trim()) { err.textContent = 'La build necesita un nombre.'; return false; }
            try {
              const payload = { ...draft, name: draft.name.trim(), status: draft.status || 'saved' };
              if (isNew) await api.post('/api/builds', payload);
              else await api.patch(`/api/builds/${build.id}`, payload);
              toast.success('Build guardada');
              bus.emit('data:changed');
              load();
            } catch (e) {
              err.textContent = `Error al guardar: ${e.message}`;
              return false;
            }
          },
        },
      ],
    });
  }

  async function load() {
    listEl.innerHTML = '<p class="muted">Cargando builds…</p>';
    try {
      const [builds, items, enchs, meta] = await Promise.all([
        api.get('/api/builds').then(asList).catch(() => []),
        api.get(`/api/items${qs({ pageSize: 5000 })}`).then(asList).catch(() => []),
        api.get('/api/enchantments?pageSize=2000').then(asList).catch(() => []),
        api.get('/api/meta').catch(() => null),
      ]);
      state.builds = builds;
      state.itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
      state.enchMap = Object.fromEntries(enchs.map((e) => [e.id, e]));
      state.goals = goalOptions(meta);
    } catch (e) {
      listEl.innerHTML = '';
      listEl.appendChild(emptyState({
        icon: '⚠', title: 'No se pudieron cargar las builds',
        message: e.message, actionLabel: 'Reintentar', onAction: load,
      }));
      return;
    }
    renderList();

    // deep-link: #/builds/<id>
    if (ctx.param) {
      const target = state.builds.find((b) => b.id === ctx.param);
      if (target) openEditor(target);
    }
  }

  await load();
}
