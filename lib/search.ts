import { getDb } from "./db";
import { embed } from "./azure";

export type SearchHit = {
  atom_id: number;
  note_id: number;
  heading: string;
  summary: string;
  content: string;
  created_at: string;
  tags: string[];
  entities: { name: string; type: string }[];
  score: number;
  source: "vector" | "fts" | "both";
};

export async function search(query: string, limit = 20): Promise<SearchHit[]> {
  const db = getDb();
  const qVec = await embed(query);
  const vecBuf = Buffer.from(new Float32Array(qVec).buffer);

  const vecRows = db
    .prepare(
      `SELECT atom_id, distance FROM atom_embeddings
       WHERE embedding MATCH ? AND k = ?
       ORDER BY distance`
    )
    .all(vecBuf, limit) as { atom_id: number; distance: number }[];

  const ftsRows = db
    .prepare(
      `SELECT rowid as atom_id, bm25(atom_fts) as score FROM atom_fts
       WHERE atom_fts MATCH ? ORDER BY score LIMIT ?`
    )
    .all(toFtsQuery(query), limit) as { atom_id: number; score: number }[];

  const scores = new Map<number, { v?: number; f?: number }>();
  vecRows.forEach((r, i) => scores.set(r.atom_id, { ...scores.get(r.atom_id), v: 1 / (i + 1) }));
  ftsRows.forEach((r, i) => scores.set(r.atom_id, { ...scores.get(r.atom_id), f: 1 / (i + 1) }));

  const ranked = [...scores.entries()]
    .map(([atom_id, s]) => ({
      atom_id,
      score: (s.v ?? 0) + (s.f ?? 0),
      source: (s.v && s.f ? "both" : s.v ? "vector" : "fts") as SearchHit["source"],
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (ranked.length === 0) return [];
  const ids = ranked.map((r) => r.atom_id);
  const placeholders = ids.map(() => "?").join(",");

  const atoms = db
    .prepare(
      `SELECT id as atom_id, note_id, heading, summary, content, created_at FROM atoms WHERE id IN (${placeholders})`
    )
    .all(...ids) as Omit<SearchHit, "tags" | "entities" | "score" | "source">[];

  const tagRows = db
    .prepare(
      `SELECT at.atom_id, t.name FROM atom_tags at JOIN tags t ON t.id = at.tag_id WHERE at.atom_id IN (${placeholders})`
    )
    .all(...ids) as { atom_id: number; name: string }[];
  const entityRows = db
    .prepare(
      `SELECT ae.atom_id, e.name, e.type FROM atom_entities ae JOIN entities e ON e.id = ae.entity_id WHERE ae.atom_id IN (${placeholders})`
    )
    .all(...ids) as { atom_id: number; name: string; type: string }[];

  const tagMap = new Map<number, string[]>();
  tagRows.forEach((r) => {
    const arr = tagMap.get(r.atom_id) ?? [];
    arr.push(r.name);
    tagMap.set(r.atom_id, arr);
  });
  const entMap = new Map<number, { name: string; type: string }[]>();
  entityRows.forEach((r) => {
    const arr = entMap.get(r.atom_id) ?? [];
    arr.push({ name: r.name, type: r.type });
    entMap.set(r.atom_id, arr);
  });
  const atomMap = new Map(atoms.map((a) => [a.atom_id, a]));

  return ranked
    .map((r) => {
      const a = atomMap.get(r.atom_id);
      if (!a) return null;
      return {
        ...a,
        tags: tagMap.get(r.atom_id) ?? [],
        entities: entMap.get(r.atom_id) ?? [],
        score: r.score,
        source: r.source,
      } satisfies SearchHit;
    })
    .filter((x): x is SearchHit => x !== null);
}

function toFtsQuery(q: string): string {
  // Simple tokenization: escape quotes, OR-combine words for recall
  const tokens = q
    .replace(/"/g, '""')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `"${t}"`);
  if (tokens.length === 0) return '""';
  return tokens.join(" OR ");
}
