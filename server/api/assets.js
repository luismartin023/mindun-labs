/**
 * /api/assets — lista / subida multipart (campo 'file') / editar / borrar.
 */
import { Router } from 'express';
import multer from 'multer';
import { extname } from 'node:path';
import { asyncH, listQuery, paged } from '../http/helpers.js';
import { badRequest } from '../http/errors.js';
import { uuid } from '../domain/model.js';
import { config } from '../config.js';
import { ensureUploadsDir } from '../infrastructure/fs/imageStore.js';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MIME_EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, ensureUploadsDir()),
    filename: (req, file, cb) => {
      const ext = MIME_EXT[file.mimetype] || extname(file.originalname || '') || '.bin';
      cb(null, `${Date.now()}-${uuid()}${ext}`);
    },
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(badRequest(`Tipo de imagen no admitido: ${file.mimetype} (png, jpg, webp, gif)`));
      return;
    }
    cb(null, true);
  },
});

export function createAssetsRouter(assetService) {
  const r = Router();

  r.get('/', asyncH(async (req, res) => {
    const q = listQuery(req.query, config);
    const result = await assetService.list(q);
    res.json(paged(result, q));
  }));

  r.post('/', upload.single('file'), asyncH(async (req, res) => {
    const asset = await assetService.registerUpload(req.file, req.body ?? {});
    res.status(201).json(asset);
  }));

  r.get('/:id', asyncH(async (req, res) => {
    res.json(await assetService.get(req.params.id));
  }));

  r.patch('/:id', asyncH(async (req, res) => {
    res.json(await assetService.update(req.params.id, req.body ?? {}));
  }));

  r.delete('/:id', asyncH(async (req, res) => {
    res.json(await assetService.remove(req.params.id));
  }));

  return r;
}
