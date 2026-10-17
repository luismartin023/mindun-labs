/**
 * Generador de builds con exploración acotada (sin explosión combinatoria).
 * Itera candidatos por categoría con combinaciones perezosas, poda por
 * restricciones duras y ordena por la puntuación del motor.
 */
import { BUILD_ARTIFACT_SLOTS } from '../model.js';
import { scoreBuild } from '../scoring/engine.js';
import { compatibleEnchants } from '../enchantments/slots.js';
import { applyConstraints } from './constraints.js';

/** Pesos implícitos por objetivo predefinido (los weights explícitos ganan). */
const GOAL_WEIGHTS = {
  tank: { survival: 3, healing: 2, cooldown: 1 },
  boss_damage: { bossDamage: 3, meleeDamage: 1.5, rangedDamage: 1.5 },
  mob_clear: { mobDamage: 3, control: 1 },
  crowd_control: { control: 3, mobility: 1 },
  mobility: { mobility: 3, cooldown: 1 },
  poison_damage: { mobDamage: 2, control: 2 },
  fire_damage: { mobDamage: 2, bossDamage: 1, rangedDamage: 1 },
  lightning_damage: { mobDamage: 2, control: 1 },
  souls: { enchantSynergy: 2, healing: 2, mobDamage: 1 },
  balanced: {},
};

function* combinations(pool, k) {
  const n = pool.length;
  if (k === 0) { yield []; return; }
  if (k > n) return;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    yield idx.map((i) => pool[i]);
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

function* iterBuilds(meleePool, rangedPool, armorPool, artPool, artSizes) {
  for (const melee of meleePool)
    for (const ranged of rangedPool)
      for (const armor of armorPool)
        for (const k of artSizes)
          for (const artifacts of combinations(artPool, k))
            yield { melee, ranged, armor, artifacts };
}

const signature = (slots) =>
  `${slots.melee?.id ?? '-'}|${slots.ranged?.id ?? '-'}|${slots.armor?.id ?? '-'}|` +
  slots.artifacts.map((a) => a?.id ?? '-').sort().join(',');

const emptyResult = (started, explored = 0, truncated = false) => ({
  results: [], explored, truncated, elapsedMs: Date.now() - started,
});

/**
 * Genera builds combinando ítems del catálogo.
 * @param {object} opts
 * @param {object[]} opts.items CatalogItem[]
 * @param {Set<string>} [opts.ownedIds]
 * @param {object[]} [opts.enchantments] EnchantmentRecord[]
 * @param {object} [opts.constraints]
 * @param {string[]} [opts.constraints.requiredIds] deben aparecer en la build
 * @param {string[]} [opts.constraints.excludedIds]
 * @param {boolean} [opts.constraints.onlyOwned]
 * @param {number|null} [opts.constraints.artifactCount] null = 0..3 cualquiera
 * @param {number} [opts.constraints.minPower]
 * @param {string[]} [opts.constraints.rarities]
 * @param {string[]} [opts.constraints.desiredTags]
 * @param {string[]} [opts.constraints.forbiddenEnchantIds] excluye ítems cuyo
 *   encantamiento fijo corresponda a un id prohibido
 * @param {string[]} [opts.constraints.desiredEnchantIds] preferencia: a igual
 *   total, gana la build que cubre más encantamientos deseados
 * @param {string[]} [opts.constraints.goals] BUILD_GOALS → pesos implícitos
 * @param {Object<string,number>} [opts.weights]
 * @param {number} [opts.limit]
 * @param {number} [opts.maxExplore] tope de combinaciones exploradas
 * @param {(explored:number, found:number)=>void} [opts.onProgress]
 * @param {{aborted?:boolean}} [opts.signal]
 * @returns {{results:{slots:object, score:object}[], explored:number,
 *   truncated:boolean, elapsedMs:number}}
 */
export function generateBuilds({
  items = [], ownedIds = new Set(), enchantments = [], constraints = {},
  weights = {}, limit = 50, maxExplore = 60_000, onProgress, signal,
} = {}) {
  const started = Date.now();
  const c = constraints ?? {};
  const requiredIds = [...(c.requiredIds ?? [])];
  const desiredEnchantIds = c.desiredEnchantIds ?? [];
  const forbiddenIds = new Set(c.forbiddenEnchantIds ?? []);
  const excluded = new Set(c.excludedIds ?? []);

  const itemsById = Object.fromEntries((items ?? []).map((i) => [i.id, i]));
  const enchantsById = Object.fromEntries((enchantments ?? []).map((e) => [e.id, e]));

  if (requiredIds.some((id) => excluded.has(id))) return emptyResult(started);

  const byCat = { melee: [], ranged: [], armor: [], artifacts: [] };
  for (const it of items ?? []) {
    if (it?.category === 'melee_weapon') byCat.melee.push(it);
    else if (it?.category === 'ranged_weapon') byCat.ranged.push(it);
    else if (it?.category === 'armor') byCat.armor.push(it);
    else if (it?.category === 'artifact') byCat.artifacts.push(it);
  }
  const pools = applyConstraints(byCat, c, ownedIds);

  // Ítems con encantamiento fijo prohibido quedan fuera.
  if (forbiddenIds.size) {
    const bannedNames = new Set();
    for (const e of enchantments ?? []) {
      if (forbiddenIds.has(e.id)) {
        if (e.name) bannedNames.add(String(e.name).toLowerCase());
        if (e.localizedName) bannedNames.add(String(e.localizedName).toLowerCase());
      }
    }
    if (bannedNames.size) {
      const clean = (it) => {
        const raw = it?.builtInEnchantment;
        if (!raw || String(raw).toLowerCase() === 'none') return true;
        return !String(raw).split(',')
          .map((s) => s.trim().toLowerCase())
          .some((n) => bannedNames.has(n));
      };
      for (const k of Object.keys(pools)) pools[k] = pools[k].filter(clean);
    }
  }

  const allCandidateIds = new Set(
    [...pools.melee, ...pools.ranged, ...pools.armor, ...pools.artifacts].map((i) => i.id));
  if (requiredIds.some((id) => !allCandidateIds.has(id))) return emptyResult(started);

  // Los obligatorios se exploran primero para encontrarlos dentro del presupuesto.
  const reqSet = new Set(requiredIds);
  for (const k of Object.keys(pools)) {
    pools[k] = pools[k]
      .map((it, i) => ({ it, i }))
      .sort((a, b) => (reqSet.has(b.it.id) - reqSet.has(a.it.id)) || (a.i - b.i))
      .map((w) => w.it);
  }

  const mergedWeights = {};
  for (const g of c.goals ?? []) {
    for (const [k, v] of Object.entries(GOAL_WEIGHTS[g] ?? {})) {
      mergedWeights[k] = (mergedWeights[k] ?? 0) + v;
    }
  }
  Object.assign(mergedWeights, weights ?? {});

  // Preferencia por encantamientos deseados: ids compatibles por ítem.
  const compatCache = new Map();
  const compatIds = (item) => {
    if (!item) return new Set();
    if (!compatCache.has(item.id)) {
      compatCache.set(item.id,
        new Set(compatibleEnchants(item, enchantments).map((e) => e.id)));
    }
    return compatCache.get(item.id);
  };
  const coverage = (equipped) => !desiredEnchantIds.length ? 0
    : desiredEnchantIds.filter((id) =>
        equipped.some((it) => compatIds(it).has(id))).length;

  const gearPools = [pools.melee, pools.ranged, pools.armor]
    .map((p) => (p.length ? p : [null]));
  const artPool = pools.artifacts;
  const maxArt = Math.min(BUILD_ARTIFACT_SLOTS, artPool.length);
  const wantArt = c.artifactCount != null
    ? Math.min(Math.max(0, c.artifactCount), BUILD_ARTIFACT_SLOTS) : null;
  const artSizes = wantArt != null
    ? (wantArt <= maxArt ? [wantArt] : [])
    : Array.from({ length: maxArt + 1 }, (_, i) => maxArt - i);

  let explored = 0;
  let found = 0;
  let truncated = false;
  const seen = new Set();
  const results = [];

  for (const slots of iterBuilds(gearPools[0], gearPools[1], gearPools[2], artPool, artSizes)) {
    if (signal?.aborted || explored >= maxExplore) { truncated = true; break; }
    explored++;
    if (onProgress && explored % 2000 === 0) onProgress(explored, found);
    const equipped = [slots.melee, slots.ranged, slots.armor, ...slots.artifacts].filter(Boolean);
    if (!equipped.length) continue;
    if (reqSet.size && !requiredIds.every((id) => equipped.some((it) => it.id === id))) continue;
    const sig = signature(slots);
    if (seen.has(sig)) continue;
    seen.add(sig);
    found++;
    const score = scoreBuild(
      { slots },
      { itemsById, enchantsById, weights: mergedWeights, ownedIds },
    );
    results.push({ slots, score, _cov: coverage(equipped), _sig: sig });
  }

  results.sort((x, y) => {
    const tx = x.score?.total;
    const ty = y.score?.total;
    if (tx == null && ty != null) return 1;
    if (tx != null && ty == null) return -1;
    if (tx != null && ty != null && ty !== tx) return ty - tx;
    if (y._cov !== x._cov) return y._cov - x._cov;
    return x._sig < y._sig ? -1 : x._sig > y._sig ? 1 : 0;
  });

  const sliced = results.slice(0, Math.max(0, limit))
    .map(({ slots, score }) => ({ slots, score }));
  return {
    results: sliced,
    explored,
    truncated: truncated || explored >= maxExplore,
    elapsedMs: Date.now() - started,
  };
}
