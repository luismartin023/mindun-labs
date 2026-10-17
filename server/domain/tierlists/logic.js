/**
 * Lógica de tier lists: filas por defecto y operaciones inmutables
 * sobre entries {itemId, rowKey, reason?, notes?}. El orden dentro de
 * una fila es el orden relativo de sus entries en el array.
 */

/** Filas estándar S–D + "No evaluado" para nuevas tier lists. */
export function defaultRows() {
  return [
    { key: 'S', label: 'S', color: '#e45a55' },
    { key: 'A', label: 'A', color: '#e6a329' },
    { key: 'B', label: 'B', color: '#83c96c' },
    { key: 'C', label: 'C', color: '#5aa9e6' },
    { key: 'D', label: 'D', color: '#8d8585' },
    { key: 'unrated', label: 'No evaluado', color: '#57504f' },
  ];
}

const cloneList = (tl) => ({
  ...tl,
  rows: (tl?.rows ?? []).map((r) => ({ ...r })),
  entries: (tl?.entries ?? []).map((e) => ({ ...e })),
});

const assertRow = (tl, rowKey) => {
  if (!(tl?.rows ?? []).some((r) => r.key === rowKey)) {
    throw new Error(`Fila de tier list desconocida: "${rowKey}"`);
  }
};

/** Posición absoluta donde insertar para quedar en índice `index` dentro de la fila. */
const insertPos = (entries, rowKey, index) => {
  const idxs = entries
    .map((e, i) => (e.rowKey === rowKey ? i : -1))
    .filter((i) => i >= 0);
  if (!idxs.length) return entries.length;
  if (!Number.isInteger(index) || index >= idxs.length) return idxs[idxs.length - 1] + 1;
  if (index <= 0) return idxs[0];
  return idxs[index];
};

/**
 * Mueve un ítem a una fila (lo quita de donde esté) en la posición
 * `index` de esa fila; sin index lo pone al final de la fila.
 * @returns {object} nuevo TierListRecord (el original no se toca)
 * @throws {Error} si rowKey no existe
 */
export function moveEntry(tierList, itemId, rowKey, index) {
  assertRow(tierList, rowKey);
  const next = cloneList(tierList);
  next.entries = next.entries.filter((e) => e.itemId !== itemId);
  next.entries.splice(insertPos(next.entries, rowKey, index), 0, { itemId, rowKey });
  return next;
}

/**
 * Coloca un ítem al final de una fila conservando metadatos (reason, notes…).
 * @throws {Error} si rowKey no existe
 */
export function placeEntry(tierList, itemId, rowKey, meta = {}) {
  assertRow(tierList, rowKey);
  const next = cloneList(tierList);
  next.entries = next.entries.filter((e) => e.itemId !== itemId);
  next.entries.splice(insertPos(next.entries, rowKey, null), 0, { itemId, rowKey, ...meta });
  return next;
}

/** Quita el ítem de la tier list dondequiera que esté. */
export function removeEntry(tierList, itemId) {
  const next = cloneList(tierList);
  next.entries = next.entries.filter((e) => e.itemId !== itemId);
  return next;
}

/** Ids de `allItemIds` que no aparecen en ninguna entry. */
export function unplacedItemIds(tierList, allItemIds = []) {
  const placed = new Set((tierList?.entries ?? []).map((e) => e.itemId));
  return (allItemIds ?? []).filter((id) => !placed.has(id));
}
