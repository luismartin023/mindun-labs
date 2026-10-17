import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  enchantTypeForCategory, compatibleEnchants, normalizeSelected, slotOptions,
} from '../../server/domain/enchantments/slots.js';
import { item, enchant } from './fixtures.js';

const ENCHS = [
  enchant({ id: 'e-melee', enchantType: 'melee' }),
  enchant({ id: 'e-ranged', enchantType: 'ranged' }),
  enchant({ id: 'e-armor', enchantType: 'armor' }),
  enchant({ id: 'e-univ', enchantType: 'universal' }),
  enchant({ id: 'e-unk', enchantType: 'unknown' }),
];

test('enchantTypeForCategory mapea y devuelve null en artefactos', () => {
  assert.equal(enchantTypeForCategory('melee_weapon'), 'melee');
  assert.equal(enchantTypeForCategory('ranged_weapon'), 'ranged');
  assert.equal(enchantTypeForCategory('armor'), 'armor');
  assert.equal(enchantTypeForCategory('artifact'), null);
  assert.equal(enchantTypeForCategory('enchantment'), null);
});

test('compatibleEnchants: melee acepta melee + universal, nunca ranged/armor', () => {
  const sword = item({ id: 's', category: 'melee_weapon' });
  assert.deepEqual(
    compatibleEnchants(sword, ENCHS).map((e) => e.id).sort(),
    ['e-melee', 'e-univ']);
  const art = item({ id: 'a', category: 'artifact' });
  assert.deepEqual(compatibleEnchants(art, ENCHS), []);
});

test('slotOptions: artefactos no tienen opciones', () => {
  const art = item({ id: 'a', category: 'artifact' });
  assert.deepEqual(slotOptions(art, ENCHS), []);
});

test('slotOptions: por defecto 3 ranuras con todos los compatibles', () => {
  const sword = item({ id: 's', category: 'melee_weapon' });
  const slots = slotOptions(sword, ENCHS);
  assert.equal(slots.length, 3);
  assert.deepEqual(slots.map((s) => s.slotIndex), [1, 2, 3]);
  for (const s of slots) {
    assert.deepEqual(s.options.map((o) => o.enchantmentId).sort(), ['e-melee', 'e-univ']);
  }
});

test('slotOptions: respeta enchantmentSlots declarados', () => {
  const sword = item({
    id: 's', category: 'melee_weapon',
    enchantmentSlots: [{ slotIndex: 1, options: [{ enchantmentId: 'custom' }] }],
  });
  const slots = slotOptions(sword, ENCHS);
  assert.equal(slots.length, 1);
  assert.equal(slots[0].options[0].enchantmentId, 'custom');
});

test('normalizeSelected: rellena a 3 con null y trunca', () => {
  assert.deepEqual(normalizeSelected(['a']), ['a', null, null]);
  assert.deepEqual(normalizeSelected([]), [null, null, null]);
  assert.deepEqual(normalizeSelected(null), [null, null, null]);
  assert.deepEqual(normalizeSelected(['a', 'b', 'c', 'd']), ['a', 'b', 'c']);
});
