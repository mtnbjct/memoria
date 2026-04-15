import { NextRequest, NextResponse } from "next/server";
import { setTaskStatus } from "@/lib/tasks";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const taskId = Number(id);
  const body = await req.json();
  const status = body?.status;
  if (status !== "open" && status !== "done") {
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  }
  setTaskStatus(taskId, status);
  return NextResponse.json({ ok: true });
}
