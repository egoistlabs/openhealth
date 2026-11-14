"use client";

import { CREW, MKEY, P, RANK, crewEvents, day, hm, isOut, listJoin, mealsWeek, mstatus, teamStatus, type MeasureKey, type State } from "@/lib/console/data";
import { teamSvg } from "@/lib/console/plots";
import { Icon, Legend, Num, StatusMark, StatusRule, StatusWord } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { Plot } from "./Plot";
import { ReplayNote } from "./Shell";

const AREAS: Array<[MeasureKey, string]> = [["sleep", "Sleep"], ["mood", "Mood"], ["load", "Workload"], ["team", "Teamwork"]];

/* Crew: does the team need attention? Aggregates only: no names, no individual values (A6, B8, C7).
   Console layout: main column (areas, summary, prompts) and margin column (how it works, team log). */
export function CrewScreen() {
  const c = useConsole();
  const { s, set, atPresent } = c;
  const blocks = AREAS.map(([k, label]) => ({ k, label, t: teamStatus(k, s.sol, s.shares) }));
  const shown = blocks.filter((b) => b.t.state !== "pending");
  const worst = shown.reduce<State>((w, b) => (RANK[b.t.state] > RANK[w] ? b.t.state : w), "normal");
  const need = shown.filter((b) => isOut(b.t)).length;
  const doneN = CREW.filter((p) => day(p.id, s.sol)?.checkin).length;
  const mNow = mealsWeek(s.shares, s.sol), mPrev = mealsWeek(s.shares, s.sol - 7);
  const eng = teamStatus("engage", s.sol, s.shares);
  let flags = 0;
  CREW.forEach((p) => c.shared(p.id).forEach((k) => { if (isOut(mstatus(p.id, k, s.sol))) flags++; }));
  // one anonymous prompt per person with shared readings outside their own normal
  const prompts: Array<{ worst: State; keys: MeasureKey[] }> = [];
  CREW.forEach((p) => {
    const out = c.shared(p.id).filter((k) => isOut(mstatus(p.id, k, s.sol)));
    if (out.length) prompts.push({ worst: out.some((k) => mstatus(p.id, k, s.sol).state === "act") ? "act" : "watch", keys: out });
  });
  const log: Array<{ sol: number; min: number; sev: string; text: string }> = [];
  for (let t = s.sol; t > s.sol - 3 && t > 0; t--) crewEvents(t, s.shares).slice().reverse().forEach((e) => log.push(e));

  return (
    <>
      <ReplayNote />
      <div className="pbar">
        <h1 className="pbar__t">Crew overview · Sol <Num>{s.sol}</Num></h1>
        <button type="button" className="btn-primary" onClick={() => {
          set({ log: true, logScope: "crew" });
          if (window.innerWidth < 960) window.setTimeout(() => document.getElementById("log")?.scrollIntoView({ block: "start" }), 50);
        }}>Open team log <Icon name="arrow" /></button>
      </div>
      <p className="pnote">Aggregate-only. No names and no individual values appear on this screen. Each person chooses which measures are shared; a measure needs at least 2 sharing crew before it shows. Simulated data.</p>

      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Crew at a glance</h2>
          <div className="blocks">
            {blocks.map(({ k, label, t }) => (
              <div key={k} className="cb">
                <span className="cb__t">{label}</span>
                {t.state === "pending" ? <StatusRule state="pending" word="Not enough shared" /> : <StatusRule state={t.state} />}
                {t.state === "pending" ? null : <Plot draw={(w) => teamSvg(k, s.sol, s.shares, w)} label="Team trend, 14 sols" />}
                <p className="cb__reason">{t.reason}</p>
              </div>
            ))}
          </div>
          <Legend items={[["line", "Team trend: average distance from each person's own normal"], ["band", "Within normal"]]} />
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">How team status works</h2>
            <p className="t2">Normal when sharing crew sit within their own normal. Watch when one or more are outside it. Act when someone has been outside it for 5+ days or half the group is on watch.</p>
          </div>
        </aside>
      </section>

      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Summary</h2>
          <div>
            <div className="srow"><span>Team status</span><span className="srow__v">{shown.length ? <><StatusWord state={worst} /> {need ? `${need} of ${shown.length} areas need attention` : "All areas within normal"}</> : "Not enough shared"}</span></div>
            <div className="srow"><span>Check-in participation</span><span className="srow__v"><Num>{doneN}</Num> of <Num>{CREW.length}</Num> checked in {atPresent ? "today" : `on Sol ${s.sol}`}</span></div>
            <div className="srow"><span>Shared meals</span><span className="srow__v">{mNow == null ? "Not enough shared" : <><Num>{mNow}</Num> this week · <Num>{mPrev}</Num> last week</>}</span></div>
            <div className="srow"><span>Engagement</span><span className="srow__v">{eng.state === "pending" ? "Not enough shared" : isOut(eng) ? <><StatusWord state={eng.state} /> Lower than usual for some sharing crew</> : <><StatusWord state="normal" /> Steady</>}</span></div>
            <div className="srow"><span>Open flags</span><span className="srow__v"><Num>{flags}</Num> on shared measures</span></div>
          </div>
          <h2 className="sec-t mt6">Support prompts</h2>
          {prompts.length ? (
            <ul className="prompts">
              {prompts.map((p, i) => (
                <li key={i}><StatusMark state={p.worst} /><span>Worth a check-in: one crew member&apos;s shared {listJoin(p.keys.map((k) => MKEY[k].short))} {p.keys.length === 1 ? "has" : "have"} sat outside their usual range for several days.</span></li>
              ))}
            </ul>
          ) : <p className="ok-line"><StatusMark state="normal" /><span>Nothing shared is outside anyone&apos;s usual range.</span></p>}
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">Team log</h2>
            {log.length ? log.map((e, i) => (
              <div key={i} style={{ display: "contents" }}>
                {i === 0 || log[i - 1].sol !== e.sol ? <div className="lr-sol"><span>Sol <Num>{e.sol}</Num>{e.sol === P ? " · Today" : ""}</span></div> : null}
                <div className="list-row"><span className="list-row__t">{hm(e.min)}</span><span><StatusMark state={e.sev} /> {e.text}</span><span /></div>
              </div>
            )) : <p className="t2">No team events yet.</p>}
          </div>
        </aside>
      </section>
    </>
  );
}
