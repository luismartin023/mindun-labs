/**
 * Repositorio de `enchantments` (catálogo de encantamientos).
 */
import { J } from '../db.js';
import { slugify, uuid, nowIso } from '../../../domain/model.js';

const COLS = `id, slug, name, localized_name, aliases, enchant_type, image_path,
  description, tiers, multiple_per_equipment, built_into, gilded_description,
  source, user_notes, data_status, created_at, updated_at`;

const SORTABLE = {
  name: 'name COLLATE NOCASE',
  enchantType: 'enchant_type',
  type: 'enchant_type',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

export function rowToEnchantment(r) {
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    localizedName: r.localized_name ?? null,
    aliases: J.parse(r.aliases, []),
    enchantType: r.enchant_type,
    imagePath: r.image_path ?? null,
    description: r.description ?? null,
    tiers: J.parse(r.tiers, []),
    multiplePerEquipment: r.multiple_per_equipment == null ? null : !!r.multiple_per_equipment,
    builtInto: J.parse(r.built_into, []),
    gildedDescription: r.gilded_description ?? null,
    source: r.source ?? null,
    userNotes: r.user_notes ?? null,
    dataStatus: r.data_status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function enchantmentToRow(d) {
  return {
    id: d.id,
    slug: d.slug,
    name: d.name,
    localized_name: d.localizedName ?? null,
    aliases: J.str(d.aliases ?? []),
    enchant_type: d.enchantType ?? 'unknown',
    image_path: d.imagePath ?? null,
    description: d.description ?? null,
    tiers: J.str(d.tiers ?? []),
    multiple_per_equipment: d.multiplePerEquipment == null ? null : (d.multiplePerEquipment ? 1 : 0),
    built_into: J.str(d.builtInto ?? []),
    gilded_description: d.gildedDescription ?? null,
    source: d.source ?? null,
    user_notes: d.userNotes ?? null,
    data_status: d.dataStatus ?? 'unverified',
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function createEnchantmentRepository(db) {
  const stmtById = db.prepare(`SELECT ${COLS} FROM enchantments WHERE id = ?`);
  const stmtBySlug = db.prepare(`SELECT ${COLS} FROM enchantments WHERE slug = ?`);
  const stmtInsert = db.prepare(`INSERT INTO enchantments (${COLS}) VALUES (
    @id, @slug, @name, @localized_name, @aliases, @enchant_type, @image_path,
    @description, @tiers, @multiple_per_equipment, @built_into,
    @gilded_description, @source, @user_notes, @data_status,
    @created_at, @updated_at)`);
  const stmtUpdate = db.prepare(`UPDATE enchantments SET
    slug = @slug, name = @name, localized_name = @localized_name, aliases = @aliases,
    enchant_type = @enchant_type, image_path = @image_path, description = @description,
    tiers = @tiers, multiple_per_equipment = @multiple_per_equipment,
    built_into = @built_into, gilded_description = @gilded_description,
    source = @source, user_notes = @user_notes, data_status = @data_status,
    updated_at = @updated_at
    WHERE id = @id`);
  const stmtDelete = db.prepare('DELETE FROM enchantments WHERE id = ?');
  const stmtCount = db.prepare('SELECT COUNT(*) AS c FROM enchantments');

  return {
    list(filters = {}) {
      const where = [];
      const params = [];
      if (filters.search) {
        where.push(`(name LIKE ? ESCAPE '\\' OR localized_name LIKE ? ESCAPE '\\'
          OR slug LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')`);
        const t = like(filters.search);
        params.push(t, t, t, t);
      }
      if (filters.type || filters.enchantType) {
        where.push('enchant_type = ?');
        params.push(filters.type || filters.enchantType);
      }
      if (filters.dataStatus) { where.push('data_status = ?'); params.push(filters.dataStatus); }
      const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const sortCol = SORTABLE[filters.sort] || SORTABLE.name;
      const dir = filters.order === 'desc' ? 'DESC' : 'ASC';
      const total = db.prepare(`SELECT COUNT(*) AS c FROM enchantments ${sql}`).get(...params).c;
      const rows = db.prepare(
        `SELECT ${COLS} FROM enchantments ${sql} ORDER BY ${sortCol} ${dir} LIMIT ? OFFSET ?`,
      ).all(...params, filters.limit ?? 50, filters.offset ?? 0);
      return { rows: rows.map(rowToEnchantment), total };
    },

    listAll() {
      return db.prepare(`SELECT ${COLS} FROM enchantments ORDER BY name COLLATE NOCASE`)
        .all().map(rowToEnchantment);
    },

    getById(id) { return rowToEnchantment(stmtById.get(id)); },
    getBySlug(slug) { return rowToEnchantment(stmtBySlug.get(slug)); },

    create(data) {
      const now = nowIso();
      const row = enchantmentToRow({
        ...data,
        id: data.id || uuid(),
        slug: data.slug || slugify(data.name),
        createdAt: data.createdAt || now,
        updatedAt: data.updatedAt || now,
      });
      stmtInsert.run(row);
      return this.getById(row.id);
    },

    update(id, patch) {
      const existing = this.getById(id);
      if (!existing) return null;
      const row = enchantmentToRow({ ...existing, ...patch, id, updatedAt: nowIso() });
      delete row.created_at; // node:sqlite rechaza named params ajenos al statement
      stmtUpdate.run(row);
      return this.getById(id);
    },

    remove(id) { return stmtDelete.run(id).changes > 0; },
    count() { return stmtCount.get().c; },

    countByType() {
      const rows = db.prepare(
        'SELECT enchant_type AS k, COUNT(*) AS c FROM enchantments GROUP BY enchant_type',
      ).all();
      return Object.fromEntries(rows.map((r) => [r.k, r.c]));
    },
  };
}
