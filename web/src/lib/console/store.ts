/* Submitted check-ins and the companion log, kept in the browser's local storage so they survive a reload.
   One entry per person per sol; submitting again replaces it. The rest of the app reads these
   through day() in data.ts (hydrated by ConsoleProvider), so every screen shows the saved values. */
import type { ConvoRow, Day, LogEvent } from "./data";

const KEY = "openhealth.checkins.v1";

export type SavedCheckin = {
  id: string;
  sol: number;
  /* when it was submitted (ISO time on this device) */
  savedAt: string;
  /* the values written for that sol */
  day: Partial<Day>;
  /* the log lines the submission added (check-in done, reaction result) */
  events: LogEvent[];
};

const valid = (x: unknown): x is SavedCheckin => {
  const r = x as SavedCheckin;
  return !!r && typeof r.id === "string" && typeof r.sol === "number" && typeof r.day === "object" && r.day !== null && Array.isArray(r.events);
};

export function loadCheckins(): SavedCheckin[] {
  try {
    const raw = localStorage.getItem(KEY);
    const all: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(all) ? all.filter(valid) : [];
  } catch {
    return []; // storage blocked or unreadable: the app runs on the simulated data
  }
}

/* false when storage is unavailable (private window, blocked site data, full) */
export function saveCheckin(entry: SavedCheckin): boolean {
  try {
    const all = loadCheckins().filter((x) => !(x.id === entry.id && x.sol === entry.sol));
    all.push(entry);
    localStorage.setItem(KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/* ---------- companion log ---------- */
/* The conversation with the companion, per person, as shown in the companion log. Capped so storage stays small. */
const CONVO_KEY = "openhealth.convo.v1";
const CONVO_MAX = 300;

export function loadConvo(): Record<string, ConvoRow[]> {
  try {
    const raw = localStorage.getItem(CONVO_KEY);
    const all: unknown = raw ? JSON.parse(raw) : {};
    if (!all || typeof all !== "object" || Array.isArray(all)) return {};
    const out: Record<string, ConvoRow[]> = {};
    for (const [id, rows] of Object.entries(all as Record<string, unknown>)) {
      if (Array.isArray(rows)) out[id] = rows.filter((r): r is ConvoRow => !!r && typeof r === "object" && typeof (r as ConvoRow).who === "string" && typeof (r as ConvoRow).sol === "number");
    }
    return out;
  } catch {
    return {};
  }
}

export function saveConvo(convo: Record<string, ConvoRow[]>) {
  try {
    const capped = Object.fromEntries(Object.entries(convo).map(([id, rows]) => [id, rows.slice(-CONVO_MAX)]));
    localStorage.setItem(CONVO_KEY, JSON.stringify(capped));
  } catch { /* storage blocked or full: the log lasts until reload */ }
}

export function clearCheckins() {
  try { localStorage.removeItem(KEY); localStorage.removeItem(CONVO_KEY); } catch { /* nothing to clear */ }
}

/* ---------- body map ---------- */
/* Pain and skin spots marked on the body map, now opened from Pedro rather than the check-in. One entry
   per person per sol (the PN-01 log line with its pins); saving again replaces it, null clears it. */
const BODY_KEY = "openhealth.body.v1";
export type SavedBody = { id: string; sol: number; event: LogEvent };

export function loadBodyLogs(): SavedBody[] {
  try {
    const raw = localStorage.getItem(BODY_KEY);
    const all: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(all) ? all.filter((x): x is SavedBody => !!x && typeof x.id === "string" && typeof x.sol === "number" && !!x.event) : [];
  } catch {
    return [];
  }
}

export function saveBodyLog(id: string, sol: number, event: LogEvent | null): boolean {
  try {
    const all = loadBodyLogs().filter((x) => !(x.id === id && x.sol === sol));
    if (event) all.push({ id, sol, event });
    localStorage.setItem(BODY_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}
