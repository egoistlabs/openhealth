/* Advice from Earth: short notes the flight surgeon writes to one astronaut, kept per astronaut per sol.
   Only the present sol can be written to (the UI enforces it, and addEarthNote refuses past sols).
   A note is "in transit" until the one-way light time has passed, then "arrived" on Mars.
   Stored on this device (localStorage), like the check-ins in store.ts. The crew-side view and Pedro's
   summary of the thread are not built yet: they read the same list with notesFor(). */
import { useSyncExternalStore } from "react";
import type { Attachment } from "./earth-files";

export type EarthNote = {
  id: string;
  /* the astronaut it is for */
  crewId: string;
  sol: number;
  /* hab clock (LMST minutes) when it was sent, and when it reaches Mars */
  sentMin: number;
  arriveMin: number;
  author: string;
  text: string;
  /* files sent with the note (the files themselves are in IndexedDB, see earth-files.ts) */
  attachments?: Attachment[];
};

export const NOTE_MAX = 500;
const KEY = "openhealth.earthnotes.v1";
let memory: EarthNote[] = [];
const listeners = new Set<() => void>();
let cache: EarthNote[] | null = null;
const perKey = new Map<string, EarthNote[]>();
const EMPTY: EarthNote[] = [];

const valid = (x: unknown): x is EarthNote => {
  const n = x as EarthNote;
  return !!n && typeof n.id === "string" && typeof n.crewId === "string" && typeof n.sol === "number"
    && typeof n.sentMin === "number" && typeof n.arriveMin === "number" && typeof n.text === "string";
};
function readAll(): EarthNote[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    cache = Array.isArray(v) ? v.filter(valid) : [];
  } catch {
    cache = memory; // storage blocked: this session only
  }
  return cache;
}
function changed() {
  cache = null;
  perKey.clear();
  listeners.forEach((l) => l());
}
function writeAll(all: EarthNote[]) {
  memory = all;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* blocked storage: kept in memory only */ }
  changed();
}

/* notes for one astronaut on one sol, oldest first (stable snapshot for useSyncExternalStore) */
export function notesFor(crewId: string, sol: number): EarthNote[] {
  const k = `${crewId}|${sol}`;
  if (!perKey.has(k)) {
    const list = readAll().filter((n) => n.crewId === crewId && n.sol === sol).sort((a, b) => a.sentMin - b.sentMin);
    perKey.set(k, list.length ? list : EMPTY);
  }
  return perKey.get(k)!;
}

/* false when the note has no text and no files, is too long, or is not for the present sol */
export function addEarthNote(n: Omit<EarthNote, "id">, presentSol: number): boolean {
  const text = n.text.trim();
  if ((!text && !n.attachments?.length) || text.length > NOTE_MAX || n.sol !== presentSol) return false;
  const id = `${n.crewId}-${n.sol}-${Date.now().toString(36)}`;
  writeAll([...readAll(), { ...n, text, id }]);
  return true;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  /* another tab (later: the crew's own screen) sees new notes too */
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) changed(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}
/* every note, for the full-thread view (stable snapshot: readAll() is cached until something changes) */
export function useAllEarthNotes(): EarthNote[] {
  return useSyncExternalStore(subscribe, readAll, () => EMPTY);
}
export function useEarthNotes(crewId: string, sol: number): EarthNote[] {
  return useSyncExternalStore(subscribe, () => notesFor(crewId, sol), () => EMPTY);
}
