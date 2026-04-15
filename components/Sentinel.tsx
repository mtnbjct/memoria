"use client";
import { useEffect, useRef } from "react";

export function Sentinel({
  onHit,
  disabled,
}: {
  onHit: () => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || disabled) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) onHit();
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onHit, disabled]);
  return <div ref={ref} aria-hidden className="h-4" />;
}
