"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CREW, MKEY, P, events, hm } from "@/lib/console/data";
import { escalationText, escalations } from "@/lib/console/ground";
import { vitals } from "@/lib/console/wearable";
import { Num, StatusMark } from "@/components/ui";
import { ChangelogTimeline, type TimelineCategory, type TimelineEntry } from "@/components/ui/changelog-timeline";
import { useConsole } from "./ConsoleProvider";
import { ReplayNote } from "./Shell";

const CATS: Record<string, TimelineCategory> = {
  act: { label: "Act", mark: "■", color: "var(--c-act)" },
  watch: { label: "Watch", mark: "▲", color: "var(--c-watch)" },
  info: { label: "Info", mark: "◆", color: "var(--c-info)" },
};
const SOLS = 14;

type Row = { sol: number; min: number; sev: "act" | "watch" | "info"; id: string; text: string };

/* Ground · Escalations: what is open now, and the 14-sol log of how it got there, by name.
   Shared measures show Watch and Act with their sentence; unshared measures only say that Act happened.
   Companion emergency notices say that Pedro gave one, never what was said. */
export function GroundEscalations() {
  const { s } = useConsole();
  const open = useMemo(() => { void s.rev; return escalations(s.sol, s.shares, s.convo); }, [s.sol, s.shares, s.convo, s.rev]);
  const urgentVitals = useMemo(() => CREW.map((c) => ({ c, vs: vitals(c.id, s.sol).filter((v) => v.state === "act") })).filter((x) => x.vs.length), [s.sol]);

  const log = useMemo(() => {
    void s.rev;
    const out: Row[] = [];
    for (let t = s.sol; t > s.sol - SOLS && t > 0; t--) {
      CREW.forEach((c) => {
        const shared = s.shares[c.id] || [];
        events(c.id, t).forEach((e) => {
          if (e.type !== "flag" || !e.key) return;
          if (shared.includes(e.key)) {
            if (e.sev === "act" || e.sev === "watch") out.push({ sol: t, min: e.min, sev: e.sev, id: c.id, text: `${c.full}: ${MKEY[e.key].name} moved to ${e.sev === "act" ? "Act" : "Watch"}.` });
          } else if (e.sev === "act") out.push({ sol: t, min: e.min, sev: "act", id: c.id, text: `${c.full}: an unshared measure (${MKEY[e.key].name}) reached Act. No values.` });
        });
        vitals(c.id, t).filter((v) => v.state === "act").forEach((v) =>
          out.push({ sol: t, min: 6 * 60, sev: "act", id: c.id, text: `${c.full}: wearable ${v.label.toLowerCase()} urgent overnight.` }));
        (s.convo[c.id] || []).filter((r) => r.escalation && r.sol === t).forEach((r) =>
          out.push({ sol: t, min: r.min, sev: "act", id: c.id, text: `${c.full}: Pedro gave the emergency notice. What was said stays on board.` }));
      });
    }
    return out.sort((a, b) => b.sol - a.sol || b.min - a.min);
  }, [s.sol, s.shares, s.convo, s.rev]);

  const byPerson = CREW.map((c) => ({ c, esc: open.filter((e) => e.id === c.id), vit: urgentVitals.find((x) => x.c.id === c.id)?.vs ?? [] })).filter((x) => x.esc.length || x.vit.length);

  return (
    <div className="gdash">
      <ReplayNote />
      <div className="gdash__bar">
        <h1 className="gdash__t">Escalations · Sol <Num>{s.sol}</Num></h1>
        <span className="gdash__dl t2">Act statuses, urgent vitals and emergency notices reach Earth by name. Values only where the person shares the measure. Simulated data.</span>
      </div>
      <div className="gdash__grid gesc">
        <section className="gdash__col" aria-labelledby="ge-open">
          <h2 id="ge-open" className="gdash__h">Open now <span className="small t2"><Num>{byPerson.length}</Num> of <Num>{CREW.length}</Num> crew</span></h2>
          {byPerson.length ? (
            <ul className="gesc__list">
              {byPerson.map(({ c, esc, vit }) => (
                <li key={c.id} className="gesc__item">
                  <div className="gesc__who"><StatusMark state="act" /><Link className="ta" href={`/ground/${c.id}`}><b>{c.full}</b></Link><span className="small t2">{c.code}</span></div>
                  <ul className="gesc__why">
                    {esc.map((e, i) => <li key={i} className="small">{e.kind === "companion" ? <span className="t2">Sol <Num>{e.sol}</Num> <Num>{hm(e.min)}</Num> · </span> : null}{escalationText(e)}</li>)}
                    {vit.map((v) => <li key={v.key} className="small">Wearable: {v.label.toLowerCase()} urgent, far outside their own normal.</li>)}
                  </ul>
                  <Link className="ta small" href={`/ground/${c.id}`}>Open crew status →</Link>
                </li>
              ))}
            </ul>
          ) : <p className="ok-line"><StatusMark state="normal" /><span>Nothing open. No Act statuses, urgent vitals or emergency notices.</span></p>}
        </section>
        <aside className="gdash__col gdash__side gesc__side" aria-label="Escalation log">
          <ChangelogTimeline fill className="crew__tl ground__tl" title="Escalation log" subtitle={`Sol ${Math.max(1, s.sol - SOLS + 1)}–${s.sol} · newest first`} categories={CATS} visibleEntries={12}
            empty="No escalations in the last 14 sols."
            entries={log.map((e, i): TimelineEntry => ({
              id: `${e.sol}-${e.min}-${e.id}-${i}`,
              label: hm(e.min),
              group: `Sol ${e.sol}${e.sol === P ? " · Today" : ""}`,
              category: e.sev,
              title: e.text,
              summary: <>Sol <Num>{e.sol}</Num> at <Num>{hm(e.min)}</Num>: {e.text}</>,
            }))} />
        </aside>
      </div>
    </div>
  );
}
