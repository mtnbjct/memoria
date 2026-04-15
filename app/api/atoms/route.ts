import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
  const db = getDb();
  const total = (db.prepare("SELECT COUNT(*) as c FROM atoms").get() as { c: number }).c;
  const atoms = db
    .prepare(
      `SELECT id as atom_id, note_id, heading, summary, content, created_at
       FROM atoms ORDER BY id DESC LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as {
      atom_id: number; note_id: number; heading: string; summary: string; content: string; created_at: string;
    }[];

  if (atoms.length === 0) return NextResponse.json({ atoms: [], total });

  const ids = atoms.map((a) => a.atom_id);
  const ph = ids.map(() => "?").join(",");
  const tagRows = db
    .prepare(
      `SELECT at.atom_id, t.name FROM atom_tags at JOIN tags t ON t.id = at.tag_id
       WHERE at.atom_id IN (${ph})`
    )
    .all(...ids) as { atom_id: number; name: string }[];
  const tagMap = new Map<number, string[]>();
  tagRows.forEach((r) => {
    const arr = tagMap.get(r.atom_id) ?? [];
    arr.push(r.name);
    tagMap.set(r.atom_id, arr);
  });

  return NextResponse.json({
    atoms: atoms.map((a) => ({ ...a, tags: tagMap.get(a.atom_id) ?? [] })),
    total,
  });
}
