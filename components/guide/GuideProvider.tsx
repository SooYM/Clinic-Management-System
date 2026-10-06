"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { TOURS, type GuideStep, type TourId } from "./tours";

interface GuideValue {
  start: (tour: TourId) => void;
  active: boolean;
}

const GuideContext = createContext<GuideValue>({
  start: () => undefined,
  active: false,
});

export const useGuide = () => useContext(GuideContext);

/* ---------------- First-visit flag (per username/role) ---------------- */

const SEEN_KEY = (username: string) =>
  `clinic-cms.guide-seen.${username.toLowerCase()}`;
const seenInMemory: Record<string, true> = {};

export function hasSeenGuide(username: string): boolean {
  const key = SEEN_KEY(username);
  if (seenInMemory[key]) return true;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function markGuideSeen(username: string) {
  const key = SEEN_KEY(username);
  seenInMemory[key] = true;
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* storage blocked */
  }
}

/** Find first visible element matching [data-guide="..."] */
function findTarget(id: string | undefined): HTMLElement | null {
  if (!id) return null;
  const list = document.querySelectorAll<HTMLElement>(`[data-guide="${id}"]`);
  for (let i = 0; i < list.length; i++) {
    if (list[i].getClientRects().length > 0) return list[i];
  }
  return null;
}

export function GuideProvider({
  children,
  username,
}: {
  children: ReactNode;
  username: string | null;
}) {
  const [tour, setTour] = useState<{ id: TourId; steps: GuideStep[] } | null>(
    null
  );

  const start = useCallback((id: TourId) => {
    const tourList = TOURS[id];
    if (!tourList) return;
    // skip steps whose target is not currently in the DOM
    const steps = tourList.filter((s) => !s.target || findTarget(s.target));
    if (steps.length) setTour({ id, steps });
  }, []);

  const close = useCallback(() => {
    if (tour?.id === "menu" && username) markGuideSeen(username);
    setTour(null);
  }, [tour, username]);

  return (
    <GuideContext.Provider value={{ start, active: !!tour }}>
      {children}
      {tour && <Coachmarks key={tour.id} steps={tour.steps} onClose={close} />}
    </GuideContext.Provider>
  );
}

/**
 * Starts the Main Menu tour once on first login.
 */
export function useFirstLoginGuide(username: string | null) {
  const guide = useGuide();

  useEffect(() => {
    if (!username || guide.active || hasSeenGuide(username)) return;
    const timer = window.setTimeout(() => {
      const menuReady = !!findTarget("group-frontdesk");
      if (menuReady && !document.querySelector('[role="dialog"]')) {
        guide.start("menu");
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [username, guide.active, guide]);
}

/* ---------------- Coachmarks Component ---------------- */

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}
type Side = "below" | "above" | "right" | "left" | "none";

const PAD = 8;
const GAP = 16;
const CARD_W = 380;
const EDGE = 12;
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

function bringIntoBand(el: HTMLElement) {
  try {
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  } catch {
    el.scrollIntoView(false);
  }
}

function Coachmarks({
  steps,
  onClose,
}: {
  steps: GuideStep[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [view, setView] = useState({
    w: typeof window !== "undefined" ? window.innerWidth : 1024,
    h: typeof window !== "undefined" ? window.innerHeight : 768,
  });
  const [cardH, setCardH] = useState(220);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const last = index === steps.length - 1;

  const next = useCallback(() => {
    if (last) onClose();
    else setIndex((i) => i + 1);
  }, [last, onClose]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  const measure = useCallback(() => {
    setView({ w: window.innerWidth, h: window.innerHeight });
    const el = findTarget(step?.target);
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({
      top: r.top - PAD,
      left: r.left - PAD,
      width: r.width + PAD * 2,
      height: r.height + PAD * 2,
    });
  }, [step]);

  useLayoutEffect(() => {
    const h = cardRef.current ? cardRef.current.offsetHeight : cardH;
    if (Math.abs(h - cardH) > 1) setCardH(h);
    const el = findTarget(step?.target);
    if (el) bringIntoBand(el);
    measure();
  }, [step, measure, cardH]);

  useEffect(() => {
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        back();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [next, back, onClose]);

  if (!step) return null;

  const { w: vw, h: vh } = view;
  const isMobile = vw < 640;
  const n = index + 1;

  // Placement calculation
  let cardStyle: CSSProperties;
  let side: Side = "none";
  let arrowStyle: CSSProperties | null = null;

  if (isMobile) {
    cardStyle = { left: 12, right: 12, bottom: 16 };
  } else {
    const cardW = Math.min(CARD_W, vw - EDGE * 2);
    if (box) {
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const hLeft = clamp(cx - cardW / 2, EDGE, vw - cardW - EDGE);
      const vTop = clamp(cy - cardH / 2, EDGE, vh - cardH - EDGE);

      if (box.top + box.height + GAP + cardH <= vh - EDGE) {
        side = "below";
        cardStyle = { top: box.top + box.height + GAP, left: hLeft, width: cardW };
        arrowStyle = { top: -7, left: clamp(cx - hLeft - 7, 14, cardW - 28) };
      } else if (box.top - GAP - cardH >= EDGE) {
        side = "above";
        cardStyle = { top: box.top - GAP - cardH, left: hLeft, width: cardW };
        arrowStyle = { bottom: -7, left: clamp(cx - hLeft - 7, 14, cardW - 28) };
      } else if (box.left + box.width + GAP + cardW <= vw - EDGE) {
        side = "right";
        cardStyle = { top: vTop, left: box.left + box.width + GAP, width: cardW };
        arrowStyle = { left: -7, top: clamp(cy - vTop - 7, 14, cardH - 28) };
      } else if (box.left - GAP - cardW >= EDGE) {
        side = "left";
        cardStyle = { top: vTop, left: box.left - GAP - cardW, width: cardW };
        arrowStyle = { right: -7, top: clamp(cy - vTop - 7, 14, cardH - 28) };
      } else {
        cardStyle = { bottom: EDGE, left: vw / 2 - cardW / 2, width: cardW };
      }
    } else {
      cardStyle = {
        top: Math.max(EDGE, vh / 2 - cardH / 2),
        left: vw / 2 - cardW / 2,
        width: cardW,
      };
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] pointer-events-auto">
      {box ? (
        <>
          {/* 4 dark backdrop segments */}
          <div
            className="guide-dim"
            style={{ top: 0, left: 0, right: 0, height: Math.max(0, box.top) }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="guide-dim"
            style={{
              top: box.top + box.height,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="guide-dim"
            style={{
              top: box.top,
              left: 0,
              width: Math.max(0, box.left),
              height: box.height,
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="guide-dim"
            style={{
              top: box.top,
              left: box.left + box.width,
              right: 0,
              height: box.height,
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div className="guide-spot" style={box} />
        </>
      ) : (
        <div
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Coachmark Card */}
      <div
        key={index}
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guide-title"
        aria-describedby="guide-body"
        tabIndex={-1}
        className="fixed z-[100] rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-2xl transition-all duration-200 animate-in fade-in zoom-in-95 pointer-events-auto"
        style={{ ...cardStyle, zIndex: 100 }}
      >
        {arrowStyle && (
          <span
            className={`guide-arrow guide-arrow-${side}`}
            style={arrowStyle}
            aria-hidden
          />
        )}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.68rem] font-extrabold uppercase tracking-wide bg-[var(--blue-soft)] text-[var(--blue-on-soft)] mb-1">
              Step {n} of {steps.length}
            </span>
            <h2
              id="guide-title"
              className="text-base font-extrabold text-[var(--navy)] leading-snug truncate"
            >
              {step.label}
            </h2>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="-mr-1.5 -mt-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] transition-colors cursor-pointer"
            aria-label="Close guide"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <p
          id="guide-body"
          className="mt-2 text-xs sm:text-sm text-[var(--ink-secondary)] leading-relaxed"
        >
          {step.body}
        </p>

        {/* Progress dots */}
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {steps.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === index
                  ? "w-6 bg-[var(--blue)]"
                  : i < index
                  ? "w-2 bg-[var(--blue)]/40"
                  : "w-2 bg-[var(--line)]"
              }`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div className="mt-5 flex items-center justify-between gap-2 pt-3 border-t border-[var(--line)]">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)] transition-colors px-2 py-1.5 cursor-pointer"
          >
            Skip Tour
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  back();
                }}
                className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={14} strokeWidth={2.5} />
                <span>Back</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              className="btn-primary text-xs py-1.5 px-3.5 flex items-center gap-1.5 shadow-sm cursor-pointer font-bold"
            >
              <span>{last ? "Done" : "Next"}</span>
              {!last && <ArrowRight size={14} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
