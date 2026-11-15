"use client";

import { useEffect, useRef, useState } from "react";
import { COMPANION_NAME, P, hm, listJoin, type ConvoRow, type LogEvent } from "@/lib/console/data";
import { Num } from "@/components/ui";
import { saveBodyLog } from "@/lib/console/store";
import { clearFollowUp, setFollowUp, useFollowUps, type FollowUp } from "@/lib/console/body/followups";
import { useConsole } from "./ConsoleProvider";
import { BodyMap, PainBodyStill, isSkinMark, needsDetails, sevColour, skinKindFrom, type PainMark } from "./BodyMap";

/* What Pedro says when the board opens (also the line logged in the conversation) */
export const BOARD_INTRO = "Let's mark it on the body map. Drag to turn the body, then tap where it hurts. The buttons along the bottom jump to an area, like Shoulder or Knee.";

/* Body map as Pedro's whiteboard: it pops in on the right of the companion screen while Pedro moves to the
   left and talks the astronaut through it (onGuide). Tap where it hurts or the skin problem is, rate it,
   add a note, then Save: today's pins are logged (PN-01) and kept on this device. Spots flagged "follow up"
   are asked about at the top. onDone gets Pedro's closing line, or null when closed without saving. */
export function BodyBoard({ onDone, onGuide, hearRef }: {
  onDone: (said: string | null, pain: PainMark[]) => void; onGuide: (text: string) => void;
  /** set by the board: the companion screen hands it what the astronaut says (held mic or the chat box) */
  hearRef: React.MutableRefObject<((text: string) => void) | null>;
}) {
  const c = useConsole();
  const { s, set, clockMin } = c;
  const todayPins = (s.extra[s.me] || []).filter((e) => e.code === "PN-01" && e.sol === P).flatMap((e) => e.pain ?? []);
  const [pain, setPain] = useState<PainMark[]>(todayPins);
  const [noPain, setNoPain] = useState(false);
  const followUps = useFollowUps(s.me).filter((f) => f.sol <= P);
  const history: PainMark[] = (s.extra[s.me] || []).filter((e) => e.code === "PN-01" && e.sol >= P - 14 && e.sol < P).flatMap((e) => e.pain ?? []);
  /* the 3D viewer measures its box when it starts: wait for the pop-in to lay out first */
  const [shown, setShown] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }, []);

  const missing = pain.filter(needsDetails);
  const canSave = noPain || (pain.length > 0 && !missing.length);

  /* Pedro's next hint once every marked spot has its details */
  const ready = pain.length > 0 && !missing.length;
  const wasReady = useRef(ready);
  useEffect(() => {
    if (ready && !wasReady.current) onGuide("Thanks, that's what I need. Mark any other spot, or press Save to my log.");
    wasReady.current = ready;
  }, [ready, onGuide]);

  /* the spot open in the panel: what is said goes into its note */
  const [focus, setFocus] = useState<{ key: string; label: string } | null>(null);
  const focusPart = (f: { key: string; label: string } | null) => {
    setFocus(f);
    if (!f) return;
    const part = f.label.toLowerCase();
    onGuide(f.key.includes(":openhealth-skin-")
      ? `Your ${part}. Pick what it looks like, rate it from 1 to 10, then hold the mic or type below and tell me when it started.`
      : `Your ${part}. Rate it from 1 to 10, then hold the mic or type below and tell me when it hurts and what it feels like.`);
  };

  const stillThere = (f: FollowUp) => {
    if (!pain.some((p) => p.id === f.id)) setPain([...pain, { id: f.id, view: "front", x: 0, y: 0, region: f.region, level: f.level, kind: f.kind }]);
    setNoPain(false);
    onGuide(`How is your ${f.region.toLowerCase()} compared with Sol ${f.sol}? Rate it again and tell me how it has changed.`);
  };
  const goneNow = (f: FollowUp) => { clearFollowUp(s.me, f.id); onGuide(`Good to hear your ${f.region.toLowerCase()} has cleared up.`); };

  const save = () => {
    for (const f of followUps) if (pain.some((p) => p.id === f.id)) clearFollowUp(s.me, f.id);
    const ev: LogEvent | null = pain.length
      ? { sol: P, min: clockMin, type: "checkin", sev: "info", code: "PN-01", text: `Pain logged: ${pain.map((p) => `${p.region.toLowerCase()} ${p.level}/10${p.kind ? `, ${p.kind.toLowerCase()}` : ""} (${p.note?.trim()})`).join(", ")}.`, pain }
      : null;
    saveBodyLog(s.me, P, ev);
    set((p) => {
      const kept = (p.extra[p.me] || []).filter((e) => !(e.sol === P && e.code === "PN-01"));
      return { extra: { ...p.extra, [p.me]: ev ? [...kept, ev] : kept }, rev: p.rev + 1 };
    });
    const worst = pain.reduce((a, p) => Math.max(a, p.level), 0);
    onDone(pain.length
      ? `Logged on your body map: ${listJoin(pain.map((p) => `${p.region.toLowerCase()} ${p.level} of 10`))}.${worst >= 7 ? " That is a strong rating: please tell the crew medical officer." : " I'll keep an eye on it."}`
      : "Noted: nothing sore today.", pain);
  };

  /* voice or typed words while the board is open: save, cancel, no pain, or a note for the open spot,
     with a rating ("six out of ten") and, for skin, the kind ("itchy red rash") picked out of it */
  const WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const hear = (text: string) => {
    const said = text.trim();
    if (!said) return;
    if (/^(save|done|that'?s (all|it)|finish(ed)?)\b/i.test(said)) {
      if (canSave) save(); else onGuide(missing.length ? `I still need the details for your ${missing[0].region.toLowerCase()}.` : "Tap a spot first, or say no pain today.");
      return;
    }
    if (/^(cancel|close|never ?mind|stop)\b/i.test(said)) { onDone(null, []); return; }
    if (/^(no pain|nothing (hurts|is sore)|i'?m fine)\b/i.test(said)) {
      setPain([]); setNoPain(true);
      onGuide("Good, nothing sore today. Say save, or press Save to my log, and I'll note it.");
      return;
    }
    const mark = focus ? pain.find((p) => p.id === focus.key) : undefined;
    if (!mark) { onGuide("Tap the spot that hurts on the body first, then tell me about it."); return; }
    const kind = isSkinMark(mark) && !mark.kind ? skinKindFrom(said) : undefined;
    const m = said.match(/\b(10|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\/|out of|over)\s*(?:10|ten)\b/i);
    const level = m ? (Number(m[1]) || WORDS.indexOf(m[1].toLowerCase())) : undefined;
    const note = mark.note?.trim() ? `${mark.note.trim()}. ${said}` : said;
    setPain(pain.map((p) => (p.id === mark.id ? { ...p, note, ...(kind ? { kind } : null), ...(level ? { level } : null) } : p)));
    setNoPain(false);
    const extra = [kind ? `marked as ${kind.toLowerCase()}` : "", level ? `${level} out of 10` : ""].filter(Boolean).join(", ");
    const still = isSkinMark(mark) && !mark.kind && !kind ? " Pick what it looks like in the panel too." : "";
    onGuide(`Added to your ${mark.region.toLowerCase()}${extra ? `, ${extra}` : ""}. Check the note in the panel.${still}`);
  };
  /* the latest handler for the companion screen (assigned after render, so it sees the current marks) */
  useEffect(() => { hearRef.current = hear; return () => { hearRef.current = null; }; });

  return (
    <section className="board" aria-labelledby="board-t">
      <header className="board__h">
        <div>
          <h2 className="board__t" id="board-t">Anything sore or aching today?</h2>
          <p className="small t2">Sol <Num>{P}</Num> · an amber glow means it was marked on earlier sols</p>
        </div>
        {/* Save sits up here so it never ends up below the fold */}
        <div className="board__act">
          <button type="button" className="ta ta--quiet" onClick={() => onDone(null, [])}>Cancel</button>
          <button type="button" className="btn-primary" disabled={!canSave} onClick={save}>Save to my log</button>
        </div>
      </header>
      {followUps.length ? (
        <section className="fu" aria-label="Follow-ups">
          <p className="small"><b>Follow-ups.</b> <span className="t2">You asked to check on these. Are they still there?</span></p>
          {followUps.map((f) => {
            const again = pain.some((p) => p.id === f.id);
            return (
              <div key={f.id} className="fu__row">
                <span className="fu__dot" style={{ background: sevColour(f.level) }} />
                <span className="fu__t"><b>{f.region}</b>{f.kind ? ` · ${f.kind.toLowerCase()}` : ""} · <Num>{f.level}/10</Num> on Sol <Num>{f.sol}</Num>
                  {f.note?.trim() ? <span className="t2"> · “{f.note.trim()}”</span> : null}</span>
                {again ? <span className="small t2">Marked again: rate it and add how it changed</span> : <span className="fu__act">
                  <button type="button" className="opt" onClick={() => stillThere(f)}>Still there</button>
                  <button type="button" className="opt" onClick={() => goneNow(f)}>Gone now</button>
                </span>}
              </div>
            );
          })}
        </section>
      ) : null}
      {shown ? <BodyMap compact value={pain} history={history} noPain={noPain} onFocusChange={focusPart}
        onChange={(p) => { setPain(p); setNoPain(false); }}
        onNoPain={() => { setPain([]); setNoPain(true); onGuide("Good, nothing sore today. Press Save to my log and I'll note it."); }} />
        : <div style={{ minHeight: 420 }} aria-hidden="true" />}
      {missing.length ? <p className="ci__hint" role="status" style={{ color: "#F2701D" }}>Add the details for {missing.map((p) => p.region).join(", ")} before you save.</p> : null}
    </section>
  );
}

/* ---------- the body map in the companion log ---------- */
/* likely reasons, in plain words, for where it hurts or what the skin shows. Common causes only, as a
   starting point to talk through with the crew medical officer, never a diagnosis. */
const SKIN_WHY: Record<string, string> = {
  "Rash": "Rashes on board often come from sweat under exercise straps, a new soap or wipe, or dry cabin air.",
  "Bite or sting": "There are no insects on board, so this is more likely a skin reaction or a scratch than a bite.",
  "Cut or scrape": "Usually from a sharp edge, a tool or a handrail while moving around.",
  "Bruise": "Usually from knocking into equipment or a handrail.",
  "Burn": "From a hot surface, a heater or friction.",
  "Itch": "Dry cabin air, sweat or a new fabric are the usual reasons.",
  "Dry or cracked": "Dry cabin air and frequent hand washing or wipes dry the skin out.",
  "Blister": "Usually rubbing, from gloves, shoes or exercise kit.",
  "Swelling": "From a knock or strain, or fluid shifting toward the head and upper body in low gravity.",
};
const PART_WHY: Array<[RegExp, string]> = [
  [/back|spine|lumbar/i, "Back pain is common in low gravity: the spine lengthens and the back muscles weaken. Sitting bent over a task makes it worse."],
  [/neck/i, "Neck pain often comes from holding the head forward at a workstation or sleeping in an odd position."],
  [/shoulder/i, "Shoulder pain often follows heavy lifting, the resistance exercise device or a lot of overhead work."],
  [/hand|finger|wrist|thumb/i, "Hands and fingers get sore from gripping tools and handrails, and from suit gloves on EVA."],
  [/knee|ankle|foot|feet|toe|leg|calf|thigh|hip/i, "Legs and feet get sore from treadmill or exercise-device sessions, or from foot restraints."],
  [/head|forehead|temple|eye/i, "Headaches can follow short sleep, not drinking enough, stuffy air (high CO₂) or screen work."],
  [/chest|rib/i, "Chest pain can be a strained muscle, but it should always be checked: tell the crew medical officer."],
  [/stomach|abdomen|belly/i, "Stomach aches can follow a change in food, stress or not drinking enough."],
];
export function painWhy(m: PainMark): string {
  if (isSkinMark(m)) return SKIN_WHY[m.kind ?? ""] ?? "Skin problems on board usually come from dry air, sweat or rubbing.";
  return PART_WHY.find(([re]) => re.test(m.region))?.[1] ?? "Muscle and joint pain usually follows a strain, an awkward position or a heavy session.";
}

/* a log row: the still body picture with each spot, Pedro's summary of each one (what you said about it and
   the likely reasons), and a follow-up button so Pedro asks about it next time you open the body map */
export function BodyLogRow({ r }: { r: ConvoRow }) {
  return (
    <div className="trow trow--companion">
      <span className="trow__t">{hm(r.min)}</span><span className="trow__s">{COMPANION_NAME}</span>
      <span className="trow__x"><BodyEntry sol={r.sol} marks={(r.pain ?? []) as PainMark[]} /></span>
    </div>
  );
}

/* one sol's body map: the picture, each spot with what was said and the likely reasons, and follow-up buttons */
export function BodyEntry({ sol, marks }: { sol: number; marks: PainMark[] }) {
  const { s, atPresent } = useConsole();
  const follow = useFollowUps(s.me);
  const following = (id: string) => follow.some((f) => f.id === id);
  const toggle = (m: PainMark) => setFollowUp(s.me, { id: m.id, region: m.region, kind: m.kind, level: m.level, note: m.note, sol }, !following(m.id));
  return (
      <span style={{ display: "grid", gap: 8 }}>
        <span className="label">Body map · Sol {sol}</span>
        <div style={{ display: "flex", height: 150, maxWidth: 220 }} aria-label={`Where it hurts: ${marks.map((m) => m.region).join(", ")}`} role="img">
          <PainBodyStill marks={marks} />
        </div>
        {marks.map((m) => (
          <div key={m.id} style={{ display: "grid", gap: 4, paddingLeft: 10, borderLeft: `3px solid ${sevColour(m.level)}` }}>
            <span><b>{m.region}</b>{m.kind ? ` · ${m.kind.toLowerCase()}` : ""} · <Num>{m.level}/10</Num></span>
            {m.note?.trim() ? <span className="small"><span className="t2">You said:</span> “{m.note.trim()}”</span> : null}
            <span className="small"><span className="t2">Likely why:</span> {painWhy(m)}</span>
            {m.level >= 7 ? <span className="small" style={{ color: "var(--c-act)" }}>Strong pain: tell the crew medical officer.</span> : null}
            {atPresent ? (
              <span>
                <button type="button" className={following(m.id) ? "opt is-on" : "opt"} aria-pressed={following(m.id)} onClick={() => toggle(m)}>
                  {following(m.id) ? "✓ Following up" : "Follow up next time"}
                </button>
              </span>
            ) : null}
          </div>
        ))}
        {atPresent ? <span className="small t2">Follow up: next time you open Body map, {COMPANION_NAME} asks whether it is still there and how it has changed.</span> : null}
      </span>
  );
}
