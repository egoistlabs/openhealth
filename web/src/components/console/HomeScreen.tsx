"use client";

import Link from "next/link";
import {
  KEYS, MEASURES, MKEY, P, checkinCount, crewById, fmt, fmtBase, fmtDelta, hasBaseline, isOut, listJoin, overall, reason, solDate,
  type Measure, type MeasureKey, type Status,
} from "@/lib/console/data";
import { railSvg, sparkSvg, trendSvg } from "@/lib/console/plots";
import { Icon, Legend, Num, StatusMark, StatusRule, StatusWord, Term, Toggle } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { FlagCard, FlagList, OkLine } from "./FlagCard";
import { Plot } from "./Plot";
import { ROUTE, ReplayNote } from "./Shell";

/* Home: me vs my baseline (A4, A5), in the console layout: a main column and a margin column.
   Main: who, overall status, sharing, the one primary button, then today's measures.
   Margin: what the screen is, how the baseline is set, and the open flags. */
export function HomeScreen() {
  const c = useConsole();
  const { s, set, atPresent } = c;
  const person = crewById(s.me), sh = c.shared(s.me), ready = hasBaseline(s.me, s.sol);
  const due = atPresent && !c.checkedToday();
  const worst = ready ? overall(s.me, s.sol) : "pending";
  const sts = MEASURES.map((m) => c.st(m.key)), within = sts.filter((x) => x.state === "normal").length;
  const flags = ready ? c.flagsFor() : [];
  const lead = flags[0];

  const primary = !atPresent
    ? <button type="button" className="btn-primary" onClick={() => set({ sol: P })}>Return to today <Icon name="arrow" /></button>
    : due
      ? <Link className="btn-primary" href={ROUTE.checkin}>Start daily check-in <Icon name="arrow" /></Link>
      : <Link className="btn-primary" href={ROUTE.companion}>Talk to Pedro <Icon name="arrow" /></Link>;

  return (
    <>
      <ReplayNote />
      <div className="pbar">
        <h1 className="pbar__t">Personal · me vs my baseline</h1>
        <span className="pbar__r">Sol <Num>{s.sol}</Num> · <Num>{solDate(s.sol)}</Num></span>
      </div>

      <section className="sec">
        <div className="sec__main">
          <div className="idn">
            <p className="idn__name">{person.full}</p>
            <p className="idn__meta">
              <span>{person.role}</span><span>Sol <Num>{s.sol}</Num></span>
              <span><Term k="baseline">Baseline</Term> window: <Num>14d</Num></span>
            </p>
            <div className="idn__status"><StatusRule state={worst} word={ready ? undefined : "Building baseline"} note="against your own normal only" /></div>
            <p className="idn__row">
              <span className="label">Sharing</span>
              <b>{sh.length ? `${sh.length} of 7 shared` : "Private"}</b>
              <span className="t2">{sh.length ? "As crew totals only." : "Nothing leaves this view."}</span>
              <button type="button" className="ta" onClick={() => set((p) => ({ shares: { ...p.shares, [p.me]: (p.shares[p.me] || []).length ? [] : KEYS.slice() } }))}>
                {sh.length ? "Make all private" : "Share aggregates with crew"}
              </button>
            </p>
            <p className="idn__row"><b>Simulated data</b><span className="t2">— prototype, not a medical device</span></p>
            <div className="idn__cta">{primary}</div>
          </div>
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">What this screen is</h2>
            <p className="t2">How you are doing against your own normal. It never compares you with other crew, ranks anyone, or uses percentiles.</p>
          </div>
        </aside>
      </section>

      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Today</h2>
          {!ready ? (
            <p className="lead">Building your baseline: <Num>{checkinCount(s.me, s.sol)}</Num> of 3 check-ins done. Flags start once it exists.</p>
          ) : <>
            <p className="lead today-sum">
              <Num>{within}</Num> of <Num>7</Num> measures within your normal
              {lead ? <> · {MKEY[lead.key].short} on {lead.st.state === "act" ? "act" : "watch"} for {lead.st.k} {MKEY[lead.key].unitWord}</> : null}.
            </p>
            <Discrepancy />
            <div className="mrows" role="list">
              <div className="mhead" aria-hidden="true">
                <span className="th">Measure</span><span className="th r">Today</span><span className="th r">Normal</span><span className="th r">Delta</span>
                <span className="th">Deviation</span><span className="th">14 sols</span><span className="th">Status</span>
              </div>
              {MEASURES.map((m, i) => <MeasureRow key={m.key} m={m} st={sts[i]} />)}
            </div>
            <Legend items={[["band", "Your normal range"], ["line", "Centre line: your median"], ["dot", "Today"], ["out", "Outside your normal"]]} />
          </>}
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">How your baseline is set</h2>
            <p className="t2">Each measure&apos;s normal is the median of your previous 14 sols. The band is your usual spread. Outside the band for 2+ days reads Watch; 5+ reads Act.</p>
          </div>
          <div>
            <h2 className="sec-t">Flags</h2>
            {!ready ? <OkLine state="pending">Flags start once your baseline exists.</OkLine>
              : flags.length ? <FlagList flags={flags} ctx="m" />
                : <OkLine state="normal">All seven measures sit within your normal.</OkLine>}
          </div>
        </aside>
      </section>
    </>
  );
}

/* One measure: value, normal, delta, deviation rail, 14-sol sparkline, status and a one-line reason (A4).
   Selecting it opens the 28-sol trend and the share toggle. */
function MeasureRow({ m, st }: { m: Measure; st: Status }) {
  const c = useConsole();
  const { s, set } = c;
  const open = !!s.open[m.key], old = st.latest != null && st.latest < s.sol, hi = s.hi && s.hi.key === m.key;
  const isSh = c.shared(s.me).includes(m.key);
  return (
    <div id={`mr-${m.key}`} className={`mr${open ? " is-open" : ""}${hi ? " is-hi" : ""}`} role="listitem">
      <button type="button" className="mr__btn" aria-expanded={open} aria-controls={`mx-${m.key}`} onClick={() => set((p) => ({ open: { ...p.open, [m.key]: !p.open[m.key] } }))}>
        <span className="mr__n">{m.name}<span className="chev"><Icon name="chev" /></span></span>
        <span className={`mr__v r${old ? " is-old" : ""}`} title={old ? `From Sol ${st.latest}` : undefined}>{fmt(m.key, st.value)}</span>
        <span className="mr__b r">{fmtBase(m.key, st.base)}</span>
        <span className={`mr__d r${isOut(st) ? " is-out" : ""}`}>{st.base ? fmtDelta(m.key, st.delta) : "—"}</span>
        <Plot as="span" className="mr__rail" draw={(w) => railSvg(st, w)} />
        <Plot as="span" className="mr__spark" draw={(w) => sparkSvg(s.me, s.sol, m.key, w)} />
        <span className="mr__s"><StatusWord state={st.state} /></span>
        <span className="mr__why">{reason(s.me, m.key, st)}</span>
      </button>
      {open ? (
        <div className="mr__x" id={`mx-${m.key}`}>
          <div>
            <Plot draw={(w) => trendSvg(s.me, s.sol, m.key, w)} label={`${m.name}, 28 sols, with your baseline band`} />
            <Legend items={m.key === "sleep" || m.key === "engage"
              ? [["bar", "Each sol"], ["band", "Your baseline"], ["line", "Your median (target)"], ["out", "Outside"]]
              : [["dot", "Each sol"], ["band", "Your baseline"], ["line", "Your median"], ["out", "Outside"]]} />
            <p className="foot-note">{m.source}. {m.tip}</p>
          </div>
          <div className="stack">
            {isOut(st) ? <FlagCard k={m.key} st={st} ctx="x" /> : <OkLine state="normal">{m.name} has stayed inside your band. Nothing to do.</OkLine>}
            <Toggle on={isSh} label="Share with crew as an aggregate" onClick={() => toggleShare(c, m.key)} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function toggleShare(c: ReturnType<typeof useConsole>, k: MeasureKey) {
  c.set((p) => {
    const cur = p.shares[p.me] || [];
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    return { shares: { ...p.shares, [p.me]: KEYS.filter((x) => next.includes(x)) } };
  });
}

/* A4: a line appears when self-rated and measured values disagree */
const MEASURED: MeasureKey[] = ["rt", "sleep", "timing", "engage"];
function Discrepancy() {
  const c = useConsole();
  const { s } = c;
  const rated = (["mood", "load", "team"] as MeasureKey[]).map((k) => ({ k, st: c.st(k) })).find((x) => x.st.value != null && x.st.base);
  if (!rated) return null;
  const off = MEASURED.filter((k) => isOut(c.st(k)));
  const when = rated.st.latest === s.sol ? "" : rated.st.latest === s.sol - 1 ? " yesterday" : ` on Sol ${rated.st.latest}`;
  const lead = <>You rated {MKEY[rated.k].short} <Num>{rated.st.value}</Num> of 5{when}</>;
  if (!isOut(rated.st) && off.length)
    return <p className="disc" role="note"><StatusMark state="info" /><span>{lead}, but {listJoin(off.map((k) => MKEY[k].short))} {off.length === 1 ? "is" : off.length === 2 ? "are both" : "are all"} off your normal.</span></p>;
  if (isOut(rated.st) && !off.length)
    return <p className="disc" role="note"><StatusMark state="info" /><span>{lead}, while {listJoin(MEASURED.map((k) => MKEY[k].short))} are all within your normal.</span></p>;
  return null;
}
