import test from 'node:test';
import assert from 'node:assert/strict';
import { createInventoryService } from '../../server/application/inventoryService.js';
import { openDb } from '../../server/infrastructure/db/db.js';
import { createInventoryRepository } from '../../server/infrastructure/db/repositories/inventoryRepository.js';
import { createItemRepository } from '../../server/infrastructure/db/repositories/itemRepository.js';

function service() {
  const entry = { id: 'copy-1', itemId: 'item-1', quantity: 1 };
  return createInventoryService({
    inventoryRepo: {
      getById: () => entry,
      update: () => entry,
      create: () => entry,
    },
    itemRepo: { getById: () => ({ id: 'item-1', category: 'armor' }), getBySlug: () => null },
    enchantmentRepo: { getById: () => null },
  });
}

test('inventory service never persists a zero-quantity copy', async () => {
  const inventory = service();
  await assert.rejects(inventory.add({ itemId: 'item-1', quantity: 0 }), /al menos 1/);
  await assert.rejects(inventory.update('copy-1', { quantity: 0 }), /al menos 1/);
  await assert.rejects(inventory.adjustQuantity('copy-1', -1), /al menos 1/);
});

test('inventory service rejects enchantments incompatible with the item category', async () => {
  const inventory = createInventoryService({
    inventoryRepo: { create: (entry) => entry },
    itemRepo: {
      getById: () => ({ id: 'item-1', category: 'armor', enchantmentSlots: [] }),
      getBySlug: () => null,
    },
    enchantmentRepo: {
      getById: (id) => id === 'melee-enchant'
        ? { id, enchantType: 'melee', tiers: [1, 2, 3] }
        : null,
    },
  });
  await assert.rejects(
    inventory.add({ itemId: 'item-1', selectedEnchantIds: ['melee-enchant'] }),
    /incompatible/,
  );
});

test('inventory service respects multiplePerEquipment metadata', async () => {
  const inventory = createInventoryService({
    inventoryRepo: { create: (entry) => entry },
    itemRepo: {
      getById: () => ({ id: 'item-1', category: 'melee_weapon', enchantmentSlots: [] }),
      getBySlug: () => null,
    },
    enchantmentRepo: {
      getById: (id) => ({
        id, enchantType: 'melee', tiers: [1, 2, 3], multiplePerEquipment: id === 'repeatable',
      }),
    },
  });

  await assert.rejects(
    inventory.add({ itemId: 'item-1', selectedEnchantIds: ['single', 'single'] }),
    /No puedes repetir/,
  );
  const allowed = await inventory.add({
    itemId: 'item-1',
    selectedEnchantIds: ['repeatable', 'repeatable'],
  });
  assert.equal(allowed.selectedEnchantIds[0], 'repeatable');
  assert.equal(allowed.selectedEnchantIds[1], 'repeatable');
});

test('SQLite blocks direct writes that create zero-quantity copies', () => {
  const db = openDb(':memory:');
  try {
    const item = createItemRepository(db).create({
      name: 'Temporary test item',
      category: 'armor',
      rarity: 'common',
    });
    const inventory = createInventoryRepository(db);
    assert.throws(() => inventory.create({ itemId: item.id, quantity: 0 }), /at least 1/);
    const entry = inventory.create({ itemId: item.id, quantity: 1 });
    assert.throws(() => inventory.update(entry.id, { quantity: 0 }), /at least 1/);
  } finally {
    db.close();
  }
});
