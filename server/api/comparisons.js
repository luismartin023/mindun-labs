/**
 * /api/comparisons — comparaciones guardadas (kind: items|builds).
 */
import { Router } from 'express';
import { asyncH, listQuery, paged } from '../http/helpers.js';
import { badRequest, notFound } from '../http/errors.js';
import { config } from '../config.js';

export function createComparisonsRouter(comparisonRepo) {
  const r = Router();

  r.get('/', asyncH(async (req, res) => {
    const q = listQuery(req.query, config);
    const result = comparisonRepo.list(q);
    res.json(paged(result, q));
  }));

  r.post('/', asyncH(async (req, res) => {
    const body = req.body ?? {};
    const kind = body.kind ?? 'items';
    if (!['items', 'builds'].includes(kind)) {
      throw badRequest("kind debe ser 'items' o 'builds'");
    }
    if (!Array.isArray(body.refIds)) throw badRequest('refIds debe ser un array de ids');
    res.status(201).json(comparisonRepo.create({ ...body, kind }));
  }));

  r.get('/:id', asyncH(async (req, res) => {
    const c = comparisonRepo.getById(req.params.id);
    if (!c) throw notFound(`Comparación no encontrada: ${req.params.id}`);
    res.json(c);
  }));

  r.delete('/:id', asyncH(async (req, res) => {
    if (!comparisonRepo.remove(req.params.id)) {
      throw notFound(`Comparación no encontrada: ${req.params.id}`);
    }
    res.json({ deleted: true, id: req.params.id });
  }));

  return r;
}
