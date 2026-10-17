/**
 * Repositorio de `assets` (imágenes y su vínculo con ítems).
 */
import { J } from '../db.js';
import { uuid, nowIso } from '../../../domain/model.js';

const COLS = `id, file_name, category, mime, width, height, bytes, path,
  item_id, review_status, checksum, created_at`;

export function rowToAsset(r) {
  if (!r) return null;
  return {
    id: r.id,
    fileName: r.file_name,
    category: r.category ?? null,
    mime: r.mime ?? null,
    width: r.width ?? null,
    height: r.height ?? null,
    bytes: r.bytes ?? null,
    path: r.path,
    itemId: r.item_id ?? null,
    reviewStatus: r.review_status,
    checksum: r.checksum ?? null,
    createdAt: r.created_at,
  };
}

export function assetToRow(d) {
  return {
    id: d.id,
    file_name: d.fileName,
    category: d.category ?? null,
    mime: d.mime ?? null,
    width: d.width ?? null,
    height: d.height ?? null,
    bytes: d.bytes ?? null,
    path: d.path,
    item_id: d.itemId ?? null,
    review_status: d.reviewStatus ?? 'unmatched',
    checksum: d.checksum ?? null,
    created_at: d.createdAt,
  };
}

const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function createAssetRepository(db) {
  const stmtById = db.prepare(`SELECT ${COLS} FROM assets WHERE id = ?`);
  const stmtByPath = db.prepare(`SELECT ${COLS} FROM assets WHERE path = ?`);
  const stmtInsert = db.prepare(`INSERT INTO assets (${COLS}) VALUES (
    @id, @file_name, @category, @mime, @width, @height, @bytes, @path,
    @item_id, @review_status, @checksum, @created_at)`);
  const stmtUpdate = db.prepare(`UPDATE assets SET
    file_name = @file_name, category = @category, mime = @mime, width = @width,
    height = @height, bytes = @bytes, path = @path, item_id = @item_id,
    review_status = @review_status, checksum = @checksum
    WHERE id = @id`);
  const stmtDelete = db.prepare('DELETE FROM assets WHERE id = ?');

  return {
    list(filters = {}) {
      const where = [];
      const params = [];
      if (filters.search) { where.push(`file_name LIKE ? ESCAPE '\\'`); params.push(like(filters.search)); }
      if (filters.category) { where.push('category = ?'); params.push(filters.category); }
      if (filters.itemId) { where.push('item_id = ?'); params.push(filters.itemId); }
      if (filters.reviewStatus) { where.push('review_status = ?'); params.push(filters.reviewStatus); }
      const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const sortable = { fileName: 'file_name COLLATE NOCASE', createdAt: 'created_at', bytes: 'bytes' };
      const sortCol = sortable[filters.sort] || 'file_name COLLATE NOCASE';
      const dir = filters.order === 'desc' ? 'DESC' : 'ASC';
      const total = db.prepare(`SELECT COUNT(*) AS c FROM assets ${sql}`).get(...params).c;
      const rows = db.prepare(
        `SELECT ${COLS} FROM assets ${sql} ORDER BY ${sortCol} ${dir} LIMIT ? OFFSET ?`,
      ).all(...params, filters.limit ?? 50, filters.offset ?? 0);
      return { rows: rows.map(rowToAsset), total };
    },

    listAll() {
      return db.prepare(`SELECT ${COLS} FROM assets`).all().map(rowToAsset);
    },

    getById(id) { return rowToAsset(stmtById.get(id)); },
    getByPath(path) { return rowToAsset(stmtByPath.get(path)); },

    create(data) {
      const row = assetToRow({
        ...data,
        id: data.id || uuid(),
        createdAt: data.createdAt || nowIso(),
      });
      stmtInsert.run(row);
      return this.getById(row.id);
    },

    update(id, patch) {
      const existing = this.getById(id);
      if (!existing) return null;
      const row = assetToRow({ ...existing, ...patch, id });
      delete row.created_at; // node:sqlite rechaza named params ajenos al statement
      stmtUpdate.run(row);
      return this.getById(id);
    },

    remove(id) { return stmtDelete.run(id).changes > 0; },
    count() { return db.prepare('SELECT COUNT(*) AS c FROM assets').get().c; },
  };
}
