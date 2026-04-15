import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ingestNote } from "@/lib/ingest";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { raw } = await req.json();
  if (typeof raw !== "string" || !raw.trim()) {
    return NextResponse.json({ error: "raw text required" }, { status: 400 });
  }
  const db = getDb();
  const r = db.prepare("INSERT INTO notes (raw) VALUES (?)").run(raw);
  const noteId = Number(r.lastInsertRowid);

  ingestNote(noteId, raw).catch((err) => console.error("ingest failed", noteId, err));

  return NextResponse.json({ id: noteId });
}

export async function GET(req: NextRequest) {
  const db = getDb();
  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const notes = db
    .prepare(
      `SELECT id, raw, created_at, processed_at
       FROM notes ORDER BY id DESC LIMIT ?`
    )
    .all(limit);
  return NextResponse.json({ notes });
}
