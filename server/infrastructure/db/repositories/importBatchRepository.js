/**
 * Repositorio de `import_batches` (lotes de importación con datos de deshacer).
 */
import { J } from '../db.js';
import { uuid, nowIso } from '../../../domain/model.js';

export function rowToImportBatch(r) {
  if (!r) return null;
  return {
    id: r.id,
    kind: r.kind,
    summary: J.parse(r.summary, {}),
    undoData: J.parse(r.undo_data, {}),
    createdAt: r.created_at,
  };
}

export function createImportBatchRepository(db) {
  const stmtById = db.prepare('SELECT * FROM import_batches WHERE id = ?');
  const stmtInsert = db.prepare(`INSERT INTO import_batches
    (id, kind, summary, undo_data, created_at) VALUES (?, ?, ?, ?, ?)`);
  const stmtDelete = db.prepare('DELETE FROM import_batches WHERE id = ?');

  return {
    list(limit = 100) {
      return db.prepare(
        'SELECT * FROM import_batches ORDER BY created_at DESC LIMIT ?',
      ).all(limit).map(rowToImportBatch);
    },

    getById(id) { return rowToImportBatch(stmtById.get(id)); },

    create({ kind, summary = {}, undoData = {} }) {
      const id = uuid();
      stmtInsert.run(id, kind, J.str(summary), J.str(undoData), nowIso());
      return this.getById(id);
    },

    remove(id) { return stmtDelete.run(id).changes > 0; },
    count() { return db.prepare('SELECT COUNT(*) AS c FROM import_batches').get().c; },
  };
}
