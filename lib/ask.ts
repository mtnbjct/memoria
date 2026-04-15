import { getDb } from "./db";
import { embed, llm, CHAT_MODEL } from "./azure";
import { matchingAtomIds, type Filter } from "./explore";

export type Citation = {
  atom_id: number;
  note_id: number;
  heading: string;
  summary: string;
  created_at: string;
};

const TOP_K = 12;

export async function ask(question: string, filters: Filter[]): Promise<{ answer: string; citations: Citation[] }> {
  const db = getDb();

  // Retrieve candidate atoms via embedding similarity, optionally scoped.
  const qvec = await embed(question);
  const buf = Buffer.from(new Float32Array(qvec).buffer);

  let scopedIds: number[] | null = null;
  if (filters.length > 0) {
    const { ids } = await matchingAtomIds(filters);
    if (ids.length === 0) return { answer: "条件に合うメモがありません。", citations: [] };
    scopedIds = ids;
  }

  let rows: Citation[];
  if (scopedIds) {
    const ph = scopedIds.map(() => "?").join(",");
    rows = db
      .prepare(
        `SELECT a.id as atom_id, a.note_id, a.heading, a.summary, a.created_at
         FROM atom_embeddings e JOIN atoms a ON a.id = e.atom_id
         WHERE e.embedding MATCH ? AND e.k = ?
           AND a.id IN (${ph})
         ORDER BY e.distance
         LIMIT ?`
      )
      .all(buf, Math.max(200, scopedIds.length), ...scopedIds, TOP_K) as Citation[];
  } else {
    rows = db
      .prepare(
        `SELECT a.id as atom_id, a.note_id, a.heading, a.summary, a.created_at
         FROM atom_embeddings e JOIN atoms a ON a.id = e.atom_id
         WHERE e.embedding MATCH ? AND e.k = ?
         ORDER BY e.distance
         LIMIT ?`
      )
      .all(buf, TOP_K, TOP_K) as Citation[];
  }

  if (rows.length === 0) return { answer: "関連するメモが見つかりませんでした。", citations: [] };

  // Fetch full content for each row for better grounding.
  const ids = rows.map((r) => r.atom_id);
  const ph = ids.map(() => "?").join(",");
  const contentRows = db
    .prepare(`SELECT id as atom_id, content FROM atoms WHERE id IN (${ph})`)
    .all(...ids) as { atom_id: number; content: string }[];
  const contentMap = new Map(contentRows.map((r) => [r.atom_id, r.content]));

  const context = rows
    .map((r, i) => `[${i + 1}] (${r.created_at.slice(0, 10)}) ${r.heading}\n${contentMap.get(r.atom_id) ?? r.summary}`)
    .join("\n\n");

  const completion = await llm().chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "あなたはユーザーの個人メモを読んで質問に答えるアシスタントです。以下のメモ群だけを根拠に、日本語で簡潔に答えてください。根拠にない情報は推測せず、『メモには書かれていない』と正直に答えます。回答文中では [1] [2] のように該当するメモ番号を引用してください。",
      },
      {
        role: "user",
        content: `質問: ${question}\n\n関連メモ:\n${context}`,
      },
    ],
  });

  return {
    answer: completion.choices[0]?.message?.content?.trim() ?? "",
    citations: rows,
  };
}
