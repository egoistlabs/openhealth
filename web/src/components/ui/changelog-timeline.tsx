"use client";

import * as React from "react";
import { ChevronDown, Pin, X } from "lucide-react";

/* Hover-to-read, click-to-pin timeline list, adapted from the changelog-timeline snippet.
   Changes from the original, for the console:
   - categories are passed in (label, mark, colour) instead of fixed new/improved/fixed;
   - each entry has a free `label` (e.g. a sol range) and optional `group` header instead of ISO dates
     and month headers, and keeps the order it is given;
   - an entry can carry a ReactNode `body` (buttons etc.), shown under its summary when open;
   - colours use the console tokens (surface, hair, text-2 …) rather than shadcn's card/border/chart;
   - the deploy status strip and commit-history footer are dropped. */

export type TimelineCategory = { label: string; mark: string; color: string };

export interface TimelineEntry {
  id: string;
  label: string;
  /** shown as a header row whenever it changes from the previous entry */
  group?: string;
  category: string;
  title: string;
  summary?: React.ReactNode;
  body?: React.ReactNode;
}

type DivProps = React.ComponentPropsWithRef<"div">;
type ContainerProps = { [Key in keyof DivProps as Key extends "title" ? never : Key]: DivProps[Key] };

export type ChangelogTimelineProps = ContainerProps & {
  entries: TimelineEntry[];
  categories: Record<string, TimelineCategory>;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Rows before the list scrolls; half of the next headline remains visible. */
  visibleEntries?: number;
  onClose?: () => void;
  expandOnHover?: boolean;
  expanded?: string | null;
  defaultExpanded?: string | null;
  onExpandedChange?: (id: string | null) => void;
  /** A pinned row holds the single expansion until unpinned. */
  pinned?: string | null;
  defaultPinned?: string | null;
  onPinnedChange?: (id: string | null) => void;
  empty?: React.ReactNode;
};

const FALLBACK: TimelineCategory = { label: "", mark: "·", color: "var(--c-action)" };

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function ChangelogTimeline({
  entries,
  categories,
  title,
  subtitle,
  visibleEntries = 9,
  onClose,
  expandOnHover = true,
  expanded,
  defaultExpanded = null,
  onExpandedChange,
  pinned,
  defaultPinned = null,
  onPinnedChange,
  empty = "Nothing here yet.",
  ref,
  className,
  ...rest
}: ChangelogTimelineProps) {
  const [localExpanded, setLocalExpanded] = React.useState(defaultExpanded ?? defaultPinned);
  const [localPinned, setLocalPinned] = React.useState(defaultPinned);
  const [layout, setLayout] = React.useState({ top: 0, height: 0, start: 0, length: 0, maxHeight: undefined as number | undefined });
  const stageRef = React.useRef(null as HTMLDivElement | null);
  const listRef = React.useRef(null as HTMLOListElement | null);
  const hoverFrame = React.useRef(0);
  const leaveTimer = React.useRef(0);
  const pendingHover = React.useRef(null as string | null);
  const titleId = React.useId();
  const idPrefix = React.useId();
  const cat = (k: string) => categories[k] ?? FALLBACK;
  const requestedExpanded = expanded === undefined ? localExpanded : expanded;
  const activeId = entries.some((entry) => entry.id === requestedExpanded) ? requestedExpanded : null;
  const requestedPin = pinned === undefined ? localPinned : pinned;
  // A controlled expanded value remains authoritative, even if a pin intent is declined.
  const pinnedId = requestedPin === activeId ? activeId : null;
  const activeEntry = entries.find((entry) => entry.id === activeId);
  const count = Number.isFinite(visibleEntries) ? Math.max(1, Math.floor(visibleEntries)) : 9;

  const updateExpanded = (id: string | null) => {
    if (id === activeId) return;
    if (expanded === undefined) setLocalExpanded(id);
    onExpandedChange?.(id);
  };
  const updatePinned = (id: string | null) => {
    if (pinned === undefined) setLocalPinned(id);
    onPinnedChange?.(id);
  };
  const actions = React.useRef({ updateExpanded, pinnedId, expandOnHover });
  React.useLayoutEffect(() => { actions.current = { updateExpanded, pinnedId, expandOnHover }; });

  const cancelPending = () => {
    window.clearTimeout(leaveTimer.current);
    window.cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = 0;
  };
  const preview = (id: string) => {
    window.clearTimeout(leaveTimer.current);
    if (!expandOnHover || pinnedId) return;
    pendingHover.current = id;
    if (hoverFrame.current) return;
    // Pointer moves commit once per frame; layout-induced pointerenter events cannot bounce rows.
    hoverFrame.current = window.requestAnimationFrame(() => {
      hoverFrame.current = 0;
      if (actions.current.expandOnHover && !actions.current.pinnedId) actions.current.updateExpanded(pendingHover.current);
    });
  };
  const leave = () => {
    window.cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = 0;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => {
      const focused = listRef.current?.querySelector(":focus-visible");
      if (!actions.current.pinnedId && !focused) actions.current.updateExpanded(null);
    }, window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 120);
  };
  const togglePin = (id: string) => {
    cancelPending();
    const next = pinnedId === id ? null : id;
    updatePinned(next);
    updateExpanded(next);
  };

  React.useEffect(() => () => {
    window.clearTimeout(leaveTimer.current);
    window.cancelAnimationFrame(hoverFrame.current);
  }, []);

  React.useLayoutEffect(() => {
    const stage = stageRef.current;
    const list = listRef.current;
    if (!stage || !list) return;
    let frame = 0;
    let live = true;
    const rows = Array.from(list.querySelectorAll("[data-entry]")) as HTMLLIElement[];
    const measure = () => {
      frame = 0;
      if (!live) return;
      const origin = stage.getBoundingClientRect().top;
      const firstNode = rows[0]?.querySelector("[data-node]")?.getBoundingClientRect();
      const lastNode = rows.at(-1)?.querySelector("[data-node]")?.getBoundingClientRect();
      const activeIndex = rows.findIndex((item) => item.dataset.entryId === activeId);
      const activeRow = rows[activeIndex];
      const row = activeRow?.getBoundingClientRect();
      const bodyHeight = activeRow?.querySelector("[data-entry-body]")?.getBoundingClientRect().height ?? 0;
      const fullHeight = activeRow?.querySelector("[data-entry-copy]")?.getBoundingClientRect().height ?? 0;
      const precedingHeight = rows.slice(0, Math.max(0, activeIndex)).reduce((height, item) => height + (item.querySelector("[data-entry-body]")?.getBoundingClientRect().height ?? 0), 0);
      const peek = rows[count];
      const peekBox = peek?.getBoundingClientRect();
      const peekHeader = peek?.querySelector("[data-entry-trigger]")?.getBoundingClientRect();
      const next = {
        // Target the final accordion geometry once, so body resizing cannot restart the rail transition.
        top: row ? row.top - origin - precedingHeight : 0,
        height: row ? row.height - bodyHeight + fullHeight : 0,
        start: firstNode ? firstNode.top + firstNode.height / 2 - origin : 0,
        length: firstNode && lastNode ? lastNode.top + lastNode.height / 2 - firstNode.top - firstNode.height / 2 : 0,
        maxHeight: peekBox && peekHeader ? peekBox.top - origin + peekHeader.height / 2 : undefined,
      };
      setLayout((previous) => Object.keys(next).every((key) => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(stage);
    rows.forEach((row) => observer.observe(row));
    document.fonts?.ready.then(schedule).catch(() => undefined);
    return () => { live = false; observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [activeId, entries, count]);

  return (
    <div {...rest} ref={ref} role="region" aria-labelledby={title ? titleId : undefined} data-slot="changelog-timeline" data-expanded={activeId ?? ""} data-pinned={pinnedId ?? ""}
      className={cx("flex w-full flex-col rounded-control border border-hair-strong bg-surface text-text", className)}>
      <style>{`
        @keyframes changelog-node-breathe { 0%,100% { transform:scale(1); opacity:.55 } 50% { transform:scale(1.35); opacity:1 } }
        @keyframes changelog-node-ripple { 0% { transform:scale(.8); opacity:.8 } 100% { transform:scale(3.2); opacity:0 } }
        [data-slot="changelog-timeline"] [data-idle-pulse="true"] { animation:changelog-node-breathe 2.4s ease-in-out infinite; }
        [data-slot="changelog-timeline"] [data-node-ripple] { animation:changelog-node-ripple 500ms ease-out both; }
        [data-slot="changelog-timeline"] [data-entry-body] { display:grid; grid-template-rows:0fr; transition:grid-template-rows 240ms ease-out; }
        [data-slot="changelog-timeline"] [data-entry-body][data-open="true"] { grid-template-rows:1fr; }
        [data-slot="changelog-timeline"] [data-rail-highlight] { transition:transform 300ms ease-out, background-color 300ms ease-out, opacity 160ms ease-out; }
        [data-slot="changelog-timeline"] [data-node-core] { transition:transform 240ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          [data-slot="changelog-timeline"] *, [data-slot="changelog-timeline"] *::before, [data-slot="changelog-timeline"] *::after { animation:none !important; transition:none !important; }
          [data-slot="changelog-timeline"] [data-node-ripple] { opacity:0; }
        }
      `}</style>

      {title || onClose ? (
        <div className="flex shrink-0 items-start justify-between gap-3 px-3 pt-3 pb-2">
          <div>
            {title ? <h2 id={titleId} className="text-body font-semibold">{title}</h2> : null}
            {subtitle ? <p className="text-label text-text-3">{subtitle}</p> : null}
          </div>
          {onClose
            ? <button type="button" onClick={onClose} aria-label="Close" className="rounded-control p-1.5 text-text-2 hover:bg-surface-2 hover:text-text"><X className="size-4" /></button>
            : <span className="mt-1 text-[10px] text-text-3">Hover to read · click to pin</span>}
        </div>
      ) : null}

      <div data-list-viewport className="min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ maxHeight: layout.maxHeight }}>
        <div ref={stageRef} data-rail-stage className="relative px-2 pb-2">
          <span data-rail-base aria-hidden="true" className="pointer-events-none absolute left-[17px] w-0.5 bg-hair-strong" style={{ top: layout.start, height: layout.length }} />
          <span data-rail-highlight aria-hidden="true" className="pointer-events-none absolute left-[16.5px] top-0 z-[1] h-px w-[3px] origin-top rounded-full"
            style={{ transform: `translateY(${layout.top}px) scaleY(${layout.height})`, backgroundColor: activeEntry ? cat(activeEntry.category).color : "var(--c-action)", opacity: activeId ? 1 : 0 }} />
          <ol ref={listRef} data-entry-list onPointerMove={(event) => {
            if (event.pointerType === "touch") return;
            const target = (event.target as Element).closest("[data-entry]") as HTMLElement | null;
            if (target?.dataset.entryId) preview(target.dataset.entryId);
            else window.clearTimeout(leaveTimer.current);
          }} onPointerEnter={() => window.clearTimeout(leaveTimer.current)} onPointerLeave={leave} onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) leave();
          }}>
            {entries.map((entry, index) => {
              const showGroup = entry.group !== undefined && entry.group !== entries[index - 1]?.group;
              const category = cat(entry.category);
              const open = activeId === entry.id;
              const isPinned = pinnedId === entry.id;
              const bodyId = `${idPrefix}-body-${index}`;
              const triggerId = `${idPrefix}-trigger-${index}`;
              return <React.Fragment key={entry.id}>
                {showGroup && <li data-group className="flex h-6 items-center pl-8 font-mono text-[10px] uppercase tracking-[0.14em] text-text-3">{entry.group}</li>}
                <li data-entry data-entry-id={entry.id} data-category={entry.category} data-open={open}
                  className={cx("relative rounded-control transition-colors duration-200 motion-reduce:transition-none", open && "bg-surface-2")}>
                  <button type="button" id={triggerId} data-entry-trigger={entry.id} aria-expanded={open} aria-pressed={isPinned} aria-controls={bodyId} title={entry.title} onFocus={() => {
                    window.clearTimeout(leaveTimer.current);
                    if (!pinnedId) updateExpanded(entry.id);
                  }} onClick={() => togglePin(entry.id)} onKeyDown={(event) => {
                    if (event.key === "Escape") { event.preventDefault(); cancelPending(); updatePinned(null); updateExpanded(null); return; }
                    const direction = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
                    if (!direction && event.key !== "Home" && event.key !== "End") return;
                    event.preventDefault();
                    const buttons = Array.from(listRef.current?.querySelectorAll("[data-entry-trigger]") ?? []) as HTMLButtonElement[];
                    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + direction + buttons.length) % buttons.length;
                    buttons[next]?.focus();
                  }} className="grid min-h-9 w-full grid-cols-[20px_minmax(0,1fr)_auto_14px] items-center gap-2 rounded-control pr-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-action">
                    <span data-node aria-hidden="true" className="relative z-10 flex size-5 items-center justify-center" style={{ color: open ? category.color : "var(--c-text-3)" }}>
                      {open && <span key={entry.id} data-node-ripple className="absolute size-3 rounded-full border border-current opacity-0" />}
                      <span data-node-core data-idle-pulse={index === 0 && !activeId ? "true" : undefined} className="relative size-2 rounded-full bg-current ring-[3px] ring-surface"
                        style={{ transform: open ? "scale(1.4)" : "scale(1)", opacity: open ? 1 : 0.7, color: category.color }} />
                    </span>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className={cx("truncate text-label leading-5", open ? "font-semibold text-text" : "font-medium text-text")}>{entry.title}</span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-text-3">{entry.label}</span>
                    </span>
                    <span className="justify-self-end whitespace-nowrap rounded-control border px-1.5 py-px font-mono text-[10px] font-medium"
                      style={{ color: category.color, borderColor: `color-mix(in srgb, ${category.color} 40%, transparent)`, background: open ? `color-mix(in srgb, ${category.color} 12%, transparent)` : "transparent" }}>
                      {category.mark} {category.label}
                    </span>
                    {isPinned ? <Pin data-pin-mark aria-label="Pinned" className="size-3 text-text" /> : <ChevronDown aria-hidden="true" className={cx("size-3 text-text-2 transition-transform duration-200 motion-reduce:transition-none", open && "rotate-180")} />}
                  </button>
                  <div id={bodyId} role="region" aria-labelledby={triggerId} aria-hidden={!open} inert={!open} data-entry-body data-open={open}>
                    <div className="min-h-0 overflow-hidden">
                      <div data-entry-copy className="grid gap-2 pb-3 pl-8 pr-3 pt-0.5">
                        {entry.summary ? <div className="text-label leading-[18px] text-text-2">{entry.summary}</div> : null}
                        {entry.body}
                        {!entry.summary && !entry.body ? <p className="text-label leading-[18px] text-text-2">{entry.title}</p> : null}
                      </div>
                    </div>
                  </div>
                </li>
              </React.Fragment>;
            })}
          </ol>
          {entries.length === 0 && <div className="px-3 py-6 text-center text-label text-text-2">{empty}</div>}
        </div>
      </div>
      <p role="status" aria-live="polite" className="sr-only">{pinnedId ? `Pinned: ${activeEntry?.title}` : "Nothing pinned."}</p>
    </div>
  );
}

export default ChangelogTimeline;
