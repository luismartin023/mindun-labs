/**
 * /api/import — backup JSON y catálogo con vista previa + confirmación.
 */
import { Router } from 'express';
import { asyncH, parseBool } from '../http/helpers.js';

export function createImportRouter(importService) {
  const r = Router();

  r.get('/schema', asyncH(async (req, res) => {
    res.json(importService.schema());
  }));

  r.get('/batches', asyncH(async (req, res) => {
    res.json({ data: importService.batches() });
  }));

  r.post('/backup', asyncH(async (req, res) => {
    const confirm = parseBool(req.query.confirm) === true;
    const out = await importService.importBackup(req.body, { confirm });
    res.status(confirm ? 201 : 200).json(out);
  }));

  r.post('/catalog', asyncH(async (req, res) => {
    const confirm = parseBool(req.query.confirm) === true;
    const out = await importService.importCatalog(req.body, { confirm });
    res.status(confirm ? 201 : 200).json(out);
  }));

  r.delete('/batches/:id/undo', asyncH(async (req, res) => {
    res.json(await importService.undoBatch(req.params.id));
  }));

  return r;
}
