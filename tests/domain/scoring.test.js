import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreBuild } from '../../server/domain/scoring/engine.js';
import { item, enchant } from './fixtures.js';

const ITEMS = {
  m1: item({ id: 'm1', category: 'melee_weapon', name: 'Sword',
    passiveEffects: ['+30% melee damage'], tags: ['fire'] }),
  r1: item({ id: 'r1', category: 'ranged_weapon', name: 'Bow',
    tags: ['bows', 'quiver'] }),
  a1: item({ id: 'a1', category: 'armor', name: 'Plate',
    passiveEffects: ['35% damage reduction', '15% movespeed aura'] }),
  t1: item({ id: 't1', category: 'artifact', name: 'Totem', tags: ['defensive-healing'] }),
};

const byId = Object.fromEntries(Object.values(ITEMS).map((i) => [i.id, i]));
const ENCH = Object.fromEntries([
  enchant({ id: 'e1', name: 'Sharpness', enchantType: 'melee' }),
  enchant({ id: 'e2', name: 'Cool Down', enchantType: 'armor' }),
].map((e) => [e.id, e]));

const BUILD = {
  meleeItemId: 'm1', rangedItemId: 'r1', armorItemId: 'a1', artifactItemIds: ['t1'],
};

test('criterio sin señales → value null + "Sin datos", jamás inventado', () => {
  const bare = {
    meleeItemId: 'bare', artifactItemIds: ['bareArt'],
  };
  const items = {
    bare: item({ id: 'bare', category: 'melee_weapon' }),
    bareArt: item({ id: 'bareArt', category: 'artifact' }),
  };
  const s = scoreBuild(bare, { itemsById: items });
  assert.equal(s.breakdown.control.value, null);
  assert.equal(s.breakdown.control.reason, 'Sin datos');
  assert.equal(s.breakdown.mobility.value, null);
  assert.equal(s.breakdown.ownership.value, null); // sin ownedIds → Sin datos
  assert.equal(s.estimated, true);
});

test('misma entrada → salida byte a byte igual (determinista)', () => {
  const ctx = { itemsById: byId, enchantsById: ENCH, weights: { survival: 3 }, ownedIds: new Set(['m1']) };
  const s1 = scoreBuild(BUILD, ctx);
  const s2 = scoreBuild(BUILD, ctx);
  assert.equal(JSON.stringify(s1), JSON.stringify(s2));
  assert.deepEqual(s1, s2);
});

test('señales explícitas puntúan y explican en el reason', () => {
  const s = scoreBuild(BUILD, { itemsById: byId, enchantsById: ENCH });
  assert.ok(s.breakdown.meleeDamage.value > 0);
  assert.match(s.breakdown.meleeDamage.reason, /melee/i);
  assert.ok(s.breakdown.survival.value > 0);
  assert.match(s.breakdown.survival.reason, /damage reduction/i);
  assert.ok(s.breakdown.healing.value > 0); // tag defensive-healing del totem
  assert.ok(typeof s.total === 'number');
});

test('ownership = fracción de equipados poseídos (0-10)', () => {
  const all = scoreBuild(BUILD, { itemsById: byId, ownedIds: new Set(['m1', 'r1', 'a1', 't1']) });
  assert.equal(all.breakdown.ownership.value, 10);
  const half = scoreBuild(BUILD, { itemsById: byId, ownedIds: new Set(['m1', 'r1']) });
  assert.equal(half.breakdown.ownership.value, 5);
  const none = scoreBuild(BUILD, { itemsById: byId, ownedIds: new Set() });
  assert.equal(none.breakdown.ownership.value, 0);
});

test('enchantSynergy por etiquetas compartidas y encantamientos compatibles', () => {
  const shared = {
    m1: item({ id: 'm1', category: 'melee_weapon', tags: ['fire', 'heavy'] }),
    r1: item({ id: 'r1', category: 'ranged_weapon', tags: ['fire'] }),
  };
  const s = scoreBuild(
    { meleeItemId: 'm1', rangedItemId: 'r1', enchantChoices: { m1: ['e1'], r1: ['e1'] } },
    { itemsById: shared, enchantsById: ENCH },
  );
  assert.ok(s.breakdown.enchantSynergy.value > 0);
  assert.match(s.breakdown.enchantSynergy.reason, /etiqueta compartida: fire/);
  // e1 es tipo melee: compatible con m1, no con r1
  assert.match(s.breakdown.enchantSynergy.reason, /compatible con m1|Sword|Sharpness/);
});

test('pesos: el total es media ponderada y admite forma slots', () => {
  const s = scoreBuild(BUILD, { itemsById: byId, weights: { survival: 10 } });
  assert.equal(s.breakdown.survival.weight, 10);
  let sv = 0, sw = 0;
  for (const b of Object.values(s.breakdown)) {
    if (b.value != null) { sv += b.value * b.weight; sw += b.weight; }
  }
  assert.equal(s.total, Math.round((sv / sw) * 10) / 10);
  // Pesar un criterio nulo no altera el total (se excluye de la media).
  const wNull = scoreBuild(BUILD, { itemsById: byId, weights: { control: 10 } });
  const wBase = scoreBuild(BUILD, { itemsById: byId });
  assert.equal(wNull.total, wBase.total);
  const slotsForm = scoreBuild(
    { slots: { melee: ITEMS.m1, ranged: ITEMS.r1, armor: ITEMS.a1, artifacts: [ITEMS.t1] } },
    { itemsById: byId, enchantsById: ENCH },
  );
  const idForm = scoreBuild(BUILD, { itemsById: byId, enchantsById: ENCH });
  assert.equal(slotsForm.total, idForm.total);
});
