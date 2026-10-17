/**
 * /api/export/:type[/:id]?format=pdf|txt|xlsx|json — descarga de archivos.
 * type: inventory, catalog, item/:id, enchantments, build/:id, builds,
 *       tierlist/:id, comparison/:id, profile, backup
 */
import { Router } from 'express';
import { asyncH } from '../http/helpers.js';

export function createExportRouter(exportService) {
  const r = Router();

  const handler = asyncH(async (req, res) => {
    const { type, id } = req.params;
    const format = req.query.format || (type === 'backup' ? 'json' : 'txt');
    const { buffer, fileName, mime } = await exportService.exportFile(
      type, id, format, req.query,
    );
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  });

  r.get('/history', asyncH(async (req, res) => {
    res.json({ data: exportService.history(100) });
  }));
  r.get('/:type/:id', handler);
  r.get('/:type', handler);

  return r;
}
