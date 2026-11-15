/* Kokoro: an open neural text-to-speech model (Kokoro-82M, Apache-2.0) that runs inside the browser through
   kokoro-js (WebGPU when the browser has it, otherwise WebAssembly). No server and no cloud voice: after the
   one-time model download (cached by the browser) Pedro speaks offline, which is what a Mars habitat needs.
   Off by default (Settings → Natural voice), because the first load downloads the model. When it is off,
   still loading, or fails, Pedro uses the browser voice (voices.ts). */
import type { KokoroTTS } from "kokoro-js";

const KEY = "openhealth.voice.kokoro";
const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
/* American English male voice for Pedro (other options: am_fenrir, am_puck, bm_george) */
export const KOKORO_VOICE = "am_michael";

export type KokoroStatus = "off" | "loading" | "ready" | "failed";
let wanted = false, loaded = false, failed = false;
let progress = 0; // 0..1 while the model downloads
let loading: Promise<KokoroTTS> | null = null;
let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const kokoroStatus = (): KokoroStatus => (!wanted ? "off" : failed ? "failed" : loaded ? "ready" : "loading");
export const kokoroProgress = () => progress;
export const kokoroReady = () => wanted && loaded;
export function onKokoro(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb); }; }

export function kokoroWanted() { try { return localStorage.getItem(KEY) === "1"; } catch { return wanted; } }
export function setKokoroWanted(on: boolean) {
  try { localStorage.setItem(KEY, on ? "1" : "0"); } catch { /* storage blocked: this session only */ }
  wanted = on; emit();
  if (on) void loadKokoro().catch(() => {});
}

/** Load the model once (later calls share the same promise; a failed load can be retried). */
export function loadKokoro(): Promise<KokoroTTS> {
  if (loading) return loading;
  failed = false; progress = 0; emit();
  loading = (async () => {
    const { KokoroTTS } = await import("kokoro-js");
    const gpu = typeof navigator !== "undefined" && "gpu" in navigator;
    const tts = await KokoroTTS.from_pretrained(MODEL, {
      dtype: gpu ? "fp32" : "q8", // q8 is small and fast on CPU; WebGPU wants fp32
      device: gpu ? "webgpu" : "wasm",
      progress_callback: (p: { status?: string; progress?: number }) => {
        if (p.status === "progress" && typeof p.progress === "number") { progress = Math.min(1, p.progress / 100); emit(); }
      },
    });
    loaded = true; progress = 1; emit();
    return tts;
  })();
  loading.catch(() => { failed = true; loading = null; emit(); });
  return loading;
}

/* turn it on at startup when the astronaut chose it before */
if (typeof window !== "undefined" && kokoroWanted()) { wanted = true; void loadKokoro().catch(() => {}); }

export type Clip = { duration: number; play: (onEnd: () => void) => () => void };

/** Synthesize one sentence. Resolves with a clip to play (duration in seconds). */
export async function kokoroClip(text: string, speed = 1): Promise<Clip> {
  const tts = await loadKokoro();
  const raw = await tts.generate(text, { voice: KOKORO_VOICE, speed });
  ctx ??= new AudioContext();
  const data = raw.audio as Float32Array, rate = raw.sampling_rate as number;
  const buf = ctx.createBuffer(1, data.length, rate);
  buf.copyToChannel(new Float32Array(data), 0);
  return {
    duration: data.length / rate,
    play: (onEnd) => {
      const c = ctx!;
      void c.resume();
      const src = c.createBufferSource();
      src.buffer = buf; src.connect(c.destination);
      let done = false;
      src.onended = () => { if (!done) { done = true; onEnd(); } };
      src.start();
      return () => { done = true; try { src.stop(); } catch { /* already stopped */ } };
    },
  };
}
