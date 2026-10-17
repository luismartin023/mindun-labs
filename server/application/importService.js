/**
 * Servicio de importación: backup JSON y catálogo por slug, con vista previa
 * (dry-run por defecto) y aplicación transaccional con lote deshacible.
 */
import { badRequest, notFound } from '../http/errors.js';
import {
  planRestore, applyRestore, undoInsertBatch,
} from '../infrastructure/importers/backupImporter.js';
import {
  planCatalogImport, applyCatalogImport, importSchema,
} from '../infrastructure/importers/catalogImporter.js';

export function createImportService({ db, importBatchRepo }) {
  return {
    schema() { return importSchema(); },

    /**
     * POST /api/import/backup — preview por defecto; aplica con confirm=true.
     * @returns preview | {applied, batchId, inserted, updated}
     */
    async importBackup(body, { confirm = false } = {}) {
      if (!body || typeof body !== 'object' || !body.tables || typeof body.tables !== 'object') {
        throw badRequest('Cuerpo inválido: se espera {schemaVersion, exportedAt, tables:{...}}');
      }
      const plan = planRestore(db, body.tables);
      if (!confirm) {
        return {
          preview: true,
          schemaVersion: body.schemaVersion ?? null,
          exportedAt: body.exportedAt ?? null,
          ...plan,
        };
      }
      const { inserted, updated } = applyRestore(db, body.tables);
      const batch = importBatchRepo.create({
        kind: 'backup',
        summary: {
          inserted: countMap(inserted), updated: countMap(updated),
          conflicts: plan.conflicts.length,
        },
        undoData: { inserted },
      });
      return { applied: true, batchId: batch.id, inserted, updated, conflicts: plan.conflicts };
    },

    /**
     * POST /api/import/catalog — body {items:[...]}; upsert por slug.
     */
    async importCatalog(body, { confirm = false } = {}) {
      const items = Array.isArray(body) ? body : body?.items;
      if (!Array.isArray(items)) {
        throw badRequest('Cuerpo inválido: se espera {items:[...]}');
      }
      const plan = planCatalogImport(db, items);
      if (!confirm) {
        return {
          preview: true,
          wouldInsert: plan.wouldInsert,
          wouldUpdate: plan.wouldUpdate,
          conflicts: plan.conflicts,
        };
      }
      const { insertedIds, updatedIds } = applyCatalogImport(db, plan.rows);
      const batch = importBatchRepo.create({
        kind: 'catalog',
        summary: { inserted: insertedIds.length, updated: updatedIds.length, conflicts: plan.conflicts.length },
        undoData: { inserted: { items: insertedIds } },
      });
      return {
        applied: true, batchId: batch.id,
        inserted: insertedIds.length, updated: updatedIds.length,
        conflicts: plan.conflicts,
      };
    },

    batches() { return importBatchRepo.list(); },

    /** DELETE /api/import/batches/:id/undo — borra lo insertado por el lote. */
    async undoBatch(id) {
      const batch = importBatchRepo.getById(id);
      if (!batch) throw notFound(`Lote de importación no encontrado: ${id}`);
      const result = undoInsertBatch(db, batch.undoData);
      importBatchRepo.remove(id);
      return { undone: true, batchId: id, ...result };
    },
  };
}

function countMap(m) {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.length]));
}
