import { getDb } from "./db";

/**
 * Rank tags by how recently their atoms were added.
 * Uses atom-position (not calendar time) so vacations / usage gaps don't distort results.
 *
 * Weights:
 *   - Atom is among top 20% most recent atoms -> x3
 *   - Atom is among top 50% most recent atoms -> x2
 *   - Otherwise                               -> x1
 *
 * `atom_id` is monotonically increasing (AUTOINCREMENT), so ordering by id DESC
 * reflects insertion order regardless of wall-clock gaps.
 */
export function getHotTags(limit = 20): { name: string; score: number }[] {
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM atoms").get() as { c: number }).c;
  if (total === 0) return [];
  const top20 = Math.max(1, Math.ceil(total * 0.2));
  const top50 = Math.max(1, Math.ceil(total * 0.5));
  return db
    .prepare(
      `WITH ranked AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY id DESC) AS rn FROM atoms
       ),
       weighted AS (
         SELECT id,
                CASE
                  WHEN rn <= ? THEN 3
                  WHEN rn <= ? THEN 2
                  ELSE 1
                END AS w
         FROM ranked
       )
       SELECT t.name, SUM(w.w) AS score
       FROM atom_tags at
       JOIN weighted w ON w.id = at.atom_id
       JOIN tags t ON t.id = at.tag_id
       GROUP BY t.id
       ORDER BY score DESC, t.name
       LIMIT ?`
    )
    .all(top20, top50, limit) as { name: string; score: number }[];
}

/**
 * Same ranking, but restricted to atoms within the given id set.
 * Used when the user has active filters in the UI.
 */
export function getHotTagsAmongAtoms(
  atomIds: number[],
  excludedTags: string[],
  limit = 20
): { name: string; score: number }[] {
  if (atomIds.length === 0) return [];
  const db = getDb();
  const top20 = Math.max(1, Math.ceil(atomIds.length * 0.2));
  const top50 = Math.max(1, Math.ceil(atomIds.length * 0.5));
  const idPh = atomIds.map(() => "?").join(",");
  const exPh = excludedTags.map(() => "?").join(",") || "''";

  return db
    .prepare(
      `WITH ranked AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY id DESC) AS rn
         FROM atoms WHERE id IN (${idPh})
       ),
       weighted AS (
         SELECT id,
                CASE
                  WHEN rn <= ? THEN 3
                  WHEN rn <= ? THEN 2
                  ELSE 1
                END AS w
         FROM ranked
       )
       SELECT t.name, SUM(w.w) AS score
       FROM atom_tags at
       JOIN weighted w ON w.id = at.atom_id
       JOIN tags t ON t.id = at.tag_id
       ${excludedTags.length > 0 ? `WHERE t.name NOT IN (${exPh})` : ""}
       GROUP BY t.id
       ORDER BY score DESC, t.name
       LIMIT ?`
    )
    .all(...atomIds, top20, top50, ...excludedTags, limit) as { name: string; score: number }[];
}
