/**
 * /api/builds — CRUD + score calculado + generador de combinaciones.
 */
import { Router } from 'express';
import { asyncH, listQuery, paged } from '../http/helpers.js';
import { config } from '../config.js';

export function createBuildsRouter(buildService) {
  const r = Router();

  r.get('/', asyncH(async (req, res) => {
    const q = listQuery(req.query, config);
    const result = await buildService.list(q);
    res.json(paged(result, q));
  }));

  r.post('/', asyncH(async (req, res) => {
    res.status(201).json(await buildService.create(req.body ?? {}));
  }));

  /**
   * Generador: AbortController por petición; si el cliente corta la conexión
   * antes de recibir respuesta, se aborta la exploración. ?sync=1 aceptado
   * (el motor es síncrono). Ojo: req 'close' se dispara al terminar de leer
   * el body — se usa res 'close' + writableEnded para detectar desconexión real.
   */
  r.post('/generate', asyncH(async (req, res) => {
    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded && !ac.signal.aborted) ac.abort();
    });
    const out = await buildService.generate(req.body ?? {}, { signal: ac.signal });
    res.json({
      results: out.results ?? [],
      explored: out.explored ?? null,
      truncated: !!out.truncated,
      elapsedMs: out.elapsedMs ?? null,
    });
  }));

  r.post('/score-preview', asyncH(async (req, res) => {
    res.json(await buildService.scorePreview(req.body ?? {}));
  }));

  r.get('/:id', asyncH(async (req, res) => {
    res.json(await buildService.get(req.params.id));
  }));

  r.patch('/:id', asyncH(async (req, res) => {
    res.json(await buildService.update(req.params.id, req.body ?? {}));
  }));

  r.post('/:id/duplicate', asyncH(async (req, res) => {
    res.status(201).json(await buildService.duplicate(req.params.id));
  }));

  r.delete('/:id', asyncH(async (req, res) => {
    res.json(await buildService.remove(req.params.id));
  }));

  return r;
}
