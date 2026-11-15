"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { utils, type SlotItemMapArray, type Swapy } from "swapy";
import { DragHandle, SwapyItem, SwapyLayout, SwapySlot } from "@/components/ui/swapy-draggable-card";
import {
  KEYS, MEASURES, MKEY, P, checkinCount, crewById, day, fmt, hm, fmtBase, fmtDelta, hasBaseline, isOut, listJoin, overall, reason, solDate,
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
import { fmtVital, fmtVitalDelta, vitals, type Vital } from "@/lib/console/wearable";
import { lightDelayMin } from "@/lib/console/ground";

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
            <Vitals id={s.me} sol={s.sol} />
          </div>
          </div>
        </div>
        <aside className="sec__margin">
          <div className={`cicard${due ? " is-due" : ""}`} aria-labelledby="cicard-t">
            <div className="cicard__h">
              <h2 className="sec-t" id="cicard-t">Daily check-in</h2>
              {done ? <span className="nav__ok">Done</span> : due ? <span className="nav__due">Due</span> : <span className="small t2">Not done</span>}
            </div>
            {done && today ? <>
              <p className="small t2">Sol <Num>{s.sol}</Num> · logged at <Num>{hm(today.checkin!.min)}</Num></p>
              <dl className="cicard__vals">
                <dt>Sleep</dt><dd><Num>{today.sleep == null ? "—" : `${today.sleep.toFixed(1)}h`}</Num></dd>
                <dt>Mood</dt><dd><Num>{today.mood ?? "—"}</Num>/5</dd>
                <dt>Day load</dt><dd><Num>{today.load ?? "—"}</Num>/5</dd>
                <dt>Teamwork</dt><dd><Num>{today.team ?? "—"}</Num>/5</dd>
              </dl>
              {atPresent ? <Link className="ta" href={`${ROUTE.checkin}?step=review`}>Review or correct</Link> : null}
            </> : <>
              <p className="cicard__lead">A 2-minute daily talk with Pedro that keeps your personal baseline up to date.</p>
              <p className="t2">Sleep, then a quick body map of anything sore, then mood, day load, teamwork and shared meals. Then an optional reaction game.</p>
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

/* Wearable vitals beside the identity block: last night's readings from a (simulated) smartwatch or chest
   monitor, each against the person's own normal, with Watch when outside their usual spread. */
function Vitals({ id, sol }: { id: string; sol: number }) {
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
            (NASA: up to 20 min one way on a Mars mission; up to 40 min there and back) */}
        <span style={V.delay} data-tip={`Mars to Earth one-way light time today is ${lightDelayMin(sol)} min (NASA: up to 20 min one way on a Mars mission). A reply from Earth takes as long again: ${2 * lightDelayMin(sol)} min there and back.`} tabIndex={0}>
          On board now · Earth sees it in <b>{lightDelayMin(sol)} min</b> · {2 * lightDelayMin(sol)} min round trip
        </span>
        <span style={V.src}>Simulated, like the CSA Bio-Monitor on the ISS</span>
      </div>
      <div style={V.grid}>
        {vs.map((v) => (
          <div key={v.key} style={{ ...V.tile, borderTopColor: VITAL_COLOUR[v.state], ...(v.state === "act" ? V.tileAct : null) }} tabIndex={0}
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
  tile: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "5px 10px", border: "1px solid var(--c-hair)", borderTopWidth: 2, borderRadius: 6, background: "var(--c-surface)", outline: "none" },
  tileAct: { background: "color-mix(in srgb, var(--c-act) 10%, var(--c-surface))", borderColor: "var(--c-act)" },
  label: { fontSize: 10, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--c-text-3)", whiteSpace: "nowrap" },
  num: { fontFamily: "var(--f-display, inherit)", fontSize: 26, fontWeight: 300, lineHeight: 1.1, color: "var(--c-text)", whiteSpace: "nowrap" },
  delta: { fontFamily: "var(--f-mono)", fontSize: 11, whiteSpace: "nowrap" },
} satisfies Record<string, React.CSSProperties>;

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
        ) : <p className="small t2">{day(s.me, s.sol)?.checkin ? "No pain or skin problems logged." : "Logged in the daily check-in."}</p>}
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
            <p className="small t2">Sol <Num>{sol}</Num> · {marks.length} {marks.length === 1 ? "spot" : "spots"} marked in the check-in</p>
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
                  {following(m.id) ? "✓ Following up at the next check-in" : "Follow up at the next check-in"}
                </button>
              )} />
            {marks.length > 1 ? (
              <button type="button" className="ta" onClick={() => marks.forEach((m) => { if (following(m.id) === allOn) toggle(m); })}>
                {allOn ? "Stop following up all" : "Follow up all at the next check-in"}
              </button>
            ) : null}
            <p className="small t2">Pedro will ask about followed-up spots at your next daily check-in, so you can say whether each one is still there and how it has changed.</p>
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


