/**
 * Servicio de inventario: copias poseídas con validación de dominio y
 * normalización de slots de encantamiento.
 */
import { badRequest, notFound } from '../http/errors.js';
import { ENCHANT_SLOTS_MAX } from '../domain/model.js';
import { domain } from './domainBridge.js';

/** Normaliza selectedEnchantIds usando el dominio si está disponible. */
async function normalizeSelected(ids) {
  const mod = await domain('enchantments/slots.js');
  if (mod?.normalizeSelected) return mod.normalizeSelected(ids);
  // Módulo aún no entregado: contrato mínimo del modelo (array de 3 slots).
  if (ids === undefined) return undefined;
  const arr = Array.isArray(ids) ? ids.slice(0, ENCHANT_SLOTS_MAX) : [];
  while (arr.length < ENCHANT_SLOTS_MAX) arr.push(null);
  return arr.map((v) => (typeof v === 'string' ? v : null));
}

async function validate(data) {
  const mod = await domain('catalog/validators.js');
  if (!mod?.validateInventoryEntry) return { skipped: true };
  const res = mod.validateInventoryEntry(data);
  if (res && res.valid === false) {
    throw badRequest('La copia no supera la validación', {
      valid: false, errors: res.errors ?? [], warnings: res.warnings ?? [],
    });
  }
  return res;
}

export function createInventoryService({ inventoryRepo, itemRepo, enchantmentRepo }) {
  const PATCHABLE = [
    'quantity', 'powerLevel', 'itemLevel', 'isFavorite', 'isGilded',
    'gildedEnchantmentId', 'selectedEnchantIds', 'enchantTiers', 'notes', 'source',
  ];

  return {
    async list(query) { return inventoryRepo.listJoined(query); },

    async get(id) {
      const entry = inventoryRepo.getById(id);
      if (!entry) throw notFound(`Copia no encontrada: ${id}`);
      const item = itemRepo.getById(entry.itemId);
      return { ...entry, item };
    },

    /** Añadir copia al inventario. */
    async add(data) {
      if (!data?.itemId) throw badRequest('itemId es obligatorio');
      const item = itemRepo.getById(data.itemId) ?? itemRepo.getBySlug(data.itemId);
      if (!item) throw badRequest(`El ítem no existe en catálogo: ${data.itemId}`);
      if (data.quantity !== undefined && Number(data.quantity) < 0) {
        throw badRequest('quantity no puede ser negativa');
      }
      const selected = await normalizeSelected(data.selectedEnchantIds);
      const entry = {
        ...data,
        itemId: item.id,
        quantity: data.quantity ?? 1,
        selectedEnchantIds: selected ?? [null, null, null],
        isFavorite: !!data.isFavorite,
        isGilded: !!data.isGilded,
      };
      if (entry.gildedEnchantmentId && !enchantmentRepo.getById(entry.gildedEnchantmentId)) {
        throw badRequest(`Encantamiento dorado inexistente: ${entry.gildedEnchantmentId}`);
      }
      await validate(entry);
      return inventoryRepo.create(entry);
    },

    /** Edición parcial: solo campos PATCHABLE, con clamps de negocio. */
    async update(id, patch) {
      const existing = inventoryRepo.getById(id);
      if (!existing) throw notFound(`Copia no encontrada: ${id}`);
      const clean = {};
      for (const k of PATCHABLE) {
        if (patch[k] !== undefined) clean[k] = patch[k];
      }
      if (clean.quantity !== undefined) {
        const q = Number(clean.quantity);
        if (!Number.isFinite(q) || q < 0) throw badRequest('quantity no puede ser negativa');
        clean.quantity = Math.floor(q);
      }
      if (clean.selectedEnchantIds !== undefined) {
        clean.selectedEnchantIds = await normalizeSelected(clean.selectedEnchantIds);
      }
      if (clean.gildedEnchantmentId && !enchantmentRepo.getById(clean.gildedEnchantmentId)) {
        throw badRequest(`Encantamiento dorado inexistente: ${clean.gildedEnchantmentId}`);
      }
      const merged = { ...existing, ...clean };
      await validate(merged);
      return inventoryRepo.update(id, clean);
    },

    /** Duplicar copia (nuevo id, mismos datos). */
    async duplicate(id) {
      const src = inventoryRepo.getById(id);
      if (!src) throw notFound(`Copia no encontrada: ${id}`);
      const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = src;
      return inventoryRepo.create(rest);
    },

    /** Ajuste de cantidad por delta (+n / -n); nunca baja de 0. */
    async adjustQuantity(id, delta) {
      const existing = inventoryRepo.getById(id);
      if (!existing) throw notFound(`Copia no encontrada: ${id}`);
      const q = existing.quantity + Number(delta);
      if (!Number.isFinite(q) || q < 0) throw badRequest('La cantidad resultante sería negativa');
      return inventoryRepo.update(id, { quantity: q });
    },

    async remove(id) {
      if (!inventoryRepo.remove(id)) throw notFound(`Copia no encontrada: ${id}`);
      return { deleted: true, id };
    },
  };
}
