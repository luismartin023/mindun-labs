/**
 * Repositorio de `profile` (fila única id='profile').
 */
import { J } from '../db.js';
import { nowIso } from '../../../domain/model.js';

const PROFILE_ID = 'profile';

export function rowToProfile(r) {
  if (!r) return null;
  return {
    id: r.id,
    displayName: r.display_name,
    level: r.level ?? null,
    power: r.power ?? null,
    avatarPath: r.avatar_path ?? null,
    notes: r.notes ?? null,
    prefs: J.parse(r.prefs, {}),
    lastReviewedAt: r.last_reviewed_at ?? null,
    updatedAt: r.updated_at,
  };
}

export function profileToRow(d) {
  return {
    id: d.id || PROFILE_ID,
    display_name: d.displayName ?? 'Jugador',
    level: d.level ?? null,
    power: d.power ?? null,
    avatar_path: d.avatarPath ?? null,
    notes: d.notes ?? null,
    prefs: J.str(d.prefs ?? {}),
    last_reviewed_at: d.lastReviewedAt ?? null,
    updated_at: d.updatedAt || nowIso(),
  };
}

export function createProfileRepository(db) {
  const stmtGet = db.prepare('SELECT * FROM profile WHERE id = ?');
  const stmtUpsert = db.prepare(`INSERT INTO profile
    (id, display_name, level, power, avatar_path, notes, prefs, last_reviewed_at, updated_at)
    VALUES (@id, @display_name, @level, @power, @avatar_path, @notes, @prefs,
            @last_reviewed_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      display_name = @display_name, level = @level, power = @power,
      avatar_path = @avatar_path, notes = @notes, prefs = @prefs,
      last_reviewed_at = @last_reviewed_at, updated_at = @updated_at`);

  return {
    get() { return rowToProfile(stmtGet.get(PROFILE_ID)); },

    /** Devuelve el perfil creando la fila por defecto si no existe. */
    ensure() {
      let p = this.get();
      if (!p) {
        stmtUpsert.run(profileToRow({ id: PROFILE_ID }));
        p = this.get();
      }
      return p;
    },

    update(patch) {
      const merged = { ...this.ensure(), ...patch, id: PROFILE_ID, updatedAt: nowIso() };
      stmtUpsert.run(profileToRow(merged));
      return this.get();
    },
  };
}
