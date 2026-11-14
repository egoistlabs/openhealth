"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { fmtDelta, type Baseline } from "@/lib/console/data";
import { tapsSvg } from "@/lib/console/plots";
import { Legend, Num, StatusMark, Term } from "@/components/ui";
import { Plot } from "./Plot";

const ROUNDS = 10;
type Phase = "ready" | "wait" | "go" | "soon";
export type GameResult = { rt: number; slow: number; trials: number[] };

/* Reaction game (optional check-in step), played with the Space bar:
   the field turns red ("Wait"), then green ("Press Space") after a random pause; press as fast as you can.
   Pressing during red is "Too soon" and that round starts again. Ten rounds; the median is the result.
   Space works anywhere on the page while this step is open; on touch screens, tap the field.
   Each colour is paired with a shape and a word (square + "Wait", circle + "Press Space"). */
export function ReactionGame({ qRef, base, result, onDone, onReset }: {
  qRef: RefObject<HTMLHeadingElement | null>;
  base: Baseline | null;
  result: GameResult | null;
  onDone: (trials: number[]) => void;
  onReset: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [trials, setTrials] = useState<number[]>([]);
  const [last, setLast] = useState<string | null>(null);
  const timer = useRef(0);
  const goAt = useRef(0);

  const arm = () => {
    window.clearTimeout(timer.current);
    setPhase("wait");
    timer.current = window.setTimeout(() => { goAt.current = nowMs(); setPhase("go"); }, waitMs());
  };
  const start = () => { onReset(); setTrials([]); setLast(null); arm(); };
  const stop = (t: number[]) => {
    window.clearTimeout(timer.current);
    setPhase("ready");
    if (t.length >= 3) onDone(t);
    else { setTrials([]); setLast("Stopped. Play at least 3 rounds for a result."); }
  };
  const press = () => {
    if (phase === "ready") { if (!result) start(); return; }
    if (phase === "wait") {
      window.clearTimeout(timer.current);
      setPhase("soon");
      setLast("Too soon. Wait for green.");
      timer.current = window.setTimeout(arm, 1200);
      return;
    }
    if (phase !== "go") return;
    const ms = Math.round(nowMs() - goAt.current);
    const t = [...trials, ms];
    setTrials(t);
    setLast(`${ms} ms`);
    if (t.length >= ROUNDS) stop(t); else arm();
  };

  /* Space anywhere on the page plays; keyup is swallowed too, so a focused button never clicks */
  const pressRef = useRef(press);
  useEffect(() => { pressRef.current = press; });
  useEffect(() => {
    const isSpace = (e: KeyboardEvent) => e.code === "Space" || e.key === " ";
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable='true']");
    const down = (e: KeyboardEvent) => {
      if (!isSpace(e) || typing(e)) return;
      e.preventDefault();
      if (!e.repeat) pressRef.current();
    };
    const up = (e: KeyboardEvent) => { if (isSpace(e) && !typing(e)) e.preventDefault(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (result && phase === "ready") {
    return <>
      <h1 className="ci__q focus-visible:outline-none" ref={qRef} tabIndex={-1}>Reaction game result</h1>
      <div className="rd-row">
        <Rd l="Median" v={result.rt} u="ms" d={base ? `${fmtDelta("rt", result.rt - base.med)} vs your normal` : null} />
        <Rd l="Slow presses" v={result.slow} u={`of ${result.trials.length}`} />
        {base ? <Rd l="Your normal" v={Math.round(base.med)} u="ms" /> : null}
      </div>
      {result.trials.length ? <>
        <Plot className="plot game__strip" draw={(w) => tapsSvg(result.trials, w)} />
        <Legend items={[["dot", "One press"], ["out", "Slower than 500 ms"], ["line", "500 ms"]]} />
      </> : null}
      <p className="actions"><button type="button" className="btn" onClick={start}>Play again</button></p>
    </>;
  }

  const round = Math.min(ROUNDS, trials.length + (phase === "ready" ? 0 : 1));
  return <>
    <h1 className="ci__q focus-visible:outline-none" ref={qRef} tabIndex={-1}>Reaction game</h1>
    <p className="ci__hint">
      Optional, about 30 seconds. It measures your <Term k="reaction time">reaction time</Term>.
      Press <kbd className="kbd">Space</kbd> to start. When the field turns green, press <kbd className="kbd">Space</kbd> as fast as you can.
      On a touch screen, tap the field.
    </p>
    <div className="game">
      <div className="game__field" data-phase={phase} role="button" tabIndex={0} aria-describedby="game-status"
        aria-label={{ ready: "Start the reaction game", wait: "Wait", go: "Press now", soon: "Too soon" }[phase]}
        onPointerDown={(e) => { e.preventDefault(); press(); }}>
        <span className="game__big">
          {phase === "go" ? <><StatusMark state="normal" />Press Space!</>
            : phase === "wait" ? <><StatusMark state="act" />Wait…</>
            : phase === "soon" ? <><StatusMark state="act" />Too soon</>
            : <><kbd className="kbd kbd--lg">Space</kbd>to start</>}
        </span>
        {last && phase !== "go" ? <span className="game__last" aria-hidden="true">{last}</span> : null}
      </div>
      <div className="actions">
        {phase === "ready"
          ? <button type="button" className="btn-primary" onClick={start}>Start</button>
          : <button type="button" className="btn" onClick={() => stop(trials)}>Stop</button>}
        <span className="t2" id="game-status" aria-live="polite">
          Round <Num>{round}</Num> of <Num>{ROUNDS}</Num>{last ? <> · last: {last}</> : null}
        </span>
      </div>
    </div>
  </>;
}

function Rd({ l, v, u, d }: { l: string; v: number | null; u?: string; d?: string | null }) {
  return <div className="rd"><span className="rd__l">{l}</span><span className="rd__v">{v ?? "—"}{u ? <i>{u}</i> : null}</span>{d != null ? <span className="rd__d">{d}</span> : null}</div>;
}

/* timing (kept outside the component: impure by design) */
function waitMs() { return 1000 + Math.random() * 2500; }
function nowMs() { return performance.now(); }
