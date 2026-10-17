import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterItems, sortItems } from '../../server/domain/items/filters.js';
import { item } from './fixtures.js';

const ROWS = [
  item({ id: 'i1', name: 'Heartstealer', category: 'melee_weapon', rarity: 'unique',
    localizedName: 'Robacorazones', tags: ['damaging'], owned: true, isFavorite: true,
    quantity: 1, powerLevel: 108, updatedAt: '2026-02-01T00:00:00.000Z' }),
  item({ id: 'i2', name: 'Puño del Vacío', category: 'melee_weapon', rarity: 'common',
    aliases: ['Void Fist'], owned: false, isFavorite: false, quantity: 0,
    updatedAt: '2026-01-01T00:00:00.000Z' }),
  item({ id: 'i3', name: 'Harp Bow', category: 'ranged_weapon', rarity: 'rare',
    passiveEffects: ['Dispara flechas en abanico'], owned: true, isFavorite: false,
    quantity: 2, powerLevel: 55, updatedAt: '2026-03-01T00:00:00.000Z' }),
  item({ id: 'i4', name: 'Gong of Weakening', category: 'artifact', rarity: 'common',
    tags: ['status'], entryRarity: 'gilded', owned: true, isFavorite: true,
    quantity: 1, powerLevel: 90 }),
];

test('search ignora acentos y mayúsculas en nombre y localizedName', () => {
  assert.deepEqual(filterItems(ROWS, { search: 'puño' }).map((r) => r.id), ['i2']);
  assert.deepEqual(filterItems(ROWS, { search: 'PUNO' }).map((r) => r.id), ['i2']);
  assert.deepEqual(filterItems(ROWS, { search: 'robacorazones' }).map((r) => r.id), ['i1']);
});

test('search cubre aliases, internalId y passiveEffects', () => {
  assert.deepEqual(filterItems(ROWS, { search: 'void fist' }).map((r) => r.id), ['i2']);
  assert.deepEqual(filterItems(ROWS, { search: 'abanico' }).map((r) => r.id), ['i3']);
  const withInternal = [item({ id: 'x1', name: 'A', internalId: 'ClimbingGear_Unique2' })];
  assert.deepEqual(filterItems(withInternal, { search: 'climbinggear_unique2' }).length, 1);
});

test('combina category + rarity + owned + favorite', () => {
  const res = filterItems(ROWS, {
    category: 'melee_weapon', rarity: 'unique', owned: true, favorite: true,
  });
  assert.deepEqual(res.map((r) => r.id), ['i1']);
  assert.equal(filterItems(ROWS, { owned: false }).length, 1);
  assert.equal(filterItems(ROWS, { favorite: true }).length, 2);
  // rarity usa entryRarity cuando existe
  assert.deepEqual(filterItems(ROWS, { rarity: 'gilded' }).map((r) => r.id), ['i4']);
});

test('filtra por tags (AND), poder e ids', () => {
  const rows = [
    item({ id: 't1', tags: ['fire', 'damaging'] }),
    item({ id: 't2', tags: ['fire'] }),
    item({ id: 't3', tags: ['ice'] }),
  ];
  assert.deepEqual(filterItems(rows, { tags: ['fire', 'damaging'] }).map((r) => r.id), ['t1']);
  assert.deepEqual(filterItems(ROWS, { minPower: 60, maxPower: 120 }).map((r) => r.id), ['i1', 'i4']);
  assert.deepEqual(filterItems(ROWS, { ids: ['i2', 'i4'] }).map((r) => r.id), ['i2', 'i4']);
});

test('filtra por enchantmentId en opciones o selección', () => {
  const rows = [
    item({ id: 'e1', enchantmentSlots: [{ slotIndex: 1, options: [{ enchantmentId: 'sharp' }] }] }),
    item({ id: 'e2', selectedEnchantIds: ['sharp', null, null] }),
    item({ id: 'e3' }),
  ];
  assert.deepEqual(filterItems(rows, { enchantmentId: 'sharp' }).map((r) => r.id), ['e1', 'e2']);
});

test('sortItems: orden de rareza unique>gilded>special>rare>common>unknown', () => {
  const rows = ['common', 'unknown', 'unique', 'rare', 'gilded', 'special']
    .map((r, i) => item({ id: `r${i}`, rarity: r }));
  const asc = sortItems(rows, 'rarity', 'asc').map((r) => r.rarity);
  assert.deepEqual(asc, ['unique', 'gilded', 'special', 'rare', 'common', 'unknown']);
  const desc = sortItems(rows, 'rarity', 'desc').map((r) => r.rarity);
  assert.deepEqual(desc, [...asc].reverse());
});

test('sortItems es estable y no muta la entrada', () => {
  const rows = [
    item({ id: 'a', rarity: 'common', name: 'Zeta' }),
    item({ id: 'b', rarity: 'common', name: 'Alpha' }),
    item({ id: 'c', rarity: 'common', name: 'Beta' }),
  ];
  const before = rows.map((r) => r.id);
  const sorted = sortItems(rows, 'rarity', 'asc');
  assert.deepEqual(sorted.map((r) => r.id), before); // mismo rarity → orden original
  assert.deepEqual(rows.map((r) => r.id), before);    // entrada intacta
  assert.notEqual(sorted, rows);
});

test('sortItems por quantity/power deja los ausentes al final', () => {
  const rows = [
    item({ id: 'n1', name: 'N' }),
    item({ id: 'q1', quantity: 5, powerLevel: 20 }),
    item({ id: 'q2', quantity: 1, powerLevel: 200 }),
  ];
  assert.deepEqual(sortItems(rows, 'quantity', 'desc').map((r) => r.id), ['q1', 'q2', 'n1']);
  assert.deepEqual(sortItems(rows, 'power', 'asc').map((r) => r.id), ['q1', 'q2', 'n1']);
});
