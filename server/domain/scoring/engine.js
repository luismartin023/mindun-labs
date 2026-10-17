/**
 * Motor de puntuación de builds (estimación heurística, estimated:true).
 *
 * SOLO usa señales explícitas del ítem: tags, passiveEffects/uniqueEffects,
 * builtInEnchantment, acceptsSoul/soulRequiring, encantamientos
 * seleccionados y presencia de ítem en cada slot. NUNCA inventa números:
 * un criterio sin señales devuelve { value:null, reason:'Sin datos' }.
 *
 * ── Mapa de señales → criterios ──────────────────────────────────────
 * Cada criterio suma puntos por: etiquetas coincidentes (+4), líneas de
 * pasivos/únicos que contienen sus palabras clave (+3 c/u), nombre del
 * encantamiento fijo que contiene palabra clave (+3), presencia de slot
 * (+2) y banderas de almas (+2). Tope 10 por criterio.
 *   survival:     tags defensive-healing · resistencia, reducción de
 *                 daño, inmunidad, knockback, escudo, trampas de muerte
 *   meleeDamage:  presencia arma melee · "melee", cadencia, combo
 *   rangedDamage: tags quiver/bows/crossbows · "ranged damage", flechas
 *   mobDamage:    tags damaging/summoning/poison/fire/lightning ·
 *                 "enemigos cercanos", explosiones, almas, invocaciones
 *   bossDamage:   tag damaging · "boss", daño extra, críticos
 *   control:      tag status · stun, freeze, slow, pull, weaken…
 *   mobility:     tag agility · velocidad, roll, dash, teleport
 *   healing:      tags healing/defensive-healing · curar, vida, poción,
 *                 robo de vida, almas (acceptsSoul también suma aquí)
 *   cooldown:     presencia artefacto · "cooldown", "reset"
 *   enchantSynergy: etiquetas compartidas entre ≥2 equipados (+3 c/u),
 *                 encantamientos elegidos cuyo tipo encaja con la
 *                 categoría del ítem (o universal) (+2 c/u), acceptsSoul
 *   ownership:    fracción de equipados presentes en ownedIds (0-10)
 */
import { enchantTypeForCategory, enchantTypeOf } from '../enchantments/slots.js';

const SIGNAL_MAP = {
  survival: {
    tags: ['defensive-healing'],
    keywords: ['resistance', 'resists', 'damage reduction', 'immunity', 'invulnerab',
      'knockback', 'negates', 'absorb', 'cheat death', 'protection', 'barrier',
      'shield', 'reflect', 'thorns', 'revive'],
  },
  meleeDamage: {
    tags: [],
    keywords: ['melee', 'attack speed', 'weapon damage', 'combo'],
  },
  rangedDamage: {
    tags: ['quiver', 'bows', 'crossbows'],
    keywords: ['ranged damage', 'arrow', 'projectile'],
  },
  mobDamage: {
    tags: ['damaging', 'summoning', 'poison', 'fire', 'lightning'],
    keywords: ['nearby enemies', 'enemies', 'explod', 'soul', 'summon', 'spawn',
      'companion', 'burn', 'shock', 'poison', 'chain', 'beam', 'mobs', 'area'],
  },
  bossDamage: {
    tags: ['damaging'],
    keywords: ['boss', 'damage boost', 'extra damage', 'bonus damage',
      'critical', 'weakened', 'single target'],
  },
  control: {
    tags: ['status'],
    keywords: ['stun', 'freez', 'slow', 'knockback', 'pull', 'gravity', 'weaken',
      'stagger', 'immobil', 'tether', 'scare', 'push'],
  },
  mobility: {
    tags: ['agility'],
    keywords: ['movespeed', 'move speed', 'speed', 'roll', 'dash', 'dodge', 'teleport'],
  },
  healing: {
    tags: ['healing', 'defensive-healing'],
    keywords: ['heal', 'health', 'regenerat', 'life steal', 'potion', 'food',
      'leech', 'revive', 'anima', 'soul'],
  },
  cooldown: {
    tags: [],
    keywords: ['cooldown', 'reuse', 'reset'],
  },
};

const PTS = {
  presence: 2, tag: 4, keyword: 3, builtIn: 3, flag: 2,
  sharedTag: 3, enchantMatch: 2,
};

const FLAG_SIGNALS = [
  { flag: 'acceptsSoul', criteria: ['healing', 'enchantSynergy'], reason: 'acepta almas' },
  { flag: 'soulRequiring', criteria: ['enchantSynergy'], reason: 'requiere almas' },
];

const CRITERIA = [
  'survival', 'meleeDamage', 'rangedDamage', 'mobDamage', 'bossDamage',
  'control', 'mobility', 'healing', 'cooldown', 'enchantSynergy', 'ownership',
];

const resolveItem = (x, itemsById) =>
  x == null ? null : (typeof x === 'string' ? itemsById[x] ?? null : x);

function equippedItems(buildLike, itemsById) {
  const src = buildLike?.slots
    ? {
        melee: buildLike.slots.melee,
        ranged: buildLike.slots.ranged,
        armor: buildLike.slots.armor,
        artifactItemIds: buildLike.slots.artifacts,
      }
    : {
        melee: buildLike?.meleeItemId,
        ranged: buildLike?.rangedItemId,
        armor: buildLike?.armorItemId,
        artifactItemIds: buildLike?.artifactItemIds,
      };
  const artifacts = (src.artifactItemIds ?? [])
    .map((x) => resolveItem(x, itemsById)).filter(Boolean);
  return {
    melee: resolveItem(src.melee, itemsById),
    ranged: resolveItem(src.ranged, itemsById),
    armor: resolveItem(src.armor, itemsById),
    artifacts,
  };
}

const effectLines = (item) => [
  ...(Array.isArray(item?.passiveEffects) ? item.passiveEffects : []),
  ...(Array.isArray(item?.uniqueEffects) ? item.uniqueEffects : []),
].filter((s) => typeof s === 'string' && s.length);

const builtInNames = (item) => {
  const raw = item?.builtInEnchantment;
  if (!raw || String(raw).toLowerCase() === 'none') return [];
  return String(raw).split(',').map((s) => s.trim()).filter(Boolean);
};

/**
 * Puntúa una build. Determinista: mismas entradas → misma salida.
 * @param {object} buildLike BuildRecord o { slots:{melee,ranged,armor,artifacts},
 *   enchantChoices } (los slots aceptan ítems o ids).
 * @param {object} ctx
 * @param {Object<string,object>} [ctx.itemsById]
 * @param {Object<string,object>} [ctx.enchantsById]
 * @param {Object<string,number>} [ctx.weights] peso 0-10 por criterio (def. 1)
 * @param {Set<string>} [ctx.ownedIds] ids poseídos (para el criterio ownership)
 * @returns {{total:number|null, breakdown:object, estimated:true}}
 */
export function scoreBuild(buildLike = {}, ctx = {}, arg3, arg4) {
  // Tolera la firma posicional scoreBuild(build, itemsById, enchantsById, weights).
  let itemsById, enchantsById, weights, ownedIds;
  if (ctx && typeof ctx === 'object' &&
      ('itemsById' in ctx || 'enchantsById' in ctx || 'weights' in ctx || 'ownedIds' in ctx)) {
    ({ itemsById, enchantsById, weights, ownedIds } = ctx);
  } else {
    itemsById = ctx; enchantsById = arg3; weights = arg4;
  }
  itemsById ??= {}; enchantsById ??= {}; weights ??= {};

  const eq = equippedItems(buildLike, itemsById);
  const equipped = [eq.melee, eq.ranged, eq.armor, ...eq.artifacts].filter(Boolean);
  const acc = Object.fromEntries(CRITERIA.map((c) => [c, { points: 0, parts: [] }]));
  const add = (criterion, points, part) => {
    acc[criterion].points += points;
    acc[criterion].parts.push(part);
  };

  if (eq.melee) add('meleeDamage', PTS.presence, 'arma cuerpo a cuerpo equipada');
  if (eq.ranged) add('rangedDamage', PTS.presence, 'arma a distancia equipada');
  if (eq.armor) add('survival', PTS.presence, 'armadura equipada');
  if (eq.artifacts.length) add('cooldown', PTS.presence, 'artefacto equipado');

  for (const item of equipped) {
    const itemTags = new Set((item.tags ?? []).map((t) => String(t).toLowerCase()));
    const lines = effectLines(item);
    const builtIns = builtInNames(item);
    for (const [criterion, sig] of Object.entries(SIGNAL_MAP)) {
      const tagHits = sig.tags.filter((t) => itemTags.has(t));
      if (tagHits.length) {
        add(criterion, PTS.tag * tagHits.length, `etiquetas: ${tagHits.join(', ')}`);
      }
      for (const line of lines) {
        const low = line.toLowerCase();
        if (sig.keywords.some((k) => low.includes(k))) {
          add(criterion, PTS.keyword, `pasivo: "${line}"`);
        }
      }
      for (const bi of builtIns) {
        const low = bi.toLowerCase();
        if (sig.keywords.some((k) => low.includes(k))) {
          add(criterion, PTS.builtIn, `encantamiento fijo: ${bi}`);
        }
      }
    }
    for (const f of FLAG_SIGNALS) {
      if (item[f.flag]) for (const c of f.criteria) add(c, PTS.flag, f.reason);
    }
  }

  // enchantSynergy: etiquetas compartidas entre ≥2 ítems equipados.
  const tagCount = new Map();
  for (const item of equipped) {
    for (const t of new Set((item.tags ?? []).map((x) => String(x).toLowerCase()))) {
      tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    }
  }
  for (const [tag, n] of tagCount) {
    if (n >= 2) add('enchantSynergy', PTS.sharedTag, `etiqueta compartida: ${tag}`);
  }
  // enchantSynergy: encantamientos elegidos compatibles con su ítem.
  const choices = buildLike?.enchantChoices ?? {};
  const equippedById = new Map(equipped.map((i) => [i.id, i]));
  for (const [itemId, ids] of Object.entries(choices)) {
    const item = equippedById.get(itemId);
    if (!item || !Array.isArray(ids)) continue;
    const slotType = enchantTypeForCategory(item.category);
    for (const id of ids) {
      if (id == null) continue;
      const ench = enchantsById[id];
      if (!ench) continue;
      const t = enchantTypeOf(ench);
      if (t === slotType || t === 'universal') {
        add('enchantSynergy', PTS.enchantMatch,
          `encantamiento "${ench.name ?? id}" compatible con ${item.name ?? itemId}`);
      }
    }
  }

  // ownership: fracción de equipados poseídos.
  if (ownedIds != null && equipped.length) {
    const owned = equipped.filter((i) => ownedIds.has?.(i.id)).length;
    add('ownership', Math.round((owned / equipped.length) * 100) / 10,
      `${owned}/${equipped.length} objetos poseídos`);
  }

  const breakdown = {};
  let sumV = 0;
  let sumW = 0;
  for (const c of CRITERIA) {
    const w = typeof weights[c] === 'number' && !Number.isNaN(weights[c]) ? weights[c] : 1;
    const { points, parts } = acc[c];
    // Un criterio sin señales jamás inventa un número: null + 'Sin datos'.
    if (parts.length === 0) {
      breakdown[c] = { value: null, weight: w, reason: 'Sin datos' };
      continue;
    }
    const value = Math.min(10, points);
    breakdown[c] = { value, weight: w, reason: parts.join(' · ') };
    sumV += value * w;
    sumW += w;
  }
  const total = sumW > 0 ? Math.round((sumV / sumW) * 10) / 10 : null;
  return { total, breakdown, estimated: true };
}
