/**
 * Servicio de catálogo de ítems: CRUD + validación de dominio + slugs únicos.
 */
import { badRequest, notFound } from '../http/errors.js';
import { slugify } from '../domain/model.js';
import { domain } from './domainBridge.js';

async function validate(data) {
  const mod = await domain('catalog/validators.js');
  if (!mod?.validateItem) return { skipped: true };
  const res = mod.validateItem(data);
  if (res && res.valid === false) {
    throw badRequest('El ítem no supera la validación', {
      valid: false, errors: res.errors ?? [], warnings: res.warnings ?? [],
    });
  }
  return res;
}

export function createItemService({ itemRepo, inventoryRepo }) {
  return {
    async list(query) {
      return itemRepo.list(query); // {rows,total} → la ruta empaqueta
    },

    /** Detalle de ítem + sus copias en inventario (entries[]). */
    async get(id) {
      const item = itemRepo.getById(id) ?? itemRepo.getBySlug(id);
      if (!item) throw notFound(`Ítem no encontrado: ${id}`);
      const entries = inventoryRepo.listByItem(item.id);
      return { ...item, entries };
    },

    async create(data) {
      if (!data?.name || typeof data.name !== 'string' || !data.name.trim()) {
        throw badRequest('name es obligatorio');
      }
      if (!data.category) throw badRequest('category es obligatoria');
      await validate(data);
      let slug = data.slug || slugify(data.name);
      let n = 2;
      while (itemRepo.getBySlug(slug)) slug = `${slugify(data.name)}-${n++}`;
      return itemRepo.create({
        ...data,
        slug,
        dataStatus: data.dataStatus || 'user_entered',
        source: data.source || 'user',
      });
    },

    async update(id, patch) {
      const existing = itemRepo.getById(id);
      if (!existing) throw notFound(`Ítem no encontrado: ${id}`);
      const merged = { ...existing, ...patch };
      await validate(merged);
      if (patch.slug && patch.slug !== existing.slug && itemRepo.getBySlug(patch.slug)) {
        throw badRequest(`El slug ya está en uso: ${patch.slug}`);
      }
      return itemRepo.update(id, patch);
    },

    async remove(id) {
      if (!itemRepo.remove(id)) throw notFound(`Ítem no encontrado: ${id}`);
      return { deleted: true, id };
    },
  };
}
