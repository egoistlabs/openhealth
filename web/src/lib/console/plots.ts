/* SVG plots, ported from the prototype. Each returns an SVG string sized to the measured width.
   Geometry comes from the layout tokens; colours come from CSS classes (tokens only).
   Output contains only computed numbers and our own formatted labels, never user text. */
import {
  MKEY, baseline, day, fmt, hm, mstatus, teamStatus, val,
  type MeasureKey, type Shares, type State, type Status,
} from "./data";

export const tok = (n: string) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)) || 0;
const f1 = (v: number) => v.toFixed(1), px = (v: number) => Math.round(v) + 0.5;
const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
const CLS: Record<string, string> = { normal: "normal", watch: "watch", act: "act", pending: "pending", nobase: "pending", info: "info" };

export function trendSvg(id: string, sol: number, key: MeasureKey, w: number) {
  const days: { sol: number; v: number | null; b: ReturnType<typeof baseline> }[] = [];
  for (let s = sol - 27; s <= sol; s++) days.push({ sol: s, v: s > 0 ? val(day(id, s), key) : null, b: s > 0 ? baseline(id, key, s) : null });
  const H = tok("--plot-trend"), AX = tok("--s-6"), h = H + AX, x0 = tok("--chart-label-gutter"), x1 = w - tok("--chart-right-gutter");
  const step = (x1 - x0) / days.length, X = (i: number) => x0 + step * (i + 0.5);
  const vs = days.flatMap((d) => [d.v, d.b && d.b.lo, d.b && d.b.hi]).filter((v): v is number => v != null);
  let lo: number, hi: number;
  if (["mood", "load", "team"].includes(key)) { lo = 1; hi = 5; }
  else if (key === "sleep" || key === "engage") { lo = 0; hi = Math.max(...vs) * 1.1; }
  else { lo = Math.min(...vs); hi = Math.max(...vs); const pd = (hi - lo) * 0.15 || 10; lo -= pd; hi += pd; }
  const y = lin(lo, hi, H, tok("--s-2"));
  const tf = (t: number) => (key === "timing" ? hm(t) : key === "sleep" ? `${Math.round(t)}h` : String(Math.round(t)));
  let s = `<svg width="${w}" height="${h}" role="img" aria-label="${MKEY[key].name}, 28 sols, with your baseline band">`;
  (["mood", "load", "team"].includes(key) ? [1, 3, 5] : [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1]).forEach((t) => {
    s += `<line class="g" x1="${x0}" x2="${x1}" y1="${px(y(t))}" y2="${px(y(t))}"/><text class="tk" x="0" y="${f1(y(t) + 4)}">${tf(t)}</text>`;
  });
  const bd = days.map((d, i) => ({ i, b: d.b })).filter((d): d is { i: number; b: NonNullable<typeof d.b> } => !!d.b);
  if (bd.length) {
    const up = bd.map((d) => `${f1(X(d.i) - step / 2)} ${f1(y(d.b.hi))}L${f1(X(d.i) + step / 2)} ${f1(y(d.b.hi))}`).join("L");
    const dn = bd.slice().reverse().map((d) => `${f1(X(d.i) + step / 2)} ${f1(y(d.b.lo))}L${f1(X(d.i) - step / 2)} ${f1(y(d.b.lo))}`).join("L");
    s += `<path class="band" d="M${up}L${dn}Z"/><path class="ln ln--target" d="M${bd.map((d) => `${f1(X(d.i) - step / 2)} ${f1(y(d.b.med))}L${f1(X(d.i) + step / 2)} ${f1(y(d.b.med))}`).join("L")}"/>`;
  }
  const bw = Math.max(2, Math.min(10, step * 0.55)), bad = MKEY[key].bad;
  const out = (d: (typeof days)[number]) => !!d.b && d.v != null && ((bad === "low" && d.v < d.b.lo) || (bad === "high" && d.v > d.b.hi) || (bad === "both" && (d.v < d.b.lo || d.v > d.b.hi)));
  if (key === "sleep" || key === "engage") {
    days.forEach((d, i) => { if (d.v != null) s += `<rect class="bar${out(d) ? " bar--out" : ""}" x="${f1(X(i) - bw / 2)}" y="${f1(y(d.v))}" width="${f1(bw)}" height="${f1(y(lo) - y(d.v))}"><title>Sol ${d.sol}: ${fmt(key, d.v)}</title></rect>`; });
  } else {
    let p = "", pen = false;
    days.forEach((d, i) => { if (d.v == null) { pen = false; return; } p += `${pen ? "L" : "M"}${f1(X(i))} ${f1(y(d.v))}`; pen = true; });
    if (key !== "timing") s += `<path class="ln" d="${p}"/>`;
    days.forEach((d, i) => {
      if (d.v == null) { if (d.sol > 0) s += `<line class="miss" x1="${f1(X(i))}" x2="${f1(X(i))}" y1="${H - 3}" y2="${H}"><title>Sol ${d.sol}: not logged</title></line>`; return; }
      s += `<circle class="dot${out(d) ? " dot--out" : ""}" cx="${f1(X(i))}" cy="${f1(y(d.v))}" r="2.5"><title>Sol ${d.sol}: ${fmt(key, d.v)}</title></circle>`;
    });
  }
  const lb = bd.length ? bd[bd.length - 1].b : null;
  if (lb) s += `<text class="lbl" x="${x1 + 10}" y="${f1(y(lb.med) + 4)}">Your baseline</text>`;
  const lv = days.slice().reverse().find((d) => d.v != null);
  if (lv && lb) {
    const ly = y(lv.v!), my = y(lb.med);
    const yy = Math.abs(ly - my) < 16 ? (ly < my ? my - 16 : my + 20) : ly + 4;
    s += `<text class="lbl-v" x="${x1 + 10}" y="${f1(Math.max(10, Math.min(H, yy)))}">${fmt(key, lv.v)}</text>`;
  }
  const every = Math.max(1, Math.ceil(36 / step));
  s += `<text class="tk-s" x="0" y="${h - 4}">Sol</text>`;
  for (let i = days.length - 1; i >= 0; i -= every) if (days[i].sol > 0) s += `<text class="tk" text-anchor="middle" x="${f1(X(i))}" y="${h - 4}">${days[i].sol}</text>`;
  return s + "</svg>";
}

export function railSvg(st: Status, w: number) {
  const h = tok("--plot-rail"), c = w / 2, span = w / 6;
  let o = `<svg width="${w}" height="${h}"><line class="rail-bg" x1="0" x2="${w}" y1="${h / 2 + 0.5}" y2="${h / 2 + 0.5}"/><rect class="rail-band" x="${f1(c - span)}" y="2" width="${f1(span * 2)}" height="${h - 4}"/><line class="rail-zero" x1="${px(c)}" x2="${px(c)}" y1="0" y2="${h}"/>`;
  if (st.base && st.value != null) o += `<circle class="dot dot--${CLS[st.state]}" cx="${f1(c + Math.max(-3, Math.min(3, st.delta! / st.base.half)) * span)}" cy="${h / 2}" r="3"/>`;
  return o + "</svg>";
}

export function sparkSvg(id: string, sol: number, key: MeasureKey, w: number) {
  const st = mstatus(id, key, sol);
  const h = tok("--plot-spark"), vals: (number | null)[] = [];
  for (let t = sol - 13; t <= sol; t++) vals.push(t > 0 ? val(day(id, t), key) : null);
  const vs = vals.filter((v): v is number => v != null), b = st.base;
  let o = `<svg width="${w}" height="${h}">`;
  if (!vs.length) return o + "</svg>";
  let lo = Math.min(...vs, b ? b.lo : Infinity), hi = Math.max(...vs, b ? b.hi : -Infinity);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const y = lin(lo, hi, h - 2, 2), x = (i: number) => 2 + (i * (w - 6)) / 13;
  if (b) o += `<rect class="band" x="0" y="${f1(y(b.hi))}" width="${w}" height="${f1(Math.max(1, y(b.lo) - y(b.hi)))}"/>`;
  let p = "", pen = false;
  vals.forEach((v, i) => { if (v == null) { pen = false; return; } p += `${pen ? "L" : "M"}${f1(x(i))} ${f1(y(v))}`; pen = true; });
  o += `<path class="ln ln--2" d="${p}"/>`;
  const li = vals.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop()!;
  o += `<circle class="dot dot--${CLS[st.state]}" cx="${f1(x(li))}" cy="${f1(y(vals[li]!))}" r="2"/>`;
  return o + "</svg>";
}

export function teamSvg(key: MeasureKey, sol: number, shares: Shares, w: number) {
  const t = teamStatus(key, sol, shares), H = tok("--plot-team"), y = lin(-1.5, 2.5, H - 2, 2);
  const pts = t.trend, x = (i: number) => 2 + (i * (w - 6)) / (pts.length - 1);
  const cl = (z: number) => Math.max(-1.5, Math.min(2.5, z));
  let s = `<svg width="${w}" height="${H}" role="img" aria-label="Team trend over 14 sols"><rect class="band" x="0" y="${f1(y(1))}" width="${w}" height="${f1(y(-1) - y(1))}"/><line class="g-zero" x1="0" x2="${w}" y1="${px(y(0))}" y2="${px(y(0))}"/>`;
  let p = "", pen = false;
  pts.forEach((d, i) => { if (d.z == null) { pen = false; return; } p += `${pen ? "L" : "M"}${f1(x(i))} ${f1(y(cl(d.z)))}`; pen = true; });
  s += `<path class="ln" d="${p}"/>`;
  const last = pts.map((d, i) => (d.z != null ? i : -1)).filter((i) => i >= 0).pop();
  if (last != null) s += `<circle class="dot dot--${CLS[t.state as State]}" cx="${f1(x(last))}" cy="${f1(y(cl(pts[last].z!)))}" r="2.5"/>`;
  return s + "</svg>";
}

export function tapsSvg(trials: number[], w: number) {
  const h = tok("--s-8"), x = (i: number) => 6 + (i * (w - 12)) / 9, y = lin(150, 650, h - 4, 4);
  let s = `<svg width="${w}" height="${h}" aria-hidden="true"><line class="ln ln--target" x1="0" x2="${w}" y1="${px(y(500))}" y2="${px(y(500))}"/>`;
  for (let i = 0; i < 10; i++) { const v = trials[i]; if (v != null) s += `<circle class="dot${v > 500 ? " dot--out" : ""}" cx="${f1(x(i))}" cy="${f1(y(Math.min(650, v)))}" r="3"/>`; }
  return s + "</svg>";
}

