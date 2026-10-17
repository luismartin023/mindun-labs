/**
 * GET /api/meta — constantes del dominio + contadores para la shell.
 */
import { Router } from 'express';
import {
  ITEM_CATEGORIES, RARITIES, CATEGORY_LABELS, RARITY_LABELS,
  ENCHANT_TYPES, BUILD_GOALS, DATA_STATUSES,
} from '../domain/model.js';
import { asyncH } from '../http/helpers.js';

export function createMetaRouter({ itemRepo, enchantmentRepo, inventoryRepo, buildRepo, tierListRepo }) {
  const r = Router();
  r.get('/', asyncH(async (req, res) => {
    res.json({
      categories: ITEM_CATEGORIES,
      rarities: RARITIES,
      categoryLabels: CATEGORY_LABELS,
      rarityLabels: RARITY_LABELS,
      enchantTypes: ENCHANT_TYPES,
      buildGoals: BUILD_GOALS,
      dataStatuses: DATA_STATUSES,
      counts: {
        items: itemRepo.count(),
        enchantments: enchantmentRepo.count(),
        inventory: inventoryRepo.count(),
        builds: buildRepo.count(),
        tierlists: tierListRepo.count(),
      },
    });
  }));
  return r;
}
