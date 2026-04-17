import { z } from "zod";
import { getDb } from "./db";
import { llm, CHAT_MODEL, embed } from "./azure";
import { refreshTopicCards } from "./topic-cards";

const TaskSchema = z.object({
  text: z.string(),
  due_at: z.union([z.string(), z.null()]).optional(),
});
const AtomSchema = z.object({
  heading: z.string(),
  summary: z.string(),
  content: z.string(),
  tags: z.array(z.string()).default([]),
  entities: z.array(z.unknown()).default([]),
  tasks: z.array(TaskSchema).default([]),
});
const ResponseSchema = z.object({ atoms: z.array(AtomSchema) });

function normalizeEntities(raw: unknown[]): { name: string; type: string }[] {
  const out: { name: string; type: string }[] = [];
  for (const e of raw) {
    if (typeof e === "string") {
      out.push({ name: e, type: "other" });
    } else if (e && typeof e === "object") {
      const o = e as Record<string, unknown>;
      if (typeof o.name === "string" && typeof o.type === "string") {
        out.push({ name: o.name, type: o.type });
      } else {
        // e.g. {"田中さん": "person"}
        for (const [k, v] of Object.entries(o)) {
          if (typeof v === "string") out.push({ name: k, type: v });
        }
      }
    }
  }
  return out.filter((e) => e.name.trim().length > 0);
}

const SYSTEM_PROMPT = `あなたは個人メモを整理するアシスタントです。
ユーザーはパパっと書き流しているので、タイポ・崩れた語尾・口語・順序の乱れが含まれます。あなたの仕事は、**意図と情報量を保ったまま**、それを読みやすく整えて「アトミックノート」に切り分けることです。

## 保つもの (必ず残す)
- 事実・数値・日付・固有名詞(人名・地名・製品名・技術名)
- 判断や意図 (「やめた」「迷っている」「嬉しい」など)
- ニュアンス (「微妙」「苦手」「意外と」等の主観や温度感)
- 因果・理由 ("〜なので〜" の関係性)

## 整えていいもの (積極的に正規化してよい)
- 誤字・脱字の修正
- 途切れた語尾や口語の整文 (「〜らしい」「〜なんだよね」→普通の書き言葉に)
- 重複や「メモ:」「ちなみに」のような前置き
- 記述の順序の入れ替え (読みやすさのため)

## 分割の判断
- 1つのメモに**独立した複数の話題**が含まれる時だけ分ける
- 同じ話題の補足や感想は分けずに1つのatomに集約
- 短いメモ・単一トピックのメモは 1つの atom のまま

## 出力
JSON形式: { "atoms": [ { ... } ] }

各atomは以下:
- heading: 10-30文字の名詞句見出し
- summary: 一覧表示用の1文
- content: そのトピックに対応する本文。整文してよいが情報は落とさない
- tags: 3-7個の短いタグ (日本語可)
- entities: [{ name, type }] type は person|org|term|date|product|place|other
- tasks: 「未来のやるべきこと」だけを抽出。感想や観察は含めない。無ければ []
  - text: 動詞で終わる短文
  - due_at: メモ記録日を基準に "来週"/"金曜"/"2月末" などを ISO 8601 (YYYY-MM-DD) に解決。なければ null

## 例

入力 (メモ記録日: 2026-04-15):
"田中さんにFigmaレビュー返す 木曜まで あと麺屋こうすけの店主にrust本貸す約束してた 来週末 ついでに子供の音読が進んで嬉しい"

出力:
{
  "atoms": [
    {
      "heading": "田中さんへのFigmaレビュー返却",
      "summary": "木曜までに田中さんへデザインレビューを返す。",
      "content": "田中さんに依頼されているFigmaのデザインレビューを木曜までに返す。",
      "tags": ["田中さん", "デザイン", "Figma", "レビュー"],
      "entities": [{"name": "田中さん", "type": "person"}, {"name": "Figma", "type": "product"}],
      "tasks": [{"text": "田中さんにFigmaレビューを返す", "due_at": "2026-04-16"}]
    },
    {
      "heading": "麺屋こうすけ店主にRust本を貸す",
      "summary": "来週末、店主へ約束していたRust本を貸す。",
      "content": "麺屋こうすけの店主にRustの本を貸す約束をしていた。来週末に持参する。",
      "tags": ["麺屋こうすけ", "Rust", "人間関係"],
      "entities": [{"name": "麺屋こうすけ", "type": "org"}, {"name": "Rust", "type": "term"}],
      "tasks": [{"text": "麺屋こうすけの店主にRust本を貸す", "due_at": "2026-04-19"}]
    },
    {
      "heading": "子供の音読が進んで嬉しい",
      "summary": "子供の音読の習慣が進んできて嬉しい。",
      "content": "子供の音読が進んできていて嬉しい。",
      "tags": ["子供", "家族", "学習", "嬉しい"],
      "entities": [],
      "tasks": []
    }
  ]
}`;

export async function ingestNote(noteId: number, raw: string) {
  const db = getDb();
  const noteRow = db.prepare("SELECT created_at FROM notes WHERE id = ?").get(noteId) as
    | { created_at: string } | undefined;
  const recordedAt = noteRow?.created_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const completion = await llm().chat.completions.create({
    model: CHAT_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.2,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `メモ記録日: ${recordedAt}\n\n${raw}` },
    ],
  });
  const json = JSON.parse(completion.choices[0].message.content ?? "{}");
  const parsed = ResponseSchema.parse(json);

  const insertAtom = db.prepare(
    "INSERT INTO atoms (note_id, heading, summary, content) VALUES (?, ?, ?, ?)"
  );
  const upsertTag = db.prepare(
    "INSERT INTO tags (name, kind) VALUES (?, 'topic') ON CONFLICT(name, kind) DO UPDATE SET name=excluded.name RETURNING id"
  );
  const linkTag = db.prepare("INSERT OR IGNORE INTO atom_tags (atom_id, tag_id) VALUES (?, ?)");
  const upsertEntity = db.prepare(
    "INSERT INTO entities (name, type) VALUES (?, ?) ON CONFLICT(name, type) DO UPDATE SET name=excluded.name RETURNING id"
  );
  const linkEntity = db.prepare("INSERT OR IGNORE INTO atom_entities (atom_id, entity_id) VALUES (?, ?)");
  const insertEmbed = db.prepare("INSERT INTO atom_embeddings (atom_id, embedding) VALUES (?, ?)");
  const insertFts = db.prepare(
    "INSERT INTO atom_fts (rowid, heading, summary, content, tags, entities) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertTask = db.prepare(
    "INSERT INTO tasks (atom_id, note_id, text, due_at) VALUES (?, ?, ?, ?)"
  );

  for (const a of parsed.atoms) {
    const entities = normalizeEntities(a.entities);
    const r = insertAtom.run(noteId, a.heading, a.summary, a.content);
    const atomId = Number(r.lastInsertRowid);
    for (const t of a.tags) {
      const row = upsertTag.get(t) as { id: number };
      linkTag.run(atomId, row.id);
    }
    for (const e of entities) {
      const row = upsertEntity.get(e.name, e.type) as { id: number };
      linkEntity.run(atomId, row.id);
    }
    const vec = await embed(`${a.heading}\n${a.summary}\n${a.content}`);
    insertEmbed.run(BigInt(atomId), Buffer.from(new Float32Array(vec).buffer));
    insertFts.run(
      atomId,
      a.heading,
      a.summary,
      a.content,
      a.tags.join(" "),
      entities.map((e) => e.name).join(" ")
    );
    for (const t of a.tasks) {
      const text = t.text?.trim();
      if (!text) continue;
      const due = t.due_at && /^\d{4}-\d{2}-\d{2}/.test(t.due_at) ? t.due_at.slice(0, 10) : null;
      insertTask.run(atomId, noteId, text, due);
    }
  }
  db.prepare("UPDATE notes SET processed_at = datetime('now') WHERE id = ?").run(noteId);

  // Refresh topic cards after this note's atoms are in place.
  // Runs async in the same function scope; errors logged, but processed_at is already set.
  try {
    const r = await refreshTopicCards();
    console.log(`[topic-cards] refreshed: built=${r.built} updated=${r.updated} archived=${r.archived}`);
  } catch (err) {
    console.error("[topic-cards] refresh failed", err);
  }
}
