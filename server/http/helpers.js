/**
 * Helpers HTTP: wrapper async, parseo de query de listados y paginación.
 * Todas las listas devuelven el sobre { data, total, page, pageSize }.
 */

/** Envuelve un handler async para que Express capture sus rechazos. */
export const asyncH = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** '1'|'true'|'yes' → true · '0'|'false'|'no' → false · resto → undefined. */
export function parseBool(v) {
  if (v === undefined || v === null || v === '') return undefined;
  const s = String(v).toLowerCase();
  if (['1', 'true', 'yes', 'si'].includes(s)) return true;
  if (['0', 'false', 'no'].includes(s)) return false;
  return undefined;
}

const clampInt = (v, { min, max, fallback }) => {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

/**
 * Parsea los parámetros estándar de listado
 * (?search=&category=&rarity=&owned=&favorite=&sort=&order=&page=&pageSize=).
 */
export function listQuery(query, { pageSizeMax = 200 } = {}) {
  const page = clampInt(query.page, { min: 1, max: 1e6, fallback: 1 });
  const pageSize = clampInt(query.pageSize, { min: 1, max: pageSizeMax, fallback: 50 });
  return {
    search: query.search?.trim() || undefined,
    category: query.category || undefined,
    rarity: query.rarity || undefined,
    dataStatus: query.dataStatus || query.status || undefined,
    owned: parseBool(query.owned),
    favorite: parseBool(query.favorite),
    gilded: parseBool(query.gilded),
    tag: query.tag || undefined,
    itemId: query.itemId || undefined,
    kind: query.kind || undefined,
    dataset: query.dataset || undefined,
    reviewStatus: query.reviewStatus || undefined,
    sort: query.sort || undefined,
    order: String(query.order || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc',
    page,
    pageSize,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };
}

/** Envuelve el resultado de un repo.list en el sobre de paginación. */
export function paged({ rows, total }, q) {
  return { data: rows, total, page: q.page, pageSize: q.pageSize };
}

/** Escapa % y _ para usar dentro de LIKE ... ESCAPE '\'. */
export function likeTerm(s) {
  return `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
