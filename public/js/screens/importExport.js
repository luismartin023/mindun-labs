/**
 * screens/importExport.js — Exportar datasets / importar respaldo JSON
 * con vista previa y deshacer + subida y vinculación de imágenes (assets).
 */
import { escapeHtml } from '../app.js';
import { toast } from '../ui/toast.js';
import { dataTable } from '../ui/dataTable.js';
import { restoreBackupFlow, downloadImportSchema } from '../ui/backupFlow.js';
import {
  categoryLabel, itemTitle,
} from '../ui/format.js';

export const title = 'Importar/Exportar';

const EXPORTABLES = [
  ['inventory', 'Inventario'],
  ['catalog', 'Catálogo'],
  ['enchantments', 'Encantamientos'],
  ['builds', 'Builds'],
  ['tierlists', 'Tier lists'],
  ['profile', 'Perfil'],
];
const ASSET_CATS = ['melee_weapon', 'ranged_weapon', 'armor', 'artifact', 'enchantment', 'otra'];

export async function mount(el, ctx) {
  const { api, bus } = ctx;
  const state = { itemsById: {}, uploaded: [], counts: null };

  el.innerHTML = `<div class="screen-page"><div class="wrap">
    <h2 class="pixel-sm" style="margin:0">Importar / Exportar</h2>

    <div class="mc-panel">
      <h3 class="pixel-sm" style="margin:0 0 8px">Exportar datos</h3>
      <div id="exp-datasets" class="row wrap"></div>
      <p class="mc-label">Formato</p>
      <div id="exp-formats" class="row wrap"></div>
      <div id="exp-preview" class="muted" style="font-size:12px;margin:10px 0"></div>
      <div class="row wrap">
        <button class="mc-btn mc-btn--sm" id="exp-sum">Ver resumen</button>
        <button class="mc-btn mc-btn--primary" id="exp-go">Exportar</button>
      </div>
    </div>

    <div class="mc-panel">
      <h3 class="pixel-sm" style="margin:0 0 8px">Importar respaldo JSON</h3>
      <p class="muted" style="font-size:12px;margin:0 0 8px">Se hace una vista previa antes de escribir nada; si hay conflictos los verás y podrás deshacer el lote.</p>
      <div class="row wrap">
        <input type="file" id="imp-file" accept=".json,application/json" class="mc-input" style="max-width:320px">
        <button class="mc-btn mc-btn--sm" id="imp-schema">Descargar plantilla</button>
      </div>
    </div>

    <div class="mc-panel">
      <h3 class="pixel-sm" style="margin:0 0 8px">Subir imágenes</h3>
      <p class="muted" style="font-size:13px;margin:0 0 8px">PNG, JPG, WebP o GIF · máximo 15 MB por imagen. Luego puedes vincular cada archivo a un ítem.</p>
      <div class="row wrap">
        <input type="file" id="up-files" accept=".png,.jpg,.jpeg,.webp,.gif,image/png,image/jpeg,image/webp,image/gif" multiple class="mc-input" style="max-width:280px">
        <select class="mc-select" id="up-cat" style="width:auto"></select>
        <select class="mc-select" id="up-item" style="width:auto;max-width:220px"><option value="">— Vincular a ítem (opcional) —</option></select>
        <button class="mc-btn mc-btn--primary" id="up-go">Subir</button>
      </div>
      <div id="up-review" style="margin-top:12px"></div>
    </div>
  </div></div>`;

  const $ = (s) => el.querySelector(s);

  // ---------- EXPORT ----------
  const dsWrap = $('#exp-datasets');
  for (const [k, l] of EXPORTABLES) {
    const lab = document.createElement('label');
    lab.className = 'mc-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = k;
    lab.append(cb, Object.assign(document.createElement('span'), { textContent: l }));
    dsWrap.appendChild(lab);
  }
  const fmtWrap = $('#exp-formats');
  for (const [i, [v, l]] of [['pdf', 'PDF'], ['txt', 'TXT'], ['xlsx', 'XLSX'], ['json', 'Respaldo JSON completo']].entries()) {
    const lab = document.createElement('label');
    lab.className = 'mc-check';
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = 'exp-fmt';
    r.value = v;
    if (i === 0) r.checked = true;
    lab.append(r, Object.assign(document.createElement('span'), { textContent: l }));
    fmtWrap.appendChild(lab);
  }

  $('#exp-sum').addEventListener('click', async () => {
    const out = $('#exp-preview');
    out.textContent = 'Consultando…';
    try {
      const meta = await api.get('/api/meta');
      const c = meta?.counts || {};
      out.textContent = `Inventario: ${c.inventory ?? '—'} · Catálogo: ${c.items ?? '—'} · Encantamientos: ${c.enchantments ?? '—'} · Builds: ${c.builds ?? '—'} · Tier lists: ${c.tierlists ?? '—'}`;
    } catch {
      out.textContent = 'Resumen no disponible (el servidor no responde a /api/meta).';
    }
  });

  const exportButton = $('#exp-go');
  exportButton.addEventListener('click', async () => {
    if (exportButton.disabled) return;
    exportButton.disabled = true;
    const fmt = el.querySelector('input[name="exp-fmt"]:checked')?.value || 'pdf';
    try {
      if (fmt === 'json') {
        await api.download('/api/export/backup?format=json', 'respaldo-mindun.json');
        toast.success('Respaldo descargado');
        return;
      }
      const checked = [...dsWrap.querySelectorAll('input:checked')].map((c) => c.value);
      if (!checked.length) { toast.warn('Marca al menos un dataset.'); return; }
      for (const ds of checked) {
        await api.download(`/api/export/${ds}?format=${fmt}`, `${ds}.${fmt}`);
      }
      toast.success(`Exportado${checked.length > 1 ? 's' : ''}: ${checked.length} archivo(s)`);
    } catch (e) { toast.error(`Exportación fallida: ${e.message}`); }
    finally { exportButton.disabled = false; }
  });

  // ---------- IMPORT (flujo compartido) ----------
  $('#imp-file').addEventListener('change', (e) => {
    const f = e.target.files?.[0];
    if (f) restoreBackupFlow({ api, file: f });
    e.target.value = '';
  });
  $('#imp-schema').addEventListener('click', async () => {
    try { await downloadImportSchema(api); }
    catch (e) { toast.error(`Plantilla no disponible: ${e.message}`); }
  });

  // ---------- IMÁGENES ----------
  const catSel = $('#up-cat');
  for (const c of ASSET_CATS) {
    const o = document.createElement('option');
    o.value = c;
    o.innerHTML = escapeHtml(c === 'otra' ? 'Otra' : categoryLabel(c));
    catSel.appendChild(o);
  }
  const itemSel = $('#up-item');

  $('#up-go').addEventListener('click', async () => {
    const selectedFiles = [...($('#up-files').files || [])];
    if (!selectedFiles.length) { toast.warn('Elige al menos un archivo de imagen.'); return; }
    const maxBytes = 15 * 1024 * 1024;
    const files = selectedFiles.filter((file) => file.size <= maxBytes);
    for (const file of selectedFiles.filter((f) => f.size > maxBytes)) {
      toast.error(`«${file.name}» supera el límite de 15 MB.`);
    }
    if (!files.length) return;
    const btn = $('#up-go');
    btn.disabled = true;
    let ok = 0;
    try {
      for (const f of files) {
        try {
          const fd = new FormData();
          fd.append('file', f);
          fd.append('category', catSel.value);
          if (itemSel.value) fd.append('itemId', itemSel.value);
          const res = await api.upload('/api/assets', fd);
          state.uploaded.push(res?.id ? res : (res?.asset || res));
          ok++;
        } catch (e) { toast.error(`«${f.name}»: ${e.message}`); }
      }
    } finally {
      btn.disabled = false;
      $('#up-files').value = '';
    }
    if (ok) { toast.success(`${ok} imagen(es) subida(s)`); bus.emit('data:changed'); }
    renderReview();
  });

  function renderReview() {
    const host = $('#up-review');
    host.innerHTML = '';
    if (!state.uploaded.length) {
      host.innerHTML = '<p class="muted" style="font-size:12px;margin:0">Las imágenes subidas aparecerán aquí para revisarlas y vincularlas.</p>';
      return;
    }
    const itemOptions = Object.values(state.itemsById)
      .sort((a, b) => itemTitle(a).localeCompare(itemTitle(b), 'es'))
      .map((i) => `<option value="${i.id}">${escapeHtml(itemTitle(i))}</option>`).join('');
    const table = dataTable({
      rows: state.uploaded,
      pageSize: 10,
      searchable: false,
      emptyMsg: 'Sin assets subidos.',
      columns: [
        {
          key: 'img', label: '', sortable: false, width: '46px',
          render: (a) => a.path
            ? `<img class="cell-img" src="${escapeHtml(a.path.startsWith('/') ? a.path : `/${a.path}`)}" alt="">`
            : '<span class="muted">·</span>',
        },
        { key: 'fileName', label: 'Archivo', sortable: false, render: (a) => escapeHtml(a.fileName || a.id || '?') },
        { key: 'category', label: 'Categoría', sortable: false, render: (a) => escapeHtml(a.category || '—') },
        {
          key: 'itemId', label: 'Vincular a ítem', sortable: false,
          render: (a) => {
            const sel = document.createElement('select');
            sel.className = 'mc-select';
            sel.style.width = 'auto';
            sel.style.maxWidth = '200px';
            sel.innerHTML = '<option value="">— Sin vincular —</option>' + itemOptions;
            sel.value = a.itemId || '';
            sel.addEventListener('change', async () => {
              try {
                await api.patch(`/api/assets/${a.id}`, { itemId: sel.value || null, reviewStatus: sel.value ? 'confirmed' : 'unmatched' });
                a.itemId = sel.value || null;
                toast.success('Vínculo guardado');
                bus.emit('data:changed');
              } catch (e) { toast.error(e.message); }
            });
            return sel;
          },
        },
        { key: 'reviewStatus', label: 'Estado', sortable: false, render: (a) => `<span class="muted">${escapeHtml(a.reviewStatus || 'unmatched')}</span>` },
      ],
    });
    host.appendChild(table.el);
  }
  renderReview();

  // catálogo para selects de vinculación
  try {
    const items = await api.getAll('/api/items');
    state.itemsById = Object.fromEntries(items.map((i) => [i.id, i]));
    itemSel.innerHTML = '<option value="">— Vincular a ítem (opcional) —</option>' +
      items.sort((a, b) => itemTitle(a).localeCompare(itemTitle(b), 'es'))
        .map((i) => `<option value="${i.id}">${escapeHtml(itemTitle(i))}</option>`).join('');
  } catch { /* sin catálogo */ }
}
