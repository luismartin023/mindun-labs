import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBuilds } from '../../server/domain/builds/generator.js';
import { item, enchant, buildSignature } from './fixtures.js';

const POOL = [
  item({ id: 'm1', category: 'melee_weapon', name: 'Sword', tags: ['fire'],
    passiveEffects: ['+30% melee damage'] }),
  item({ id: 'm2', category: 'melee_weapon', name: 'Axe', rarity: 'rare' }),
  item({ id: 'r1', category: 'ranged_weapon', name: 'Bow', tags: ['bows'] }),
  item({ id: 'r2', category: 'ranged_weapon', name: 'Xbow', tags: ['crossbows'] }),
  item({ id: 'a1', category: 'armor', name: 'Plate',
    passiveEffects: ['35% damage reduction'] }),
  item({ id: 'a2', category: 'armor', name: 'Robe' }),
  item({ id: 't1', category: 'artifact', name: 'Horn', tags: ['summoning'] }),
  item({ id: 't2', category: 'artifact', name: 'Feather', tags: ['agility'] }),
  item({ id: 't3', category: 'artifact', name: 'Boots', tags: ['agility'] }),
];

const ENCHS = [
  enchant({ id: 'e1', name: 'Sharpness', enchantType: 'melee' }),
  enchant({ id: 'e2', name: 'Cool Down', enchantType: 'universal' }),
];

const equippedIds = (slots) =>
  [slots.melee, slots.ranged, slots.armor, ...(slots.artifacts ?? [])]
    .filter(Boolean).map((i) => i.id);

test('requiredIds: el ítem obligatorio aparece en TODAS las builds', () => {
  const { results } = generateBuilds({
    items: POOL, constraints: { requiredIds: ['m2'], artifactCount: 0 }, limit: 20,
  });
  assert.ok(results.length > 0);
  for (const r of results) assert.ok(equippedIds(r.slots).includes('m2'));
});

test('excludedIds: nunca aparece en ninguna build', () => {
  const { results } = generateBuilds({
    items: POOL, constraints: { excludedIds: ['t1', 'm1'], artifactCount: 1 }, limit: 30,
  });
  assert.ok(results.length > 0);
  for (const r of results) {
    assert.ok(!equippedIds(r.slots).includes('t1'));
    assert.ok(!equippedIds(r.slots).includes('m1'));
  }
});

test('onlyOwned: solo usa ítems de ownedIds', () => {
  const owned = new Set(['m1', 'r1', 'a1', 't1']);
  const { results } = generateBuilds({
    items: POOL, ownedIds: owned,
    constraints: { onlyOwned: true, artifactCount: 1 }, limit: 30,
  });
  assert.ok(results.length > 0);
  for (const r of results) {
    for (const id of equippedIds(r.slots)) assert.ok(owned.has(id), `id no poseído: ${id}`);
  }
});

test('artifactCount se respeta exactamente', () => {
  for (const k of [0, 1, 2, 3]) {
    const { results } = generateBuilds({
      items: POOL, constraints: { artifactCount: k }, limit: 15,
    });
    assert.ok(results.length > 0, `k=${k} sin resultados`);
    for (const r of results) assert.equal(r.slots.artifacts.length, k);
  }
});

test('limit se respeta y las firmas no se duplican', () => {
  const { results } = generateBuilds({
    items: POOL, constraints: { artifactCount: 1 }, limit: 5,
  });
  assert.equal(results.length, 5);
  const sigs = new Set(results.map((r) => buildSignature(r.slots)));
  assert.equal(sigs.size, results.length);
});

test('resultados ordenados por score.total descendente (nulls al final)', () => {
  const { results } = generateBuilds({
    items: POOL, enchantments: ENCHS, constraints: { artifactCount: 1 }, limit: 30,
  });
  assert.ok(results.length > 1);
  for (let i = 0; i + 1 < results.length; i++) {
    const a = results[i].score.total ?? -Infinity;
    const b = results[i + 1].score.total ?? -Infinity;
    assert.ok(a >= b, `orden roto en ${i}: ${a} < ${b}`);
  }
});

test('maxExplore pequeño → truncated=true y explored acotado', () => {
  const { results, explored, truncated } = generateBuilds({
    items: POOL, constraints: { artifactCount: 2 }, maxExplore: 3, limit: 50,
  });
  assert.equal(truncated, true);
  assert.ok(explored <= 3);
  assert.ok(results.length <= 3);
});

test('sin restricciones trunca o explora todo el espacio; artefactos distintos', () => {
  const { results, truncated } = generateBuilds({ items: POOL, maxExplore: 100_000, limit: 500 });
  assert.equal(truncated, false);
  assert.ok(results.length > 10);
  for (const r of results) {
    const ids = r.slots.artifacts.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, 'artefactos duplicados');
    const all = equippedIds(r.slots);
    assert.equal(new Set(all).size, all.length, 'ítem en dos slots');
  }
});

test('required ∩ excluded → resultado vacío; required inexistente → vacío', () => {
  assert.equal(generateBuilds({
    items: POOL, constraints: { requiredIds: ['m1'], excludedIds: ['m1'] },
  }).results.length, 0);
  assert.equal(generateBuilds({
    items: POOL, constraints: { requiredIds: ['no-existe'] },
  }).results.length, 0);
});

test('signal pre-aborted devuelve truncated sin explorar', () => {
  const { results, explored, truncated } = generateBuilds({
    items: POOL, signal: { aborted: true }, maxExplore: 100_000,
  });
  assert.equal(truncated, true);
  assert.equal(explored, 0);
  assert.deepEqual(results, []);
});

test('signal.aborted a mitad corta la exploración y marca truncated', () => {
  // Pool grande: 8 gear × ~299 combos de artefactos (>2000 explorados).
  const bigPool = [
    ...POOL,
    ...Array.from({ length: 9 }, (_, i) =>
      item({ id: `tx${i}`, category: 'artifact', name: `Art ${i}` })),
  ];
  const signal = { aborted: false };
  const calls = [];
  const { truncated, explored } = generateBuilds({
    items: bigPool, signal, maxExplore: 100_000,
    onProgress: (e, f) => { calls.push([e, f]); signal.aborted = true; },
  });
  assert.equal(truncated, true);
  assert.ok(calls.length >= 1, 'onProgress debió llamarse');
  assert.ok(explored < 100_000);
});
