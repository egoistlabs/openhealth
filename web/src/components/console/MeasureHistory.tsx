"use client";

import { useMemo, useState, type ReactNode } from "react";
import { baseline, day, fmt, fmtDelta, val, type Measure } from "@/lib/console/data";
import { Num } from "@/components/ui";
import { FillPlot } from "./Plot";
import { sideOf, thresholdSummary, thresholdSvg, type Ref } from "@/lib/console/threshold";
import { MEASURE_INFO } from "@/lib/console/measure-info";

/* Strava-style history for one measure: pick a range, see summary stats, scrub an interactive bar
   chart (each bar is a sol, or a 7-sol average on long ranges), and read the recent log entries.
   Bars outside your normal band are coloured; the dashed line is your normal (median). */

type Pt = { from: number; to: number; v: number | null; med: number | null; out: boolean; n: number };
const RANGES = [["4W", 28], ["12W", 84], ["All", Infinity]] as const;
const VW = 600, VH = 150;

export function MeasureHistory({ m, me, sol, lead, aside, after }: { m: Measure; me: string; sol: number; lead?: ReactNode; aside?: ReactNode; after?: ReactNode }) {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("4W");
  const [hover, setHover] = useState<number | null>(null);
  const span = RANGES.find((r) => r[0] === range)![1];
  const from = Math.max(1, Number.isFinite(span) ? sol - span + 1 : 1);

  const { pts, daily } = useMemo(() => {
    const daily: Pt[] = [];
    for (let s = from; s <= sol; s++) {
      const v = val(day(me, s), m.key), b = baseline(me, m.key, s);
      daily.push({ from: s, to: s, v, med: b?.med ?? null, out: v != null && !!b && (v < b.lo || v > b.hi), n: v == null ? 0 : 1 });
    }
    if (daily.length <= 84) return { pts: daily, daily };
    // long ranges: 7-sol buckets so bars stay readable
    const pts: Pt[] = [];
    for (let i = 0; i < daily.length; i += 7) {
      const g = daily.slice(i, i + 7), vs = g.filter((d) => d.v != null), ms = g.filter((d) => d.med != null);
      pts.push({
        from: g[0].from, to: g[g.length - 1].to,
        v: vs.length ? vs.reduce((a, d) => a + d.v!, 0) / vs.length : null,
        med: ms.length ? ms.reduce((a, d) => a + d.med!, 0) / ms.length : null,
        out: g.some((d) => d.out), n: vs.length,
      });
    }
    return { pts, daily };
  }, [me, m.key, from, sol]);

  const logged = daily.filter((d) => d.v != null);
  const vals = logged.map((d) => d.v!);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const hi = vals.length ? Math.max(...vals) : null, lo = vals.length ? Math.min(...vals) : null;
  const outside = daily.filter((d) => d.out).length;

  // y domain from values and medians, padded; bars rise from the bottom of the domain
  const all = pts.flatMap((p) => [p.v, p.med]).filter((x): x is number => x != null);
  const dMin = all.length ? Math.min(...all) : 0, dMax = all.length ? Math.max(...all) : 1;
  const pad = (dMax - dMin || 1) * 0.15, y0 = dMin - pad, y1 = dMax + pad;
  const Y = (v: number) => VH - ((v - y0) / (y1 - y0)) * VH;
  const bw = VW / pts.length, gap = Math.min(4, bw * 0.25);
  const medPath = pts.map((p, i) => (p.med == null ? "" : `${i && pts[i - 1].med != null ? "L" : "M"}${(i + 0.5) * bw} ${Y(p.med)}`)).join("");
  const sel = hover != null ? pts[hover] : null;
  const recent = logged.slice(-7).reverse();
  const solLabel = (p: Pt) => (p.from === p.to ? `Sol ${p.from}` : `Sol ${p.from}–${p.to}`);

  return (
    <div className="mh">
     <div className="mh__main">
      {lead}
      <div className="mh__top">
        <h3 className="label">History</h3>
        <div className="mh__tabs" role="tablist" aria-label="Range">
          {RANGES.map(([k]) => (
            <button key={k} type="button" role="tab" aria-selected={range === k} className={`mh__tab${range === k ? " is-on" : ""}`}
              onClick={() => { setRange(k); setHover(null); }}>{k}</button>
          ))}
        </div>
      </div>

      <dl className="mh__stats">
        <div><dt>Average</dt><dd>{fmt(m.key, avg)}</dd></div>
        <div><dt>Highest</dt><dd>{fmt(m.key, hi)}</dd></div>
        <div><dt>Lowest</dt><dd>{fmt(m.key, lo)}</dd></div>
        <div><dt>Outside normal</dt><dd><Num>{outside}</Num> <span className="t2">/ {logged.length} sols</span></dd></div>
      </dl>

      <div className="mh__readout" aria-live="polite">
        {sel ? <>
          <b>{solLabel(sel)}</b>
          <span className="mh__rv">{fmt(m.key, sel.v)}{sel.n > 1 ? <span className="t2"> avg</span> : null}</span>
          <span className="t2">Normal {fmt(m.key, sel.med)}</span>
          {sel.v != null && sel.med != null ? <span className={sel.out ? "mh__out" : "t2"}>{fmtDelta(m.key, sel.v - sel.med)}</span> : null}
        </> : <span className="t2">Hover or tap a bar to see that {pts.length < daily.length ? "week" : "sol"}.</span>}
      </div>

      <div className="mh__chart" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" role="img" aria-label={`${m.name} history, ${solLabel({ from, to: sol } as Pt)}`}>
          {pts.map((p, i) => {
            if (p.v == null) return <rect key={i} className="mh__gapbar" x={i * bw + gap / 2} y={VH - 2} width={Math.max(1, bw - gap)} height={2} />;
            const top = Y(p.v);
            return <rect key={i} className={`mh__bar${p.out ? " is-out" : ""}${hover === i ? " is-hi" : ""}`}
              x={i * bw + gap / 2} y={top} width={Math.max(1, bw - gap)} height={Math.max(1, VH - top)} />;
          })}
          {medPath ? <path className="mh__med" d={medPath} vectorEffect="non-scaling-stroke" /> : null}
          {pts.map((_, i) => (
            <rect key={`h${i}`} x={i * bw} y={0} width={bw} height={VH} fill="transparent"
              onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
          ))}
        </svg>
        <div className="mh__axis small t2"><span>{solLabel({ from, to: from } as Pt)}</span><span>Sol {sol}</span></div>
      </div>
      <div className="legend">
        <span><i className="mh__sw" />Within your normal</span>
        <span><i className="mh__sw is-out" />Outside your normal</span>
        <span><i className="mh__sw mh__sw--med" />Your normal (median)</span>
      </div>
      <VsEarth m={m} me={me} sol={sol} span={Number.isFinite(span) ? span : sol} />
      {after}
     </div>

     <div className="mh__side">
      <div>
        <h3 className="label">Recent logs</h3>
        <ul className="mh__log">
          {recent.length ? recent.map((d) => (
            <li key={d.from}>
              <span className="mh__dot" data-out={d.out || undefined} aria-hidden="true" />
              <span className="t2">Sol <Num>{d.from}</Num></span>
              <span className="mh__lv">{fmt(m.key, d.v)}</span>
              <span className={d.out ? "mh__out" : "t2"}>{d.med != null ? fmtDelta(m.key, d.v! - d.med) : "—"}</span>
              <span className="small t2">{d.out ? "Outside normal" : "Within normal"}</span>
            </li>
          )) : <li className="t2">Nothing logged in this range.</li>}
        </ul>
      </div>
      {aside}
     </div>
    </div>
  );
}

/* Two charts over the selected range: you vs your own normal, then you vs Earth (or, for 1–5
   self-ratings with no Earth average, a healthy range on the scale). The explanation and tips follow
   the Earth chart when there is one. */
function VsEarth({ m, me, sol, span }: { m: Measure; me: string; sol: number; span: number }) {
  const own = thresholdSummary(me, sol, m.key, span, "own");
  const earth = thresholdSummary(me, sol, m.key, span, "earth");
  if (!own && !earth) return null;
  const from = Math.max(1, sol - span + 1);
  const isScale = earth != null && !(m.key === "sleep" || m.key === "rt" || m.key === "timing");
  const chart = (mode: "own" | "earth", sum: NonNullable<typeof own>, title: string, what: string) => (
    <section className="vse" aria-label={`${m.name}: ${title}`}>
      <div className="mh__top">
        <h3 className="label">{title}</h3>
        <span className="small t2">{sum.ref.label}</span>
      </div>
      <p className="small"><Num>{sum.worse}</Num> of <Num>{sum.logged}</Num> logged sols outside {what} on the worse side.</p>
      <FillPlot className="vse__chart" draw={(w, h) => thresholdSvg(me, sol, m.key, w, h, span, mode)} />
      <div className="mh__axis small t2"><span>Sol {from}</span><span>Sol {sol}</span></div>
    </section>
  );
  const main = earth ?? own!;
  return (
    <>
      {own ? chart("own", own, "You vs your normal", "the band of your normal") : null}
      {earth ? chart("earth", earth, isScale ? "You vs a healthy range" : "You vs Earth", isScale ? "the healthy range" : "the healthy Earth range") : null}
      <VsExplain m={m} avg={main.avg} band={main.ref} span={span} scale={isScale} />
    </>
  );
}

/* Plain-language reading of the chart plus practical steps, so the astronaut knows what to do. */
const SIDE: Record<string, string> = {
  low: "For this measure, falling below the band is the side to watch; sitting inside it or above it is fine.",
  high: "For this measure, rising above the band is the side to watch; sitting inside it or below it is fine.",
  both: "For this measure, aim to stay inside the band, neither too early nor too late.",
};
function VsExplain({ m, avg, band, span, scale = false }: { m: Measure; avg: number | null; band: Ref; span: number; scale?: boolean }) {
  const info = MEASURE_INFO[m.key];
  const range = span > 84 ? "whole-mission" : span === 84 ? "12-week" : "4-week";
  const what = !band.earth ? "your usual band" : scale ? "the healthy range" : "the healthy Earth range";
  const side = avg == null ? null : sideOf(m.key, avg, band);
  const gap = avg == null ? 0 : avg < band.lo ? band.lo - avg : avg > band.hi ? avg - band.hi : 0;
  return (
    <div className="vse__x">
      <h4 className="about__h">What this means</h4>
      <p className="small">
        {avg == null ? <>Not enough logged sols in this range yet. </> : <>
          Your {range} average is <b>{fmt(m.key, avg)}</b>
          {side === "in" ? <>, inside {what} of <b>{fmt(m.key, band.lo)}–{fmt(m.key, band.hi)}</b>. That is where you want to be. </>
            : <>, <b>{fmtDelta(m.key, gap).replace(/^[+-]/, "")}</b> {avg < band.lo ? "below" : "above"} {what} of <b>{fmt(m.key, band.lo)}–{fmt(m.key, band.hi)}</b>{side === "good" ? ", on the healthy side." : ". Worth working on."} </>}
        </>}
        {SIDE[m.bad]}{!band.earth ? " There is no Earth standard for this one, so the band is your own usual range." : scale ? " There is no published Earth average for a 1–5 self-rating, so this is a healthy range on the scale itself. Your Normal/Watch status still compares you with your own normal." : " The Earth range is general guidance for healthy adults; your Normal/Watch status still compares you with your own normal."}
      </p>
      {info?.improve?.length ? <>
        <h4 className="about__h">How to improve</h4>
        <ul className="about__list">{info.improve.map((x) => <li key={x}>{x}</li>)}</ul>
      </> : null}
    </div>
  );
}
