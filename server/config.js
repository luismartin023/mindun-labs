/**
 * Configuración del servidor MINDUN LABS.
 * Solo rutas, puerto y límites — nada de lógica.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

export const config = Object.freeze({
  port: Number(process.env.PORT) || 4321,
  rootDir: ROOT,
  publicDir: join(ROOT, 'public'),
  dataDir: join(ROOT, 'data'),
  imagesDir: join(ROOT, 'data', 'images'),
  uploadsDir: join(ROOT, 'data', 'images', 'uploads'),
  dbPath: join(ROOT, 'data', 'mindun.db'),
  /** Tamaño máximo de subida de imagen (MB) y de body JSON. */
  maxUploadMb: 15,
  /** pageSize máximo permitido en listados. */
  pageSizeMax: 200,
});
