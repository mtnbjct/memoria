"use client";
import type { ReactNode } from "react";

export function PaneHeader({
  title,
  subtitle,
  right,
  accent,
  collapsed,
  onToggleCollapse,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  accent?: "indigo" | "amber" | "violet" | "none";
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const dot =
    accent === "indigo" ? "bg-indigo-500"
    : accent === "amber" ? "bg-amber-500"
    : accent === "violet" ? "bg-violet-500"
    : null;
  return (
    <div className="shrink-0 flex items-center gap-2 h-7">
      {dot && <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />}
      <h2 className="text-sm font-bold tracking-wide">{title}</h2>
      {subtitle && !collapsed && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</span>
      )}
      {right && !collapsed && <div className="ml-auto">{right}</div>}
      {onToggleCollapse && (
        <button
          onClick={onToggleCollapse}
          className="ml-auto text-xs text-neutral-500 dark:text-neutral-400 hover:text-black dark:hover:text-white"
          title={collapsed ? "展開" : "折り畳む"}
        >{collapsed ? "▶" : "◀"}</button>
      )}
    </div>
  );
}
