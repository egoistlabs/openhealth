"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { COMPANION_NAME } from "@/lib/console/data";
import { useConsole } from "./ConsoleProvider";
import { PedroThumb, VegaAvatar, type VegaApi } from "./VegaAvatar";

/* The Pedro bubble (bottom-right). Clicking it opens a small launcher instead of jumping to the
   Pedro page: "Guide me through this page" runs a scripted tour (static text, no AI), and
   "Ask Pedro a question" goes to the Pedro page (a typed question is sent on arrival). */

type Step = { sel: string; text: string };

// Static tour scripts per screen. Steps whose element is not on screen are skipped.
const TOURS: Array<{ match: (p: string) => boolean; title: string; steps: Step[] }> = [
  {
    match: (p) => p === "/", title: "Home",
    steps: [
      { sel: ".idn-wrap", text: "This is you: your role, age, blood type and how you are doing against your own normal." },
      { sel: ".cicard", text: "This is your daily check-in. Once a day we have a quick talk, about 2 minutes, and it keeps your personal baseline up to date." },
      { sel: ".cicard", text: "I ask when you slept and woke, then you tap anywhere that hurts on a body map. Then your mood, how heavy the day was, how well the crew worked together, and whether you shared a meal. Then an optional reaction game." },
      { sel: ".cicard", text: "Why it matters: every answer is compared with your own last 14 sols, never with other crew. Small drifts show up early as Watch flags, so you can act before they add up." },
      { sel: ".cicard", text: "You can tap the answers or just talk to me in plain words. Everything stays private unless you choose to share totals with the crew." },
      { sel: ".mgrid", text: "Today's measures. Click any card to see its full history. Drag the grip to reorder." },
      { sel: "[data-slot='changelog-timeline']", text: "Your flags. Hover a row to read it, click to pin it, and mark the suggestion done." },
      { sel: "#spine", text: "The mission timeline. Drag it to look back at any sol." },
      { sel: ".nav__bottom", text: "Alerts and the Mission log open here, beside the page." },
    ],
  },
  {
    match: (p) => p.startsWith("/crew"), title: "Crew",
    steps: [
      { sel: ".roster", text: "Your crew. Names and specialties only, never anyone's health values." },
      { sel: ".ctiles", text: "The team at a glance: status, check-ins, shared meals, engagement and open flags." },
      { sel: ".mgrid--4", text: "Each area shows how many sharing crew sit outside their own normal." },
      { sel: ".prompts, .ok-line", text: "Support prompts: anonymous nudges to check in on someone." },
      { sel: ".crew__tl", text: "The team log. Hover to read, click to pin." },
    ],
  },
];
const FALLBACK: Step[] = [
  { sel: "#nav", text: "Move between screens here." },
  { sel: "#spine", text: "The mission timeline. Drag it to look back at any sol." },
  { sel: ".hdr__set", text: "Settings: tone, voice and what you share." },
];

export function PedroGuide() {
  const { s, set, atPresent, checkedToday } = useConsole();
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState("");
  const [tour, setTour] = useState<Step[] | null>(null);
  const [i, setI] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // close the launcher on outside click / Esc
  useEffect(() => {
    if (!menu) return;
    const down = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setMenu(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    window.setTimeout(() => input.current?.focus(), 30);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [menu]);

  const startTour = () => {
    const t = TOURS.find((x) => x.match(path));
    const steps = (t ? t.steps : FALLBACK).filter((st) => document.querySelector(st.sel));
    setMenu(false);
    if (!steps.length) return;
    setI(0);
    setTour(steps);
  };
  const ask = (text?: string) => {
    const v = (text ?? q).trim();
    setMenu(false); setQ("");
    set({ ask: v || null, drawer: true, tab: "conversation" });
    router.push("/companion");
  };

  const chips: Array<[string, () => void]> = [
    ["Guide me through this page", startTour],
    ["Ask Pedro a question", () => ask()],
  ];
  if (atPresent && !checkedToday()) chips.push(["Start daily check-in", () => { setMenu(false); router.push("/check-in"); }]);
  chips.push(["Open alerts", () => { setMenu(false); set({ alerts: true, log: false }); }]);
  chips.push(["How did I sleep?", () => ask("How did I sleep?")]);

  return (
    <>
      <div className="pg" ref={wrap}>
        {menu ? (
          <div className="pg__pop" role="dialog" aria-label={`${COMPANION_NAME}: where do you want to go?`}>
            <p className="pg__h">Hi, I&apos;m {COMPANION_NAME}. What do you need?</p>
            <p className="pg__sub">I can walk you through this page, or you can ask me anything.</p>
            <form className="pg__ask" onSubmit={(e) => { e.preventDefault(); ask(); }}>
              <input ref={input} className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. how did I sleep this week?" aria-label={`Ask ${COMPANION_NAME}`} />
              <button type="submit" className="btn-primary">Ask</button>
            </form>
            <div className="pg__chips">
              {chips.map(([l, fn], k) => <button key={l} type="button" className={`chip${k === 0 ? " chip--lead" : ""}`} onClick={fn}>{l}</button>)}
            </div>
          </div>
        ) : null}
        <button type="button" className="orb" aria-label={`${COMPANION_NAME}: guide me or ask a question`} aria-expanded={menu} aria-haspopup="dialog"
          onClick={() => { setTour(null); setMenu((m) => !m); }}>
          <PedroThumb />
        </button>
      </div>
      {tour ? <Tour steps={tour} i={i} setI={setI} voice={s.voice} onDone={() => setTour(null)} /> : null}
    </>
  );
}

/* Spotlight + animated cursor + speech bubble over the current step's element. */
function Tour({ steps, i, setI, voice, onDone }: { steps: Step[]; i: number; setI: (n: number) => void; voice: boolean; onDone: () => void }) {
  const [r, setR] = useState<DOMRect | null>(null);
  const step = steps[i];
  // Pedro's 3D model speaks the step (lip-synced) and drives the subtitle word by word.
  // Until it is ready, or without WebGL, the browser voice / type-out fallback is used instead.
  const vega = useRef<VegaApi | null>(null);
  const [ready, setReady] = useState(false);
  const fb = useSpokenLine(step.text, voice, !ready);
  const [said, setSaid] = useState(0);
  const [talk, setTalk] = useState(false);
  const base = useRef(0);
  useEffect(() => {
    const api = vega.current;
    if (!ready || !api) return;
    base.current = 0;
    const f = window.requestAnimationFrame(() => { setSaid(0); setTalk(true); api.speak(step.text, { silent: !voice }); });
    return () => { window.cancelAnimationFrame(f); api.stop(); };
  }, [ready, step.text, voice]);
  const onSpeech = {
    sentence: (sen: string) => { const k = step.text.indexOf(sen, base.current); if (k >= 0) base.current = k; },
    word: (w: { text: string; start: number }) => setSaid(Math.max(0, Math.min(step.text.length, base.current + w.start + w.text.length))),
    end: () => { setTalk(false); setSaid(step.text.length); },
  };
  const upto = ready ? said : fb.upto, talking = ready ? talk : fb.talking;
  // auto-advance: once Pedro has finished the line, wait a moment, then go to the next step
  const AUTO_MS = 2500;
  const finished = upto >= step.text.length && !talking, isLast = i === steps.length - 1;
  useEffect(() => {
    if (!finished || isLast) return;
    const t = window.setTimeout(() => setI(i + 1), AUTO_MS);
    return () => window.clearTimeout(t);
  }, [finished, isLast, i, setI]);

  const measure = useCallback(() => {
    const el = document.querySelector(step.sel);
    setR(el ? el.getBoundingClientRect() : null);
  }, [step.sel]);

  useLayoutEffect(() => {
    const el = document.querySelector(step.sel);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const f = window.requestAnimationFrame(measure);
    const t = window.setTimeout(measure, 350); // after smooth scroll
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => { window.cancelAnimationFrame(f); window.clearTimeout(t); window.removeEventListener("resize", measure); window.removeEventListener("scroll", measure, true); };
  }, [step.sel, measure]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone();
      if (e.key === "ArrowRight" || e.key === "Enter") { if (i < steps.length - 1) setI(i + 1); else onDone(); }
      if (e.key === "ArrowLeft" && i > 0) setI(i - 1);
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [i, steps.length, setI, onDone]);

  if (!r) return null;
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth, vh = typeof window === "undefined" ? 800 : window.innerHeight;
  // cursor points into the element, near its top-left area
  const cx = Math.min(r.left + Math.min(r.width * 0.35, 120), vw - 40), cy = Math.min(r.top + Math.min(r.height * 0.35, 60), vh - 40);
  const below = cy + 230 < vh;
  const bx = Math.max(12, Math.min(cx + 10, vw - 452)), by = below ? cy + 26 : Math.max(12, cy - 230);
  const last = i === steps.length - 1;

  return (
    <div className="tour" role="dialog" aria-label={`${COMPANION_NAME} guide, step ${i + 1} of ${steps.length}`}>
      <div className="tour__spot" style={{ left: r.left - 6, top: r.top - 6, width: r.width + 12, height: r.height + 12 }} />
      <svg className="tour__cursor" style={{ transform: `translate(${cx}px, ${cy}px)` }} width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 2l7.5 19 2.6-7.6L21 10.8z" />
      </svg>
      {/* not keyed by step: the 3D model stays mounted while the bubble glides between steps */}
      <div className="tour__bub" style={{ left: bx, top: by }}>
        <div className="tour__av" aria-hidden="true">
          <VegaAvatar onReady={(api) => { vega.current = api; setReady(!!api); }} onSpeech={onSpeech} />
        </div>
        <div className="tour__body" key={i}>
        <span className="tour__who">{COMPANION_NAME}{talking ? <span className="tour__wave" aria-hidden="true"><i /><i /><i /><i /></span> : null}</span>
        {/* subtitle: words light up as they are spoken (or typed out when voice is off) */}
        <p className="tour__t" aria-label={step.text}><span className="tour__said">{step.text.slice(0, upto)}</span><span className="tour__rest">{step.text.slice(upto)}</span></p>
        </div>
        {finished && !isLast ? <span className="tour__auto" key={`a${i}`} style={{ animationDuration: `${AUTO_MS}ms` }} aria-hidden="true" /> : null}
        <div className="tour__ctl">
          <span className="tour__n">{i + 1} / {steps.length}</span>
          <span className="tour__btns">
            <button type="button" className="ta ta--quiet" onClick={onDone}>Skip</button>
            {i > 0 ? <button type="button" className="ta" onClick={() => setI(i - 1)}>Back</button> : null}
            <button type="button" className="tour__next" onClick={() => (last ? onDone() : setI(i + 1))}>{last ? "Done" : "Next"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}

/* Speak a line with the browser voice when Voice is on, reporting how much has been said so the
   bubble can light words up like a subtitle. Without voice (or support) the line types out. */
function useSpokenLine(text: string, voice: boolean, enabled = true) {
  const [upto, setUpto] = useState(0);
  const [talking, setTalking] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true, timer = 0;
    const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
    const typeOut = (from: number) => {
      let n = from;
      const tick = () => { if (!alive) return; n = Math.min(text.length, n + 2); setUpto(n); if (n < text.length) timer = window.setTimeout(tick, 28); };
      tick();
    };
    window.setTimeout(() => { if (alive) { setUpto(0); setTalking(false); } }, 0);
    if (voice && synth) {
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02; u.pitch = 1.05;
      let gotBoundary = false;
      u.onstart = () => { if (!alive) return; setTalking(true); timer = window.setTimeout(() => { if (alive && !gotBoundary) typeOut(0); }, 700); };
      u.onboundary = (e) => {
        if (!alive) return; gotBoundary = true;
        const end = text.indexOf(" ", e.charIndex + 1);
        setUpto(end === -1 ? text.length : end);
      };
      u.onend = () => { if (!alive) return; setTalking(false); setUpto(text.length); };
      u.onerror = () => { if (!alive) return; setTalking(false); typeOut(0); };
      synth.speak(u);
    } else {
      typeOut(0);
    }
    return () => { alive = false; window.clearTimeout(timer); synth?.cancel(); };
  }, [text, voice, enabled]);
  return { upto, talking };
}
