"use client";

import { useEffect, useRef, useState } from "react";
import { VOICE, type VoicePhrase } from "@/lib/console/data";
import { Presence } from "@/lib/console/presence";
import { Icon } from "@/components/ui";

/* Hold-to-talk, simulated: Listening → Working → Understood | Failed (A2).
   There is no microphone yet; C2 (speech-to-text) replaces the canned phrases. */
export type VState =
  | { kind: "listening"; text: string }
  | { kind: "working"; text: string }
  | { kind: "understood"; heard: string; label: string; value: string }
  | { kind: "failed"; reason: string; heard?: string }
  | null;

const attempts: Record<string, number> = {};
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function useHoldToTalk(ctx: string, opts: { enabled: boolean; onPhrase: (p: VoicePhrase) => void; setV: (v: VState) => void }) {
  const hold = useRef<{ phrase: VoicePhrase; shown: number; t: number; timer?: number } | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; });
  const [down, setDown] = useState(false);

  const start = () => {
    if (hold.current || !optsRef.current.enabled) return;
    const list = VOICE[ctx], phrase = list[(attempts[ctx] || 0) % list.length];
    hold.current = { phrase, shown: 0, t: Date.now() };
    setDown(true);
    Presence.setState("listening");
    const tick = () => {
      const h = hold.current; if (!h) return;
      h.shown = Math.min(h.phrase.text.length, h.shown + 1);
      optsRef.current.setV({ kind: "listening", text: h.phrase.text.slice(0, h.shown) });
      h.timer = window.setTimeout(tick, 42);
    };
    tick();
  };
  const end = () => {
    const h = hold.current; if (!h) return;
    hold.current = null; window.clearTimeout(h.timer); setDown(false);
    const { setV, onPhrase } = optsRef.current;
    if (Date.now() - h.t < 350) { Presence.setState("idle"); setV({ kind: "failed", reason: "That was too short to understand. Hold while you speak, or use taps." }); return; }
    attempts[ctx] = (attempts[ctx] || 0) + 1;
    Presence.setState("working");
    setV({ kind: "working", text: h.phrase.text });
    window.setTimeout(() => {
      Presence.setState("idle");
      const p = h.phrase;
      if (p.fail) { setV({ kind: "failed", heard: p.text, reason: p.fail }); return; }
      onPhrase(p);
    }, reduced() ? 60 : 650);
  };

  useEffect(() => {
    const up = () => end();
    document.addEventListener("pointerup", up);
    document.addEventListener("pointercancel", up);
    return () => { document.removeEventListener("pointerup", up); document.removeEventListener("pointercancel", up); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bind = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* optional */ } start(); },
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); if (!e.repeat) start(); } },
    onKeyUp: (e: React.KeyboardEvent) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); end(); } },
  };
  return { bind, down };
}

export function HoldButton({ ctx, quiet, enabled, onPhrase, setV, tip }: {
  ctx: string; quiet?: boolean; enabled: boolean; onPhrase: (p: VoicePhrase) => void; setV: (v: VState) => void; tip: string;
}) {
  const { bind, down } = useHoldToTalk(ctx, { enabled, onPhrase, setV });
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
