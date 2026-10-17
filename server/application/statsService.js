/**
 * Servicio de estadísticas del laboratorio: contadores agregados vía repos.
 */
export function createStatsService({ itemRepo, inventoryRepo, enchantmentRepo, buildRepo, tierListRepo }) {
  return {
    async summary() {
      const inv = inventoryRepo.totals();
      const itemsByStatus = itemRepo.countBy('dataStatus');
      const enchByStatus = enchantmentRepo.listAll()
        .reduce((acc, e) => { acc[e.dataStatus] = (acc[e.dataStatus] || 0) + 1; return acc; }, {});
      return {
        items: {
          total: itemRepo.count(),
          byCategory: itemRepo.countBy('category'),
          byRarity: itemRepo.countBy('rarity'),
          byDataStatus: itemsByStatus,
          owned: itemRepo.ownedIds().length,
        },
        inventory: {
          entries: inv.entries,
          totalQuantity: inv.quantity,
          favorites: inv.favorites,
          gilded: inv.gilded,
        },
        enchantments: {
          total: enchantmentRepo.count(),
          byType: enchantmentRepo.countByType(),
          byDataStatus: enchByStatus,
        },
        builds: { total: buildRepo.count(), favorites: buildRepo.countFavorites() },
        tierlists: { total: tierListRepo.count() },
        unverified: {
          items: itemsByStatus.unverified ?? 0,
          enchantments: enchByStatus.unverified ?? 0,
        },
      };
    },
  };
}
