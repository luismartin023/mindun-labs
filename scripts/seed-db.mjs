/**
 * seed-db.mjs — Carga data/seed/*.json en SQLite (data/mindun.db).
 * Idempotente: INSERT OR REPLACE por slug. Uso: npm run seed
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, J, SEED_DIR } from '../server/infrastructure/db/db.js';
import { uuid, nowIso } from '../server/domain/model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const load = (name) =>
  existsSync(join(SEED_DIR, name)) ? JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8')) : [];

const items = load('items.json');
const enchants = load('enchantments.json');
const assets = load('assets-manifest.json');

const db = openDb();
const now = nowIso();
const ids = { items: 0, ench: 0, assets: 0, profile: 0 };

db.exec('BEGIN');
try {
  const itemStmt = db.prepare(`INSERT OR REPLACE INTO items (
    id, slug, category, name, localized_name, aliases, rarity, image_path,
    description, attributes, passive_effects, unique_effects, enchantment_slots,
    tags, internal_id, group_of, built_in_enchantment, accepts_soul,
    soul_requiring, combo_length, runes, locations, dlc, source, user_notes,
    data_status, created_at, updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const slugToId = new Map(
    db.prepare('SELECT id, slug FROM items').all().map((r) => [r.slug, r.id]),
  );

  for (const it of items) {
    const id = slugToId.get(it.slug) ?? uuid();
    itemStmt.run(
      id, it.slug, it.category, it.name, it.localizedName ?? null,
      J.str(it.aliases ?? []), it.rarity ?? 'unknown', it.imagePath ?? null,
      it.description ?? null, J.str(it.attributes ?? []),
      J.str(it.passiveEffects ?? []), J.str(it.uniqueEffects ?? []),
      J.str(it.enchantmentSlots ?? []), J.str(it.tags ?? []),
      it.internalId ?? null, it.groupOf ?? null, it.builtInEnchantment ?? null,
      it.acceptsSoul == null ? null : it.acceptsSoul ? 1 : 0,
      it.soulRequiring == null ? null : it.soulRequiring ? 1 : 0,
      it.comboLength ?? null, J.str(it.runes ?? []), J.str(it.locations ?? []),
      it.dlc ?? null, it.source ?? null, it.userNotes ?? null,
      it.dataStatus ?? 'imported', it.createdAt ?? now, it.updatedAt ?? now,
    );
    slugToId.set(it.slug, id);
    ids.items++;
  }

  const enchStmt = db.prepare(`INSERT OR REPLACE INTO enchantments (
    id, slug, name, localized_name, aliases, enchant_type, image_path,
    description, tiers, multiple_per_equipment, built_into, gilded_description,
    source, user_notes, data_status, created_at, updated_at
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const enchSlugToId = new Map(
    db.prepare('SELECT id, slug FROM enchantments').all().map((r) => [r.slug, r.id]),
  );
  for (const e of enchants) {
    const id = enchSlugToId.get(e.slug) ?? uuid();
    enchStmt.run(
      id, e.slug, e.name, e.localizedName ?? null, J.str(e.aliases ?? []),
      e.enchantType ?? 'unknown', e.imagePath ?? null, e.description ?? null,
      J.str(e.tiers ?? []),
      e.multiplePerEquipment == null ? null : e.multiplePerEquipment ? 1 : 0,
      J.str(e.builtInto ?? []), e.gildedDescription ?? null, e.source ?? null,
      e.userNotes ?? null, e.dataStatus ?? 'imported', e.createdAt ?? now, e.updatedAt ?? now,
    );
    enchSlugToId.set(e.slug, id);
    ids.ench++;
  }

  const assetStmt = db.prepare(`INSERT OR REPLACE INTO assets (
    id, file_name, category, mime, bytes, path, item_id, review_status, created_at
  ) VALUES (?,?,?,?,?,?,?,?,?)`);
  const assetPathToId = new Map(
    db.prepare('SELECT id, path FROM assets').all().map((r) => [r.path, r.id]),
  );
  for (const a of assets) {
    const itemId = a.itemSlug ? slugToId.get(a.itemSlug) ?? null : null;
    const mime = /\.webp$/i.test(a.fileName) ? 'image/webp' : /\.png$/i.test(a.fileName) ? 'image/png' : null;
    assetStmt.run(
      assetPathToId.get(a.path) ?? uuid(), a.fileName, a.category ?? null,
      mime, a.bytes ?? null, a.path, itemId, a.reviewStatus ?? 'confirmed', now,
    );
    ids.assets++;
  }

  db.prepare(`INSERT OR IGNORE INTO profile (id, display_name, prefs, updated_at)
              VALUES ('profile', 'Jugador', '{}', ?)`).run(now);
  ids.profile = 1;

  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

console.log(`Seed cargado: ${ids.items} ítems, ${ids.ench} encantamientos, ${ids.assets} assets, perfil OK`);
const counts = db.prepare(`SELECT category, COUNT(*) n FROM items GROUP BY category`).all();
console.log(counts);
