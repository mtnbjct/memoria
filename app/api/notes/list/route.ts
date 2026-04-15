import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { matchingAtomIds, type Filter } from "@/lib/explore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const filters: Filter[] = body?.filters ?? [];
  const limit = Number(body?.limit ?? 50);
  const offset = Number(body?.offset ?? 0);
  const db = getDb();

  if (filters.length === 0) {
    const total = (db.prepare("SELECT COUNT(*) as c FROM notes").get() as { c: number }).c;
    const notes = db
      .prepare(
        `SELECT id, raw, created_at, processed_at
         FROM notes ORDER BY id DESC LIMIT ? OFFSET ?`
      )
      .all(limit, offset);
    return NextResponse.json({ notes, total });
  }

  const { ids } = await matchingAtomIds(filters);
  if (ids.length === 0) return NextResponse.json({ notes: [], total: 0 });

  const ph = ids.map(() => "?").join(",");
  const total = (db
    .prepare(
      `SELECT COUNT(DISTINCT n.id) as c
       FROM notes n JOIN atoms a ON a.note_id = n.id
       WHERE a.id IN (${ph})`
    )
    .get(...ids) as { c: number }).c;
  const notes = db
    .prepare(
      `SELECT DISTINCT n.id, n.raw, n.created_at, n.processed_at
       FROM notes n JOIN atoms a ON a.note_id = n.id
       WHERE a.id IN (${ph})
       ORDER BY n.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...ids, limit, offset);
  return NextResponse.json({ notes, total });
}
