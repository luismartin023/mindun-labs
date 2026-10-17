/**
 * Validadores de dominio. Devuelven { valid, errors, warnings }.
 * errors → datos inaceptables; warnings → datos dudosos pero corregibles.
 */
import {
  ITEM_CATEGORIES, RARITIES, ENCHANT_TYPES,
  ENCHANT_SLOTS_MAX, BUILD_ARTIFACT_SLOTS, slugify,
} from '../model.js';

const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isInt = (v) => Number.isInteger(v);
const result = (errors, warnings) => ({ valid: errors.length === 0, errors, warnings });

/**
 * Valida un CatalogItem (o fila unida con campos de inventario).
 * @param {object} data
 * @returns {{valid:boolean, errors:string[], warnings:string[]}}
 */
export function validateItem(data = {}) {
  const errors = [];
  const warnings = [];
  if (!isText(data.name)) errors.push('name: obligatorio (texto no vacío)');
  if (!ITEM_CATEGORIES.includes(data.category)) {
    errors.push(`category: debe ser una de ${ITEM_CATEGORIES.join(', ')}`);
  }
  if (data.rarity == null) warnings.push('rarity: ausente, se asumirá "unknown"');
  else if (!RARITIES.includes(data.rarity)) {
    errors.push(`rarity: debe ser una de ${RARITIES.join(', ')}`);
  }
  if (data.quantity != null && (!isInt(data.quantity) || data.quantity < 0)) {
    errors.push('quantity: debe ser un entero >= 0');
  }
  for (const f of ['powerLevel', 'itemLevel', 'power']) {
    if (data[f] != null && (!isInt(data[f]) || data[f] < 1 || data[f] > 300)) {
      warnings.push(`${f}: fuera de rango, se espera entero 1-300`);
    }
  }
  if (data.slug != null && isText(data.name) && data.slug !== slugify(data.name)) {
    warnings.push(`slug: se regeneraría como "${slugify(data.name)}"`);
  }
  const slots = data.enchantmentSlots;
  if (slots != null) {
    if (!Array.isArray(slots)) errors.push('enchantmentSlots: debe ser un array');
    else {
      if (slots.length > ENCHANT_SLOTS_MAX) {
        errors.push(`enchantmentSlots: máximo ${ENCHANT_SLOTS_MAX} ranuras`);
      }
      const seenIdx = new Set();
      for (const s of slots) {
        const idx = s?.slotIndex;
        if (!isInt(idx) || idx < 1 || idx > ENCHANT_SLOTS_MAX) {
          errors.push(`enchantmentSlots: slotIndex debe ser entero 1-${ENCHANT_SLOTS_MAX}`);
        } else if (seenIdx.has(idx)) {
          errors.push(`enchantmentSlots: slotIndex ${idx} duplicado`);
        } else seenIdx.add(idx);
        const opts = Array.isArray(s?.options) ? s.options : [];
        const seenEnch = new Set();
        for (const o of opts) {
          if (!isText(o?.enchantmentId)) {
            errors.push(`enchantmentSlots[${idx}]: opción sin enchantmentId`);
          } else if (seenEnch.has(o.enchantmentId)) {
            errors.push(`enchantmentSlots[${idx}]: enchantmentId duplicado "${o.enchantmentId}"`);
          } else seenEnch.add(o.enchantmentId);
        }
      }
    }
  }
  return result(errors, warnings);
}

/**
 * Valida una InventoryEntry (copia poseída).
 * @param {object} data
 */
export function validateInventoryEntry(data = {}) {
  const errors = [];
  const warnings = [];
  if (!isText(data.itemId)) errors.push('itemId: obligatorio');
  if (data.quantity != null && (!isInt(data.quantity) || data.quantity < 0)) {
    errors.push('quantity: debe ser un entero >= 0');
  }
  if (data.selectedEnchantIds != null) {
    if (!Array.isArray(data.selectedEnchantIds)) {
      errors.push('selectedEnchantIds: debe ser un array');
    } else if (data.selectedEnchantIds.length > ENCHANT_SLOTS_MAX) {
      errors.push(`selectedEnchantIds: máximo ${ENCHANT_SLOTS_MAX} encantamientos`);
    }
  }
  if (data.powerLevel != null && (!isInt(data.powerLevel) || data.powerLevel < 1 || data.powerLevel > 300)) {
    errors.push('powerLevel: debe ser entero 1-300');
  }
  return result(errors, warnings);
}

/**
 * Valida un BuildRecord (parcial o completo).
 * @param {object} data
 */
export function validateBuild(data = {}) {
  const errors = [];
  const warnings = [];
  if (!isText(data.name)) errors.push('name: obligatorio');
  for (const f of ['meleeItemId', 'rangedItemId', 'armorItemId']) {
    if (data[f] !== undefined && data[f] !== null && !isText(data[f])) {
      errors.push(`${f}: debe ser un id de ítem o null`);
    }
  }
  const arts = data.artifactItemIds;
  if (arts != null) {
    if (!Array.isArray(arts)) errors.push('artifactItemIds: debe ser un array');
    else {
      if (arts.length > BUILD_ARTIFACT_SLOTS) {
        errors.push(`artifactItemIds: máximo ${BUILD_ARTIFACT_SLOTS} artefactos`);
      }
      const filled = arts.filter((x) => x != null);
      if (new Set(filled).size !== filled.length) {
        errors.push('artifactItemIds: artefactos duplicados');
      }
    }
  }
  const ec = data.enchantChoices;
  if (ec != null) {
    if (typeof ec !== 'object' || Array.isArray(ec)) {
      errors.push('enchantChoices: debe ser un objeto itemId → array');
    } else {
      for (const [k, v] of Object.entries(ec)) {
        if (!Array.isArray(v)) errors.push(`enchantChoices["${k}"]: debe ser un array`);
        else if (v.length > ENCHANT_SLOTS_MAX) {
          errors.push(`enchantChoices["${k}"]: máximo ${ENCHANT_SLOTS_MAX} encantamientos`);
        }
      }
    }
  }
  const w = data.weights;
  if (w != null) {
    if (typeof w !== 'object' || Array.isArray(w)) {
      errors.push('weights: debe ser un objeto criterio → peso');
    } else {
      for (const [k, v] of Object.entries(w)) {
        if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 10) {
          errors.push(`weights["${k}"]: debe ser un número 0-10`);
        }
      }
    }
  }
  return result(errors, warnings);
}

/**
 * Valida un EnchantmentRecord.
 * @param {object} data
 */
export function validateEnchantment(data = {}) {
  const errors = [];
  const warnings = [];
  if (!isText(data.name)) errors.push('name: obligatorio');
  if (!ENCHANT_TYPES.includes(data.enchantType)) {
    errors.push(`enchantType: debe ser uno de ${ENCHANT_TYPES.join(', ')}`);
  }
  const tiers = data.tiers;
  if (tiers != null) {
    if (!Array.isArray(tiers)) errors.push('tiers: debe ser un array');
    else {
      for (const t of tiers) {
        if (!t || !isInt(t.tier) || t.tier < 1 || t.tier > 3) {
          errors.push('tiers[].tier: debe ser entero 1-3');
        }
        if (!isText(t?.text)) errors.push('tiers[].text: texto requerido');
      }
    }
  }
  return result(errors, warnings);
}

/**
 * Valida un TierListRecord: rows no vacías con keys únicas y
 * entries que referencian rowKeys existentes.
 * @param {object} data
 */
export function validateTierList(data = {}) {
  const errors = [];
  const warnings = [];
  if (!isText(data.name)) errors.push('name: obligatorio');
  const rows = data.rows;
  const rowKeys = new Set();
  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push('rows: se requiere un array no vacío de filas');
  } else {
    for (const r of rows) {
      if (!isText(r?.key)) { errors.push('rows[].key: requerido'); continue; }
      if (rowKeys.has(r.key)) errors.push(`rows: clave duplicada "${r.key}"`);
      else rowKeys.add(r.key);
      if (!isText(r?.label)) errors.push(`rows["${r.key}"].label: requerido`);
      if (!isText(r?.color)) errors.push(`rows["${r.key}"].color: requerido`);
    }
  }
  const entries = data.entries;
  if (entries != null) {
    if (!Array.isArray(entries)) errors.push('entries: debe ser un array');
    else {
      for (const e of entries) {
        if (!isText(e?.itemId)) errors.push('entries[].itemId: requerido');
        if (!isText(e?.rowKey) || !rowKeys.has(e.rowKey)) {
          errors.push(`entries[].rowKey: fila desconocida "${e?.rowKey}"`);
        }
      }
    }
  }
  return result(errors, warnings);
}
