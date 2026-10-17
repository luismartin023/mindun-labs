/**
 * Normalizador de reportes: convierte datasets de dominio en una forma
 * neutra { title, subtitle, tables[], ficha[] } que consumen txt/xlsx/pdf.
 * Sin dependencias de render — compartido por los tres formatos.
 */
import { CATEGORY_LABELS, RARITY_LABELS } from '../../domain/model.js';

const cat = (c) => CATEGORY_LABELS[c] || c || '—';
const rar = (r) => RARITY_LABELS[r] || r || '—';
const bool = (b) => (b ? 'Sí' : 'No');
const list = (a) => (Array.isArray(a) && a.length ? a.join(' · ') : null);
const enchList = (ids, byId) =>
  (Array.isArray(ids) ? ids : [])
    .filter(Boolean)
    .map((id) => byId?.[id]?.name || byId?.[id]?.localizedName || id)
    .join(' | ') || null;

const C = (key, label, width) => ({ key, label, width });
const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));

/**
 * @param {string} type    inventory|catalog|item|enchantments|build|builds|
 *                         tierlist|comparison|profile|backup
 * @param {object} dataset datos ya resueltos por exportService
 * @returns {{title:string, subtitle:string, recordCount:number,
 *            tables:Array, ficha:Array}}
 */
export function buildReport(type, dataset = {}) {
  const { itemsById = {}, enchantsById = {}, generatedAt, filters } = dataset;
  const report = {
    title: 'Exportación',
    subtitle: `Generado: ${generatedAt || new Date().toISOString()}`,
    recordCount: 0,
    tables: [],
    ficha: [],
  };
  if (filters && Object.keys(filters).length) {
    report.subtitle += ` · Filtros: ${JSON.stringify(filters)}`;
  }

  switch (type) {
    case 'inventory': {
      report.title = 'Inventario — MINDUN LABS';
      const rows = dataset.rows || [];
      report.recordCount = rows.length;
      report.tables.push({
        name: 'Inventario',
        columns: [
          C('itemName', 'Nombre', 30), C('itemRarity', 'Rareza', 14),
          C('itemCategory', 'Categoría', 18), C('quantity', 'Cantidad', 10),
          C('powerLevel', 'Poder', 8), C('itemLevel', 'Nivel', 8),
          C('isFavorite', 'Favorito', 9), C('isGilded', 'Dorado', 8),
          C('enchants', 'Encantamientos', 40), C('notes', 'Notas', 30),
        ],
        rows: rows.map((e) => compact({
          itemName: e.itemName, itemRarity: rar(e.itemRarity),
          itemCategory: cat(e.itemCategory), quantity: e.quantity,
          powerLevel: e.powerLevel, itemLevel: e.itemLevel,
          isFavorite: bool(e.isFavorite), isGilded: bool(e.isGilded),
          enchants: enchList(e.selectedEnchantIds, enchantsById),
          notes: e.notes,
        })),
      });
      break;
    }

    case 'catalog': {
      report.title = 'Catálogo de ítems — MINDUN LABS';
      const rows = dataset.rows || [];
      report.recordCount = rows.length;
      report.tables.push({
        name: 'Catálogo',
        columns: [
          C('name', 'Nombre', 30), C('category', 'Categoría', 18),
          C('rarity', 'Rareza', 14), C('tags', 'Etiquetas', 22),
          C('locations', 'Ubicaciones', 40), C('dlc', 'DLC', 18),
          C('dataStatus', 'Estado', 12),
        ],
        rows: rows.map((i) => compact({
          name: i.localizedName ? `${i.name} (${i.localizedName})` : i.name,
          category: cat(i.category), rarity: rar(i.rarity),
          tags: list(i.tags), locations: list(i.locations),
          dlc: i.dlc, dataStatus: i.dataStatus,
        })),
      });
      break;
    }

    case 'enchantments': {
      report.title = 'Encantamientos — MINDUN LABS';
      const rows = dataset.rows || [];
      report.recordCount = rows.length;
      report.tables.push({
        name: 'Encantamientos',
        columns: [
          C('name', 'Nombre', 28), C('enchantType', 'Tipo', 12),
          C('description', 'Descripción', 60), C('tiers', 'Tiers', 40),
          C('builtInto', 'Incorporado en', 30),
        ],
        rows: rows.map((e) => compact({
          name: e.name, enchantType: e.enchantType, description: e.description,
          tiers: (e.tiers || []).map((t) => `T${t.tier}: ${t.text}`).join(' | ') || null,
          builtInto: list(e.builtInto),
        })),
      });
      break;
    }

    case 'item': {
      const i = dataset.item || {};
      report.title = `Ficha de ítem — ${i.name || ''}`;
      report.recordCount = 1;
      report.ficha = [
        ['Nombre', i.name], ['Nombre localizado', i.localizedName],
        ['Categoría', cat(i.category)], ['Rareza', rar(i.rarity)],
        ['Descripción', i.description],
        ['Efectos pasivos', list(i.passiveEffects)],
        ['Efectos únicos', list(i.uniqueEffects)],
        ['Encantamiento fijo', i.builtInEnchantment],
        ['Acepta almas', i.acceptsSoul == null ? null : bool(i.acceptsSoul)],
        ['Runas', list(i.runes)], ['Ubicaciones', list(i.locations)],
        ['DLC', i.dlc], ['Etiquetas', list(i.tags)],
        ['Estado del dato', i.dataStatus], ['Fuente', i.source],
        ['Notas', i.userNotes],
      ].filter(([, v]) => v != null && v !== '');
      const slots = i.enchantmentSlots || [];
      if (slots.length) {
        report.tables.push({
          name: 'Opciones de encantamiento',
          columns: [C('slot', 'Slot', 8), C('options', 'Opciones', 60)],
          rows: slots.map((s) => ({
            slot: s.slotIndex,
            options: (s.options || [])
              .map((o) => enchantsById[o.enchantmentId]?.name || o.enchantmentId)
              .join(' | '),
          })),
        });
      }
      const entries = dataset.entries || [];
      if (entries.length) {
        report.tables.push({
          name: 'Copias en inventario',
          columns: [
            C('quantity', 'Cantidad', 10), C('powerLevel', 'Poder', 8),
            C('itemLevel', 'Nivel', 8), C('isFavorite', 'Favorito', 9),
            C('enchants', 'Encantamientos', 40), C('notes', 'Notas', 30),
          ],
          rows: entries.map((e) => compact({
            quantity: e.quantity, powerLevel: e.powerLevel,
            itemLevel: e.itemLevel, isFavorite: bool(e.isFavorite),
            enchants: enchList(e.selectedEnchantIds, enchantsById), notes: e.notes,
          })),
        });
      }
      break;
    }

    case 'build':
    case 'builds': {
      const builds = type === 'build' ? [dataset.build] : (dataset.rows || []);
      report.title = type === 'build'
        ? `Build — ${dataset.build?.name || ''}`
        : 'Builds — MINDUN LABS';
      report.recordCount = builds.filter(Boolean).length;
      if (type === 'build' && dataset.build) {
        const b = dataset.build;
        const name = (id) => (id ? (itemsById[id]?.name || id) : null);
        report.ficha = [
          ['Nombre', b.name], ['Objetivo', b.goal], ['Estilo', b.playstyle],
          ['Melee', name(b.meleeItemId)], ['Distancia', name(b.rangedItemId)],
          ['Armadura', name(b.armorItemId)],
          ['Artefactos', (b.artifactItemIds || []).filter(Boolean).map(name).join(' | ') || null],
          ['Puntuación', b.score?.total ?? null],
          ['Estado', b.status], ['Favorita', bool(b.isFavorite)],
          ['Notas', b.notes],
        ].filter(([, v]) => v != null && v !== '');
      } else {
        report.tables.push({
          name: 'Builds',
          columns: [
            C('name', 'Nombre', 26), C('goal', 'Objetivo', 16),
            C('melee', 'Melee', 24), C('ranged', 'Distancia', 24),
            C('armor', 'Armadura', 24), C('artifacts', 'Artefactos', 40),
            C('isFavorite', 'Favorita', 9), C('status', 'Estado', 10),
          ],
          rows: builds.filter(Boolean).map((b) => compact({
            name: b.name, goal: b.goal,
            melee: b.meleeItemId ? (itemsById[b.meleeItemId]?.name || b.meleeItemId) : null,
            ranged: b.rangedItemId ? (itemsById[b.rangedItemId]?.name || b.rangedItemId) : null,
            armor: b.armorItemId ? (itemsById[b.armorItemId]?.name || b.armorItemId) : null,
            artifacts: (b.artifactItemIds || []).filter(Boolean)
              .map((id) => itemsById[id]?.name || id).join(' | ') || null,
            isFavorite: bool(b.isFavorite), status: b.status,
          })),
        });
      }
      break;
    }

    case 'tierlist': {
      const t = dataset.tierList || {};
      report.title = `Tier List — ${t.name || ''}`;
      const rows = t.rows || [];
      const entries = t.entries || [];
      report.recordCount = entries.length;
      report.ficha = [
        ['Nombre', t.name], ['Categoría', t.category === 'mixed' ? 'Mixta' : cat(t.category)],
        ['Criterios', t.criteria],
      ].filter(([, v]) => v != null && v !== '');
      const rowLabel = Object.fromEntries(rows.map((r) => [r.key, r.label || r.key]));
      report.tables.push({
        name: 'Entradas',
        columns: [
          C('row', 'Fila', 8), C('item', 'Ítem', 34),
          C('reason', 'Motivo', 40), C('notes', 'Notas', 30),
        ],
        rows: entries.map((e) => compact({
          row: rowLabel[e.rowKey] || e.rowKey,
          item: itemsById[e.itemId]?.name || e.itemId,
          reason: e.reason, notes: e.notes,
        })),
      });
      break;
    }

    case 'comparison': {
      const c = dataset.comparison || {};
      report.title = `Comparación — ${c.name || c.kind || ''}`;
      const refs = c.refIds || [];
      report.recordCount = refs.length;
      report.ficha = [
        ['Nombre', c.name], ['Tipo', c.kind], ['Criterios', c.criteria],
      ].filter(([, v]) => v != null && v !== '');
      report.tables.push({
        name: 'Elementos comparados',
        columns: [C('ref', 'Elemento', 40), C('kind', 'Tipo', 12)],
        rows: refs.map((id) => ({
          ref: itemsById[id]?.name || dataset.names?.[id] || id,
          kind: c.kind,
        })),
      });
      break;
    }

    case 'profile': {
      const p = dataset.profile || {};
      const s = dataset.stats || {};
      report.title = 'Perfil del jugador — MINDUN LABS';
      report.recordCount = 1;
      report.ficha = [
        ['Nombre', p.displayName], ['Nivel', p.level], ['Poder', p.power],
        ['Notas', p.notes], ['Última revisión', p.lastReviewedAt],
        ['Ítems en catálogo', s?.items?.total],
        ['Copias en inventario', s?.inventory?.entries],
        ['Encantamientos', s?.enchantments?.total],
        ['Builds', s?.builds?.total], ['Tier lists', s?.tierlists?.total],
      ].filter(([, v]) => v != null && v !== '');
      break;
    }

    case 'backup': {
      report.title = 'Backup completo — MINDUN LABS';
      const t = dataset.tables || {};
      report.recordCount = Object.values(t).reduce((n, rows) => n + (rows?.length || 0), 0);
      // Reutiliza los otros tipos para componer las tablas del backup.
      for (const [sub, rows] of [
        ['inventory', t.inventoryJoined || t.inventory_entries],
        ['catalog', t.items],
        ['enchantments', t.enchantments],
      ]) {
        if (rows?.length) {
          const r = buildReport(sub === 'inventory' ? 'inventory' : sub, {
            rows, itemsById, enchantsById,
          });
          report.tables.push(...r.tables);
        }
      }
      if (t.builds?.length) {
        const r = buildReport('builds', { rows: t.builds, itemsById });
        report.tables.push(...r.tables);
      }
      if (t.tier_lists?.length) {
        report.tables.push({
          name: 'TierLists',
          columns: [C('name', 'Nombre', 26), C('category', 'Categoría', 14), C('entries', 'Entradas', 10)],
          rows: t.tier_lists.map((x) => ({
            name: x.name, category: x.category, entries: (x.entries || []).length,
          })),
        });
      }
      break;
    }

    default:
      report.title = `Exportación — ${type}`;
  }
  return report;
}
