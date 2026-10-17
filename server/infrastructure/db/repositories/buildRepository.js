/**
 * Repositorio de `builds` guardadas.
 */
import { J } from '../db.js';
import { uuid, nowIso } from '../../../domain/model.js';

const COLS = `id, name, goal, playstyle, melee_item_id, ranged_item_id,
  armor_item_id, artifact_item_ids, enchant_choices, weights, score, notes,
  is_favorite, status, created_at, updated_at`;

const SORTABLE = {
  name: 'name COLLATE NOCASE',
  goal: 'goal',
  status: 'status',
  favorite: 'is_favorite',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

export function rowToBuild(r) {
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    goal: r.goal ?? null,
    playstyle: r.playstyle ?? null,
    meleeItemId: r.melee_item_id ?? null,
    rangedItemId: r.ranged_item_id ?? null,
    armorItemId: r.armor_item_id ?? null,
    artifactItemIds: J.parse(r.artifact_item_ids, [null, null, null]),
    enchantChoices: J.parse(r.enchant_choices, {}),
    weights: J.parse(r.weights, {}),
    score: J.parse(r.score, null),
    notes: r.notes ?? null,
    isFavorite: !!r.is_favorite,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function buildToRow(d) {
  return {
    id: d.id,
    name: d.name,
    goal: d.goal ?? null,
    playstyle: d.playstyle ?? null,
    melee_item_id: d.meleeItemId ?? null,
    ranged_item_id: d.rangedItemId ?? null,
    armor_item_id: d.armorItemId ?? null,
    artifact_item_ids: J.str(d.artifactItemIds ?? [null, null, null]),
    enchant_choices: J.str(d.enchantChoices ?? {}),
    weights: J.str(d.weights ?? {}),
    score: d.score === undefined ? null : J.str(d.score),
    notes: d.notes ?? null,
    is_favorite: d.isFavorite ? 1 : 0,
    status: d.status ?? 'draft',
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

const like = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function createBuildRepository(db) {
  const stmtById = db.prepare(`SELECT ${COLS} FROM builds WHERE id = ?`);
  const stmtInsert = db.prepare(`INSERT INTO builds (${COLS}) VALUES (
    @id, @name, @goal, @playstyle, @melee_item_id, @ranged_item_id,
    @armor_item_id, @artifact_item_ids, @enchant_choices, @weights, @score,
    @notes, @is_favorite, @status, @created_at, @updated_at)`);
  const stmtUpdate = db.prepare(`UPDATE builds SET
    name = @name, goal = @goal, playstyle = @playstyle,
    melee_item_id = @melee_item_id, ranged_item_id = @ranged_item_id,
    armor_item_id = @armor_item_id, artifact_item_ids = @artifact_item_ids,
    enchant_choices = @enchant_choices, weights = @weights, score = @score,
    notes = @notes, is_favorite = @is_favorite, status = @status,
    updated_at = @updated_at
    WHERE id = @id`);
  const stmtDelete = db.prepare('DELETE FROM builds WHERE id = ?');
  const stmtCount = db.prepare('SELECT COUNT(*) AS c FROM builds');

  return {
    list(filters = {}) {
      const where = [];
      const params = [];
      if (filters.search) { where.push(`(name LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\')`); params.push(like(filters.search), like(filters.search)); }
      if (filters.goal) { where.push('goal = ?'); params.push(filters.goal); }
      if (filters.status) { where.push('status = ?'); params.push(filters.status); }
      if (filters.favorite !== undefined) { where.push('is_favorite = ?'); params.push(filters.favorite ? 1 : 0); }
      const sql = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const sortCol = SORTABLE[filters.sort] || 'updated_at';
      const dir = filters.order === 'desc' || !filters.sort ? 'DESC' : 'ASC';
      const total = db.prepare(`SELECT COUNT(*) AS c FROM builds ${sql}`).get(...params).c;
      const rows = db.prepare(
        `SELECT ${COLS} FROM builds ${sql} ORDER BY ${sortCol} ${dir} LIMIT ? OFFSET ?`,
      ).all(...params, filters.limit ?? 50, filters.offset ?? 0);
      return { rows: rows.map(rowToBuild), total };
    },

    listAll() {
      return db.prepare(`SELECT ${COLS} FROM builds`).all().map(rowToBuild);
    },

    getById(id) { return rowToBuild(stmtById.get(id)); },

    create(data) {
      const now = nowIso();
      const row = buildToRow({
        ...data,
        id: data.id || uuid(),
        createdAt: data.createdAt || now,
        updatedAt: data.updatedAt || now,
      });
      stmtInsert.run(row);
      return this.getById(row.id);
    },

    update(id, patch) {
      const existing = this.getById(id);
      if (!existing) return null;
      const row = buildToRow({ ...existing, ...patch, id, updatedAt: nowIso() });
      delete row.created_at; // node:sqlite rechaza named params ajenos al statement
      stmtUpdate.run(row);
      return this.getById(id);
    },

    remove(id) { return stmtDelete.run(id).changes > 0; },
    count() { return stmtCount.get().c; },
    countFavorites() {
      return db.prepare('SELECT COUNT(*) AS c FROM builds WHERE is_favorite = 1').get().c;
    },
  };
}
