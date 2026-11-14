"use client";

import { CREW, MKEY, RANK, day, isOut, listJoin, mealsWeek, mstatus, teamStatus, type MeasureKey, type State } from "@/lib/console/data";
import { teamSvg } from "@/lib/console/plots";
import { CLS, Icon, Legend, Num, StatusMark, StatusRule, StatusWord } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { Plot } from "./Plot";
import { ReplayNote } from "./Shell";

const AREAS: Array<[MeasureKey, string]> = [["sleep", "Sleep"], ["mood", "Mood"], ["load", "Workload"], ["team", "Teamwork"]];

/* Crew: does the team need attention? Aggregates only: no names, no individual values (A6, B8, C7). */
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
  const prompts: Array<{ worst: State; keys: MeasureKey[] }> = [];
  CREW.forEach((p) => {
    const out = c.shared(p.id).filter((k) => isOut(mstatus(p.id, k, s.sol)));
    if (out.length) prompts.push({ worst: out.some((k) => mstatus(p.id, k, s.sol).state === "act") ? "act" : "watch", keys: out });
  });
  const verdict = need ? `${need} of ${shown.length} areas need attention.` : "The crew is within its normal.";
  const sub = prompts.length
    ? `Worth a quiet check-in: ${prompts.length === 1 ? "one crew member has" : `${prompts.length} crew members have`} shared readings outside their usual range for several days. Names are never shown here.`
    : "Nothing shared is outside anyone's usual range.";

  return (
    <>
      <ReplayNote />
      <div className="page">
        <section className={`hero hero--${CLS[worst]}`}>
          <p className="hero__eyebrow">Crew · Sol <Num>{s.sol}</Num></p>
          <h1 className="hero__h">{verdict}</h1>
          <p className="hero__p">{sub}</p>
          {prompts.length ? (
            <ul className="hero__list">
              {prompts.map((p, i) => <li key={i}><StatusMark state={p.worst} /><span>One person · {listJoin(p.keys.map((k) => MKEY[k].short))}</span></li>)}
            </ul>
          ) : null}
          <div className="hero__cta">
            <button type="button" className="btn-primary btn--lg" onClick={() => {
              set({ log: true, logScope: "crew" });
              if (window.innerWidth < 960) window.setTimeout(() => document.getElementById("log")?.scrollIntoView({ block: "start" }), 50);
            }}>Open team log <Icon name="arrow" /></button>
          </div>
        </section>

        <section className="block">
          <h2 className="block__h">By area</h2>
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
          <Legend items={[["line", "Team trend vs everyone's own normal"], ["band", "Within normal"]]} />
        </section>

        <section className="block">
          <h2 className="block__h">This week</h2>
          <div>
            <div className="srow"><span>Checked in</span><span className="srow__v"><Num>{doneN}</Num> of <Num>{CREW.length}</Num> {atPresent ? "today" : `on Sol ${s.sol}`}</span></div>
            <div className="srow"><span>Shared meals</span><span className="srow__v">{mNow == null ? "Not enough shared" : <><Num>{mNow}</Num> this week · <Num>{mPrev}</Num> last week</>}</span></div>
            <div className="srow"><span>Engagement</span><span className="srow__v">{eng.state === "pending" ? "Not enough shared" : isOut(eng) ? <><StatusWord state={eng.state} /> Lower than usual for some</> : <><StatusWord state="normal" /> Steady</>}</span></div>
            <div className="srow"><span>Open flags</span><span className="srow__v"><Num>{flags}</Num> on shared measures</span></div>
          </div>
        </section>

        <footer className="page__foot">
          <details className="more">
            <summary>What the crew screen can and can&apos;t see</summary>
            <p>Totals only: no names and no individual readings. Each person chooses what to share, and a measure only appears once at least 2 crew share it.</p>
            <p>An area reads Normal when sharing crew sit within their own normal, Watch when one or more are outside it, and Act when someone has been outside it for 5+ days or half the group is on watch.</p>
          </details>
        </footer>
      </div>
    </>
  );
}
