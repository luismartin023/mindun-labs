/**
 * Importador de backup JSON {schemaVersion, exportedAt, tables:{...}}.
 * SQL crudo sobre las mismas columnas del esquema usando los toRow de los
 * repositorios — preserva ids y timestamps del backup (restauración real).
 */
import { nowIso } from '../../domain/model.js';
import { itemToRow } from '../db/repositories/itemRepository.js';
import { entryToRow } from '../db/repositories/inventoryRepository.js';
import { enchantmentToRow } from '../db/repositories/enchantmentRepository.js';
import { buildToRow } from '../db/repositories/buildRepository.js';
import { tierListToRow } from '../db/repositories/tierListRepository.js';
import { tableViewToRow } from '../db/repositories/tableViewRepository.js';
import { comparisonToRow } from '../db/repositories/comparisonRepository.js';
import { profileToRow } from '../db/repositories/profileRepository.js';

/** tabla lógica del backup → {table sql, toRow, uniqueSlug?} */
const TABLE_DEFS = {
  items: { table: 'items', toRow: itemToRow, uniqueSlug: true },
  inventory_entries: { table: 'inventory_entries', toRow: entryToRow },
  enchantments: { table: 'enchantments', toRow: enchantmentToRow, uniqueSlug: true },
  builds: { table: 'builds', toRow: buildToRow },
  tier_lists: { table: 'tier_lists', toRow: tierListToRow },
  table_views: { table: 'table_views', toRow: tableViewToRow },
  saved_comparisons: { table: 'saved_comparisons', toRow: comparisonToRow },
  profile: { table: 'profile', toRow: profileToRow, single: true },
};

function rowsOf(def, value) {
  if (value == null) return [];
  if (def.single) return [value];
  return Array.isArray(value) ? value : [];
}

function normalizeForRow(def, d) {
  const now = nowIso();
  return def.toRow({ ...d, createdAt: d.createdAt || now, updatedAt: d.updatedAt || now });
}

function existsById(db, table, id) {
  return !!db.prepare(`SELECT 1 AS x FROM ${table} WHERE id = ?`).get(id);
}

/**
 * Dry-run: calcula qué se insertaría/actualizaría y los conflictos.
 * @returns {{wouldInsert:object, wouldUpdate:object, conflicts:Array}}
 */
export function planRestore(db, tables) {
  const wouldInsert = {};
  const wouldUpdate = {};
  const conflicts = [];
  for (const [key, def] of Object.entries(TABLE_DEFS)) {
    const rows = rowsOf(def, tables?.[key]);
    const ins = [];
    const upd = [];
    for (const d of rows) {
      if (!d || typeof d !== 'object') {
        conflicts.push({ table: key, reason: 'fila no es un objeto' });
        continue;
      }
      if (!d.id) {
        conflicts.push({ table: key, name: d.name ?? null, reason: 'fila sin id' });
        continue;
      }
      if (def.uniqueSlug && d.slug) {
        const other = db.prepare(`SELECT id FROM ${def.table} WHERE slug = ?`).get(d.slug);
        if (other && other.id !== d.id) {
          conflicts.push({
            table: key, slug: d.slug, incomingId: d.id, existingId: other.id,
            reason: 'slug ocupado por otro registro',
          });
          continue;
        }
      }
      (existsById(db, def.table, d.id) ? upd : ins).push(d.id);
    }
    if (ins.length) wouldInsert[key] = ins;
    if (upd.length) wouldUpdate[key] = upd;
  }
  return { wouldInsert, wouldUpdate, conflicts };
}

/**
 * Aplica el backup dentro de una transacción.
 * @returns {{inserted:object, updated:object}} ids por tabla (para undo_data)
 */
export function applyRestore(db, tables) {
  const inserted = {};
  const updated = {};
  db.exec('BEGIN');
  try {
    for (const [key, def] of Object.entries(TABLE_DEFS)) {
      const rows = rowsOf(def, tables?.[key]);
      if (!rows.length) continue;
      const probe = db.prepare(`SELECT 1 AS x FROM ${def.table} WHERE id = ?`);
      const sample = normalizeForRow(def, rows[0]);
      const cols = Object.keys(sample);
      const insert = db.prepare(
        `INSERT INTO ${def.table} (${cols.join(', ')})
         VALUES (${cols.map((c) => `@${c}`).join(', ')})`,
      );
      // UPDATE (no REPLACE): REPLACE borra la fila y dispararía los
      // ON DELETE CASCADE / SET NULL de las FK hijas antes de restaurarlas.
      const updCols = cols.filter((c) => c !== 'id');
      const update = db.prepare(
        `UPDATE ${def.table} SET ${updCols.map((c) => `${c} = @${c}`).join(', ')}
         WHERE id = @id`,
      );
      for (const d of rows) {
        if (!d?.id) continue;
        const existed = !!probe.get(d.id);
        const row = normalizeForRow(def, d);
        if (existed) update.run(row);
        else insert.run(row);
        const bucket = existed ? updated : inserted;
        (bucket[key] ||= []).push(d.id);
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { inserted, updated };
}

/**
 * Deshace un lote: borra solo los ids que el lote insertó (los actualizados
 * no se revierten — sus valores previos no se conservan en v1).
 */
export function undoInsertBatch(db, undoData = {}) {
  const inserted = undoData.inserted || undoData; // tolera {inserted:{}} o {table:ids}
  const deleted = {};
  db.exec('BEGIN');
  try {
    for (const [key, ids] of Object.entries(inserted)) {
      const def = TABLE_DEFS[key];
      if (!def || !Array.isArray(ids) || !ids.length) continue;
      const stmt = db.prepare(`DELETE FROM ${def.table} WHERE id = ?`);
      let n = 0;
      for (const id of ids) n += stmt.run(id).changes;
      if (n) deleted[key] = n;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return { deleted };
}

export const IMPORTABLE_TABLES = Object.keys(TABLE_DEFS);
