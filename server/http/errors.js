/**
 * Errores HTTP uniformes: ApiError + middlewares de 404 API y de error JSON.
 * Forma de respuesta: { error: string, details?: any }.
 */

export class ApiError extends Error {
  /**
   * @param {number} status  código HTTP
   * @param {string} message mensaje legible (español)
   * @param {any} [details]  detalle opcional (errores de validación, etc.)
   */
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new ApiError(400, msg, details);
export const notFound = (msg = 'Recurso no encontrado') => new ApiError(404, msg);
export const conflict = (msg, details) => new ApiError(409, msg, details);
export const unavailable = (msg, details) => new ApiError(503, msg, details);

/** 404 para cualquier /api/* que no haya resuelto un router. */
export function apiNotFound(req, res) {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
}

/** Middleware final de errores: siempre responde JSON {error, details?}. */
export function errorHandler(err, req, res, _next) {
  if (res.headersSent) return;
  if (err instanceof ApiError) {
    res.status(err.status).json(err.details !== undefined
      ? { error: err.message, details: err.details }
      : { error: err.message });
    return;
  }
  // Multer (tamaño / tipo de archivo) y errores comunes de payload.
  if (err?.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ error: `Error de subida: ${err.message}` });
    return;
  }
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ error: 'Cuerpo de la petición demasiado grande' });
    return;
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: 'JSON mal formado en el cuerpo de la petición' });
    return;
  }
  // SQLite UNIQUE / FK / CHECK → conflicto legible.
  if (String(err?.code || '').startsWith('ERR_SQLITE') || /UNIQUE|FOREIGN KEY|CHECK/i.test(err?.message || '')) {
    const m = String(err.message || '');
    if (/UNIQUE/i.test(m)) { res.status(409).json({ error: 'Conflicto de unicidad (slug/id ya existe)' }); return; }
    if (/FOREIGN KEY/i.test(m)) { res.status(400).json({ error: 'Referencia a un registro inexistente' }); return; }
    if (/CHECK/i.test(m)) { res.status(400).json({ error: 'Valor fuera de rango permitido' }); return; }
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
}
