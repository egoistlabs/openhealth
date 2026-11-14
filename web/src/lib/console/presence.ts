/* Companion presence: a volumetric point cloud drawn into every registered canvas.
   Ported from docs/design/companion-console/reference/presence-orb.js.
   Colours come from the design tokens (--c-action, --c-bg, --orb-gain).
   States: idle · listening · working · speaking.
   Falls back to a flat 2D waveform under reduced motion, or if frames run slow. Browser only. */

export type PresenceState = "idle" | "listening" | "working" | "speaking";

function token(name: string) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
function rgbOf(hex: string) {
  const h = hex.replace("#", "");
  if (h.length === 3) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16));
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
type Colors = { acc: number[]; hair: string; muted: string; gain: number };
let C: Colors | null = null;
function colors(): Colors {
  if (C) return C;
  C = { acc: rgbOf(token("--c-action")), hair: token("--c-hair-strong"), muted: token("--c-text-3"), gain: parseFloat(token("--orb-gain")) || 1 };
  return C;
}
const rgba = (a: number) => { const k = colors(), c = k.acc; return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a * k.gain)).toFixed(3)})`; };

type Pt = { x: number; y: number; z: number; ph?: number };
const N = 220, PTS: Pt[] = [];
for (let i = 0; i < N; i++) {
  const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
  const j = 1 + (Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.06;
  PTS.push({ x: Math.cos(th) * r * j, y: y * j, z: Math.sin(th) * r * j, ph: (i * 0.618) % (Math.PI * 2) });
}
const RINGS = [-0.55, 0, 0.55].map((ly) => {
  const r = Math.sqrt(1 - ly * ly), seg: Pt[] = [];
  for (let k = 0; k <= 48; k++) { const a = (k / 48) * Math.PI * 2; seg.push({ x: Math.cos(a) * r, y: ly, z: Math.sin(a) * r }); }
  return seg;
});

let reduced = false, slow = false, started = false;
let state: PresenceState = "idle", amp = 0, target = 0, rot = 0, last = 0, scanAt = 0, nextPulse = 0;
const pulses: number[] = [], hist: number[] = new Array(96).fill(0);
const views = new Set<HTMLCanvasElement>(), waves = new Set<HTMLCanvasElement>();
let raf = 0, slowFrames = 0, staticKey = "";
const listeners: Array<(why: string) => void> = [];
const stateListeners = new Set<(s: PresenceState) => void>();
/* per-frame subscribers (the talking avatar): get the smoothed voice level each frame */
export type PresenceFrame = { t: number; amp: number; state: PresenceState; still: boolean };
const tickers = new Set<(f: PresenceFrame) => void>();
/* real speech audio (Kokoro), when connected: its loudness drives the voice level */
let audio: { el: HTMLMediaElement; an: AnalyserNode; buf: Uint8Array<ArrayBuffer> } | null = null;
function audioLevel() {
  if (!audio || audio.el.paused || audio.el.ended) return null;
  audio.an.getByteTimeDomainData(audio.buf);
  let sum = 0;
  for (let i = 0; i < audio.buf.length; i++) { const v = (audio.buf[i] - 128) / 128; sum += v * v; }
  return Math.min(1, Math.sqrt(sum / audio.buf.length) * 4); // RMS, scaled so speech sits around 0.3–0.9
}

const flat = () => reduced || slow;
function fit(cv: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(cv.clientWidth * dpr)), h = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return dpr;
}
function simAmp(t: number) {
  if (state === "listening") return 0.25 + 0.6 * Math.abs(Math.sin(t * 7.1) * Math.sin(t * 2.3 + 1)) * (0.6 + 0.4 * Math.sin(t * 0.9));
  if (state === "working") return 0.06;
  if (state === "speaking") return target;
  return 0.02;
}
function project(p: Pt, cy: number, sy: number, cx: number, sx: number) {
  const x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy;
  const y2 = p.y * cx - z1 * sx, z2 = p.y * sx + z1 * cx;
  const f = 2.6 / (z2 + 3.2);
  return { x: x1 * f, y: y2 * f, z: z2 };
}
function draw3d(cv: HTMLCanvasElement, t: number) {
  const ctx = cv.getContext("2d")!, dpr = fit(cv), W = cv.width, H = cv.height, small = W < 140 * dpr;
  ctx.clearRect(0, 0, W, H); // transparent, so the page (or the orb button) shows through
  const cxp = W / 2, cyp = H / 2, R = Math.min(W, H) * (small ? 0.34 : 0.36);
  const cy = Math.cos(rot), sy = Math.sin(rot), tilt = 0.38 + Math.sin(t * 0.13) * 0.05, cx = Math.cos(tilt), sx = Math.sin(tilt);
  const dX = Math.sin(t * 0.21) * R * 0.03, dY = Math.cos(t * 0.17) * R * 0.03, breathe = 1 + Math.sin(t * 0.5) * 0.015 + amp * 0.05;
  ctx.lineWidth = dpr;
  RINGS.forEach((seg) => {
    ctx.beginPath();
    seg.forEach((p, i) => { const q = project(p, cy, sy, cx, sx), X = cxp + dX + q.x * R * breathe, Y = cyp + dY + q.y * R * breathe; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
    ctx.strokeStyle = rgba(0.18); ctx.stroke();
  });
  let scanY = -1;
  if (state === "working") { const p = Math.min(1, (t - scanAt) / 0.9); scanY = H * 0.1 + p * H * 0.8; ctx.fillStyle = rgba(0.5); ctx.fillRect(0, Math.round(scanY), W, dpr); }
  const sz = (small ? 1.1 : 1.4) * dpr;
  for (let i = 0; i < PTS.length; i += small ? 2 : 1) {
    const p = PTS[i], wob = 1 + Math.sin(t * 0.6 + p.ph!) * 0.025 + amp * 0.07 * Math.sin(t * 9 + p.ph! * 3);
    const q = project({ x: p.x * wob, y: p.y * wob, z: p.z * wob }, cy, sy, cx, sx);
    const X = cxp + dX + q.x * R * breathe, Y = cyp + dY + q.y * R * breathe;
    let a = 0.16 + 0.5 * (1 - (q.z + 1) / 2);
    if (scanY >= 0 && Math.abs(Y - scanY) < 8 * dpr) a = 0.85;
    ctx.fillStyle = rgba(a); ctx.fillRect(X - sz / 2, Y - sz / 2, sz, sz);
  }
  pulses.forEach((pt) => { const p = (t - pt) / 1.6; if (p >= 1) return; ctx.beginPath(); ctx.arc(cxp + dX, cyp + dY, R * (0.7 + p * 0.62 + amp * 0.06), 0, Math.PI * 2); ctx.strokeStyle = rgba((1 - p) * (0.16 + amp * 0.28)); ctx.stroke(); });
  if (state === "speaking") for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(cxp + dX, cyp + dY, R * (1.08 + i * 0.1 + amp * 0.08), R * (0.32 + i * 0.05 + amp * 0.05), -0.12, 0, Math.PI * 2); ctx.strokeStyle = rgba(0.1 + amp * 0.28 - i * 0.03); ctx.stroke(); }
}
function drawFlat(cv: HTMLCanvasElement) {
  const ctx = cv.getContext("2d")!, dpr = fit(cv), W = cv.width, H = cv.height, mid = H / 2;
  ctx.clearRect(0, 0, W, H); // transparent, so the page (or the orb button) shows through
  ctx.strokeStyle = colors().hair; ctx.lineWidth = dpr;
  ctx.beginPath(); ctx.moveTo(0, Math.round(mid) + 0.5); ctx.lineTo(W, Math.round(mid) + 0.5); ctx.stroke();
  const A = { idle: 0.03, listening: 0.24, working: 0.06, speaking: 0.16 }[state] * H;
  ctx.strokeStyle = rgba(0.85); ctx.beginPath();
  for (let x = 0; x <= W; x += 2) {
    const u = x / W, env = Math.sin(Math.PI * u);
    const y = mid - A * env * Math.sin(u * Math.PI * (state === "working" ? 2 : 12)) * (state === "listening" ? 0.6 + 0.4 * Math.sin(u * 31) : 1);
    if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();
}
function drawWaves() {
  hist.push(amp); hist.shift();
  waves.forEach((cv) => {
    if (!cv.isConnected || !cv.clientWidth) return;
    const ctx = cv.getContext("2d")!, dpr = fit(cv), W = cv.width, H = cv.height, mid = H / 2;
    ctx.clearRect(0, 0, W, H); // transparent, so the page (or the orb button) shows through
    ctx.fillStyle = colors().hair; ctx.fillRect(0, Math.round(mid), W, dpr);
    const step = 3 * dpr, n = Math.floor(W / step), live = state === "listening" || state === "speaking";
    ctx.fillStyle = live ? rgba(0.9) : colors().muted;
    for (let i = 0; i < n; i++) { const v = hist[Math.max(0, hist.length - n + i)] || 0, h = Math.max(dpr, v * (H - 4 * dpr)); ctx.fillRect(W - (n - i) * step, Math.round(mid - h / 2), dpr, Math.round(h)); }
  });
}
function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const t = now / 1000, dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  // frame-time guard: if the 3D look runs slow for ~2s, swap to the flat waveform (A7 fallback)
  if (!flat() && document.visibilityState === "visible") {
    slowFrames = dt > 0.05 ? slowFrames + 1 : Math.max(0, slowFrames - 2);
    if (slowFrames > 90) { slow = true; staticKey = ""; listeners.forEach((f) => f("slow")); }
  }
  const lvl = audioLevel();
  if (lvl != null) target = lvl;
  amp += (simAmp(t) - amp) * Math.min(1, dt * 14);
  tickers.forEach((f) => f({ t, amp, state, still: reduced }));
  rot += dt * (state === "working" ? 0.28 : state === "listening" ? 0.2 : state === "speaking" ? 0.16 : 0.1);
  if (state === "listening" && t > nextPulse) { pulses.push(t); nextPulse = t + 0.55; }
  for (let i = pulses.length - 1; i >= 0; i--) if (t - pulses[i] > 1.6) pulses.splice(i, 1);
  const vis = [...views].filter((cv) => cv.isConnected && cv.clientWidth);
  if (flat()) {
    const key = state + vis.map((cv) => cv.clientWidth + "x" + cv.clientHeight).join();
    if (key !== staticKey) { staticKey = key; vis.forEach(drawFlat); }
  } else vis.forEach((cv) => draw3d(cv, t));
  drawWaves();
}
function stopIfIdle() {
  if (!views.size && !waves.size && !tickers.size && raf) { cancelAnimationFrame(raf); raf = 0; }
}
function start() {
  if (started) return;
  started = true;
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduced = mq.matches;
  mq.addEventListener("change", (e) => { reduced = e.matches; staticKey = ""; });
  last = performance.now();
}

export const Presence = {
  attach(cv: HTMLCanvasElement, kind: "view" | "wave" = "view") {
    start();
    (kind === "wave" ? waves : views).add(cv);
    staticKey = "";
    if (!raf) raf = requestAnimationFrame(frame);
    return () => {
      views.delete(cv); waves.delete(cv);
      stopIfIdle();
    };
  },
  /* call cb every animation frame with the voice level and state; returns an unsubscribe */
  onFrame(cb: (f: PresenceFrame) => void) {
    start();
    tickers.add(cb);
    if (!raf) raf = requestAnimationFrame(frame);
    return () => { tickers.delete(cb); stopIfIdle(); };
  },
  /* Lip-sync from real speech: pass the <audio> element Kokoro's reply plays in.
     While it plays, its loudness drives the avatar's mouth (set the state to "speaking" too). */
  connectAudio(el: HTMLMediaElement) {
    if (audio?.el === el) return;
    const ctx = new AudioContext();
    const src = ctx.createMediaElementSource(el), an = ctx.createAnalyser();
    an.fftSize = 1024;
    src.connect(an); an.connect(ctx.destination);
    audio = { el, an, buf: new Uint8Array(an.fftSize) };
  },
  setState(s: PresenceState) {
    if (s === state) return;
    state = s; staticKey = "";
    if (s === "working") scanAt = performance.now() / 1000;
    if (s !== "speaking") target = 0;
    stateListeners.forEach((f) => f(s));
  },
  setAmp(a: number) { target = Math.max(0, Math.min(1, a)); },
  onFallback(f: (why: string) => void) { listeners.push(f); return () => { const i = listeners.indexOf(f); if (i >= 0) listeners.splice(i, 1); }; },
  onState(f: (s: PresenceState) => void) { stateListeners.add(f); return () => { stateListeners.delete(f); }; },
  /* call after the look changes: re-reads the colour tokens */
  refresh() { C = null; staticKey = ""; },
  get state() { return state; },
};
