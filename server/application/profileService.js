/**
 * Servicio de perfil único del jugador.
 */
import { badRequest } from '../http/errors.js';

const PATCHABLE = ['displayName', 'level', 'power', 'avatarPath', 'notes', 'prefs', 'lastReviewedAt'];

export function createProfileService({ profileRepo }) {
  return {
    async get() { return profileRepo.ensure(); },

    async update(patch = {}) {
      const clean = {};
      for (const k of PATCHABLE) {
        if (patch[k] !== undefined) clean[k] = patch[k];
      }
      if (clean.level !== undefined && clean.level !== null && Number(clean.level) < 0) {
        throw badRequest('level no puede ser negativo');
      }
      if (clean.power !== undefined && clean.power !== null && Number(clean.power) < 0) {
        throw badRequest('power no puede ser negativo');
      }
      if (clean.prefs !== undefined && (
        typeof clean.prefs !== 'object' || clean.prefs === null || Array.isArray(clean.prefs)
      )) {
        throw badRequest('prefs debe ser un objeto');
      }
      if (clean.prefs !== undefined) {
        const current = profileRepo.ensure();
        clean.prefs = { ...(current.prefs || {}), ...clean.prefs };
      }
      return profileRepo.update(clean);
    },
  };
}
