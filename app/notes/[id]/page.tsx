import { getDb } from "@/lib/db";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const noteId = Number(id);
  if (!Number.isFinite(noteId)) notFound();

  const db = getDb();
  const note = db.prepare("SELECT * FROM notes WHERE id = ?").get(noteId) as
    | { id: number; raw: string; created_at: string; processed_at: string | null }
    | undefined;
  if (!note) notFound();

  const atoms = db
    .prepare("SELECT * FROM atoms WHERE note_id = ? ORDER BY id")
    .all(noteId) as { id: number; heading: string; summary: string; content: string }[];

  const tagRows = db
    .prepare(
      `SELECT at.atom_id, t.name FROM atom_tags at JOIN tags t ON t.id = at.tag_id
       WHERE at.atom_id IN (SELECT id FROM atoms WHERE note_id = ?)`
    )
    .all(noteId) as { atom_id: number; name: string }[];
  const tagMap = new Map<number, string[]>();
  tagRows.forEach((r) => tagMap.set(r.atom_id, [...(tagMap.get(r.atom_id) ?? []), r.name]));

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400">元メモ</h2>
        <pre className="mt-1 whitespace-pre-wrap rounded border dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">{note.raw}</pre>
        <p className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
          {note.created_at} {note.processed_at ? `· processed ${note.processed_at}` : "· 処理中..."}
        </p>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 mb-2">アトミックノート ({atoms.length})</h2>
        <ul className="space-y-3">
          {atoms.map((a) => (
            <li key={a.id} className="rounded border dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3">
              <div className="font-medium">{a.heading}</div>
              <p className="text-sm text-neutral-600 dark:text-neutral-300 mt-1">{a.summary}</p>
              <p className="text-sm mt-2 whitespace-pre-wrap">{a.content}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {(tagMap.get(a.id) ?? []).map((t) => (
                  <span key={t} className="rounded bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 text-xs">{t}</span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
