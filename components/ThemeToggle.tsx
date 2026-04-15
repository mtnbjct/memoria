"use client";
import { useEffect, useState } from "react";

type Mode = "light" | "dark";

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("light");

  useEffect(() => {
    setMode(document.documentElement.classList.contains("dark") ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    const root = document.documentElement;
    if (next === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try { localStorage.setItem("theme", next); } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label="テーマ切替"
      className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-black dark:hover:text-white"
    >
      {mode === "dark" ? "☀ ライト" : "☾ ダーク"}
    </button>
  );
}
