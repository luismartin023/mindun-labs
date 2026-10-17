/**
 * seed-demo.mjs — Datos de DEMOSTRACIÓN: copias de inventario y perfil de
 * ejemplo claramente marcados (source='demo', nota 'DEMO'). Pensado para
 * revisar la UI antes de registrar el inventario real.
 * Uso: npm run demo        → inserta
 *      npm run demo:clear  → borra solo lo demo
 */
import { openDb } from '../server/infrastructure/db/db.js';
import { uuid, nowIso } from '../server/domain/model.js';

const db = openDb();
const clear = process.argv.includes('--clear');

if (clear) {
  const r = db.prepare(`DELETE FROM inventory_entries WHERE source = 'demo'`).run();
  db.prepare(`UPDATE profile SET level = NULL, power = NULL,
              prefs = json_remove(prefs, '$.equipped'), updated_at = ?`).run(new Date().toISOString());
  console.log(`Demo eliminada (${r.changes} copias)`);
  process.exit(0);
}

const slug2id = new Map(db.prepare('SELECT slug, id FROM items').all().map((r) => [r.slug, r.id]));
const ench2id = new Map(db.prepare('SELECT slug, id FROM enchantments').all().map((r) => [r.slug, r.id]));

// Copias de ejemplo inspiradas en la captura de referencia
const DEMO = [
  { slug: 'ember-robe', power: 76, level: 68, ench: ['fire-aspect', 'burning', 'cool-down'] },
  { slug: 'heartstealer', power: 70, ench: ['committed'] },
  { slug: 'whispering-spear', power: 70, ench: [] },
  { slug: 'moon-daggers', power: 76, ench: ['enigma-resonator'] },
  { slug: 'fangs-of-frost', power: 69, ench: [] },
  { slug: 'twin-bow', power: 64, ench: ['bonus-shot'] },
  { slug: 'fireworks-arrow', power: 47, ench: [] },
  { slug: 'imploding-crossbow', power: 64, ench: [] },
  { slug: 'grim-armor', power: 58, ench: [] },
  { slug: 'wither-armor', power: 59, ench: [] },
  { slug: 'souldancer-robe', power: 64, ench: [] },
  { slug: 'ghost-cloak', power: 73 },
  { slug: 'death-cap-mushroom', power: 71 },
  { slug: 'iron-hide-amulet', power: 63 },
  { slug: 'boots-of-swiftness', power: 75 },
  { slug: 'lightning-rod', power: 55 },
  { slug: 'gong-of-weakening', power: 71 },
];

const now = nowIso();
const ins = db.prepare(`INSERT INTO inventory_entries
  (id, item_id, quantity, power_level, item_level, is_favorite, is_gilded,
   selected_enchant_ids, notes, source, created_at, updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

let added = 0;
db.exec('BEGIN');
for (const d of DEMO) {
  const itemId = slug2id.get(d.slug);
  if (!itemId) { console.warn(`slug no encontrado: ${d.slug}`); continue; }
  const enchIds = [0, 1, 2].map((i) => ench2id.get(d.ench?.[i]) ?? null);
  ins.run(uuid(), itemId, 1, d.power ?? null, d.level ?? null, 0, 0,
    JSON.stringify(enchIds), 'DEMO — datos de demostración', 'demo', now, now);
  added++;
}
db.prepare(`UPDATE profile SET level = 68, power = 69,
            prefs = json_set(COALESCE(prefs,'{}'), '$.equipped', json('{"melee":null,"ranged":null,"armor":null,"art1":null,"art2":null,"art3":null}')),
            updated_at = ? WHERE id = 'profile'`).run(now);
db.exec('COMMIT');
console.log(`Demo insertada: ${added} copias (source='demo'). Borra con: node scripts/seed-demo.mjs --clear`);
