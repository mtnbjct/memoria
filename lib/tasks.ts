import { getDb } from "./db";
import { matchingAtomIds, type Filter } from "./explore";

export type TaskStatus = "open" | "done";
export type TaskSort = "created" | "due";

export type Task = {
  id: number;
  atom_id: number;
  note_id: number;
  text: string;
  due_at: string | null;
  status: TaskStatus;
  created_at: string;
  completed_at: string | null;
  atom_heading: string;
  tags: string[];
};

export async function listTasks(opts: {
  filters: Filter[];
  status: TaskStatus | "all";
  sort: TaskSort;
  limit?: number;
  offset?: number;
}): Promise<{ tasks: Task[]; total: number }> {
  const db = getDb();
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  // Optional scoping by keyword filters (shared with atoms pane)
  let scopeClause = "";
  let scopeParams: (string | number)[] = [];
  if (opts.filters.length > 0) {
    const { ids } = await matchingAtomIds(opts.filters);
    if (ids.length === 0) return { tasks: [], total: 0 };
    scopeClause = `AND t.atom_id IN (${ids.map(() => "?").join(",")})`;
    scopeParams = ids;
  }

  const statusClause =
    opts.status === "all" ? "" : `AND t.status = '${opts.status === "done" ? "done" : "open"}'`;

  const orderClause =
    opts.sort === "due"
      ? `ORDER BY (t.due_at IS NULL) ASC, t.due_at ASC, t.id DESC`
      : `ORDER BY t.id DESC`;

  const total = (db
    .prepare(
      `SELECT COUNT(*) as c FROM tasks t WHERE 1=1 ${statusClause} ${scopeClause}`
    )
    .get(...scopeParams) as { c: number }).c;

  const rows = db
    .prepare(
      `SELECT t.id, t.atom_id, t.note_id, t.text, t.due_at, t.status,
              t.created_at, t.completed_at, a.heading AS atom_heading
       FROM tasks t JOIN atoms a ON a.id = t.atom_id
       WHERE 1=1 ${statusClause} ${scopeClause}
       ${orderClause}
       LIMIT ? OFFSET ?`
    )
    .all(...scopeParams, limit, offset) as Omit<Task, "tags">[];

  if (rows.length === 0) return { tasks: [], total };

  const atomIds = [...new Set(rows.map((r) => r.atom_id))];
  const ph = atomIds.map(() => "?").join(",");
  const tagRows = db
    .prepare(
      `SELECT at.atom_id, tg.name FROM atom_tags at JOIN tags tg ON tg.id = at.tag_id
       WHERE at.atom_id IN (${ph})`
    )
    .all(...atomIds) as { atom_id: number; name: string }[];
  const tagMap = new Map<number, string[]>();
  tagRows.forEach((r) => {
    const arr = tagMap.get(r.atom_id) ?? [];
    arr.push(r.name);
    tagMap.set(r.atom_id, arr);
  });

  return {
    tasks: rows.map((r) => ({ ...r, tags: tagMap.get(r.atom_id) ?? [] })),
    total,
  };
}

export function setTaskStatus(id: number, status: TaskStatus) {
  const db = getDb();
  const completed = status === "done" ? "datetime('now')" : "NULL";
  db.prepare(
    `UPDATE tasks SET status = ?, completed_at = ${completed} WHERE id = ?`
  ).run(status, id);
}
