/**
 * Servicio de encantamientos: CRUD + validación de dominio.
 */
import { badRequest, notFound } from '../http/errors.js';
import { slugify } from '../domain/model.js';
import { domain } from './domainBridge.js';

async function validate(data) {
  const mod = await domain('catalog/validators.js');
  if (!mod?.validateEnchantment) return { skipped: true };
  const res = mod.validateEnchantment(data);
  if (res && res.valid === false) {
    throw badRequest('El encantamiento no supera la validación', {
      valid: false, errors: res.errors ?? [], warnings: res.warnings ?? [],
    });
  }
  return res;
}

export function createEnchantmentService({ enchantmentRepo }) {
  return {
    async list(query) { return enchantmentRepo.list(query); },

    async get(id) {
      const e = enchantmentRepo.getById(id) ?? enchantmentRepo.getBySlug(id);
      if (!e) throw notFound(`Encantamiento no encontrado: ${id}`);
      return e;
    },

    async create(data) {
      if (!data?.name || !String(data.name).trim()) throw badRequest('name es obligatorio');
      await validate(data);
      let slug = data.slug || slugify(data.name);
      let n = 2;
      while (enchantmentRepo.getBySlug(slug)) slug = `${slugify(data.name)}-${n++}`;
      return enchantmentRepo.create({
        ...data,
        slug,
        dataStatus: data.dataStatus || 'user_entered',
        source: data.source || 'user',
      });
    },

    async update(id, patch) {
      const existing = enchantmentRepo.getById(id);
      if (!existing) throw notFound(`Encantamiento no encontrado: ${id}`);
      await validate({ ...existing, ...patch });
      if (patch.slug && patch.slug !== existing.slug && enchantmentRepo.getBySlug(patch.slug)) {
        throw badRequest(`El slug ya está en uso: ${patch.slug}`);
      }
      return enchantmentRepo.update(id, patch);
    },

    async remove(id) {
      if (!enchantmentRepo.remove(id)) throw notFound(`Encantamiento no encontrado: ${id}`);
      return { deleted: true, id };
    },
  };
}
