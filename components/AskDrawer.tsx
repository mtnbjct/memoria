"use client";
import { useEffect, useState } from "react";

export type AskFilter =
  | { type: "tag"; value: string }
  | { type: "text"; value: string }
  | { type: "note"; value: number };

type Citation = {
  atom_id: number;
  note_id: number;
  heading: string;
  summary: string;
  created_at: string;
};

export function AskDrawer({
  open,
  onClose,
  filters,
  onSelectNote,
}: {
  open: boolean;
  onClose: () => void;
  filters: AskFilter[];
  onSelectNote: (noteId: number) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  function clear() {
    setQ("");
    setAnswer(null);
    setCitations([]);
  }

  async function submit() {
    if (!q.trim() || busy) return;
    setBusy(true);
    setAnswer(null);
    setCitations([]);
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q, filters }),
      });
      const j = await r.json();
      setAnswer(j.answer ?? "");
      setCitations(j.citations ?? []);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-30" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-full max-w-xl bg-white dark:bg-neutral-900 border-l dark:border-neutral-800 z-40 flex flex-col shadow-2xl">
        <header className="shrink-0 p-4 border-b dark:border-neutral-800 flex items-center">
          <h2 className="font-semibold">AIに質問</h2>
          {filters.length > 0 && (
            <span className="ml-2 text-xs text-neutral-500 dark:text-neutral-400">
              （現在の絞り込み条件を文脈に使用）
            </span>
          )}
          <button
            onClick={clear}
            disabled={!q && !answer && citations.length === 0}
            className="ml-auto text-xs text-neutral-500 hover:text-black dark:hover:text-white disabled:opacity-30"
            title="入力と履歴を消す"
          >クリア</button>
          <button onClick={onClose} className="ml-3 text-sm text-neutral-500 hover:text-black dark:hover:text-white">✕</button>
        </header>

        <div className="shrink-0 p-4 border-b dark:border-neutral-800 flex gap-2">
          <input
            autoFocus
            className="flex-1 rounded border dark:border-neutral-700 dark:bg-neutral-900 px-3 py-2 text-sm"
            placeholder="例: 田中さんの転職って今どうなってる？"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
          <button
            onClick={submit}
            disabled={busy || !q.trim()}
            className="rounded bg-black dark:bg-white dark:text-black px-4 py-2 text-white text-sm disabled:opacity-40"
          >{busy ? "..." : "質問"}</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {busy && <div className="text-sm text-neutral-500">回答を生成中...</div>}

          {answer && (
            <section>
              <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">回答</div>
              <p className="text-sm whitespace-pre-wrap leading-relaxed">{answer}</p>
            </section>
          )}

          {citations.length > 0 && (
            <section>
              <div className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-2">参照メモ</div>
              <ol className="space-y-2">
                {citations.map((c, i) => (
                  <li key={c.atom_id} className="rounded border dark:border-neutral-800 p-3 bg-neutral-50 dark:bg-neutral-950">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 shrink-0">[{i + 1}]</span>
                      <button
                        onClick={() => { onSelectNote(c.note_id); onClose(); }}
                        className="text-sm font-medium text-left hover:underline flex-1"
                      >{c.heading}</button>
                      <span className="text-xs text-neutral-400 shrink-0">{c.created_at.slice(0, 10)}</span>
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">{c.summary}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </aside>
    </>
  );
}
