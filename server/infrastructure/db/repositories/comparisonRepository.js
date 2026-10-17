/**
 * Repositorio de `saved_comparisons` (comparaciones guardadas).
 */
import { J } from '../db.js';
import { uuid, nowIso } from '../../../domain/model.js';

const COLS = `id, name, kind, ref_ids, criteria, created_at`;

export function rowToComparison(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name ?? null,
    kind: r.kind,
    refIds: J.parse(r.ref_ids, []),
    criteria: r.criteria ?? null,
    createdAt: r.created_at,
  };
}

export function comparisonToRow(d) {
  return {
    id: d.id,
    name: d.name ?? null,
    kind: d.kind ?? 'items',
    ref_ids: J.str(d.refIds ?? []),
    criteria: d.criteria ?? null,
    created_at: d.createdAt,
  };
}

const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function createComparisonRepository(db) {
  const stmtById = db.prepare(`SELECT ${COLS} FROM saved_comparisons WHERE id = ?`);
  const stmtInsert = db.prepare(`INSERT INTO saved_comparisons (${COLS}) VALUES (
    @id, @name, @kind, @ref_ids, @criteria, @created_at)`);
  const stmtDelete = db.prepare('DELETE FROM saved_comparisons WHERE id = ?');

  return {
    list(filters = {}) {
      const where = [];
      const params = [];
      if (filters.search) { where.push(`name LIKE ? ESCAPE '\\'`); params.push(like(filters.search)); }
      if (filters.kind) { where.push('kind = ?'); params.push(filters.kind); }
      const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = db.prepare(`SELECT COUNT(*) AS c FROM saved_comparisons ${sql}`).get(...params).c;
      const rows = db.prepare(
        `SELECT ${COLS} FROM saved_comparisons ${sql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      ).all(...params, filters.limit ?? 50, filters.offset ?? 0);
      return { rows: rows.map(rowToComparison), total };
    },

    getById(id) { return rowToComparison(stmtById.get(id)); },

    create(data) {
      const row = comparisonToRow({
        ...data,
        id: data.id || uuid(),
        createdAt: data.createdAt || nowIso(),
      });
      stmtInsert.run(row);
      return this.getById(row.id);
    },

    remove(id) { return stmtDelete.run(id).changes > 0; },
    count() { return db.prepare('SELECT COUNT(*) AS c FROM saved_comparisons').get().c; },
  };
}
