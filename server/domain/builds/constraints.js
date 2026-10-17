/**
 * Filtro de candidatos para el generador de builds.
 */

/**
 * Aplica las restricciones "duras" de candidatura a los pools por categoría.
 * @param {Object<string,object[]>} candidatesByCategory {melee,ranged,armor,artifacts,...}
 * @param {object} [constraints]
 * @param {string[]} [constraints.excludedIds]
 * @param {boolean} [constraints.onlyOwned]
 * @param {number|null} [constraints.minPower] ítems sin dato de poder no se descartan
 * @param {string[]} [constraints.rarities]
 * @param {string[]} [constraints.desiredTags] el ítem debe tener ≥1 (ignora 'default')
 * @param {Set<string>} [ownedIds]
 * @returns {Object<string,object[]>} pools filtrados (arrays nuevos)
 */
export function applyConstraints(candidatesByCategory, constraints = {}, ownedIds) {
  const {
    excludedIds = [], onlyOwned = false, minPower = null,
    rarities = [], desiredTags = [],
  } = constraints ?? {};
  const excluded = new Set(excludedIds);
  const raritySet = rarities.length ? new Set(rarities) : null;
  const wantTags = desiredTags
    .map((t) => String(t).toLowerCase())
    .filter((t) => t && t !== 'default');

  const keep = (item) => {
    if (!item || excluded.has(item.id)) return false;
    if (onlyOwned && ownedIds != null && !ownedIds.has?.(item.id)) return false;
    if (raritySet && !raritySet.has(item.rarity)) return false;
    if (minPower != null) {
      const p = item.powerLevel ?? item.itemLevel ?? item.power;
      if (p != null && p < minPower) return false;
    }
    if (wantTags.length) {
      const tags = (item.tags ?? []).map((t) => String(t).toLowerCase());
      if (!wantTags.some((t) => tags.includes(t))) return false;
    }
    return true;
  };

  const out = {};
  for (const [key, list] of Object.entries(candidatesByCategory ?? {})) {
    out[key] = (list ?? []).filter(keep);
  }
  return out;
}
