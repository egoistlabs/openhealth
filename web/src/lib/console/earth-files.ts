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

export async function getFile(id: string): Promise<Blob | null> {
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
