import { NextRequest, NextResponse } from "next/server";
import { ask } from "@/lib/ask";
import type { Filter } from "@/lib/explore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const question: string = body?.question ?? "";
  const filters: Filter[] = body?.filters ?? [];
  if (!question.trim()) return NextResponse.json({ error: "question required" }, { status: 400 });
  const result = await ask(question, filters);
  return NextResponse.json(result);
}
