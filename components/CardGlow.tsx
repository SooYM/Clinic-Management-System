"use client";
import { useEffect } from "react";

// Card families that carry pointer-tracking border glow
const GLOW_SELECTOR = ".glow-card,.clinic-card,.queue-card,.room-card,.package-card,.stat-card";

/** Writes `--mouse-x/--mouse-y` on hovered card with pastel blue gradient */
export function CardGlow() {
  useEffect(() => {
    function move(event: PointerEvent) {
      if (event.pointerType !== "mouse") return;
      const card = (event.target as Element | null)?.closest<HTMLElement>(GLOW_SELECTOR);
      if (!card) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
      card.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
    }
    document.addEventListener("pointermove", move, { passive: true });
    return () => document.removeEventListener("pointermove", move);
  }, []);
  return null;
}
