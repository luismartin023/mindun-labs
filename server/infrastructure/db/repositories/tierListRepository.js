/**
 * Repositorio de `tier_lists`.
 */
import { J } from '../db.js';
import { uuid, nowIso } from '../../../domain/model.js';

const COLS = `id, name, category, criteria, rows, entries, created_at, updated_at`;

export function rowToTierList(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    category: r.category ?? 'mixed',
    criteria: r.criteria ?? null,
    rows: J.parse(r.rows, []),
    entries: J.parse(r.entries, []),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function tierListToRow(d) {
  return {
    id: d.id,
    name: d.name,
    category: d.category ?? 'mixed',
    criteria: d.criteria ?? null,
    rows: J.str(d.rows ?? []),
    entries: J.str(d.entries ?? []),
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function createTierListRepository(db) {
  const stmtById = db.prepare(`SELECT ${COLS} FROM tier_lists WHERE id = ?`);
  const stmtInsert = db.prepare(`INSERT INTO tier_lists (${COLS}) VALUES (
    @id, @name, @category, @criteria, @rows, @entries, @created_at, @updated_at)`);
  const stmtUpdate = db.prepare(`UPDATE tier_lists SET
    name = @name, category = @category, criteria = @criteria,
    rows = @rows, entries = @entries, updated_at = @updated_at
    WHERE id = @id`);
  const stmtDelete = db.prepare('DELETE FROM tier_lists WHERE id = ?');
  const stmtCount = db.prepare('SELECT COUNT(*) AS c FROM tier_lists');

  return {
    list(filters = {}) {
      const where = [];
      const params = [];
      if (filters.search) { where.push(`name LIKE ? ESCAPE '\\'`); params.push(like(filters.search)); }
      if (filters.category) { where.push('category = ?'); params.push(filters.category); }
      const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const sortable = { name: 'name COLLATE NOCASE', createdAt: 'created_at', updatedAt: 'updated_at' };
      const sortCol = sortable[filters.sort] || 'updated_at';
      const dir = filters.order === 'desc' || !filters.sort ? 'DESC' : 'ASC';
      const total = db.prepare(`SELECT COUNT(*) AS c FROM tier_lists ${sql}`).get(...params).c;
      const rows = db.prepare(
        `SELECT ${COLS} FROM tier_lists ${sql} ORDER BY ${sortCol} ${dir} LIMIT ? OFFSET ?`,
      ).all(...params, filters.limit ?? 50, filters.offset ?? 0);
      return { rows: rows.map(rowToTierList), total };
    },

    listAll() {
      return db.prepare(`SELECT ${COLS} FROM tier_lists`).all().map(rowToTierList);
    },

    getById(id) { return rowToTierList(stmtById.get(id)); },

    create(data) {
      const now = nowIso();
      const row = tierListToRow({
        ...data,
        id: data.id || uuid(),
        createdAt: data.createdAt || now,
        updatedAt: data.updatedAt || now,
      });
      stmtInsert.run(row);
      return this.getById(row.id);
    },

    update(id, patch) {
      const existing = this.getById(id);
      if (!existing) return null;
      const row = tierListToRow({ ...existing, ...patch, id, updatedAt: nowIso() });
      delete row.created_at; // node:sqlite rechaza named params ajenos al statement
      stmtUpdate.run(row);
      return this.getById(id);
    },

    remove(id) { return stmtDelete.run(id).changes > 0; },
    count() { return stmtCount.get().c; },
  };
}
