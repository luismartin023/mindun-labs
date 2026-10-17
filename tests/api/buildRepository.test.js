import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../../server/infrastructure/db/db.js';
import { createBuildRepository } from '../../server/infrastructure/db/repositories/buildRepository.js';

test('build repository persists enchantment tiers through the schema migration', () => {
  const db = openDb(':memory:');
  try {
    const repo = createBuildRepository(db);
    const enchantTiers = {
      'item-1': [{ enchantmentId: 'ench-1', tier: 2 }],
    };
    const created = repo.create({
      name: 'Prueba de niveles',
      enchantChoices: { 'item-1': ['ench-1', null, null] },
      enchantTiers,
    });

    assert.deepEqual(created.enchantChoices, { 'item-1': ['ench-1', null, null] });
    assert.deepEqual(created.enchantTiers, enchantTiers);

    const updated = repo.update(created.id, {
      enchantTiers: { 'item-1': [{ enchantmentId: 'ench-1', tier: 3 }] },
    });
    assert.equal(updated.enchantTiers['item-1'][0].tier, 3);
  } finally {
    db.close();
  }
});
