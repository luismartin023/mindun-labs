/**
 * Servicio de exportación: reúne el dataset por tipo, llama al dispatcher
 * de exporters y registra la operación en export_history.
 */
import { badRequest, notFound } from '../http/errors.js';
import { exportFile } from '../infrastructure/exporters/index.js';
import { buildBackup } from '../infrastructure/exporters/backupExporter.js';

const VALID_TYPES = new Set([
  'inventory', 'catalog', 'item', 'enchantments', 'build', 'builds',
  'tierlist', 'comparison', 'profile', 'backup',
]);
const WITH_ID = new Set(['item', 'build', 'tierlist', 'comparison']);

export function createExportService({
  itemRepo, inventoryRepo, enchantmentRepo, buildRepo, tierListRepo,
  comparisonRepo, profileRepo, tableViewRepo, exportHistoryRepo, statsService,
}) {
  function maps() {
    return {
      itemsById: Object.fromEntries(itemRepo.listAll().map((i) => [i.id, i])),
      enchantsById: Object.fromEntries(enchantmentRepo.listAll().map((e) => [e.id, e])),
    };
  }

  async function datasetFor(type, id, filters) {
    const { itemsById, enchantsById } = maps();
    const base = { itemsById, enchantsById, generatedAt: new Date().toISOString(), filters };
    switch (type) {
      case 'inventory': {
        const { rows } = inventoryRepo.listJoined({ limit: 100000, offset: 0 });
        return { ...base, rows };
      }
      case 'catalog':
        return { ...base, rows: itemRepo.listAll() };
      case 'item': {
        const item = itemRepo.getById(id) ?? itemRepo.getBySlug(id);
        if (!item) throw notFound(`Ítem no encontrado: ${id}`);
        return { ...base, item, entries: inventoryRepo.listByItem(item.id) };
      }
      case 'enchantments':
        return { ...base, rows: enchantmentRepo.listAll() };
      case 'build': {
        const build = buildRepo.getById(id);
        if (!build) throw notFound(`Build no encontrada: ${id}`);
        return { ...base, build };
      }
      case 'builds':
        return { ...base, rows: buildRepo.listAll() };
      case 'tierlist': {
        const tierList = tierListRepo.getById(id);
        if (!tierList) throw notFound(`Tier list no encontrada: ${id}`);
        return { ...base, tierList };
      }
      case 'comparison': {
        const comparison = comparisonRepo.getById(id);
        if (!comparison) throw notFound(`Comparación no encontrada: ${id}`);
        const names = comparison.kind === 'builds'
          ? Object.fromEntries(buildRepo.listAll().map((b) => [b.id, b.name]))
          : {};
        return { ...base, comparison, names };
      }
      case 'profile':
        return {
          ...base,
          profile: profileRepo.ensure(),
          stats: await statsService.summary(),
        };
      case 'backup': {
        const { rows: inventoryJoined } = inventoryRepo.listJoined({ limit: 100000, offset: 0 });
        return {
          ...base,
          tables: {
            items: itemRepo.listAll(),
            inventory_entries: inventoryRepo.listAll(),
            inventoryJoined,
            enchantments: enchantmentRepo.listAll(),
            builds: buildRepo.listAll(),
            tier_lists: tierListRepo.listAll(),
            profile: profileRepo.get(),
            table_views: tableViewRepo.list({ limit: 100000 }).rows,
            saved_comparisons: comparisonRepo.list({ limit: 100000 }).rows,
          },
        };
      }
      default:
        throw badRequest(`Tipo de exportación desconocido: ${type}`);
    }
  }

  return {
    /**
     * @returns {Promise<{buffer:Buffer, fileName:string, mime:string}>}
     */
    async exportFile(type, id, format, filters = {}) {
      if (!VALID_TYPES.has(type)) {
        throw badRequest(`Tipo de exportación desconocido: ${type}`);
      }
      if (WITH_ID.has(type) && !id) {
        throw badRequest(`El tipo '${type}' requiere id: /api/export/${type}/<id>`);
      }
      const dataset = await datasetFor(type, id, filters);
      const result = await exportFile(type, format, dataset, { name: id });
      exportHistoryRepo.create({
        exportType: id ? `${type}/${id}` : type,
        format: format || 'json',
        params: filters,
        fileName: result.fileName,
      });
      return result;
    },

    /** Documento de backup (para depuración / tests). */
    backupDocument() {
      return buildBackup({
        items: itemRepo.listAll(),
        inventory_entries: inventoryRepo.listAll(),
        enchantments: enchantmentRepo.listAll(),
        builds: buildRepo.listAll(),
        tier_lists: tierListRepo.listAll(),
        profile: profileRepo.get(),
        table_views: tableViewRepo.list({ limit: 100000 }).rows,
        saved_comparisons: comparisonRepo.list({ limit: 100000 }).rows,
      });
    },

    history(limit) { return exportHistoryRepo.list(limit); },
  };
}
