import { NextRequest, NextResponse } from "next/server";
import { setHidden, setPinned } from "@/lib/topic-cards";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ tag: string }> }) {
  const { tag } = await ctx.params;
  const tagName = decodeURIComponent(tag);
  const body = await req.json();
  if (typeof body?.pinned === "boolean") setPinned(tagName, body.pinned);
  if (typeof body?.hidden === "boolean") setHidden(tagName, body.hidden);
  return NextResponse.json({ ok: true });
}
