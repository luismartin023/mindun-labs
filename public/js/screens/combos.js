/**
 * screens/combos.js — Generador de combinaciones con restricciones.
 * Nunca promete "la mejor build": solo "mejor coincidencia para tus criterios".
 */
import { toast } from '../ui/toast.js';
import { itemCard } from '../ui/itemCard.js';
import { emptyState } from '../ui/emptyState.js';
import { openItemPicker } from '../ui/itemPicker.js';
import { weightsEditor, scoreBreakdownEl, scoreBadgeText } from '../ui/scoring.js';
import { enchantChipsPicker } from '../ui/enchantSlots.js';
import {
  asList, rarityLabel, splitList, RARITY_LABELS,
} from '../ui/format.js';

export const title = 'Combinaciones';

const DRAFTS_KEY = 'mindun.compareBuilds';
const RARITIES = Object.keys(RARITY_LABELS);

function drafts() {
  try { return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]'); } catch { return []; }
}

export async function mount(el, ctx) {
  const { api, bus } = ctx;
  const itemsById = {};
  const state = {
    requiredIds: [],   // ≤3
    excludedIds: [],
    rarities: new Set(),
    running: false,
    results: null,
    total: 0,
    truncated: false,
  };

  el.innerHTML = `<div class="screen-page"><div class="wrap">
    <div class="row wrap">
      <h2 class="pixel-sm" style="margin:0">Combinaciones</h2>
      <span class="grow"></span>
      <button class="mc-btn mc-btn--primary" id="gen">Generar</button>
    </div>
    <p class="muted" style="margin:0;font-size:12px">Explora combinaciones que encajan con tus restricciones y pesos. El resultado es una estimación, no una tier list absoluta.</p>
    <div class="mc-panel" id="form"></div>
    <div id="gen-info" class="muted pixel-sm"></div>
    <div id="gen-results" style="display:flex;flex-direction:column;gap:12px"></div>
  </div></div>`;

  const form = el.querySelector('#form');
  const infoEl = el.querySelector('#gen-info');
  const resultsEl = el.querySelector('#gen-results');
  const genBtn = el.querySelector('#gen');

  // ---- restricciones ----
  const constraints = {
    onlyOwned: false,
    artifactCount: 3,
    desiredTags: '',
    desiredEnchantIds: [],
    forbiddenEnchantIds: [],
    limit: 50,
    weights: {},
  };
  let enchantOptions = [];

  function chipRow(container, ids, label, max) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '4px';
    const lab = document.createElement('span');
    lab.className = 'mc-label';
    lab.style.margin = '0';
    lab.textContent = label;
    const row = document.createElement('div');
    row.className = 'row wrap';
    const add = document.createElement('button');
    add.className = 'mc-btn mc-btn--sm';
    add.textContent = '＋ Elegir';
    add.addEventListener('click', async () => {
      add.disabled = true;
      try {
        const it = await openItemPicker({ api, title: label, excludeIds: [...state.requiredIds, ...state.excludedIds] });
        if (!it) return;
        ids.push(it.id);
        render();
      } finally { add.disabled = false; }
    });
    function render() {
      row.innerHTML = '';
      ids.forEach((id, i) => {
        const it = itemsById[id];
        const cell = document.createElement('div');
        cell.style.position = 'relative';
        const card = it
          ? itemCard({ item: it, size: 44, showPower: false, showQty: false, showFav: false })
          : document.createElement('div');
        cell.appendChild(card);
        const rm = document.createElement('button');
        rm.className = 'mc-btn mc-btn--sm mc-btn--danger';
        rm.textContent = '×';
        rm.style.padding = '2px 6px';
        rm.title = 'Quitar';
        rm.addEventListener('click', () => { ids.splice(i, 1); render(); });
        cell.appendChild(rm);
        row.appendChild(cell);
      });
      if (!max || ids.length < max) row.appendChild(add);
    }
    render();
    wrap.append(lab, row);
    container.appendChild(wrap);
  }

  // montar el formulario
  const topRow = document.createElement('div');
  topRow.className = 'row wrap';
  const ownedL = document.createElement('label');
  ownedL.className = 'mc-check';
  const ownedC = document.createElement('input');
  ownedC.type = 'checkbox';
  ownedC.addEventListener('change', () => { constraints.onlyOwned = ownedC.checked; });
  ownedL.append(ownedC, Object.assign(document.createElement('span'), { textContent: 'Solo ítems que poseo' }));
  const artL = document.createElement('label');
  artL.className = 'row';
  artL.style.gap = '6px';
  const artT = document.createElement('span');
  artT.className = 'pixel-sm muted';
  artT.textContent = 'Artefactos por build';
  const artS = document.createElement('select');
  artS.className = 'mc-select';
  artS.style.width = 'auto';
  for (const n of [0, 1, 2, 3]) {
    const o = document.createElement('option');
    o.value = String(n); o.textContent = n;
    if (n === 3) o.selected = true;
    artS.appendChild(o);
  }
  artS.addEventListener('change', () => { constraints.artifactCount = Number(artS.value); });
  artL.append(artT, artS);
  const limL = document.createElement('label');
  limL.className = 'row';
  limL.style.gap = '6px';
  const limT = document.createElement('span');
  limT.className = 'pixel-sm muted';
  limT.textContent = 'Máx. resultados';
  const limI = document.createElement('input');
  limI.className = 'mc-input';
  limI.type = 'number';
  limI.min = '1'; limI.max = '200'; limI.value = '50';
  limI.style.width = '90px';
  limI.addEventListener('change', () => {
    constraints.limit = Math.max(1, Math.min(200, Number(limI.value) || 50));
    limI.value = String(constraints.limit);
  });
  limL.append(limT, limI);
  topRow.append(ownedL, artL, limL);
  form.appendChild(topRow);

  const rarWrap = document.createElement('div');
  const rarL = document.createElement('p');
  rarL.className = 'mc-label';
  rarL.textContent = 'Rarezas admitidas (ninguna marcada = todas)';
  const rarRow = document.createElement('div');
  rarRow.className = 'row wrap';
  for (const r of RARITIES) {
    const l = document.createElement('label');
    l.className = 'mc-check';
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.addEventListener('change', () => {
      c.checked ? state.rarities.add(r) : state.rarities.delete(r);
    });
    l.append(c, Object.assign(document.createElement('span'), { textContent: rarityLabel(r) }));
    rarRow.appendChild(l);
  }
  rarWrap.append(rarL, rarRow);
  form.appendChild(rarWrap);

  const tagsI = document.createElement('input');
  tagsI.className = 'mc-input';
  tagsI.placeholder = 'almas, veneno, curación…';
  tagsI.addEventListener('input', () => { constraints.desiredTags = tagsI.value; });
  const tagsL = document.createElement('p');
  tagsL.className = 'mc-label';
  tagsL.textContent = 'Etiquetas deseadas (separadas por comas)';
  form.append(tagsL, tagsI);

  chipRow(form, state.requiredIds, 'Ítems obligatorios (máx. 3)', 3);
  chipRow(form, state.excludedIds, 'Ítems excluidos', 0);

  // Encantamientos deseados/prohibidos: selección con iconos, nunca texto libre
  const enchBlock = document.createElement('div');
  enchBlock.className = 'ench-pp-grid';
  const dWrap = document.createElement('div');
  const dL = document.createElement('p');
  dL.className = 'mc-label';
  dL.textContent = 'Encantamientos deseados';
  const fWrap = document.createElement('div');
  const fL = document.createElement('p');
  fL.className = 'mc-label';
  fL.textContent = 'Encantamientos prohibidos';
  enchBlock.append(dWrap, fWrap);
  form.appendChild(enchBlock);

  function renderEnchantFilters() {
    const desiredPicker = enchantChipsPicker({
      options: enchantOptions.filter((option) => !constraints.forbiddenEnchantIds.includes(option.id)),
      values: constraints.desiredEnchantIds,
      placeholder: 'Añadir deseado…',
      onChange: (ids) => {
        constraints.desiredEnchantIds = ids;
        constraints.forbiddenEnchantIds = constraints.forbiddenEnchantIds.filter((id) => !ids.includes(id));
        renderEnchantFilters();
      },
    });
    const forbiddenPicker = enchantChipsPicker({
      options: enchantOptions.filter((option) => !constraints.desiredEnchantIds.includes(option.id)),
      values: constraints.forbiddenEnchantIds,
      placeholder: 'Añadir prohibido…',
      onChange: (ids) => {
        constraints.forbiddenEnchantIds = ids;
        constraints.desiredEnchantIds = constraints.desiredEnchantIds.filter((id) => !ids.includes(id));
        renderEnchantFilters();
      },
    });
    dWrap.replaceChildren(dL, desiredPicker);
    fWrap.replaceChildren(fL, forbiddenPicker);
  }
  renderEnchantFilters();

  const wL = document.createElement('p');
  wL.className = 'mc-label';
  wL.textContent = 'Pesos de los criterios (0–10)';
  form.appendChild(wL);
  form.appendChild(weightsEditor({
    values: constraints.weights,
    onChange: (w) => { constraints.weights = w; },
  }));

  genBtn.addEventListener('click', run);

  async function run() {
    if (state.running) return;
    state.running = true;
    genBtn.disabled = true;
    genBtn.textContent = 'Generando…';
    infoEl.textContent = '';
    resultsEl.innerHTML = '';
    try {
      const body = {
        constraints: {
          onlyOwned: constraints.onlyOwned,
          artifactCount: constraints.artifactCount,
          requiredIds: [...state.requiredIds],
          excludedIds: [...state.excludedIds],
          rarities: [...state.rarities],
          desiredTags: splitList(constraints.desiredTags),
          desiredEnchantIds: constraints.desiredEnchantIds,
          forbiddenEnchantIds: constraints.forbiddenEnchantIds,
        },
        weights: constraints.weights,
        limit: constraints.limit,
      };
      const res = await api.post('/api/builds/generate', body);
      const results = Array.isArray(res?.results) ? res.results : asList(res);
      state.results = results;
      state.total = res?.explored ?? res?.total ?? results.length;
      state.truncated = Boolean(res?.truncated);
      renderResults();
    } catch (e) {
      toast.error(`Generación fallida: ${e.message}`);
      resultsEl.appendChild(emptyState({
        icon: '⚠', title: 'No se pudo generar',
        message: e.message,
      }));
    } finally {
      state.running = false;
      genBtn.disabled = false;
      genBtn.textContent = 'Generar';
    }
  }

  function renderResults() {
    resultsEl.innerHTML = '';
    const { results, total, truncated } = state;
    infoEl.textContent = `Se exploraron ${total} combinación${total === 1 ? '' : 'es'} · ${results.length} resultado${results.length === 1 ? '' : 's'}${truncated ? ' (lista truncada: sube el límite o afina los filtros)' : ''}`;
    if (!results.length) {
      resultsEl.appendChild(emptyState({
        icon: '⚒', title: 'Sin coincidencias',
        message: 'Ninguna combinación cumple las restricciones. Relaja algún filtro.',
      }));
      return;
    }
    const h = document.createElement('h3');
    h.className = 'pixel-sm';
    h.textContent = 'Mejor coincidencia para tus criterios';
    resultsEl.appendChild(h);

    const idOf = (x) => (typeof x === 'string' ? x : x?.id ?? null);
    results.forEach((r, idx) => {
      const build = r.build || r;
      const score = r.score ?? build.score;
      const panel = document.createElement('div');
      panel.className = 'mc-panel';
      const head = document.createElement('div');
      head.className = 'row';
      const rank = document.createElement('span');
      rank.className = 'pixel-sm';
      rank.textContent = `#${idx + 1}`;
      const sc = document.createElement('span');
      sc.className = 'pixel-sm';
      sc.style.color = 'var(--accent-gold)';
      sc.textContent = scoreBadgeText(score);
      sc.title = 'Estimación según tus criterios';
      const grow = document.createElement('span');
      grow.className = 'grow';
      head.append(rank, grow, sc);
      panel.appendChild(head);

      const slots = document.createElement('div');
      slots.className = 'row wrap';
      slots.style.marginTop = '8px';
      const s = r.slots || {};
      const slotItems = [s.melee, s.ranged, s.armor, ...(s.artifacts || [])];
      for (const raw of slotItems) {
        const it = typeof raw === 'string' ? itemsById[raw] : raw;
        if (it) {
          const c = itemCard({ item: it, size: 44, showPower: false, showQty: false, showFav: false });
          slots.appendChild(c);
        } else {
          const e = document.createElement('div');
          e.className = 'equip-slot empty';
          e.style.width = '44px'; e.style.height = '44px';
          slots.appendChild(e);
        }
      }
      panel.appendChild(slots);

      // desglose en <details> para no saturar
      const det = document.createElement('details');
      det.style.marginTop = '8px';
      const sum = document.createElement('summary');
      sum.className = 'muted';
      sum.style.cursor = 'pointer';
      sum.style.fontSize = '12px';
      sum.textContent = 'Desglose de la estimación';
      det.appendChild(sum);
      det.appendChild(scoreBreakdownEl(score));
      panel.appendChild(det);

      const acts = document.createElement('div');
      acts.className = 'row wrap';
      acts.style.marginTop = '10px';
      const save = document.createElement('button');
      save.className = 'mc-btn mc-btn--sm mc-btn--primary';
      save.textContent = 'Guardar como build';
      save.addEventListener('click', async () => {
        if (save.disabled) return;
        save.disabled = true;
        try {
          const name = `Sugerencia ${new Date().toLocaleString('es-ES')}`;
          const arts = (s.artifacts || []).map((a) => (typeof a === 'string' ? a : a?.id ?? null));
          while (arts.length < 3) arts.push(null);
          await api.post('/api/builds', {
            name, status: 'saved',
            meleeItemId: idOf(s.melee), rangedItemId: idOf(s.ranged), armorItemId: idOf(s.armor),
            artifactItemIds: arts,
            weights: constraints.weights,
          });
          toast.success('Guardada en Builds');
          bus.emit('data:changed');
        } catch (e) { toast.error(`No se pudo guardar: ${e.message}`); }
        finally { save.disabled = false; }
      });
      const cmp = document.createElement('button');
      cmp.className = 'mc-btn mc-btn--sm';
      cmp.textContent = 'Comparar';
      cmp.title = 'Guardar como candidata para comparar builds';
      cmp.addEventListener('click', () => {
        const list = drafts();
        list.push({ draft: true, build, score, addedAt: new Date().toISOString() });
        localStorage.setItem(DRAFTS_KEY, JSON.stringify(list.slice(-8)));
        toast.info('Añadida a la comparación de builds (ver Comparar → Builds).');
      });
      acts.append(save, cmp);
      panel.appendChild(acts);
      resultsEl.appendChild(panel);
    });
  }

  // precargar ítems para tarjetas de requeridos/excluidos y resultados
  try {
    const [items, enchs] = await Promise.all([
      api.getAll('/api/items'),
      api.getAll('/api/enchantments').catch((error) => {
        toast.warn(`Encantamientos no disponibles: ${error.message}`);
        return [];
      }),
    ]);
    for (const i of items) itemsById[i.id] = i;
    enchantOptions = enchs;
    renderEnchantFilters();
  } catch (e) {
    toast.warn(`Catálogo no disponible: ${e.message}`);
  }
}
