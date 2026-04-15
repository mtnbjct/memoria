import { getDb } from "./db";

export type TopTag = { name: string; count: number };
export type HotTag = { name: string; recent: number; all: number; score: number };

export function getTopTags(limit = 10): TopTag[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.name, COUNT(*) as count
       FROM atom_tags at JOIN tags t ON t.id = at.tag_id
       GROUP BY t.id
       ORDER BY count DESC LIMIT ?`
    )
    .all(limit) as TopTag[];
}

export function getHotTags(limit = 10, days = 7): HotTag[] {
  const db = getDb();
  const since = `-${days} days`;
  const rows = db
    .prepare(
      `WITH
        recent AS (
          SELECT at.tag_id, COUNT(*) AS c
          FROM atom_tags at JOIN atoms a ON a.id = at.atom_id
          WHERE a.created_at >= datetime('now', ?)
          GROUP BY at.tag_id
        ),
        total AS (
          SELECT tag_id, COUNT(*) AS c FROM atom_tags GROUP BY tag_id
        ),
        counts AS (
          SELECT
            (SELECT COUNT(*) FROM atoms WHERE created_at >= datetime('now', ?)) AS rn,
            (SELECT COUNT(*) FROM atoms) AS tn
        )
      SELECT t.name,
             r.c AS recent,
             total.c AS all_count,
             (CAST(r.c AS REAL) / NULLIF(counts.rn, 0)) /
             NULLIF(CAST(total.c AS REAL) / NULLIF(counts.tn, 0), 0) AS score
      FROM recent r
      JOIN total ON total.tag_id = r.tag_id
      JOIN tags t ON t.id = r.tag_id, counts
      WHERE r.c >= 2
      ORDER BY score DESC LIMIT ?`
    )
    .all(since, since, limit) as { name: string; recent: number; all_count: number; score: number }[];
  return rows.map((r) => ({ name: r.name, recent: r.recent, all: r.all_count, score: r.score }));
}
