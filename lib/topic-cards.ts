import { getDb } from "./db";
import { llm, CHAT_MODEL } from "./azure";
import { getHotTags } from "./hot-tags";

const HOT_COUNT = 20;
const MAX_ATOMS_FOR_BUILD = 30;       // cap when building a card from scratch
const MAX_NEW_ATOMS_FOR_UPDATE = 20;  // cap new atoms sent for incremental update

export type TopicCard = {
  tag_name: string;
  summary: string;
  atom_count: number;
  hot_score: number | null;
  updated_at: string;
};

type Atom = { id: number; heading: string; summary: string; content: string; created_at: string };

export function listActiveTopicCards(): TopicCard[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT tag_name, summary, atom_count, hot_score, updated_at
       FROM topic_cards WHERE archived_at IS NULL
       ORDER BY hot_score DESC, updated_at DESC`
    )
    .all() as TopicCard[];
}

function listCurrentHotTags(): { name: string; score: number }[] {
  return getHotTags(HOT_COUNT);
}

function atomsForTag(tagName: string, limit: number): Atom[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.id, a.heading, a.summary, a.content, a.created_at
       FROM atoms a
       JOIN atom_tags at ON at.atom_id = a.id
       JOIN tags t ON t.id = at.tag_id
       WHERE t.name = ?
       ORDER BY a.id DESC
       LIMIT ?`
    )
    .all(tagName, limit) as Atom[];
}

function newAtomsForTagSince(tagName: string, lastAtomId: number, limit: number): Atom[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT a.id, a.heading, a.summary, a.content, a.created_at
       FROM atoms a
       JOIN atom_tags at ON at.atom_id = a.id
       JOIN tags t ON t.id = at.tag_id
       WHERE t.name = ? AND a.id > ?
       ORDER BY a.id DESC
       LIMIT ?`
    )
    .all(tagName, lastAtomId, limit) as Atom[];
}

function formatAtoms(atoms: Atom[]): string {
  return atoms
    .map((a) => `- [${a.created_at.slice(0, 10)}] ${a.heading}: ${a.content}`)
    .join("\n");
}

async function buildSummaryFromScratch(tagName: string, atoms: Atom[]): Promise<string> {
  const bullets = formatAtoms(atoms);
  const r = await llm().chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "あなたは個人メモから1つのタグ(トピック)の現状を要約するアシスタントです。" +
          "与えられたメモ群だけを根拠に、そのトピックの「いま何が起きているか」を日本語3〜6文でまとめてください。" +
          "時系列が分かる場合は最近の動きを優先し、古い背景は軽く触れる程度で。推測や一般論は書かない。",
      },
      { role: "user", content: `タグ: #${tagName}\n\nメモ:\n${bullets}` },
    ],
  });
  return r.choices[0]?.message?.content?.trim() ?? "";
}

async function updateSummaryIncrementally(
  tagName: string,
  prevSummary: string,
  newAtoms: Atom[]
): Promise<string> {
  const bullets = formatAtoms(newAtoms);
  const r = await llm().chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "あなたは個人メモから1つのタグ(トピック)の『生きているまとめ』をメンテナンスするアシスタントです。" +
          "現在の要約と、このタグに関する新しいメモ群が与えられます。新しい情報を取り込んで要約を更新してください。" +
          "ルール: (1)古い情報でも有効なものは残す (2)新しい情報で上書きが必要な部分だけ書き換える " +
          "(3)3〜6文、箇条書きせず段落で (4)推測せず、メモに書かれた事実のみ。",
      },
      {
        role: "user",
        content: `タグ: #${tagName}\n\n現在の要約:\n${prevSummary}\n\n新しいメモ:\n${bullets}`,
      },
    ],
  });
  return r.choices[0]?.message?.content?.trim() ?? prevSummary;
}

export async function refreshTopicCards(): Promise<{ built: number; updated: number; archived: number }> {
  const db = getDb();
  const hot = listCurrentHotTags();
  const hotMap = new Map(hot.map((h) => [h.name, h.score]));
  const existing = db
    .prepare("SELECT tag_name, summary, last_atom_id FROM topic_cards WHERE archived_at IS NULL")
    .all() as { tag_name: string; summary: string; last_atom_id: number }[];
  const existingMap = new Map(existing.map((e) => [e.tag_name, e]));

  let built = 0, updated = 0, archived = 0;

  // Archive: active but no longer hot
  const archiveStmt = db.prepare(
    "UPDATE topic_cards SET archived_at = datetime('now') WHERE tag_name = ?"
  );
  for (const e of existing) {
    if (!hotMap.has(e.tag_name)) {
      archiveStmt.run(e.tag_name);
      archived++;
    }
  }

  // Build / update for each currently hot tag
  const upsertStmt = db.prepare(
    `INSERT INTO topic_cards (tag_name, summary, atom_count, hot_score, last_atom_id, updated_at, archived_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'), NULL)
     ON CONFLICT(tag_name) DO UPDATE SET
       summary = excluded.summary,
       atom_count = excluded.atom_count,
       hot_score = excluded.hot_score,
       last_atom_id = excluded.last_atom_id,
       updated_at = datetime('now'),
       archived_at = NULL`
  );

  for (const { name, score } of hot) {
    const prev = existingMap.get(name);
    if (!prev) {
      // Brand new hot tag → build from scratch
      const atoms = atomsForTag(name, MAX_ATOMS_FOR_BUILD);
      if (atoms.length === 0) continue;
      try {
        const summary = await buildSummaryFromScratch(name, atoms);
        const maxId = atoms[0]?.id ?? 0;
        upsertStmt.run(name, summary, atoms.length, score, maxId);
        built++;
      } catch (err) {
        console.error(`[topic-cards] build failed for ${name}`, err);
      }
    } else {
      // Still hot → check for new atoms since last_atom_id
      const newAtoms = newAtomsForTagSince(name, prev.last_atom_id, MAX_NEW_ATOMS_FOR_UPDATE);
      if (newAtoms.length === 0) {
        // No new info; just refresh hot_score
        db.prepare(
          "UPDATE topic_cards SET hot_score = ?, updated_at = datetime('now') WHERE tag_name = ?"
        ).run(score, name);
        continue;
      }
      try {
        const summary = await updateSummaryIncrementally(name, prev.summary, newAtoms);
        const maxId = newAtoms[0]?.id ?? prev.last_atom_id;
        const total = (db
          .prepare(
            `SELECT COUNT(*) as c FROM atom_tags at JOIN tags t ON t.id = at.tag_id WHERE t.name = ?`
          )
          .get(name) as { c: number }).c;
        upsertStmt.run(name, summary, total, score, maxId);
        updated++;
      } catch (err) {
        console.error(`[topic-cards] update failed for ${name}`, err);
      }
    }
  }

  return { built, updated, archived };
}
