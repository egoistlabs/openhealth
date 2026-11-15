/* Files attached to Advice from Earth (PDFs, images, text). The note itself (lib/console/earth-notes.ts) keeps
   only the file's name, type and size; the file goes in IndexedDB, because localStorage holds about 5 MB in total
   and stores strings only. If IndexedDB is blocked (private window, some browsers), files are kept in memory for
   this session. Like a real downlink this is store-and-forward: nothing streams, the whole file travels. */

export type Attachment = { id: string; name: string; type: string; size: number };

export const FILE_MAX_BYTES = 10 * 1024 * 1024;
export const FILES_PER_NOTE = 3;
export const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain";
const OK_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "text/plain"]);

/* why a file can't be attached, or null when it can */
export function fileProblem(f: File): string | null {
  const type = f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "");
  if (!OK_TYPES.has(type)) return `${f.name}: only PDF, PNG, JPG or text files.`;
  if (f.size > FILE_MAX_BYTES) return `${f.name}: larger than 10 MB.`;
  if (!f.size) return `${f.name}: the file is empty.`;
  return null;
}

const DB = "openhealth-earth-files", STORE = "files";
const memory = new Map<string, Blob>();
let dbp: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbp;
}

/* stores the file and returns what the note keeps about it */
export async function putFile(f: File): Promise<Attachment> {
  const id = `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const type = f.type || "application/pdf";
  const blob = new Blob([await f.arrayBuffer()], { type });
  const d = await db();
  if (d) {
    await new Promise<void>((resolve) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => { memory.set(id, blob); resolve(); };
    });
  } else memory.set(id, blob);
  return { id, name: f.name, type, size: f.size };
}

/* the files attached to the sample notes in earth-notes.ts: plain guidance text, no doses, no diagnoses */
const SAMPLE_FILES: Record<string, string> = {
  "sim-file-shoulder": `SHOULDER CARE SHEET (sample, simulated mission)

From: Flight surgeon, Earth
For: Mattias Lindqvist, FE

1. Skip overhead lifts and hatch work with the right arm until the crew medical officer has looked at the shoulder.
2. Note on the body map in your daily check-in: how bad (1 to 10) and when it hurts.
3. Gentle range of movement only, no forcing.
4. Tell the crew medical officer straight away if the arm goes weak or numb, or the pain gets worse.

This is general guidance for the demo, not a diagnosis.`,
  "sim-file-fever": `FEVER WATCH CHECKLIST (sample, simulated mission)

From: Flight surgeon, Earth
For: Daniela Reyes, MS-2

[ ] Check body temperature with the kit thermometer, morning and evening.
[ ] Write the readings in your check-in note.
[ ] Drink water through the day.
[ ] Rest when the schedule allows.
[ ] Talk to the crew medical officer today.
[ ] Tell the crew medical officer straight away if you feel short of breath or much worse.

This is general guidance for the demo, not a diagnosis.`,
};

export async function getFile(id: string): Promise<Blob | null> {
  if (SAMPLE_FILES[id]) return new Blob([SAMPLE_FILES[id]], { type: "text/plain" });
  if (memory.has(id)) return memory.get(id)!;
  const d = await db();
  if (!d) return null;
  return new Promise((resolve) => {
    const req = d.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => resolve(null);
  });
}

export const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/* opens a stored attachment in a new tab (PDFs in the browser's own viewer) */
export async function openAttachment(id: string) {
  const tab = window.open("", "_blank"); // opened during the click, so pop-up blockers allow it
  const blob = await getFile(id);
  if (!blob) { tab?.close(); window.alert("This file is no longer stored on this device."); return; }
  const url = URL.createObjectURL(blob);
  if (tab) tab.location.href = url; else window.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
