import { NextResponse } from "next/server";
import { listActiveTopicCards } from "@/lib/topic-cards";

export const runtime = "nodejs";

export async function GET() {
  const cards = listActiveTopicCards();
  return NextResponse.json({ cards });
}
