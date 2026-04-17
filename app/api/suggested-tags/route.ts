import { NextRequest, NextResponse } from "next/server";
import { matchingAtomIds, type Filter } from "@/lib/explore";
import { getHotTags, getHotTagsAmongAtoms } from "@/lib/hot-tags";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const filters: Filter[] = body?.filters ?? [];
  const limit = Number(body?.limit ?? 20);

  if (filters.length === 0) {
    const tags = getHotTags(limit).map(({ name, score }) => ({ name, count: score }));
    return NextResponse.json({ tags });
  }

  const { ids } = await matchingAtomIds(filters);
  if (ids.length === 0) return NextResponse.json({ tags: [] });

  const excluded = filters.filter((f) => f.type === "tag").map((f) => f.value as string);
  const tags = getHotTagsAmongAtoms(ids, excluded, limit).map(({ name, score }) => ({ name, count: score }));
  return NextResponse.json({ tags });
}
