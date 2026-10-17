/**
 * /api/table-views — vistas de tabla guardadas.
 */
import { Router } from 'express';
import { asyncH, listQuery, paged } from '../http/helpers.js';
import { badRequest, notFound } from '../http/errors.js';
import { config } from '../config.js';

export function createTableViewsRouter(tableViewRepo) {
  const r = Router();

  r.get('/', asyncH(async (req, res) => {
    const q = listQuery(req.query, config);
    const result = tableViewRepo.list(q);
    res.json(paged(result, q));
  }));

  r.post('/', asyncH(async (req, res) => {
    const body = req.body ?? {};
    if (!body.name || !String(body.name).trim()) throw badRequest('name es obligatorio');
    if (!body.dataset) throw badRequest('dataset es obligatorio');
    res.status(201).json(tableViewRepo.create(body));
  }));

  r.patch('/:id', asyncH(async (req, res) => {
    const updated = tableViewRepo.update(req.params.id, req.body ?? {});
    if (!updated) throw notFound(`Vista no encontrada: ${req.params.id}`);
    res.json(updated);
  }));

  r.delete('/:id', asyncH(async (req, res) => {
    if (!tableViewRepo.remove(req.params.id)) {
      throw notFound(`Vista no encontrada: ${req.params.id}`);
    }
    res.json({ deleted: true, id: req.params.id });
  }));

  return r;
}
