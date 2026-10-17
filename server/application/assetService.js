/**
 * Servicio de assets (imágenes subidas / registradas).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { badRequest, notFound } from '../http/errors.js';
import { unlinkIfUpload } from '../infrastructure/fs/imageStore.js';

export function createAssetService({ assetRepo, itemRepo }) {
  return {
    async list(query) { return assetRepo.list(query); },

    async get(id) {
      const a = assetRepo.getById(id);
      if (!a) throw notFound(`Asset no encontrado: ${id}`);
      return a;
    },

    /**
     * Registra una subida de multer como asset.
     * @param {object} file  req.file de multer (destination/filename/mimetype/size)
     * @param {object} fields {category,itemId,reviewStatus}
     */
    async registerUpload(file, fields = {}) {
      if (!file) throw badRequest('Falta el archivo (campo multipart "file")');
      let itemId = fields.itemId || null;
      if (itemId) {
        const item = itemRepo.getById(itemId) ?? itemRepo.getBySlug(itemId);
        if (!item) throw badRequest(`El ítem no existe: ${itemId}`);
        itemId = item.id;
      }
      const checksum = createHash('sha1')
        .update(readFileSync(file.path))
        .digest('hex');
      return assetRepo.create({
        fileName: file.originalname || file.filename,
        category: fields.category || null,
        mime: file.mimetype,
        bytes: file.size,
        path: `/images/uploads/${file.filename}`,
        itemId,
        reviewStatus: fields.reviewStatus || 'unmatched',
        checksum,
      });
    },

    async update(id, patch) {
      const existing = assetRepo.getById(id);
      if (!existing) throw notFound(`Asset no encontrado: ${id}`);
      const clean = {};
      for (const k of ['fileName', 'category', 'itemId', 'reviewStatus']) {
        if (patch[k] !== undefined) clean[k] = patch[k];
      }
      if (clean.itemId && !itemRepo.getById(clean.itemId)) {
        throw badRequest(`El ítem no existe: ${clean.itemId}`);
      }
      return assetRepo.update(id, clean);
    },

    async remove(id) {
      const asset = assetRepo.getById(id);
      if (!asset) throw notFound(`Asset no encontrado: ${id}`);
      assetRepo.remove(id);
      // Borra el fichero solo si vive bajo /images/uploads (nunca archivos seed).
      unlinkIfUpload(asset.path);
      return { deleted: true, id };
    },
  };
}
