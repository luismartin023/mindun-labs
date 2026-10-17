/**
 * Repositorio de `items` (catálogo). Mapea filas SQL ↔ CatalogItem vía J.
 * Sin HTTP ni reglas de negocio; los filtros se traducen a WHERE parametrizado.
 */
import { J } from '../db.js';
import { slugify, uuid, nowIso } from '../../../domain/model.js';

const COLS = `id, slug, category, name, localized_name, aliases, rarity, image_path,
  description, attributes, passive_effects, unique_effects, enchantment_slots, tags,
  internal_id, group_of, built_in_enchantment, accepts_soul, soul_requiring,
  combo_length, runes, locations, dlc, source, user_notes, data_status,
  created_at, updated_at`;

const SORTABLE = {
  name: 'name COLLATE NOCASE',
  localizedName: 'localized_name COLLATE NOCASE',
  category: 'category',
  rarity: 'rarity',
  dataStatus: 'data_status',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

export function rowToItem(r) {
  if (!r) return null;
  return {
    id: r.id,
    slug: r.slug,
    category: r.category,
    name: r.name,
    localizedName: r.localized_name ?? null,
    aliases: J.parse(r.aliases, []),
    rarity: r.rarity,
    imagePath: r.image_path ?? null,
    description: r.description ?? null,
    attributes: J.parse(r.attributes, []),
    passiveEffects: J.parse(r.passive_effects, []),
    uniqueEffects: J.parse(r.unique_effects, []),
    enchantmentSlots: J.parse(r.enchantment_slots, []),
    tags: J.parse(r.tags, []),
    internalId: r.internal_id ?? null,
    groupOf: r.group_of ?? null,
    builtInEnchantment: r.built_in_enchantment ?? null,
    acceptsSoul: r.accepts_soul == null ? null : !!r.accepts_soul,
    soulRequiring: r.soul_requiring == null ? null : !!r.soul_requiring,
    comboLength: r.combo_length ?? null,
    runes: J.parse(r.runes, []),
    locations: J.parse(r.locations, []),
    dlc: r.dlc ?? null,
    source: r.source ?? null,
    userNotes: r.user_notes ?? null,
    dataStatus: r.data_status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function itemToRow(d) {
  return {
    id: d.id,
    slug: d.slug,
    category: d.category,
    name: d.name,
    localized_name: d.localizedName ?? null,
    aliases: J.str(d.aliases ?? []),
    rarity: d.rarity ?? 'unknown',
    image_path: d.imagePath ?? null,
    description: d.description ?? null,
    attributes: J.str(d.attributes ?? []),
    passive_effects: J.str(d.passiveEffects ?? []),
    unique_effects: J.str(d.uniqueEffects ?? []),
    enchantment_slots: J.str(d.enchantmentSlots ?? []),
    tags: J.str(d.tags ?? []),
    internal_id: d.internalId ?? null,
    group_of: d.groupOf ?? null,
    built_in_enchantment: d.builtInEnchantment ?? null,
    accepts_soul: d.acceptsSoul == null ? null : (d.acceptsSoul ? 1 : 0),
    soul_requiring: d.soulRequiring == null ? null : (d.soulRequiring ? 1 : 0),
    combo_length: d.comboLength ?? null,
    runes: J.str(d.runes ?? []),
    locations: J.str(d.locations ?? []),
    dlc: d.dlc ?? null,
    source: d.source ?? null,
    user_notes: d.userNotes ?? null,
    data_status: d.dataStatus ?? 'unverified',
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function buildWhere(f = {}) {
  const where = [];
  const params = [];
  if (f.search) {
    where.push(`(name LIKE ? ESCAPE '\\' OR localized_name LIKE ? ESCAPE '\\'
      OR slug LIKE ? ESCAPE '\\' OR aliases LIKE ? ESCAPE '\\')`);
    params.push(like(f.search), like(f.search), like(f.search), like(f.search));
  }
  if (f.category) { where.push('category = ?'); params.push(f.category); }
  if (f.rarity) { where.push('rarity = ?'); params.push(f.rarity); }
  if (f.dataStatus) { where.push('data_status = ?'); params.push(f.dataStatus); }
  if (f.tag) { where.push(`tags LIKE ? ESCAPE '\\'`); params.push(`%"${f.tag.replace(/[\\%_"]/g, '')}"%`); }
  if (f.owned === true) where.push('EXISTS (SELECT 1 FROM inventory_entries e WHERE e.item_id = items.id)');
  if (f.owned === false) where.push('NOT EXISTS (SELECT 1 FROM inventory_entries e WHERE e.item_id = items.id)');
  if (f.favorite === true) where.push('EXISTS (SELECT 1 FROM inventory_entries e WHERE e.item_id = items.id AND e.is_favorite = 1)');
  if (f.favorite === false) where.push('NOT EXISTS (SELECT 1 FROM inventory_entries e WHERE e.item_id = items.id AND e.is_favorite = 1)');
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

export function createItemRepository(db) {
  const stmtById = db.prepare(`SELECT ${COLS} FROM items WHERE id = ?`);
  const stmtBySlug = db.prepare(`SELECT ${COLS} FROM items WHERE slug = ?`);
  const stmtInsert = db.prepare(`INSERT INTO items (${COLS}) VALUES (
    @id, @slug, @category, @name, @localized_name, @aliases, @rarity, @image_path,
    @description, @attributes, @passive_effects, @unique_effects, @enchantment_slots,
    @tags, @internal_id, @group_of, @built_in_enchantment, @accepts_soul,
    @soul_requiring, @combo_length, @runes, @locations, @dlc, @source, @user_notes,
    @data_status, @created_at, @updated_at)`);
  const stmtUpdate = db.prepare(`UPDATE items SET
    slug = @slug, category = @category, name = @name, localized_name = @localized_name,
    aliases = @aliases, rarity = @rarity, image_path = @image_path,
    description = @description, attributes = @attributes,
    passive_effects = @passive_effects, unique_effects = @unique_effects,
    enchantment_slots = @enchantment_slots, tags = @tags, internal_id = @internal_id,
    group_of = @group_of, built_in_enchantment = @built_in_enchantment,
    accepts_soul = @accepts_soul, soul_requiring = @soul_requiring,
    combo_length = @combo_length, runes = @runes, locations = @locations,
    dlc = @dlc, source = @source, user_notes = @user_notes,
    data_status = @data_status, updated_at = @updated_at
    WHERE id = @id`);
  const stmtDelete = db.prepare('DELETE FROM items WHERE id = ?');
  const stmtCount = db.prepare('SELECT COUNT(*) AS c FROM items');
  const stmtAll = db.prepare(`SELECT ${COLS} FROM items ORDER BY name COLLATE NOCASE`);

  return {
    list(filters = {}) {
      const { sql, params } = buildWhere(filters);
      const sortCol = SORTABLE[filters.sort] || SORTABLE.name;
      const dir = filters.order === 'desc' ? 'DESC' : 'ASC';
      const total = db.prepare(`SELECT COUNT(*) AS c FROM items ${sql}`).get(...params).c;
      const limit = filters.limit ?? 50;
      const offset = filters.offset ?? 0;
      const rows = db.prepare(
        `SELECT ${COLS} FROM items ${sql} ORDER BY ${sortCol} ${dir}, name COLLATE NOCASE ASC LIMIT ? OFFSET ?`,
      ).all(...params, limit, offset);
      return { rows: rows.map(rowToItem), total };
    },

    /** Todos los ítems sin paginar (generador/scoring/importadores). */
    listAll() { return stmtAll.all().map(rowToItem); },

    getById(id) { return rowToItem(stmtById.get(id)); },
    getBySlug(slug) { return rowToItem(stmtBySlug.get(slug)); },

    create(data) {
      const now = nowIso();
      const row = itemToRow({
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
      const merged = { ...existing, ...patch, id, updatedAt: nowIso() };
      const row = itemToRow(merged);
      delete row.created_at; // node:sqlite rechaza named params ajenos al statement
      stmtUpdate.run(row);
      return this.getById(id);
    },

    remove(id) { return stmtDelete.run(id).changes > 0; },
    count() { return stmtCount.get().c; },

    /** Conteo agrupado por columna ('category'|'rarity'|'data_status'). */
    countBy(column) {
      const col = { category: 'category', rarity: 'rarity', dataStatus: 'data_status' }[column];
      if (!col) return {};
      const rows = db.prepare(`SELECT ${col} AS k, COUNT(*) AS c FROM items GROUP BY ${col}`).all();
      return Object.fromEntries(rows.map((r) => [r.k, r.c]));
    },

    /** IDs de ítems que tienen al menos una copia en inventario. */
    ownedIds() {
      return db.prepare('SELECT DISTINCT item_id AS id FROM inventory_entries').all().map((r) => r.id);
    },
  };
}
