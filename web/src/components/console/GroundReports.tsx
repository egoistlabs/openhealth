"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CREW, MEASURES, MKEY, P, RANK, day, flagCopy, fmt, fmtDelta, hm, isOut, listJoin, mstatus, type MeasureKey, type State } from "@/lib/console/data";
import { vitals, type Vital } from "@/lib/console/wearable";
import { Num, StatusMark, StatusWord } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { ReplayNote } from "./Shell";
import { CrewPortrait } from "./CrewPortrait";
import { VitalStrip } from "./GroundCrewCards";
import { PainSummary, type PainMark } from "./BodyMap";
import { CrewStatusModal } from "./GroundPerson";
import { addEarthNote, NOTE_MAX, useAllEarthNotes, useEarthNotes, type EarthNote } from "@/lib/console/earth-notes";
import { FILE_ACCEPT, FILES_PER_NOTE, fileProblem, fmtSize, getFile, putFile } from "@/lib/console/earth-files";
import { lightDelayMin } from "@/lib/console/ground";

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
          <EarthAdvice crewId={r.c.id} first={r.first} sol={cur} />
        </aside>
      </div>
      {statusFor ? <CrewStatusModal id={statusFor} onClose={() => setStatusFor(null)} /> : null}
    </div>
  );
}
/* ---------- Advice from Earth: the flight surgeon's notes to one astronaut, for the present sol only ----------
   Each note is "in transit" until the one-way light time has passed. Ground-side only for now: the crew view
   and Pedro's summary of the thread come later and will read the same store (lib/console/earth-notes.ts). */
function EarthAdvice({ crewId, first, sol }: { crewId: string; first: string; sol: number }) {
  const { s, clockMin } = useConsole();
  const notes = useEarthNotes(crewId, sol);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pickRef = useRef<HTMLInputElement>(null);
  const [threads, setThreads] = useState(false);
  const live = sol === P && s.sol === P; // only today, and not while replaying the timeline
  const delay = lightDelayMin(sol);
  const canSend = (draft.trim() || files.length) && !busy;
  const pick = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const why = fileProblem(f);
      if (why) { setErr(why); continue; }
      if (next.length >= FILES_PER_NOTE) { setErr(`Up to ${FILES_PER_NOTE} files per note.`); break; }
      next.push(f);
    }
    setFiles(next);
  };
  const send = async () => {
    if (!canSend) { setErr("Write a note or attach a file first."); return; }
    setBusy(true);
    try {
      const attachments = await Promise.all(files.map(putFile)); // files go to IndexedDB, the note keeps their details
      const ok = addEarthNote({ crewId, sol, sentMin: clockMin, arriveMin: clockMin + delay, author: "Flight surgeon", text: draft, attachments }, P);
      if (ok) { setDraft(""); setFiles([]); setErr(null); } else setErr(`Notes can be up to ${NOTE_MAX} characters.`);
    } catch {
      setErr("The file could not be stored on this device.");
    } finally { setBusy(false); }
  };
  return (
    <section className="ea" aria-labelledby="ea-t">
      <div className="ea__head">
        <h2 id="ea-t" className="gdash__h m0">Advice from Earth <span className="small t2">to {first} · Sol <Num>{sol}</Num></span></h2>
        <button type="button" className="ta small" aria-haspopup="dialog" onClick={() => setThreads(true)}>View all threads</button>
      </div>
      {notes.length ? (
        <ul className="ea__list" aria-live="polite">
          {notes.map((n) => <NoteItem key={n.id} n={n} />)}
        </ul>
      ) : (
        <p className="ea__empty" style={EA.empty}>
          {live ? <>No advice sent to {first} today. <span className="t2">Notes reach Mars after the light delay; PDFs and images can be attached.</span></> : <>No advice on this sol. <span className="t2">Pick Today to write.</span></>}
        </p>
      )}
      {threads ? <ThreadsModal startWith={crewId} onClose={() => setThreads(false)} /> : null}
      {live ? (
        <form className="ea__form" onSubmit={(e) => { e.preventDefault(); send(); }}>
          {/* one-click starters the flight surgeon can edit before sending */}
          <div className="ea__quick" role="group" aria-label="Quick advice" style={EA.quick}>
            {QUICK.map(([label, q]) => (
              <button key={label} type="button" className="ea__q" title={q} style={EA.chip} onClick={() => { setDraft((d) => (d.trim() ? `${d.trim()} ${q}` : q).slice(0, NOTE_MAX)); setErr(null); }}>{label}</button>
            ))}
          </div>
          <label className="vh" htmlFor="ea-in">Advice for {first}</label>
          <textarea id="ea-in" className="ea__in" rows={3} maxLength={NOTE_MAX} value={draft} placeholder={`Advice for ${first}, e.g. "Rest after the EVA prep, drink more water tonight."`}
            onChange={(e) => { setDraft(e.target.value); setErr(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
          {files.length ? (
            <ul className="ea__files" aria-label="Files to send">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="ea__file ea__file--pending">
                  <span className="ea__ext">{extOf(f.name)}</span><span className="ea__fn">{f.name}</span><span className="t2 num">{fmtSize(f.size)}</span>
                  <button type="button" className="ea__x" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>×</button>
                </li>
              ))}
            </ul>
          ) : null}
          <input ref={pickRef} type="file" accept={FILE_ACCEPT} multiple hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          <div className="ea__row">
            <span className="small t2">{err ?? `Arrives in ~${delay} min · Ctrl+Enter`}</span>
            <span className="ea__btns">
              <button type="button" className="btn btn-sm" onClick={() => pickRef.current?.click()} disabled={busy || files.length >= FILES_PER_NOTE}
                title="Attach a PDF, image or text file (up to 3, 10 MB each)">Attach file</button>
              <button type="submit" className="btn-primary btn-sm" disabled={!canSend}>{busy ? "Sending…" : "Send"}</button>
            </span>
          </div>
        </form>
      ) : <p className="small t2 ea__past">Advice can only be sent for today{s.sol !== P ? ". Go back to the present on the mission timeline" : ""}.</p>}
    </section>
  );
}

/* inline so the advice box looks right even when the dev stylesheet is stale (as the Home vitals strip does) */
const EA = {
  empty: { margin: 0, padding: "6px 10px", fontSize: 12, lineHeight: 1.4, border: "1px dashed var(--c-hair-strong)", borderRadius: 6 } as const,
  quick: { display: "flex", flexWrap: "wrap", gap: 4 } as const,
  chip: { display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999, borderWidth: 1, borderStyle: "solid",
    borderColor: "color-mix(in srgb, var(--c-action) 45%, var(--c-hair-strong))", background: "color-mix(in srgb, var(--c-action) 16%, var(--c-surface-2))",
    color: "var(--c-text)", fontSize: 12, lineHeight: 1.3, textAlign: "left", cursor: "pointer" } as const,
};

/* quick-advice starters: plain, non-medical wording the flight surgeon can edit (no doses, no diagnoses) */
const QUICK: Array<[string, string]> = [
  ["Rest + fluids", "Rest and drink extra water tonight."],
  ["Check temp", "Please check your body temperature with the kit thermometer."],
  ["See the CMO", "Talk to the crew medical officer today."],
  ["Lighter workload", "Ask for a lighter workload tomorrow if the plan allows."],
  ["8 h sleep", "Protect an 8-hour sleep window tonight."],
];

/* one note: author, send time, transit status, text and attachments (used in the panel and the threads modal) */
function NoteItem({ n }: { n: EarthNote }) {
  const { s, clockMin } = useConsole();
  const arrived = n.sol < P || s.sol > n.sol || clockMin >= n.arriveMin;
  return (
    <li className="ea__note">
      <div className="ea__meta">
        <b>{n.author}</b>
        <span className="num">{hm(n.sentMin)}</span>
        <span className={`ea__st${arrived ? " is-in" : ""}`}>{arrived ? `Arrived ${hm(n.arriveMin)}` : `In transit · arrives ${hm(n.arriveMin)}`}</span>
      </div>
      {n.text ? <p className="ea__text">{n.text}</p> : null}
      {n.attachments?.length ? (
        <ul className="ea__files" aria-label="Attachments">
          {n.attachments.map((a) => (
            <li key={a.id}>
              <button type="button" className="ea__file" onClick={() => openAttachment(a.id)} title={`Open ${a.name}`}>
                <span className="ea__ext">{extOf(a.name)}</span><span className="ea__fn">{a.name}</span><span className="t2 num">{fmtSize(a.size)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/* Every note from Earth, across all sols, grouped by astronaut and sol (newest sol first). Read-only:
   new notes are written in the panel, for today only. Same dialog pattern as the crew status modal. */
function ThreadsModal({ startWith, onClose }: { startWith: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const all = useAllEarthNotes();
  const [who, setWho] = useState<string>(startWith);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  const people = who === "all" ? CREW : CREW.filter((c) => c.id === who);
  const count = (id: string) => all.filter((n) => n.crewId === id).length;
  const files = (list: EarthNote[]) => list.reduce((k, n) => k + (n.attachments?.length ?? 0), 0);
  return (
    <dialog ref={ref} className="mmodal eam" aria-labelledby="eam-t" onClose={onClose}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mmodal__in">
        <header className="mmodal__h">
          <div className="mmodal__ttl">
            <h2 className="mmodal__t" id="eam-t">Advice from Earth · all threads</h2>
            <p className="small t2"><Num>{all.length}</Num> note{all.length === 1 ? "" : "s"} · <Num>{files(all)}</Num> file{files(all) === 1 ? "" : "s"} · newest sol first</p>
          </div>
          <span style={{ flex: 1 }} />
          <button type="button" className="mmodal__x" onClick={onClose} aria-label="Close all threads">×</button>
        </header>
        <div className="gr-sols" role="group" aria-label="Show threads for">
          <button type="button" className={`gr-sol${who === "all" ? " is-on" : ""}`} aria-pressed={who === "all"} onClick={() => setWho("all")}>All crew <span className="t2 num">{all.length}</span></button>
          {CREW.map((c) => (
            <button key={c.id} type="button" className={`gr-sol${who === c.id ? " is-on" : ""}`} aria-pressed={who === c.id} onClick={() => setWho(c.id)}>
              {c.full} <span className="t2 num">{count(c.id)}</span>
            </button>
          ))}
        </div>
        <div className="eam__body">
          {people.map((c) => {
            const mine = all.filter((n) => n.crewId === c.id);
            const sols = [...new Set(mine.map((n) => n.sol))].sort((a, b) => b - a);
            return (
              <section key={c.id} className="eam__person" aria-label={`Thread with ${c.full}`}>
                <h3 className="eam__who"><CrewPortrait person={c} className="eam__img" bare />{c.full} <span className="small t2">{c.code}</span></h3>
                {sols.length ? sols.map((t) => (
                  <div key={t} className="eam__sol">
                    <p className="eam__solt">Sol <Num>{t}</Num>{t === P ? " · Today" : ""}</p>
                    <ul className="ea__list eam__list">
                      {mine.filter((n) => n.sol === t).sort((a, b) => a.sentMin - b.sentMin).map((n) => <NoteItem key={n.id} n={n} />)}
                    </ul>
                  </div>
                )) : <p className="small t2">No advice sent to {c.full.split(" ")[0]} yet.</p>}
              </section>
            );
          })}
        </div>
      </div>
    </dialog>
  );
}

/* file type tag for a chip, e.g. PDF, PNG */
const extOf = (name: string) => (name.split(".").pop() || "file").slice(0, 4).toUpperCase();
/* opens a stored attachment in a new tab (PDFs in the browser's own viewer) */
async function openAttachment(id: string) {
  const tab = window.open("", "_blank"); // opened during the click, so pop-up blockers allow it
  const blob = await getFile(id);
  if (!blob) { tab?.close(); window.alert("This file is no longer stored on this device."); return; }
  const url = URL.createObjectURL(blob);
  if (tab) tab.location.href = url; else window.location.href = url;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const vitalNote = (vs: Vital[]) => (vs.some((v) => v.state === "act") ? "Urgent vitals reach Earth by name, like Act statuses." : "Vitals compare with the person's own normal, the median of their previous 14 nights.");
