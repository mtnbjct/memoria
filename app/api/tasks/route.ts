import { NextRequest, NextResponse } from "next/server";
import { listTasks, type TaskStatus, type TaskSort } from "@/lib/tasks";
import type { Filter } from "@/lib/explore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const filters: Filter[] = body?.filters ?? [];
  const status: TaskStatus | "all" = body?.status ?? "open";
  const sort: TaskSort = body?.sort ?? "due";
  const limit = Number(body?.limit ?? 50);
  const offset = Number(body?.offset ?? 0);
  const { tasks, total } = await listTasks({ filters, status, sort, limit, offset });
  return NextResponse.json({ tasks, total });
}
