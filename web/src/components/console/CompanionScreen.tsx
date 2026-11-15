"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCompanionChat } from "@/hooks/companion/mutations/use-companion-chat";
import {
  COMPANION_NAME, JOURNAL, MEASURES, P, avg, day, companionNumbers, crewById, flagCopy, fmt, fmtBase, hasBaseline, hm, insights, isOut, overall, series,
  type ConvoRow, type VoicePhrase,
} from "@/lib/console/data";
import { Presence } from "@/lib/console/presence";
import { codeReply, isStatusQuestion, readFacts } from "@/lib/brain/facts";
import { holdEmotion, replyEmotion, restEmotion } from "@/lib/console/emotion";
import { Num, StatusMark, Toggle } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { FlagList } from "./FlagCard";
import { Wave, usePresenceState } from "./Orb";
import { VegaAvatar, type SpeechEvents, type VegaApi } from "./VegaAvatar";
import { ROUTE } from "./Shell";
import { arrivedSince, notesByIds, useAllEarthNotes, type EarthNote } from "@/lib/console/earth-notes";
import { fmtSize, openAttachment } from "@/lib/console/earth-files";
import { HoldButton, VoiceState, type VState } from "./Voice";

/* Starter questions (D7). Replace with Paul's starter-question list when it lands. */
const CHIPS: Array<[string, string]> = [["How did I sleep?", "sleep"], ["Anything I should watch?", "watch"], ["Sum up my week", "summary"]];

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Companion: talk to the companion (A7, A2, A9; C5, C10, C11). */
export function CompanionScreen() {
  const { s } = useConsole();
  /* remount per person/sol so the seeded history matches the log being shown */
  return <CompanionStage key={`${s.me}-${s.sol}`} />;
}

function CompanionStage() {
  const c = useConsole();
  const { s, set, atPresent } = c;
  const pstate = usePresenceState();
  const [busyLocal, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [v, setV] = useState<VState>(null);
  const [typeMode, setTypeMode] = useState(false);
  const [text, setText] = useState("");
  const [jSel, setJSel] = useState(0);
  const [jSummary, setJSummary] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const trRef = useRef<HTMLDivElement>(null);
  const typeTimer = useRef(0);
  const lastIntent = useRef<string | undefined>(undefined);
  const vega = useRef<VegaApi | null>(null);
  /* live captions: the reply being spoken, revealed up to the word the avatar is saying */
  const [reveal, setReveal] = useState<{ row: ConvoRow; upto: number } | null>(null);
  const said = useRef<{ row: ConvoRow; text: string; base: number; cursor: number; upto: number } | null>(null);
  const onSpeech: SpeechEvents = {
    sentence: (sentence) => {
      const sp = said.current; if (!sp) return;
      const i = sp.text.indexOf(sentence, sp.cursor);
      sp.base = i >= 0 ? i : sp.cursor;
      sp.cursor = sp.base + sentence.length;
      setReveal({ row: sp.row, upto: sp.upto }); // first sentence: show the (still empty) caption straight away
    },
    word: (w) => {
      const sp = said.current; if (!sp) return;
      sp.upto = Math.max(sp.upto, Math.min(sp.text.length, sp.base + w.start + w.text.length));
      setReveal({ row: sp.row, upto: sp.upto });
    },
    end: () => { said.current = null; setReveal(null); },
  };

  const rows = c.convo();
  /* rows already in the log when the screen opened are history: they are shown, not spoken */
  const spoken = useRef(rows.length);
  useEffect(() => { if (s.tab === "conversation" && trRef.current) trRef.current.scrollTop = trRef.current.scrollHeight; }, [rows.length, s.tab, s.drawer]);
  /* whenever a new line lands in the conversation (a question or Pedro's answer, from any input path),
     open the log on Conversation so the astronaut can read it */
  const [trail, setTrail] = useState<string[]>([]);
  const seen = useRef(rows.length);
  useEffect(() => {
    if (rows.length > seen.current && atPresent) set({ drawer: true, tab: "conversation" });
    seen.current = rows.length;
  }, [rows.length, atPresent, set]);
  useEffect(() => () => { window.clearTimeout(typeTimer.current); Presence.setState("idle"); }, []);

  const chat = useCompanionChat({
    /* the model is off or failed: answer from the person's own numbers, with the same code-written
       reply the server falls back to, so the wording and the rows match */
    onOffline: (q) => {
      const facts = readFacts(companionNumbers(s.me, s.sol));
      if (facts && hasBaseline(s.me, s.sol) && (isStatusQuestion(q) || lastIntent.current === "sleep" || lastIntent.current === "watch")) {
        const reply = codeReply(facts, q);
        speak({ who: "companion", offline: true, text: reply.message, facts: reply.rows, action: reply.action ?? undefined });
        return;
      }
      speak({ who: "companion", offline: true, text: localReply(q) ?? "The companion is unavailable right now, so I can't answer that. Your check-in and measures still work." });
    },
  });
  const busy = busyLocal || chat.streaming;

  /* The server never sends the model's unchecked draft: the companion thinks until the checked
     answer lands in the log, and only then shows and speaks it (below). */
  useEffect(() => {
    if (chat.status === "submitted" || chat.status === "streaming") Presence.setState("working");
    else if (!vega.current?.speaking) Presence.setState("idle");
  }, [chat.status]);

  /* faces chosen from the scenario (lib/console/emotion.ts) */
  const worst = overall(s.me, s.sol);
  useEffect(() => { vega.current?.setRestEmotion(restEmotion(worst)); }, [worst]);
  useEffect(() => {
    vega.current?.hold(holdEmotion({ working: busy, listening: pstate === "listening", typing: text.trim().length > 0 }));
  }, [busy, pstate, text]);
  /* speak each new companion reply aloud, with the face for its scenario. A layout effect, so the
     reply is hidden before the first paint and then revealed word by word as it is said. */
  useLayoutEffect(() => {
    if (rows.length <= spoken.current) return;
    const fresh = rows.slice(spoken.current);
    spoken.current = rows.length;
    const reply = [...fresh].reverse().find((r) => r.who === "companion" && r.text && !r.restored);
    if (!reply || reply.stopped || !vega.current) return;
    /* the answer first, so its opening sentence stands on its own; the suggested action last */
    const aloud = reply.action ? `${reply.text} Worth trying: ${reply.action}` : reply.text!;
    said.current = { row: reply, text: aloud, base: 0, cursor: 0, upto: 0 };
    vega.current.speak(aloud, { emotion: replyEmotion(reply, worst), silent: !s.voice });
  }, [rows, worst, s.voice]);

  /* what the app can say without the model or the numbers */
  const localReply = (q: string) => {
    if (/check-?in|start/.test(q.toLowerCase())) return c.checkedToday() ? "Today's check-in is done." : "Check-in is open. Five taps, about a minute, and any question can be skipped.";
    return null;
  };

  /* typewriter, with the orb in its speaking state, then the row is added to the conversation */
  const speak = (row: Omit<ConvoRow, "sol" | "min">) => {
    const full = row.text || "";
    const finish = () => { setSpeaking(null); setBusy(false); Presence.setState("idle"); c.addLines([row]); c.say(`Companion: ${full}`); };
    // the 3D avatar speaks the reply aloud once it is in the log, so no typewriter is needed
    if (reducedMotion() || !full || vega.current) { finish(); return; }
    Presence.setState("speaking");
    let i = 0;
    const tick = () => {
      i = Math.min(full.length, i + 2);
      setSpeaking(full.slice(0, i));
      const ch = full[i - 1] || " ";
      Presence.setAmp(/[aeiou]/i.test(ch) ? 0.65 : /[a-z]/i.test(ch) ? 0.38 : /\s/.test(ch) ? 0.1 : 0.02);
      if (i < full.length) typeTimer.current = window.setTimeout(tick, 34); else finish();
    };
    tick();
  };

  const userSaid = (q: string, intent?: string) => {
    if (busy) return;
    setTrail([]);
    vega.current?.stop();
    lastIntent.current = intent;
    // open the log on the conversation so the astronaut sees their question and the answer land
    set({ chatted: true, settings: false, drawer: true, tab: "conversation" });
    c.addLines([{ who: "you", text: q }]);
    /* Messages from Earth: what the flight surgeon sent that has reached Mars since the last check-in.
       Pedro's summary is written by code from the notes (no model), and the log row shows each note in full. */
    if (intent === "earth" || (/earth|ground|flight surgeon|mission control/i.test(q) && /message|note|advice|sent|send|said/i.test(q))) {
      setBusy(true);
      Presence.setState("working");
      window.setTimeout(() => {
        Presence.setState("idle"); setBusy(false);
        const { text, notes } = earthSummary(s.me, c.clockMin);
        c.addLines([{ who: "companion", text }]);
        set({ drawer: true, tab: notes.length ? "earth" : "conversation" }); // the full messages live in the From Earth tab
        c.say(text);
      }, reducedMotion() ? 80 : 600);
      return;
    }
    if (intent === "summary" || /summar|recap|my week/i.test(q)) {
      setBusy(true);
      Presence.setState("working");
      window.setTimeout(() => {
        Presence.setState("idle"); setBusy(false);
        c.addLines([{ who: "companion", text: "Your week summary is in the log." }, { who: "summary" }]);
        set({ drawer: true, tab: "conversation" });
        c.say("Week summary added to the log.");
      }, reducedMotion() ? 80 : 600);
      return;
    }
    chat.send(q);
  };

  /* a question typed in the Pedro launcher on another screen: send it once on arrival */
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !s.ask || !atPresent) return;
    asked.current = true;
    const q = s.ask;
    set({ ask: null });
    userSaid(q);
  });

  /* voice on the companion: a rating heard in speech goes into today's check-in draft (C3) */
  const onPhrase = (p: VoicePhrase) => {
    setV(null);
    if (p.parse && p.parse.key !== "meals" && p.parse.key !== "sleep") {
      const key = p.parse.key, n = p.parse.v!;
      set((prev) => ({ chatted: true, drawer: true, tab: "conversation", draft: { ...prev.draft, [key]: n } }));
      const b = c.st(key).base, usual = b ? Math.round(b.med) : null;
      c.addLines([
        { who: "you", text: p.text },
        { who: "parsed", label: p.parse.label, value: `${n} of 5`, key },
      ]);
      setBusy(true);
      speak({ who: "companion", text: `${p.parse.label} ${n} of 5, added to today's check-in.${usual != null && n !== usual ? ` Your normal is ${usual}.` : ""}` });
      return;
    }
    userSaid(p.text, p.intent);
  };

  /* What shows under the avatar:
     - while the answer is being prepared: nothing but "Thinking…" (the streamed draft is never shown)
     - while the avatar speaks: the reply, revealed up to the word being said
     - otherwise: the last reply in full, with its sources */
  /* live work trail for the log: each progress step Pedro passes through on this turn */
  if (chat.progress && trail[trail.length - 1] !== chat.progress) setTrail([...trail, chat.progress]);
  const working = chat.streaming || !!chat.progress ? (trail.length ? trail : ["thinking"]) : null;

  const lastReply = [...rows].reverse().find((x) => x.who === "companion" && x.text);
  const thinking = chat.streaming;
  const shown = thinking
    ? undefined
    : reveal
      ? { ...reveal.row, text: reveal.row.text!.slice(0, reveal.upto) }
      : speaking != null
        ? { who: "companion" as const, text: speaking, sol: P, min: 0 }
        : lastReply;

  /* notes from Earth that have reached the hab since the last check-in (re-reads when a note is added) */
  useAllEarthNotes();
  const lastCi = lastCheckin(s.me);
  const earthNew = atPresent && lastCi ? arrivedSince(s.me, lastCi.sol, lastCi.min, P, c.clockMin).length : 0;

  return (
    <div className={`cstage${s.drawer ? " has-drawer" : ""}`}>
      <h1 className="vh">Companion, {crewById(s.me).full}</h1>
      <div className="cmain">
        <section className="stage" aria-label={COMPANION_NAME}>
          <div className="stage__tools">
            <Toggle on={s.voice} label="Voice" onClick={() => { set((p) => ({ voice: !p.voice })); setTypeMode(false); }} />
            {/* Pedro sums up what the flight surgeon sent since the last check-in; the badge counts notes that have arrived */}
            <button type="button" className="ta ta--quiet" disabled={busy || !atPresent} onClick={() => userSaid("What did Earth send me?", "earth")}
              aria-label={`Messages from Earth${earthNew ? `, ${earthNew} new since your check-in` : ""}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              Messages from Earth
              {earthNew ? <span className="num" style={{ minWidth: 18, padding: "0 5px", borderRadius: 999, background: "var(--c-action)", color: "var(--c-on-action)", fontSize: 11, lineHeight: "18px", textAlign: "center" }}>{earthNew}</span> : null}
            </button>
            <button type="button" className="ta ta--quiet" aria-expanded={s.drawer} aria-controls="drawer" onClick={() => set((p) => ({ drawer: !p.drawer }))}>{s.drawer ? "Hide log" : "Show log"}</button>
          </div>
          {<>
            <div className="vega-wrap">
              <VegaAvatar onSpeech={onSpeech} onReady={(api) => {
                vega.current = api;
                api?.setRestEmotion(restEmotion(worst));
              }} />
              {/* thought bubble while Pedro works on an answer (before he starts speaking) */}
              {(working || busy) && speaking == null && reveal == null ? (
                <span className="think" aria-hidden="true" key={working?.[working.length - 1] ?? "busy"}>
                  <i className="think__s think__s--1" /><i className="think__s think__s--2" />
                  <span className="think__cloud"><span className="think__dots"><i /><i /><i /></span></span>
                </span>
              ) : null}
            </div>
            <Reply row={shown} live={reveal != null || speaking != null} progress={chat.progress} />
          </>}
        </section>

        <div className="chat" id="chat">
          {!atPresent ? (
            <p className="small t2">Viewing Sol {s.sol}. The conversation from that sol is read-only. <button type="button" className="ta" onClick={() => set({ sol: P })}>Return to today</button></p>
          ) : <>
            {!s.chatted && !busy ? (
              <div className="chips" role="group" aria-label="Suggested questions">
                {CHIPS.map(([t, i]) => <button key={i} type="button" className="chip" onClick={() => userSaid(t, i)}>{t}</button>)}
              </div>
            ) : null}
            <VoiceState v={v} inCheckin={false} onType={() => { setTypeMode(true); setV(null); inputRef.current?.focus(); }} />
            <form className="chat__row" onSubmit={(e) => {
              e.preventDefault();
              const q = text.trim();
              if (!q || busy) return;
              setText("");
              userSaid(q);
            }}>
              <label className="vh" htmlFor="say">Message to Pedro</label>
              <input ref={inputRef} className="field field--chat" id="say" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)}
                placeholder={s.voice && !typeMode ? "Type a message, or hold the mic to talk" : "Type a message"} maxLength={2000} />
              {s.voice ? <>
                <Wave />
                <HoldButton ctx="companion" live enabled={s.voice && !busy} onPhrase={onPhrase} setV={setV}
                  onStart={() => { vega.current?.stop(); Presence.setState("idle"); }} tip="Hold to talk" />
              </> : null}
              {chat.streaming ? (
                <button type="button" className="ta" onClick={chat.stop}>Stop</button>
              ) : (
                <button type="submit" className="btn-primary" disabled={busy}>Send</button>
              )}
            </form>
            <p className="presence vh">Companion: <span id="pstate">{{ idle: "Idle", listening: "Listening", working: "Working", speaking: "Speaking" }[pstate]}</span></p>
          </>}
        </div>
      </div>

      <section className={`drawer${s.drawer ? " is-open" : ""}`} id="drawer" aria-label="Companion log" hidden={!s.drawer}>
        {s.drawer ? <Drawer working={working} trRef={trRef} jSel={jSel} setJSel={setJSel} jSummary={jSummary} setJSummary={setJSummary} /> : null}
      </section>
    </div>
  );
}

/* What the companion is doing while a turn runs. Shown instead of the model's unchecked draft. */
const STEP: Record<string, string> = {
  searching: "Looking at what I have on board",
  thinking: "Reading your question",
  writing: "Writing an answer",
  checking: "Checking the answer",
};

/* The first sentence is the answer and is what gets read at a glance; the rest supports it. */
function splitLead(text: string): [string, string] {
  const cut = text.search(/(?<=[.!?])\s+/);
  return cut === -1 ? [text, ""] : [text.slice(0, cut), text.slice(cut).trim()];
}

/* The checked answer under the avatar, laid out to be read at a glance: the answer sentence, the
   measures that are off (rows built from the numbers, not from the model's words), the one
   suggested action, then the sources folded to their titles (A9, C8, C10, C11). */
function Reply({ row, live, progress }: { row?: ConvoRow; live: boolean; progress?: string }) {
  if (progress) {
    return <p className="stage__reply text-text-2" role="status">{STEP[progress] ?? STEP.thinking}<span className="caret" aria-hidden="true" /></p>;
  }
  if (!row) return <p className="stage__reply">Nothing said yet. Hold to speak or type below.</p>;
  const plain = live || row.escalation || row.noAnswer || row.stopped;
  const [lead, rest] = plain ? [row.text ?? "", ""] : splitLead(row.text ?? "");
  return (
    <div className="grid max-h-[46vh] w-full max-w-[min(96%,1100px)] auto-rows-max content-start justify-items-center gap-3 overflow-y-auto text-center">
      {row.escalation ? <EscalationNotice /> : null}
      {row.noAnswer && !live ? <p className="label">Not on board</p> : null}
      {row.stopped ? <p className="label">Stopped</p> : null}
      <p className="reply__lead">
        {lead}{live ? <span className="caret" aria-hidden="true" /> : null}
      </p>
      {rest ? <p className="text-text-2">{rest}</p> : null}
      {!live ? <AnswerFacts facts={row.facts} action={row.action} /> : null}
      {!live && row.offline ? <p className="small t2">The companion model is off. This answer comes from your own numbers only.</p> : null}
      {!live ? <AnswerSources sources={row.sources} /> : null}
    </div>
  );
}

/* The measures that are off and the one thing to try. Both come from the app's numbers. */
function AnswerFacts({ facts, action }: { facts?: ConvoRow["facts"]; action?: string }) {
  if (!facts?.length && !action) return null;
  return (
    <div className="grid w-full gap-2 border-t border-hair pt-3 text-left">
      {facts?.length ? (
        <dl className="dl">
          {facts.map((f) => (
            <div key={f.key} className="contents">
              <dt>{f.label}</dt>
              <dd>{f.value} <span className="t2">· {f.detail}</span></dd>
            </div>
          ))}
        </dl>
      ) : null}
      {action ? <p><span className="label">Worth trying </span>{action}</p> : null}
    </div>
  );
}

function EscalationNotice() {
  return (
    <div role="alert" className="flex items-start gap-2 border-l-2 border-act bg-surface-2 px-3 py-2 text-left text-body">
      <StatusMark state="act" />
      <span><b className="text-act-text">Tell the flight surgeon now.</b> This may need medical attention. The companion does not handle this; it is passed to the crew medical officer.</span>
    </div>
  );
}

/* Sources folded down to their titles; opening it shows where each came from and who signed it off. */
function AnswerSources({ sources }: { sources?: ConvoRow["sources"] }) {
  if (!sources?.length) return null;
  return (
    <details className="w-full text-left small text-text-2">
      <summary className="cursor-pointer"><span className="th">Sources</span> {sources.map((x) => x.title).join(" · ")}</summary>
      <ul className="mt-1 grid gap-1">
        {sources.map((x) => (
          <li key={x.id}>
            <span className="text-text">{x.title}</span> · {x.source} · added {x.added} · authorised by {x.authorised_by}
          </li>
        ))}
      </ul>
    </details>
  );
}


/* ---------- companion log drawer: conversation, alerts, insights, journal ---------- */
function Drawer({ working, trRef, jSel, setJSel, jSummary, setJSummary }: {
  working: string[] | null;
  trRef: React.RefObject<HTMLDivElement | null>; jSel: number; setJSel: (n: number) => void; jSummary: boolean; setJSummary: (b: boolean) => void;
}) {
  const c = useConsole();
  const { s, set, atPresent } = c;
  const n = c.openFlags().length;
  const tabs: Array<[ConsoleTab, string]> = [["conversation", "Conversation"], ["alerts", "Alerts"], ["insights", "Insights"], ["journal", "Journal"], ["earth", "Earth"]];
  /* From Earth: every note that has reached the hab by now (newest sol first), and how many arrived since the last check-in */
  useAllEarthNotes();
  const earthAll = arrivedSince(s.me, 0, -1, s.sol, c.clockMin);
  const lastCi = lastCheckin(s.me);
  const earthNew = atPresent && lastCi ? arrivedSince(s.me, lastCi.sol, lastCi.min, P, c.clockMin).length : 0;
  const empty = (t: string, a?: React.ReactNode) => <div className="empty"><span>{t}</span>{a}</div>;

  let pane: React.ReactNode;
  if (s.tab === "alerts") {
    const f = c.flagsFor();
    pane = !hasBaseline(s.me, s.sol) ? empty("No open alerts.", <span className="small t2">Alerts start once your baseline exists.</span>)
      : f.length ? <FlagList flags={f} ctx="a" /> : empty("No open alerts.", <Link className="ta" href={ROUTE.home}>See Home</Link>);
  } else if (s.tab === "insights") {
    const ins = hasBaseline(s.me, s.sol) ? insights(s.me, s.sol) : [];
    pane = ins.length ? ins.map((x, i) => (
      <div key={i} className="list-row"><span className="list-row__t">Sol {x.sol}</span>
        <span className={x.kind === "observation" ? "obs-row" : ""}>{x.kind === "observation" ? <><span className="label">Observation</span> </> : <><StatusMark state={x.state} /> </>}{x.text}</span><span /></div>
    )) : empty("Insights appear after a few check-ins.", atPresent ? <Link className="ta" href={ROUTE.checkin}>Start daily check-in</Link> : undefined);
  } else if (s.tab === "earth") {
    const sols = [...new Set(earthAll.map((x) => x.sol))].sort((a, b) => b - a);
    pane = sols.length ? <>
      <p className="small t2">Advice from the flight surgeon on Earth, as it reached the hab. Use Messages from Earth at the top for {COMPANION_NAME}&apos;s summary.</p>
      {sols.map((t) => (
        <div key={t} style={{ display: "grid", gap: 6 }}>
          <div className="tr-sol">Sol <Num>{t}</Num>{t === P ? " · today" : ""}</div>
          <EarthList notes={earthAll.filter((x) => x.sol === t).reverse()} />
        </div>
      ))}
    </> : empty("Nothing from Earth yet.", <span className="small t2">Notes from the flight surgeon appear here once they reach the hab.</span>);
  } else if (s.tab === "journal") {
    const es = (JOURNAL[s.me] || []).filter((j) => j.sol <= s.sol).slice().reverse();
    if (!es.length) pane = empty("No entries yet.", <button type="button" className="ta" onClick={() => set({ tab: "conversation" })}>Talk to Pedro</button>);
    else {
      const sel = es[Math.min(jSel, es.length - 1)];
      pane = <>
        <p className="small t2">Visible only to {crewById(s.me).full}.</p>
        {jSummary ? <><WeekSummary /><button type="button" className="ta ta--quiet" onClick={() => setJSummary(false)}>Close summary</button></>
          : <p className="actions"><button type="button" className="ta" onClick={() => setJSummary(true)}>Ask companion for a summary</button></p>}
        <article className="reader" aria-live="polite"><span className="small t2">Sol <Num>{sel.sol}</Num> · <Num>{hm(sel.min)}</Num></span><p>{sel.text}</p>
          {sel.obs ? <p className="obs-row small"><span className="label">Observation</span> {sel.obs}</p> : null}</article>
        {es.map((e, i) => (
          <button key={i} type="button" className={`list-row${i === jSel ? " is-sel" : ""}`} onClick={() => setJSel(i)}>
            <span className="list-row__t">{e.sol}</span><span>{e.text.length > 72 ? e.text.slice(0, 70) + "…" : e.text}</span><span className="small t2 num">{hm(e.min)}</span>
          </button>
        ))}
      </>;
    }
  } else {
    const rows = c.convo();
    if (!rows.length) pane = empty("Nothing said yet. Hold to speak or type below.");
    else {
      let last: number | null = null;
      pane = rows.map((r, i) => {
        const head = r.sol !== last ? <div className="tr-sol">Sol <Num>{r.sol}</Num>{r.sol === P ? " · today" : ""}</div> : null;
        last = r.sol;
        return <div key={i} style={{ display: "contents" }}>{head}<TrRow r={r} /></div>;
      });
    }
    if (working) pane = <>{pane}<WorkRow steps={working} /></>;
  }

  return <>
    <div className="drawer__h">
      <div className="drawer__t">
        <h2 className="sec-t m0">Companion log</h2>
        <span className="actions">
          {atPresent && !c.checkedToday() ? <Link className="ta" href={ROUTE.checkin}>Start daily check-in</Link> : null}
          <button type="button" className="ta ta--quiet drawer__close" aria-expanded="true" aria-controls="drawer" onClick={() => set({ drawer: false })}>Hide log</button>
        </span>
      </div>
      <div className="tabs" role="tablist" aria-label="Companion log" style={{ flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", paddingLeft: 16, paddingRight: 16 }}>
        {tabs.map(([k, l]) => (
          <button key={k} type="button" className="tab" role="tab" aria-selected={s.tab === k} style={{ whiteSpace: "nowrap", flex: "none" }} title={k === "earth" ? "Messages from Earth" : undefined} onClick={() => set({ tab: k, drawer: true, settings: false })}>
            {l}{k === "alerts" && n ? <span className="n num">{n}</span> : null}{k === "earth" && earthNew ? <span className="n num">{earthNew}</span> : null}
          </button>
        ))}
      </div>
    </div>
    <div className="tabpane" id="tr" ref={trRef} tabIndex={0} role={s.tab === "conversation" ? "log" : "tabpanel"} aria-live={s.tab === "conversation" ? "polite" : "off"} aria-label={s.tab}>
      {pane}
    </div>
  </>;
}
type ConsoleTab = "conversation" | "alerts" | "insights" | "journal" | "earth";

/* Pedro at work: the steps done so far (ticked) and the current one (animated), with elapsed time. */
function WorkRow({ steps }: { steps: string[] }) {
  const { clockMin } = useConsole();
  const [since] = useState(() => Date.now()); // mounts when the turn starts
  const [now, setNow] = useState(since);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(id); }, []);
  const secs = Math.max(0, Math.round((now - since) / 1000));
  return (
    <div className="trow trow--companion trow--work" role="status">
      <span className="trow__t">{hm(clockMin)}</span><span className="trow__s">{COMPANION_NAME}</span>
      <span className="trow__x">
        <ol className="work">
          {steps.map((k, i) => {
            const cur = i === steps.length - 1;
            return <li key={k + i} className={cur ? "is-cur" : "is-done"}>
              <span className="work__m" aria-hidden="true">{cur ? <span className="work__dots"><i /><i /><i /></span> : "✓"}</span>
              {STEP[k] ?? k}{cur ? "…" : ""}
            </li>;
          })}
        </ol>
        {secs ? <span className="small t2">{secs}s</span> : null}
      </span>
    </div>
  );
}

function TrRow({ r }: { r: ConvoRow }) {
  const { atPresent } = useConsole();
  if (r.who === "parsed") return (
    <div className="trow trow--parsed"><span /><span />
      <span className="trow__x"><span className="label">Understood</span><span className="pv"><span className="w">{r.label}</span>{r.value}</span>
        {atPresent ? <Link className="ta ta--quiet" href={`${ROUTE.checkin}?step=${r.key}`}>Correct</Link> : null}</span>
    </div>
  );
  if (r.who === "earth") return <div className="trow trow--companion"><span className="trow__t">{hm(r.min)}</span><span className="trow__s">From Earth</span><span className="trow__x"><EarthMessages ids={r.notes ?? []} /></span></div>;
  if (r.who === "summary") return <div className="trow trow--companion"><span className="trow__t">{hm(r.min)}</span><span className="trow__s">{COMPANION_NAME}</span><span className="trow__x"><WeekSummary /></span></div>;
  const who = { companion: COMPANION_NAME, you: "You", sys: "" }[r.who as "companion" | "you" | "sys"];
  return (
    <div className={`trow trow--${r.who}`}>
      <span className="trow__t">{hm(r.min)}</span><span className="trow__s">{who}</span>
      <span className="trow__x">
        {r.escalation ? <span className="sw sw--act"><StatusMark state="act" />Escalated </span> : null}
        {r.stopped ? <span className="label">Stopped </span> : null}
        {r.text}
        {r.facts?.length ? (
          <span className="mt-1 block border-l border-hair pl-3">
            {r.facts.map((f) => <span key={f.key} className="small block"><span className="t2">{f.label}</span> {f.value} <span className="t2">· {f.detail}</span></span>)}
          </span>
        ) : null}
        {r.action ? <span className="small block"><span className="t2">Worth trying</span> {r.action}</span> : null}
        {r.sources?.length ? <span className="small t2 block">Sources: {r.sources.map((x) => x.title).join(", ")}</span> : null}
      </span>
    </div>
  );
}

/* the journal / week summary, from this person's own numbers only */
function WeekSummary() {
  const c = useConsole();
  const { s } = c;
  const sts = MEASURES.map((m) => ({ m, st: c.st(m.key) }));
  const within = sts.filter((x) => x.st.state === "normal").map((x) => x.m.short), out = sts.filter((x) => isOut(x.st));
  const sl = series(s.me, s.sol - 6, s.sol).filter((d): d is NonNullable<typeof d> => !!d && d.sleep != null);
  const lead = c.flagsFor()[0];
  const ent = (JOURNAL[s.me] || []).filter((j) => j.sol <= s.sol && j.sol > s.sol - 7).length;
  return (
    <div className="sumblk">
      <div className="sumblk__h">Week summary, Sol <Num>{s.sol - 6}</Num>–<Num>{s.sol}</Num><span>Private · simulated data</span></div>
      <dl className="dl">
        <dt>Within normal</dt><dd>{within.join(", ") || "none"}</dd>
        <dt>On watch</dt><dd>{out.map((x) => `${x.m.short} (${x.st.k})`).join(", ") || "none"}</dd>
        <dt>Sleep</dt><dd>avg <Num>{fmt("sleep", avg(sl.map((d) => d.sleep!)))}</Num>, normal <Num>{fmtBase("sleep", c.st("sleep").base)}</Num></dd>
        <dt>Journal</dt><dd><Num>{ent}</Num> entries</dd>
      </dl>
      <p className="next">{lead ? `Worth trying: ${flagCopy(s.me, lead.key, lead.st, s.tone, s.sol).action.replace(/^./, (x) => x.toLowerCase())}` : "Nothing new to try."}</p>
    </div>
  );
}

/* ---------- Messages from Earth (crew side) ---------- */
/* The last check-in on this device or in the simulated data, as (sol, minute). */
function lastCheckin(id: string): { sol: number; min: number } | null {
  for (let t = P; t > 0 && t > P - 30; t--) { const d = day(id, t); if (d?.checkin) return { sol: t, min: d.checkin.min }; }
  return null;
}
/* Pedro's short read of the notes, written by code: how many, what they ask, which files came with them. */
function earthSummary(id: string, nowMin: number): { text: string; notes: EarthNote[] } {
  const since = lastCheckin(id);
  let notes = since ? arrivedSince(id, since.sol, since.min, P, nowMin) : [];
  let scope = since ? `since your check-in${since.sol === P ? "" : ` on Sol ${since.sol}`} at ${hm(since.min)}` : "so far";
  if (!notes.length) {
    // nothing new since the check-in: fall back to everything that has reached Mars today
    notes = arrivedSince(id, P, -1, P, nowMin);
    if (notes.length) scope = "today, before your check-in";
  }
  if (!notes.length) return { text: "Nothing from Earth has reached the hab since your last check-in.", notes };
  const files = notes.flatMap((n) => n.attachments ?? []);
  const asks = notes.map((n) => n.text.split(/(?<=[.!?])s+/)[0]).filter(Boolean).slice(0, 3);
  const text = `The flight surgeon sent you ${notes.length} note${notes.length === 1 ? "" : "s"} ${scope}${files.length ? `, with ${files.length} file${files.length === 1 ? "" : "s"}` : ""}.${asks.length ? ` In short: ${asks.join(" ")}` : ""} The full messages are in the From Earth tab.`;
  return { text, notes };
}
/* the actual messages in the log: arrival time, full text, and files to open */
function EarthMessages({ ids }: { ids: string[] }) {
  const notes = notesByIds(ids);
  if (!notes.length) return <span className="t2">These messages are no longer stored on this device.</span>;
  return <EarthList notes={notes} />;
}
/* the notes themselves: sender, arrival, full text and files to open */
function EarthList({ notes }: { notes: EarthNote[] }) {
  return (
    <ul style={EM.list}>
      {notes.map((n) => (
        <li key={n.id} style={EM.note}>
          <span style={EM.meta}>{n.author} · arrived Sol <Num>{n.sol}</Num> <Num>{hm(n.arriveMin)}</Num></span>
          {n.text ? <span style={EM.text}>{n.text}</span> : null}
          {n.attachments?.map((a) => (
            <button key={a.id} type="button" style={EM.file} onClick={() => openAttachment(a.id)} title={`Open ${a.name}`}>
              <span style={EM.ext}>{(a.name.split(".").pop() || "file").slice(0, 4).toUpperCase()}</span>
              <span style={EM.fn}>{a.name}</span><span className="num t2">{fmtSize(a.size)}</span>
            </button>
          ))}
        </li>
      ))}
    </ul>
  );
}
/* inline so the log entry looks right even when the dev stylesheet is stale */
const EM = {
  list: { display: "grid", gap: 6, margin: 0, padding: 0, listStyle: "none" } as const,
  note: { display: "grid", gap: 4, padding: "6px 10px", borderRadius: 6, borderLeft: "3px solid var(--c-action)", background: "var(--c-surface-2)" } as const,
  meta: { fontSize: 11, color: "var(--c-text-2)" } as const,
  text: { whiteSpace: "pre-wrap", overflowWrap: "anywhere" } as const,
  file: { display: "flex", alignItems: "center", gap: 8, padding: "3px 8px", borderRadius: 6, borderWidth: 1, borderStyle: "solid", borderColor: "var(--c-hair-strong)", background: "var(--c-bg)", fontSize: 12, textAlign: "left", cursor: "pointer" } as const,
  ext: { padding: "1px 5px", borderRadius: 3, background: "color-mix(in srgb, var(--c-action) 25%, transparent)", font: "600 10px/1.4 var(--f-mono)" } as const,
  fn: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const,
};
