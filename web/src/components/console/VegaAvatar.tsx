"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createVega } from "@/lib/console/vega/engine";
import { Presence } from "@/lib/console/presence";
import type { Emotion } from "@/lib/console/emotion";
import { Persona } from "./Persona";

export type VegaApi = {
  speak: (text: string, opts?: { emotion?: Emotion; silent?: boolean; rate?: number; voiceName?: string }) => void;
  /** lip-sync to real speech audio (Kokoro): a URL, Blob or <audio> element */
  speakAudio: (src: string | Blob | HTMLMediaElement, opts?: { emotion?: Emotion }) => Promise<void>;
  stop: () => void;
  setRestEmotion: (name: Emotion) => void;
  hold: (name: Emotion | null) => void;
  readonly speaking: boolean;
  dispose: () => void;
};

const RM = "(prefers-reduced-motion: reduce)";
function subscribeRM(cb: () => void) {
  const mq = window.matchMedia(RM);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
let webgl: boolean | null = null;
function hasWebGL() {
  if (webgl == null) {
    try { webgl = !!document.createElement("canvas").getContext("webgl2"); } catch { webgl = false; }
  }
  return webgl;
}
const noop = () => () => {};

/* The companion's 3D talking avatar (A7). Falls back to the 2D picture (Persona) under
   reduced motion or without WebGL. The parent gets the control API through onReady. */
export function VegaAvatar({ onReady }: { onReady: (api: VegaApi | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useSyncExternalStore(subscribeRM, () => window.matchMedia(RM).matches, () => false);
  const canRender = useSyncExternalStore(noop, hasWebGL, () => true);
  const readyRef = useRef(onReady);
  useEffect(() => { readyRef.current = onReady; });

  useEffect(() => {
    const el = ref.current;
    if (reduced || !canRender || !el) return;
    let api: VegaApi;
    try {
      api = createVega(el, {
        // keep the rest of the console (state ring, voice wave, live region) in step with the avatar
        state: (st: string) => Presence.setState(st === "speaking" ? "speaking" : "idle"),
        frame: (o: { jawOpen: number }) => Presence.setAmp(o.jawOpen),
      }) as unknown as VegaApi;
    } catch {
      return; // WebGL failed at runtime: the stage stays empty rather than crashing the screen
    }
    readyRef.current(api);
    return () => { readyRef.current(null); api.dispose(); };
  }, [reduced, canRender]);

  if (reduced || !canRender) return <Persona />;
  return <div ref={ref} className="vega" role="img" aria-label="Companion" />;
}
