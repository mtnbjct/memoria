import { getDb } from "./db";
import { llm, CHAT_MODEL } from "./azure";
import { getHotTags } from "./hot-tags";

const HOT_COUNT = 20;
const MAX_ATOMS_FOR_BUILD = 30;

export type TopicCard = {
  tag_name: string;
  summary: string;
  atom_count: number;
  hot_score: number | null;
  updated_at: string;
  source_atom_ids: number[];
  pinned: boolean;
};

type Atom = { id: number; heading: string; summary: string; content: string; created_at: string };

function parseIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
}

export function listActiveTopicCards(): TopicCard[] {
  const db = getDb();
  // Join prefs; exclude hidden; show pinned first, then by latest hot_score from hot-tags dynamic recompute
  const hotMap = new Map(getHotTags(100).map((t) => [t.name, t.score]));
  type Row = {
    tag_name: string;
    summary: string;
    atom_count: number;
    hot_score: number | null;
    updated_at: string;
    source_atom_ids: string | null;
    pinned: number;
    hidden: number;
  };
  const rows = db
    .prepare(
      `SELECT c.tag_name, c.summary, c.atom_count, c.hot_score, c.updated_at, c.source_atom_ids,
              COALESCE(p.pinned, 0) AS pinned,
              COALESCE(p.hidden, 0) AS hidden
       FROM topic_cards c
       LEFT JOIN topic_prefs p ON p.tag_name = c.tag_name
       WHERE c.archived_at IS NULL AND COALESCE(p.hidden, 0) = 0`
    )
    .all() as Row[];

  return rows
    .map((r) => ({
      tag_name: r.tag_name,
      summary: r.summary,
      atom_count: r.atom_count,
      hot_score: hotMap.get(r.tag_name) ?? r.hot_score, // prefer fresh score
      updated_at: r.updated_at,
      source_atom_ids: parseIds(r.source_atom_ids),
      pinned: r.pinned === 1,
    }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const sa = a.hot_score ?? 0;
      const sb = b.hot_score ?? 0;
      if (sb !== sa) return sb - sa;
      return a.updated_at < b.updated_at ? 1 : -1;
    });
}

function listHotTagsRespectingPrefs(): { name: string; score: number }[] {
  const db = getDb();
  const hidden = db.prepare("SELECT tag_name FROM topic_prefs WHERE hidden = 1").all() as { tag_name: string }[];
  const pinned = db.prepare("SELECT tag_name FROM topic_prefs WHERE pinned = 1").all() as { tag_name: string }[];
  const hiddenSet = new Set(hidden.map((h) => h.tag_name));
  // Over-fetch because we may filter some out, then cap at HOT_COUNT. Pinned tags always included.
  const raw = getHotTags(HOT_COUNT + hiddenSet.size + 10).filter((h) => !hiddenSet.has(h.name));
  const top = raw.slice(0, HOT_COUNT);
  const topNames = new Set(top.map((t) => t.name));
  for (const p of pinned) {
    if (!hiddenSet.has(p.tag_name) && !topNames.has(p.tag_name)) {
      top.push({ name: p.tag_name, score: 0 }); // include pinned even if not hot
    }
  }
  return top;
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

async function buildSummary(tagName: string, atoms: Atom[]): Promise<string> {
  const bullets = atoms
    .map((a, i) => `${i + 1}. [${a.created_at.slice(0, 10)}] ${a.heading}\n   ${a.content}`)
    .join("\n");
  const r = await llm().chat.completions.create({
    model: CHAT_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          "あなたは個人メモから1つのタグ(トピック)の現状を要約するアシスタントです。\n" +
          "与えられたメモ群だけを根拠に、日本語3〜6文の段落でまとめてください。\n" +
          "重要な原則:\n" +
          "- **最新の動きを先頭に持ってくる**。一覧の上位にあるほど新しいメモです。古い背景はその後に軽く触れる程度。\n" +
          "- 推測や一般論は書かない。メモに書かれた事実のみ。\n" +
          "- 固有名詞・数値・日付・判断・ニュアンスは保持する。",
      },
      { role: "user", content: `タグ: #${tagName}\n\n関連メモ (新しい順):\n${bullets}` },
    ],
  });
  return r.choices[0]?.message?.content?.trim() ?? "";
}

// ------ Debouncing layer ------
const DEBOUNCE_MS = 3000;
let pendingTimer: NodeJS.Timeout | null = null;
let inflight: Promise<RefreshResult> | null = null;

type RefreshResult = { built: number; updated: number; archived: number };

export function scheduleRefreshTopicCards(): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    if (inflight) return; // one in-flight refresh is enough; another will be scheduled by next invocation
    inflight = refreshTopicCardsNow()
      .catch((err) => {
        console.error("[topic-cards] refresh failed", err);
        return { built: 0, updated: 0, archived: 0 };
      })
      .finally(() => { inflight = null; }) as Promise<RefreshResult>;
  }, DEBOUNCE_MS);
}

export async function refreshTopicCardsNow(): Promise<RefreshResult> {
  const db = getDb();
  const hot = listHotTagsRespectingPrefs();
  const hotMap = new Map(hot.map((h) => [h.name, h.score]));
  const existing = db
    .prepare("SELECT tag_name FROM topic_cards WHERE archived_at IS NULL")
    .all() as { tag_name: string }[];
  const existingSet = new Set(existing.map((e) => e.tag_name));

  let built = 0, updated = 0, archived = 0;

  // Archive: active but no longer hot (and not pinned)
  const pinned = db.prepare("SELECT tag_name FROM topic_prefs WHERE pinned = 1").all() as { tag_name: string }[];
  const pinnedSet = new Set(pinned.map((p) => p.tag_name));
  const archiveStmt = db.prepare(
    "UPDATE topic_cards SET archived_at = datetime('now') WHERE tag_name = ?"
  );
  for (const e of existing) {
    if (!hotMap.has(e.tag_name) && !pinnedSet.has(e.tag_name)) {
      archiveStmt.run(e.tag_name);
      archived++;
    }
  }

  // Build every hot tag from scratch (no incremental chain-summarization).
  const upsertStmt = db.prepare(
    `INSERT INTO topic_cards (tag_name, summary, atom_count, hot_score, last_atom_id, source_atom_ids, updated_at, archived_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'), NULL)
     ON CONFLICT(tag_name) DO UPDATE SET
       summary = excluded.summary,
       atom_count = excluded.atom_count,
       hot_score = excluded.hot_score,
       last_atom_id = excluded.last_atom_id,
       source_atom_ids = excluded.source_atom_ids,
       updated_at = datetime('now'),
       archived_at = NULL`
  );

  for (const { name, score } of hot) {
    const atoms = atomsForTag(name, MAX_ATOMS_FOR_BUILD);
    if (atoms.length === 0) continue;
    try {
      const summary = await buildSummary(name, atoms);
      const maxId = atoms[0]?.id ?? 0;
      const totalCount = (db
        .prepare(
          `SELECT COUNT(*) as c FROM atom_tags at JOIN tags t ON t.id = at.tag_id WHERE t.name = ?`
        )
        .get(name) as { c: number }).c;
      const sourceIds = JSON.stringify(atoms.map((a) => a.id));
      upsertStmt.run(name, summary, totalCount, score, maxId, sourceIds);
      if (existingSet.has(name)) updated++;
      else built++;
    } catch (err) {
      console.error(`[topic-cards] build failed for ${name}`, err);
    }
  }

  return { built, updated, archived };
}

// Back-compat export for existing callers; now debounced.
export async function refreshTopicCards(): Promise<RefreshResult> {
  scheduleRefreshTopicCards();
  return { built: 0, updated: 0, archived: 0 };
}

// ------ Prefs CRUD ------
export function setPinned(tag: string, pinned: boolean) {
  const db = getDb();
  db.prepare(
    `INSERT INTO topic_prefs (tag_name, pinned, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(tag_name) DO UPDATE SET pinned = excluded.pinned, updated_at = datetime('now')`
  ).run(tag, pinned ? 1 : 0);
}

export function setHidden(tag: string, hidden: boolean) {
  const db = getDb();
  db.prepare(
    `INSERT INTO topic_prefs (tag_name, hidden, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(tag_name) DO UPDATE SET hidden = excluded.hidden, updated_at = datetime('now')`
  ).run(tag, hidden ? 1 : 0);
  if (hidden) {
    // Also archive the card immediately so it disappears from the pane
    db.prepare("UPDATE topic_cards SET archived_at = datetime('now') WHERE tag_name = ? AND archived_at IS NULL").run(tag);
  } else {
    // Un-archive so the card reappears with its last known summary
    db.prepare("UPDATE topic_cards SET archived_at = NULL WHERE tag_name = ?").run(tag);
  }
}
