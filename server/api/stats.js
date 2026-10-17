/**
 * /api/stats/summary — contadores agregados del laboratorio.
 */
import { Router } from 'express';
import { asyncH } from '../http/helpers.js';

export function createStatsRouter(statsService) {
  const r = Router();
  r.get('/summary', asyncH(async (req, res) => {
    res.json(await statsService.summary());
  }));
  return r;
}
