/**
 * Dispatcher de exportadores: dataset de dominio → {buffer, fileName, mime}.
 */
import { badRequest } from '../../http/errors.js';
import { renderTxt } from './txtExporter.js';
import { renderXlsx } from './xlsxExporter.js';
import { renderPdf } from './pdfExporter.js';
import { buildBackup } from './backupExporter.js';
import { nowIso } from '../../domain/model.js';

const MIMES = {
  txt: 'text/plain; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
  json: 'application/json; charset=utf-8',
};

const stamp = () => nowIso().replace(/[:T]/g, '-').slice(0, 16);

/**
 * @param {string} type   inventory|catalog|item|enchantments|build|builds|
 *                        tierlist|comparison|profile|backup
 * @param {string} format txt|xlsx|pdf|json
 * @param {object} dataset datos resueltos por exportService
 * @param {object} [opts] {name} hint para el nombre de archivo
 */
export async function exportFile(type, format, dataset = {}, opts = {}) {
  const fmt = format || (type === 'backup' ? 'json' : 'txt');
  if (!MIMES[fmt]) throw badRequest(`Formato no soportado: ${fmt} (pdf|txt|xlsx|json)`);
  if (type === 'backup' && fmt !== 'json' && fmt !== 'xlsx' && fmt !== 'txt') {
    throw badRequest('backup admite formatos json, xlsx y txt');
  }

  let buffer;
  if (fmt === 'json') {
    const doc = type === 'backup' ? buildBackup(dataset.tables ?? {}) : dataset;
    buffer = Buffer.from(JSON.stringify(doc, null, 2), 'utf8');
  } else if (fmt === 'txt') {
    buffer = Buffer.from(renderTxt(type, dataset), 'utf8');
  } else if (fmt === 'xlsx') {
    buffer = await renderXlsx(type, dataset);
  } else {
    buffer = renderPdf(type, dataset);
  }

  const base = opts.name ? `${type}-${opts.name}` : type;
  const fileName = `mindun-${base}-${stamp()}.${fmt}`;
  return { buffer, fileName, mime: MIMES[fmt] };
}
