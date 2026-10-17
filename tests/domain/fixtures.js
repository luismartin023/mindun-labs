/** Fixtures mínimos de dominio para tests (shape de model.js). */

export const item = (o = {}) => ({
  id: o.id,
  slug: o.slug ?? String(o.id ?? 'x'),
  category: o.category ?? 'melee_weapon',
  name: o.name ?? String(o.id ?? 'item'),
  localizedName: null,
  aliases: [],
  rarity: o.rarity ?? 'common',
  description: null,
  attributes: [],
  passiveEffects: [],
  uniqueEffects: [],
  enchantmentSlots: [],
  tags: [],
  runes: [],
  locations: [],
  dataStatus: 'verified',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...o,
});

export const enchant = (o = {}) => ({
  id: o.id,
  slug: o.slug ?? String(o.id ?? 'e'),
  name: o.name ?? String(o.id ?? 'ench'),
  localizedName: null,
  aliases: [],
  enchantType: o.enchantType ?? 'melee',
  description: null,
  tiers: [{ tier: 1, text: 'x' }],
  multiplePerEquipment: false,
  builtInto: [],
  dataStatus: 'verified',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...o,
});

export const buildSignature = (slots) =>
  `${slots.melee?.id ?? '-'}|${slots.ranged?.id ?? '-'}|${slots.armor?.id ?? '-'}|` +
  (slots.artifacts ?? []).map((a) => a?.id ?? '-').sort().join(',');
