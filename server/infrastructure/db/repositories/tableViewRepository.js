/**
 * Repositorio de `table_views` (vistas de tabla guardadas).
 */
import { J } from '../db.js';
import { uuid, nowIso } from '../../../domain/model.js';

const COLS = `id, name, dataset, config, created_at, updated_at`;

export function rowToTableView(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    dataset: r.dataset,
    config: J.parse(r.config, {}),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function tableViewToRow(d) {
  return {
    id: d.id,
    name: d.name,
    dataset: d.dataset,
    config: J.str(d.config ?? {}),
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function createTableViewRepository(db) {
  const stmtById = db.prepare(`SELECT ${COLS} FROM table_views WHERE id = ?`);
  const stmtInsert = db.prepare(`INSERT INTO table_views (${COLS}) VALUES (
    @id, @name, @dataset, @config, @created_at, @updated_at)`);
  const stmtUpdate = db.prepare(`UPDATE table_views SET
    name = @name, dataset = @dataset, config = @config, updated_at = @updated_at
    WHERE id = @id`);
  const stmtDelete = db.prepare('DELETE FROM table_views WHERE id = ?');

  return {
    list(filters = {}) {
      const where = [];
      const params = [];
      if (filters.search) { where.push(`name LIKE ? ESCAPE '\\'`); params.push(like(filters.search)); }
      if (filters.dataset) { where.push('dataset = ?'); params.push(filters.dataset); }
      const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = db.prepare(`SELECT COUNT(*) AS c FROM table_views ${sql}`).get(...params).c;
      const rows = db.prepare(
        `SELECT ${COLS} FROM table_views ${sql} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      ).all(...params, filters.limit ?? 50, filters.offset ?? 0);
      return { rows: rows.map(rowToTableView), total };
    },

    getById(id) { return rowToTableView(stmtById.get(id)); },

    create(data) {
      const now = nowIso();
      const row = tableViewToRow({
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
      const row = tableViewToRow({ ...existing, ...patch, id, updatedAt: nowIso() });
      delete row.created_at; // node:sqlite rechaza named params ajenos al statement
      stmtUpdate.run(row);
      return this.getById(id);
    },

    remove(id) { return stmtDelete.run(id).changes > 0; },
    count() { return db.prepare('SELECT COUNT(*) AS c FROM table_views').get().c; },
  };
}
