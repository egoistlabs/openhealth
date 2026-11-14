"use client";

import { useMemo, useState } from "react";
import { CREW, MEASURES, MKEY, P, RANK, day, flagCopy, fmt, fmtDelta, hm, isOut, listJoin, mstatus, type MeasureKey, type State } from "@/lib/console/data";
import { vitals, type Vital } from "@/lib/console/wearable";
import { Num, StatusMark, StatusWord } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { ReplayNote } from "./Shell";
import { CrewPortrait } from "./CrewPortrait";
import { VitalStrip } from "./GroundCrewCards";
import { PainSummary, type PainMark } from "./BodyMap";
import { CrewStatusModal } from "./GroundPerson";

const SOLS = 7;
const VSHORT: Record<string, string> = { rhr: "HR", hrv: "HRV", spo2: "SpO₂", temp: "Temp", resp: "Resp" };
const VUNIT: Record<string, string> = { rhr: "bpm", hrv: "ms", spo2: "%", temp: "°C", resp: "/min" };
type Pain = PainMark;

/* Simulated body-map pins for the rest of the crew, so Ground has something to read in the demo.
   A check-in submitted on this device replaces these for that person and sol. */
const pin = (id: string, region: string, level: number, note: string, kind?: string): PainMark => ({ id, view: "front", x: 0, y: 0, region, level, note, ...(kind ? { kind } : null) });
const SIM_PAIN: Record<string, Record<number, PainMark[]>> = {
  lindqvist: {
    [P]: [
      pin("somakine:structure:deltoid#right", "Right deltoid", 5, "When moving. Sore since servicing the airlock hatch on Sol 140; worse lifting anything overhead."),
      pin("somakine:structure:erector-spinae#left", "Left erector spinae", 3, "After waking. Stiff lower back for the first hour, eases once moving."),
    ],
    [P - 1]: [pin("somakine:structure:deltoid#right", "Right deltoid", 4, "When moving. Started after the hatch work yesterday.")],
  },
  reyes: {
    [P - 1]: [pin("somakine:structure:openhealth-skin-forearm#right", "Right forearm skin", 3, "Itchy red patch after cleaning the water recycler filter without long gloves.", "Rash")],
    [P - 2]: [pin("somakine:structure:trapezius#left", "Left trapezius", 2, "At rest. Mild ache from sleeping at an odd angle.")],
  },
  okafor: {
    [P]: [pin("somakine:structure:gastrocnemius#left", "Left calf (gastrocnemius)", 4, "During exercise. Cramp on the treadmill harness run, eased after stretching.")],
  },
  sato: {
    [P - 2]: [pin("somakine:structure:trapezius#right", "Right trapezius", 3, "All the time. Neck and shoulder stiff after long hours at the core-logging microscope.")],
  },
};

/* One person's check-in submission for one sol, as Ground may see it, plus Pedro's read of it.
   Values only for measures that person shares; body-map pins with their details. */
function buildReport(id: string, sol: number, shared: MeasureKey[], pain: Pain[]) {
  const c = CREW.find((x) => x.id === id)!;
  const first = c.full.split(" ")[0];
  const d = day(id, sol);
  const sts = MEASURES.map((m) => ({ m, st: mstatus(id, m.key, sol), shared: shared.includes(m.key) }));
  const outShared = sts.filter((x) => x.shared && isOut(x.st)).sort((a, b) => RANK[b.st.state] - RANK[a.st.state]);
  const actHidden = sts.filter((x) => !x.shared && x.st.state === "act");
  const vs = vitals(id, sol);
  const vUrgent = vs.filter((v) => v.state === "act"), vWatch = vs.filter((v) => v.state === "watch");
  const worst: State = [...outShared.map((x) => x.st.state), ...(actHidden.length || vUrgent.length ? ["act" as State] : []), ...(vWatch.length ? ["watch" as State] : [])]
    .reduce<State>((w, s) => (RANK[s] > RANK[w] ? s : w), "normal");

  /* Pedro's read, written by code from the same numbers (no model, so nothing can be invented) */
  const lines: string[] = [];
  if (!d?.checkin) lines.push(sol === P ? `${first} has not checked in yet today.` : `${first} did not check in on Sol ${sol}.`);
  else lines.push(`${first} checked in at ${hm(d.checkin.min)}.`);
  if (outShared.length) lines.push(`Outside their own normal: ${listJoin(outShared.map((x) => `${x.m.name.toLowerCase()} (${x.st.state === "act" ? "Act" : "Watch"}, ${x.st.k} ${x.m.unitWord})`))}.`);
  if (actHidden.length) lines.push(`${actHidden.length === 1 ? "One measure they do not share is" : `${actHidden.length} measures they do not share are`} at Act; no values reach Earth.`);
  if (vUrgent.length) lines.push(`Wearable: ${listJoin(vUrgent.map((v) => v.label.toLowerCase()))} urgent overnight.`);
  else if (vWatch.length) lines.push(`Wearable: ${listJoin(vWatch.map((v) => v.label.toLowerCase()))} on watch.`);
  if (pain.length) lines.push(`Reported pain: ${listJoin(pain.map((p) => `${p.region.toLowerCase()} ${p.level}/10`))}.`);
  if (!outShared.length && !actHidden.length && !vUrgent.length && !vWatch.length && d?.checkin) lines.push("Everything shared sits within their own normal.");
  const actions = outShared.slice(0, 2).map((x) => ({ key: x.m.key, text: flagCopy(id, x.m.key, x.st, "direct", sol).action }));

  /* the answers as submitted */
  const show = (k: MeasureKey) => shared.includes(k);
  const answers: Array<{ label: string; value: string; key?: MeasureKey; note?: string }> = d ? [
    { label: "Slept", key: "sleep", value: show("sleep") || show("timing") ? `${hm(d.onset)} → ${hm(d.wake)}` : "Not shared" },
    { label: "Sleep", key: "sleep", value: show("sleep") ? fmt("sleep", d.sleep) : "Not shared", note: show("sleep") ? deltaOf(id, "sleep", sol) : undefined },
    { label: "Mood", key: "mood", value: show("mood") ? fmt("mood", d.mood) : "Not shared", note: show("mood") ? deltaOf(id, "mood", sol) : undefined },
    { label: "Workload", key: "load", value: show("load") ? fmt("load", d.load) : "Not shared", note: show("load") ? deltaOf(id, "load", sol) : undefined },
    { label: "Teamwork", key: "team", value: show("team") ? fmt("team", d.team) : "Not shared", note: show("team") ? deltaOf(id, "team", sol) : undefined },
    { label: "Shared meals", value: show("team") ? (d.meals == null ? "—" : String(d.meals)) : "Not shared" },
    { label: "Reaction test", key: "rt", value: show("rt") ? (d.rt == null ? "Skipped" : fmt("rt", d.rt)) : "Not shared", note: show("rt") ? deltaOf(id, "rt", sol) : undefined },
  ] : [];
  return { c, first, d, sts, outShared, actHidden, vs, worst, lines, actions, answers, pain };
}
function deltaOf(id: string, key: MeasureKey, sol: number) {
  const st = mstatus(id, key, sol);
  return st.delta == null ? undefined : `${fmtDelta(key, st.delta)} vs normal`;
}

/* Ground · Pedro reports: every astronaut's check-in submission per sol, with Pedro's summary. */
export function GroundReports() {
  const { s } = useConsole();
  const [sol, setSol] = useState(s.sol);
  const [pick, setPick] = useState<string>(CREW[0].id);
  const [statusFor, setStatusFor] = useState<string | null>(null);
  const cur = Math.min(sol, s.sol);
  const sols = Array.from({ length: SOLS }, (_, i) => s.sol - i).filter((t) => t > 0);

  const reports = useMemo(() => {
    void s.rev;
    return CREW.map((c) => {
      const own = (s.extra[c.id] || []).filter((e) => e.code === "PN-01" && e.sol === cur);
      const pain: Pain[] = own.length ? own.flatMap((e) => e.pain ?? []) : day(c.id, cur)?.checkin ? SIM_PAIN[c.id]?.[cur] ?? [] : [];
      return { ...buildReport(c.id, cur, s.shares[c.id] || [], pain), painSim: !own.length && pain.length > 0 };
    });
  }, [cur, s.shares, s.extra, s.rev]);
  const r = reports.find((x) => x.c.id === pick) ?? reports[0];
  const nIn = reports.filter((x) => x.d?.checkin).length;

  return (
    <div className="gdash">
      <ReplayNote />
      <div className="gdash__bar">
        <h1 className="gdash__t">Pedro reports · Sol <Num>{cur}</Num></h1>
        <span className="gdash__dl t2"><span><Num>{nIn}</Num> of <Num>{CREW.length}</Num> submitted</span><span>Values only for measures each person shares. Body-map pins show where, how bad and how it happened. Simulated data.</span></span>
        <div className="gr-sols" role="group" aria-label="Sol">
          {sols.map((t) => (
            <button key={t} type="button" className={`gr-sol${t === cur ? " is-on" : ""}`} aria-pressed={t === cur} onClick={() => setSol(t)}>
              {t === P ? "Today" : <>Sol <Num>{t}</Num></>}
            </button>
          ))}
        </div>
      </div>

      <div className="gdash__grid gr">
        {/* ---------- left: one row per astronaut ---------- */}
        <section className="gdash__col gr__list" aria-label="Submissions">
          <h2 className="gdash__h">Submissions</h2>
          <ul className="gr-rows">
            {reports.map((x) => (
              <li key={x.c.id}>
                <button type="button" className={`gr-row gr-row--${x.worst}${x.c.id === r.c.id ? " is-on" : ""}`} aria-pressed={x.c.id === r.c.id} onClick={() => setPick(x.c.id)}
                  aria-label={`${x.c.full}, ${x.d?.checkin ? `submitted ${hm(x.d.checkin.min)}` : "no check-in"}, ${x.worst}. Wearable: ${x.vs.map((v) => `${VSHORT[v.key]} ${v.value.toFixed(v.digits)} ${VUNIT[v.key]}${v.state === "normal" ? "" : ` ${v.state === "act" ? "urgent" : "watch"}`}`).join(", ")}`}>
                  <span className="gr-row__txt">
                    <span className="gr-row__name">{x.c.full}</span>
                    <span className="gr-row__meta"><span className="gr-row__code">{x.c.code}</span>{x.c.role.split(",")[0]}</span>
                    <span className="gr-row__st">
                      <StatusMark state={x.d?.checkin ? x.worst : "pending"} />
                      {x.d?.checkin ? <>Submitted <Num>{hm(x.d.checkin.min)}</Num></> : "No check-in"}
                      {x.pain.length ? <> · <Num>{x.pain.length}</Num> pain</> : null}
                    </span>
                  </span>
                  <span className="gr-row__pic"><CrewPortrait person={x.c} className="gr-row__img" bare /></span>
                  {/* wearable at a glance, inside the card (plain text: the card itself is the button) */}
                  <span className="gr-row__vit" aria-hidden="true">
                    {x.vs.map((v) => (
                      <span key={v.key} className={`gr-v gr-v--${v.state}`}>
                        <span className="gr-v__l"><StatusMark state={v.state} />{VSHORT[v.key]}</span>
                        <span className="gr-v__n num">{v.value.toFixed(v.digits)}<small>{VUNIT[v.key]}</small></span>
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- middle: Pedro's summary and the answers ---------- */}
        <section className="gdash__col gr__main" aria-labelledby="gr-t">
          <div className="gr__head">
            <h2 id="gr-t">{r.c.full} <span className="small t2">{r.c.code} · Sol <Num>{cur}</Num></span></h2>
            <button type="button" className="ta small" aria-haspopup="dialog" onClick={() => setStatusFor(r.c.id)}>Open crew status →</button>
          </div>
          <div className={`gr-sum gr-sum--${r.d?.checkin ? r.worst : "pending"}`}>
            <span className="gr-sum__l">Pedro&apos;s summary</span>
            {r.lines.map((l, i) => <p key={i}>{l}</p>)}
            {r.actions.length ? <p className="gr-sum__a"><span className="t2">Suggested:</span> {r.actions.map((a) => a.text).join(" ")}</p> : null}
          </div>

          {r.d?.checkin ? (
            <>
              <h3 className="gdash__h mt3">What they submitted</h3>
              <div className="gr-ans">
                {r.answers.map((a, i) => (
                  <div key={i} className={`gr-ans__c${a.value === "Not shared" ? " is-off" : ""}`}>
                    <span className="gr-ans__l">{a.label}</span>
                    <span className="gr-ans__v num">{a.value}</span>
                    {a.note ? <span className="gr-ans__n num">{a.note}</span> : null}
                  </div>
                ))}
              </div>
              <h3 className="gdash__h mt3">Body map <span className="small t2">{r.pain.length ? `${r.pain.length} pin${r.pain.length === 1 ? "" : "s"} · click a card to find it on the body` : "no pain reported"}</span></h3>
              {r.pain.length ? (
                <>
                  {/* the same 3D body and pain cards the astronaut saw when submitting: where they pinned it, how bad, and how it happened */}
                  <PainSummary key={`${r.c.id}-${cur}`} marks={r.pain} />
                  {r.painSim ? <p className="gr-body__src">Simulated pins for the demo. A check-in submitted on this device shows its real pins instead.</p> : null}
                </>
              ) : <p className="small t2">{r.first} marked no pain on Sol {cur}.</p>}
            </>
          ) : <p className="small t2 mt3">Nothing submitted for this sol. Missing a check-in is allowed; Engagement picks it up if it repeats.</p>}
        </section>

        {/* ---------- right: status against their normal + vitals ---------- */}
        <aside className="gdash__col gr__side" aria-label="Status">
          <h2 className="gdash__h">Wearable · that night</h2>
          <VitalStrip vs={r.vs} first={r.first} className="gr-vit" />
          <h2 className="gdash__h mt3">Measures</h2>
          <ul className="gr-ms">
            {r.sts.map(({ m, st, shared }) => (
              <li key={m.key}>
                <span>{MKEY[m.key].name}</span>
                {shared ? <StatusWord state={st.state} /> : st.state === "act" ? <StatusWord state="act">Act · not shared</StatusWord> : <span className="small t2">Not shared</span>}
              </li>
            ))}
          </ul>
          <p className="small t2 mt2">{vitalNote(r.vs)}</p>
        </aside>
      </div>
      {statusFor ? <CrewStatusModal id={statusFor} onClose={() => setStatusFor(null)} /> : null}
    </div>
  );
}
const vitalNote = (vs: Vital[]) => (vs.some((v) => v.state === "act") ? "Urgent vitals reach Earth by name, like Act statuses." : "Vitals compare with the person's own normal, the median of their previous 14 nights.");
