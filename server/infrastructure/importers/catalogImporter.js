/**
 * Importador de catálogo: upsert de ítems por slug.
 * preview = qué pasaría; apply = inserta nuevos / actualiza existentes.
 */
import { J } from '../db/db.js';
import { slugify, uuid, nowIso, ITEM_CATEGORIES, RARITIES, DATA_STATUSES } from '../../domain/model.js';
import { itemToRow } from '../db/repositories/itemRepository.js';

const ITEM_FIELDS = [
  'slug', 'category', 'name', 'localizedName', 'aliases', 'rarity', 'imagePath',
  'description', 'attributes', 'passiveEffects', 'uniqueEffects',
  'enchantmentSlots', 'tags', 'internalId', 'groupOf', 'builtInEnchantment',
  'acceptsSoul', 'soulRequiring', 'comboLength', 'runes', 'locations', 'dlc',
  'source', 'userNotes', 'dataStatus',
];

/** campo de dominio → columna SQL (para updates parciales del upsert). */
const camelToCol = {
  slug: 'slug', category: 'category', name: 'name',
  localizedName: 'localized_name', aliases: 'aliases', rarity: 'rarity',
  imagePath: 'image_path', description: 'description', attributes: 'attributes',
  passiveEffects: 'passive_effects', uniqueEffects: 'unique_effects',
  enchantmentSlots: 'enchantment_slots', tags: 'tags', internalId: 'internal_id',
  groupOf: 'group_of', builtInEnchantment: 'built_in_enchantment',
  acceptsSoul: 'accepts_soul', soulRequiring: 'soul_requiring',
  comboLength: 'combo_length', runes: 'runes', locations: 'locations',
  dlc: 'dlc', source: 'source', userNotes: 'user_notes',
  dataStatus: 'data_status',
};

/** Normaliza un ítem entrante al modelo de dominio (sin inventar datos). */
export function normalizeCatalogItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const d = { _provided: new Set() };
  for (const k of ITEM_FIELDS) {
    if (raw[k] !== undefined) { d[k] = raw[k]; d._provided.add(k); }
  }
  if (d.name) d.name = String(d.name).trim();
  d.slug = d.slug ? slugify(d.slug) : slugify(d.name || '');
  if (!ITEM_CATEGORIES.includes(d.category)) d.category = d.category || null;
  if (d.rarity && !RARITIES.includes(d.rarity)) d.rarity = 'unknown';
  if (d.dataStatus && !DATA_STATUSES.includes(d.dataStatus)) d.dataStatus = 'unverified';
  if (!d.dataStatus) d.dataStatus = 'imported';
  return d;
}

/**
 * Dry-run: separa inserciones de actualizaciones y recoge conflictos.
 * @returns {{wouldInsert:number, wouldUpdate:number, conflicts:Array,
 *            rows:Array, slugsUpdate:string[]}}
 */
export function planCatalogImport(db, items) {
  const rows = [];
  const conflicts = [];
  let wouldInsert = 0;
  let wouldUpdate = 0;
  const slugsUpdate = [];
  const seenSlugs = new Set();
  const stmtSlug = db.prepare('SELECT id FROM items WHERE slug = ?');

  (Array.isArray(items) ? items : []).forEach((raw, idx) => {
    const d = normalizeCatalogItem(raw);
    if (!d || !d.name || !d.category) {
      conflicts.push({ index: idx, name: raw?.name ?? null, reason: 'faltan name o category' });
      return;
    }
    if (seenSlugs.has(d.slug)) {
      conflicts.push({ index: idx, slug: d.slug, reason: 'slug duplicado dentro del lote' });
      return;
    }
    seenSlugs.add(d.slug);
    const existing = stmtSlug.get(d.slug);
    if (existing) { wouldUpdate++; slugsUpdate.push(d.slug); d._existingId = existing.id; }
    else wouldInsert++;
    rows.push(d);
  });
  return { wouldInsert, wouldUpdate, conflicts, rows, slugsUpdate };
}

/**
 * Aplica el lote dentro de una transacción (upsert por slug).
 * @returns {{insertedIds:string[], updatedIds:string[]}}
 */
export function applyCatalogImport(db, rows) {
  const insertedIds = [];
  const updatedIds = [];
  const now = nowIso();
  db.exec('BEGIN');
  try {
    const bySlug = db.prepare('SELECT id, created_at FROM items WHERE slug = ?');
    for (const d of rows) {
      const existing = bySlug.get(d.slug);
      if (existing) {
        // Upsert semántico: solo se tocan los campos PRESENTES en el lote;
        // los ausentes conservan su valor (no se escriben nulos encima).
        const domain = { ...d, updatedAt: now };
        delete domain._provided;
        const row = itemToRow(domain);
        const updCols = new Set(['slug', 'updated_at']);
        for (const f of d._provided) {
          const col = camelToCol[f];
          if (col) updCols.add(col);
        }
        const sets = [...updCols].map((c) => `${c} = @${c}`);
        const upd = { id: existing.id };
        for (const c of updCols) upd[c] = row[c];
        db.prepare(`UPDATE items SET ${sets.join(', ')} WHERE id = @id`).run(upd);
        updatedIds.push(existing.id);
      } else {
        const domain = {
          ...d,
          id: d.id || uuid(),
          createdAt: d.createdAt || now,
          updatedAt: now,
        };
        delete domain._provided;
        const row = itemToRow(domain);
        const cols = Object.keys(row);
        db.prepare(`INSERT INTO items (${cols.join(', ')})
          VALUES (${cols.map((c) => `@${c}`).join(', ')})`).run(row);
        insertedIds.push(row.id);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { insertedIds, updatedIds };
}

/** Documento de esquema de importación (GET /api/import/schema). */
export function importSchema() {
  return {
    schemaVersion: 1,
    item: {
      required: ['name', 'category'],
      fields: ITEM_FIELDS,
      enums: { category: ITEM_CATEGORIES, rarity: RARITIES, dataStatus: DATA_STATUSES },
    },
    example: {
      name: 'Example Sword',
      category: 'melee_weapon',
      rarity: 'unique',
      description: 'Texto libre',
      tags: ['ejemplo'],
      enchantmentSlots: [],
      dataStatus: 'user_entered',
    },
  };
}

export { J };
