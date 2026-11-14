"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CREW, MEASURES, MISSION, RANK, hm, mealsWeek, teamStatus, type MeasureKey, type State } from "@/lib/console/data";
import { adherence, escalationText, escalations, groundAggregate, groundRows, lastDownlink } from "@/lib/console/ground";
import { teamSvg } from "@/lib/console/plots";
import type { GroundReport } from "@/lib/ground/report";
import { Legend, Num, StatusMark, StatusRule, StatusWord, WORD } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { Plot } from "./Plot";
import { ReplayNote } from "./Shell";

const AREAS: Array<[MeasureKey, string]> = [["sleep", "Sleep"], ["mood", "Mood"], ["load", "Workload"], ["team", "Teamwork"]];
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");
const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—");

type Summary = { text: string; verified: boolean; fallback: boolean } | { error: string } | null;

/* Ground: the flight surgeon on Earth reading the latest downlink.
   Per person, only shared measures; escalations by name; companion and brain as counts only. */
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
      setSummary({ error: "The summary service is not reachable. The numbers below are complete without it." });
    } finally { setBusy(false); setSummaryFor(s.sol); }
  };
  const stale = summary && summaryFor !== s.sol;

  return (
    <>
      <ReplayNote />
      <div className="pbar">
        <h1 className="pbar__t">Ground · Sol <Num>{s.sol}</Num></h1>
        <button type="button" className="btn-primary" onClick={draft} disabled={busy} aria-busy={busy}>
          {busy ? "Writing summary…" : "Draft downlink summary"}
        </button>
      </div>
      <div className="dl" role="group" aria-label="Downlink">
        <span><span className="t2">Last downlink</span> Sol <Num>{dl.sol}</Num> · <Num>{hm(dl.min)}</Num> {MISSION.tz}</span>
        <span><span className="t2">One-way light time</span> <Num>{dl.delay}</Num> min</span>
        <span><span className="t2">Next pass</span> {dl.next != null && atPresent ? <><Num>{hm(dl.next)}</Num> {MISSION.tz}</> : "—"}</span>
        <span className="t2">Delayed view. Nothing here is live.</span>
      </div>
      <p className="pnote">Flight surgeon view. Per person you see only the measures that person shares. Act statuses and companion emergency notices reach Earth by name, with no values or words. Journals and conversations never leave the hab. Simulated data.</p>

      {/* ---------- escalations ---------- */}
      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Escalations <span className="tools small t2"><Num>{esc.length}</Num> open</span></h2>
          {esc.length ? (
            <ul className="prompts">
              {esc.map((e, i) => (
                <li key={i}>
                  <StatusMark state="act" />
                  <span><Link className="ta" href={`/ground/${e.id}`}><b>{e.full}</b></Link> <span className="t2">· {e.code}</span>
                    {e.kind === "companion" ? <span className="t2"> · Sol <Num>{e.sol}</Num> <Num>{hm(e.min)}</Num></span> : null}
                    <br />{escalationText(e)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="ok-line"><StatusMark state="normal" /><span>No Act statuses and no emergency notices in the last 14 sols.</span></p>}
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">What reaches Earth</h2>
            <p className="t2">Each crew member chooses, per measure, what is shared. Two things override that, by name: a measure at Act (5+ days outside their own normal), and the companion giving the emergency notice. Ground gets that it happened, never the values or what was said.</p>
          </div>
        </aside>
      </section>

      {/* ---------- crew health ---------- */}
      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Crew health</h2>
          <div className="blocks">
            {areas.map(({ k, label, t }) => (
              <div key={k} className="cb">
                <span className="cb__t">{label}</span>
                {t.state === "pending" ? <StatusRule state="pending" word="Not enough shared" /> : <StatusRule state={t.state} />}
                {t.state === "pending" ? null : <Plot draw={(w) => teamSvg(k, s.sol, s.shares, w)} label="Team trend, 14 sols" />}
                <p className="cb__reason">{t.reason}</p>
              </div>
            ))}
          </div>
          <Legend items={[["line", "Team trend: average distance from each person's own normal"], ["band", "Within normal"]]} />
          <div className="mt6">
            <div className="srow"><span>Team status</span><span className="srow__v">{shown.length ? <><StatusWord state={worst} /> {agg.areas_needing_attention ? `${agg.areas_needing_attention} of ${shown.length} areas need attention` : "All areas within normal"}</> : "Not enough shared"}</span></div>
            <div className="srow"><span>Check-in adherence, 14 sols</span><span className="srow__v">{adh.rate == null ? "—" : <Num>{Math.round(adh.rate * 100)}%</Num>}</span></div>
            <div className="srow"><span>Checked in on Sol <Num>{s.sol}</Num></span><span className="srow__v"><Num>{agg.checked_in}</Num> of <Num>{CREW.length}</Num></span></div>
            <div className="srow"><span>Shared measures outside normal</span><span className="srow__v"><Num>{agg.shared_measures_outside_normal}</Num> of <Num>{agg.shared_measures}</Num></span></div>
            <div className="srow"><span>Shared meals</span><span className="srow__v">{mNow == null ? "Not enough shared" : <><Num>{mNow}</Num> this week · <Num>{mPrev}</Num> last week</>}</span></div>
          </div>
          <div className="adh" aria-label="Check-ins per sol, last 14 sols">
            {adh.rows.map((r) => (
              <span key={r.sol} className="adh__c" data-tip={`Sol ${r.sol}: ${r.done} of ${CREW.length} checked in`} tabIndex={0}>
                <i style={{ height: `${(r.done / CREW.length) * 100}%` }} />
                <span className="adh__l num">{r.sol % 2 === s.sol % 2 ? r.sol : ""}</span>
              </span>
            ))}
          </div>
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">Downlink summary</h2>
            {summary == null ? <p className="t2">Press “Draft downlink summary” for a short written read of the crew-level numbers. It is given aggregates only, and any number it invents is caught and replaced.</p>
              : "error" in summary ? <p className="t2">{summary.error}</p>
              : <>
                  <p>{summary.text}</p>
                  <p className="small t2 mt3">{summary.fallback ? "Written by code: the model's draft did not pass the number check, or the model is off." : summary.verified ? "Checked: every number appears in the crew-level data." : ""}{stale ? ` Written for Sol ${summaryFor}.` : ""}</p>
                </>}
          </div>
        </aside>
      </section>

      {/* ---------- per person, shared only ---------- */}
      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">By crew member <span className="tools small t2">shared measures only</span></h2>
          <div className="gtbl-wrap" tabIndex={0} role="region" aria-label="Shared measures by crew member">
            <table className="gtbl">
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
                    <th scope="row"><span className="gtbl__n"><Link className="ta" href={`/ground/${r.id}`}>{r.full}</Link></span><span className="small t2">{r.code} · shares <Num>{r.sharedN}</Num> of <Num>{MEASURES.length}</Num></span></th>
                    <td>{r.checkedIn ? "Done" : <span className="t2">Not yet</span>}{r.missed7 ? <span className="small t2 db"><Num>{r.missed7}</Num> missed in 7</span> : null}</td>
                    {r.cells.map((c) => (
                      <td key={c.key} className={c.shared ? undefined : "is-off"}>
                        {c.shared
                          ? <><StatusWord state={c.state} />{c.state === "pending" || c.state === "nobase" ? null : <span className="small t2 db num">{c.value}{c.delta ? ` · ${c.delta}` : ""}</span>}</>
                          : <span className="small t2">Not shared</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">Reading this table</h2>
            <p className="t2">Each status is against that person&apos;s own normal: the median of their previous 14 sols. {WORD.watch} is 2+ days outside it, {WORD.act} is 5+. The small line is the latest value and its change from their normal. People are never compared with each other.</p>
          </div>
        </aside>
      </section>

      {/* ---------- companion + brain ---------- */}
      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Companion activity <span className="tools small t2">counts only</span></h2>
          <CompanionBlock report={report} err={reportErr} />
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">Brain on board</h2>
            <BrainBlock report={report} err={reportErr} />
          </div>
        </aside>
      </section>
    </>
  );
}

function CompanionBlock({ report, err }: { report: GroundReport | null; err: boolean }) {
  if (err) return <p className="t2">The companion report could not be read.</p>;
  if (!report) return <p className="t2">Reading the companion log…</p>;
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
      <p className="small t2 mt3">From the companion turn log on this machine. Questions, answers and who asked are never sent.</p>
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
