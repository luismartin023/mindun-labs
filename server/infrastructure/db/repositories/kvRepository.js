/**
 * Repositorio de `kv_settings` (preferencias sueltas clave→valor JSON).
 */
import { J } from '../db.js';

export function createKvRepository(db) {
  const stmtGet = db.prepare('SELECT value FROM kv_settings WHERE key = ?');
  const stmtSet = db.prepare(`INSERT INTO kv_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  const stmtDel = db.prepare('DELETE FROM kv_settings WHERE key = ?');
  const stmtAll = db.prepare('SELECT key, value FROM kv_settings');

  return {
    get(key, fallback = null) {
      const row = stmtGet.get(key);
      return row ? J.parse(row.value, fallback) : fallback;
    },
    set(key, value) { stmtSet.run(key, J.str(value)); },
    remove(key) { return stmtDel.run(key).changes > 0; },
    all() {
      return Object.fromEntries(stmtAll.all().map((r) => [r.key, J.parse(r.value, null)]));
    },
  };
}
