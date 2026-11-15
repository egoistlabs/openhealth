/* Advice from Earth: short notes the flight surgeon writes to one astronaut, kept per astronaut per sol.
   Only the present sol can be written to (the UI enforces it, and addEarthNote refuses past sols).
   A note is "in transit" until the one-way light time has passed, then "arrived" on Mars.
   Stored on this device (localStorage), like the check-ins in store.ts. The crew-side view and Pedro's
   summary of the thread are not built yet: they read the same list with notesFor(). */
import { useSyncExternalStore } from "react";
import type { Attachment } from "./earth-files";
import { lightDelayMin } from "./ground";

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
  /* who wrote it: the flight surgeon on Earth (default), or the astronaut replying through Pedro */
  from?: "earth" | "crew";
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
/* Sample advice for the demo, one short thread per astronaut that matches their story in the simulated data.
   All of it has already reached Mars. Built in code, never written to storage; notes sent on this device are
   added on top. Arrival = send time + that sol's one-way light time. "sim-" ids mark them as samples. */
const SAMPLE_RAW: Array<[crewId: string, sol: number, sentMin: number, text: string, file?: Attachment]> = [
  ["okafor", 139, 9 * 60 + 5, "All your measures look steady this week. Thank you for logging every day, it helps us read the whole crew."],
  ["okafor", 142, 8 * 60 + 40, "Calf cramp noted from your check-in. Stretch before the treadmill harness run, and tell the crew medical officer if it comes back."],
  ["lindqvist", 140, 10 * 60 + 15, "We can see your workload climbing for several days. Ask the commander to move one non-critical task this week."],
  ["lindqvist", 141, 9 * 60 + 30, "About the right shoulder: skip overhead lifts until the crew medical officer has had a look. A short care sheet is attached.",
    { id: "sim-file-shoulder", name: "shoulder-care-sheet.txt", type: "text/plain", size: 612 }],
  ["lindqvist", 142, 7 * 60 + 50, "Workload is still at Act. Please protect an 8-hour sleep window tonight."],
  ["reyes", 141, 8 * 60 + 20, "Your night-time skin temperature has gone up two nights in a row. Please check your body temperature with the kit thermometer."],
  ["reyes", 142, 7 * 60 + 10, "Temperature and heart rate are both above your normal. Talk to the crew medical officer today and rest when you can. Checklist attached.",
    { id: "sim-file-fever", name: "fever-watch-checklist.txt", type: "text/plain", size: 540 }],
  ["sato", 140, 11 * 60, "Reaction time is a little slow after the long core-logging sessions. Try a short break away from the microscope every hour."],
  ["sato", 142, 8 * 60 + 15, "Your HRV has been low for three nights. Ask for a lighter workload tomorrow if the plan allows."],
];
const SAMPLES: EarthNote[] = SAMPLE_RAW.map(([crewId, sol, sentMin, text, file], i) => ({
  id: `sim-${crewId}-${sol}-${i}`, crewId, sol, sentMin, arriveMin: sentMin + lightDelayMin(sol), author: "Flight surgeon", text,
  ...(file ? { attachments: [file] } : null),
}));

/* notes sent on this device (storage only, never the samples) */
function readStored(): EarthNote[] {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter(valid) : [];
  } catch {
    return memory; // storage blocked: this session only
  }
}
/* samples + stored, cached until something changes */
function readAll(): EarthNote[] {
  if (cache) return cache;
  cache = [...SAMPLES, ...readStored()];
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
  writeAll([...readStored(), { ...n, text, id }]); // stored notes only: samples are never written
  return true;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  /* another tab (later: the crew's own screen) sees new notes too */
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) changed(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(cb); window.removeEventListener("storage", onStorage); };
}
/* Notes for one astronaut that have reached Mars by (nowSol, nowMin) and arrived after (sinceSol, sinceMin),
   oldest first. A note still in transit is not on board yet, so the crew side never sees it. */
export function arrivedSince(crewId: string, sinceSol: number, sinceMin: number, nowSol: number, nowMin: number): EarthNote[] {
  const at = (sol: number, min: number) => sol * 1440 + min;
  return readAll()
    .filter((n) => n.crewId === crewId && (n.from ?? "earth") === "earth")
    .filter((n) => at(n.sol, n.arriveMin) <= at(nowSol, nowMin) && at(n.sol, n.arriveMin) > at(sinceSol, sinceMin))
    .sort((a, b) => at(a.sol, a.arriveMin) - at(b.sol, b.arriveMin));
}
/* The whole thread as the crew sees it at (nowSol, nowMin): Earth's notes once they have arrived, and the
   astronaut's own replies from the moment they were sent. Oldest first. */
export function crewThread(crewId: string, nowSol: number, nowMin: number): EarthNote[] {
  const at = (sol: number, min: number) => sol * 1440 + min;
  const seen = (n: EarthNote) => (n.from === "crew" ? at(n.sol, n.sentMin) : at(n.sol, n.arriveMin));
  return readAll().filter((n) => n.crewId === crewId && seen(n) <= at(nowSol, nowMin)).sort((a, b) => seen(a) - seen(b));
}
/* the notes behind a log row, in the order given (missing ones are skipped) */
export function notesByIds(ids: string[]): EarthNote[] {
  const all = readAll();
  return ids.map((id) => all.find((n) => n.id === id)).filter((n): n is EarthNote => !!n);
}

/* every note, for the full-thread view (stable snapshot: readAll() is cached until something changes) */
export function useAllEarthNotes(): EarthNote[] {
  return useSyncExternalStore(subscribe, readAll, () => EMPTY);
}
export function useEarthNotes(crewId: string, sol: number): EarthNote[] {
  return useSyncExternalStore(subscribe, () => notesFor(crewId, sol), () => EMPTY);
}
