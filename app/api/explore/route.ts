import { NextRequest, NextResponse } from "next/server";
import { explore, type Filter } from "@/lib/explore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const filters = (body?.filters ?? []) as Filter[];
  const offset = Number(body?.offset ?? 0);
  const limit = Number(body?.limit ?? 30);
  const result = await explore(filters, { offset, limit });
  return NextResponse.json(result);
}
