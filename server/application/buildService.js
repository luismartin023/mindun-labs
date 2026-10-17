/**
 * Servicio de builds: CRUD + puntuación calculada al leer + generador.
 * El motor (scoring/engine.js, builds/generator.js) vive en domain/ y se
 * carga perezosamente; si aún no existe, se responde 503 en los endpoints
 * que lo necesitan — nunca se inventa un reemplazo.
 */
import { badRequest, notFound, unavailable } from '../http/errors.js';
import { BUILD_ARTIFACT_SLOTS } from '../domain/model.js';
import { domain } from './domainBridge.js';

const MAX_LIMIT = 200;
const MAX_EXPLORE = 120000;

async function validate(data) {
  const mod = await domain('catalog/validators.js');
  if (!mod?.validateBuild) return { skipped: true };
  const res = mod.validateBuild(data);
  if (res && res.valid === false) {
    throw badRequest('La build no supera la validación', {
      valid: false, errors: res.errors ?? [], warnings: res.warnings ?? [],
    });
  }
  return res;
}

export function createBuildService({ buildRepo, itemRepo, enchantmentRepo, inventoryRepo }) {
  /** Mapas id→registro que el motor de puntuación espera. */
  function engineMaps() {
    const itemsById = Object.fromEntries(itemRepo.listAll().map((i) => [i.id, i]));
    const enchantsById = Object.fromEntries(enchantmentRepo.listAll().map((e) => [e.id, e]));
    const ownedIds = new Set(itemRepo.ownedIds());
    return { itemsById, enchantsById, ownedIds };
  }

  async function scoreOf(build, weights) {
    const mod = await domain('scoring/engine.js');
    if (!mod?.scoreBuild) return null; // motor aún no entregado
    const { itemsById, enchantsById, ownedIds } = engineMaps();
    return mod.scoreBuild(build, {
      itemsById, enchantsById, ownedIds,
      weights: weights ?? build.weights ?? {},
    });
  }

  function normalizeArtifacts(ids) {
    const arr = Array.isArray(ids) ? ids.slice(0, BUILD_ARTIFACT_SLOTS) : [];
    while (arr.length < BUILD_ARTIFACT_SLOTS) arr.push(null);
    return arr.map((v) => (typeof v === 'string' ? v : null));
  }

  return {
    async list(query) { return buildRepo.list(query); },

    /** Detalle con `score` recalculado por el motor (null si no disponible). */
    async get(id) {
      const build = buildRepo.getById(id);
      if (!build) throw notFound(`Build no encontrada: ${id}`);
      const score = await scoreOf(build);
      return { ...build, score: score ?? build.score ?? null };
    },

    async create(data) {
      if (!data?.name || !String(data.name).trim()) throw badRequest('name es obligatorio');
      const build = {
        ...data,
        name: String(data.name).trim(),
        artifactItemIds: normalizeArtifacts(data.artifactItemIds),
        enchantChoices: data.enchantChoices ?? {},
        weights: data.weights ?? {},
        status: data.status ?? 'draft',
        isFavorite: !!data.isFavorite,
      };
      await validate(build);
      return buildRepo.create(build);
    },

    async update(id, patch) {
      const existing = buildRepo.getById(id);
      if (!existing) throw notFound(`Build no encontrada: ${id}`);
      const clean = { ...patch };
      if (clean.artifactItemIds !== undefined) {
        clean.artifactItemIds = normalizeArtifacts(clean.artifactItemIds);
      }
      const merged = { ...existing, ...clean };
      await validate(merged);
      return buildRepo.update(id, clean);
    },

    async duplicate(id) {
      const src = buildRepo.getById(id);
      if (!src) throw notFound(`Build no encontrada: ${id}`);
      const { id: _id, createdAt: _c, updatedAt: _u, score: _s, ...rest } = src;
      return buildRepo.create({ ...rest, name: `${src.name} (copia)` });
    },

    async remove(id) {
      if (!buildRepo.remove(id)) throw notFound(`Build no encontrada: ${id}`);
      return { deleted: true, id };
    },

    /**
     * Generador de combinaciones. Se ejecuta con un AbortController por
     * petición (la ruta conecta req.on('close') → abort()).
     */
    async generate(body = {}, { signal } = {}) {
      const mod = await domain('builds/generator.js');
      if (!mod?.generateBuilds) {
        throw unavailable('El generador de builds (domain/builds/generator.js) no está disponible');
      }
      const items = itemRepo.listAll();
      const enchantments = enchantmentRepo.listAll();
      const ownedIds = new Set(itemRepo.ownedIds());
      const limit = Math.min(Math.max(1, Number(body.limit) || 20), MAX_LIMIT);
      const maxExplore = Math.min(Math.max(1, Number(body.maxExplore) || 60000), MAX_EXPLORE);
      return mod.generateBuilds({
        items,
        ownedIds,
        enchantments,
        constraints: body.constraints ?? {},
        weights: body.weights ?? {},
        limit,
        maxExplore,
        onProgress: typeof body.onProgress === 'function' ? body.onProgress : undefined,
        signal,
      });
    },

    /** Desglose de puntuación de una build parcial (score-preview). */
    async scorePreview(body = {}) {
      const mod = await domain('scoring/engine.js');
      if (!mod?.scoreBuild) {
        throw unavailable('El motor de puntuación (domain/scoring/engine.js) no está disponible');
      }
      const { itemsById, enchantsById, ownedIds } = engineMaps();
      return mod.scoreBuild(body, {
        itemsById, enchantsById, ownedIds,
        weights: body.weights ?? {},
      });
    },
  };
}
