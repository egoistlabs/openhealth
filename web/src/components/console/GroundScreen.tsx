"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CREW, MEASURES, MISSION, P, RANK, crewEvents, hm, mealsWeek, teamStatus, type MeasureKey, type State } from "@/lib/console/data";
import { adherence, escalationText, escalations, groundAggregate, groundRows, lastDownlink } from "@/lib/console/ground";
import { teamThresholdSvg } from "@/lib/console/threshold";
import type { GroundReport } from "@/lib/ground/report";
import { Num, StatusMark, StatusWord, WORD } from "@/components/ui";
import { ChangelogTimeline, type TimelineCategory, type TimelineEntry } from "@/components/ui/changelog-timeline";
import { useConsole } from "./ConsoleProvider";
import { FillPlot } from "./Plot";
import { ReplayNote } from "./Shell";
import { GroundCrewCards } from "./GroundCrewCards";

const LOG_CATS: Record<string, TimelineCategory> = {
  act: { label: "Act", mark: "■", color: "var(--c-act)" },
  watch: { label: "Watch", mark: "▲", color: "var(--c-watch)" },
  normal: { label: "OK", mark: "●", color: "var(--c-normal)" },
  info: { label: "Info", mark: "◆", color: "var(--c-info)" },
};
const AREAS: Array<[MeasureKey, string]> = [["sleep", "Sleep"], ["mood", "Mood"], ["load", "Workload"], ["team", "Teamwork"]];
const TABS = [["health", "Crew health"], ["people", "By crew member"], ["companion", "Companion"], ["brain", "Brain"]] as const;
type Tab = (typeof TABS)[number][0];
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—");
const REACHES = "Each crew member chooses, per measure, what is shared. Two things override that, by name: a measure at Act (5+ days outside their own normal), and Pedro giving the emergency notice. Wearable vitals downlink per person.";

type Summary = { text: string; verified: boolean; fallback: boolean } | { error: string } | null;

/* Ground dashboard: the flight surgeon on Earth reading the latest downlink, on one screen.
   Crew cards with vitals on top; then escalations + team status | tabbed detail | summary + team log. */
export function GroundScreen() {
  const { s, clockMin, atPresent } = useConsole();
  const dl = lastDownlink(s.sol, clockMin);
  const rows = useMemo(() => { void s.rev; return groundRows(s.sol, s.shares); }, [s.sol, s.shares, s.rev]);
  const esc = useMemo(() => { void s.rev; return escalations(s.sol, s.shares, s.convo); }, [s.sol, s.shares, s.convo, s.rev]);
  const agg = useMemo(() => { void s.rev; return groundAggregate(s.sol, s.shares); }, [s.sol, s.shares, s.rev]);
  const adh = adherence(s.sol);
  const areas = AREAS.map(([k, label]) => ({ k, label, t: teamStatus(k, s.sol, s.shares) }));
  const shown = areas.filter((a) => a.t.state !== "pending");
  const worst = shown.reduce<State>((w, a) => (RANK[a.t.state] > RANK[w] ? a.t.state : w), "normal");
  const mNow = mealsWeek(s.shares, s.sol), mPrev = mealsWeek(s.shares, s.sol - 7);
  const log: Array<{ sol: number; min: number; sev: string; text: string }> = [];
  for (let t = s.sol; t > s.sol - 3 && t > 0; t--) crewEvents(t, s.shares).slice().reverse().forEach((e) => log.push(e));
  const [tab, setTab] = useState<Tab>("health");

  const [report, setReport] = useState<GroundReport | null>(null);
  const [reportErr, setReportErr] = useState(false);
  useEffect(() => {
    let off = false;
    fetch("/api/ground", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: GroundReport) => { if (!off) setReport(j); })
      .catch(() => { if (!off) setReportErr(true); });
    return () => { off = true; };
  }, []);

  const [summary, setSummary] = useState<Summary>(null);
  const [busy, setBusy] = useState(false);
  const [summaryFor, setSummaryFor] = useState<number | null>(null);
  const draft = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/ai/crew-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crew: agg }) });
      const j = await r.json();
      setSummary(r.ok ? { text: j.summary, verified: !!j.verified, fallback: !!j.fallback } : { error: j.error ?? "The summary could not be written." });
    } catch {
      setSummary({ error: "The summary service is not reachable. The numbers on this page are complete without it." });
    } finally { setBusy(false); setSummaryFor(s.sol); }
  };
  const stale = summary && summaryFor !== s.sol;

  return (
    <div className="gdash">
      <ReplayNote />
      <div className="gdash__bar">
        <h1 className="gdash__t">Dashboard · Sol <Num>{s.sol}</Num></h1>
        <span className="gdash__dl" role="group" aria-label="Downlink">
          <span><span className="t2">Last downlink</span> Sol <Num>{dl.sol}</Num> · <Num>{hm(dl.min)}</Num> {MISSION.tz}</span>
          <span><span className="t2">Light time</span> <Num>{dl.delay}</Num> min</span>
          <span><span className="t2">Next pass</span> {dl.next != null && atPresent ? <><Num>{hm(dl.next)}</Num> {MISSION.tz}</> : "—"}</span>
          <span className="t2" tabIndex={0} data-tip={`Flight surgeon view. Delayed, nothing here is live.\n\n${REACHES}\n\nSimulated data.`}>Delayed view · What reaches Earth ⓘ</span>
        </span>
        <button type="button" className="btn-primary btn-sm" onClick={draft} disabled={busy} aria-busy={busy}>
          {busy ? "Writing summary…" : "Draft downlink summary"}
        </button>
      </div>

      <GroundCrewCards sol={s.sol} />

      <div className="gdash__grid">
        {/* ---------- left: escalations and team status ---------- */}
        <section className="gdash__col" aria-labelledby="g-esc">
          <h2 id="g-esc" className="gdash__h">Escalations <span className="small t2"><Num>{esc.length}</Num> open</span></h2>
          {esc.length ? (
            <ul className="prompts gdash__esc">
              {esc.map((e, i) => (
                <li key={i}>
                  <StatusMark state="act" />
                  <span><Link className="ta" href={`/ground/${e.id}`}><b>{e.full}</b></Link> <span className="t2">· {e.code}</span>
                    {e.kind === "companion" ? <span className="t2"> · Sol <Num>{e.sol}</Num> <Num>{hm(e.min)}</Num></span> : null}
                    <br /><span className="small">{escalationText(e)}</span></span>
                </li>
              ))}
            </ul>
          ) : <p className="ok-line"><StatusMark state="normal" /><span>No Act statuses or emergency notices in 14 sols.</span></p>}

          <h2 className="gdash__h mt3">Team status</h2>
          <div className="gdash__rows">
            <div className="srow"><span>Areas</span><span className="srow__v">{shown.length ? <><StatusWord state={worst} /> {agg.areas_needing_attention ? `${agg.areas_needing_attention} of ${shown.length} need attention` : "All within normal"}</> : "Not enough shared"}</span></div>
            <div className="srow"><span>Check-in adherence, 14 sols</span><span className="srow__v">{adh.rate == null ? "—" : <Num>{Math.round(adh.rate * 100)}%</Num>}</span></div>
            <div className="srow"><span>Checked in on Sol <Num>{s.sol}</Num></span><span className="srow__v"><Num>{agg.checked_in}</Num> of <Num>{CREW.length}</Num></span></div>
            <div className="srow"><span>Shared measures outside normal</span><span className="srow__v"><Num>{agg.shared_measures_outside_normal}</Num> of <Num>{agg.shared_measures}</Num></span></div>
            <div className="srow"><span>Shared meals</span><span className="srow__v">{mNow == null ? "—" : <><Num>{mNow}</Num> · <Num>{mPrev}</Num> last wk</>}</span></div>
          </div>
          {/* title sits right above the bars (both pushed to the bottom of the column together) */}
          <h3 className="gdash__h" style={{ marginTop: "auto", marginBottom: 2, paddingTop: 12 }}>
            Daily check-ins <span className="small t2">last 14 sols</span>
          </h3>
          <p className="small t2" style={{ margin: 0 }}>
            Bar height: how many of the <Num>{CREW.length}</Num> crew checked in that sol. A full bar is everyone. Hover a bar for the count.
          </p>
          <div className="adh gdash__adh" aria-label="Check-ins per sol, last 14 sols" style={{ marginTop: 6 }}>
            {adh.rows.map((r) => (
              <span key={r.sol} className="adh__c" data-tip={`Sol ${r.sol}: ${r.done} of ${CREW.length} checked in`} tabIndex={0}>
                <i style={{ height: `${(r.done / CREW.length) * 100}%` }} />
                <span className="adh__l num">{r.sol % 2 === s.sol % 2 ? r.sol : ""}</span>
              </span>
            ))}
          </div>
        </section>

        {/* ---------- middle: tabbed detail ---------- */}
        <section className="gdash__col gdash__mid" aria-label="Detail">
          <div className="gtabs" role="tablist" aria-label="Detail">
            {TABS.map(([k, label]) => (
              <button key={k} type="button" role="tab" id={`gt-${k}`} aria-selected={tab === k} aria-controls="gtab-panel"
                className={`gtabs__b${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          <div className="gtabs__p" id="gtab-panel" role="tabpanel" aria-labelledby={`gt-${tab}`}>
            {tab === "health" ? (
              <>
                <div className="gdash__blocks">
                  {areas.map(({ k, label, t }) => (
                    <div key={k} className={`gblk gblk--${t.state}`}>
                      <div className="gblk__h"><span className="gblk__t">{label}</span>{t.state === "pending" ? <span className="small t2">Not enough shared</span> : <StatusWord state={t.state} />}</div>
                      {t.state === "pending" ? <span className="gblk__plot" /> : <FillPlot className="gblk__plot" draw={(w, h) => teamThresholdSvg(k, s.sol, s.shares, w, h)} />}
                      <p className="small t2">{t.reason}</p>
                    </div>
                  ))}
                </div>
                <p className="small t2 mt2">Line: team average distance from each sharing person&apos;s own normal, 14 sols. Green is the healthy side, amber the worse side.</p>
              </>
            ) : tab === "people" ? (
              <>
                <div className="gtbl-wrap" tabIndex={0} role="region" aria-label="Shared measures by crew member">
                  <table className="gtbl gtbl--dense">
                    <thead>
                      <tr>
                        <th scope="col">Crew</th>
                        <th scope="col">Check-in</th>
                        {MEASURES.map((m) => <th key={m.key} scope="col" data-tip={m.tip}>{m.name.replace(" & stress", "")}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <th scope="row"><span className="gtbl__n"><Link className="ta" href={`/ground/${r.id}`}>{r.full}</Link></span><span className="small t2">{r.code} · shares <Num>{r.sharedN}</Num>/<Num>{MEASURES.length}</Num></span></th>
                          <td>{r.checkedIn ? "Done" : <span className="t2">Not yet</span>}</td>
                          {r.cells.map((c) => (
                            <td key={c.key} className={c.shared ? undefined : "is-off"}>
                              {c.shared
                                ? <span data-tip={c.state === "pending" || c.state === "nobase" ? undefined : `${c.value}${c.delta ? ` · ${c.delta}` : ""}`}><StatusWord state={c.state} /></span>
                                : <span className="small t2">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="small t2 mt2">Against each person&apos;s own normal (median of their previous 14 sols). {WORD.watch} is 2+ days outside it, {WORD.act} 5+. Hover a status for the value. — means not shared.</p>
              </>
            ) : tab === "companion" ? <CompanionBlock report={report} err={reportErr} />
              : <BrainBlock report={report} err={reportErr} />}
          </div>
        </section>

        {/* ---------- right: downlink summary + team log ---------- */}
        <aside className="gdash__col gdash__side" aria-label="Summary and team log">
          <div className="gdash__sum">
            <h2 className="gdash__h">Downlink summary</h2>
            {summary == null ? <p className="small t2">Press “Draft downlink summary” for a short written read of the crew-level numbers. Aggregates only; invented numbers are caught.</p>
              : "error" in summary ? <p className="small t2">{summary.error}</p>
              : <>
                  <p className="small">{summary.text}</p>
                  <p className="small t2 mt1">{summary.fallback ? "Written by code: the model's draft failed the number check, or the model is off." : summary.verified ? "Checked: every number appears in the crew-level data." : ""}{stale ? ` Written for Sol ${summaryFor}.` : ""}</p>
                </>}
          </div>
          {/* same hover-to-read / click-to-pin team log as the Crew screen */}
          <ChangelogTimeline fill className="crew__tl ground__tl" title="Team log" subtitle={`Sol ${Math.max(1, s.sol - 2)}–${s.sol} · newest first`} categories={LOG_CATS} visibleEntries={8}
            empty="No team events yet."
            entries={log.map((e, i): TimelineEntry => ({
              id: `${e.sol}-${e.min}-${i}`,
              label: hm(e.min),
              group: `Sol ${e.sol}${e.sol === P ? " · Today" : ""}`,
              category: LOG_CATS[e.sev] ? e.sev : "info",
              title: e.text,
              summary: <>Sol <Num>{e.sol}</Num> at <Num>{hm(e.min)}</Num>: {e.text}</>,
            }))} />
        </aside>
      </div>
    </div>
  );
}

function CompanionBlock({ report, err }: { report: GroundReport | null; err: boolean }) {
  if (err) return <p className="t2">The companion report could not be read.</p>;
  if (!report) return <p className="t2">Reading Pedro&apos;s log…</p>;
  const c = report.companion;
  if (!c) return <p className="t2">Turn logging is off on this machine, so there is nothing to count.</p>;
  if (!c.turns) return <p className="t2">No companion questions logged yet.</p>;
  return (
    <>
      <div>
        <div className="srow"><span>Questions asked</span><span className="srow__v"><Num>{c.turns}</Num> · <Num>{when(c.first)}</Num> to <Num>{when(c.last)}</Num> UTC</span></div>
        <div className="srow"><span>Answered</span><span className="srow__v"><Num>{c.answered}</Num> · <Num>{pct(c.answered, c.turns)}</Num></span></div>
        <div className="srow"><span>About the person&apos;s own numbers</span><span className="srow__v"><Num>{c.fromNumbers}</Num></span></div>
        <div className="srow"><span>“I don&apos;t have that on board”</span><span className="srow__v"><Num>{c.notOnBoard}</Num> · <Num>{pct(c.notOnBoard, c.turns)}</Num></span></div>
        <div className="srow"><span>Escalated to the emergency notice</span><span className="srow__v">{c.escalated ? <StatusWord state="act"><Num>{c.escalated}</Num></StatusWord> : <Num>0</Num>}</span></div>
        <div className="srow"><span>Failed or stopped</span><span className="srow__v"><Num>{c.failed}</Num></span></div>
        <div className="srow"><span>Model used</span><span className="srow__v"><Num>{c.modelCalled}</Num> of <Num>{c.turns}</Num> · median <Num>{c.medianMs == null ? "—" : `${(c.medianMs / 1000).toFixed(1)} s`}</Num></span></div>
      </div>
      {c.sources.length ? <>
        <h3 className="sec-t mt6 small">Most-cited brain files</h3>
        <ul className="gl">{c.sources.map((x) => <li key={x.id}><span className="num">{x.id}</span><span className="num t2">{x.n}</span></li>)}</ul>
      </> : null}
      {c.redFlags.length ? <>
        <h3 className="sec-t mt6 small">Red-flag categories matched</h3>
        <ul className="gl">{c.redFlags.map((x) => <li key={x.category}><span>{x.category}</span><span className="num t2">{x.n}</span></li>)}</ul>
      </> : null}
      <p className="small t2 mt3">From Pedro&apos;s turn log on this machine. Questions, answers and who asked are never sent.</p>
    </>
  );
}

function BrainBlock({ report, err }: { report: GroundReport | null; err: boolean }) {
  if (err) return <p className="t2">The brain status could not be read.</p>;
  if (!report) return <p className="t2">Reading…</p>;
  const b = report.brain;
  return (
    <>
      {b ? <>
        <p><span className="num">{b.label}</span>{b.released ? <span className="t2"> · released <Num>{b.released}</Num></span> : null}</p>
        {b.modified ? <p className="small"><StatusWord state="watch">Unreleased changes</StatusWord> <Num>{b.changed}</Num> file{b.changed === 1 ? "" : "s"} differ from the released version.</p> : null}
        {b.score ? <p className="small t2 mt3">Score at release: {b.score}</p> : null}
        {b.note ? <p className="small t2 mt3">{b.note}</p> : null}
      </> : <p className="t2">No brain folder found.</p>}
      <h3 className="sec-t mt6 small">Latest eval runs</h3>
      {report.evals.length ? report.evals.map((e) => (
        <div key={e.suite} className="ev">
          <span className="ev__t">{e.passed == null ? <StatusMark state="pending" /> : <StatusMark state={e.passed ? "normal" : "act"} />}{e.suite}{e.passed == null ? "" : e.passed ? " · passed" : " · below pass mark"}</span>
          <span className="small t2">{e.headline}</span>
          <span className="small t2 num">{when(e.ranAt)} UTC{e.model ? ` · ${e.model}` : ""}</span>
        </div>
      )) : <p className="t2">No eval runs found.</p>}
      <p className="small t2 mt3">What Earth checks before sending a new knowledge package.</p>
    </>
  );
}
