/**
 * Filtros y ordenación sobre filas unidas catálogo+inventario.
 * Puros: nunca mutan `rows`. Una fila = campos de CatalogItem más
 * opcionales de entrada: owned, entryId, quantity, powerLevel,
 * isFavorite, entryRarity, selectedEnchantIds.
 */

const stripAccents = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => stripAccents(s).toLowerCase();

/** Jerarquía de rareza usada al ordenar: unique > gilded > special > rare > common > unknown. */
const RARITY_RANK = { unique: 0, gilded: 1, special: 2, rare: 3, common: 4, unknown: 5 };

function searchableText(row) {
  const parts = [
    row.name,
    row.localizedName,
    row.internalId,
    row.groupOf,
    row.description,
    ...(Array.isArray(row.aliases) ? row.aliases : []),
    ...(Array.isArray(row.passiveEffects) ? row.passiveEffects : []),
  ];
  return norm(parts.filter((p) => p != null && p !== '').join('\n'));
}

const matchesEnchantment = (row, enchantmentId) => {
  const declared = Array.isArray(row.enchantmentSlots) ? row.enchantmentSlots : [];
  const inOptions = declared.some((s) =>
    (s?.options ?? []).some((o) => o?.enchantmentId === enchantmentId));
  const inSelection = Array.isArray(row.selectedEnchantIds) &&
    row.selectedEnchantIds.includes(enchantmentId);
  return inOptions || inSelection;
};

/**
 * Filtra filas según criterios (todos opcionales, se combinan con AND).
 * @param {object[]} rows
 * @param {object} [criteria]
 * @param {string} [criteria.search] Texto libre (sin distinción de acentos/mayúsculas).
 * @param {string} [criteria.category]
 * @param {string} [criteria.rarity] Se compara con entryRarity si la fila la trae.
 * @param {boolean} [criteria.owned]
 * @param {boolean} [criteria.favorite]
 * @param {string[]} [criteria.tags] La fila debe tener TODAS las etiquetas.
 * @param {number} [criteria.minPower]
 * @param {number} [criteria.maxPower]
 * @param {string} [criteria.enchantmentId] Compatible o seleccionado.
 * @param {string} [criteria.dataStatus]
 * @param {string[]} [criteria.ids] Restringe a estos ids de ítem.
 * @returns {object[]} nuevo array filtrado
 */
export function filterItems(rows, criteria = {}) {
  if (!Array.isArray(rows)) return [];
  const {
    search, category, rarity, owned, favorite, tags,
    minPower, maxPower, enchantmentId, dataStatus, ids,
  } = criteria ?? {};
  const q = search ? norm(search) : null;
  const wantTags = Array.isArray(tags) && tags.length ? tags.map(norm) : null;
  const idSet = Array.isArray(ids) ? new Set(ids) : null;
  const powerFilter = minPower != null || maxPower != null;

  return rows.filter((row) => {
    if (!row) return false;
    if (idSet && !idSet.has(row.id ?? row.itemId)) return false;
    if (category && row.category !== category) return false;
    if (rarity && (row.entryRarity ?? row.rarity) !== rarity) return false;
    if (dataStatus && row.dataStatus !== dataStatus) return false;
    if (owned != null && Boolean(row.owned) !== Boolean(owned)) return false;
    if (favorite != null && Boolean(row.isFavorite) !== Boolean(favorite)) return false;
    if (powerFilter) {
      const p = row.powerLevel ?? row.itemLevel ?? row.power;
      if (p == null) return false;
      if (minPower != null && p < minPower) return false;
      if (maxPower != null && p > maxPower) return false;
    }
    if (wantTags) {
      const rowTags = (row.tags ?? []).map(norm);
      if (!wantTags.every((t) => rowTags.includes(t))) return false;
    }
    if (enchantmentId && !matchesEnchantment(row, enchantmentId)) return false;
    if (q && !searchableText(row).includes(q)) return false;
    return true;
  });
}

const SORT_KEYS = {
  name: (r) => r.localizedName ?? r.name ?? null,
  category: (r) => r.category ?? null,
  rarity: (r) => RARITY_RANK[r.entryRarity ?? r.rarity] ?? RARITY_RANK.unknown,
  power: (r) => r.powerLevel ?? r.itemLevel ?? null,
  quantity: (r) => r.quantity ?? null,
  updatedAt: (r) => r.updatedAt ?? null,
};

/**
 * Ordena filas de forma estable y sin mutar la entrada.
 * Los valores ausentes siempre quedan al final, en asc y en desc.
 * @param {object[]} rows
 * @param {'name'|'category'|'rarity'|'power'|'quantity'|'updatedAt'} [sort]
 * @param {'asc'|'desc'} [order]
 * @returns {object[]}
 */
export function sortItems(rows, sort = 'name', order = 'asc') {
  if (!Array.isArray(rows)) return [];
  const getter = SORT_KEYS[sort] ?? SORT_KEYS.name;
  const dir = order === 'desc' ? -1 : 1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const va = getter(a.row);
      const vb = getter(b.row);
      const na = va == null || va === '';
      const nb = vb == null || vb === '';
      if (na && nb) return a.i - b.i;
      if (na) return 1;
      if (nb) return -1;
      let cmp = typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb), 'es', { sensitivity: 'base', numeric: true });
      return cmp === 0 ? a.i - b.i : cmp * dir;
    })
    .map((w) => w.row);
}
