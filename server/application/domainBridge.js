/**
 * Puente hacia server/domain/: importación perezosa y tolerante a ausencia.
 * Los módulos de dominio pueden estar en desarrollo en paralelo; si faltan,
 * se registra un aviso y el servicio degrada sin inventar reemplazos.
 */
const cache = new Map();
const warned = new Set();

/**
 * @param {string} rel  ruta relativa a domain/, p. ej. 'catalog/validators.js'
 * @returns {Promise<object|null>} módulo de dominio o null si no existe
 */
export async function domain(rel) {
  if (cache.has(rel)) return cache.get(rel);
  try {
    const mod = await import(`../domain/${rel}`);
    cache.set(rel, mod);
    return mod;
  } catch (err) {
    // Solo se tolera "módulo no encontrado"; errores internos sí se propagan.
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && String(err.message).includes(`domain/${rel}`)) {
      if (!warned.has(rel)) {
        warned.add(rel);
        console.warn(`[domain] módulo no disponible todavía: domain/${rel}`);
      }
      return null;
    }
    throw err;
  }
}

/** true si el módulo de dominio está disponible (para informes de salud). */
export async function domainAvailable(rel) {
  return (await domain(rel)) !== null;
}
