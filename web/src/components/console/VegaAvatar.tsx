"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { createVega } from "@/lib/console/vega/engine";
import { Presence } from "@/lib/console/presence";
import type { Emotion } from "@/lib/console/emotion";
import { Persona } from "./Persona";
import { COMPANION_NAME } from "@/lib/console/data";

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

/** Progress of what the avatar is saying, for live captions. */
export type SpeechEvents = {
  /** a sentence starts (the exact sentence text, trimmed) */
  sentence?: (s: string) => void;
  /** a word is being said: its text and where it starts inside the current sentence */
  word?: (w: { text: string; start: number }) => void;
  /** speaking finished or was stopped */
  end?: () => void;
};

/* The companion's 3D talking avatar (A7). Falls back to the 2D picture (Persona) under
   reduced motion or without WebGL. The parent gets the control API through onReady. */
export function VegaAvatar({ onReady, onSpeech }: { onReady: (api: VegaApi | null) => void; onSpeech?: SpeechEvents }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useSyncExternalStore(subscribeRM, () => window.matchMedia(RM).matches, () => false);
  const canRender = useSyncExternalStore(noop, hasWebGL, () => true);
  const readyRef = useRef(onReady);
  const speechRef = useRef(onSpeech);
  useEffect(() => { readyRef.current = onReady; speechRef.current = onSpeech; });

  useEffect(() => {
    const el = ref.current;
    if (reduced || !canRender || !el) return;
    let api: VegaApi;
    try {
      api = createVega(el, {
        // keep the rest of the console (state ring, voice wave, live region) in step with the avatar
        state: (st: string) => {
          Presence.setState(st === "speaking" ? "speaking" : "idle");
          if (st === "idle") speechRef.current?.end?.();
        },
        caption: (s: string) => { if (s) speechRef.current?.sentence?.(s); },
        word: (w: { text: string; start: number }) => speechRef.current?.word?.(w),
        frame: (o: { jawOpen: number }) => Presence.setAmp(o.jawOpen),
      }) as unknown as VegaApi;
    } catch {
      return; // WebGL failed at runtime: the stage stays empty rather than crashing the screen
    }
    readyRef.current(api);
    return () => { readyRef.current(null); api.dispose(); };
  }, [reduced, canRender]);

  if (reduced || !canRender) return <Persona />;
  return <div ref={ref} className="vega" role="img" aria-label={COMPANION_NAME} />;
}
