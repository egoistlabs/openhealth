/* Pain and skin spots flagged "follow up at the next check-in" from the Home Body pop-up. Kept in local
   storage per person (like the check-ins in store.ts), read by the next check-in's body step, which asks
   whether each one is still there. Storage failures fall back to an in-memory list for this session. */
import { useSyncExternalStore } from "react";

export type FollowUp = {
  /* the mark id (part key) it follows, e.g. "somakine:structure:openhealth-skin-forehead#left" */
  id: string;
  region: string;
  kind?: string;
  level: number;
  note?: string;
  /* the sol the spot was logged on; the follow-up is asked at check-ins after it */
  sol: number;
};

const KEY = "openhealth.followups.v1";
let memory: Record<string, FollowUp[]> = {};
const listeners = new Set<() => void>();

function readAll(): Record<string, FollowUp[]> {
  try {
    const raw = localStorage.getItem(KEY);
    const v: unknown = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, FollowUp[]>) : {};
  } catch {
    return memory;
  }
}
function writeAll(all: Record<string, FollowUp[]>) {
  memory = all;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* blocked storage: kept in memory only */ }
  cache = new Map();
  listeners.forEach((l) => l());
}

/* stable snapshots per person, so useSyncExternalStore does not loop */
let cache = new Map<string, FollowUp[]>();
const EMPTY: FollowUp[] = [];
export function followUpsFor(person: string): FollowUp[] {
  if (!cache.has(person)) cache.set(person, readAll()[person] ?? EMPTY);
  return cache.get(person)!;
}

export function setFollowUp(person: string, f: FollowUp, on: boolean) {
  const all = readAll();
  const list = (all[person] ?? []).filter((x) => x.id !== f.id);
  all[person] = on ? [...list, f] : list;
  writeAll(all);
}
export function clearFollowUp(person: string, id: string) {
  const all = readAll();
  all[person] = (all[person] ?? []).filter((x) => x.id !== id);
  writeAll(all);
}

export function useFollowUps(person: string): FollowUp[] {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => followUpsFor(person),
    () => EMPTY,
  );
}
