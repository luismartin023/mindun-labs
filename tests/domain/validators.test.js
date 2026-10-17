import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateItem, validateInventoryEntry, validateBuild,
  validateEnchantment, validateTierList,
} from '../../server/domain/catalog/validators.js';
import { defaultRows } from '../../server/domain/tierlists/logic.js';

test('validateItem: caso válido pasa sin errores', () => {
  const r = validateItem({
    name: 'Heartstealer', category: 'melee_weapon', rarity: 'unique',
    slug: 'heartstealer', quantity: 1, powerLevel: 108,
  });
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test('validateItem: nombre vacío, categoría y rareza inválidas', () => {
  const r = validateItem({ name: '  ', category: 'potion', rarity: 'mythic' });
  assert.equal(r.valid, false);
  assert.equal(r.errors.length, 3);
});

test('validateItem: cantidad negativa rechazada', () => {
  const r = validateItem({ name: 'X', category: 'armor', rarity: 'common', quantity: -2 });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('quantity')));
});

test('validateItem: poder fuera de 1-300 es warning, no error', () => {
  const r = validateItem({ name: 'X', category: 'armor', rarity: 'common', powerLevel: 999 });
  assert.equal(r.valid, true);
  assert.ok(r.warnings.length >= 1);
});

test('validateItem: slug divergente genera warning', () => {
  const r = validateItem({ name: 'Fire Brand', category: 'melee_weapon', slug: 'otro-slug' });
  assert.ok(r.warnings.some((w) => w.includes('fire-brand')));
});

test('validateItem: más de 3 ranuras de encantamiento rechazado', () => {
  const r = validateItem({
    name: 'X', category: 'armor',
    enchantmentSlots: [1, 2, 3, 1].map((n, i) => ({ slotIndex: i + 1, options: [] })),
  });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('enchantmentSlots')));
});

test('validateItem: slotIndex duplicado y opción duplicada en una ranura', () => {
  const dupIdx = validateItem({
    name: 'X', category: 'armor',
    enchantmentSlots: [{ slotIndex: 1, options: [] }, { slotIndex: 1, options: [] }],
  });
  assert.equal(dupIdx.valid, false);
  const dupOpt = validateItem({
    name: 'X', category: 'armor',
    enchantmentSlots: [{ slotIndex: 1, options: [{ enchantmentId: 'a' }, { enchantmentId: 'a' }] }],
  });
  assert.equal(dupOpt.valid, false);
});

test('validateInventoryEntry: válido, cantidad negativa y >3 encantamientos', () => {
  assert.equal(validateInventoryEntry({ itemId: 'i1', quantity: 3 }).valid, true);
  assert.equal(validateInventoryEntry({ itemId: 'i1', quantity: -1 }).valid, false);
  assert.equal(validateInventoryEntry({ itemId: 'i1', quantity: 1.5 }).valid, false);
  assert.equal(validateInventoryEntry({ quantity: 1 }).valid, false);
  assert.equal(
    validateInventoryEntry({ itemId: 'i1', selectedEnchantIds: ['a', 'b', 'c', 'd'] }).valid,
    false);
  assert.equal(validateInventoryEntry({ itemId: 'i1', powerLevel: 0 }).valid, false);
  assert.equal(validateInventoryEntry({ itemId: 'i1', powerLevel: 263 }).valid, true);
});

test('validateBuild: válido pasa; 4 artefactos y duplicados rechazados', () => {
  const ok = validateBuild({
    name: 'Build A', meleeItemId: 'm1', rangedItemId: null, armorItemId: 'a1',
    artifactItemIds: ['t1', 't2', null],
    enchantChoices: { m1: ['e1', 'e2'] }, weights: { survival: 5 },
  });
  assert.equal(ok.valid, true);
  assert.equal(validateBuild({ name: 'B', artifactItemIds: ['t1', 't2', 't3', 't4'] }).valid, false);
  assert.equal(validateBuild({ name: 'B', artifactItemIds: ['t1', 't1'] }).valid, false);
  assert.equal(validateBuild({ artifactItemIds: [] }).valid, false); // sin name
  assert.equal(validateBuild({ name: 'B', enchantChoices: { m1: ['a', 'b', 'c', 'd'] } }).valid, false);
  assert.equal(validateBuild({ name: 'B', weights: { survival: 11 } }).valid, false);
  assert.equal(validateBuild({ name: 'B', weights: { survival: 'alto' } }).valid, false);
});

test('validateEnchantment: tipo inválido y tiers mal formados', () => {
  assert.equal(validateEnchantment({ name: 'Sharpness', enchantType: 'melee' }).valid, true);
  assert.equal(validateEnchantment({ name: 'X', enchantType: 'cosmico' }).valid, false);
  assert.equal(validateEnchantment({ enchantType: 'melee' }).valid, false);
  assert.equal(
    validateEnchantment({ name: 'X', enchantType: 'melee', tiers: [{ tier: 4, text: 'x' }] }).valid,
    false);
  assert.equal(
    validateEnchantment({ name: 'X', enchantType: 'melee', tiers: [{ tier: 2 }] }).valid,
    false);
});

test('validateTierList: rows duplicadas y entries con rowKey inexistente', () => {
  const rows = defaultRows();
  assert.equal(validateTierList({ name: 'T', rows, entries: [] }).valid, true);
  assert.equal(
    validateTierList({ name: 'T', rows, entries: [{ itemId: 'i1', rowKey: 'S' }] }).valid, true);
  assert.equal(
    validateTierList({ name: 'T', rows, entries: [{ itemId: 'i1', rowKey: 'ZZ' }] }).valid, false);
  const dup = [...rows, { key: 'S', label: 'S2', color: '#fff' }];
  assert.equal(validateTierList({ name: 'T', rows: dup }).valid, false);
  assert.equal(validateTierList({ name: 'T', rows: [] }).valid, false);
});
