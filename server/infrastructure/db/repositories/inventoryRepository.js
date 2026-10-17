/**
 * Repositorio de `inventory_entries` (copias poseídas).
 * listJoined() devuelve filas planas entry+item para la API de inventario.
 */
import { J } from '../db.js';
import { uuid, nowIso } from '../../../domain/model.js';

const COLS = `id, item_id, quantity, power_level, item_level, is_favorite,
  is_gilded, gilded_enchantment_id, selected_enchant_ids, enchant_tiers,
  notes, source, created_at, updated_at`;

const SORTABLE = {
  name: 'i.name COLLATE NOCASE',
  quantity: 'e.quantity',
  powerLevel: 'e.power_level',
  itemLevel: 'e.item_level',
  favorite: 'e.is_favorite',
  category: 'i.category',
  rarity: 'i.rarity',
  createdAt: 'e.created_at',
  updatedAt: 'e.updated_at',
};

export function rowToInventoryEntry(r) {
  if (!r) return null;
  return {
    id: r.id,
    itemId: r.item_id,
    quantity: r.quantity,
    powerLevel: r.power_level ?? null,
    itemLevel: r.item_level ?? null,
    isFavorite: !!r.is_favorite,
    isGilded: !!r.is_gilded,
    gildedEnchantmentId: r.gilded_enchantment_id ?? null,
    selectedEnchantIds: J.parse(r.selected_enchant_ids, [null, null, null]),
    enchantTiers: J.parse(r.enchant_tiers, []),
    notes: r.notes ?? null,
    source: r.source ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Fila plana entry+item (salida de listJoined). */
export function rowToJoined(r) {
  const entry = rowToInventoryEntry(r);
  if (!entry) return null;
  return {
    ...entry,
    itemName: r.item_name ?? null,
    itemSlug: r.item_slug ?? null,
    itemCategory: r.item_category ?? null,
    itemRarity: r.item_rarity ?? null,
    itemImage: r.item_image ?? null,
    itemLocalizedName: r.item_localized_name ?? null,
    itemEnchantmentSlots: J.parse(r.item_enchantment_slots, []),
  };
}

export function entryToRow(d) {
  return {
    id: d.id,
    item_id: d.itemId,
    quantity: d.quantity ?? 1,
    power_level: d.powerLevel ?? null,
    item_level: d.itemLevel ?? null,
    is_favorite: d.isFavorite ? 1 : 0,
    is_gilded: d.isGilded ? 1 : 0,
    gilded_enchantment_id: d.gildedEnchantmentId ?? null,
    selected_enchant_ids: J.str(d.selectedEnchantIds ?? [null, null, null]),
    enchant_tiers: J.str(d.enchantTiers ?? []),
    notes: d.notes ?? null,
    source: d.source ?? null,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function buildWhere(f = {}) {
  const where = [];
  const params = [];
  if (f.search) {
    where.push(`(i.name LIKE ? ESCAPE '\\' OR i.localized_name LIKE ? ESCAPE '\\'
      OR i.slug LIKE ? ESCAPE '\\' OR e.notes LIKE ? ESCAPE '\\')`);
    params.push(like(f.search), like(f.search), like(f.search), like(f.search));
  }
  if (f.itemId) { where.push('e.item_id = ?'); params.push(f.itemId); }
  if (f.category) { where.push('i.category = ?'); params.push(f.category); }
  if (f.rarity) { where.push('i.rarity = ?'); params.push(f.rarity); }
  if (f.favorite !== undefined) { where.push('e.is_favorite = ?'); params.push(f.favorite ? 1 : 0); }
  if (f.gilded !== undefined) { where.push('e.is_gilded = ?'); params.push(f.gilded ? 1 : 0); }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

const JOIN_SELECT = `
  SELECT e.id, e.item_id, e.quantity, e.power_level, e.item_level, e.is_favorite,
         e.is_gilded, e.gilded_enchantment_id, e.selected_enchant_ids,
         e.enchant_tiers, e.notes, e.source, e.created_at, e.updated_at,
         i.name AS item_name, i.slug AS item_slug, i.category AS item_category,
         i.rarity AS item_rarity, i.image_path AS item_image,
         i.localized_name AS item_localized_name,
         i.enchantment_slots AS item_enchantment_slots
  FROM inventory_entries e JOIN items i ON i.id = e.item_id`;

export function createInventoryRepository(db) {
  const stmtById = db.prepare(`SELECT ${COLS} FROM inventory_entries WHERE id = ?`);
  const stmtByItem = db.prepare(`SELECT ${COLS} FROM inventory_entries WHERE item_id = ? ORDER BY created_at`);
  const stmtInsert = db.prepare(`INSERT INTO inventory_entries (${COLS}) VALUES (
    @id, @item_id, @quantity, @power_level, @item_level, @is_favorite, @is_gilded,
    @gilded_enchantment_id, @selected_enchant_ids, @enchant_tiers, @notes,
    @source, @created_at, @updated_at)`);
  const stmtUpdate = db.prepare(`UPDATE inventory_entries SET
    item_id = @item_id, quantity = @quantity, power_level = @power_level,
    item_level = @item_level, is_favorite = @is_favorite, is_gilded = @is_gilded,
    gilded_enchantment_id = @gilded_enchantment_id,
    selected_enchant_ids = @selected_enchant_ids, enchant_tiers = @enchant_tiers,
    notes = @notes, source = @source, updated_at = @updated_at
    WHERE id = @id`);
  const stmtDelete = db.prepare('DELETE FROM inventory_entries WHERE id = ?');
  const stmtCount = db.prepare('SELECT COUNT(*) AS c FROM inventory_entries');
  const stmtTotals = db.prepare(`SELECT COUNT(*) AS entries,
    COALESCE(SUM(quantity), 0) AS quantity,
    COALESCE(SUM(is_favorite), 0) AS favorites,
    COALESCE(SUM(is_gilded), 0) AS gilded
    FROM inventory_entries`);

  return {
    /** Copias con campos del ítem aplanados (itemName, itemRarity, ...). */
    listJoined(criteria = {}) {
      const { sql, params } = buildWhere(criteria);
      const sortCol = SORTABLE[criteria.sort] || SORTABLE.name;
      const dir = criteria.order === 'desc' ? 'DESC' : 'ASC';
      const total = db.prepare(
        `SELECT COUNT(*) AS c FROM inventory_entries e JOIN items i ON i.id = e.item_id ${sql}`,
      ).get(...params).c;
      const rows = db.prepare(
        `${JOIN_SELECT} ${sql} ORDER BY ${sortCol} ${dir}, e.created_at ASC LIMIT ? OFFSET ?`,
      ).all(...params, criteria.limit ?? 50, criteria.offset ?? 0);
      return { rows: rows.map(rowToJoined), total };
    },

    list(criteria = {}) {
      const where = [];
      const params = [];
      if (criteria.itemId) { where.push('item_id = ?'); params.push(criteria.itemId); }
      if (criteria.favorite !== undefined) { where.push('is_favorite = ?'); params.push(criteria.favorite ? 1 : 0); }
      const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const total = db.prepare(`SELECT COUNT(*) AS c FROM inventory_entries ${sql}`).get(...params).c;
      const rows = db.prepare(
        `SELECT ${COLS} FROM inventory_entries ${sql} ORDER BY created_at LIMIT ? OFFSET ?`,
      ).all(...params, criteria.limit ?? 200, criteria.offset ?? 0);
      return { rows: rows.map(rowToInventoryEntry), total };
    },

    listAll() {
      return db.prepare(`SELECT ${COLS} FROM inventory_entries`).all().map(rowToInventoryEntry);
    },

    getById(id) { return rowToInventoryEntry(stmtById.get(id)); },
    listByItem(itemId) { return stmtByItem.all(itemId).map(rowToInventoryEntry); },

    create(data) {
      const now = nowIso();
      const row = entryToRow({
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
      const merged = { ...existing, ...patch, id, updatedAt: nowIso() };
      const row = entryToRow(merged);
      delete row.created_at; // node:sqlite rechaza named params ajenos al statement
      stmtUpdate.run(row);
      return this.getById(id);
    },

    remove(id) { return stmtDelete.run(id).changes > 0; },
    count() { return stmtCount.get().c; },

    totals() {
      const t = stmtTotals.get();
      return { entries: t.entries, quantity: t.quantity, favorites: t.favorites, gilded: t.gilded };
    },
  };
}
