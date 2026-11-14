"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { Presence, type PresenceState } from "@/lib/console/presence";

export function usePresenceState(): PresenceState {
  return useSyncExternalStore(Presence.onState, () => Presence.state, () => "idle");
}

/* One canvas registered with the shared presence animation (A7). */
export function OrbCanvas({ kind = "view", label }: { kind?: "view" | "wave"; label?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = usePresenceState();
  useEffect(() => (ref.current ? Presence.attach(ref.current, kind) : undefined), [kind]);
  return label ? <canvas ref={ref} role="img" aria-label={`Pedro, ${state}`} /> : <canvas ref={ref} aria-hidden="true" />;
}

export function Avatar() {
  return <div className="avatar"><OrbCanvas label /></div>;
}

export function Wave() {
  return <div className="wave"><OrbCanvas kind="wave" /></div>;
}
