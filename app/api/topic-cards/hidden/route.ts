import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const db = getDb();
  const tags = db
    .prepare("SELECT tag_name, updated_at FROM topic_prefs WHERE hidden = 1 ORDER BY updated_at DESC")
    .all() as { tag_name: string; updated_at: string }[];
  return NextResponse.json({ tags });
}
