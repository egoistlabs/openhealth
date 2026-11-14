"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  CREW, KEYS, MISSION, P, RANK, conversation, crewById, day, events, isOut, mstatus,
  type ConvoRow, type LogEvent, type MeasureKey, type Shares, type Status, type Tone,
} from "@/lib/console/data";
import { Presence } from "@/lib/console/presence";

export type Theme = "console" | "clinic";
export const THEMES: Array<[Theme, string, string]> = [
  ["console", "Mission console", "Dark · technical"],
  ["clinic", "Calm clinic", "Light · soft"],
];

export type ConsoleState = {
  role: "astro" | "crew";
  me: string;
  sol: number;
  shares: Shares;
  tone: Tone;
  voice: boolean;
  log: boolean;
  logScope: "person" | "crew";
  logRange: "sol" | "three";
  logF: { flag: boolean; checkin: boolean; journal: boolean; obs: boolean };
  hi: { sol: number; type: string; key: string | null; idx: string } | null;
  done: Record<string, { min: number }>;
  extra: Record<string, LogEvent[]>;
  convo: Record<string, ConvoRow[]>;
  draft: Partial<Record<MeasureKey, number>>;
  open: Partial<Record<MeasureKey, boolean>>;
  why: Record<string, boolean>;
  drawer: boolean;
  tab: "conversation" | "alerts" | "insights" | "journal";
  settings: boolean;
  chatted: boolean;
  /* bumped when today's check-in is written, so derived numbers recompute */
  rev: number;
};

const initial: ConsoleState = {
  role: "astro", me: "sato", sol: P,
  shares: Object.fromEntries(CREW.map((c) => [c.id, c.shares.slice()])),
  tone: "gentle", voice: true,
  log: false, logScope: "person", logRange: "three", logF: { flag: true, checkin: true, journal: true, obs: true },
  hi: null, done: {}, extra: {}, convo: {}, draft: {}, open: {}, why: {},
  drawer: false, tab: "conversation", settings: false, chatted: false, rev: 0,
};

type Patch = Partial<ConsoleState> | ((s: ConsoleState) => Partial<ConsoleState>);
export type Flag = { key: MeasureKey; st: Status };
const PRIORITY: MeasureKey[] = ["timing", "sleep", "load", "mood", "engage", "team", "rt"];

type Ctx = {
  s: ConsoleState;
  set: (p: Patch) => void;
  atPresent: boolean;
  clockMin: number;
  landing: string;
  say: (t: string) => void;
  live: string;
  flagsFor: (id?: string) => Flag[];
  openFlags: () => Flag[];
  doneKey: (key: string) => string;
  checkedToday: (id?: string) => boolean;
  st: (key: MeasureKey, id?: string) => Status;
  shared: (id: string) => MeasureKey[];
  convo: () => ConvoRow[];
  addLines: (rows: Array<Omit<ConvoRow, "sol" | "min"> & Partial<Pick<ConvoRow, "sol" | "min">>>) => void;
  personEvents: (id: string, sol: number) => LogEvent[];
  theme: Theme;
  setTheme: (t: Theme) => void;
};

const ConsoleContext = createContext<Ctx | null>(null);

export function useConsole() {
  const c = useContext(ConsoleContext);
  if (!c) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return c;
}

export function ConsoleProvider({ children }: { children: ReactNode }) {
  const [s, setS] = useState<ConsoleState>(initial);
  const [live, setLive] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const t0 = useRef(0);

  const set = useCallback((p: Patch) => setS((prev) => ({ ...prev, ...(typeof p === "function" ? p(prev) : p) })), []);

  // mission clock: starts at the prototype's 14:26 and runs in real minutes (client only, so SSR matches)
  useEffect(() => {
    t0.current = Date.now();
    const id = window.setInterval(() => setElapsed(Math.floor((Date.now() - t0.current) / 60000)), 5000);
    return () => window.clearInterval(id);
  }, []);

  // look: lives on <html data-theme> (set before paint by the root layout script)
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "console" as Theme);

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.dataset.theme = t;
    document.documentElement.style.colorScheme = t === "clinic" ? "light" : "dark";
    try { localStorage.setItem("cc-theme", t); } catch { /* storage unavailable */ }
    Presence.refresh();
  }, []);

  const value = useMemo<Ctx>(() => {
    const atPresent = s.sol === P;
    const clockMin = atPresent ? MISSION.clockMin + elapsed : 23 * 60 + 59;
    const st = (key: MeasureKey, id = s.me) => mstatus(id, key, s.sol);
    const flagsFor = (id = s.me) =>
      KEYS.map((k) => ({ key: k, st: mstatus(id, k, s.sol) })).filter((x) => isOut(x.st))
        .sort((a, b) => RANK[b.st.state] - RANK[a.st.state] || b.st.k - a.st.k || PRIORITY.indexOf(a.key) - PRIORITY.indexOf(b.key));
    const doneKey = (key: string) => `${s.me}|${key}|${s.sol}`;
    const convo = () => (atPresent ? s.convo[s.me] ?? conversation(s.me, P) : conversation(s.me, s.sol));
    return {
      s, set, atPresent, clockMin,
      landing: s.role === "crew" ? "/crew" : "/",
      say: (t: string) => setLive(t),
      live,
      st,
      flagsFor,
      openFlags: () => flagsFor().filter((x) => !s.done[doneKey(x.key)]),
      doneKey,
      checkedToday: (id = s.me) => !!day(id, s.sol)?.checkin,
      shared: (id: string) => s.shares[id] || [],
      convo,
      addLines: (rows) => setS((prev) => {
        const base = prev.convo[prev.me] ?? conversation(prev.me, P);
        const added = rows.map((r) => ({ sol: P, min: MISSION.clockMin + elapsed, ...r }) as ConvoRow);
        return { ...prev, convo: { ...prev.convo, [prev.me]: [...base, ...added] } };
      }),
      personEvents: (id: string, sol: number) => events(id, sol).concat((s.extra[id] || []).filter((e) => e.sol === sol)).sort((a, b) => a.min - b.min),
      theme, setTheme,
    };
  }, [s, set, elapsed, live, theme, setTheme]);

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export const me = (id: string) => crewById(id);

function subscribeTheme(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
function readTheme(): Theme {
  return document.documentElement.dataset.theme === "clinic" ? "clinic" : "console";
}
