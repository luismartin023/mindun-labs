/**
 * MINDUN LABS — Modelo de dominio compartido (fuente de verdad de tipos).
 * Vanilla JS + JSDoc. Toda capa (api, repos, frontend) consume estas formas.
 * NADA de datos inventados: lo ausente es null/undefined, nunca 0 falso.
 */

// ---------- Constantes ----------

/** @typedef {'melee_weapon'|'ranged_weapon'|'armor'|'artifact'|'enchantment'} ItemCategory */
export const ITEM_CATEGORIES = /** @type {const} */ ([
  'melee_weapon',
  'ranged_weapon',
  'armor',
  'artifact',
  'enchantment',
]);

/** Categorías equipables en builds (los artefactos van en slots aparte). */
export const EQUIP_CATEGORIES = /** @type {const} */ ([
  'melee_weapon',
  'ranged_weapon',
  'armor',
]);

/** @typedef {'common'|'rare'|'unique'|'gilded'|'special'|'unknown'} Rarity */
export const RARITIES = /** @type {const} */ ([
  'common', 'rare', 'unique', 'gilded', 'special', 'unknown',
]);

/** @typedef {'verified'|'user_entered'|'imported'|'unverified'} DataStatus */
export const DATA_STATUSES = /** @type {const} */ ([
  'verified', 'user_entered', 'imported', 'unverified',
]);

/** Tipos de encantamiento por compatibilidad (sección wiki de origen). */
export const ENCHANT_TYPES = /** @type {const} */ ([
  'melee', 'ranged', 'armor', 'artifact', 'universal', 'unknown',
]);

export const ENCHANT_SLOTS_MAX = 3;
export const BUILD_ARTIFACT_SLOTS = 3;

/** Objetivos de build predefinidos (editables, son perfiles de búsqueda). */
export const BUILD_GOALS = /** @type {const} */ ([
  'tank', 'boss_damage', 'mob_clear', 'crowd_control', 'mobility',
  'poison_damage', 'fire_damage', 'lightning_damage', 'souls', 'balanced',
]);

// ---------- Typedefs ----------

/**
 * @typedef {object} ItemAttribute
 * @property {string} label   Etiqueta visible, p. ej. "Daño por golpe".
 * @property {string|number} value
 * @property {string} [unit]
 * @property {DataStatus} [status]
 */

/**
 * @typedef {object} EnchantmentOption
 * @property {string} enchantmentId  FK a enchantments.id
 * @property {1|2|3} [tier]
 * @property {string} [notes]
 */

/**
 * Opciones *posibles* de un slot en la ficha de catálogo (tipo de ítem).
 * La selección concreta vive en InventoryEntry / BuildRecord.
 * @typedef {object} ItemEnchantmentSlot
 * @property {1|2|3} slotIndex
 * @property {EnchantmentOption[]} options
 */

/**
 * Ítem de CATÁLOGO (tipo de objeto, no copia poseída).
 * @typedef {object} CatalogItem
 * @property {string} id            UUID interno estable
 * @property {string} slug          kebab-case estable
 * @property {ItemCategory} category
 * @property {string} name          Nombre canónico (inglés wiki)
 * @property {string} [localizedName]  Nombre ES editable por el usuario
 * @property {string[]} aliases
 * @property {Rarity} rarity
 * @property {string} [imagePath]   Ruta relativa /images/<cat>/<file>
 * @property {string} [description]
 * @property {ItemAttribute[]} attributes
 * @property {string[]} passiveEffects  Propiedades wiki (bullet list)
 * @property {string[]} uniqueEffects   Efectos propios del único/dorado
 * @property {ItemEnchantmentSlot[]} enchantmentSlots  Opciones posibles
 * @property {string[]} tags        Etiquetas de sinergia editables
 * @property {string} [internalId]  ID interno del juego (p. ej. ClimbingGear_Unique1)
 * @property {string} [groupOf]     Familia/variante base
 * @property {string} [builtInEnchantment]  Encantamiento fijo del único
 * @property {boolean} [acceptsSoul]
 * @property {boolean} [soulRequiring]
 * @property {number} [comboLength]
 * @property {string[]} runes       Runas de Ancient Hunt
 * @property {string[]} locations   Dónde se obtiene
 * @property {string} [dlc]         DLC de origen si aplica
 * @property {string} [source]      Procedencia del dato (p. ej. "minecraft.wiki")
 * @property {string} [userNotes]
 * @property {DataStatus} dataStatus
 * @property {string} createdAt     ISO-8601
 * @property {string} updatedAt     ISO-8601
 */

/**
 * Copia poseída por el usuario (INVENTARIO personal).
 * @typedef {object} InventoryEntry
 * @property {string} id            UUID
 * @property {string} itemId        FK a items.id
 * @property {number} quantity      >= 0, nunca negativa
 * @property {number} [powerLevel]
 * @property {number} [itemLevel]
 * @property {boolean} isFavorite
 * @property {boolean} isGilded
 * @property {string} [gildedEnchantmentId]
 * @property {(string|null)[]} selectedEnchantIds  [slot1, slot2, slot3]
 * @property {{enchantmentId:string,tier?:number}[]} [enchantTiers]
 * @property {string} [notes]
 * @property {string} [source]      De dónde salió la copia
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {object} EnchantmentRecord
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} [localizedName]
 * @property {string[]} aliases
 * @property {string} enchantType   ENCHANT_TYPES
 * @property {string} [imagePath]
 * @property {string} [description] In-game description
 * @property {{tier:number, text:string, cost?:number}[]} tiers
 * @property {boolean} [multiplePerEquipment]
 * @property {string[]} builtInto   Slugs de ítems donde viene fijo
 * @property {string} [gildedDescription]
 * @property {string} [source]
 * @property {string} [userNotes]
 * @property {DataStatus} dataStatus
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {object} BuildRecord
 * @property {string} id
 * @property {string} name
 * @property {string} [goal]        BUILD_GOALS u objetivo custom
 * @property {string} [playstyle]
 * @property {string|null} meleeItemId    itemId de catálogo
 * @property {string|null} rangedItemId
 * @property {string|null} armorItemId
 * @property {(string|null)[]} artifactItemIds  [a1,a2,a3]
 * @property {Object<string,(string|null)[]>} enchantChoices itemId→[e1,e2,e3]
 * @property {Object<string,number>} weights  criterio→peso 0-10
 * @property {object} [score]       Resultado cacheado del motor de puntuación
 * @property {string} [notes]
 * @property {boolean} isFavorite
 * @property {string} status        'draft'|'saved'|'archived'
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {object} TierListRecord
 * @property {string} id
 * @property {string} name
 * @property {ItemCategory|'mixed'} category
 * @property {string} [criteria]    Explicación de criterios usados
 * @property {{key:string,label:string,color:string}[]} rows  S,A,B,C,D…
 * @property {{itemId:string,rowKey:string,reason?:string,notes?:string}[]} entries
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {object} PlayerProfile
 * @property {string} id            'profile' (fila única)
 * @property {string} displayName
 * @property {number} [level]
 * @property {number} [power]
 * @property {string} [avatarPath]
 * @property {string} [notes]
 * @property {object} prefs         {cardSize,density,motion3d,language…}
 * @property {string} [lastReviewedAt]
 * @property {string} updatedAt
 */

/**
 * @typedef {object} AssetRecord
 * @property {string} id
 * @property {string} fileName
 * @property {string} category
 * @property {string} mime
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} bytes
 * @property {string} path          Ruta relativa servida
 * @property {string} [itemId]
 * @property {'confirmed'|'suggested'|'unmatched'|'rejected'} reviewStatus
 * @property {string} [checksum]
 * @property {string} createdAt
 */

/** Resultado estándar de validación de dominio. */
export const Validation = Object.freeze({
  /** @param {string[]} errors @param {string[]} [warnings] */
  ok: (errors = [], warnings = []) => ({ valid: errors.length === 0, errors, warnings }),
});

// ---------- Helpers puros ----------

/** Normaliza un nombre a slug kebab-case estable (sin acentos). */
export function slugify(name) {
  return String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

/** Etiqueta legible de rareza (UI español). */
export const RARITY_LABELS = Object.freeze({
  common: 'Común', rare: 'Raro', unique: 'Único',
  gilded: 'Dorado', special: 'Especial', unknown: 'Desconocida',
});

export const CATEGORY_LABELS = Object.freeze({
  melee_weapon: 'Cuerpo a cuerpo', ranged_weapon: 'A distancia',
  armor: 'Armadura', artifact: 'Artefacto', enchantment: 'Encantamiento',
});

/** UUID v4 sin dependencias. */
export function uuid() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}
