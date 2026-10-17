/**
 * /api/tierlists — CRUD de tier lists.
 */
import { Router } from 'express';
import { asyncH, listQuery, paged } from '../http/helpers.js';
import { config } from '../config.js';

export function createTierListsRouter(tierListService) {
  const r = Router();

  r.get('/', asyncH(async (req, res) => {
    const q = listQuery(req.query, config);
    const result = await tierListService.list(q);
    res.json(paged(result, q));
  }));

  r.post('/', asyncH(async (req, res) => {
    res.status(201).json(await tierListService.create(req.body ?? {}));
  }));

  r.get('/:id', asyncH(async (req, res) => {
    res.json(await tierListService.get(req.params.id));
  }));

  r.patch('/:id', asyncH(async (req, res) => {
    res.json(await tierListService.update(req.params.id, req.body ?? {}));
  }));

  r.delete('/:id', asyncH(async (req, res) => {
    res.json(await tierListService.remove(req.params.id));
  }));

  return r;
}
