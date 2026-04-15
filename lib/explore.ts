import { getDb } from "./db";
import { embed } from "./azure";

export type Filter =
  | { type: "tag"; value: string }
  | { type: "text"; value: string }
  | { type: "note"; value: number };

export type RelatedTag = { name: string; count: number };
export type RelatedAtom = {
  atom_id: number;
  note_id: number;
  heading: string;
  summary: string;
  content: string;
  created_at: string;
  tags: string[];
};

export type ExploreResult = {
  filters: Filter[];
  matchedCount: number;
  relatedTags: RelatedTag[];
  atoms: RelatedAtom[];
};

const TEXT_SEED_LIMIT = 200; // free-text filter candidate pool size (used for vector ranking)
const TAG_LIMIT = 20;
const DEFAULT_ATOM_LIMIT = 30;

export async function matchingAtomIds(
  filters: Filter[]
): Promise<{ ids: number[]; lastTextVec: number[] | null }> {
  if (filters.length === 0) return { ids: [], lastTextVec: null };
  const perFilterSets: Set<number>[] = [];
  let lastTextVec: number[] | null = null;
  for (const f of filters) {
    const { ids, vec } = await atomsForFilter(f);
    perFilterSets.push(new Set(ids));
    if (vec) lastTextVec = vec;
  }
  let matched = perFilterSets[0];
  for (let i = 1; i < perFilterSets.length; i++) {
    const next = new Set<number>();
    for (const id of matched) if (perFilterSets[i].has(id)) next.add(id);
    matched = next;
  }
  return { ids: [...matched], lastTextVec };
}

export async function explore(
  filters: Filter[],
  opts: { offset?: number; limit?: number } = {}
): Promise<ExploreResult> {
  const db = getDb();
  const offset = opts.offset ?? 0;
  const atomLimit = opts.limit ?? DEFAULT_ATOM_LIMIT;

  if (filters.length === 0) {
    return { filters, matchedCount: 0, relatedTags: [], atoms: [] };
  }

  const { ids, lastTextVec } = await matchingAtomIds(filters);

  if (ids.length === 0) {
    return { filters, matchedCount: 0, relatedTags: [], atoms: [] };
  }
  const placeholders = ids.map(() => "?").join(",");
  const excludedTags = filters
    .filter((f) => f.type === "tag")
    .map((f) => f.value as string);
  const excludedPlaceholders = excludedTags.map(() => "?").join(",") || "''";

  const tagRows = db
    .prepare(
      `SELECT t.name, COUNT(*) as count
       FROM atom_tags at JOIN tags t ON t.id = at.tag_id
       WHERE at.atom_id IN (${placeholders})
         ${excludedTags.length > 0 ? `AND t.name NOT IN (${excludedPlaceholders})` : ""}
       GROUP BY t.id
       ORDER BY count DESC, t.name
       LIMIT ?`
    )
    .all(...ids, ...excludedTags, TAG_LIMIT) as RelatedTag[];

  let atomRows: Omit<RelatedAtom, "tags">[];
  if (lastTextVec) {
    // Rank by vector similarity; dynamically grow pool so offset is reachable.
    const poolSize = Math.max(TEXT_SEED_LIMIT, offset + atomLimit);
    const buf = Buffer.from(new Float32Array(lastTextVec).buffer);
    atomRows = db
      .prepare(
        `SELECT a.id as atom_id, a.note_id, a.heading, a.summary, a.content, a.created_at
         FROM atom_embeddings e
         JOIN atoms a ON a.id = e.atom_id
         WHERE e.embedding MATCH ? AND e.k = ?
           AND a.id IN (${placeholders})
         ORDER BY e.distance
         LIMIT ? OFFSET ?`
      )
      .all(buf, poolSize, ...ids, atomLimit, offset) as Omit<RelatedAtom, "tags">[];
  } else {
    atomRows = db
      .prepare(
        `SELECT id as atom_id, note_id, heading, summary, content, created_at
         FROM atoms WHERE id IN (${placeholders})
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .all(...ids, atomLimit, offset) as Omit<RelatedAtom, "tags">[];
  }

  const atomIds = atomRows.map((a) => a.atom_id);
  const tagsPerAtom = new Map<number, string[]>();
  if (atomIds.length > 0) {
    const ph = atomIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT at.atom_id, t.name FROM atom_tags at JOIN tags t ON t.id = at.tag_id
         WHERE at.atom_id IN (${ph})`
      )
      .all(...atomIds) as { atom_id: number; name: string }[];
    rows.forEach((r) => {
      const arr = tagsPerAtom.get(r.atom_id) ?? [];
      arr.push(r.name);
      tagsPerAtom.set(r.atom_id, arr);
    });
  }

  return {
    filters,
    matchedCount: ids.length,
    relatedTags: tagRows,
    atoms: atomRows.map((a) => ({ ...a, tags: tagsPerAtom.get(a.atom_id) ?? [] })),
  };
}

async function atomsForFilter(f: Filter): Promise<{ ids: number[]; vec?: number[] }> {
  const db = getDb();
  if (f.type === "tag") {
    const rows = db
      .prepare(
        `SELECT at.atom_id FROM atom_tags at JOIN tags t ON t.id = at.tag_id
         WHERE t.name = ?`
      )
      .all(f.value) as { atom_id: number }[];
    return { ids: rows.map((r) => r.atom_id) };
  }
  if (f.type === "note") {
    const rows = db
      .prepare("SELECT id FROM atoms WHERE note_id = ?")
      .all(f.value) as { id: number }[];
    return { ids: rows.map((r) => r.id) };
  }
  // text: semantic nearest pool
  const vec = await embed(f.value);
  const buf = Buffer.from(new Float32Array(vec).buffer);
  const rows = db
    .prepare(
      `SELECT atom_id FROM atom_embeddings
       WHERE embedding MATCH ? AND k = ?
       ORDER BY distance`
    )
    .all(buf, TEXT_SEED_LIMIT) as { atom_id: number }[];
  return { ids: rows.map((r) => r.atom_id), vec };
}
