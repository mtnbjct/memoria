"use client";
import type { ReactNode } from "react";

export function PaneHeader({
  title,
  subtitle,
  right,
  accent,
}: {
  title: string;
  subtitle?: ReactNode;
  right?: ReactNode;
  accent?: "indigo" | "amber" | "none";
}) {
  const dot =
    accent === "indigo" ? "bg-indigo-500"
    : accent === "amber" ? "bg-amber-500"
    : null;
  return (
    <div className="shrink-0 flex items-center gap-2 h-7">
      {dot && <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />}
      <h2 className="text-sm font-bold tracking-wide">{title}</h2>
      {subtitle && <span className="text-xs text-neutral-500 dark:text-neutral-400">{subtitle}</span>}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
