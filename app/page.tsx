"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Sentinel } from "@/components/Sentinel";
import { PaneHeader } from "@/components/PaneHeader";
import { AskDrawer } from "@/components/AskDrawer";

type RawNote = { id: number; raw: string; created_at: string; processed_at: string | null };

type Filter = { type: "tag"; value: string } | { type: "text"; value: string } | { type: "note"; value: number };
type RelatedTag = { name: string; count: number };
type Atom = {
  atom_id: number;
  note_id: number;
  heading: string;
  summary: string;
  content: string;
  created_at: string;
  tags: string[];
};
type Result = { filters: Filter[]; matchedCount: number; relatedTags: RelatedTag[]; atoms: Atom[] };

const card = "rounded border dark:border-neutral-800 bg-white dark:bg-neutral-900";
const atomCard = `${card} border-l-2 border-l-indigo-500/70`;
const taskCard = `${card} border-l-2 border-l-amber-500/70`;
const muted = "text-neutral-500 dark:text-neutral-400";
const faded = "text-neutral-400 dark:text-neutral-500";
const chip = "rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700";

function formatLocal(s: string | null | undefined): string {
  if (!s) return "";
  // SQLite datetime('now') -> "YYYY-MM-DD HH:MM:SS" in UTC; treat as UTC and format local.
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Home() {
  const [filters, setFilters] = useState<Filter[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpRefresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  const [askOpen, setAskOpen] = useState(false);

  function setSelectedNoteAndFilter(id: number | null) {
    setSelectedNoteId(id);
    if (id == null) {
      setFilters((prev) => prev.filter((f) => f.type !== "note"));
    } else {
      setFilters((prev) => [...prev.filter((f) => f.type !== "note"), { type: "note", value: id }]);
    }
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100vh-6rem)]">
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        onClearNote={() => setSelectedNoteId(null)}
        onAsk={() => setAskOpen(true)}
      />
      <div className="grid grid-cols-[minmax(300px,1fr)_minmax(400px,1.3fr)_minmax(300px,1fr)] gap-4 flex-1 min-h-0">
        <RightPane
          filters={filters}
          setFilters={setFilters}
          selectedNoteId={selectedNoteId}
          setSelectedNoteId={setSelectedNoteId}
          refreshKey={refreshKey}
        />
        <LeftPane
          filters={filters}
          selectedNoteId={selectedNoteId}
          onSelectNote={setSelectedNoteAndFilter}
          onNoteProcessed={bumpRefresh}
        />
        <TaskPane
          filters={filters}
          selectedNoteId={selectedNoteId}
          setSelectedNoteId={setSelectedNoteId}
          refreshKey={refreshKey}
        />
      </div>
      <AskDrawer
        open={askOpen}
        onClose={() => setAskOpen(false)}
        filters={filters}
        onSelectNote={setSelectedNoteAndFilter}
      />
    </div>
  );
}

function FilterBar({
  filters,
  setFilters,
  onClearNote,
  onAsk,
}: {
  filters: Filter[];
  setFilters: React.Dispatch<React.SetStateAction<Filter[]>>;
  onClearNote: () => void;
  onAsk: () => void;
}) {
  const [input, setInput] = useState("");
  const [suggested, setSuggested] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/suggested-tags", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters, limit: 20 }),
    })
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setSuggested(j.tags ?? []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [filters]);

  function addFilter(f: Filter) {
    if (filters.some((x) => x.type === f.type && x.value === f.value)) return;
    setFilters((prev) => [...prev, f]);
  }
  function removeFilter(i: number) {
    const target = filters[i];
    if (target?.type === "note") onClearNote();
    setFilters((prev) => prev.filter((_, idx) => idx !== i));
  }
  function clearAll() { onClearNote(); setFilters([]); }
  function submitInput() {
    const v = input.trim();
    if (!v) return;
    setInput("");
    addFilter({ type: "text", value: v });
  }

  function filterLabel(f: Filter): string {
    if (f.type === "tag") return `#${f.value}`;
    if (f.type === "text") return `"${f.value}"`;
    return `📝 メモ #${f.value}`;
  }

  const selectedTagNames = new Set(
    filters.filter((f) => f.type === "tag").map((f) => f.value as string)
  );

  return (
    <section className={`${card} p-3 shrink-0`}>
      <div className="flex flex-wrap gap-2 items-center">
        <input
          className="w-64 rounded border dark:border-neutral-700 dark:bg-neutral-900 px-2 py-1 text-sm"
          placeholder="キーワードで絞り込み... (Enter)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submitInput(); }}
        />

        {filters.map((f, i) => (
          <button
            key={i}
            onClick={() => removeFilter(i)}
            className={`rounded-full px-3 py-1 text-sm flex items-center gap-1 ${
              f.type === "tag"
                ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-black hover:opacity-80"
                : f.type === "note"
                  ? "bg-amber-600 text-white hover:bg-amber-500"
                  : "bg-blue-600 text-white hover:bg-blue-500"
            }`}
            title="クリックで外す"
          >
            {filterLabel(f)} <span className="text-xs opacity-60">×</span>
          </button>
        ))}

        {suggested
          .filter((t) => !selectedTagNames.has(t.name))
          .slice(0, 16)
          .map((t) => (
            <button
              key={t.name}
              onClick={() => addFilter({ type: "tag", value: t.name })}
              className={`${chip} px-3 py-1 text-sm`}
            >#{t.name} <span className={`${faded} text-xs`}>×{t.count}</span></button>
          ))}

        <button
          onClick={onAsk}
          className="ml-auto shrink-0 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 text-sm"
          title="AIに質問"
        >💬 質問</button>

        {filters.length > 0 && (
          <button onClick={clearAll} className={`text-xs ${muted} hover:underline shrink-0`}>全て外す</button>
        )}
      </div>
    </section>
  );
}

type Task = {
  id: number;
  atom_id: number;
  note_id: number;
  text: string;
  due_at: string | null;
  status: "open" | "done";
  created_at: string;
  completed_at: string | null;
  atom_heading: string;
  tags: string[];
};

function TaskPane({
  filters,
  selectedNoteId,
  setSelectedNoteId,
  refreshKey,
}: {
  filters: Filter[];
  selectedNoteId: number | null;
  setSelectedNoteId: (id: number | null) => void;
  refreshKey: number;
}) {
  const TASK_PAGE = 50;
  const [tasks, setTasks] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<"open" | "done" | "all">("open");
  const [sort, setSort] = useState<"due" | "created">("due");
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);

  const fetchPage = useCallback(async (offset: number): Promise<{ tasks: Task[]; total: number }> => {
    const r = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters, status, sort, limit: TASK_PAGE, offset }),
    });
    const j = await r.json();
    return { tasks: j.tasks as Task[], total: j.total ?? 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, status, sort, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    fetchPage(0)
      .then(({ tasks: page, total: t }) => {
        if (cancelled) return;
        setTasks(page);
        setTotal(t);
        setHasMore(page.length >= TASK_PAGE);
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    const { tasks: page, total: t } = await fetchPage(tasks.length);
    setTasks((prev) => {
      const seen = new Set(prev.map((x) => x.id));
      return [...prev, ...page.filter((x) => !seen.has(x.id))];
    });
    setTotal(t);
    setHasMore(page.length >= TASK_PAGE);
    loadingRef.current = false;
  }, [fetchPage, hasMore, tasks.length]);

  async function toggle(task: Task) {
    const next = task.status === "open" ? "done" : "open";
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: next } : t));
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  }

  return (
    <div className="flex flex-col gap-3 overflow-hidden">
      <PaneHeader title="タスク" subtitle={busy ? "集計中..." : `${total}件`} accent="amber" />
      <section className="shrink-0 flex items-center gap-2">
        <div className="flex rounded border dark:border-neutral-700 overflow-hidden text-xs">
          {(["open", "done", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-2 py-1 ${status === s ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-black" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
            >{s === "open" ? "未完了" : s === "done" ? "完了" : "全て"}</button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "due" | "created")}
          className="text-xs rounded border dark:border-neutral-700 dark:bg-neutral-900 px-2 py-1"
        >
          <option value="due">締切順</option>
          <option value="created">作成順</option>
        </select>
      </section>

      <div className="flex-1 overflow-y-auto pr-1">
        {tasks.length === 0 ? (
          <div className={`text-sm ${faded}`}>
            {filters.length === 0 ? "タスクはありません" : "条件に合うタスクはありません"}
          </div>
        ) : (
          <ul className="space-y-2">
            {tasks.map((t) => {
              const highlighted = selectedNoteId === t.note_id;
              return (
                <li
                  key={t.id}
                  className={`${taskCard} p-3 ${highlighted ? "ring-1 ring-blue-400" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => toggle(t)}
                      aria-label="toggle"
                      className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${
                        t.status === "done"
                          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-black border-neutral-900 dark:border-neutral-100"
                          : "border-neutral-400 hover:border-neutral-900 dark:hover:border-neutral-200"
                      }`}
                    >{t.status === "done" ? "✓" : ""}</button>
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => setSelectedNoteId(t.note_id)}
                        className={`text-sm text-left w-full hover:underline ${t.status === "done" ? `line-through ${faded}` : ""}`}
                        title="元メモを表示"
                      >{t.text}</button>
                      <div className={`flex items-center gap-2 mt-1 text-xs ${faded}`}>
                        {t.due_at && (
                          <span className={dueBadgeClass(t.due_at, t.status)}>
                            {formatDue(t.due_at)}
                          </span>
                        )}
                        <span className="truncate" title={t.atom_heading}>{t.atom_heading}</span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {tasks.length > 0 && hasMore && <Sentinel onHit={loadMore} />}
      </div>
    </div>
  );
}

function formatDue(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "今日";
  if (diff === 1) return "明日";
  if (diff === -1) return "昨日";
  if (diff < 0) return `${-diff}日前`;
  if (diff < 7) return `${diff}日後`;
  return iso;
}

function dueBadgeClass(iso: string, status: string): string {
  if (status === "done") return "rounded px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800";
  const d = new Date(iso + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return "rounded px-1.5 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
  if (diff <= 2) return "rounded px-1.5 py-0.5 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "rounded px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800";
}

function LeftPane({
  filters,
  selectedNoteId,
  onSelectNote,
  onNoteProcessed,
}: {
  filters: Filter[];
  selectedNoteId: number | null;
  onSelectNote: (id: number | null) => void;
  onNoteProcessed: () => void;
}) {
  const PAGE = 50;
  const [text, setText] = useState("");
  const [notes, setNotes] = useState<RawNote[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);

  const fetchPage = useCallback(async (offset: number): Promise<{ notes: RawNote[]; total: number }> => {
    const r = await fetch("/api/notes/list", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters, limit: PAGE, offset }),
    });
    const j = await r.json();
    return { notes: j.notes as RawNote[], total: j.total ?? 0 };
  }, [filters]);

  const reload = useCallback(async () => {
    const { notes: page, total: t } = await fetchPage(0);
    setNotes(page);
    setTotal(t);
    setHasMore(page.length >= PAGE);
  }, [fetchPage]);

  useEffect(() => { reload(); }, [reload]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    const { notes: page, total: t } = await fetchPage(notes.length);
    setNotes((prev) => {
      const seen = new Set(prev.map((n) => n.id));
      return [...prev, ...page.filter((n) => !seen.has(n.id))];
    });
    setTotal(t);
    setHasMore(page.length >= PAGE);
    loadingRef.current = false;
  }, [fetchPage, hasMore, notes.length]);

  useEffect(() => {
    if (selectedNoteId == null) return;
    const el = document.getElementById(`note-row-${selectedNoteId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    // Not in current list — fetch on demand and merge.
    let cancelled = false;
    fetch(`/api/notes/${selectedNoteId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((j) => {
        if (cancelled || !j?.note) return;
        setNotes((prev) => {
          if (prev.some((n) => n.id === j.note.id)) return prev;
          return [j.note as RawNote, ...prev].sort((a, b) => b.id - a.id);
        });
      });
    return () => { cancelled = true; };
  }, [selectedNoteId, notes]);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await fetch("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw: text }),
    });
    const { id: newId } = (await r.json()) as { id: number };
    setText("");
    setBusy(false);

    // Poll until ingest completes, then bump global refresh so atoms/tasks panes pick up new data.
    for (let i = 0; i < 20; i++) {
      await new Promise((res) => setTimeout(res, 1500));
      const { notes: page, total: t } = await fetchPage(0);
      setNotes(page);
      setTotal(t);
      setHasMore(page.length >= PAGE);
      const found = page.find((n) => n.id === newId);
      if (found?.processed_at) {
        onNoteProcessed();
        return;
      }
    }
  }

  async function del(id: number) {
    if (!confirm("このメモを削除しますか？（関連する atom も全て消えます）")) return;
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    if (selectedNoteId === id) onSelectNote(null);
    reload();
  }

  return (
    <div className="flex flex-col gap-3 overflow-hidden">
      <PaneHeader
        title="メモ"
        subtitle={`${total}件`}
        right={selectedNoteId != null && (
          <button onClick={() => onSelectNote(null)} className={`text-xs ${muted} hover:underline`}>
            選択解除
          </button>
        )}
      />

      <section className="shrink-0 relative">
        <textarea
          className="w-full rounded border dark:border-neutral-700 dark:bg-neutral-900 p-3 min-h-[120px] font-mono text-sm disabled:opacity-60"
          placeholder="雑にメモを投げ込む... (Cmd/Ctrl+Enter で送信)"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit(); }}
          disabled={busy}
        />
        {busy && (
          <div className={`absolute bottom-2 right-3 text-xs ${faded}`}>送信中...</div>
        )}
      </section>

      <section className="flex-1 overflow-hidden flex flex-col min-h-0">
        <ul className="flex-1 overflow-y-auto space-y-2 pr-1">
          {notes.map((n) => {
            const active = selectedNoteId === n.id;
            return (
              <li
                key={n.id}
                id={`note-row-${n.id}`}
                className={`${card} p-3 cursor-pointer group ${active ? "ring-2 ring-blue-500" : ""}`}
                onClick={() => onSelectNote(active ? null : n.id)}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm whitespace-pre-wrap line-clamp-3 flex-1">{n.raw}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); del(n.id); }}
                    className={`text-xs ${faded} opacity-0 group-hover:opacity-100 hover:text-red-500 shrink-0`}
                    title="削除"
                  >削除</button>
                </div>
                <div className={`text-xs ${faded} mt-1`}>
                  {formatLocal(n.created_at)}
                  {!n.processed_at && " · 処理中..."}
                </div>
              </li>
            );
          })}
          {notes.length === 0 && <li className={`text-sm ${faded}`}>まだメモがありません</li>}
          {notes.length > 0 && hasMore && <Sentinel onHit={loadMore} />}
        </ul>
      </section>
    </div>
  );
}

function RightPane({
  filters,
  setFilters,
  selectedNoteId,
  setSelectedNoteId,
  refreshKey,
}: {
  filters: Filter[];
  setFilters: React.Dispatch<React.SetStateAction<Filter[]>>;
  selectedNoteId: number | null;
  setSelectedNoteId: (id: number | null) => void;
  refreshKey: number;
}) {
  const ATOM_PAGE = 30;
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [recentAtoms, setRecentAtoms] = useState<Atom[] | null>(null);
  const [recentTotal, setRecentTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const loadingRef = useRef(false);

  // Empty-state: recent atoms (paged)
  useEffect(() => {
    if (filters.length !== 0) return;
    let cancelled = false;
    fetch("/api/atoms?limit=50&offset=0")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setRecentAtoms(j.atoms);
        setRecentTotal(j.total ?? 0);
        setHasMore((j.atoms as Atom[]).length >= 50);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [filters.length, refreshKey]);

  // Filtered: explore (paged)
  useEffect(() => {
    if (filters.length === 0) { setResult(null); return; }
    let cancelled = false;
    setBusy(true);
    fetch("/api/explore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ filters, offset: 0, limit: ATOM_PAGE }),
    })
      .then((r) => r.json())
      .then((j: Result) => {
        if (cancelled) return;
        setResult(j);
        setHasMore(j.atoms.length >= ATOM_PAGE);
      })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [filters, refreshKey]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    if (filters.length === 0) {
      const offset = recentAtoms?.length ?? 0;
      const r = await fetch(`/api/atoms?limit=50&offset=${offset}`);
      const j = await r.json();
      const more = j.atoms as Atom[];
      setRecentAtoms((prev) => {
        const seen = new Set((prev ?? []).map((a) => a.atom_id));
        return [...(prev ?? []), ...more.filter((a) => !seen.has(a.atom_id))];
      });
      setHasMore(more.length >= 50);
    } else if (result) {
      const offset = result.atoms.length;
      const r = await fetch("/api/explore", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filters, offset, limit: ATOM_PAGE }),
      });
      const j: Result = await r.json();
      setResult((prev) => {
        if (!prev) return prev;
        const seen = new Set(prev.atoms.map((a) => a.atom_id));
        return { ...prev, atoms: [...prev.atoms, ...j.atoms.filter((a) => !seen.has(a.atom_id))] };
      });
      setHasMore(j.atoms.length >= ATOM_PAGE);
    }
    loadingRef.current = false;
  }, [filters, hasMore, recentAtoms, result]);

  function addFilter(f: Filter) {
    if (filters.some((x) => x.type === f.type && x.value === f.value)) return;
    setFilters((prev) => [...prev, f]);
  }

  const atomCount = filters.length > 0
    ? (result?.matchedCount ?? 0)
    : recentTotal;
  const atomSubtitle = busy ? "集計中..." : `${atomCount}件`;

  return (
    <div className="flex flex-col gap-3 overflow-hidden">
      <PaneHeader title="要点" subtitle={atomSubtitle} accent="indigo" />

      <div className="flex-1 overflow-y-auto pr-1 space-y-5">
        {filters.length === 0 && recentAtoms && recentAtoms.length > 0 && (
          <section>
            <ul className="space-y-2">
              {recentAtoms.map((a) => {
                const highlighted = selectedNoteId === a.note_id;
                return (
                  <li key={a.atom_id} className={`${atomCard} p-3 ${highlighted ? "ring-1 ring-blue-400" : ""}`}>
                    <button
                      onClick={() => setSelectedNoteId(a.note_id)}
                      className="font-medium text-left hover:underline w-full"
                      title="元メモを表示"
                    >{a.heading}</button>
                    <p className="text-sm text-neutral-700 dark:text-neutral-400 mt-1 whitespace-pre-wrap">{a.content}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.tags.map((t) => (
                        <button
                          key={t}
                          onClick={() => addFilter({ type: "tag", value: t })}
                          className={`${chip} px-2 py-0.5 text-xs`}
                        >#{t}</button>
                      ))}
                    </div>
                    <div className={`text-xs ${faded} mt-1`}>{formatLocal(a.created_at)}</div>
                  </li>
                );
              })}
            </ul>
            {hasMore && <Sentinel onHit={loadMore} />}
          </section>
        )}

        {result && result.matchedCount > 0 && (
          <section>
            <ul className="space-y-2">
              {result.atoms.map((a) => {
                const highlighted = selectedNoteId === a.note_id;
                return (
                  <li
                    key={a.atom_id}
                    className={`${atomCard} p-3 ${highlighted ? "ring-1 ring-blue-400" : ""}`}
                  >
                    <button
                      onClick={() => setSelectedNoteId(a.note_id)}
                      className="font-medium text-left hover:underline w-full"
                      title="元メモを表示"
                    >{a.heading}</button>
                    <p className="text-sm text-neutral-700 dark:text-neutral-400 mt-1 whitespace-pre-wrap">{a.content}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {a.tags.map((t) => (
                        <button
                          key={t}
                          onClick={() => addFilter({ type: "tag", value: t })}
                          className={`${chip} px-2 py-0.5 text-xs`}
                        >#{t}</button>
                      ))}
                    </div>
                    <div className={`text-xs ${faded} mt-1`}>{formatLocal(a.created_at)}</div>
                  </li>
                );
              })}
            </ul>
            {hasMore && <Sentinel onHit={loadMore} />}
          </section>
        )}

        {result && result.matchedCount === 0 && filters.length > 0 && (
          <div className={`text-sm ${muted}`}>該当するノートがありません。条件を外してみてください。</div>
        )}
      </div>
    </div>
  );
}
