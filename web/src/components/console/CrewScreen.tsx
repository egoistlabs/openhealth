"use client";

import { CREW, MKEY, P, RANK, crewEvents, day, hm, isOut, listJoin, mealsWeek, mstatus, teamStatus, type MeasureKey, type State } from "@/lib/console/data";
import { CLS, Icon, Num, StatusMark, StatusWord } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { FillPlot } from "./Plot";
import { teamThresholdSvg } from "@/lib/console/threshold";
import { ReplayNote } from "./Shell";
import { CrewPortrait } from "./CrewPortrait";
import { ColourKey } from "./ColourKey";
import { ChangelogTimeline, type TimelineCategory, type TimelineEntry } from "@/components/ui/changelog-timeline";

const LOG_CATS: Record<string, TimelineCategory> = {
  act: { label: "Act", mark: "■", color: "var(--c-act)" },
  watch: { label: "Watch", mark: "▲", color: "var(--c-watch)" },
  normal: { label: "OK", mark: "●", color: "var(--c-normal)" },
  info: { label: "Info", mark: "◆", color: "var(--c-info)" },
};

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
    <div className="home crew">
      <ReplayNote />
      <div className="pbar">
        <h1 className="pbar__t">Crew overview · Sol <Num>{s.sol}</Num></h1>
        <button type="button" className="btn-primary" aria-pressed={s.log} aria-controls="log" onClick={() => {
          if (s.log) { set({ log: false }); return; }
          set({ log: true, alerts: false, logScope: "crew" });
          if (window.innerWidth < 960) window.setTimeout(() => document.getElementById("log")?.scrollIntoView({ block: "start" }), 50);
        }}>{s.log ? "Close team log" : "Open team log"} <Icon name="arrow" /></button>
      </div>
      <p className="pnote">Aggregate-only. The roster shows who is on the mission, never anyone&apos;s health status or values. Each person chooses which measures are shared; a measure needs at least 2 sharing crew before it shows. Simulated data.</p>

      {/* Roster: identity only (photo, name, call sign, specialty). No per-person status, by design. */}
      <ul className="roster" aria-label="Mission crew">
        {CREW.map((p) => {
          const spec = p.role.includes(",") ? p.role.split(",")[1].trim() : p.role;
          const title = p.role.includes(",") ? p.role.split(",")[0].trim() : null;
          return (
            <li key={p.id} className={`rcard${p.id === s.me ? " is-me" : ""}`}>
              <div className="rcard__txt">
                <p className="rcard__name">{p.full}{p.id === s.me ? <span className="rcard__you">You</span> : null}</p>
                <p className="rcard__spec">{spec.charAt(0).toUpperCase() + spec.slice(1)}</p>
                <p className="rcard__meta"><span className="rcard__code">{p.code}</span>{title ? <span>{title}</span> : null}</p>
              </div>
              <div className="rcard__pic"><CrewPortrait person={p} className="rcard__img" bare /></div>
            </li>
          );
        })}
      </ul>

      <section className="sec">
        <div className="sec__main">
          {/* summary as one row of tiles */}
          <div className="ctiles">
            <div className="ctile"><span className="ctile__l">Team status</span>
              <span className="ctile__v">{shown.length ? <StatusWord state={worst} /> : "—"}</span>
              <span className="ctile__s">{shown.length ? (need ? `${need} of ${shown.length} areas need attention` : "All areas within normal") : "Not enough shared"}</span></div>
            <div className="ctile"><span className="ctile__l">Check-ins</span>
              <span className="ctile__v"><Num>{doneN}</Num>/<Num>{CREW.length}</Num></span>
              <span className="ctile__s">checked in {atPresent ? "today" : `on Sol ${s.sol}`}</span></div>
            <div className="ctile"><span className="ctile__l">Shared meals</span>
              <span className="ctile__v">{mNow == null ? "—" : <Num>{mNow}</Num>}</span>
              <span className="ctile__s">{mNow == null ? "Not enough shared" : <>this week · <Num>{mPrev}</Num> last week</>}</span></div>
            <div className="ctile"><span className="ctile__l">Engagement</span>
              <span className="ctile__v">{eng.state === "pending" ? "—" : <StatusWord state={isOut(eng) ? eng.state : "normal"} />}</span>
              <span className="ctile__s">{eng.state === "pending" ? "Not enough shared" : isOut(eng) ? "Lower for some sharing crew" : "Steady"}</span></div>
            <div className="ctile"><span className="ctile__l">Open flags</span>
              <span className="ctile__v"><Num>{flags}</Num></span>
              <span className="ctile__s">on shared measures</span></div>
          </div>

          <h2 className="sec-t mt4">Crew at a glance<ColourKey refLabel="Own normal band" /></h2>
          {/* same card look as Home's measure cards, but static: no drag grip, no stats modal */}
          <div className="mgrid mgrid--4" role="list" aria-label="Team areas">
            {blocks.map(({ k, label, t }) => (
              <div key={k} role="listitem" className={`mcard mcard--static mcard--${CLS[t.state] || t.state}`}>
                <div className="mcard__h">
                  <span className="mcard__n">{label}</span>
                  {t.state === "pending" ? <StatusWord state="pending">Not enough shared</StatusWord> : <StatusWord state={t.state} />}
                </div>
                <div className="mcard__btn">
                  <span className="mcard__row">
                    <span className="mcard__v">{t.state === "pending" ? "—" : <><Num>{t.out}</Num> /<Num>{t.n}</Num></>}</span>
                    <span className={`mcard__d${t.out ? " is-out" : ""}`}>{t.state === "pending" ? "" : "outside normal"}</span>
                  </span>
                  <span className="mcard__b">{t.reason}</span>
                  {t.state === "pending" ? null : <FillPlot className="mcard__th" draw={(w, h) => teamThresholdSvg(k, s.sol, s.shares, w, h)} />}
                  {t.state === "pending" ? null : <span className="mcard__ref">vs each person&apos;s own normal</span>}
                </div>
              </div>
            ))}
          </div>
          <p className="small t2 mt1">Line: the team&apos;s average distance from each sharing person&apos;s own normal over 14 sols. Green is the healthy side, amber the worse side.</p>

          <h2 className="sec-t mt4">Support prompts</h2>
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
            <h2 className="sec-t sec-t--rule">How team status works</h2>
            <p className="t2 small">Normal when sharing crew sit within their own normal. Watch when one or more are outside it. Act when anyone sharing has been outside it for 5+ days in a row.</p>
          </div>
          {/* same hover-to-read / click-to-pin timeline as Flags on Home */}
          <ChangelogTimeline fill className="crew__tl" title="Team log" subtitle={`Sol ${Math.max(1, s.sol - 2)}–${s.sol} · newest first`} categories={LOG_CATS} visibleEntries={8}
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
      </section>
    </div>
  );
}
