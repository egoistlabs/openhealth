"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  COMPANION_NAME, MEASURES, MISSION, MKEY, P, baseline, crewById, day, fmt, fmtBase, fmtDelta, hm, median, mstatus, previewToday, setToday,
  type Day, type LogEvent,
} from "@/lib/console/data";
import { Icon, Num, StatusMark, StatusWord } from "@/components/ui";
import StepProgress, { type ProgressStep } from "@/components/ui/c-progress-7";
import { useConsole } from "./ConsoleProvider";
import { ReactionGame } from "./ReactionGame";
import { saveCheckin } from "@/lib/console/store";
import { ROUTE, ReplayNote } from "./Shell";
import { CheckinPedro, type PedroLine } from "./CheckinPedro";

const STEPS = ["sleep", "mood", "load", "team", "meals", "game", "review"] as const;
const LABEL: Record<(typeof STEPS)[number], string> = { sleep: "Sleep", mood: "Mood", load: "Day load", team: "Teamwork", meals: "Shared meals", game: "Reaction game", review: "Review" };
type Step = (typeof STEPS)[number];
type Vals = { onset: number; wake: number; mood: number | null; load: number | null; team: number | null; meals: number | null; rt: number | null; slow: number | null };
/* what Pedro says when each step opens */
const ASK: Record<(typeof STEPS)[number], string> = {
  sleep: "When did you fall asleep, and when did you wake up?",
  mood: "How's your mood today, 1 to 5?",
  load: "How heavy was today, 1 to 5? Count both workload and stress.",
  team: "How well did the crew work together, 1 to 5?",
  meals: "Did you eat with anyone today?",
  game: "Optional: a quick reaction game. Press Space when the field turns green. Or skip it.",
  review: "Here is today against your normal. Check it, then submit.",
};
/* answers from /api/ai/checkin-parse (lib/brain/tasks/checkin.ts) */
type Parsed = { sleep_time?: string; wake_time?: string; mood?: number; workload?: number; teamwork?: number; shared_meal?: boolean };

const CELLS: number[] = [];
for (let m = 21 * 60; m <= 34 * 60 + 30; m += 30) CELLS.push(m - 1440);

/* Check-in: five quick questions in focus mode (A1, A2, A3), then review and submit (B2). */
export function CheckinScreen({ step }: { step?: string }) {
  const c = useConsole();
  const { s, set, atPresent, clockMin, landing } = c;
  const router = useRouter();

  const init = () => {
    const d = day(s.me, P);
    const idx = step ? Math.max(0, STEPS.indexOf((step === "timing" ? "sleep" : step) as Step)) : 0;
    return {
      step: idx,
      vals: { onset: d?.onset ?? 0, wake: d?.wake ?? 420, mood: s.draft.mood ?? d?.mood ?? null, load: s.draft.load ?? d?.load ?? null, team: s.draft.team ?? d?.team ?? null, meals: d?.meals ?? null, rt: d?.rt ?? null, slow: d?.slow ?? null } as Vals,
      skipped: {} as Record<string, boolean>,
      pick: 0,
    };
  };
  const [ci, setCi] = useState(init);
  const greet = (n: number) => `Hi ${crewById(s.me).full.split(" ")[0]}, I'm ${COMPANION_NAME}. ${ASK[STEPS[n]]} Answer by tapping, or hold the mic and tell me.`;
  const [line, setLine] = useState<PedroLine>(() => ({ id: 0, text: greet(ci.step) }));
  const say = (text: string) => setLine((p) => ({ id: p.id + 1, text }));
  /* true while Pedro turns a spoken answer into a value: the step stays locked until it lands */
  const [hearing, setHearing] = useState(false);
  const [trials, setTrials] = useState<number[]>([]);
  const qRef = useRef<HTMLHeadingElement>(null);
  const [lastMe, setLastMe] = useState(s.me);
  const [lastRev, setLastRev] = useState(s.rev);

  // switching person in the demo menu restarts the check-in for that person
  // saved check-ins finish loading from local storage after the first render: start again from them
  if (lastRev !== s.rev && lastMe === s.me) { setLastRev(s.rev); setCi(init()); }
  if (lastMe !== s.me) { setLastMe(s.me); const n = init(); setCi(n); say(greet(n.step)); }

  useEffect(() => { qRef.current?.focus({ preventScroll: true }); }, [ci.step]);

  if (!atPresent) {
    return (
      <>
        <ReplayNote />
        <div className="page">
          <section className="hero">
            <h1 className="hero__h">Check-ins are for today only.</h1>
            <p className="hero__p">You are looking back at Sol <Num>{s.sol}</Num>.</p>
            <div className="hero__cta"><button type="button" className="btn-primary btn--lg" onClick={() => set({ sol: P })}>Return to today</button></div>
          </section>
        </div>
      </>
    );
  }

  const k = STEPS[ci.step], i = ci.step;
  const vals = ci.vals;
  const answered = (key: Step) => key === "sleep" ? vals.onset != null && vals.wake != null : key === "game" || key === "review" ? true : vals[key as "mood"] != null;
  const setVal = (patch: Partial<Vals>, clear?: string) => setCi((p) => {
    const skipped = { ...p.skipped };
    if (clear) delete skipped[clear];
    return { ...p, vals: { ...p.vals, ...patch }, skipped };
  });
  const go = (n: number) => {
    const to = Math.max(0, Math.min(STEPS.length - 1, n));
    setCi((p) => ({ ...p, step: to }));
    say(ASK[STEPS[to]]);
  };

  const previewVals = (): Partial<Day> => {
    const sk = ci.skipped;
    return {
      onset: vals.onset, wake: vals.wake, sleep: sk.sleep ? null : (vals.wake - vals.onset) / 60, mid: sk.sleep ? null : (vals.onset + vals.wake) / 2,
      rt: vals.rt, slow: vals.slow, mood: sk.mood ? null : vals.mood, load: sk.load ? null : vals.load, team: sk.team ? null : vals.team,
      meals: sk.meals ? null : vals.meals, words: null, checkin: { min: clockMin },
    };
  };

  const submit = () => {
    const today = previewVals();
    setToday(s.me, today);
    const flags = c.flagsFor();
    const added: LogEvent[] = [{ sol: P, min: clockMin, type: "checkin", sev: "info", code: "CI-01", text: "You completed your check-in." }];
    if (vals.rt != null) added.push({ sol: P, min: clockMin - 1, type: "tap", sev: "info", code: "PF-02", text: `Your reaction test median was ${vals.rt} ms.` });
    // kept on this device, so it is still there after a reload (lib/console/store.ts)
    const stored = saveCheckin({ id: s.me, sol: P, savedAt: new Date().toISOString(), day: today, events: added });
    set((p) => {
      // a resubmission replaces today's earlier log lines rather than adding a second set
      const kept = (p.extra[p.me] || []).filter((e) => !(e.sol === P && (e.code === "CI-01" || e.code === "PF-02")));
      return { draft: {}, extra: { ...p.extra, [p.me]: [...kept, ...added] }, rev: p.rev + 1 };
    });
    c.addLines([{ who: "companion", text: flags.length ? `Thanks. Logged. ${7 - flags.length} of 7 within your normal; ${MKEY[flags[0].key].short} is still on watch.` : "Thanks. Logged. Everything sits within your normal." }]);
    c.say(stored ? "Check-in submitted and saved on this device." : "Check-in submitted. This browser blocks storage, so it will be gone after a reload.");
    router.push(ROUTE.home);
  };

  /* voice through Pedro, one question at a time: the transcript goes to the check-in parser and only the
     answer to the open step is used (other things the person mentions are ignored). Pedro reads it back; it
     is saved like a tap, when the person presses Next. While Pedro works, the step is locked. */
  const apply = async (text: string, at: Step) => {
    let f: Parsed | null = null;
    try {
      const res = await fetch("/api/ai/checkin-parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
      if (res.ok) f = ((await res.json()) as { fields?: Parsed }).fields ?? null;
    } catch { /* offline: handled below */ }
    if (!f) { say("I couldn't work that out just now. Please tap your answer instead."); return; }

    const patch: Partial<Vals> = {};
    let got = "";
    const toMin = (t: string) => { const [hh, mm] = t.split(":").map(Number); return hh * 60 + mm; };
    if (at === "sleep") {
      if (!f.sleep_time && !f.wake_time) { say(`Sorry, I didn't catch your sleep times in that. ${ASK.sleep}`); return; }
      let on = f.sleep_time ? toMin(f.sleep_time) : vals.onset;
      if (f.sleep_time && on >= 12 * 60) on -= 1440; // evening times sit before midnight on the grid
      const wk = f.wake_time ? toMin(f.wake_time) : vals.wake;
      if (f.sleep_time && wk - on > 16 * 60 && wk - (on + 720) >= 60) on += 720; // "1:40" heard as 13:40
      if (wk - on >= 60 && wk - on <= 16 * 60) { patch.onset = on; patch.wake = wk; got = `asleep ${hm(on)}, woke ${hm(wk)}`; }
    } else if (at === "mood" && f.mood != null) { patch.mood = f.mood; got = `mood ${f.mood}`; }
    else if (at === "load" && f.workload != null) { patch.load = f.workload; got = `day load ${f.workload}`; }
    else if (at === "team" && f.teamwork != null) { patch.team = f.teamwork; got = `teamwork ${f.teamwork}`; }
    else if (at === "meals" && f.shared_meal != null) { patch.meals = f.shared_meal ? 1 : 0; got = f.shared_meal ? "a shared meal" : "no shared meals"; }
    if (!got) { say(`Sorry, I didn't catch your ${LABEL[at].toLowerCase()} in that. ${ASK[at]}`); return; }

    setCi((p) => {
      if (STEPS[p.step] !== at) return p; // never write into a step that is no longer open
      const skipped = { ...p.skipped };
      delete skipped[at];
      return { ...p, vals: { ...p.vals, ...patch }, skipped, pick: 0 };
    });
    say(`Got it: ${got}. Press Next to save it, or tap to change it.`);
  };
  const hear = async (text: string) => {
    setHearing(true);
    try { await apply(text, k); } finally { setHearing(false); }
  };

  /* ---------- steps ---------- */
  const stepSleep = () => {
    const on = vals.onset, wk = vals.wake;
    const h = (wk - on) / 60, mid = (on + wk) / 2;
    const bs = baseline(s.me, "sleep", P), bt = baseline(s.me, "timing", P);
    const step5 = (key: "onset" | "wake", d: number) => setCi((p) => {
      const nv = { ...p.vals, [key]: p.vals[key] + d };
      return nv.wake - nv.onset < 60 ? p : { ...p, vals: nv };
    });

    /* your normal: median onset and wake over the last 14 sols */
    const prev = Array.from({ length: 14 }, (_, n) => day(s.me, P - 14 + n)).filter((d): d is Day => d != null);
    const nOn = median(prev.map((d) => d.onset)), nWk = median(prev.map((d) => d.wake));
    /* share of a half-hour cell [x, x+30) covered by [a, b), as left/width percentages */
    const span = (x: number, a: number, b: number) => {
      const l = Math.max(a, x), r = Math.min(b, x + 30);
      return r > l ? { left: `${((l - x) / 30) * 100}%`, width: `${((r - l) / 30) * 100}%` } : null;
    };
    const mark = (x: number, t: number) => (t >= x && t < x + 30 ? `${((t - x) / 30) * 100}%` : null);

    /* last 7 sols: six logged sols plus tonight, which follows the picked times */
    const week = Array.from({ length: 7 }, (_, n) => {
      const sol = P - 6 + n, tonight = sol === P;
      return { sol, tonight, h: tonight ? h : day(s.me, sol)?.sleep ?? null };
    });
    const hrs = week.map((w) => w.h).filter((x): x is number => x != null);
    const avg7 = hrs.length ? hrs.reduce((a, b) => a + b, 0) / hrs.length : null;
    const debt = bs ? week.reduce((a, w) => a + (w.h == null ? 0 : Math.max(0, bs.med - w.h)), 0) : null;
    const drift = bt ? mid - bt.med : null;
    const buffer = MISSION.firstDuty - (((wk % 1440) + 1440) % 1440);
    const top = Math.max(9, bs?.med ?? 0, ...hrs), floor = 4; /* bars start at 4h so night-to-night changes show */
    const pct = (x: number) => `${Math.max(0, (x - floor) / (top - floor)) * 100}%`;
    const debtWarn = debt != null && debt > 1, bufWarn = buffer < 45;

    const row = (l: string, v: React.ReactNode, warn?: boolean) => (
      <div key={l} className="flex items-baseline justify-between gap-2 border-t-[0.5px] border-hair py-2 first:border-t-0">
        <dt className="text-[12px] text-muted-foreground">{l}</dt>
        <dd className={`flex items-center gap-1.5 font-mono text-[13px] ${warn == null ? "text-foreground" : warn ? "text-watch" : "text-success"}`}>
          {warn == null ? null : <StatusMark state={warn ? "watch" : "normal"} />}{v}
        </dd>
      </div>
    );

    return (
      <div className="grid grid-cols-[minmax(0,1fr)_215px] max-md:grid-cols-1">
        <div className="grid content-start gap-4 p-4 max-md:px-0">
          <h1 className="ci__q focus-visible:outline-none" ref={qRef} tabIndex={-1}>When did you fall asleep, and when did you wake up?</h1>
          <p className="ci__hint">{ci.pick === 1 ? <b>Now tap when you woke up.</b> : "Tap when you fell asleep, then when you woke up."}</p>

          <div className="grid grid-cols-7 border-l-[0.5px] border-t-[0.5px] border-hair-strong" role="group" aria-label="Half-hour slots from 21:00 to 10:30">
            {CELLS.map((x) => {
              const fill = span(x, on, wk), norm = nOn != null && nWk != null ? span(x, nOn, nWk) : null;
              const mOn = mark(x, on), mWk = mark(x, wk), end = mOn != null || mWk != null;
              return (
                <button key={x} type="button" aria-pressed={end} aria-label={hm(x)}
                  className={`slp__c relative h-[34px] overflow-hidden border-b-[0.5px] border-r-[0.5px] border-hair-strong px-1.5 text-left align-top font-mono text-[11px] hover:bg-surface ${fill ? "text-foreground" : "text-muted-foreground"}`}
                  onClick={() => { setCi((p) => {
                    const nv = { ...p.vals };
                    let pick = p.pick;
                    if (pick === 0) { nv.onset = x; nv.wake = Math.max(nv.wake, x + 60); pick = 1; }
                    else { if (x > nv.onset) nv.wake = x; else nv.onset = x; pick = 0; }
                    const skipped = { ...p.skipped }; delete skipped.sleep;
                    return { ...p, vals: nv, pick, skipped };
                  }); }}>
                  {fill ? <span className="absolute inset-y-0 bg-primary/20" style={fill} aria-hidden="true" /> : null}
                  {norm ? <span className="absolute bottom-[3px] h-px bg-muted-foreground/70" style={norm} aria-hidden="true" /> : null}
                  {mOn != null ? <span className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: mOn }} aria-hidden="true" /> : null}
                  {mWk != null ? <span className="absolute inset-y-0 w-0.5 bg-primary" style={{ left: mWk }} aria-hidden="true" /> : null}
                  <span className="relative">{hm(x)}</span>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-muted-foreground" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-4 bg-primary/20" />Asleep</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-0.5 bg-primary" />Fell asleep, woke</span>
            {nOn != null ? <span className="inline-flex items-center gap-1.5"><i className="h-px w-4 bg-muted-foreground/70" />Your normal</span> : null}
          </div>

          <div className="trp__fine">
            <span className="stepper" role="group" aria-label="Fell asleep, fine adjust"><span className="label">Asleep</span>
              <button type="button" className="sbtn" aria-label="Asleep 5 minutes earlier" onClick={() => step5("onset", -5)}>−</button><span className="num">{hm(on)}</span>
              <button type="button" className="sbtn" aria-label="Asleep 5 minutes later" onClick={() => step5("onset", 5)}>+</button></span>
            <span className="stepper" role="group" aria-label="Woke, fine adjust"><span className="label">Woke</span>
              <button type="button" className="sbtn" aria-label="Woke 5 minutes earlier" onClick={() => step5("wake", -5)}>−</button><span className="num">{hm(wk)}</span>
              <button type="button" className="sbtn" aria-label="Woke 5 minutes later" onClick={() => step5("wake", 5)}>+</button></span>
          </div>
          <p>Slept <Num>{fmt("sleep", h)}</Num>{bs ? <>, <Num>{fmtDelta("sleep", h - bs.med)}</Num> vs your normal</> : null}. Midpoint <Num>{hm(mid)}</Num>{bt ? <>, <Num>{fmtDelta("timing", mid - bt.med)}</Num> vs your normal</> : null}.</p>
        </div>

        <aside className="flex flex-col gap-4 border-l-[0.5px] border-hair p-4 max-md:border-l-0 max-md:border-t-[0.5px] max-md:px-0" aria-label="Sleep details">
          <div>
            <p className="mb-2 text-[12px] text-muted-foreground">Last 7 sols</p>
            <div className="relative flex h-16 items-end gap-1.5" role="img"
              aria-label={`Sleep for the last 7 sols: ${week.map((w) => `sol ${w.sol}${w.tonight ? " tonight" : ""} ${fmt("sleep", w.h)}`).join(", ")}${bs ? `. Your normal ${fmt("sleep", bs.med)}` : ""}.`}>
              {bs ? <span className="absolute inset-x-0 border-t border-dashed border-muted-foreground/70" style={{ bottom: pct(bs.med) }} aria-hidden="true" /> : null}
              {week.map((w) => (
                <span key={w.sol} className={`flex-1 ${w.tonight ? "bg-primary" : "bg-hair-strong"}`} style={{ height: w.h == null ? 0 : pct(w.h) }} />
              ))}
            </div>
            <div className="mt-1 flex gap-1.5 font-mono text-[11px] text-muted-foreground" aria-hidden="true">
              {week.map((w) => <span key={w.sol} className={`flex-1 text-center ${w.tonight ? "text-primary" : ""}`}>{String(w.sol).slice(-2)}</span>)}
            </div>
          </div>

          <dl className="border-t-[0.5px] border-hair pt-1" aria-live="polite">
            {row("7-sol average", fmt("sleep", avg7))}
            {row("Sleep debt", debt == null ? "—" : fmt("sleep", debt), debt == null ? undefined : debtWarn)}
            {row("Midpoint drift", fmtDelta("timing", drift))}
            {row("First duty", hm(MISSION.firstDuty))}
            {row("Buffer after waking", buffer < 0 ? `−${fmt("sleep", -buffer / 60)}` : buffer >= 60 ? fmt("sleep", buffer / 60) : `${buffer}m`, bufWarn)}
          </dl>

          <p className="mt-auto border-t-[0.5px] border-hair pt-3 text-[11px] text-muted-foreground">
            Cabin <span className="font-mono">{MISSION.cabinTempC.toFixed(1)}</span>°C · lights dim <span className="font-mono">{hm(MISSION.lightsDim)}</span>
          </p>
        </aside>
      </div>
    );
  };

  const stepRating = (key: "mood" | "load" | "team") => {
    const Q = { mood: ["How's your mood today, 1 to 5?", "Low", "High"], load: ["How heavy was today, 1 to 5?", "Light", "Heavy"], team: ["How well did the crew work together, 1 to 5?", "Poorly", "Very well"] }[key];
    const cur = vals[key], b = baseline(s.me, key, P), usual = b ? Math.round(b.med) : null;
    const pickN = (n: number) => { setVal({ [key]: n } as Partial<Vals>, key); };
    return <>
      <h1 className="ci__q focus-visible:outline-none" ref={qRef} tabIndex={-1}>{Q[0]}</h1>
      {key === "load" ? <p className="ci__hint">Count both workload and stress.</p> : null}
      <div className="scale" role="radiogroup" aria-label={`${MKEY[key].name}, 1 to 5`}
        onKeyDown={(e) => {
          if (!["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown"].includes(e.key)) return;
          e.preventDefault();
          const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : -1;
          const nv = Math.max(1, Math.min(5, (cur || usual || 3) + (cur ? d : 0)));
          pickN(nv);
          window.setTimeout(() => (document.querySelector(`[data-sc="${key}-${nv}"]`) as HTMLElement | null)?.focus(), 0);
        }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={`scale__o${usual === n ? " is-base" : ""}`} role="radio" aria-checked={cur === n}
            tabIndex={(cur || usual || 3) === n ? 0 : -1} data-sc={`${key}-${n}`} aria-label={`${n} of 5${usual === n ? ", your normal" : ""}`} onClick={() => pickN(n)}>
            <span className="n">{n}</span><span className="m" />
          </button>
        ))}
      </div>
      <div className="scale__anch"><span>1 · {Q[1]}</span><span>{Q[2]} · 5</span></div>
      {usual != null ? <p className="small t2">The grey rule marks your normal, <Num>{usual}</Num>.</p> : null}
    </>;
  };

  const stepMeals = () => <>
    <h1 className="ci__q focus-visible:outline-none" ref={qRef} tabIndex={-1}>Did you eat with anyone today?</h1>
    <p className="ci__hint">Shared meals feed the crew&apos;s teamwork view as a weekly count. Nothing else about the meal is kept.</p>
    <div className="opts" role="radiogroup" aria-label="Shared meals today">
      {([[0, "No"], [1, "Yes, one meal"], [2, "Yes, two or more"]] as const).map(([n, l]) => (
        <button key={n} type="button" className="opt" role="radio" aria-checked={vals.meals === n} onClick={() => { setVal({ meals: n }, "meals"); }}>{l}</button>
      ))}
    </div>
  </>;

  const stepGame = () => (
    <ReactionGame qRef={qRef} base={baseline(s.me, "rt", P)}
      result={vals.rt != null ? { rt: vals.rt, slow: vals.slow ?? 0, trials } : null}
      onReset={() => { setTrials([]); setVal({ rt: null, slow: null }); }}
      onDone={(t) => { setTrials(t); setVal({ rt: Math.round(median(t)!), slow: t.filter((x) => x > 500).length }); }} />
  );

  const stepReview = () => {
    const rows = previewToday(s.me, previewVals(), () => MEASURES.map((m) => {
      const st = mstatus(s.me, m.key, P);
      const skipped = m.key === "timing" ? ci.skipped.sleep : m.key === "rt" ? vals.rt == null : ci.skipped[m.key];
      return { m, st, skipped };
    }));
    const sh = c.shared(s.me);
    return <>
      <h1 className="ci__q focus-visible:outline-none" ref={qRef} tabIndex={-1}>Here is today, against your own normal.</h1>
      <p className="ci__hint">Submitting writes today to your baseline log. Sharing: {sh.length ? `${sh.length} measures as aggregates` : "private"}. Simulated data.</p>
      <div className="tscroll">
        <table className="sumt">
          <thead><tr><th className="th">Measure</th><th className="th r">Today</th><th className="th r">Normal</th><th className="th r">Delta</th><th className="th">Status</th><th className="th">Source</th></tr></thead>
          <tbody>
            {rows.map(({ m, st, skipped }) => (
              <tr key={m.key}>
                <td className="n">{m.name}</td>
                <td className="r">{skipped ? <span className="t2">Skipped</span> : <span className={st.latest === P || m.key === "engage" ? "" : "t2"}>{fmt(m.key, st.value)}</span>}</td>
                <td className="r t2">{fmtBase(m.key, st.base)}</td>
                <td className="r">{st.base && !skipped ? fmtDelta(m.key, st.delta) : "—"}</td>
                <td><StatusWord state={st.state} /></td>
                <td className="t2">{m.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>;
  };

  const body = k === "sleep" ? stepSleep() : k === "game" ? stepGame() : k === "review" ? stepReview() : k === "meals" ? stepMeals() : stepRating(k);
  const progress: ProgressStep[] = STEPS.map((key, n) => {
    const past = n < i, skipped = key === "game" ? vals.rt == null : !!ci.skipped[key];
    return {
      label: LABEL[key],
      completed: past && !skipped,
      current: n === i,
      note: past && skipped ? "Skipped" : key === "game" && !past ? "Optional" : undefined,
    };
  });
  const nextLabel = k === "review" ? "Submit check-in" : k === "game" ? (vals.rt != null ? "Next" : "Skip game") : "Next";
  const primaryDisabled = hearing || (k !== "review" && k !== "game" && !answered(k));

  return (
    <div className="ci">
      <div className="ci__top">
        <span className="ci__name">Daily check-in</span>
        <StepProgress layout="row" title="Progress" steps={progress} className="flex-1" listClassName="max-[1199px]:hidden" />
        <Link className="ta ta--quiet ci__exit" href={landing}>Exit</Link>
      </div>
      <div className="ci__mid" aria-busy={hearing}>
        <div className="ci__body">
          {c.checkedToday() && i === 0 ? <p className="t2 small">Already logged today. Submitting again replaces today&apos;s entry.</p> : null}
          {body}
        </div>
        <aside className="ci__rail" aria-label={COMPANION_NAME}>
          <CheckinPedro line={line} voiceOn={s.voice} canListen={k !== "game" && k !== "review"} onHeard={hear} />
        </aside>
      </div>
      <div className={k === "sleep" ? "ci__foot ci__foot--rule" : "ci__foot"}>
        <div className="actions">{i > 0 ? <button type="button" className="ta ta--quiet" disabled={hearing} onClick={() => go(i - 1)}><Icon name="back" />Back</button> : null}</div>
        <div className="actions">
          {i < 5 ? <button type="button" className="ta ta--quiet" disabled={hearing} onClick={() => { setCi((p) => ({ ...p, skipped: { ...p.skipped, [k]: true } })); go(i + 1); }}>Skip</button> : null}
          <button type="button" className={k === "game" && vals.rt == null ? "btn btn--lg" : "btn-primary btn--lg"} disabled={primaryDisabled}
            onClick={() => (k === "review" ? submit() : answered(k) && go(i + 1))}>
            {nextLabel} <Icon name="arrow" />
          </button>
        </div>
      </div>
    </div>
  );
}
