"use client";

import { useEffect, useRef, useState } from "react";
import { VOICE, type VoicePhrase } from "@/lib/console/data";
import { Presence } from "@/lib/console/presence";
import { Icon } from "@/components/ui";
import { createSpeechRecognition, recognitionErrorMessage } from "@/lib/speech/recognition";

/* Hold-to-talk. The companion uses the browser's speech recognizer (C2);
   the check-in keeps the scripted phrases until its own parsing lands. */
export type VState =
  | { kind: "listening"; text: string }
  | { kind: "working"; text: string }
  | { kind: "understood"; heard: string; label: string; value: string }
  | { kind: "failed"; reason: string; heard?: string }
  | null;

type SimHold = { phrase: VoicePhrase; shown: number; t: number; timer?: number };

type LiveSession = {
  rec: SpeechRecognition | null;
  startedAt: number;
  held: boolean;
  stopRequested: boolean;
  done: boolean;
  ended: boolean;
  error?: string;
  restarts: number;
  /* final text from earlier recognizer restarts, then this instance's results */
  committed: string;
  finalText: string;
  interimText: string;
  endTimer?: number;
  restartTimer?: number;
};

const attempts: Record<string, number> = {};
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const joinTranscript = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(" ");
const transcriptOf = (s: LiveSession) => joinTranscript(s.committed, s.finalText, s.interimText);

export function useHoldToTalk(ctx: string, opts: {
  enabled: boolean;
  onPhrase: (p: VoicePhrase) => void;
  setV: (v: VState) => void;
  /** true: real microphone transcription; false: scripted phrase (check-in). */
  live?: boolean;
  /** called before listening starts, e.g. to stop the companion's voice. */
  onStart?: () => void;
}) {
  const sim = useRef<SimHold | null>(null);
  const live = useRef<LiveSession | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });
  const [down, setDown] = useState(false);

  const clearTimers = (s: LiveSession) => {
    if (s.endTimer) window.clearTimeout(s.endTimer);
    if (s.restartTimer) window.clearTimeout(s.restartTimer);
  };

  const failLive = (s: LiveSession, reason: string) => {
    if (s.done) return;
    s.done = true;
    clearTimers(s);
    if (live.current === s) live.current = null;
    setDown(false);
    try { s.rec?.abort(); } catch { /* already stopped */ }
    Presence.setState("idle");
    optsRef.current.setV({ kind: "failed", reason });
  };

  const finishLive = (s: LiveSession) => {
    if (s.done) return;
    s.done = true;
    clearTimers(s);
    if (live.current === s) live.current = null;
    setDown(false);
    Presence.setState("idle");
    const text = transcriptOf(s);
    if (text) {
      optsRef.current.onPhrase({ text });
      return;
    }
    optsRef.current.setV({
      kind: "failed",
      reason: s.error && s.error !== "no-speech"
        ? recognitionErrorMessage(s.error)
        : "Didn't catch a question. Try again, or type instead.",
    });
  };

  const armLive = (s: LiveSession) => {
    /* a recognizer can end after a pause; retire its handlers before arming a new one */
    const old = s.rec;
    if (old) { old.onresult = null; old.onerror = null; old.onend = null; }

    const rec = createSpeechRecognition();
    if (!rec) {
      failLive(s, "Speech recognition is not available in this browser. Type instead.");
      return;
    }
    s.rec = rec;
    s.ended = false;

    rec.onresult = (e) => {
      if (s.done) return;
      let finalText = "";
      let interimText = "";
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      s.finalText = finalText;
      s.interimText = interimText;
      const heard = transcriptOf(s);
      optsRef.current.setV({ kind: "listening", text: heard });
    };

    rec.onerror = (e) => {
      if (s.done) return;
      if (e.error === "aborted") return; // we aborted it ourselves
      s.error = e.error;
      if (e.error !== "no-speech") failLive(s, recognitionErrorMessage(e.error));
    };

    rec.onend = () => {
      if (s.done) return;
      s.ended = true;
      if (s.endTimer) { window.clearTimeout(s.endTimer); s.endTimer = undefined; }
      /* continuous mode still ends after a pause in some browsers, and Chrome
         reports no-speech while the mic is held. Keep listening until release. */
      if (!s.stopRequested && s.held && (!s.error || s.error === "no-speech")) {
        if (s.restarts >= 20) {
          failLive(s, "Speech recognition keeps stopping. Try again, or type instead.");
          return;
        }
        if (s.error === "no-speech") s.error = undefined;
        s.restarts += 1;
        s.committed = joinTranscript(s.committed, s.finalText, s.interimText);
        s.finalText = "";
        s.interimText = "";
        s.restartTimer = window.setTimeout(() => {
          if (!s.done && s.held && !s.stopRequested && (!s.error || s.error === "no-speech")) armLive(s);
        }, 120);
        return;
      }
      finishLive(s);
    };

    try {
      rec.start();
    } catch {
      finishLive(s);
    }
  };

  const startLive = () => {
    const s: LiveSession = {
      rec: null,
      startedAt: Date.now(),
      held: true,
      stopRequested: false,
      done: false,
      ended: false,
      restarts: 0,
      committed: "",
      finalText: "",
      interimText: "",
    };
    live.current = s;
    setDown(true);
    Presence.setState("listening");
    optsRef.current.setV({ kind: "listening", text: "" });
    armLive(s);
  };

  const endLive = () => {
    const s = live.current;
    if (!s || s.done) return;
    s.held = false;
    const heard = transcriptOf(s);
    if (Date.now() - s.startedAt < 350 && !heard) {
      failLive(s, "That was too short to understand. Hold while you speak, or use taps.");
      return;
    }
    s.stopRequested = true;
    Presence.setState("working");
    optsRef.current.setV({ kind: "working", text: heard || "…" });
    if (s.ended) { finishLive(s); return; }
    /* if the engine never reports end, finish with what we have */
    s.endTimer = window.setTimeout(() => finishLive(s), 1600);
    try { s.rec?.stop(); } catch { finishLive(s); }
  };

  const startSim = () => {
    const list = VOICE[ctx];
    if (!list?.length) return;
    const phrase = list[(attempts[ctx] || 0) % list.length];
    const h: SimHold = { phrase, shown: 0, t: Date.now() };
    sim.current = h;
    setDown(true);
    Presence.setState("listening");
    const tick = () => {
      const cur = sim.current; if (!cur) return;
      cur.shown = Math.min(cur.phrase.text.length, cur.shown + 1);
      optsRef.current.setV({ kind: "listening", text: cur.phrase.text.slice(0, cur.shown) });
      cur.timer = window.setTimeout(tick, 42);
    };
    tick();
  };

  const endSim = () => {
    const h = sim.current; if (!h) return;
    sim.current = null; window.clearTimeout(h.timer); setDown(false);
    if (Date.now() - h.t < 350) {
      Presence.setState("idle");
      optsRef.current.setV({ kind: "failed", reason: "That was too short to understand. Hold while you speak, or use taps." });
      return;
    }
    attempts[ctx] = (attempts[ctx] || 0) + 1;
    Presence.setState("working");
    optsRef.current.setV({ kind: "working", text: h.phrase.text });
    window.setTimeout(() => {
      Presence.setState("idle");
      const p = h.phrase;
      if (p.fail) { optsRef.current.setV({ kind: "failed", heard: p.text, reason: p.fail }); return; }
      optsRef.current.onPhrase(p);
    }, reduced() ? 60 : 650);
  };

  const start = () => {
    if (sim.current || live.current) return;
    const o = optsRef.current;
    if (!o.enabled) return;
    o.onStart?.();
    if (o.live) startLive(); else startSim();
  };

  const end = () => {
    if (live.current) endLive();
    else if (sim.current) endSim();
  };

  useEffect(() => {
    const up = () => end();
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => { document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* release the microphone if the button disappears or the screen unmounts */
  useEffect(() => () => {
    const s = live.current;
    if (s) {
      s.done = true;
      clearTimers(s);
      try { s.rec?.abort(); } catch { /* already stopped */ }
      live.current = null;
    }
    const h = sim.current;
    if (h) { window.clearTimeout(h.timer); sim.current = null; }
  }, []);

  useEffect(() => {
    if (opts.enabled) return;
    const s = live.current;
    if (s) {
      s.done = true;
      clearTimers(s);
      try { s.rec?.abort(); } catch { /* already stopped */ }
      live.current = null;
      setDown(false);
    }
    const h = sim.current;
    if (h) { window.clearTimeout(h.timer); sim.current = null; setDown(false); }
  }, [opts.enabled]);

  const bind = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* optional */ } start(); },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) start(); } },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); end(); } },
  };
  return { bind, down };
}

export function HoldButton({ ctx, quiet, enabled, onPhrase, setV, tip, live, onStart }: {
  ctx: string; quiet?: boolean; enabled: boolean; onPhrase: (p: VoicePhrase) => void; setV: (v: VState) => void; tip: string; live?: boolean; onStart?: () => void;
}) {
  const { bind, down } = useHoldToTalk(ctx, { enabled, onPhrase, setV, live, onStart });
  return quiet ? (
    <button type="button" className={`hold hold--quiet${down ? " is-down" : ""}`} data-tip={tip} {...bind}><Icon name="mic" />Or hold to answer by voice</button>
  ) : (
    <button type="button" className={`hold hold--icon${down ? " is-down" : ""}`} aria-label="Hold to speak" data-tip={tip} {...bind}><Icon name="mic" /></button>
  );
}

export function VoiceState({ v, inCheckin, onCorrect, onType }: { v: VState; inCheckin: boolean; onCorrect?: () => void; onType?: () => void }) {
  if (!v) return null;
  return (
    <div className={`vstate vstate--${v.kind}`} role="status">
      {v.kind === "listening" && <><span className="label">Listening</span><span className="t2">{v.text}<span className="caret" aria-hidden="true" /></span></>}
      {v.kind === "working" && <><span className="label">Working</span><span className="t2">&ldquo;{v.text}&rdquo;</span></>}
      {v.kind === "understood" && <>
        <span className="label">Understood</span><span className="pv"><span className="w">{v.label}</span>{v.value}</span>
        <button type="button" className="ta ta--quiet" onClick={onCorrect}>Correct</button>
        <span className="t2 small">Heard: &ldquo;{v.heard}&rdquo;</span>
      </>}
      {v.kind === "failed" && <>
        <span className="label">Didn&apos;t catch that</span><span>{v.reason}</span>
        {inCheckin ? null : <button type="button" className="ta ta--quiet" onClick={onType}>Type instead</button>}
      </>}
    </div>
  );
}
