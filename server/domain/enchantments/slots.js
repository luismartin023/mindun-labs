/**
 * Ranuras de encantamiento: compatibilidad por tipo de ítem y
 * normalización de selecciones [slot1, slot2, slot3].
 */
import { ENCHANT_SLOTS_MAX } from '../model.js';

const CATEGORY_TO_ENCHANT = {
  melee_weapon: 'melee',
  ranged_weapon: 'ranged',
  armor: 'armor',
};

/** Tipo de encantamiento de un registro (acepta camelCase o snake_case). */
export const enchantTypeOf = (e) => e?.enchantType ?? e?.enchant_type ?? 'unknown';

/**
 * Tipo de encantamiento que acepta una categoría de ítem.
 * @param {string} category
 * @returns {'melee'|'ranged'|'armor'|null} null si la categoría no encanta (artifact, enchantment…)
 */
export function enchantTypeForCategory(category) {
  return CATEGORY_TO_ENCHANT[category] ?? null;
}

/**
 * Encantamientos utilizables por un ítem: los de su tipo más los 'universal'.
 * @param {object} item CatalogItem
 * @param {object[]} enchants EnchantmentRecord[]
 * @returns {object[]}
 */
export function compatibleEnchants(item, enchants = []) {
  const type = enchantTypeForCategory(item?.category);
  if (!type) return [];
  return (enchants ?? []).filter((e) => {
    const t = enchantTypeOf(e);
    return t === type || t === 'universal';
  });
}

/**
 * Normaliza una selección de encantamientos a exactamente ENCHANT_SLOTS_MAX
 * posiciones (rellena con null, trunca el exceso).
 * @param {(string|null)[]|*} ids
 * @returns {(string|null)[]}
 */
export function normalizeSelected(ids) {
  const arr = Array.isArray(ids) ? ids.slice(0, ENCHANT_SLOTS_MAX) : [];
  while (arr.length < ENCHANT_SLOTS_MAX) arr.push(null);
  return arr;
}

/**
 * Opciones por ranura para un ítem.
 * - Categoría sin ranuras (artefactos…) → [].
 * - Si el ítem declara enchantmentSlots → se respetan (ordenados por slotIndex).
 * - Si no → 3 ranuras por defecto, cada una con todos los compatibles.
 * @param {object} item
 * @param {object[]} enchants
 * @returns {{slotIndex:number, options:{enchantmentId:string, name?:string}[]}[]}
 */
export function slotOptions(item, enchants = []) {
  if (!enchantTypeForCategory(item?.category)) return [];
  const declared = item?.enchantmentSlots ?? item?.enchantment_slots;
  if (Array.isArray(declared) && declared.length) {
    return declared
      .map((s) => ({ ...s, options: (s?.options ?? []).map((o) => ({ ...o })) }))
      .sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
  }
  const options = compatibleEnchants(item, enchants)
    .map((e) => ({ enchantmentId: e.id, name: e.name }));
  return Array.from({ length: ENCHANT_SLOTS_MAX }, (_, i) => ({
    slotIndex: i + 1,
    options: options.map((o) => ({ ...o })),
  }));
}
