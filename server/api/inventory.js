/**
 * /api/inventory — copias poseídas (filas planas entry+item).
 */
import { Router } from 'express';
import { asyncH, listQuery, paged } from '../http/helpers.js';
import { config } from '../config.js';

export function createInventoryRouter(inventoryService) {
  const r = Router();

  r.get('/', asyncH(async (req, res) => {
    const q = listQuery(req.query, config);
    const result = await inventoryService.list(q);
    res.json(paged(result, q));
  }));

  r.post('/', asyncH(async (req, res) => {
    const entry = await inventoryService.add(req.body ?? {});
    res.status(201).json(entry);
  }));

  r.get('/:id', asyncH(async (req, res) => {
    res.json(await inventoryService.get(req.params.id));
  }));

  r.patch('/:id', asyncH(async (req, res) => {
    res.json(await inventoryService.update(req.params.id, req.body ?? {}));
  }));

  r.post('/:id/duplicate', asyncH(async (req, res) => {
    res.status(201).json(await inventoryService.duplicate(req.params.id));
  }));

  r.delete('/:id', asyncH(async (req, res) => {
    res.json(await inventoryService.remove(req.params.id));
  }));

  return r;
}
