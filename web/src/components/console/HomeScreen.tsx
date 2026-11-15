"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { utils, type SlotItemMapArray, type Swapy } from "swapy";
import { DragHandle, SwapyItem, SwapyLayout, SwapySlot } from "@/components/ui/swapy-draggable-card";
import {
  KEYS, MEASURES, MKEY, P, baseline, checkinCount, crewById, day, fmt, hm, fmtBase, fmtDelta, hasBaseline, isOut, listJoin, mstatus, overall, reason, solDate, val,
  type Measure, type MeasureKey, type Status,
} from "@/lib/console/data";
import { railSvg } from "@/lib/console/plots";
import { referenceFor, thresholdSvg } from "@/lib/console/threshold";
import { CLS, Icon, Num, StatusMark, StatusRule, StatusWord, Term, Toggle } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { FlagCard, FlagTimeline, OkLine } from "./FlagCard";
import { FillPlot, Plot } from "./Plot";
import { CrewPortrait } from "./CrewPortrait";
import { ColourKey } from "./ColourKey";
import { MeasureHistory } from "./MeasureHistory";
import { MEASURE_INFO } from "@/lib/console/measure-info";
import { ROUTE, ReplayNote } from "./Shell";
import { PainBodyStill, PainCards, sevColour, type PainMark } from "./BodyMap";
import { setFollowUp, useFollowUps } from "@/lib/console/body/followups";

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
    : <Link className="btn-primary" href={ROUTE.companion}>Talk to Pedro <Icon name="arrow" /></Link>;
  const today = day(s.me, s.sol), done = !!today?.checkin;

  return (
    <div className="home">
      <ReplayNote />
      <div className="pbar">
        <h1 className="pbar__t">Personal · me vs my baseline</h1>
        <span className="pbar__r">Sol <Num>{s.sol}</Num> · <Num>{solDate(s.sol)}</Num></span>
      </div>

      <section className="sec">
        <div className="sec__main">
          <div className="idn-wrap">
          <CrewPortrait person={person} />
          <div className="idn">
            <p className="idn__name">{person.full}</p>
            <p className="idn__meta">
              <span className="idn__role">{person.role}</span><span>Age <Num>{person.age}</Num></span><span>Blood type <Num>{person.blood}</Num></span><span>Sol <Num>{s.sol}</Num></span>
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
            {/* Talk to Pedro sits beside this line so the wearable strip can use the full width below */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", flexWrap: "wrap" }}>
              <p className="idn__row"><b>Simulated data</b><span className="t2">— prototype, not a medical device</span></p>
              <div>{primary}</div>
            </div>
          </div>
          </div>
        </div>
        <aside className="sec__margin">
          <div className={`cicard${due ? " is-due" : ""}`} aria-labelledby="cicard-t"
            style={{ display: "flex", flexDirection: "column" }}>
            <div className="cicard__h">
              <h2 className="sec-t" id="cicard-t">Daily check-in</h2>
              {done ? <span className="nav__ok">Done</span> : due ? <span className="nav__due">Due</span> : <span className="small t2">Not done</span>}
            </div>
            {done && today ? <>
              <p className="small t2">Sol <Num>{s.sol}</Num> · logged at <Num>{hm(today.checkin!.min)}</Num></p>
              {/* each answer as a mini chart: the last 7 sols against the person's own normal (shaded),
                  today's dot in its status colour, then the value and its change from normal */}
              <div role="list" aria-label="Today's check-in answers" style={CK.list}>
                {CK_ROWS.map(([key, label]) => <CheckinRow key={key} id={s.me} sol={s.sol} k={key} label={label} />)}
              </div>
              {/* bottom right of the card, in the space under the answers */}
              {atPresent ? <Link className="ta" href={`${ROUTE.checkin}?step=review`} style={{ marginTop: "auto", alignSelf: "flex-end" }}>Review or correct</Link> : null}
            </> : <>
              <p className="cicard__lead">A 2-minute daily talk with Pedro that keeps your personal baseline up to date.</p>
              <p className="t2">Sleep, then mood, day load, teamwork and shared meals. Then an optional reaction game.</p>
              {atPresent
                ? <Link className="btn-primary btn-primary--wide" href={ROUTE.checkin}>Start daily check-in <Icon name="arrow" /></Link>
                : <p className="small t2">No check-in was logged on this sol.</p>}
            </>}
          </div>
        </aside>
      </section>

      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Today
            {/* colour key for the status words and the card charts */}
            <ColourKey />
          </h2>
          {!ready ? (
            <p className="lead">Building your baseline: <Num>{checkinCount(s.me, s.sol)}</Num> of 3 check-ins done. Flags start once it exists.</p>
          ) : <>
            <p className="lead today-sum">
              <Num>{within}</Num> of <Num>7</Num> measures within your normal
              {lead ? <> · {MKEY[lead.key].short} on {lead.st.state === "act" ? "act" : "watch"} for {lead.st.k} {MKEY[lead.key].unitWord}</> : null}.
            </p>
            <Discrepancy />
            <MeasureGrid sts={sts} />
          </>}
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">How your baseline is set</h2>
            <p className="t2">Each measure&apos;s normal is the median of your previous 14 sols. The band is your usual spread. Outside the band for 2+ days reads Watch; 5+ reads Act.</p>
          </div>
          <div>
            {!ready ? <><h2 className="sec-t">Flags</h2><OkLine state="pending">Flags start once your baseline exists.</OkLine></>
              : flags.length ? <FlagTimeline flags={flags} />
                : <><h2 className="sec-t">Flags</h2><OkLine state="normal">All seven measures sit within your normal.</OkLine></>}
          </div>
        </aside>
      </section>
    </div>
  );
}

/* Today's measures as a compact card grid (A4): no table, no scroll. Each card shows the value, its
   normal, the delta, a 14-sol sparkline and status. Drag a card by its grip to reorder; click it to
   open the full stats in a modal (28-sol trend, deviation rail, flag, share toggle). */
const MITEMS = [...MEASURES.map((m) => ({ id: m.key as string })), { id: "body" }];
function MeasureGrid({ sts }: { sts: Status[] }) {
  const [slotItemMap, setSlotItemMap] = useState<SlotItemMapArray>(() => utils.initSlotItemMap(MITEMS, "id"));
  const slotted = useMemo(() => utils.toSlottedItems(MITEMS, "id", slotItemMap), [slotItemMap]);
  const swapy = useRef<Swapy | null>(null);
  const [openKey, setOpenKey] = useState<MeasureKey | null>(null);
  useEffect(() => { swapy.current?.update(); }, [slotItemMap]);

  return (
    <>
      <SwapyLayout id="mgrid" className="mgrid-wrap" config={{ manualSwap: true, swapMode: "hover", animation: "dynamic" }}
        onReady={(sw) => { swapy.current = sw; }}
        onSwap={(e) => setSlotItemMap(e.newSlotItemMap.asArray)}>
        <div className="mgrid" role="list" aria-label="Today's measures">
          {slotted.map(({ slotId, itemId }) => {
            if (itemId === "body") return (
              <SwapySlot key={slotId} id={slotId} className="mgrid__slot">
                <SwapyItem id={itemId} key={itemId} className="mgrid__item" dragItemOpacity={60}>
                  <BodyCard />
                </SwapyItem>
              </SwapySlot>
            );
            const i = MEASURES.findIndex((m) => m.key === itemId);
            if (i < 0) return null;
            return (
              <SwapySlot key={slotId} id={slotId} className="mgrid__slot">
                <SwapyItem id={itemId} key={itemId} className="mgrid__item" dragItemOpacity={60}>
                  <MeasureCard m={MEASURES[i]} st={sts[i]} onOpen={() => setOpenKey(MEASURES[i].key)} />
                </SwapyItem>
              </SwapySlot>
            );
          })}
        </div>
      </SwapyLayout>
      <p className="small t2 mgrid__hint">Click a card for full stats. Drag the grip to reorder.</p>
      {openKey ? <MeasureModal m={MKEY[openKey]} st={sts[MEASURES.findIndex((m) => m.key === openKey)]} onClose={() => setOpenKey(null)} /> : null}
    </>
  );
}

/* ---------- Daily check-in card: one mini chart per answer ---------- */
const CK_ROWS: Array<[MeasureKey, string]> = [["sleep", "Sleep"], ["mood", "Mood"], ["load", "Day load"], ["team", "Teamwork"]];
const CK_COL: Record<string, string> = { normal: "var(--c-normal)", watch: "var(--c-watch)", act: "var(--c-act)" };
const CK_DAYS = 7;
function CheckinRow({ id, sol, k, label }: { id: string; sol: number; k: MeasureKey; label: string }) {
  const st = mstatus(id, k, sol);
  const pts = Array.from({ length: CK_DAYS }, (_, i) => sol - CK_DAYS + 1 + i).map((t) => ({ t, v: val(day(id, t), k) }));
  const b = baseline(id, k, sol);
  const v = val(day(id, sol), k);
  /* ratings sit on a fixed 1–5 scale; sleep scales to its values and the normal band */
  const known = pts.map((p) => p.v).filter((x): x is number => x != null);
  const rating = k !== "sleep";
  let lo = rating ? 1 : Math.min(...known, b?.lo ?? Infinity) - 0.3, hi = rating ? 5 : Math.max(...known, b?.hi ?? -Infinity) + 0.3;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) { lo = 4; hi = 10; } // no sleep data yet: a sensible empty scale
  const W = 96, H = 22, pad = 3;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (CK_DAYS - 1);
  const y = (n: number) => H - pad - ((n - lo) / (hi - lo || 1)) * (H - 2 * pad);
  const line = pts.map((p, i) => (p.v == null ? null : `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`)).filter(Boolean).join(" ");
  const col = CK_COL[st.state] ?? "var(--c-text-2)";
  const shown = v == null ? "—" : k === "sleep" ? `${v.toFixed(1)}h` : `${v}/5`;
  const delta = v != null && b ? fmtDelta(k, v - b.med) : null;
  return (
    <div role="listitem" style={CK.row} title={b ? `Your normal: ${fmtBase(k, b)}` : "Building your normal"}
      aria-label={`${label} ${shown}${delta ? `, ${delta} vs your normal` : ""}, ${st.state === "act" ? "act" : st.state === "watch" ? "watch" : "within your normal"}`}>
      <span style={CK.label}>{label}</span>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
        {b ? <rect x={0} width={W} y={y(Math.min(hi, b.hi))} height={Math.max(1, y(Math.max(lo, b.lo)) - y(Math.min(hi, b.hi)))} rx={2} fill="var(--c-normal)" opacity={0.14} /> : null}
        {line ? <polyline points={line} fill="none" stroke="var(--c-text-3)" strokeWidth={1.25} strokeLinejoin="round" /> : null}
        {pts.map((p, i) => (p.v == null || i === CK_DAYS - 1 ? null : <circle key={p.t} cx={x(i)} cy={y(p.v)} r={1.6} fill="var(--c-text-3)" />))}
        {v != null ? <circle cx={x(CK_DAYS - 1)} cy={y(v)} r={3.4} fill={col} stroke="var(--c-surface-2)" strokeWidth={1.5} /> : null}
      </svg>
      <span style={CK.val}>
        <span className="num" style={{ color: "var(--c-text)", fontWeight: 600 }}>{shown}</span>
        {delta ? <span className="num" style={{ ...CK.delta, color: isOut(st) ? col : "var(--c-text-3)" }}>{delta}</span> : null}
      </span>
    </div>
  );
}
/* inline so the rows render even when the stylesheet is stale in dev */
const CK = {
  list: { display: "grid", gap: 6 } as const,
  row: { display: "grid", gridTemplateColumns: "72px 96px minmax(0, 1fr)", alignItems: "center", gap: 10 } as const,
  label: { color: "var(--c-text-2)" } as const,
  val: { display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: 6, whiteSpace: "nowrap" } as const,
  delta: { fontSize: 11 } as const,
};

/* Body: where it hurt on this sol (pain and skin marks from the check-in), on the 3D body, plus a short list.
   Opens the check-in review, where each mark can be read in full or corrected. */
function BodyCard() {
  const { s } = useConsole();
  const marks = useMemo(
    () => (s.extra[s.me] || []).filter((e) => e.code === "PN-01" && e.sol === s.sol).flatMap((e) => e.pain ?? []),
    [s.extra, s.me, s.sol],
  );
  const worst = marks.reduce((a, m) => Math.max(a, m.level), 0);
  const [open, setOpen] = useState(false);
  return (<>
    <div className={`mcard mcard--${worst >= 7 ? "act" : worst >= 4 ? "watch" : "normal"} mcard--body`} role="listitem">
      <div className="mcard__h">
        <DragHandle className="mcard__grip" label="Drag Body to reorder" />
        <span className="mcard__n">Body</span>
        <span className="small t2">{marks.length ? `${marks.length} ${marks.length === 1 ? "spot" : "spots"}` : "Nothing sore"}</span>
        {marks.length ? <button type="button" className="ta mcard__open" onClick={() => setOpen(true)} aria-haspopup="dialog">Details</button> : null}
      </div>
      <div className="mcard__body">
        <PainBodyStill marks={marks} />
        {marks.length ? (
          <ul className="mcard__pain">
            {marks.slice(0, 2).map((m) => (
              <li key={m.id}>
                <span className="mcard__dot" style={{ background: sevColour(m.level) }} />
                <span className="mcard__pn">{m.region}{m.kind ? ` · ${m.kind.toLowerCase()}` : ""}</span>
                <Num>{m.level}/10</Num>
              </li>
            ))}
            {marks.length > 2 ? <li className="t2">+{marks.length - 2} more</li> : null}
          </ul>
        ) : <p className="small t2">{day(s.me, s.sol)?.checkin ? "No pain or skin problems logged." : "Log it with Body map on Pedro."}</p>}
      </div>
    </div>
    {open ? <BodyModal marks={marks} sol={s.sol} me={s.me} onClose={() => setOpen(false)} /> : null}
  </>);
}

/* Body pop-up: the still front and back pictures with every mark, and a card per mark (rating, what it
   is, the note). Clicking a card rings its dot. */
function BodyModal({ marks, sol, me, onClose }: { marks: PainMark[]; sol: number; me: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const follow = useFollowUps(me);
  const following = (id: string) => follow.some((f) => f.id === id);
  const toggle = (m: PainMark) => setFollowUp(me, { id: m.id, region: m.region, kind: m.kind, level: m.level, note: m.note, sol }, !following(m.id));
  const allOn = marks.every((m) => following(m.id));
  const [active, setActive] = useState<string | null>(null);
  // as MeasureModal: open once on mount, no close() in cleanup (dev double effects would close it)
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="mmodal bmodal" aria-labelledby="bmodal-t" onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mmodal__in">
        <header className="mmodal__h">
          <div className="mmodal__ttl">
            <h2 className="mmodal__t" id="bmodal-t">Body</h2>
            <p className="small t2">Sol <Num>{sol}</Num> · {marks.length} {marks.length === 1 ? "spot" : "spots"} marked on the body map</p>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" className="mmodal__x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="bmodal__body">
          <div className="bmodal__fig"><PainBodyStill marks={marks} active={active} /></div>
          <div className="bmodal__list">
            <PainCards marks={marks} active={active} onPick={(m) => setActive(m.id)} maxHeight="none"
              footer={(m) => (
                <button type="button" className={following(m.id) ? "opt is-on bmodal__fu" : "opt bmodal__fu"} aria-pressed={following(m.id)} onClick={() => toggle(m)}>
                  {following(m.id) ? "✓ Following up in the body map" : "Follow up in the body map"}
                </button>
              )} />
            {marks.length > 1 ? (
              <button type="button" className="ta" onClick={() => marks.forEach((m) => { if (following(m.id) === allOn) toggle(m); })}>
                {allOn ? "Stop following up all" : "Follow up all in the body map"}
              </button>
            ) : null}
            <p className="small t2">Next time you open Body map with Pedro, he asks about followed-up spots, so you can say whether each one is still there and how it has changed.</p>
          </div>
        </div>
      </div>
    </dialog>
  );
}

function MeasureCard({ m, st, onOpen }: { m: Measure; st: Status; onOpen: () => void }) {
  const { s } = useConsole();
  const old = st.latest != null && st.latest < s.sol, hi = s.hi && s.hi.key === m.key;
  return (
    <div className={`mcard mcard--${CLS[st.state] || st.state}${hi ? " is-hi" : ""}`} role="listitem">
      <div className="mcard__h">
        <DragHandle className="mcard__grip" label={`Drag ${m.name} to reorder`} />
        <span className="mcard__n">{m.name}</span>
        <StatusWord state={st.state} />
      </div>
      <button type="button" className="mcard__btn" onClick={onOpen} aria-haspopup="dialog" aria-label={`${m.name}: open full stats`}>
        <span className="mcard__row">
          <span className={`mcard__v${old ? " is-old" : ""}`} title={old ? `From Sol ${st.latest}` : undefined}>{fmt(m.key, st.value)}</span>
          <span className={`mcard__d${isOut(st) ? " is-out" : ""}`}>{st.base ? fmtDelta(m.key, st.delta) : "—"}</span>
        </span>
        <span className="mcard__b">Normal {fmtBase(m.key, st.base)}</span>
        <FillPlot className="mcard__th" draw={(w, h) => thresholdSvg(s.me, s.sol, m.key, w, h)} />
        <span className="mcard__ref">{refLabel(s.me, m.key, s.sol)}</span>
      </button>
    </div>
  );
}

function MeasureModal({ m, st, onClose }: { m: Measure; st: Status; onClose: () => void }) {
  const c = useConsole();
  const { s } = c;
  const ref = useRef<HTMLDialogElement>(null);
  const isSh = c.shared(s.me).includes(m.key);
  // No close() in cleanup: React dev mode runs effects twice, and that close would fire the dialog's
  // `close` event and clear the selection, so the modal never appeared. Unmounting removes it anyway.
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="mmodal" aria-labelledby="mmodal-t" onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mmodal__in">
        <header className="mmodal__h">
          <div className="mmodal__ttl">
            <h2 className="mmodal__t" id="mmodal-t">{m.name}</h2>
            <p className="small t2">Sol <Num>{s.sol}</Num> · against your own normal</p>
          </div>
          <dl className="mmodal__stats">
            <div><dt>Today</dt><dd>{fmt(m.key, st.value)}</dd></div>
            <div><dt>Your normal</dt><dd>{fmtBase(m.key, st.base)}</dd></div>
            <div><dt>Delta</dt><dd className={isOut(st) ? "is-out" : undefined}>{st.base ? fmtDelta(m.key, st.delta) : "—"}</dd></div>
          </dl>
          <StatusWord state={st.state} />
          <button type="button" className="mmodal__x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <MeasureHistory key={m.key} m={m} me={s.me} sol={s.sol}
          after={<MeasureAbout k={m.key} name={m.name} />}
          lead={<div className="mmodal__dev">
            <p className="mmodal__why">{reason(s.me, m.key, st)}</p>
            <h3 className="label">Deviation from your normal</h3>
            <Plot className="mmodal__rail" draw={(w) => railSvg(st, w)} />
          </div>}
          aside={<>
            {isOut(st) ? <FlagCard k={m.key} st={st} ctx="x" /> : <OkLine state="normal">{m.name} has stayed inside your band. Nothing to do.</OkLine>}
            <Toggle on={isSh} label="Share with crew as an aggregate" onClick={() => toggleShare(c, m.key)} />
            <p className="foot-note">{m.source}. {m.tip}</p>
          </>} />
      </div>
    </dialog>
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

/* "About this measure": why it matters on a mission, reference points, what affects it, how it is measured */
function MeasureAbout({ k, name }: { k: MeasureKey; name: string }) {
  const info = MEASURE_INFO[k];
  if (!info) return null;
  return (
    <section className="about" aria-label={`About ${name}`}>
      <h3 className="label">Why {name.toLowerCase()} matters</h3>
      <p className="about__why">{info.why}</p>
      <div className="about__grid">
        <div>
          <h4 className="about__h">The standard</h4>
          <dl className="about__std">
            {info.standard.map(([l, v]) => <div key={l}><dt>{l}</dt><dd>{v}</dd></div>)}
          </dl>
        </div>
        <div>
          <h4 className="about__h">What throws it off</h4>
          <ul className="about__list">{info.affects.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      </div>
      <p className="small t2">{info.how} General guidance only: your flags always compare you with your own normal.</p>
    </section>
  );
}

const refLabel = (id: string, k: MeasureKey, sol: number) => referenceFor(id, k, sol)?.label ?? "";


