/**
 * /api/enchantments — catálogo de encantamientos.
 */
import { Router } from 'express';
import { asyncH, listQuery, paged } from '../http/helpers.js';
import { config } from '../config.js';

export function createEnchantmentsRouter(enchantmentService) {
  const r = Router();

  r.get('/', asyncH(async (req, res) => {
    const q = listQuery(req.query, config);
    const result = await enchantmentService.list(q);
    res.json(paged(result, q));
  }));

  r.post('/', asyncH(async (req, res) => {
    res.status(201).json(await enchantmentService.create(req.body ?? {}));
  }));

  r.get('/:id', asyncH(async (req, res) => {
    res.json(await enchantmentService.get(req.params.id));
  }));

  r.patch('/:id', asyncH(async (req, res) => {
    res.json(await enchantmentService.update(req.params.id, req.body ?? {}));
  }));

  r.delete('/:id', asyncH(async (req, res) => {
    res.json(await enchantmentService.remove(req.params.id));
  }));

  return r;
}
