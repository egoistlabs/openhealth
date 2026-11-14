/* Threshold sparkline for the Home measure cards: the person's last 14 sols as a line, a dashed
   reference line, and the area between them filled in two colours: one where they sit on the
   healthy side of the reference, another where they sit on the worse side.
   The reference is a general Earth guideline where one exists (sleep, reaction time, sleep timing);
   self-rated and measured-only measures have no Earth standard, so they use the person's own normal.
   Returns an SVG string sized to the given width (same pattern as lib/console/plots.ts). */
import { MKEY, baseline, day, teamStatus, val, type MeasureKey, type Shares } from "./data";

export type Ref = { value: number; label: string; earth: boolean };

// General guidance, in each measure's own units (hours, ms, minutes after midnight).
const EARTH: Partial<Record<MeasureKey, { value: number; label: string }>> = {
  sleep: { value: 8, label: "vs Earth 7–9 h" },
  rt: { value: 250, label: "vs Earth ~250 ms" },
  timing: { value: 210, label: "vs Earth ~03:30" },
};

export function referenceFor(id: string, key: MeasureKey, sol: number): Ref | null {
  const e = EARTH[key];
  if (e) return { ...e, earth: true };
  const b = baseline(id, key, sol);
  return b ? { value: b.med, label: "vs your normal", earth: false } : null;
}

const f1 = (v: number) => v.toFixed(1);

export function thresholdSvg(id: string, sol: number, key: MeasureKey, w: number, h: number) {
  const ref = referenceFor(id, key, sol);
  const pts: Array<{ i: number; v: number }> = [];
  for (let t = sol - 13, i = 0; t <= sol; t++, i++) {
    const v = t > 0 ? val(day(id, t), key) : null;
    if (v != null) pts.push({ i, v });
  }
  if (pts.length < 2 || !ref || w < 20) return `<svg width="${w}" height="${h}" aria-hidden="true"></svg>`;

  const vals = pts.map((p) => p.v).concat(ref.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.15; lo -= pad; hi += pad;
  const X = (i: number) => 2 + (i * (w - 6)) / 13;
  const Y = (v: number) => 2 + ((hi - v) / (hi - lo)) * (h - 4);
  const ry = Y(ref.value);

  // which side of the reference is "worse" for this measure
  const bad = MKEY[key].bad; // "low" | "high" | "both"
  const aboveCls = bad === "low" ? "th-good" : "th-bad";
  const belowCls = bad === "high" ? "th-good" : "th-bad";

  const line = pts.map((p, k) => `${k ? "L" : "M"}${f1(X(p.i))} ${f1(Y(p.v))}`).join("");
  const area = `${line}L${f1(X(pts[pts.length - 1].i))} ${f1(ry)}L${f1(X(pts[0].i))} ${f1(ry)}Z`;
  const uid = `th-${key}-${id}`;
  const last = pts[pts.length - 1];

  return `<svg width="${w}" height="${h}" role="img" aria-label="${MKEY[key].name}, last 14 sols, ${ref.label}">`
    + `<defs><clipPath id="${uid}-a"><rect x="0" y="0" width="${w}" height="${f1(ry)}"/></clipPath>`
    + `<clipPath id="${uid}-b"><rect x="0" y="${f1(ry)}" width="${w}" height="${f1(h - ry)}"/></clipPath></defs>`
    + `<path class="${aboveCls}" fill="${aboveCls === "th-good" ? "#7FB069" : "#D4A72C"}" fill-opacity="0.3" d="${area}" clip-path="url(#${uid}-a)"/>`
    + `<path class="${belowCls}" fill="${belowCls === "th-good" ? "#7FB069" : "#D4A72C"}" fill-opacity="0.3" d="${area}" clip-path="url(#${uid}-b)"/>`
    + `<line class="th-ref${ref.earth ? " is-earth" : ""}" stroke="#8FA3BD" stroke-dasharray="4 3" x1="0" x2="${w}" y1="${f1(ry)}" y2="${f1(ry)}"/>`
    + `<path class="th-line" fill="none" stroke="#EAF1FF" stroke-width="1.5" d="${line}"/>`
    + `<circle class="th-dot" fill="#EAF1FF" cx="${f1(X(last.i))}" cy="${f1(Y(last.v))}" r="2.5"/>`
    + `</svg>`;
}

/* Crew version: the team's average distance from each sharing person's own normal (in band-widths,
   signed so that positive = the worse direction for this measure). Reference = 0 (everyone at their
   own normal). Above the line is the worse side, below is the healthy side. */
export function teamThresholdSvg(key: MeasureKey, sol: number, shares: Shares, w: number, h: number) {
  const t = teamStatus(key, sol, shares);
  const pts = t.trend.map((p, i) => ({ i, v: p.z })).filter((p): p is { i: number; v: number } => p.v != null);
  if (pts.length < 2 || w < 20) return `<svg width="${w}" height="${h}" aria-hidden="true"></svg>`;
  const vals = pts.map((p) => p.v).concat(0);
  let lo = Math.min(...vals, -1), hi = Math.max(...vals, 1);
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const n = Math.max(2, t.trend.length);
  const X = (i: number) => 2 + (i * (w - 6)) / (n - 1);
  const Y = (v: number) => 2 + ((hi - v) / (hi - lo)) * (h - 4);
  const ry = Y(0);
  const line = pts.map((p, k) => `${k ? "L" : "M"}${f1(X(p.i))} ${f1(Y(p.v))}`).join("");
  const area = `${line}L${f1(X(pts[pts.length - 1].i))} ${f1(ry)}L${f1(X(pts[0].i))} ${f1(ry)}Z`;
  const uid = `tth-${key}`, last = pts[pts.length - 1];
  return `<svg width="${w}" height="${h}" role="img" aria-label="${MKEY[key].name}, team trend over 14 sols, against everyone's own normal">`
    + `<defs><clipPath id="${uid}-a"><rect x="0" y="0" width="${w}" height="${f1(ry)}"/></clipPath>`
    + `<clipPath id="${uid}-b"><rect x="0" y="${f1(ry)}" width="${w}" height="${f1(h - ry)}"/></clipPath></defs>`
    + `<path class="th-bad" fill="#D4A72C" fill-opacity="0.3" d="${area}" clip-path="url(#${uid}-a)"/>`
    + `<path class="th-good" fill="#7FB069" fill-opacity="0.3" d="${area}" clip-path="url(#${uid}-b)"/>`
    + `<line class="th-ref" stroke="#8FA3BD" stroke-dasharray="4 3" x1="0" x2="${w}" y1="${f1(ry)}" y2="${f1(ry)}"/>`
    + `<path class="th-line" fill="none" stroke="#EAF1FF" stroke-width="1.5" d="${line}"/>`
    + `<circle class="th-dot" fill="#EAF1FF" cx="${f1(X(last.i))}" cy="${f1(Y(last.v))}" r="2.5"/>`
    + `</svg>`;
}
