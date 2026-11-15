"use client";

import { useMemo } from "react";
import { P } from "@/lib/console/data";
import { fmtVital, fmtVitalDelta, vitals, type Vital, type VitalKey } from "@/lib/console/wearable";
import { lightDelayMin } from "@/lib/console/ground";

/* Wearable on Pedro's page: the five tiles and the 14-night log (moved here from Home and the log drawer),
   the corner readout (WearableHud) and the board that pops in beside Pedro (WearableBoard). */

/* Wearable vitals beside the identity block: last night's readings from a (simulated) smartwatch or chest
   monitor, each against the person's own normal, with Watch when outside their usual spread. */
export function Vitals({ id, sol }: { id: string; sol: number }) {
  const vs = useMemo(() => vitals(id, sol), [id, sol]);
  const off = vs.filter((v) => v.state !== "normal").length, urgent = vs.filter((v) => v.state === "act").length;
  return (
    <section style={V.box} aria-labelledby="vit-t">
      <div style={V.head}>
        <h2 id="vit-t" style={V.title}>Wearable · last night</h2>
        <span style={{ ...V.sub, color: VITAL_COLOUR[urgent ? "act" : off ? "watch" : "normal"] }}>
          {urgent ? `${urgent} urgent${off > urgent ? `, ${off - urgent} on watch` : ""}` : off ? `${off} off your normal` : "All stable"}
        </span>
        {/* the readings are on board straight away; Earth gets them after the one-way light time
            (NASA: about 3 to 22 min one way on a Mars mission; up to about 44 min there and back) */}
        <span style={V.delay} data-tip={`Mars to Earth one-way light time today is ${lightDelayMin(sol)} min (NASA: about 3 to 22 min one way on a Mars mission, up to about 44 min there and back). A reply from Earth takes as long again: ${2 * lightDelayMin(sol)} min there and back.`} tabIndex={0}>
          On board now · Earth sees it in <b>{lightDelayMin(sol)} min</b> · {2 * lightDelayMin(sol)} min round trip
        </span>
        <span style={V.src}>Simulated, like the CSA Bio-Monitor on the ISS</span>
      </div>
      <div style={V.grid}>
        {vs.map((v) => (
          <div key={v.key} style={{ ...V.tile, ...(v.state === "act" ? V.tileAct : null),
            /* top edge in the status colour; an Urgent tile is outlined in red all round */
            borderColor: v.state === "act" ? "var(--c-act)" : `${VITAL_COLOUR[v.state]} var(--c-hair) var(--c-hair)` }} tabIndex={0}
            data-tip={`${v.label}: ${VITAL_WORD[v.state]}.\n${v.tip}\n\nHealthy range: ${v.range}\nYour normal: ${fmtVital(v, v.normal)}. Tonight: ${fmtVital(v, v.value)} (${fmtVitalDelta(v)}).\n\nQuick fact: ${v.fact}`}
            aria-label={`${v.label} ${fmtVital(v, v.value)}, ${fmtVitalDelta(v)} from your normal of ${fmtVital(v, v.normal)}, ${VITAL_WORD[v.state]}`}>
            <div style={{ minWidth: 0 }}>
              <div style={V.label}>
                {VITAL_SHORT[v.key]}
                <span style={{ marginLeft: 6, color: VITAL_COLOUR[v.state], fontWeight: 600 }}>{VITAL_TAG[v.state]}</span>
              </div>
              <div style={V.num}>{v.value.toFixed(v.digits)}</div>
              <div style={{ ...V.delta, color: v.state === "normal" ? "var(--c-text-3)" : VITAL_COLOUR[v.state] }}>
                {fmtVitalDelta(v)} <span style={{ color: "var(--c-text-3)" }}>vs {v.normal.toFixed(v.digits)}</span>
              </div>
            </div>
            <VitalRing v={v} />
          </div>
        ))}
      </div>
    </section>
  );
}

/* the app's status colours: green stable, amber Watch, red Act (urgent) */
const VITAL_COLOUR: Record<Vital["state"], string> = { normal: "var(--c-normal)", watch: "var(--c-watch)", act: "var(--c-act)" };
/* shape + word + colour, like the status marks elsewhere, so the level never depends on colour alone */
const VITAL_TAG: Record<Vital["state"], string> = { normal: "● Stable", watch: "▲ Watch", act: "■ Urgent" };
const VITAL_WORD: Record<Vital["state"], string> = {
  normal: "Stable, within your normal",
  watch: "Watch, outside your usual range",
  act: "Urgent, far outside your normal: tell the crew medical officer",
};
const VITAL_SHORT: Record<string, string> = { rhr: "Heart rate", hrv: "HRV", spo2: "SpO₂", temp: "Skin temp", resp: "Breathing" };
const VITAL_UNIT: Record<string, string> = { rhr: "bpm", hrv: "ms", spo2: "%", temp: "°C", resp: "/min" };

/* ring gauge: the arc shows where tonight sits against the person's normal (half = exactly normal,
   full or empty = two spreads away); yellow when outside their usual spread */
function VitalRing({ v }: { v: Vital }) {
  const r = 16, c = 2 * Math.PI * r;
  const frac = Math.min(0.97, Math.max(0.06, 0.5 + (v.value - v.normal) / (4 * v.band)));
  const col = VITAL_COLOUR[v.state];
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" style={{ flex: "none" }}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--c-hair-strong)" strokeWidth="3" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={col} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${frac * c} ${c}`} transform="rotate(-90 20 20)" />
      <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fontSize="9" fill="var(--c-text-2)" fontFamily="var(--f-mono)">{VITAL_UNIT[v.key]}</text>
    </svg>
  );
}

/* inline so the strip renders even when the stylesheet is stale in dev */
const V = {
  box: { width: "100%", display: "grid", gap: 4, marginTop: 2, paddingTop: 6, borderTop: "1px solid var(--c-hair)" },
  head: { display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--c-text-2)" },
  sub: { fontSize: 11 },
  delay: { fontSize: 11, color: "var(--c-text-2)", outline: "none" },
  src: { marginLeft: "auto", fontSize: 10, color: "var(--c-text-3)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: 8 },
  /* longhand border only (no `border` shorthand): the colour is set per tile as one borderColor value, so React
     never has to remove a longhand that conflicts with a shorthand when the astronaut or status changes */
  tile: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "5px 10px", borderStyle: "solid", borderWidth: "2px 1px 1px", borderRadius: 6, background: "var(--c-surface)", outline: "none" },
  tileAct: { background: "color-mix(in srgb, var(--c-act) 10%, var(--c-surface))" },
  label: { fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--c-text-3)", whiteSpace: "nowrap" },
  num: { fontFamily: "var(--f-display, inherit)", fontSize: 26, fontWeight: 300, lineHeight: 1.1, color: "var(--c-text)", whiteSpace: "nowrap" },
  delta: { fontFamily: "var(--f-mono)", fontSize: 11, whiteSpace: "nowrap" },
} satisfies Record<string, React.CSSProperties>;


/* ---------- Wearable log: the last 14 nights, one row per night, all five readings ---------- */
const W_SHORT: Record<VitalKey, string> = { rhr: "HR", hrv: "HRV", spo2: "SpO₂", temp: "Temp", resp: "Breath" };
const W_COL: Record<Vital["state"], string> = { normal: "var(--c-text)", watch: "var(--c-watch)", act: "var(--c-act)" };
const W_MARK: Record<Vital["state"], string> = { normal: "", watch: " ▲", act: " ■" };
const W_NIGHTS = 14;
export function WearableLog({ id, sol }: { id: string; sol: number }) {
  const nights = useMemo(() => {
    const out: Array<{ sol: number; vs: Vital[] }> = [];
    for (let t = sol; t > Math.max(0, sol - W_NIGHTS); t--) out.push({ sol: t, vs: vitals(id, t) });
    return out;
  }, [id, sol]);
  const cols = "56px repeat(5, minmax(0, 1fr))";
  return (
    <div role="table" aria-label="Wearable readings, last 14 nights" style={{ display: "grid", gap: 2, fontSize: 13 }}>
      <div role="row" style={{ display: "grid", gridTemplateColumns: cols, gap: 6, padding: "4px 0", color: "var(--c-text-3)", fontSize: 11, borderBottom: "1px solid var(--c-hair)" }}>
        <span role="columnheader">Sol</span>
        {nights[0]?.vs.map((v) => <span key={v.key} role="columnheader" style={{ textAlign: "right" }}>{W_SHORT[v.key]} <span className="small">{v.unit}</span></span>)}
      </div>
      {nights.map(({ sol: t, vs }) => (
        <div key={t} role="row" style={{ display: "grid", gridTemplateColumns: cols, gap: 6, padding: "4px 0", borderBottom: "1px solid var(--c-hair)" }}
          aria-label={`Sol ${t}: ${vs.map((v) => `${v.label} ${fmtVital(v, v.value)}${v.state === "normal" ? "" : `, ${v.state === "act" ? "urgent" : "watch"}`}`).join("; ")}`}>
          <span role="rowheader" className="num t2">{t}{t === P ? " · today" : ""}</span>
          {vs.map((v) => (
            <span key={v.key} role="cell" className="num" style={{ textAlign: "right", color: W_COL[v.state], fontWeight: v.state === "normal" ? 400 : 600 }}
              title={`${v.label}: ${fmtVital(v, v.value)}, ${fmtVitalDelta(v)} vs your normal of ${fmtVital(v, v.normal)}`}>
              {v.value.toFixed(v.digits)}{W_MARK[v.state]}
            </span>
          ))}
        </div>
      ))}
      <p className="small t2" style={{ marginTop: 6 }}>▲ Watch: outside your usual range. ■ Urgent: far outside it, tell the crew medical officer.</p>
    </div>
  );
}


/* ---------- corner readout on Pedro's page: like a game overlay, one line per reading ---------- */
const HUD_LABEL: Record<VitalKey, string> = { rhr: "HR", hrv: "HRV", spo2: "SpO₂", temp: "Skin", resp: "Breath" };
const HUD_COL: Record<Vital["state"], string> = { normal: "var(--c-normal)", watch: "var(--c-watch)", act: "var(--c-act)" };
/* status in the app's words, with a shape so it never relies on colour alone */
const HUD_STATE: Record<Vital["state"], string> = { normal: "● Normal", watch: "▲ Watch", act: "■ Urgent" };
/* the overall line at the top: the worst reading decides it */
const HUD_OVERALL: Record<Vital["state"], string> = { normal: "All normal", watch: "Watch", act: "Urgent" };
/* rows carry the status in the value's colour; a small shape marks the ones off, so colour is never alone */
const HUD_MARK: Record<Vital["state"], string> = { normal: "", watch: "▲", act: "■" };
export function WearableHud({ id, sol, onOpen, disabled }: { id: string; sol: number; onOpen: () => void; disabled?: boolean }) {
  const vs = useMemo(() => vitals(id, sol), [id, sol]);
  const off = vs.filter((v) => v.state !== "normal").length;
  const worst: Vital["state"] = vs.some((v) => v.state === "act") ? "act" : off ? "watch" : "normal";
  return (
    <button type="button" className="whud" onClick={onOpen} disabled={disabled}
      aria-label={`Wearable, last night. ${HUD_OVERALL[worst]}. ${vs.map((v) => `${v.label} ${fmtVital(v, v.value)}, ${HUD_STATE[v.state].slice(2).toLowerCase()}`).join("; ")}. Click for Pedro's summary.`}>
      <span className="whud__t">Wearable · last night</span>
      <span className="whud__s" style={{ color: HUD_COL[worst] }}>
        {HUD_STATE[worst].slice(0, 1)} {HUD_OVERALL[worst]}{off ? <span className="whud__n"> · {off} of {vs.length}</span> : null}
      </span>
      {vs.map((v) => (
        <span key={v.key} className="whud__r">
          <span className="whud__l">{HUD_LABEL[v.key]}</span>
          <span className="whud__v" style={{ color: HUD_COL[v.state] }} title={`${v.label}: ${HUD_STATE[v.state].slice(2)}`}>{v.value.toFixed(v.digits)}</span>
          <span className="whud__u">{v.unit}</span>
          <span className="whud__m" style={{ color: HUD_COL[v.state] }} aria-hidden="true">{HUD_MARK[v.state]}</span>
        </span>
      ))}
      <span className="whud__cta">Pedro&apos;s summary →</span>
    </button>
  );
}

/* ---------- the board beside Pedro: the five tiles and the 14-night log ---------- */
export function WearableBoard({ id, sol, onClose }: { id: string; sol: number; onClose: () => void }) {
  return (
    <section className="board" aria-labelledby="wboard-t">
      <header className="board__h">
        <div>
          <h2 className="board__t" id="wboard-t">Wearable · last night</h2>
          <p className="small t2">Each reading against your own normal. On board now; Earth sees it {lightDelayMin(sol)} min later. Simulated data.</p>
        </div>
        <div className="board__act">
          <button type="button" className="btn-primary" onClick={onClose}>Done</button>
        </div>
      </header>
      <Vitals id={id} sol={sol} />
      <h3 className="small t2" style={{ marginTop: 8 }}>Last 14 nights{sol === P ? "" : ` to Sol ${sol}`}</h3>
      <WearableLog id={id} sol={sol} />
    </section>
  );
}
