/**
 * MINDUN LABS — punto de entrada del servidor.
 * Wiring: db → repositorios → servicios → routers → estáticos → errores.
 */
import express from 'express';
import { join } from 'node:path';
import { config } from './config.js';
import { openDb } from './infrastructure/db/db.js';
import { ensureUploadsDir } from './infrastructure/fs/imageStore.js';

// Repositorios
import { createItemRepository } from './infrastructure/db/repositories/itemRepository.js';
import { createInventoryRepository } from './infrastructure/db/repositories/inventoryRepository.js';
import { createEnchantmentRepository } from './infrastructure/db/repositories/enchantmentRepository.js';
import { createBuildRepository } from './infrastructure/db/repositories/buildRepository.js';
import { createTierListRepository } from './infrastructure/db/repositories/tierListRepository.js';
import { createComparisonRepository } from './infrastructure/db/repositories/comparisonRepository.js';
import { createTableViewRepository } from './infrastructure/db/repositories/tableViewRepository.js';
import { createProfileRepository } from './infrastructure/db/repositories/profileRepository.js';
import { createAssetRepository } from './infrastructure/db/repositories/assetRepository.js';
import { createExportHistoryRepository } from './infrastructure/db/repositories/exportHistoryRepository.js';
import { createImportBatchRepository } from './infrastructure/db/repositories/importBatchRepository.js';
import { createKvRepository } from './infrastructure/db/repositories/kvRepository.js';

// Servicios
import { createItemService } from './application/itemService.js';
import { createInventoryService } from './application/inventoryService.js';
import { createEnchantmentService } from './application/enchantmentService.js';
import { createBuildService } from './application/buildService.js';
import { createTierListService } from './application/tierListService.js';
import { createStatsService } from './application/statsService.js';
import { createProfileService } from './application/profileService.js';
import { createAssetService } from './application/assetService.js';
import { createExportService } from './application/exportService.js';
import { createImportService } from './application/importService.js';

// Routers
import { createMetaRouter } from './api/meta.js';
import { createItemsRouter } from './api/items.js';
import { createInventoryRouter } from './api/inventory.js';
import { createEnchantmentsRouter } from './api/enchantments.js';
import { createBuildsRouter } from './api/builds.js';
import { createTierListsRouter } from './api/tierlists.js';
import { createComparisonsRouter } from './api/comparisons.js';
import { createTableViewsRouter } from './api/tableViews.js';
import { createProfileRouter } from './api/profile.js';
import { createStatsRouter } from './api/stats.js';
import { createAssetsRouter } from './api/assets.js';
import { createExportRouter } from './api/export.js';
import { createImportRouter } from './api/import.js';

// HTTP
import { apiNotFound, errorHandler } from './http/errors.js';

// ---------- Wiring ----------
const db = openDb(config.dbPath);
ensureUploadsDir();

const repos = {
  itemRepo: createItemRepository(db),
  inventoryRepo: createInventoryRepository(db),
  enchantmentRepo: createEnchantmentRepository(db),
  buildRepo: createBuildRepository(db),
  tierListRepo: createTierListRepository(db),
  comparisonRepo: createComparisonRepository(db),
  tableViewRepo: createTableViewRepository(db),
  profileRepo: createProfileRepository(db),
  assetRepo: createAssetRepository(db),
  exportHistoryRepo: createExportHistoryRepository(db),
  importBatchRepo: createImportBatchRepository(db),
  kvRepo: createKvRepository(db),
};

const statsService = createStatsService(repos);
const services = {
  itemService: createItemService(repos),
  inventoryService: createInventoryService(repos),
  enchantmentService: createEnchantmentService(repos),
  buildService: createBuildService(repos),
  tierListService: createTierListService(repos),
  statsService,
  profileService: createProfileService(repos),
  assetService: createAssetService(repos),
  exportService: createExportService({ ...repos, statsService }),
  importService: createImportService({ db, importBatchRepo: repos.importBatchRepo }),
};

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

// API
app.use('/api/meta', createMetaRouter(repos));
app.use('/api/items', createItemsRouter(services.itemService));
app.use('/api/inventory', createInventoryRouter(services.inventoryService));
app.use('/api/enchantments', createEnchantmentsRouter(services.enchantmentService));
app.use('/api/builds', createBuildsRouter(services.buildService));
app.use('/api/tierlists', createTierListsRouter(services.tierListService));
app.use('/api/comparisons', createComparisonsRouter(repos.comparisonRepo));
app.use('/api/table-views', createTableViewsRouter(repos.tableViewRepo));
app.use('/api/profile', createProfileRouter(services.profileService));
app.use('/api/stats', createStatsRouter(services.statsService));
app.use('/api/assets', createAssetsRouter(services.assetService));
app.use('/api/export', createExportRouter(services.exportService));
app.use('/api/import', createImportRouter(services.importService));
app.use('/api', apiNotFound);

// Imágenes del catálogo/subidas — ANTES del fallback SPA.
app.use('/images', express.static(config.imagesDir, {
  fallthrough: true,
  maxAge: '7d',
  immutable: false,
}));

// Frontend estático
app.use(express.static(config.publicDir));

// Fallback SPA: cualquier GET no-/api sirve index.html
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  res.sendFile(join(config.publicDir, 'index.html'), (err) => { if (err) next(err); });
});

app.use(errorHandler);

// ---------- Arranque ----------
const server = app.listen(config.port, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   MINDUN LABS — Minecraft Dungeons Lab       ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log(`  » Servidor:   http://localhost:${config.port}`);
  console.log(`  » API:        http://localhost:${config.port}/api/meta`);
  console.log(`  » Datos:      ${config.dataDir}`);
  console.log(`  » DB:         ${config.dbPath}`);
  console.log('');
});

function shutdown(signal) {
  console.log(`\n[${signal}] Cerrando servidor…`);
  server.close(() => {
    try { db.close(); } catch { /* ya cerrada */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
