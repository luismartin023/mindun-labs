/**
 * Almacenamiento de imágenes en disco: carpeta de subidas y borrado seguro.
 */
import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { config } from '../../config.js';

/** Crea (si falta) y devuelve la carpeta data/images/uploads. */
export function ensureUploadsDir() {
  mkdirSync(config.uploadsDir, { recursive: true });
  return config.uploadsDir;
}

/**
 * Borra el fichero de una ruta servida '/images/uploads/<file>'.
 * Nunca toca archivos fuera de uploads/ (anti-traversal incluido).
 */
export function unlinkIfUpload(servedPath) {
  if (typeof servedPath !== 'string' || !servedPath.startsWith('/images/uploads/')) return false;
  const rel = servedPath.slice('/images/uploads/'.length);
  if (!rel || rel.includes('..')) return false;
  const abs = normalize(join(config.uploadsDir, rel));
  if (!abs.startsWith(normalize(config.uploadsDir) + sep)) return false;
  try {
    if (existsSync(abs)) { unlinkSync(abs); return true; }
  } catch { /* mejor esfuerzo */ }
  return false;
}
