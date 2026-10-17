/**
 * ui/backupFlow.js — Flujo compartido de restauración de respaldo JSON:
 * archivo → dry-run POST /api/import/backup → vista previa → confirm →
 * resultado con "Deshacer" (DELETE /api/import/batches/:id/undo).
 * Usado por screens/importExport.js y screens/settings.js.
 */
import { bus, escapeHtml } from '../app.js';
import { openModal } from './modal.js';
import { toast } from './toast.js';
import { readFileText, downloadJson } from './format.js';

/** Renderiza el objeto preview de forma defensiva (la forma puede variar). */
function previewEl(preview) {
  const wrap = document.createElement('div');
  const tbl = document.createElement('table');
  tbl.className = 'mc-table';
  tbl.innerHTML = `<thead><tr><th>Colección</th><th>Insertaría</th><th>Actualizaría</th></tr></thead>`;
  const tb = document.createElement('tbody');

  const ins = preview?.wouldInsert || preview?.insert || preview?.inserts || {};
  const upd = preview?.wouldUpdate || preview?.update || preview?.updates || {};
  const keys = [...new Set([...Object.keys(ins || {}), ...Object.keys(upd || {})])];
  if (keys.length) {
    for (const k of keys) {
      const tr = document.createElement('tr');
      const iv = ins?.[k]; const uv = upd?.[k];
      tr.innerHTML = `<td>${escapeHtml(k)}</td><td>${Array.isArray(iv) ? iv.length : iv ?? 0}</td><td>${Array.isArray(uv) ? uv.length : uv ?? 0}</td>`;
      tb.appendChild(tr);
    }
  } else {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="3" class="muted">La vista previa no detalla colecciones.</td>';
    tb.appendChild(tr);
  }
  tbl.appendChild(tb);
  wrap.appendChild(tbl);

  const conflicts = preview?.conflicts || preview?.conflictos || [];
  const h = document.createElement('h3');
  h.className = 'pixel-sm';
  h.style.margin = '14px 0 6px';
  h.textContent = `Conflictos (${conflicts.length || 0})`;
  wrap.appendChild(h);
  if (conflicts.length) {
    const ul = document.createElement('ul');
    ul.style.margin = '0';
    ul.style.paddingLeft = '18px';
    for (const c of conflicts.slice(0, 50)) {
      const li = document.createElement('li');
      li.style.fontSize = '12px';
      li.textContent = typeof c === 'string' ? c : (c.message || c.reason || JSON.stringify(c));
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  } else {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Sin conflictos detectados.';
    wrap.appendChild(p);
  }
  return wrap;
}

function summaryEl(res) {
  const wrap = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = 'La importación se aplicó correctamente.';
  wrap.appendChild(p);
  const summary = res?.summary || res?.result || res;
  if (summary && typeof summary === 'object') {
    const ul = document.createElement('ul');
    ul.style.paddingLeft = '18px';
    for (const [k, v] of Object.entries(summary)) {
      if (typeof v === 'object') continue;
      const li = document.createElement('li');
      li.style.fontSize = '12px';
      li.textContent = `${k}: ${v}`;
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  }
  return wrap;
}

/**
 * Ejecuta el flujo completo sobre un File JSON ya elegido.
 * @param {object} opts
 * @param {object} opts.api
 * @param {File}   opts.file
 * @param {Function} [opts.onDone]
 */
export async function restoreBackupFlow({ api, file, onDone } = {}) {
  let json;
  try {
    const text = await readFileText(file);
    json = JSON.parse(text);
  } catch {
    toast.error('El archivo no es un JSON válido.');
    return;
  }

  let preview;
  try {
    preview = await api.post('/api/import/backup', json);
  } catch (e) {
    toast.error(`Vista previa fallida: ${e.message}`);
    return;
  }
  const pv = preview?.preview || preview;

  openModal({
    title: `Vista previa de importación — ${file.name}`,
    wide: true,
    body: previewEl(pv),
    actions: [
      { label: 'Cancelar', kind: 'ghost', onClick: () => {} },
      {
        label: 'Confirmar importación',
        kind: 'primary',
        onClick: async () => {
          let res;
          try {
            res = await api.post('/api/import/backup?confirm=1', json);
          } catch (e) {
            toast.error(`Importación fallida: ${e.message}`);
            return false;
          }
          toast.success('Respaldo importado');
          bus.emit('data:changed');
          onDone?.(res);
          showResult(api, res);
          return undefined; // cerrar preview
        },
      },
    ],
  });
}

function showResult(api, res) {
  const batchId = res?.batchId || res?.batch?.id || (typeof res?.batch === 'string' ? res.batch : null);
  const actions = [{ label: 'Cerrar', kind: 'ghost', onClick: () => {} }];
  if (batchId) {
    actions.unshift({
      label: 'Deshacer esta importación',
      kind: 'danger',
      onClick: async () => {
        try {
          await api.del(`/api/import/batches/${batchId}/undo`);
          toast.success('Importación deshecha');
          bus.emit('data:changed');
        } catch (e) {
          toast.error(`No se pudo deshacer: ${e.message}`);
          return false;
        }
      },
    });
  }
  openModal({ title: 'Resultado de la importación', body: summaryEl(res), actions });
}

/** Abre un selector de archivo .json y lanza el flujo. */
export function pickAndRestoreBackup({ api, onDone } = {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) restoreBackupFlow({ api, file: f, onDone });
  });
  input.click();
}

/** Descarga la plantilla de importación GET /api/import/schema como JSON. */
export async function downloadImportSchema(api) {
  const schema = await api.get('/api/import/schema');
  downloadJson(schema, 'plantilla-importacion.json');
}
