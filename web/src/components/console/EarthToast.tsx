"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast, Toaster } from "sonner";
import { SatelliteDish } from "lucide-react";
import { COMPANION_NAME, P, hm } from "@/lib/console/data";
import { arrivedSince, useAllEarthNotes, type EarthNote } from "@/lib/console/earth-notes";
import { useConsole } from "./ConsoleProvider";

/* Astronaut view: a toast each time a note from Earth reaches Mars (after its one-way light time).
   "Open message from Earth" takes the astronaut to Pedro, who reads the new messages straight away.
   Notes already on board when this person is first seen on this device are marked read silently, so the
   demo does not open with a pile of toasts. Read ids are kept per astronaut in localStorage. */
const KEY = (id: string) => `openhealth.earthseen.v1.${id}`;
const readSeen = (id: string): Set<string> | null => {
  try { const raw = localStorage.getItem(KEY(id)); return raw ? new Set(JSON.parse(raw) as string[]) : null; } catch { return null; }
};
const writeSeen = (id: string, seen: Set<string>) => { try { localStorage.setItem(KEY(id), JSON.stringify([...seen])); } catch { /* storage blocked */ } };

/* the question Pedro answers with the Earth summary (CompanionScreen routes it to the Earth flow) */
export const READ_EARTH = "Read my new messages from Earth.";

export function EarthToast({ companionRoute }: { companionRoute: string }) {
  const { s, set, atPresent, clockMin, say } = useConsole();
  const all = useAllEarthNotes(); // re-run when Ground sends a note (this tab or another)
  const router = useRouter();
  const path = usePathname();
  const seenRef = useRef<{ id: string; seen: Set<string> } | null>(null);
  const astro = s.role !== "ground";
  /* latest values for the button handlers inside already-shown toasts */
  const nav = useRef({ path, set, router });
  useEffect(() => { nav.current = { path, set, router }; });

  useEffect(() => {
    if (!astro || !atPresent) return;
    const arrived = arrivedSince(s.me, 0, 0, P, clockMin);
    if (seenRef.current?.id !== s.me) {
      const stored = readSeen(s.me);
      if (!stored) { const seen = new Set(arrived.map((n) => n.id)); writeSeen(s.me, seen); seenRef.current = { id: s.me, seen }; return; }
      seenRef.current = { id: s.me, seen: stored };
    }
    const { seen } = seenRef.current;
    const fresh = arrived.filter((n) => !seen.has(n.id));
    if (!fresh.length) return;
    fresh.forEach((n) => seen.add(n.id));
    writeSeen(s.me, seen);
    const open = () => {
      const { path: p, set: setS, router: r } = nav.current;
      toast.dismiss();
      setS({ ask: READ_EARTH, settings: false }); // Pedro reads it as soon as the companion screen is up
      if (!p.startsWith(companionRoute)) r.push(companionRoute);
    };
    fresh.forEach((n) => toast.custom((id) => <EarthCard n={n} onOpen={open} onDismiss={() => toast.dismiss(id)} />, { id: n.id, duration: Infinity }));
    say(fresh.length === 1 ? `New message from Earth: ${fresh[0].text}` : `${fresh.length} new messages from Earth.`);
  }, [astro, atPresent, s.me, clockMin, all, say, companionRoute]);

  // a different astronaut, or the Ground view: their toasts go
  useEffect(() => () => { toast.dismiss(); }, [s.me, astro]);

  return astro ? <Toaster position="top-center" visibleToasts={4} /> : null;
}

function EarthCard({ n, onOpen, onDismiss }: { n: EarthNote; onOpen: () => void; onDismiss: () => void }) {
  return (
    <div role="status" className="flex w-[356px] max-w-[calc(100vw-32px)] flex-col gap-3 rounded-md border border-transparent bg-invert p-4 text-invert-foreground shadow-lg">
      <div className="flex items-start gap-3">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-action text-on-action">
          <SatelliteDish className="size-3.5" aria-hidden="true" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-sm font-semibold">New message from Earth</p>
          <p className="line-clamp-3 text-sm text-invert-foreground/70">{n.text || "Files attached."}</p>
        </div>
      </div>
      <div className="h-px w-full bg-white/10" />
      <div className="space-y-1 font-mono text-xs text-invert-foreground/60">
        <p>{n.author} · sent {hm(n.sentMin)} · arrived {hm(n.arriveMin)}</p>
        {n.attachments?.map((a) => <p key={a.id}>📎 {a.name}</p>)}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onDismiss}
          className="h-8 flex-1 rounded-md border border-white/10 bg-white/10 px-3 text-xs font-medium text-invert-foreground transition-colors hover:bg-white/15">
          Dismiss
        </button>
        <button type="button" onClick={onOpen} title={`${COMPANION_NAME} reads it to you`}
          className="h-8 flex-1 rounded-md border border-action bg-action px-3 text-xs font-medium text-on-action transition-colors hover:bg-action-hover">
          Open message from Earth
        </button>
      </div>
    </div>
  );
}
