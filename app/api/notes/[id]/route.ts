import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const noteId = Number(id);
  if (!Number.isFinite(noteId)) return NextResponse.json({ error: "bad id" }, { status: 400 });
  const db = getDb();
  const note = db
    .prepare("SELECT id, raw, created_at, processed_at FROM notes WHERE id = ?")
    .get(noteId);
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ note });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const noteId = Number(id);
  if (!Number.isFinite(noteId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const db = getDb();
  // Collect atom ids first to clean embeddings + FTS (those don't cascade).
  const atomIds = db
    .prepare("SELECT id FROM atoms WHERE note_id = ?")
    .all(noteId) as { id: number }[];

  const tx = db.transaction(() => {
    for (const { id: aid } of atomIds) {
      db.prepare("DELETE FROM atom_embeddings WHERE atom_id = ?").run(BigInt(aid));
      db.prepare("DELETE FROM atom_fts WHERE rowid = ?").run(aid);
    }
    db.prepare("DELETE FROM notes WHERE id = ?").run(noteId);
  });
  tx();
  return NextResponse.json({ ok: true, removedAtoms: atomIds.length });
}
