"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  MEASURES, MKEY, P, baseline, day, fmt, fmtBase, fmtDelta, hm, median, mstatus, previewToday, setToday,
  type Day, type VoicePhrase,
} from "@/lib/console/data";
import { tapsSvg, tok } from "@/lib/console/plots";
import { Icon, Legend, Num, StatusWord, Term } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { Plot } from "./Plot";
import { ROUTE, ReplayNote } from "./Shell";
import { Wave } from "./Orb";
import { HoldButton, VoiceState, type VState } from "./Voice";

const STEPS = ["sleep", "mood", "load", "team", "meals", "game", "review"] as const;
type Step = (typeof STEPS)[number];
type Vals = { onset: number; wake: number; mood: number | null; load: number | null; team: number | null; meals: number | null; rt: number | null; slow: number | null };
type Game = { phase: "ready" | "wait" | "go" | "soon" | "done"; trials: number[]; goAt: number; x: number; y: number; fb: { x: number; y: number; t: string } | null };

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
      vals: { onset: d?.onset ?? 0, wake: d?.wake ?? 420, mood: s.draft.mood ?? null, load: s.draft.load ?? null, team: s.draft.team ?? null, meals: null, rt: null, slow: null } as Vals,
      skipped: {} as Record<string, boolean>,
      pick: 0,
    };
  };
  const [ci, setCi] = useState(init);
  const [v, setV] = useState<VState>(null);
  const [game, setGame] = useState<Game>({ phase: "ready", trials: [], goAt: 0, x: 50, y: 50, fb: null });
  const timer = useRef(0);
  const qRef = useRef<HTMLHeadingElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [lastMe, setLastMe] = useState(s.me);

  // switching person in the demo menu restarts the check-in for that person
  if (lastMe !== s.me) { setLastMe(s.me); setCi(init()); setV(null); }

  useEffect(() => () => window.clearTimeout(timer.current), []);
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

  const k = STEPS[ci.step], i = ci.step, segN = Math.min(i, 5);
  const vals = ci.vals;
  const answered = (key: Step) => key === "sleep" ? vals.onset != null && vals.wake != null : key === "game" || key === "review" ? true : vals[key as "mood"] != null;
  const setVal = (patch: Partial<Vals>, clear?: string) => setCi((p) => {
    const skipped = { ...p.skipped };
    if (clear) delete skipped[clear];
    return { ...p, vals: { ...p.vals, ...patch }, skipped };
  });
  const go = (n: number) => { window.clearTimeout(timer.current); setV(null); setCi((p) => ({ ...p, step: Math.max(0, Math.min(STEPS.length - 1, n)) })); };

  const previewVals = (): Partial<Day> => {
    const sk = ci.skipped;
    return {
      onset: vals.onset, wake: vals.wake, sleep: sk.sleep ? null : (vals.wake - vals.onset) / 60, mid: sk.sleep ? null : (vals.onset + vals.wake) / 2,
      rt: vals.rt, slow: vals.slow, mood: sk.mood ? null : vals.mood, load: sk.load ? null : vals.load, team: sk.team ? null : vals.team,
      meals: sk.meals ? null : vals.meals, words: null, checkin: { min: clockMin },
    };
  };

  const submit = () => {
    setToday(s.me, previewVals());
    const flags = c.flagsFor();
    set((p) => {
      const extra = [...(p.extra[p.me] || []), { sol: P, min: clockMin, type: "checkin" as const, sev: "info" as const, code: "CI-01", text: "You completed your check-in." }];
      if (vals.rt != null) extra.push({ sol: P, min: clockMin - 1, type: "tap" as const, sev: "info" as const, code: "PF-02", text: `Your reaction test median was ${vals.rt} ms.` });
      return { draft: {}, extra: { ...p.extra, [p.me]: extra }, rev: p.rev + 1 };
    });
    c.addLines([{ who: "companion", text: flags.length ? `Thanks. Logged. ${7 - flags.length} of 7 within your normal; ${MKEY[flags[0].key].short} is still on watch.` : "Thanks. Logged. Everything sits within your normal." }]);
    c.say("Check-in submitted.");
    router.push(ROUTE.home);
  };

  /* reaction game */
  const arm = () => {
    setGame((g) => ({ ...g, phase: "wait", fb: null }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setGame((g) => ({ ...g, ...nextTarget(), fb: null }));
      fieldRef.current?.focus({ preventScroll: true });
    }, waitMs());
  };
  const finish = (trials: number[]) => {
    window.clearTimeout(timer.current);
    if (trials.length >= 3) { setVal({ rt: Math.round(median(trials)!), slow: trials.filter((x) => x > 500).length }); setGame((g) => ({ ...g, trials, phase: "done" })); }
    else setGame((g) => ({ ...g, phase: "ready", trials: [] }));
  };
  const press = (e?: React.PointerEvent) => {
    if (game.phase === "wait") { window.clearTimeout(timer.current); setGame((g) => ({ ...g, phase: "soon" })); timer.current = window.setTimeout(arm, 900); return; }
    if (game.phase !== "go") return;
    const tgt = fieldRef.current?.querySelector(".game__target");
    if (e && tgt) {
      const r = tgt.getBoundingClientRect(), pad = tok("--s-3");
      if (e.clientX < r.left - pad || e.clientX > r.right + pad || e.clientY < r.top - pad || e.clientY > r.bottom + pad) {
        setGame((g) => ({ ...g, fb: { x: g.x, y: g.y + 14, t: "Tap the ring" } })); return;
      }
    }
    const ms = Math.round(nowMs() - game.goAt);
    const trials = [...game.trials, ms];
    setGame((g) => ({ ...g, trials, fb: { x: g.x, y: g.y + 12, t: `${ms} ms` } }));
    if (trials.length >= 10) finish(trials); else arm();
  };

  /* voice result for a step: show what was understood, apply it to the control, offer Correct */
  const onPhrase = (p: VoicePhrase) => {
    const q = p.parse!;
    if (q.key === "sleep") setVal({ onset: q.onset!, wake: q.wake! }, "sleep");
    else setVal({ [q.key]: q.v } as Partial<Vals>, q.key);
    const value = q.key === "sleep" ? `${hm(q.onset!)} → ${hm(q.wake!)} · ${fmt("sleep", (q.wake! - q.onset!) / 60)}` : q.key === "meals" ? (q.v ? `${q.v} shared` : "none") : `${q.v} of 5`;
    setV({ kind: "understood", heard: p.text, label: q.label, value });
    c.say(`Understood: ${q.label} ${value}.`);
  };
  const voice = (ctx: string) => s.voice ? (
    <div className="ci__voice">
      <div className="chat__row">
        <HoldButton ctx={ctx} quiet enabled={s.voice} onPhrase={onPhrase} setV={setV}
          tip="Simulated voice: there is no microphone yet. What was understood always shows before it is saved." />
        <Wave />
      </div>
      <VoiceState v={v} inCheckin onCorrect={() => { setV(null); (document.querySelector('.scale__o[aria-checked="true"], .opt[aria-checked="true"], .trp__c.is-end') as HTMLElement | null)?.focus(); }} />
    </div>
  ) : null;

  /* ---------- steps ---------- */
  const stepSleep = () => {
    const on = vals.onset, wk = vals.wake;
    const inR = (x: number) => x + 30 > on && x <= wk;
    const isEnd = (x: number) => (on >= x && on < x + 30) || (wk >= x && wk < x + 30);
    const h = (wk - on) / 60, b = baseline(s.me, "timing", P), bs = baseline(s.me, "sleep", P), mid = (on + wk) / 2;
    const step5 = (key: "onset" | "wake", d: number) => setCi((p) => {
      const nv = { ...p.vals, [key]: p.vals[key] + d };
      return nv.wake - nv.onset < 60 ? p : { ...p, vals: nv };
    });
    return <>
      <h1 className="ci__q focus-visible:outline-none" ref={qRef} tabIndex={-1}>When did you fall asleep, and when did you wake up?</h1>
      <p className="ci__hint">{ci.pick === 1 ? <b>Now tap when you woke up.</b> : "Tap when you fell asleep, then when you woke up."}</p>
      <div className="trp">
        <div className="trp__grid" role="group" aria-label="Half-hour slots from 21:00 to 10:30">
          {CELLS.map((x) => (
            <button key={x} type="button" className={`trp__c${inR(x) ? " in-range" : ""}${isEnd(x) ? " is-end" : ""}`} aria-pressed={isEnd(x)} aria-label={hm(x)}
              onClick={() => { setV(null); setCi((p) => {
                const nv = { ...p.vals };
                let pick = p.pick;
                if (pick === 0) { nv.onset = x; nv.wake = Math.max(nv.wake, x + 60); pick = 1; }
                else { if (x > nv.onset) nv.wake = x; else nv.onset = x; pick = 0; }
                const skipped = { ...p.skipped }; delete skipped.sleep;
                return { ...p, vals: nv, pick, skipped };
              }); }}>{hm(x)}</button>
          ))}
        </div>
        <div className="trp__fine">
          <span className="stepper" role="group" aria-label="Fell asleep, fine adjust"><span className="label">Asleep</span>
            <button type="button" className="sbtn" aria-label="Asleep 5 minutes earlier" onClick={() => step5("onset", -5)}>−</button><span className="num">{hm(on)}</span>
            <button type="button" className="sbtn" aria-label="Asleep 5 minutes later" onClick={() => step5("onset", 5)}>+</button></span>
          <span className="stepper" role="group" aria-label="Woke, fine adjust"><span className="label">Woke</span>
            <button type="button" className="sbtn" aria-label="Woke 5 minutes earlier" onClick={() => step5("wake", -5)}>−</button><span className="num">{hm(wk)}</span>
            <button type="button" className="sbtn" aria-label="Woke 5 minutes later" onClick={() => step5("wake", 5)}>+</button></span>
        </div>
        <p>Slept <Num>{fmt("sleep", h)}</Num>{bs ? <>, <Num>{fmtDelta("sleep", h - bs.med)}</Num> vs your normal</> : null}. Midpoint <Num>{hm(mid)}</Num>{b ? <>, <Num>{fmtDelta("timing", mid - b.med)}</Num> vs your normal</> : null}.</p>
      </div>
      {voice("sleep")}
    </>;
  };

  const stepRating = (key: "mood" | "load" | "team") => {
    const Q = { mood: ["How's your mood today, 1 to 5?", "Low", "High"], load: ["How heavy was today, 1 to 5?", "Light", "Heavy"], team: ["How well did the crew work together, 1 to 5?", "Poorly", "Very well"] }[key];
    const cur = vals[key], b = baseline(s.me, key, P), usual = b ? Math.round(b.med) : null;
    const pickN = (n: number) => { setV(null); setVal({ [key]: n } as Partial<Vals>, key); };
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
      {voice(key)}
    </>;
  };

  const stepMeals = () => <>
    <h1 className="ci__q focus-visible:outline-none" ref={qRef} tabIndex={-1}>Did you eat with anyone today?</h1>
    <p className="ci__hint">Shared meals feed the crew&apos;s teamwork view as a weekly count. Nothing else about the meal is kept.</p>
    <div className="opts" role="radiogroup" aria-label="Shared meals today">
      {([[0, "No"], [1, "Yes, one meal"], [2, "Yes, two or more"]] as const).map(([n, l]) => (
        <button key={n} type="button" className="opt" role="radio" aria-checked={vals.meals === n} onClick={() => { setV(null); setVal({ meals: n }, "meals"); }}>{l}</button>
      ))}
    </div>
    {voice("meals")}
  </>;

  const stepGame = () => {
    const b = baseline(s.me, "rt", P);
    if (game.phase === "done") {
      return <>
        <h1 className="ci__q focus-visible:outline-none" ref={qRef} tabIndex={-1}>Reaction game result</h1>
        <div className="rd-row">
          <Rd l="Median" v={vals.rt} u="ms" d={b && vals.rt != null ? `${fmtDelta("rt", vals.rt - b.med)} vs your normal` : null} />
          <Rd l="Slow taps" v={vals.slow} u={`of ${game.trials.length}`} />
          {b ? <Rd l="Your normal" v={Math.round(b.med)} u="ms" /> : null}
        </div>
        <Plot className="plot game__strip" draw={(w) => tapsSvg(game.trials, w)} />
        <Legend items={[["dot", "One tap"], ["out", "Slower than 500 ms"], ["line", "500 ms"]]} />
        <p className="actions"><button type="button" className="btn" onClick={() => { setGame((g) => ({ ...g, trials: [] })); setVal({ rt: null, slow: null }); arm(); }}>Play again</button></p>
      </>;
    }
    const msg = { ready: "Press Start. A ring appears; tap it as fast as you can.", wait: "Wait for the ring…", go: "", soon: "Too soon. Wait for the ring." }[game.phase];
    return <>
      <h1 className="ci__q focus-visible:outline-none" ref={qRef} tabIndex={-1}>Reaction game</h1>
      <p className="ci__hint">Optional. Ten taps, about 30 seconds. It measures your <Term k="reaction time">reaction time</Term>. Press Space while the field is focused if you prefer the keyboard.</p>
      <div className="game">
        <div className="game__field" ref={fieldRef} tabIndex={0} role="button" aria-label="Reaction game field" aria-describedby="game-status"
          onPointerDown={(e) => { e.preventDefault(); press(e); }}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) press(); } }}>
          {game.phase === "go" ? (
            <span className="game__target" style={{ left: `${game.x}%`, top: `${game.y}%` }}>
              <svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="24" cy="24" r="3" fill="currentColor" /></svg>
            </span>
          ) : null}
          {game.fb ? <span className="game__fb" style={{ left: `${game.fb.x}%`, top: `${game.fb.y}%` }}>{game.fb.t}</span> : null}
          {game.phase === "go" ? null : <span>{msg}</span>}
        </div>
        <div className="actions">
          {game.phase === "ready"
            ? <button type="button" className="btn-primary" onClick={() => { setGame((g) => ({ ...g, trials: [] })); setVal({ rt: null, slow: null }); arm(); }}>Start</button>
            : <button type="button" className="btn-primary" onClick={() => finish(game.trials)}>Stop</button>}
          <span className="t2" id="game-status" aria-live="polite">Tap <Num>{Math.min(10, game.trials.length + (game.phase === "ready" ? 0 : 1))}</Num> of 10</span>
        </div>
      </div>
    </>;
  };

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
  const counter = i < 5 ? <><Num>{i + 1}</Num> of <Num>5</Num></> : k === "game" ? "Bonus · optional" : "Last step";
  const nextLabel = k === "review" ? "Submit check-in" : k === "game" ? (game.phase === "done" ? "Next" : "Skip game") : "Next";
  const primaryDisabled = k !== "review" && k !== "game" && !answered(k);

  return (
    <div className="ci">
      <div className="ci__top">
        <span className="ci__name">Daily check-in</span>
        <div className="ci__bar" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((n) => <i key={n} className={n < segN ? "is-done" : n === segN ? "is-now" : ""} />)}</div>
        <span className="ci__step" aria-live="polite">{counter}</span>
        <Link className="ta ta--quiet ci__exit" href={landing}>Exit</Link>
      </div>
      <div className="ci__body">
        {c.checkedToday() && i === 0 ? <p className="t2 small">Already logged today. Submitting again replaces today&apos;s entry.</p> : null}
        {body}
      </div>
      <div className="ci__foot">
        <div className="actions">{i > 0 ? <button type="button" className="ta ta--quiet" onClick={() => go(i - 1)}><Icon name="back" />Back</button> : null}</div>
        <div className="actions">
          {i < 5 ? <button type="button" className="ta ta--quiet" onClick={() => { setCi((p) => ({ ...p, skipped: { ...p.skipped, [k]: true } })); go(i + 1); }}>Skip</button> : null}
          <button type="button" className={k === "game" && game.phase !== "done" ? "btn btn--lg" : "btn-primary btn--lg"} disabled={primaryDisabled}
            onClick={() => (k === "review" ? submit() : answered(k) && go(i + 1))}>
            {nextLabel} <Icon name="arrow" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Rd({ l, v, u, d }: { l: string; v: number | null; u?: string; d?: string | null }) {
  return <div className="rd"><span className="rd__l">{l}</span><span className="rd__v">{v ?? "—"}{u ? <i>{u}</i> : null}</span>{d != null ? <span className="rd__d">{d}</span> : null}</div>;
}


/* reaction game timing and placement (kept outside the component: impure by design) */
function nextTarget() { return { phase: "go" as const, x: 12 + Math.random() * 76, y: 18 + Math.random() * 64, goAt: performance.now() }; }
function waitMs() { return 900 + Math.random() * 1600; }
function nowMs() { return performance.now(); }
