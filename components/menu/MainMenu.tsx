"use client";

import { useEffect } from "react";
import {
  GROUPS,
  MENU,
  type GroupId,
  type MenuItem,
  type RoleType,
} from "./modules";

function isTyping(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  return (
    !!t &&
    (t.tagName === "INPUT" ||
      t.tagName === "TEXTAREA" ||
      t.tagName === "SELECT" ||
      t.isContentEditable)
  );
}

interface MainMenuProps {
  userRole: RoleType;
  userName: string;
  portalName?: string;
  hasAccess?: (moduleKey: string) => boolean;
  onOpenItem: (item: MenuItem) => void;
  onOpenGuide: () => void;
}

const HUE_STYLES: Record<
  string,
  { dot: string; iconBg: string; iconColor: string }
> = {
  blue: {
    dot: "bg-[var(--blue)]",
    iconBg: "bg-[var(--blue-soft)]",
    iconColor: "text-[var(--blue)]",
  },
  teal: {
    dot: "bg-[var(--mint)]",
    iconBg: "bg-[var(--mint-soft)]",
    iconColor: "text-[var(--mint-dark)]",
  },
  amber: {
    dot: "bg-[var(--warning)]",
    iconBg: "bg-[var(--warning-soft)]",
    iconColor: "text-[var(--warning)]",
  },
  slate: {
    dot: "bg-[var(--ink-secondary)]",
    iconBg: "bg-[var(--surface-2)]",
    iconColor: "text-[var(--ink)]",
  },
};

export function MainMenu({
  userRole,
  userName,
  portalName,
  hasAccess,
  onOpenItem,
  onOpenGuide,
}: MainMenuProps) {
  const isUsable = (item: MenuItem) => {
    if (item.adminOnly && userRole !== "manager") return false;
    if (hasAccess) return hasAccess(item.key);
    if (!item.allowedRoles) return true;
    return item.allowedRoles.includes(userRole);
  };

  // Keyboard shortcut listener (matching Car Loan)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        isTyping(e.target)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        onOpenGuide();
        return;
      }

      const hit = MENU.find(
        (m) => m.shortcut.toLowerCase() === e.key.toLowerCase()
      );
      if (hit && isUsable(hit)) {
        e.preventDefault();
        onOpenItem(hit);
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [userRole, onOpenItem, onOpenGuide]);

  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? "Good morning"
      : hour < 18
      ? "Good afternoon"
      : "Good evening";

  // Formatted date string
  const todayFormatted = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const byGroup = (g: GroupId) => MENU.filter((m) => m.group === g);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      {/* Header Banner */}
      <header className="flex flex-wrap items-end justify-between gap-4 pb-2 border-b border-[var(--line)]">
        <div>
          <h1
            className="text-2xl sm:text-3xl font-extrabold text-[var(--navy)] tracking-tight"
            style={{ letterSpacing: "-0.02em" }}
          >
            {greeting}, {userName}
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[var(--muted)] font-medium">
            {todayFormatted} • {portalName || "Clinical Management System"}
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs text-[var(--muted)] font-medium">
          <span className="hidden sm:inline" data-guide="menu-shortcuts">
            Press key on tile to open
          </span>
          <span className="hidden sm:inline text-[var(--line)]">|</span>
          <button
            type="button"
            data-guide="guide-btn"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--surface)] hover:text-[var(--ink)] text-xs font-bold transition-colors cursor-pointer"
          >
            <kbd className="font-mono text-[0.7rem] bg-[var(--surface)] px-1 py-0.5 rounded border border-[var(--line)]">
              ?
            </kbd>
            <span>guide</span>
          </button>
        </div>
      </header>

      {/* Grouped 5-Column Grid Tiles matching Car Loan */}
      <div className="space-y-8">
        {GROUPS.map((group) => {
          const tiles = byGroup(group.id);
          const visibleTiles = tiles.filter(isUsable);
          if (visibleTiles.length === 0) return null;
          const hue = HUE_STYLES[group.hue] || HUE_STYLES.blue;

          return (
            <section
              key={group.id}
              aria-labelledby={`group-${group.id}`}
              data-guide={`group-${group.id}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2
                  id={`group-${group.id}`}
                  className="flex items-center gap-2 text-sm font-extrabold text-[var(--navy)]"
                >
                  <span
                    className={`inline-block w-2.5 h-2.5 rounded-xs ${hue.dot}`}
                    aria-hidden
                  />
                  <span>{group.label}</span>
                </h2>
                <span className="text-[0.7rem] text-[var(--muted)] hidden md:inline">
                  {group.blurb}
                </span>
              </div>

              {/* Grid with min-height and pastel blue hover */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3.5">
                {visibleTiles.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => onOpenItem(item)}
                      className="tile group cursor-pointer hover:border-[var(--blue)] hover:shadow-md"
                    >
                      {/* Top Row: Icon + Shortcut key badge */}
                      <div className="tile-top flex items-start justify-between gap-2 w-full">
                        <div
                          className={`tile-icon ${hue.iconBg} ${hue.iconColor} p-2 rounded-lg transition-transform group-hover:scale-105`}
                        >
                          <Icon size={20} strokeWidth={2} aria-hidden />
                        </div>

                        <kbd
                          aria-hidden
                          className="font-mono text-[0.7rem] font-bold px-1.5 py-0.5 rounded border border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] group-hover:text-[var(--blue)] group-hover:border-[var(--blue)] transition-colors"
                        >
                          {item.shortcut}
                        </kbd>
                      </div>

                      {/* Bottom Text: Title + Description */}
                      <div className="tile-text mt-auto pt-3 text-left w-full">
                        <span className="block font-bold text-sm text-[var(--navy)] group-hover:text-[var(--blue)] transition-colors">
                          {item.label}
                        </span>
                        <span className="block text-xs text-[var(--muted)] mt-1 line-clamp-2 leading-relaxed">
                          {item.description}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
