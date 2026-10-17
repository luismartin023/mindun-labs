-- MINDUN LABS — Esquema SQLite (node:sqlite). Migración 001.
-- Convención: campos JSON almacenan arrays/objetos del modelo de dominio.
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

-- Catálogo de tipos de ítem (no copias poseídas)
CREATE TABLE IF NOT EXISTS items (
  id                 TEXT PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  category           TEXT NOT NULL CHECK (category IN ('melee_weapon','ranged_weapon','armor','artifact','enchantment')),
  name               TEXT NOT NULL,
  localized_name     TEXT,
  aliases            TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  rarity             TEXT NOT NULL DEFAULT 'unknown' CHECK (rarity IN ('common','rare','unique','gilded','special','unknown')),
  image_path         TEXT,
  description        TEXT,
  attributes         TEXT NOT NULL DEFAULT '[]',   -- JSON ItemAttribute[]
  passive_effects    TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  unique_effects     TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  enchantment_slots  TEXT NOT NULL DEFAULT '[]',   -- JSON ItemEnchantmentSlot[]
  tags               TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  internal_id        TEXT,
  group_of           TEXT,
  built_in_enchantment TEXT,
  accepts_soul       INTEGER,                       -- NULL desconocido / 0 / 1
  soul_requiring     INTEGER,
  combo_length       INTEGER,
  runes              TEXT NOT NULL DEFAULT '[]',    -- JSON string[]
  locations          TEXT NOT NULL DEFAULT '[]',    -- JSON string[]
  dlc                TEXT,
  source             TEXT,
  user_notes         TEXT,
  data_status        TEXT NOT NULL DEFAULT 'unverified' CHECK (data_status IN ('verified','user_entered','imported','unverified')),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_rarity ON items(rarity);
CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);

-- Copias poseídas (inventario personal)
CREATE TABLE IF NOT EXISTS inventory_entries (
  id                 TEXT PRIMARY KEY,
  item_id            TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity           INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  power_level        INTEGER,
  item_level         INTEGER,
  is_favorite        INTEGER NOT NULL DEFAULT 0,
  is_gilded          INTEGER NOT NULL DEFAULT 0,
  gilded_enchantment_id TEXT REFERENCES enchantments(id) ON DELETE SET NULL,
  selected_enchant_ids TEXT NOT NULL DEFAULT '[null,null,null]', -- JSON (string|null)[3]
  enchant_tiers      TEXT NOT NULL DEFAULT '[]',   -- JSON {enchantmentId,tier}[]
  notes              TEXT,
  source             TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory_entries(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_fav ON inventory_entries(is_favorite);

-- Catálogo de encantamientos
CREATE TABLE IF NOT EXISTS enchantments (
  id                 TEXT PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  localized_name     TEXT,
  aliases            TEXT NOT NULL DEFAULT '[]',
  enchant_type       TEXT NOT NULL DEFAULT 'unknown' CHECK (enchant_type IN ('melee','ranged','armor','artifact','universal','unknown')),
  image_path         TEXT,
  description        TEXT,
  tiers              TEXT NOT NULL DEFAULT '[]',   -- JSON {tier,text,cost}[]
  multiple_per_equipment INTEGER,
  built_into         TEXT NOT NULL DEFAULT '[]',   -- JSON string[] slugs de ítems
  gilded_description TEXT,
  source             TEXT,
  user_notes         TEXT,
  data_status        TEXT NOT NULL DEFAULT 'unverified',
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ench_type ON enchantments(enchant_type);

-- Builds guardadas
CREATE TABLE IF NOT EXISTS builds (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  goal               TEXT,
  playstyle          TEXT,
  melee_item_id      TEXT REFERENCES items(id) ON DELETE SET NULL,
  ranged_item_id     TEXT REFERENCES items(id) ON DELETE SET NULL,
  armor_item_id      TEXT REFERENCES items(id) ON DELETE SET NULL,
  artifact_item_ids  TEXT NOT NULL DEFAULT '[null,null,null]', -- JSON (string|null)[3]
  enchant_choices    TEXT NOT NULL DEFAULT '{}',   -- JSON itemId→(string|null)[3]
  weights            TEXT NOT NULL DEFAULT '{}',   -- JSON criterio→peso
  score              TEXT,                          -- JSON resultado motor
  notes              TEXT,
  is_favorite        INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','saved','archived')),
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Tier lists
CREATE TABLE IF NOT EXISTS tier_lists (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  category           TEXT NOT NULL DEFAULT 'mixed',
  criteria           TEXT,
  rows               TEXT NOT NULL DEFAULT '[]',   -- JSON {key,label,color}[]
  entries            TEXT NOT NULL DEFAULT '[]',   -- JSON {itemId,rowKey,reason,notes}[]
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Comparaciones guardadas
CREATE TABLE IF NOT EXISTS saved_comparisons (
  id                 TEXT PRIMARY KEY,
  name               TEXT,
  kind               TEXT NOT NULL DEFAULT 'items' CHECK (kind IN ('items','builds')),
  ref_ids            TEXT NOT NULL DEFAULT '[]',   -- JSON string[]
  criteria           TEXT,
  created_at         TEXT NOT NULL
);

-- Vistas de tabla guardadas
CREATE TABLE IF NOT EXISTS table_views (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  dataset            TEXT NOT NULL,                 -- inventory|catalog|enchantments|builds|tierlists
  config             TEXT NOT NULL DEFAULT '{}',   -- JSON columnas/filtros/orden
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);

-- Perfil del jugador (fila única id='profile')
CREATE TABLE IF NOT EXISTS profile (
  id                 TEXT PRIMARY KEY,
  display_name       TEXT NOT NULL DEFAULT 'Jugador',
  level              INTEGER,
  power              INTEGER,
  avatar_path        TEXT,
  notes              TEXT,
  prefs              TEXT NOT NULL DEFAULT '{}',
  last_reviewed_at   TEXT,
  updated_at         TEXT NOT NULL
);

-- Assets (imágenes) y su vínculo con ítems
CREATE TABLE IF NOT EXISTS assets (
  id                 TEXT PRIMARY KEY,
  file_name          TEXT NOT NULL,
  category           TEXT,
  mime               TEXT,
  width              INTEGER,
  height             INTEGER,
  bytes              INTEGER,
  path               TEXT NOT NULL,
  item_id            TEXT REFERENCES items(id) ON DELETE SET NULL,
  review_status      TEXT NOT NULL DEFAULT 'unmatched' CHECK (review_status IN ('confirmed','suggested','unmatched','rejected')),
  checksum           TEXT,
  created_at         TEXT NOT NULL
);

-- Historial de exportaciones
CREATE TABLE IF NOT EXISTS export_history (
  id                 TEXT PRIMARY KEY,
  export_type        TEXT NOT NULL,
  format             TEXT NOT NULL,
  params             TEXT NOT NULL DEFAULT '{}',
  file_name          TEXT,
  created_at         TEXT NOT NULL
);

-- Lotes de importación (para deshacer)
CREATE TABLE IF NOT EXISTS import_batches (
  id                 TEXT PRIMARY KEY,
  kind               TEXT NOT NULL,
  summary            TEXT NOT NULL DEFAULT '{}',
  undo_data          TEXT NOT NULL DEFAULT '{}',
  created_at         TEXT NOT NULL
);

-- Preferencias sueltas (clave-valor)
CREATE TABLE IF NOT EXISTS kv_settings (
  key                TEXT PRIMARY KEY,
  value              TEXT NOT NULL
);
