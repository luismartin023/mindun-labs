/**
 * Servicio de inventario: copias poseídas con validación de dominio y
 * normalización de slots de encantamiento.
 */
import { badRequest, notFound } from '../http/errors.js';
import { ENCHANT_SLOTS_MAX } from '../domain/model.js';
import { compatibleEnchants } from '../domain/enchantments/slots.js';
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

function assertCompatibleEnchant(enchantmentId, item, enchantmentRepo, label) {
  const enchantment = enchantmentRepo.getById(enchantmentId);
  if (!enchantment) throw badRequest(`${label}: encantamiento inexistente`);
  if (!compatibleEnchants(item, [enchantment]).length) {
    throw badRequest(`${label}: encantamiento incompatible con ${item?.category || 'esta categoría'}`);
  }
  return enchantment;
}

function assertEnchantmentSelection(entry, item, enchantmentRepo) {
  const selected = Array.isArray(entry.selectedEnchantIds) ? entry.selectedEnchantIds : [];
  if (entry.enchantTiers != null && !Array.isArray(entry.enchantTiers)) {
    throw badRequest('enchantTiers debe ser un array.');
  }
  const selectedIds = new Set();
  const declaredSlots = Array.isArray(item?.enchantmentSlots) ? item.enchantmentSlots : [];
  selected.forEach((enchantmentId, index) => {
    if (!enchantmentId) return;
    const enchantment = assertCompatibleEnchant(
      enchantmentId, item, enchantmentRepo, `Espacio ${index + 1}`,
    );
    if (selectedIds.has(enchantmentId) && enchantment.multiplePerEquipment !== true) {
      throw badRequest('No puedes repetir este encantamiento en otra ranura.');
    }
    selectedIds.add(enchantmentId);
    if (declaredSlots.length) {
      const slot = declaredSlots.find((candidate) => candidate.slotIndex === index + 1);
      const options = slot?.options || [];
      if (!slot || !options.some((option) => option.enchantmentId === enchantmentId)) {
        throw badRequest(`El encantamiento no está disponible en el espacio ${index + 1}.`);
      }
    }
  });

  for (const tier of entry.enchantTiers || []) {
    if (!selectedIds.has(tier.enchantmentId)) {
      throw badRequest('Solo puedes elegir el nivel de un encantamiento seleccionado.');
    }
    const enchantment = enchantmentRepo.getById(tier.enchantmentId);
    const maximum = Math.max(1, Math.min(4, enchantment?.tiers?.length || 1));
    if (tier.tier > maximum) throw badRequest(`El nivel supera el máximo de ${enchantment.name}.`);
  }

  if (entry.gildedEnchantmentId) {
    assertCompatibleEnchant(entry.gildedEnchantmentId, item, enchantmentRepo, 'Encantamiento dorado');
  }
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
      if (data.quantity !== undefined && (!Number.isInteger(Number(data.quantity)) || Number(data.quantity) < 1)) {
        throw badRequest('quantity debe ser un entero de al menos 1');
      }
      const selected = await normalizeSelected(data.selectedEnchantIds);
      const entry = {
        ...data,
        itemId: item.id,
        quantity: data.quantity ?? 1,
        selectedEnchantIds: selected ?? [null, null, null],
        isFavorite: !!data.isFavorite,
        isGilded: !!data.isGilded,
        gildedEnchantmentId: data.isGilded ? (data.gildedEnchantmentId || null) : null,
      };
      assertEnchantmentSelection(entry, item, enchantmentRepo);
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
        if (!Number.isInteger(q) || q < 1) throw badRequest('quantity debe ser un entero de al menos 1');
        clean.quantity = Math.floor(q);
      }
      if (clean.selectedEnchantIds !== undefined) {
        clean.selectedEnchantIds = await normalizeSelected(clean.selectedEnchantIds);
        const tiers = Array.isArray(clean.enchantTiers) ? clean.enchantTiers : existing.enchantTiers;
        if (Array.isArray(tiers)) {
          clean.enchantTiers = tiers.filter((tier) =>
            clean.selectedEnchantIds.includes(tier.enchantmentId));
        }
      }
      if (clean.isGilded === false) clean.gildedEnchantmentId = null;
      const merged = { ...existing, ...clean };
      if (
        clean.selectedEnchantIds !== undefined
        || clean.enchantTiers !== undefined
        || clean.gildedEnchantmentId !== undefined
        || clean.isGilded !== undefined
      ) assertEnchantmentSelection(merged, itemRepo.getById(existing.itemId), enchantmentRepo);
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

    /** Ajuste de cantidad por delta (+n / -n); una copia siempre conserva al menos 1 unidad. */
    async adjustQuantity(id, delta) {
      const existing = inventoryRepo.getById(id);
      if (!existing) throw notFound(`Copia no encontrada: ${id}`);
      const q = existing.quantity + Number(delta);
      if (!Number.isInteger(q) || q < 1) throw badRequest('La cantidad resultante debe ser de al menos 1');
      return inventoryRepo.update(id, { quantity: q });
    },

    async remove(id) {
      if (!inventoryRepo.remove(id)) throw notFound(`Copia no encontrada: ${id}`);
      return { deleted: true, id };
    },
  };
}
