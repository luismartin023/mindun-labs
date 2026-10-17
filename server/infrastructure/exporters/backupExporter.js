/**
 * Backup JSON completo de la base de datos (formato documentado v1).
 */
import { nowIso } from '../../domain/model.js';

export const BACKUP_SCHEMA_VERSION = 1;

/**
 * @param {object} tables {items, inventory_entries, enchantments, builds,
 *   tier_lists, profile, table_views, saved_comparisons}
 * @returns {object} documento de backup
 */
export function buildBackup(tables) {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    app: 'mindun-labs',
    exportedAt: nowIso(),
    tables: {
      items: tables.items ?? [],
      inventory_entries: tables.inventory_entries ?? [],
      enchantments: tables.enchantments ?? [],
      builds: tables.builds ?? [],
      tier_lists: tables.tier_lists ?? [],
      profile: tables.profile ?? null,
      table_views: tables.table_views ?? [],
      saved_comparisons: tables.saved_comparisons ?? [],
    },
  };
}
