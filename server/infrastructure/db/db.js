import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(__dirname, '..', '..', '..', 'data');
export const DB_PATH = join(DATA_DIR, 'mindun.db');
export const IMAGES_DIR = join(DATA_DIR, 'images');
export const SEED_DIR = join(DATA_DIR, 'seed');

/** Abre (o crea) la base SQLite y aplica migraciones pendientes. */
export function openDb(dbPath = DB_PATH) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  migrate(db);
  return db;
}

/** Aplica schema.sql de forma idempotente + migraciones numeradas de ./migrations/. */
export function migrate(db) {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  db.exec(`INSERT OR IGNORE INTO schema_migrations (version, applied_at)
           VALUES (1, '${new Date().toISOString()}')`);
  const migDir = join(__dirname, 'migrations');
  let files = [];
  try { files = readdirSync(migDir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort(); }
  catch { /* sin carpeta todavía */ }
  const applied = new Set(
    db.prepare('SELECT version FROM schema_migrations').all().map((r) => r.version),
  );
  for (const file of files) {
    const version = Number(file.split('_')[0]);
    if (applied.has(version)) continue;
    db.exec('BEGIN');
    try {
      db.exec(readFileSync(join(migDir, file), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(version, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migración ${file} falló: ${err.message}`);
    }
  }
}

/** Helpers de (des)serialización JSON columnas ↔ dominio. */
export const J = Object.freeze({
  parse: (text, fallback) => {
    if (text == null) return fallback;
    try { return JSON.parse(text); } catch { return fallback; }
  },
  str: (value) => JSON.stringify(value ?? null),
});
