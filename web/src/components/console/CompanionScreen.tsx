"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCompanionChat } from "@/hooks/companion/mutations/use-companion-chat";
import {
  JOURNAL, KEYS, MEASURES, MKEY, P, avg, crewById, flagCopy, fmt, fmtBase, hasBaseline, hm, insights, isOut, listJoin, overall, series,
  type ConvoRow, type VoicePhrase,
} from "@/lib/console/data";
import { Presence } from "@/lib/console/presence";
import { holdEmotion, replyEmotion, restEmotion } from "@/lib/console/emotion";
import { Num, Segmented, StatusMark, Toggle } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { FlagList } from "./FlagCard";
import { toggleShare } from "./HomeScreen";
import { Wave, usePresenceState } from "./Orb";
import { VegaAvatar, type VegaApi } from "./VegaAvatar";
import { ROUTE } from "./Shell";
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

  const rows = c.convo();
  /* rows already in the log when the screen opened are history: they are shown, not spoken */
  const spoken = useRef(rows.length);
  useEffect(() => { if (s.tab === "conversation" && trRef.current) trRef.current.scrollTop = trRef.current.scrollHeight; }, [rows.length, s.tab, s.drawer]);
  useEffect(() => () => { window.clearTimeout(typeTimer.current); Presence.setState("idle"); }, []);

  const chat = useCompanionChat({
    onOffline: (q) => {
      const fallback = localReply(q, lastIntent.current);
      speak({ who: "companion", offline: true, text: fallback ?? "The companion model is not running, so I can't answer that right now. Your check-in and measures still work." });
    },
  });
  const busy = busyLocal || chat.streaming;

  /* The streamed text is an unverified draft: the companion thinks while it arrives and only
     speaks the verified answer once it lands in the log (below). */
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
  /* speak each new companion reply aloud, with the face for its scenario */
  useEffect(() => {
    if (rows.length <= spoken.current) return;
    const fresh = rows.slice(spoken.current);
    spoken.current = rows.length;
    const reply = [...fresh].reverse().find((r) => r.who === "companion" && r.text);
    if (reply && vega.current) vega.current.speak(reply.text!, { emotion: replyEmotion(reply, worst), silent: !s.voice });
  }, [rows, worst, s.voice]);

  /* local reply from the person's own numbers: used for "sum up my week" and when the model is off (C9) */
  const localReply = (q: string, intent?: string) => {
    const t = q.toLowerCase();
    if (intent === "sleep" || /sleep|slept|tired/.test(t)) {
      const st = c.st("sleep");
      if (!st.base) return "Not enough nights yet to compare with your normal.";
      const d = st.delta!, h = Math.round(Math.abs(d) * 2) / 2, t2 = c.st("timing");
      return `${Math.abs(d) < 0.25 ? "Sleep is right at your normal." : `Sleep is about ${h}h ${d < 0 ? "under" : "over"} your normal.`}${isOut(t2) ? ` Your midpoint is ${Math.round(Math.abs(t2.delta!))} min ${t2.delta! > 0 ? "later" : "earlier"} than usual.` : ""}`;
    }
    if (intent === "watch" || /watch|anything|worry/.test(t)) {
      const f = c.flagsFor();
      return f.length
        ? `${f.length} thing${f.length > 1 ? "s" : ""} on watch: ${listJoin(f.map((x) => MKEY[x.key].short))}. The first suggestion: ${flagCopy(s.me, f[0].key, f[0].st, s.tone, s.sol).action.toLowerCase()}`
        : "Nothing on watch today. Everything sits within your normal.";
    }
    if (/check-?in|start/.test(t)) return c.checkedToday() ? "Today's check-in is done." : "Check-in is open. Five taps, about a minute, and any question can be skipped.";
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
    vega.current?.stop();
    lastIntent.current = intent;
    set({ chatted: true, settings: false });
    c.addLines([{ who: "you", text: q }]);
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

  /* voice on the companion: a rating heard in speech goes into today's check-in draft (C3) */
  const onPhrase = (p: VoicePhrase) => {
    setV(null);
    if (p.parse && p.parse.key !== "meals" && p.parse.key !== "sleep") {
      const key = p.parse.key, n = p.parse.v!;
      set((prev) => ({ chatted: true, draft: { ...prev.draft, [key]: n } }));
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

  const lastReply = [...rows].reverse().find((x) => x.who === "companion" && x.text);
  const shown = speaking != null
    ? { who: "companion" as const, text: speaking, sol: P, min: 0 }
    : chat.streaming
      ? { who: "companion" as const, text: chat.liveText, sol: P, min: 0 }
      : lastReply;

  return (
    <div className={`cstage${s.drawer ? " has-drawer" : ""}`}>
      <h1 className="vh">Companion, {crewById(s.me).full}</h1>
      <div className="cmain">
        <section className="stage" aria-label="Companion">
          <div className="stage__tools">
            <Toggle on={s.voice} label="Voice" onClick={() => { set((p) => ({ voice: !p.voice })); setTypeMode(false); }} />
            <button type="button" className="ta ta--quiet" aria-pressed={s.settings} onClick={() => set((p) => ({ settings: !p.settings }))}>Settings</button>
            <button type="button" className="ta ta--quiet" aria-expanded={s.drawer} aria-controls="drawer" onClick={() => set((p) => ({ drawer: !p.drawer }))}>{s.drawer ? "Hide log" : "Show log"}</button>
          </div>
          {s.settings ? <Settings /> : <>
            <VegaAvatar onReady={(api) => {
              vega.current = api;
              api?.setRestEmotion(restEmotion(worst));
            }} />
            <Reply row={shown} live={speaking != null || chat.streaming} />
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
              <label className="vh" htmlFor="say">Message to the companion</label>
              <input ref={inputRef} className="field field--chat" id="say" autoComplete="off" value={text} onChange={(e) => setText(e.target.value)}
                placeholder={s.voice && !typeMode ? "Type a message, or hold the mic to talk" : "Type a message"} maxLength={2000} />
              {s.voice ? <>
                <Wave />
                <HoldButton ctx="companion" enabled={s.voice && !busy} onPhrase={onPhrase} setV={setV} tip="Hold to talk. Simulated: there is no microphone yet." />
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
        {s.drawer ? <Drawer trRef={trRef} jSel={jSel} setJSel={setJSel} jSummary={jSummary} setJSummary={setJSummary} /> : null}
      </section>
    </div>
  );
}

/* The answer under the orb: escalation notice above, sources below (A9, C8, C10, C11) */
function Reply({ row, live }: { row?: ConvoRow; live: boolean }) {
  if (!row) return <p className="stage__reply">Nothing said yet. Hold to speak or type below.</p>;
  return (
    <div className="grid w-full max-w-[56ch] justify-items-center gap-3 text-center">
      {row.escalation ? <EscalationNotice /> : null}
      {row.noAnswer && !live ? <p className="label">Not on board</p> : null}
      <p className="stage__reply line-clamp-none max-h-[30vh] overflow-y-auto">
        {row.text}{live ? <span className="caret" aria-hidden="true" /> : null}
      </p>
      {!live && row.offline ? <p className="small t2">The companion model is off. This answer comes from your own numbers only.</p> : null}
      {!live ? <AnswerSources sources={row.sources} /> : null}
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

function AnswerSources({ sources }: { sources?: ConvoRow["sources"] }) {
  if (!sources?.length) return null;
  return (
    <div className="w-full text-left">
      <p className="th">Sources</p>
      <ul className="mt-1 grid gap-1">
        {sources.map((x) => (
          <li key={x.id} className="small text-text-2">
            <span className="text-text">{x.title}</span> · {x.source} · added {x.added} · authorised by {x.authorised_by}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- settings: tone, voice, sharing ---------- */
function Settings() {
  const c = useConsole();
  const { s, set } = c;
  const sh = c.shared(s.me);
  return (
    <div className="settings" aria-label="Settings">
      <h2 className="sec-t">Settings</h2>
      <div className="set-row"><span className="label">Tone</span><div className="ctl">
        <Segmented options={[["gentle", "Gentle"], ["direct", "Direct"]]} value={s.tone} label="Tone" onChange={(v) => set({ tone: v })} />
        <span className="small t2">Changes how flags and suggestions are worded.</span></div></div>
      <div className="set-row"><span className="label">Voice</span><div className="ctl">
        <Segmented options={[["on", "On"], ["off", "Off"]]} value={s.voice ? "on" : "off"} label="Voice" onChange={(v) => set({ voice: v === "on" })} />
        <span className="small t2">Speech always appears as text too.</span></div></div>
      <div className="set-row"><span className="label">Sharing</span><div className="ctl">
        <Segmented options={[["private", "Private"], ["share", "Share aggregates"]]} value={sh.length ? "share" : "private"} label="Sharing"
          onChange={(v) => set((p) => ({ shares: { ...p.shares, [p.me]: v === "share" ? KEYS.slice() : [] } }))} />
        <div className="mshare">{MEASURES.map((m) => <Toggle key={m.key} on={sh.includes(m.key)} label={m.name} onClick={() => toggleShare(c, m.key)} />)}</div>
        <span className="small t2">Only aggregates reach Crew, and only when at least 2 crew share a measure.</span></div></div>
      <p className="actions pt3"><button type="button" className="ta" onClick={() => set({ settings: false })}>Done</button></p>
    </div>
  );
}

/* ---------- companion log drawer: conversation, alerts, insights, journal ---------- */
function Drawer({ trRef, jSel, setJSel, jSummary, setJSummary }: {
  trRef: React.RefObject<HTMLDivElement | null>; jSel: number; setJSel: (n: number) => void; jSummary: boolean; setJSummary: (b: boolean) => void;
}) {
  const c = useConsole();
  const { s, set, atPresent } = c;
  const n = c.openFlags().length;
  const tabs: Array<[ConsoleTab, string]> = [["conversation", "Conversation"], ["alerts", "Alerts"], ["insights", "Insights"], ["journal", "Journal"]];
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
  } else if (s.tab === "journal") {
    const es = (JOURNAL[s.me] || []).filter((j) => j.sol <= s.sol).slice().reverse();
    if (!es.length) pane = empty("No entries yet.", <button type="button" className="ta" onClick={() => set({ tab: "conversation" })}>Talk to the companion</button>);
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
      <div className="tabs" role="tablist" aria-label="Companion log">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" className="tab" role="tab" aria-selected={s.tab === k} onClick={() => set({ tab: k, drawer: true, settings: false })}>
            {l}{k === "alerts" && n ? <span className="n num">{n}</span> : null}
          </button>
        ))}
      </div>
    </div>
    <div className="tabpane" id="tr" ref={trRef} tabIndex={0} role={s.tab === "conversation" ? "log" : "tabpanel"} aria-live={s.tab === "conversation" ? "polite" : "off"} aria-label={s.tab}>
      {pane}
    </div>
  </>;
}
type ConsoleTab = "conversation" | "alerts" | "insights" | "journal";

function TrRow({ r }: { r: ConvoRow }) {
  const { atPresent } = useConsole();
  if (r.who === "parsed") return (
    <div className="trow trow--parsed"><span /><span />
      <span className="trow__x"><span className="label">Understood</span><span className="pv"><span className="w">{r.label}</span>{r.value}</span>
        {atPresent ? <Link className="ta ta--quiet" href={`${ROUTE.checkin}?step=${r.key}`}>Correct</Link> : null}</span>
    </div>
  );
  if (r.who === "summary") return <div className="trow trow--companion"><span className="trow__t">{hm(r.min)}</span><span className="trow__s">Companion</span><span className="trow__x"><WeekSummary /></span></div>;
  const who = { companion: "Companion", you: "You", sys: "" }[r.who as "companion" | "you" | "sys"];
  return (
    <div className={`trow trow--${r.who}`}>
      <span className="trow__t">{hm(r.min)}</span><span className="trow__s">{who}</span>
      <span className="trow__x">
        {r.escalation ? <span className="sw sw--act"><StatusMark state="act" />Escalated </span> : null}
        {r.stopped ? <span className="label">Stopped </span> : null}
        {r.text}
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
