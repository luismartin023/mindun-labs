/**
 * extract-wiki.mjs — Scraper de las páginas wiki guardadas en ../DATA/.
 * Genera data/seed/*.json (items, enchantments, assets-manifest, missing-images)
 * y copia las imágenes .webp locales a data/images/<categoría>/.
 * Uso: node scripts/extract-wiki.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { slugify } from '../server/domain/model.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, '..', 'DATA');
const SEED = join(ROOT, 'data', 'seed');
const IMAGES = join(ROOT, 'data', 'images');

const SOURCES = [
  {
    file: join(DATA, 'ARMADURAS', 'ARMADURAS.html'),
    filesDir: join(DATA, 'ARMADURAS', 'ARMADURAS_files'),
    kind: 'armor',
  },
  {
    file: join(DATA, 'ARMAS-MELEE', 'ARMAS-MELEE.html'),
    filesDir: join(DATA, 'ARMAS-MELEE', 'ARMAS-MELEE_files'),
    kind: 'weapons',
  },
  {
    file: join(DATA, 'ARTEFACTOS', 'ARTEFACTOS.html'),
    filesDir: join(DATA, 'ARTEFACTOS', 'ARTEFACTOS_files'),
    kind: 'artifact',
  },
  {
    file: join(DATA, 'ENCANTAMIENTOS', 'ENCANTAMIENTOS.html'),
    filesDir: join(DATA, 'ENCANTAMIENTOS', 'ENCANTAMIENTOS._files'),
    kind: 'enchantment',
  },
];

const OUT_DIR_BY_CATEGORY = {
  melee_weapon: 'melee', ranged_weapon: 'ranged', armor: 'armor',
  artifact: 'artifact', enchantment: 'enchantment',
};

const now = new Date().toISOString();
const missingImages = [];
const assetsManifest = [];
const rawLeftovers = [];

// ---------- utilidades de parsing ----------

const normHeader = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const text = ($, el) => $(el).text().replace(/\s+/g, ' ').trim();
const yesNo = (v) => (/yes|✔|true/i.test(v) ? true : /no|✖|false/i.test(v) ? false : null);

/** Devuelve los textos de <li> o, si no hay, el texto plano de la celda. */
function cellList($, cell) {
  const items = $(cell).find('li').map((_, li) => text($, li)).get().filter(Boolean);
  if (items.length) return items;
  const t = text($, cell);
  return t ? [t] : [];
}

/** Extrae { name, internalId } de la celda nombre (link + <code>). */
function nameCell($, cell) {
  const link = $(cell).find('a[title]').first();
  const name = (link.text() || text($, cell).split('\n')[0]).trim();
  const code = $(cell).find('code').first().text().trim() || null;
  return { name: name.replace(/\s+/g, ' '), internalId: code };
}

/** Índice de archivos de un _files dir: clave = nombre decodificado en minúsculas. */
const dirIndexCache = new Map();
function dirIndex(filesDir) {
  if (dirIndexCache.has(filesDir)) return dirIndexCache.get(filesDir);
  const map = new Map();
  try {
    for (const f of readdirSync(filesDir)) {
      map.set(decodeURIComponent(f).toLowerCase(), f);
      map.set(f.toLowerCase(), f);
    }
  } catch { /* dir inexistente */ }
  dirIndexCache.set(filesDir, map);
  return map;
}

/** Nombre "canónico" de la imagen a partir del nombre del ítem. */
const imageNameFor = (dataName, remote) => {
  if (dataName) return dataName.replace(/\s+/g, '_');
  const m = remote.match(/\/images\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\/revision/i);
  if (m) return decodeURIComponent(m[1]);
  return null;
};

/** Imagen de la celda icono: copia local o registra como faltante. */
function cellImage($, cell, ctx) {
  const img = $(cell).find('img').first();
  if (!img.length) return null;
  const dataName = img.attr('data-image-name') || img.attr('alt') || '';
  const src = img.attr('src') || '';
  const remote = img.attr('data-src') || src;
  const idx = dirIndex(ctx.filesDir);
  const candidates = [];
  const m = src.match(/^\.\/(.+?)$/);
  if (m) candidates.push(decodeURIComponent(basename(m[1])));
  const imgName = imageNameFor(dataName, remote);
  if (imgName) {
    candidates.push(imgName);
    candidates.push(imgName.replace(/\.(png|jpe?g|gif|svg)$/i, '.webp'));
  }
  let localFile = null;
  for (const cand of candidates) {
    const hit = idx.get(cand.toLowerCase());
    if (hit) { localFile = { fileName: hit, abs: join(ctx.filesDir, hit) }; break; }
  }
  if (!localFile && remote) {
    const outName = (imgName || `${ctx.itemSlug || 'img'}.png`)
      .replace(/\.(webp)$/i, '.png');
    missingImages.push({
      fileName: outName.replace(/[<>:"|?*]/g, '_'),
      remote, itemSlug: ctx.itemSlug || null,
      forItem: ctx.itemName, category: ctx.category,
    });
  }
  if (!localFile) return null;
  const safeName = localFile.fileName.replace(/[<>:"|?*]/g, '_');
  const outDir = join(IMAGES, OUT_DIR_BY_CATEGORY[ctx.category] || 'ui');
  mkdirSync(outDir, { recursive: true });
  const dest = join(outDir, safeName);
  if (!existsSync(dest)) copyFileSync(localFile.abs, dest);
  const relPath = `/images/${OUT_DIR_BY_CATEGORY[ctx.category] || 'ui'}/${encodeURIComponent(safeName)}`;
  assetsManifest.push({
    fileName: safeName, path: relPath, category: ctx.category,
    itemSlug: ctx.itemSlug || null, reviewStatus: 'confirmed',
  });
  return relPath;
}

/** Aplana la cabecera (th) de una wikitable → array de nombres por columna. */
function headerMap($, table) {
  const rows = $(table).find('tr').toArray();
  const grid = [];
  let headerRowCount = 0;
  for (const tr of rows.slice(0, 3)) {
    const ths = $(tr).find('th');
    if (!ths.length) break;
    headerRowCount++;
    let col = 0;
    ths.each((_, th) => {
      while (grid[col] !== undefined && grid[col].done) col++;
      const span = Number($(th).attr('colspan') || 1);
      const label = normHeader(text($, th).replace(/\[(.*?)\]/g, ''));
      for (let i = 0; i < span; i++) {
        grid[col + i] = grid[col + i]
          ? { ...grid[col + i], done: true }
          : { label, done: true };
      }
      col += span;
    });
  }
  return { cols: grid.map((g) => g?.label || ''), headerRowCount };
}

const findCol = (cols, ...names) =>
  cols.findIndex((c) => names.some((n) => c.includes(n)));

// ---------- parsers por tipo ----------

function parseGearTable($, table, ctx, category, extraTags) {
  const { cols, headerRowCount } = headerMap($, table);
  const cIcon = findCol(cols, 'icon');
  const cName = findCol(cols, 'name');
  if (cName === -1) { rawLeftovers.push({ kind: ctx.kind, section: ctx.section, cols }); return []; }
  const cGroup = findCol(cols, 'groupof');
  const cUnique = findCol(cols, 'unique');
  const cDlc = findCol(cols, 'dlcexclusive', 'dlc');
  const cSoul = findCol(cols, 'acceptssoul', 'soulrequiring');
  const cProps = findCol(cols, 'properties');
  const cBuilt = findCol(cols, 'builtinenchantment', 'builtin');
  const cCombo = findCol(cols, 'combolength', 'combo');
  const cLoc = findCol(cols, 'obtainablelocation', 'obtainablefrom');
  const cRunes = findCol(cols, 'ancienthuntrunes', 'runes');

  const out = [];
  $(table).find('tr').slice(headerRowCount).each((_, tr) => {
    const tds = $(tr).children('td').toArray();
    if (tds.length < 2) return;
    const { name, internalId } = nameCell($, tds[cName]);
    if (!name) return;
    const slug = slugify(name);
    const itemCtx = { ...ctx, category, itemName: name, itemSlug: slug };
    const runes = cRunes >= 0
      ? $(tds[cRunes]).find('img, .sprite').map((_, el) =>
          $(el).attr('alt') || $(el).attr('title') || $(el).attr('data-image-name') || ''
        ).get().filter(Boolean).map((s) => s.replace(/\s*\(MCD\).*$/i, '').trim())
      : [];
    const locations = cLoc >= 0
      ? [...new Set($(tds[cLoc]).find('a, .sprite-text')
          .map((_, el) => text($, el)).get().filter(Boolean))]
      : [];
    const unique = cUnique >= 0 ? yesNo(text($, tds[cUnique])) : null;
    const dlcTxt = cDlc >= 0 ? text($, tds[cDlc]) : '';
    const dlcNo = yesNo(dlcTxt);
    out.push({
      slug, category, name, aliases: [], localizedName: null,
      rarity: unique ? 'unique' : 'common',
      imagePath: cIcon >= 0 && tds[cIcon] ? cellImage($, tds[cIcon], itemCtx) : null,
      description: null,
      attributes: [], tags: extraTags,
      internalId,
      groupOf: cGroup >= 0 ? text($, tds[cGroup]) || null : null,
      builtInEnchantment: cBuilt >= 0 ? text($, tds[cBuilt]) || null : null,
      acceptsSoul: cSoul >= 0 ? yesNo(text($, tds[cSoul])) : null,
      comboLength: cCombo >= 0 ? (Number(text($, tds[cCombo])) || null) : null,
      runes, locations,
      dlc: dlcNo === false ? null : (dlcTxt && dlcNo !== true ? dlcTxt : (dlcNo === true ? 'DLC' : null)),
      passiveEffects: cProps >= 0 ? cellList($, tds[cProps]) : [],
      uniqueEffects: [],
      enchantmentSlots: [],
      source: 'minecraft.wiki (página local)',
      dataStatus: 'imported',
    });
  });
  return out;
}

function parseEnchantTable($, table, ctx, enchantType, extraTags) {
  const { cols, headerRowCount } = headerMap($, table);
  const cName = findCol(cols, 'name');
  if (cName === -1) { rawLeftovers.push({ kind: ctx.kind, section: ctx.section, cols }); return []; }
  const cIcon = findCol(cols, 'icon');
  const cDesc = findCol(cols, 'ingamedescription', 'description');
  const cTierText = findCol(cols, 'tiertext');
  const cMob = findCol(cols, 'mobobtainablity', 'mobobtainability');
  const cMulti = findCol(cols, 'multipleperequipment', 'multipleper');
  const cBuilt = findCol(cols, 'built-into', 'builtin');
  const cGilded = findCol(cols, 'gilded', 'uniquedescription');
  const cCost = findCol(cols, 'cost');
  const cTier = findCol(cols, 'tier'); // padre de I/II/III cuando hay colspan

  const out = [];
  $(table).find('tr').slice(headerRowCount).each((_, tr) => {
    const tds = $(tr).children('td').toArray();
    if (tds.length < 3) return;
    const { name, internalId } = nameCell($, tds[cName]);
    if (!name) return;
    const slug = slugify(name);
    const itemCtx = { ...ctx, category: 'enchantment', itemName: name, itemSlug: slug };
    // columnas de tier: si 'tier' era un colspan, las celdas I/II/III quedan
    // a continuación de cTierText; heurística: tomar 3 celdas tras tierText
    const tiers = [];
    let tierStart = cTierText >= 0 ? cTierText + 1 : -1;
    for (let i = 0; i < 3 && tierStart > 0 && tds[tierStart + i]; i++) {
      const v = text($, tds[tierStart + i]);
      if (v) tiers.push({ tier: i + 1, text: v });
    }
    const builtInto = cBuilt >= 0
      ? $(tds[cBuilt]).find('a').map((_, a) => {
          const t = ($(a).attr('title') || $(a).text()).replace(/^Minecraft Dungeons:/, '');
          return slugify(t);
        }).get().filter(Boolean)
      : [];
    out.push({
      slug, name, localizedName: null, aliases: [],
      enchantType,
      imagePath: cIcon >= 0 && tds[cIcon] ? cellImage($, tds[cIcon], itemCtx) : null,
      description: cDesc >= 0 ? cellList($, tds[cDesc]).join(' ') || null : null,
      tiers,
      multiplePerEquipment: cMulti >= 0 ? yesNo(text($, tds[cMulti])) : null,
      builtInto,
      gildedDescription: cGilded >= 0 ? text($, tds[cGilded]) || null : null,
      attributes: cCost >= 0 && text($, tds[cCost]) ? [{ label: 'Coste', value: text($, tds[cCost]) }] : [],
      mobObtainable: cMob >= 0 ? yesNo(text($, tds[cMob])) : null,
      tags: extraTags, internalId,
      source: 'minecraft.wiki (página local)',
      dataStatus: 'imported',
    });
  });
  return out;
}

// ---------- secciones → contexto ----------

function sectionContext(kind, h2, h3) {
  const s = (h3 || h2 || '').toLowerCase();
  const h = (h2 || '').toLowerCase();
  if (kind === 'weapons') {
    if (h.includes('ranged')) {
      const sub = s.includes('crossbow') ? 'crossbows' : s.includes('bow') ? 'bows'
        : s.includes('ammo') ? 'ammo' : s.includes('submerged') ? 'submerged-projectiles' : 'ranged';
      return { category: 'ranged_weapon', tags: [sub] };
    }
    if (h.includes('melee')) {
      if (s.includes('combo')) return null; // tabla descriptiva de combos, saltar
      const tag = s.includes('daily trial') ? 'daily-trial'
        : s.includes('unobtainable') ? 'unobtainable'
        : s.includes('apocalypse') ? 'apocalypse'
        : s.includes('adventure') ? 'adventure' : 'default';
      return { category: 'melee_weapon', tags: [tag] };
    }
    return null;
  }
  if (kind === 'armor') {
    if (/history|gallery|trivia|see also|references|usage|descriptions/.test(s + h)) return null;
    const tag = s.includes('daily trial') ? 'daily-trial'
      : s.includes('unobtainable') || s.includes('unused') ? 'unobtainable'
      : s.includes('apocalypse') ? 'apocalypse'
      : s.includes('adventure') ? 'adventure'
      : s.includes('event') ? 'event' : 'default';
    return { category: 'armor', tags: [tag] };
  }
  if (kind === 'artifact') {
    const m = [
      [/damaging/i, 'damaging'], [/status-inflicting/i, 'status'],
      [/quiver|arrow/i, 'quiver'], [/summoning/i, 'summoning'],
      [/agility/i, 'agility'], [/defensive|healing|cooperative/i, 'defensive-healing'],
      [/unobtainable/i, 'unobtainable'],
    ];
    const hit = m.find(([re]) => re.test(s));
    if (!hit) return null;
    return { category: 'artifact', tags: [hit[1]] };
  }
  if (kind === 'enchantment') {
    if (h.includes('list of enchantments')) {
      if (s === 'melee') return { category: 'enchantment', enchantType: 'melee', tags: [] };
      if (s === 'ranged') return { category: 'enchantment', enchantType: 'ranged', tags: [] };
      if (s === 'armor') return { category: 'enchantment', enchantType: 'armor', tags: [] };
      if (s === 'exclusive') return { category: 'enchantment', enchantType: 'universal', tags: ['exclusive'] };
      if (s.includes('mob-exclusive')) return { category: 'enchantment', enchantType: 'unknown', tags: ['mob-exclusive'] };
      if (s === 'unused') return { category: 'enchantment', enchantType: 'unknown', tags: ['unused'] };
    }
    return null;
  }
  return null;
}

// ---------- main ----------

const allItems = [];
const allEnchants = [];

for (const src of SOURCES) {
  const html = readFileSync(src.file, 'utf8');
  const $ = cheerio.load(html);
  const content = $('.mw-parser-output');
  let h2 = '', h3 = '';
  content.find('h2, h3, table.wikitable').each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (tag === 'h2') { h2 = text($, el).replace(/\[\]/g, ''); h3 = ''; return; }
    if (tag === 'h3') { h3 = text($, el).replace(/\[\]/g, ''); return; }
    const ctx = sectionContext(src.kind, h2, h3);
    if (!ctx) return;
    const parseCtx = { kind: src.kind, filesDir: src.filesDir, section: h3 || h2 };
    if (src.kind === 'enchantment') {
      allEnchants.push(...parseEnchantTable($, el, parseCtx, ctx.enchantType, ctx.tags));
    } else {
      allItems.push(...parseGearTable($, el, parseCtx, ctx.category, ctx.tags));
    }
  });
  console.log(`${src.kind}: acumulado items=${allItems.length} enchants=${allEnchants.length}`);
}

// dedupe por slug (un mismo ítem puede aparecer en varias secciones)
const dedupe = (arr) => {
  const map = new Map();
  for (const it of arr) {
    if (!map.has(it.slug)) map.set(it.slug, it);
    else {
      const prev = map.get(it.slug);
      map.set(it.slug, {
        ...prev,
        tags: [...new Set([...(prev.tags || []), ...(it.tags || [])])],
        imagePath: prev.imagePath || it.imagePath,
        locations: [...new Set([...(prev.locations || []), ...(it.locations || [])])],
        runes: [...new Set([...(prev.runes || []), ...(it.runes || [])])],
      });
    }
  }
  return [...map.values()];
};

const items = dedupe(allItems).map((it) => ({
  ...it, createdAt: now, updatedAt: now,
}));
const enchantments = dedupe(allEnchants).map((it) => ({
  ...it, createdAt: now, updatedAt: now,
}));

mkdirSync(SEED, { recursive: true });
writeFileSync(join(SEED, 'items.json'), JSON.stringify(items, null, 2));
writeFileSync(join(SEED, 'enchantments.json'), JSON.stringify(enchantments, null, 2));
writeFileSync(join(SEED, 'assets-manifest.json'), JSON.stringify(dedupeAssets(assetsManifest), null, 2));
writeFileSync(join(SEED, 'missing-images.json'), JSON.stringify(missingImages, null, 2));
writeFileSync(join(SEED, '_raw-leftovers.json'), JSON.stringify(rawLeftovers, null, 2));

function dedupeAssets(list) {
  const map = new Map();
  for (const a of list) { const k = a.path; if (!map.has(k)) map.set(k, a); }
  return [...map.values()];
}

const byCat = items.reduce((acc, i) => ((acc[i.category] = (acc[i.category] || 0) + 1), acc), {});
console.log('\n=== RESULTADO ===');
console.log('Items:', items.length, byCat);
console.log('Encantamientos:', enchantments.length);
console.log('Assets copiados:', dedupeAssets(assetsManifest).length);
console.log('Imágenes faltantes:', missingImages.length);
console.log('Tablas no parseadas:', rawLeftovers.length);
