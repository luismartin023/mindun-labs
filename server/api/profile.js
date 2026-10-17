/**
 * /api/profile — perfil único del jugador.
 */
import { Router } from 'express';
import { asyncH } from '../http/helpers.js';

export function createProfileRouter(profileService) {
  const r = Router();
  r.get('/', asyncH(async (req, res) => {
    res.json(await profileService.get());
  }));
  r.patch('/', asyncH(async (req, res) => {
    res.json(await profileService.update(req.body ?? {}));
  }));
  return r;
}
