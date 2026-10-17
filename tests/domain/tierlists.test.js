import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultRows, moveEntry, removeEntry, placeEntry, unplacedItemIds,
} from '../../server/domain/tierlists/logic.js';

const tl = () => ({
  id: 'tl1', name: 'Armas', rows: defaultRows(),
  entries: [
    { itemId: 'x', rowKey: 'B' },
    { itemId: 'y', rowKey: 'A' },
    { itemId: 'z', rowKey: 'A' },
    { itemId: 'w', rowKey: 'unrated' },
  ],
});

const rowOrder = (list, rowKey) =>
  list.entries.filter((e) => e.rowKey === rowKey).map((e) => e.itemId);

test('defaultRows: S–D + No evaluado', () => {
  const rows = defaultRows();
  assert.equal(rows.length, 6);
  assert.equal(rows[0].key, 'S');
  assert.equal(rows.at(-1).key, 'unrated');
  assert.equal(rows.at(-1).label, 'No evaluado');
  for (const r of rows) { assert.ok(r.label); assert.ok(r.color.startsWith('#')); }
});

test('moveEntry quita de la fila anterior e inserta en el índice dado', () => {
  const next = moveEntry(tl(), 'x', 'A', 1);
  assert.deepEqual(rowOrder(next, 'A'), ['y', 'x', 'z']);
  assert.deepEqual(rowOrder(next, 'B'), []);
  assert.deepEqual(rowOrder(next, 'unrated'), ['w']);
});

test('moveEntry sin índice añade al final de la fila', () => {
  const next = moveEntry(tl(), 'x', 'A');
  assert.deepEqual(rowOrder(next, 'A'), ['y', 'z', 'x']);
});

test('moveEntry es inmutable: el original no cambia', () => {
  const orig = tl();
  const snapshot = JSON.stringify(orig);
  moveEntry(orig, 'x', 'S', 0);
  assert.equal(JSON.stringify(orig), snapshot);
});

test('moveEntry con rowKey desconocida lanza error', () => {
  assert.throws(() => moveEntry(tl(), 'x', 'ZZ'), /desconocida/);
  assert.throws(() => placeEntry(tl(), 'x', 'ZZ'), /desconocida/);
});

test('placeEntry conserva metadatos (reason, notes)', () => {
  const next = placeEntry(tl(), 'w', 'S', { reason: 'Roto de bueno', notes: 'n' });
  const e = next.entries.find((en) => en.itemId === 'w');
  assert.equal(e.rowKey, 'S');
  assert.equal(e.reason, 'Roto de bueno');
  assert.equal(e.notes, 'n');
  assert.deepEqual(rowOrder(next, 'unrated'), []);
});

test('removeEntry elimina el ítem dondequiera que esté', () => {
  const next = removeEntry(tl(), 'y');
  assert.ok(!next.entries.some((e) => e.itemId === 'y'));
  assert.deepEqual(rowOrder(next, 'A'), ['z']);
});

test('unplacedItemIds devuelve ids no colocados', () => {
  assert.deepEqual(unplacedItemIds(tl(), ['x', 'y', 'z', 'w', 'v1', 'v2']), ['v1', 'v2']);
  assert.deepEqual(unplacedItemIds(tl(), []), []);
});
