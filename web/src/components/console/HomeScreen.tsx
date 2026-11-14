"use client";

import Link from "next/link";
import {
  KEYS, MEASURES, MKEY, P, checkinCount, crewById, flagCopy, fmt, fmtBase, fmtDelta, hasBaseline, isOut, listJoin, overall, reason,
  type Measure, type MeasureKey, type Status,
} from "@/lib/console/data";
import { railSvg, sparkSvg, trendSvg } from "@/lib/console/plots";
import { CLS, Icon, Legend, Num, StatusMark, StatusWord, Toggle } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { FlagCard, FlagList, OkLine, markDone } from "./FlagCard";
import { Plot } from "./Plot";
import { ROUTE, ReplayNote } from "./Shell";

/* Home: see how I'm doing, then do the one next thing (A4, A5). */
export function HomeScreen() {
  const c = useConsole();
  const { s, set, atPresent, clockMin } = c;
  const person = crewById(s.me), first = person.full.split(" ")[0];
  const sh = c.shared(s.me), ready = hasBaseline(s.me, s.sol);
  const due = atPresent && !c.checkedToday();
  const h = Math.floor(clockMin / 60) % 24;
  const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const eyebrow = atPresent ? `${greet}, ${first}` : <>{first} · looking back at Sol <Num>{s.sol}</Num></>;
  const talk = <Link className="ta ta--quiet" href={ROUTE.companion}>Talk to the companion</Link>;
  const ciBtn = <Link className="btn-primary btn--lg" href={ROUTE.checkin}>Start today&apos;s check-in <Icon name="arrow" /></Link>;
  const backToday = <button type="button" className="btn-primary btn--lg" onClick={() => set({ sol: P })}>Return to today</button>;

  if (!ready) {
    const n = checkinCount(s.me, s.sol);
    return (
      <>
        <ReplayNote />
        <div className="page">
          <section className="hero">
            <p className="hero__eyebrow">{eyebrow}</p>
            <h1 className="hero__h">Let&apos;s learn what normal looks like for you.</h1>
            <p className="hero__p">After 3 check-ins the companion can tell when something is off. <Num>{n}</Num> of 3 done so far.</p>
            <div className="hero__cta">{atPresent ? <>{ciBtn}{talk}</> : backToday}</div>
          </section>
          <HomeFoot shared={sh} />
        </div>
      </>
    );
  }

  const sts = MEASURES.map((m) => c.st(m.key)), within = sts.filter((x) => x.state === "normal").length;
  const flags = c.flagsFor(), open = flags.filter((x) => !s.done[c.doneKey(x.key)]);
  const headline = !flags.length ? "Everything is within your normal." : flags.length === 1 ? "One thing to keep an eye on." : `${flags.length} things to keep an eye on.`;
  let sub: string, cta: React.ReactNode, rest = flags;
  if (due) {
    const t = listJoin(flags.map((x) => MKEY[x.key].short));
    sub = flags.length
      ? `${t.charAt(0).toUpperCase() + t.slice(1)} ${flags.length === 1 ? "is" : "are"} outside your normal. Today's check-in keeps this picture accurate.`
      : "Today's check-in is still open. About 2 minutes, and any question can be skipped.";
    cta = <>{ciBtn}{talk}</>;
  } else if (open.length) {
    const f = open[0], fc = flagCopy(s.me, f.key, f.st, s.tone, s.sol);
    sub = fc.line;
    cta = <>
      <div className="hero__task"><span className="label">Suggested for today</span><span className="hero__act">{fc.action}</span></div>
      <button type="button" className="btn-primary btn--lg" onClick={() => markDone(c, f.key)}>Mark as done</button>{talk}
    </>;
    rest = flags.filter((x) => x.key !== f.key);
  } else {
    sub = flags.length ? "You have done today's suggestions. Nothing else needs you." : "Today's check-in is done. Nothing needs your attention.";
    cta = <Link className="btn-primary btn--lg" href={ROUTE.companion}>Talk to the companion <Icon name="arrow" /></Link>;
  }
  const worst = overall(s.me, s.sol);

  return (
    <>
      <ReplayNote />
      <div className="page">
        <section className={`hero hero--${CLS[worst]}`}>
          <p className="hero__eyebrow">{eyebrow}</p>
          <h1 className="hero__h">{headline}</h1>
          <p className="hero__p">{sub}</p>
          <div className="hero__cta">{cta}</div>
        </section>

        {rest.length ? (
          <section className="block">
            <h2 className="block__h">{due ? "Needs attention" : "Also on watch"}<span className="block__n num">{rest.length}</span></h2>
            <FlagList flags={rest} ctx="p" grid />
          </section>
        ) : null}

        <section className="block">
          <h2 className="block__h">Your measures<span className="block__sub"><Num>{within}</Num> of 7 within your normal · select a row for detail</span></h2>
          <Discrepancy />
          <div className="mrows" role="list">
            <div className="mhead" aria-hidden="true">
              <span className="th">Measure</span><span className="th r">Today</span><span className="th r">Normal</span><span className="th r">Change</span>
              <span className="th">vs normal</span><span className="th">Last 14 sols</span><span className="th">Status</span>
            </div>
            {MEASURES.map((m, i) => <MeasureRow key={m.key} m={m} st={sts[i]} />)}
          </div>
          <Legend items={[["band", "Your normal range"], ["dot", "Today"], ["out", "Outside your normal"]]} />
        </section>

        <HomeFoot shared={sh} />
      </div>
    </>
  );
}

function MeasureRow({ m, st }: { m: Measure; st: Status }) {
  const c = useConsole();
  const { s, set } = c;
  const open = !!s.open[m.key], old = st.latest != null && st.latest < s.sol, hi = s.hi && s.hi.key === m.key;
  const isSh = c.shared(s.me).includes(m.key);
  return (
    <div className={`mr${open ? " is-open" : ""}${hi ? " is-hi" : ""}`} role="listitem">
      <button type="button" className="mr__btn" aria-expanded={open} onClick={() => set((p) => ({ open: { ...p.open, [m.key]: !p.open[m.key] } }))}>
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

function HomeFoot({ shared }: { shared: MeasureKey[] }) {
  const { set } = useConsole();
  return (
    <footer className="page__foot">
      <div className="foot__row">
        <span className="label">Sharing</span>
        <span>{shared.length ? `${shared.length} of 7 measures shared with crew, as totals only` : "Private. Nothing leaves this screen."}</span>
        <button type="button" className="ta ta--quiet" onClick={() => set((p) => ({ shares: { ...p.shares, [p.me]: (p.shares[p.me] || []).length ? [] : KEYS.slice() } }))}>
          {shared.length ? "Make all private" : "Share totals with crew"}
        </button>
      </div>
      <details className="more">
        <summary>How is &ldquo;your normal&rdquo; worked out?</summary>
        <p>Each measure&apos;s normal is the middle value of your previous 14 sols, and the shaded band is your usual day-to-day spread. Outside the band for 2+ days reads Watch; 5+ days reads Act. You are only ever compared with yourself, never with other crew.</p>
      </details>
    </footer>
  );
}
