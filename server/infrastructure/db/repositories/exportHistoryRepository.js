/**
 * Repositorio de `export_history` (registro de exportaciones).
 */
import { J } from '../db.js';
import { uuid, nowIso } from '../../../domain/model.js';

export function rowToExportHistory(r) {
  if (!r) return null;
  return {
    id: r.id,
    exportType: r.export_type,
    format: r.format,
    params: J.parse(r.params, {}),
    fileName: r.file_name ?? null,
    createdAt: r.created_at,
  };
}

export function createExportHistoryRepository(db) {
  const stmtInsert = db.prepare(`INSERT INTO export_history
    (id, export_type, format, params, file_name, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`);

  return {
    list(limit = 100) {
      return db.prepare(
        'SELECT * FROM export_history ORDER BY created_at DESC LIMIT ?',
      ).all(limit).map(rowToExportHistory);
    },

    create({ exportType, format, params = {}, fileName = null }) {
      const id = uuid();
      stmtInsert.run(id, exportType, format, J.str(params), fileName, nowIso());
      return id;
    },

    count() { return db.prepare('SELECT COUNT(*) AS c FROM export_history').get().c; },
  };
}
