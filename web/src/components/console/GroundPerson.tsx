"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { CREW, MEASURES, MISSION, MKEY, P, conversation, day, events, fmt, fmtBase, fmtDelta, hm, listJoin, mstatus, reason, type ConvoRow, type MeasureKey } from "@/lib/console/data";
import { escalationText, escalations, groundRows, personCheckins } from "@/lib/console/ground";
import { trendSvg } from "@/lib/console/plots";
import { fmtVital, fmtVitalDelta, vitals } from "@/lib/console/wearable";
import { Icon, Legend, Num, StatusMark, StatusRule, StatusWord } from "@/components/ui";
import { ChangelogTimeline, type TimelineCategory, type TimelineEntry } from "@/components/ui/changelog-timeline";
import { useConsole } from "./ConsoleProvider";
import { Plot } from "./Plot";
import { ROUTE, ReplayNote } from "./Shell";
import { VitalStrip } from "./GroundCrewCards";

const ACT_CATS: Record<string, TimelineCategory> = {
  act: { label: "Act", mark: "■", color: "var(--c-act)" },
  watch: { label: "Watch", mark: "▲", color: "var(--c-watch)" },
  normal: { label: "OK", mark: "●", color: "var(--c-normal)" },
  info: { label: "Info", mark: "◆", color: "var(--c-info)" },
};

type TalkDay = { sol: number; said: number; replies: number; first: number | null; asked: number; logged: string[]; advice: string[]; escalation: boolean };

/* A summary of one person's conversations with Pedro, built by code from the conversation rows.
   The astronaut's own words are never shown: only counts, what was logged (values only for shared
   measures) and what Pedro said back. */
function talkSummary(id: string, sol: number, live: ConvoRow[] | undefined, shared: MeasureKey[]): TalkDay[] {
  const out: TalkDay[] = [];
  for (let t = sol; t > sol - 3 && t > 0; t--) {
    const rows = t === P && live ? live.filter((r) => r.sol === t) : conversation(id, t);
    if (!rows.length) continue;
    const said = rows.filter((r) => r.who === "you").length;
    const parsed = rows.filter((r) => r.who === "parsed");
    const pedro = rows.filter((r) => r.who === "companion" || r.who === "summary");
    out.push({
      sol: t, said, replies: pedro.length,
      first: rows.find((r) => r.who === "you")?.min ?? null,
      // check-in answers come with a parsed row; anything else the person said was beyond the check-in
      asked: Math.max(0, said - parsed.length),
      logged: parsed.map((r) => (r.key && shared.includes(r.key as MeasureKey) && r.value ? `${r.label} ${r.value}` : r.label ?? "")).filter(Boolean),
      advice: pedro.filter((r) => r.text && !r.text.trim().endsWith("?")).map((r) => r.text!).slice(-3),
      escalation: rows.some((r) => r.escalation),
    });
  }
  return out;
}

/* What the person did over the last 3 sols, from their own log, rewritten in the third person.
   Journal entries appear as "wrote a journal entry", never their content or observations. */
function activityLog(id: string, sol: number, shared: MeasureKey[]) {
  const out: Array<{ sol: number; min: number; sev: string; text: string }> = [];
  for (let t = sol; t > sol - 3 && t > 0; t--) {
    events(id, t).forEach((e) => {
      if (e.type === "obs") return;
      if (e.type === "journal") { out.push({ sol: t, min: e.min, sev: "info", text: "Wrote a journal entry." }); return; }
      if (e.type === "tap") { out.push({ sol: t, min: e.min, sev: "info", text: shared.includes("rt") ? e.text.replace(/^Your/, "Their") : "Did a reaction test." }); return; }
      if (e.type === "flag" && e.key && !shared.includes(e.key)) {
        if (e.sev === "act") out.push({ sol: t, min: e.min, sev: "act", text: `An unshared measure (${MKEY[e.key].name}) reached Act.` });
        return;
      }
      out.push({ sol: t, min: e.min, sev: e.sev, text: e.text.replace(/^You /, "").replace(/\byour\b/g, "their").replace(/\bYour\b/g, "Their").replace(/^\w/, (m) => m.toUpperCase()) });
    });
  }
  return out.sort((a, b) => b.sol - a.sol || b.min - a.min);
}

/* Reference ranges for healthy adults at rest on Earth (general guidance, not a diagnosis):
   resting heart rate 60–100 bpm (AHA; fit adults often 40–60), HRV (RMSSD) roughly 20–100 ms and very
   personal, blood oxygen 95–100%, wrist skin temperature about 32–35 °C, breathing 12–20 a minute,
   sleep 7–9 h for adults (AASM/CDC), simple visual reaction time about 200–300 ms. */
type Ref = { key: string; label: string; unit: string; digits: number; lo: number; hi: number; min: number; max: number; note: string };
const EARTH: Ref[] = [
  { key: "rhr", label: "Resting heart rate", unit: "bpm", digits: 0, lo: 60, hi: 100, min: 35, max: 110, note: "Fit adults and astronauts often sit at 40–60, below the range without concern." },
  { key: "hrv", label: "Heart rate variability", unit: "ms", digits: 0, lo: 20, hi: 100, min: 0, max: 120, note: "Very personal and falls with age; their own normal matters more." },
  { key: "spo2", label: "Blood oxygen", unit: "%", digits: 0, lo: 95, hi: 100, min: 86, max: 100, note: "Below 95% is worth a check; below 90% needs attention." },
  { key: "temp", label: "Skin temperature", unit: "°C", digits: 1, lo: 32, hi: 35, min: 30, max: 37, note: "Wrist skin, not core (about 37 °C). A rise of 0.5 °C over their normal can come before a fever." },
  { key: "resp", label: "Breathing rate", unit: "/min", digits: 1, lo: 12, hi: 20, min: 8, max: 26, note: "Higher CO₂ in a closed habitat can raise it for the whole crew." },
  { key: "sleep", label: "Sleep", unit: "h", digits: 1, lo: 7, hi: 9, min: 4, max: 11, note: "Adults need 7–9 h. Spaceflight sleep averages about 6 h." },
  { key: "rt", label: "Reaction time", unit: "ms", digits: 0, lo: 200, hi: 300, min: 150, max: 420, note: "Simple tap test. Slower than their own normal is the useful signal." },
];
function earthRows(id: string, sol: number, shared: MeasureKey[], vs: ReturnType<typeof vitals>) {
  const d = day(id, sol);
  return EARTH.map((r) => {
    const v = vs.find((x) => x.key === r.key);
    if (v) return { r, value: v.value as number | null, normal: v.normal as number | null, hidden: false };
    const k = r.key as MeasureKey, hidden = !shared.includes(k);
    const st = mstatus(id, k, sol);
    return { r, value: hidden ? null : r.key === "sleep" ? d?.sleep ?? null : d?.rt ?? null, normal: hidden ? null : st.base?.med ?? null, hidden };
  });
}
function EarthCompare({ id, sol, first, shared, vs }: { id: string; sol: number; first: string; shared: MeasureKey[]; vs: ReturnType<typeof vitals> }) {
  const rows = earthRows(id, sol, shared, vs);
  const pos = (r: Ref, x: number) => `${Math.min(100, Math.max(0, ((x - r.min) / (r.max - r.min)) * 100))}%`;
  const inN = rows.filter((x) => x.value != null && x.value >= x.r.lo && x.value <= x.r.hi).length, nVal = rows.filter((x) => x.value != null).length;
  return (
    <section className="sec sec--full">
      <div className="sec__main">
        <h2 className="sec-t">{first} vs a typical adult on Earth <span className="tools small t2"><Num>{inN}</Num> of <Num>{nVal}</Num> inside the Earth range · reference only, not a diagnosis</span></h2>
        <div className="ec">
          {rows.map(({ r, value, normal, hidden }) => {
            const where = value == null ? null : value < r.lo ? "below" : value > r.hi ? "above" : "in";
            return (
              <div key={r.key} className="ec__row">
                <div className="ec__l"><b>{r.label}</b><span className="small t2">Earth {r.lo}–{r.hi} {r.unit}</span></div>
                <div className="ec__bar" aria-hidden="true">
                  <span className="ec__band" style={{ left: pos(r, r.lo), width: `calc(${pos(r, r.hi)} - ${pos(r, r.lo)})` }} />
                  {normal != null ? <span className="ec__norm" style={{ left: pos(r, normal) }} title="Their own normal" /> : null}
                  {value != null ? <span className={`ec__dot ec__dot--${where}`} style={{ left: pos(r, value) }} /> : null}
                </div>
                <div className="ec__v">
                  {hidden ? <span className="small t2">Not shared</span> : value == null ? <span className="small t2">No reading</span> : <>
                    <b className="num">{value.toFixed(r.digits)} {r.unit}</b>
                    <span className={`small ec__w ec__w--${where}`}>{where === "in" ? "Inside Earth range" : where === "below" ? "Below Earth range" : "Above Earth range"}</span>
                  </>}
                </div>
                <p className="ec__n small t2">{r.note}{normal != null ? ` Their own normal: ${normal.toFixed(r.digits)} ${r.unit}.` : ""}</p>
              </div>
            );
          })}
        </div>
        <p className="small t2 mt2">Shaded: typical range for healthy adults at rest on Earth. Dot: {first}&apos;s latest value. Tick: {first}&apos;s own normal. Mood, workload and teamwork are self-ratings with no Earth norm, so they are only compared with their own normal above and below.</p>
      </div>
    </section>
  );
}

/* ---------- Download PDF: a clean, print-styled report printed from a hidden frame ----------
   No PDF library: the browser's print dialog saves it ("Save as PDF"), and the frame's title becomes
   the default file name. Same privacy rules as the screen: values only for shared measures, the
   conversation as a summary, never the journal. */
const esc_ = (t: string) => t.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]!));
const VWORD = { normal: "Stable", watch: "Watch", act: "Urgent" } as const;
function printCrewReport({ c, sol, vs, talk, activity, esc, ci, missed7, shared }: {
  c: (typeof CREW)[number]; sol: number; vs: ReturnType<typeof vitals>; talk: TalkDay[];
  activity: ReturnType<typeof activityLog>; esc: ReturnType<typeof escalations>; ci: ReturnType<typeof personCheckins>;
  missed7: number; shared: MeasureKey[];
}) {
  const first = c.full.split(" ")[0];
  const title = `Crew status – ${c.full} – Sol ${sol}`;
  const row = (cells: string[], th = false) => `<tr>${cells.map((x) => (th ? `<th>${x}</th>` : `<td>${x}</td>`)).join("")}</tr>`;
  const tag = (state: string, word: string) => `<span class="tag tag--${state}">${esc_(word)}</span>`;

  const vitalsT = vs.map((v) => row([esc_(v.label), `<b>${esc_(fmtVital(v, v.value))}</b>`, esc_(fmtVital(v, v.normal)), esc_(fmtVitalDelta(v)), tag(v.state, VWORD[v.state])])).join("");
  const measuresT = MEASURES.map((m) => {
    const st = mstatus(c.id, m.key, sol), on = shared.includes(m.key);
    if (!on) return row([esc_(m.name), "Not shared", "—", "—", st.state === "act" ? tag("act", "Act") : "—"]);
    return row([esc_(m.name), `<b>${esc_(fmt(m.key, st.value))}</b>`, esc_(fmtBase(m.key, st.base)), esc_(st.delta == null ? "—" : fmtDelta(m.key, st.delta)), tag(st.state, st.state === "act" ? "Act" : st.state === "watch" ? "Watch" : st.state === "normal" ? "Normal" : "—")]);
  }).join("");
  const earthT = earthRows(c.id, sol, shared, vs).map(({ r, value, normal, hidden }) => {
    const where = value == null ? null : value < r.lo ? "Below" : value > r.hi ? "Above" : "Inside";
    return row([esc_(r.label), `${r.lo}–${r.hi} ${esc_(r.unit)}`, hidden ? "Not shared" : value == null ? "—" : `<b>${value.toFixed(r.digits)} ${esc_(r.unit)}</b>`,
      normal == null ? "—" : `${normal.toFixed(r.digits)} ${esc_(r.unit)}`, where ? tag(where === "Inside" ? "normal" : "watch", where) : "—"]);
  }).join("");
  const talkL = talk.map((t) => `<li><b>Sol ${t.sol}${t.sol === P ? " (today)" : ""}</b> · ${t.said} message${t.said === 1 ? "" : "s"} from ${esc_(first)}, ${t.replies} from Pedro${t.escalation ? ` · ${tag("act", "Emergency notice")}` : ""}<ul>
    ${t.logged.length ? `<li>Logged through Pedro: ${esc_(t.logged.join(" · "))}</li>` : ""}
    ${t.asked ? `<li>Talked beyond the check-in: ${t.asked} time${t.asked === 1 ? "" : "s"}</li>` : ""}
    ${t.advice.map((a) => `<li>Pedro said: ${esc_(a)}</li>`).join("")}</ul></li>`).join("");
  const actL = activity.map((a) => `<li><span class="mono">Sol ${a.sol} ${hm(a.min)}</span> ${esc_(a.text)}</li>`).join("");
  const escL = esc.length ? esc.map((e) => `<li>${tag("act", "Act")} ${e.kind === "companion" ? `Sol ${e.sol} ${hm(e.min)} · ` : ""}${esc_(escalationText(e))}</li>`).join("") : "<li>No Act status and no emergency notice in the last 14 sols.</li>";

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc_(title)}</title><style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 10.5pt/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #14171c; }
    header { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; padding-bottom: 8px; border-bottom: 2px solid #14171c; }
    h1 { margin: 0; font-size: 18pt; } .sub { color: #555; font-size: 9.5pt; }
    h2 { margin: 16px 0 6px; font-size: 12pt; break-after: avoid; }
    section { break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #d9dde3; vertical-align: top; }
    th { color: #555; font-weight: 600; background: #f3f5f7; }
    ul { margin: 0; padding-left: 18px; } li { margin: 2px 0; }
    .tag { display: inline-block; padding: 0 6px; border-radius: 3px; font-size: 8.5pt; font-weight: 600; border: 1px solid; }
    .tag--normal { color: #1d6b2f; border-color: #1d6b2f; } .tag--watch { color: #8a5a00; border-color: #8a5a00; } .tag--act { color: #a3221a; border-color: #a3221a; }
    .tag--pending, .tag--nobase { color: #555; border-color: #999; }
    .mono { font-family: ui-monospace, Consolas, monospace; color: #555; margin-right: 6px; }
    .note { color: #555; font-size: 8.5pt; margin-top: 4px; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    footer { margin-top: 18px; padding-top: 6px; border-top: 1px solid #d9dde3; color: #666; font-size: 8pt; }
  </style></head><body>
    <header><div><h1>${esc_(c.full)}</h1><div class="sub">${esc_(c.role)} · ${esc_(c.code)} · Crew status, Sol ${sol}</div></div>
      <div class="sub">${esc_(MISSION.name)} · ${esc_(MISSION.site)}<br>Shares ${shared.length} of ${MEASURES.length} measures with ground</div></header>
    <section><h2>Escalations</h2><ul>${escL}</ul></section>
    <section><h2>Wearable · last night</h2><table>${row(["Vital", "Last night", "Their normal", "Change", "Status"], true)}${vitalsT}</table></section>
    <section><h2>Measures against their own normal</h2><table>${row(["Measure", "Latest", "Their normal", "Change", "Status"], true)}${measuresT}</table>
      <div class="note">Their normal is the median of their previous 14 sols. Watch is 2+ days outside it, Act 5+.</div></section>
    <section><h2>${esc_(first)} vs a typical adult on Earth</h2><table>${row(["Measure", "Earth range", esc_(first), "Their normal", "Where"], true)}${earthT}</table>
      <div class="note">Typical ranges for healthy adults at rest on Earth. Reference only, not a diagnosis.</div></section>
    <div class="grid2">
      <section><h2>Conversations with Pedro · last 3 sols</h2>${talk.length ? `<ul>${talkL}</ul>` : "<p>No conversations.</p>"}
        <div class="note">A summary built from the conversation; ${esc_(first)}'s own words are not included.</div></section>
      <section><h2>What they did · last 3 sols</h2><ul>${actL || "<li>No activity logged.</li>"}</ul>
        <h2>Check-ins</h2><p>${ci.done} of ${ci.of} in the last 14 sols · ${missed7} missed in the last 7.</p></section>
    </div>
    <footer>Generated on Ground for Sol ${sol}. Simulated data. Journals stay on board and are never included.</footer>
  </body></html>`;

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open(); doc.write(html); doc.close();
  const prevTitle = document.title;
  document.title = title; // some browsers name the PDF after the parent page
  const done = () => { document.title = prevTitle; window.setTimeout(() => frame.remove(), 500); };
  frame.contentWindow!.addEventListener("afterprint", done, { once: true });
  window.setTimeout(() => { frame.contentWindow!.focus(); frame.contentWindow!.print(); window.setTimeout(done, 60000); }, 100);
}

/* The same crew status, in a modal over the current page (used from Pedro reports).
   No close() in cleanup: React dev mode runs effects twice and that would fire onClose straight away. */
export function CrewStatusModal({ id, onClose }: { id: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="mmodal gpm" aria-labelledby="gpm-t" onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <GroundPerson personId={id} onClose={onClose} />
    </dialog>
  );
}

/* Ground, one astronaut: what that person shares, in full; what they do not share, by name only.
   Escalations reach Earth by name either way. Journal and companion conversation never appear. */
export function GroundPerson({ personId, onClose }: { personId?: string; onClose?: () => void } = {}) {
  const params = useParams<{ id?: string }>();
  const id = personId ?? params?.id;
  const { s } = useConsole();
  const c = CREW.find((x) => x.id === id);
  const row = useMemo(() => { void s.rev; return c ? groundRows(s.sol, s.shares).find((r) => r.id === c.id) ?? null : null; }, [c, s.sol, s.shares, s.rev]);
  const esc = useMemo(() => { void s.rev; return c ? escalations(s.sol, s.shares, s.convo).filter((e) => e.id === c.id) : []; }, [c, s.sol, s.shares, s.convo, s.rev]);
  const vs = useMemo(() => (c ? vitals(c.id, s.sol) : []), [c, s.sol]);
  const talk = useMemo(() => (c ? talkSummary(c.id, s.sol, s.convo[c.id], s.shares[c.id] || []) : []), [c, s.sol, s.convo, s.shares]);
  const activity = useMemo(() => (c ? activityLog(c.id, s.sol, s.shares[c.id] || []) : []), [c, s.sol, s.shares]);
  const vUrgent = vs.filter((v) => v.state === "act").length, vOff = vs.filter((v) => v.state !== "normal").length;
  const vWorst = vUrgent ? "act" : vOff ? "watch" : "normal";

  if (!c || !row) {
    return (
      <>
        <div className="pbar"><h1 className="pbar__t">Crew member not found</h1></div>
        <p className="pnote"><Link className="ta" href={ROUTE.ground}>Back to Dashboard</Link></p>
      </>
    );
  }
  const shared = MEASURES.filter((m) => (s.shares[c.id] || []).includes(m.key));
  const unshared = MEASURES.filter((m) => !(s.shares[c.id] || []).includes(m.key));
  const ci = personCheckins(c.id, s.sol);

  return (
    <>
      {onClose ? null : <ReplayNote />}
      <div className={`pbar${onClose ? " gpm__bar" : ""}`}>
        <h1 className="pbar__t" id={onClose ? "gpm-t" : undefined}>{c.full} · Sol <Num>{s.sol}</Num></h1>
        {onClose
          ? <span className="gpm__tools">
              <button type="button" className="btn-primary btn-sm" onClick={() => printCrewReport({
                c, sol: s.sol, vs, talk, activity, esc, ci, missed7: row.missed7,
                shared: s.shares[c.id] || [],
              })}>Download PDF</button>
              <button type="button" className="mmodal__x" aria-label="Close crew status" onClick={onClose}>×</button>
            </span>
          : <Link className="ta" href={ROUTE.ground}><Icon name="back" /> Dashboard</Link>}
      </div>
      <p className="pnote">{c.role} · {c.code}. Shares <Num>{shared.length}</Num> of <Num>{MEASURES.length}</Num> measures with ground. Wearable vitals downlink in full. Conversations with Pedro reach Earth as a summary, never word for word; journals stay on board. Simulated data.</p>

      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Wearable · last night <span className={`tools small gcard__sum gcard__sum--${vWorst}`}>{vUrgent ? `${vUrgent} urgent${vOff > vUrgent ? `, ${vOff - vUrgent} watch` : ""}` : vOff ? `${vOff} on watch` : "All stable"}</span></h2>
          <VitalStrip vs={vs} first={c.full.split(" ")[0]} className="gp-vit" />

          <h2 className="sec-t mt4">Conversations with Pedro <span className="tools small t2">summary, last 3 sols</span></h2>
          {talk.length ? (
            <ul className="gp-talk">
              {talk.map((t) => (
                <li key={t.sol} className="gp-talk__d">
                  <div className="gp-talk__h">
                    <b>Sol <Num>{t.sol}</Num>{t.sol === P ? " · Today" : ""}</b>
                    <span className="small t2"><Num>{t.said}</Num> message{t.said === 1 ? "" : "s"} from {c.full.split(" ")[0]} · <Num>{t.replies}</Num> from Pedro{t.first != null ? <> · from <Num>{hm(t.first)}</Num></> : null}</span>
                    {t.escalation ? <StatusWord state="act">Emergency notice</StatusWord> : null}
                  </div>
                  <ul className="gp-talk__pts small">
                    {t.logged.length ? <li><span className="t2">Logged through Pedro:</span> {t.logged.join(" · ")}</li> : null}
                    {t.asked ? <li><span className="t2">Talked beyond the check-in:</span> <Num>{t.asked}</Num> time{t.asked === 1 ? "" : "s"}</li> : null}
                    {t.advice.map((a, i) => <li key={i}><span className="t2">Pedro said:</span> {a}</li>)}
                    {!t.logged.length && !t.asked && !t.advice.length ? <li className="t2">Only the morning prompt; no reply.</li> : null}
                  </ul>
                </li>
              ))}
            </ul>
          ) : <p className="t2">No conversations with Pedro in the last 3 sols.</p>}
        </div>
        <aside className="sec__margin">
          <ChangelogTimeline fill className="crew__tl ground__tl gp-act" title="What they did" subtitle={`Sol ${Math.max(1, s.sol - 2)}–${s.sol} · newest first`} categories={ACT_CATS} visibleEntries={8}
            empty="No activity logged."
            entries={activity.map((e, i): TimelineEntry => ({
              id: `${e.sol}-${e.min}-${i}`,
              label: hm(e.min),
              group: `Sol ${e.sol}${e.sol === P ? " · Today" : ""}`,
              category: ACT_CATS[e.sev] ? e.sev : "info",
              title: e.text,
              summary: <>Sol <Num>{e.sol}</Num> at <Num>{hm(e.min)}</Num>: {e.text}</>,
            }))} />
        </aside>
      </section>

      <EarthCompare id={c.id} sol={s.sol} first={c.full.split(" ")[0]} shared={s.shares[c.id] || []} vs={vs} />

      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Escalations <span className="tools small t2"><Num>{esc.length}</Num> open</span></h2>
          {esc.length ? (
            <ul className="prompts">
              {esc.map((e, i) => (
                <li key={i}><StatusMark state="act" /><span>{e.kind === "companion" ? <span className="t2">Sol <Num>{e.sol}</Num> <Num>{hm(e.min)}</Num> · </span> : null}{escalationText(e)}</span></li>
              ))}
            </ul>
          ) : <p className="ok-line"><StatusMark state="normal" /><span>No Act status and no emergency notice in the last 14 sols.</span></p>}
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">Check-ins</h2>
            <div className="srow"><span>Last 14 sols</span><span className="srow__v"><Num>{ci.done}</Num> of <Num>{ci.of}</Num></span></div>
            <div className="srow"><span>Missed in 7</span><span className="srow__v">{row.missed7 >= 2 ? <StatusWord state={row.missed7 >= 3 ? "act" : "watch"}><Num>{row.missed7}</Num></StatusWord> : <Num>{row.missed7}</Num>}</span></div>
            <div className="gp-ci" aria-label="Check-ins, last 14 sols">
              {ci.rows.map((r) => (
                <span key={r.sol} className={`gp-ci__c${r.done ? " is-done" : ""}`} tabIndex={0}
                  data-tip={`Sol ${r.sol}: ${r.done ? `checked in ${hm(r.min!)}` : "no check-in"}`} />
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Shared measures</h2>
          {shared.length ? (
            <div className="gp-ms">
              {shared.map((m) => {
                const st = mstatus(c.id, m.key, s.sol);
                return (
                  <div key={m.key} className="cb">
                    <span className="cb__t">{m.name} <span className="small t2 num">{m.code}</span></span>
                    <StatusRule state={st.state} note={st.base ? `${fmt(m.key, st.value)} · ${fmtDelta(m.key, st.delta)} vs normal ${fmtBase(m.key, st.base)}` : undefined} />
                    <Plot draw={(w) => trendSvg(c.id, s.sol, m.key, w)} label={`${m.name}, 28 sols, with their baseline band`} />
                    <p className="cb__reason">{reason(c.id, m.key, st).replace(/\byour\b/g, "their")}</p>
                  </div>
                );
              })}
            </div>
          ) : <p className="t2">{c.full.split(" ")[0]} shares no measures with ground. Only escalations reach Earth.</p>}
          {shared.length ? <Legend items={[["line", "Their value each sol"], ["band", "Their own normal"]]} /> : null}
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">Not shared</h2>
            {unshared.length
              ? <p className="t2">{listJoin(unshared.map((m) => MKEY[m.key].name))}. No values reach ground. If one of these reaches Act, ground is told that it did, by name, without the values.</p>
              : <p className="t2">Every measure is shared.</p>}
          </div>
        </aside>
      </section>
    </>
  );
}
