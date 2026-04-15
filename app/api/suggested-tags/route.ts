import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { matchingAtomIds, type Filter } from "@/lib/explore";

export const runtime = "nodejs";

// Recency-weighted score: last 7 days ×3, last 30 days ×2, older ×1
const RECENCY_SCORE = `
  CASE
    WHEN a.created_at >= datetime('now', '-7 days') THEN 3
    WHEN a.created_at >= datetime('now', '-30 days') THEN 2
    ELSE 1
  END
`;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const filters: Filter[] = body?.filters ?? [];
  const limit = Number(body?.limit ?? 20);
  const db = getDb();

  if (filters.length === 0) {
    const rows = db
      .prepare(
        `SELECT t.name, SUM(${RECENCY_SCORE}) as count
         FROM atom_tags at
         JOIN atoms a ON a.id = at.atom_id
         JOIN tags t ON t.id = at.tag_id
         GROUP BY t.id
         ORDER BY count DESC, t.name
         LIMIT ?`
      )
      .all(limit) as { name: string; count: number }[];
    return NextResponse.json({ tags: rows });
  }

  const { ids } = await matchingAtomIds(filters);
  if (ids.length === 0) return NextResponse.json({ tags: [] });

  const excluded = filters.filter((f) => f.type === "tag").map((f) => f.value as string);
  const ph = ids.map(() => "?").join(",");
  const exPh = excluded.map(() => "?").join(",") || "''";

  const rows = db
    .prepare(
      `SELECT t.name, SUM(${RECENCY_SCORE}) as count
       FROM atom_tags at
       JOIN atoms a ON a.id = at.atom_id
       JOIN tags t ON t.id = at.tag_id
       WHERE at.atom_id IN (${ph})
         ${excluded.length > 0 ? `AND t.name NOT IN (${exPh})` : ""}
       GROUP BY t.id
       ORDER BY count DESC, t.name
       LIMIT ?`
    )
    .all(...ids, ...excluded, limit) as { name: string; count: number }[];

  return NextResponse.json({ tags: rows });
}
