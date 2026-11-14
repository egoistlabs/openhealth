/* Threshold charts for the measure cards and the measure modal.
   The person's values are drawn as a line over a shaded HEALTHY BAND. Colour only appears outside
   the band: red where they are past it on the worse side, green where they are past it on the good
   side. Inside the band there is no colour, so a measure that reads "Normal" never shows red.
   The band is a general Earth range where one exists (sleep, reaction time, sleep timing); the other
   measures have no Earth standard and use the person's own normal band, exactly what the status uses.
   Returns SVG strings sized to the given box (same pattern as lib/console/plots.ts). */
import { MKEY, baseline, day, teamStatus, val, type MeasureKey, type Shares } from "./data";

export type Ref = { value: number; lo: number; hi: number; label: string; earth: boolean };

// General Earth ranges, in each measure's own units (hours, ms, minutes after midnight).
const EARTH: Partial<Record<MeasureKey, { value: number; lo: number; hi: number; label: string }>> = {
  sleep: { value: 8, lo: 7, hi: 9, label: "vs Earth 7–9 h" },
  rt: { value: 250, lo: 200, hi: 300, label: "vs Earth 200–300 ms" },
  timing: { value: 210, lo: 150, hi: 270, label: "vs Earth 02:30–04:30" },
};

// Self-rated 1–5 measures have no published Earth average; this is a healthy range on the scale itself.
const SCALE: Partial<Record<MeasureKey, { value: number; lo: number; hi: number; label: string }>> = {
  mood: { value: 4, lo: 3, hi: 5, label: "vs healthy range 3–5" },
  load: { value: 2, lo: 1, hi: 3, label: "vs healthy range 1–3" },
  team: { value: 4, lo: 3, hi: 5, label: "vs healthy range 3–5" },
};

/** mode "auto": Earth range if one exists, else your own normal (cards).
    "own": always your own normal band. "earth": Earth range, or the healthy scale range, or null. */
export type RefMode = "auto" | "own" | "earth";

export function referenceFor(id: string, key: MeasureKey, sol: number, mode: RefMode = "auto"): Ref | null {
  const e = EARTH[key];
  if (mode === "earth") {
    if (e) return { ...e, earth: true };
    const sc = SCALE[key];
    return sc ? { ...sc, earth: true } : null;
  }
  if (e && mode === "auto") return { ...e, earth: true };
  const b = baseline(id, key, sol);
  return b ? { value: b.med, lo: b.lo, hi: b.hi, label: "vs your normal", earth: false } : null;
}

/** where a value sits against the band: "in", or past it on the "bad" or "good" side */
export function sideOf(key: MeasureKey, v: number, ref: Pick<Ref, "lo" | "hi">): "in" | "bad" | "good" {
  if (v >= ref.lo && v <= ref.hi) return "in";
  const bad = MKEY[key].bad;
  if (bad === "both") return "bad";
  const low = v < ref.lo;
  return (bad === "low") === low ? "bad" : "good";
}

const f1 = (v: number) => v.toFixed(1);
const GOOD = "#7FB069", BAD = "#E5534B";

/* shared drawing: line + band, coloured only beyond the band edges */
function draw(opts: {
  pts: Array<{ i: number; v: number }>; n: number; lo: number; hi: number; mid: number; w: number; h: number;
  aboveBad: boolean; belowBad: boolean; uid: string; label: string;
}) {
  const { pts, n, lo: blo, hi: bhi, mid, w, h, aboveBad, belowBad, uid, label } = opts;
  const vals = pts.map((p) => p.v).concat(blo, bhi);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.12; lo -= pad; hi += pad;
  const X = (i: number) => 2 + (i * (w - 6)) / Math.max(1, n - 1);
  const Y = (v: number) => 2 + ((hi - v) / (hi - lo)) * (h - 4);
  const yHi = Y(bhi), yLo = Y(blo), yMid = Y(Math.max(blo, Math.min(bhi, mid)));
  const line = pts.map((p, k) => `${k ? "L" : "M"}${f1(X(p.i))} ${f1(Y(p.v))}`).join("");
  const x0 = f1(X(pts[0].i)), x1 = f1(X(pts[pts.length - 1].i));
  const toHi = `${line}L${x1} ${f1(yHi)}L${x0} ${f1(yHi)}Z`; // area between line and the top edge
  const toLo = `${line}L${x1} ${f1(yLo)}L${x0} ${f1(yLo)}Z`; // area between line and the bottom edge
  const toMid = `${line}L${x1} ${f1(yMid)}L${x0} ${f1(yMid)}Z`; // area between line and the centre
  const last = pts[pts.length - 1];
  const fill = (bad: boolean) => `class="${bad ? "th-bad" : "th-good"}" fill="${bad ? BAD : GOOD}" fill-opacity="0.6"`;
  // inside the band: a light tint from the centre, soft green on the good side, soft amber drifting to the worse edge
  const tint = (bad: boolean) => `class="th-tint" fill="${bad ? "#D4A72C" : GOOD}" fill-opacity="0.28"`;
  return `<svg width="${w}" height="${h}" role="img" aria-label="${label}">`
    + `<defs><clipPath id="${uid}-a"><rect x="0" y="0" width="${w}" height="${f1(Math.max(0, yHi))}"/></clipPath>`
    + `<clipPath id="${uid}-b"><rect x="0" y="${f1(yLo)}" width="${w}" height="${f1(Math.max(0, h - yLo))}"/></clipPath></defs>`
    + `<clipPath id="${uid}-u"><rect x="0" y="0" width="${w}" height="${f1(Math.max(0, yMid))}"/></clipPath>`
    + `<clipPath id="${uid}-d"><rect x="0" y="${f1(yMid)}" width="${w}" height="${f1(Math.max(0, h - yMid))}"/></clipPath>`
    + `<rect class="th-band" x="0" y="${f1(yHi)}" width="${w}" height="${f1(Math.max(1, yLo - yHi))}" fill="#8FA3BD" fill-opacity="0.06"/>`
    + `<line class="th-edge" stroke="#8FA3BD" stroke-opacity="0.35" stroke-dasharray="2 3" x1="0" x2="${w}" y1="${f1(yHi)}" y2="${f1(yHi)}"/>`
    + `<line class="th-edge" stroke="#8FA3BD" stroke-opacity="0.35" stroke-dasharray="2 3" x1="0" x2="${w}" y1="${f1(yLo)}" y2="${f1(yLo)}"/>`
    + `<path ${tint(aboveBad)} d="${toMid}" clip-path="url(#${uid}-u)"/>`
    + `<path ${tint(belowBad)} d="${toMid}" clip-path="url(#${uid}-d)"/>`
    + `<line class="th-ref" stroke="#8FA3BD" stroke-dasharray="4 3" x1="0" x2="${w}" y1="${f1(yMid)}" y2="${f1(yMid)}"/>`
    + `<path ${fill(aboveBad)} d="${toHi}" clip-path="url(#${uid}-a)"/>`
    + `<path ${fill(belowBad)} d="${toLo}" clip-path="url(#${uid}-b)"/>`
    + `<path class="th-line" fill="none" stroke="#EAF1FF" stroke-width="1.5" stroke-linejoin="round" d="${line}"/>`
    + `<circle class="th-dot" fill="#EAF1FF" cx="${f1(X(last.i))}" cy="${f1(Y(last.v))}" r="2.5"/>`
    + `</svg>`;
}
const empty = (w: number, h: number) => `<svg width="${w}" height="${h}" aria-hidden="true"></svg>`;

export function thresholdSvg(id: string, sol: number, key: MeasureKey, w: number, h: number, span = 14, mode: RefMode = "auto") {
  const ref = referenceFor(id, key, sol, mode);
  const from = Math.max(1, sol - span + 1), n = sol - from + 1;
  const pts: Array<{ i: number; v: number }> = [];
  for (let t = from, i = 0; t <= sol; t++, i++) {
    const v = val(day(id, t), key);
    if (v != null) pts.push({ i, v });
  }
  if (pts.length < 2 || !ref || w < 20) return empty(w, h);
  const bad = MKEY[key].bad;
  return draw({
    pts, n, lo: ref.lo, hi: ref.hi, mid: ref.value, w, h,
    aboveBad: bad !== "low", belowBad: bad !== "high",
    uid: `th-${mode}-${key}-${id}-${span}-${Math.round(w)}x${Math.round(h)}`,
    label: `${MKEY[key].name}, ${n} sols, ${ref.label}`,
  });
}

/* Crew version: the team's average distance from each sharing person's own normal, in band-widths,
   signed so positive = the worse direction. The band is -1..+1 (everyone within their own normal). */
export function teamThresholdSvg(key: MeasureKey, sol: number, shares: Shares, w: number, h: number) {
  const t = teamStatus(key, sol, shares);
  const pts = t.trend.map((p, i) => ({ i, v: p.z })).filter((p): p is { i: number; v: number } => p.v != null);
  if (pts.length < 2 || w < 20) return empty(w, h);
  return draw({
    pts, n: Math.max(2, t.trend.length), lo: -1, hi: 1, mid: 0, w, h,
    aboveBad: true, belowBad: false,
    uid: `tth-${key}-${Math.round(w)}x${Math.round(h)}`,
    label: `${MKEY[key].name}, team trend over 14 sols, against everyone's own normal`,
  });
}

/* Summary for the modal: logged sols, how many sat past the band on the worse side, and the average. */
export function thresholdSummary(id: string, sol: number, key: MeasureKey, span: number, mode: RefMode = "auto") {
  const ref = referenceFor(id, key, sol, mode);
  if (!ref) return null;
  let logged = 0, worse = 0, sum = 0;
  for (let t = Math.max(1, sol - span + 1); t <= sol; t++) {
    const v = val(day(id, t), key);
    if (v == null) continue;
    logged++; sum += v;
    if (sideOf(key, v, ref) === "bad") worse++;
  }
  return { ref, logged, worse, avg: logged ? sum / logged : null };
}
