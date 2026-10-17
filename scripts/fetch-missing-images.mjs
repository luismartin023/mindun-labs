/**
 * fetch-missing-images.mjs — Descarga las imágenes que la página guardada no
 * incluyó localmente (static.wikia.nocookie.net) y actualiza los seeds.
 * Uso: node scripts/fetch-missing-images.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = join(ROOT, 'data', 'seed');
const IMAGES = join(ROOT, 'data', 'images');
const OUT_DIR = {
  melee_weapon: 'melee', ranged_weapon: 'ranged', armor: 'armor',
  artifact: 'artifact', enchantment: 'enchantment',
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const CONCURRENCY = 6;

const missing = JSON.parse(readFileSync(join(SEED, 'missing-images.json'), 'utf8'));
const items = JSON.parse(readFileSync(join(SEED, 'items.json'), 'utf8'));
const enchants = JSON.parse(readFileSync(join(SEED, 'enchantments.json'), 'utf8'));

const results = { ok: 0, fail: 0, skipped: 0, failed: [] };

async function download(entry) {
  const dir = OUT_DIR[entry.category] || 'ui';
  const dest = join(IMAGES, dir, entry.fileName);
  if (existsSync(dest)) { results.skipped++; return relPath(dir, entry.fileName); }
  try {
    const res = await fetch(entry.remote, { headers: { 'User-Agent': UA, Referer: 'https://minecraft.fandom.com/' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) throw new Error('respuesta demasiado pequeña');
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    results.ok++;
    return relPath(dir, entry.fileName);
  } catch (err) {
    results.fail++;
    results.failed.push({ ...entry, error: err.message });
    return null;
  }
}

const relPath = (dir, name) => `/images/${dir}/${encodeURIComponent(name)}`;

// dedupe por destino
const unique = new Map();
for (const m of missing) {
  const key = `${m.category}/${m.fileName}`;
  if (!unique.has(key)) unique.set(key, m);
  else unique.get(key).itemSlugs = [...(unique.get(key).itemSlugs || [unique.get(key).itemSlug]), m.itemSlug];
}
const queue = [...unique.values()];
console.log(`Descargando ${queue.length} imágenes (de ${missing.length} referencias)…`);

for (let i = 0; i < queue.length; i += CONCURRENCY) {
  await Promise.all(queue.slice(i, i + CONCURRENCY).map(async (entry) => {
    const path = await download(entry);
    if (!path) return;
    const slugs = entry.itemSlugs || [entry.itemSlug];
    for (const slug of slugs) {
      const it = items.find((x) => x.slug === slug && x.category === entry.category);
      if (it && !it.imagePath) it.imagePath = path;
      const en = enchants.find((x) => x.slug === slug);
      if (en && !en.imagePath) en.imagePath = path;
    }
  }));
  process.stdout.write(`\r${Math.min(i + CONCURRENCY, queue.length)}/${queue.length}`);
}

writeFileSync(join(SEED, 'items.json'), JSON.stringify(items, null, 2));
writeFileSync(join(SEED, 'enchantments.json'), JSON.stringify(enchants, null, 2));
writeFileSync(join(SEED, 'missing-images-report.json'), JSON.stringify(results.failed, null, 2));
console.log(`\nOK: ${results.ok} · omitidas: ${results.skipped} · fallos: ${results.fail}`);
if (results.failed.length) console.log('Ver data/seed/missing-images-report.json');
