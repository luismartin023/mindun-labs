/**
 * /api/items — catálogo (listar/crear/detalle con entries[]/editar/borrar).
 */
import { Router } from 'express';
import { asyncH, listQuery, paged } from '../http/helpers.js';
import { config } from '../config.js';

export function createItemsRouter(itemService) {
  const r = Router();

  r.get('/', asyncH(async (req, res) => {
    const q = listQuery(req.query, config);
    const result = await itemService.list(q);
    res.json(paged(result, q));
  }));

  r.post('/', asyncH(async (req, res) => {
    const item = await itemService.create(req.body ?? {});
    res.status(201).json(item);
  }));

  r.get('/:id', asyncH(async (req, res) => {
    res.json(await itemService.get(req.params.id));
  }));

  r.patch('/:id', asyncH(async (req, res) => {
    res.json(await itemService.update(req.params.id, req.body ?? {}));
  }));

  r.delete('/:id', asyncH(async (req, res) => {
    res.json(await itemService.remove(req.params.id));
  }));

  return r;
}
