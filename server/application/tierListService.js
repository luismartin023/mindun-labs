/**
 * Servicio de tier lists: CRUD + validación de dominio.
 * Las operaciones de mover/ubicar entradas las resuelve el frontend con
 * domain/tierlists/logic.js; aquí se persiste el estado resultante.
 */
import { badRequest, notFound } from '../http/errors.js';
import { domain } from './domainBridge.js';

async function validate(data) {
  const mod = await domain('catalog/validators.js');
  if (!mod?.validateTierList) return { skipped: true };
  const res = mod.validateTierList(data);
  if (res && res.valid === false) {
    throw badRequest('La tier list no supera la validación', {
      valid: false, errors: res.errors ?? [], warnings: res.warnings ?? [],
    });
  }
  return res;
}

export function createTierListService({ tierListRepo }) {
  return {
    async list(query) { return tierListRepo.list(query); },

    async get(id) {
      const t = tierListRepo.getById(id);
      if (!t) throw notFound(`Tier list no encontrada: ${id}`);
      return t;
    },

    async create(data) {
      if (!data?.name || !String(data.name).trim()) throw badRequest('name es obligatorio');
      // Filas por defecto del dominio si está disponible; si no, las del body.
      let rows = data.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        const mod = await domain('tierlists/logic.js');
        if (mod?.defaultRows) rows = mod.defaultRows(data.category);
      }
      const list = {
        ...data,
        name: String(data.name).trim(),
        category: data.category ?? 'mixed',
        rows: rows ?? [],
        entries: data.entries ?? [],
      };
      await validate(list);
      return tierListRepo.create(list);
    },

    async update(id, patch) {
      const existing = tierListRepo.getById(id);
      if (!existing) throw notFound(`Tier list no encontrada: ${id}`);
      const merged = { ...existing, ...patch };
      await validate(merged);
      return tierListRepo.update(id, patch);
    },

    async remove(id) {
      if (!tierListRepo.remove(id)) throw notFound(`Tier list no encontrada: ${id}`);
      return { deleted: true, id };
    },
  };
}
