import { NextResponse } from "next/server";
import { getTopTags, getHotTags } from "@/lib/topics";

export const runtime = "nodejs";

export async function GET() {
  const top = getTopTags(10);
  const hot = getHotTags(10, 7);
  return NextResponse.json({ top, hot });
}
