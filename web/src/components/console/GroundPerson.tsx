"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { CREW, MEASURES, MKEY, fmt, fmtBase, fmtDelta, hm, listJoin, mstatus, reason } from "@/lib/console/data";
import { escalationText, escalations, groundRows, personCheckins } from "@/lib/console/ground";
import { trendSvg } from "@/lib/console/plots";
import { Icon, Legend, Num, StatusMark, StatusRule, StatusWord } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";
import { Plot } from "./Plot";
import { ROUTE, ReplayNote } from "./Shell";

/* Ground, one astronaut: what that person shares, in full; what they do not share, by name only.
   Escalations reach Earth by name either way. Journal and companion conversation never appear. */
export function GroundPerson() {
  const { id } = useParams<{ id: string }>();
  const { s } = useConsole();
  const c = CREW.find((x) => x.id === id);
  const row = useMemo(() => { void s.rev; return c ? groundRows(s.sol, s.shares).find((r) => r.id === c.id) ?? null : null; }, [c, s.sol, s.shares, s.rev]);
  const esc = useMemo(() => { void s.rev; return c ? escalations(s.sol, s.shares, s.convo).filter((e) => e.id === c.id) : []; }, [c, s.sol, s.shares, s.convo, s.rev]);

  if (!c || !row) {
    return (
      <>
        <div className="pbar"><h1 className="pbar__t">Crew member not found</h1></div>
        <p className="pnote"><Link className="ta" href={ROUTE.ground}>Back to Ground</Link></p>
      </>
    );
  }
  const shared = MEASURES.filter((m) => (s.shares[c.id] || []).includes(m.key));
  const unshared = MEASURES.filter((m) => !(s.shares[c.id] || []).includes(m.key));
  const ci = personCheckins(c.id, s.sol);

  return (
    <>
      <ReplayNote />
      <div className="pbar">
        <h1 className="pbar__t">{c.full} · Sol <Num>{s.sol}</Num></h1>
        <Link className="ta" href={ROUTE.ground}><Icon name="back" /> All crew</Link>
      </div>
      <p className="pnote">{c.role} · {c.code}. Shares <Num>{shared.length}</Num> of <Num>{MEASURES.length}</Num> measures with ground. Journal and companion conversations stay on board. Simulated data.</p>

      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Escalations <span className="tools small t2"><Num>{esc.length}</Num> open</span></h2>
          {esc.length ? (
            <ul className="prompts">
              {esc.map((e, i) => (
                <li key={i}><StatusMark state="act" /><span>{e.kind === "companion" ? <span className="t2">Sol <Num>{e.sol}</Num> <Num>{hm(e.min)}</Num> · </span> : null}{escalationText(e)}</span></li>
              ))}
            </ul>
          ) : <p className="ok-line"><StatusMark state="normal" /><span>No Act status and no emergency notice in the last 14 sols.</span></p>}
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">Check-ins</h2>
            <div className="srow"><span>Last 14 sols</span><span className="srow__v"><Num>{ci.done}</Num> of <Num>{ci.of}</Num></span></div>
            <div className="srow"><span>Missed in 7</span><span className="srow__v">{row.missed7 >= 2 ? <StatusWord state={row.missed7 >= 3 ? "act" : "watch"}><Num>{row.missed7}</Num></StatusWord> : <Num>{row.missed7}</Num>}</span></div>
            <div className="gp-ci" aria-label="Check-ins, last 14 sols">
              {ci.rows.map((r) => (
                <span key={r.sol} className={`gp-ci__c${r.done ? " is-done" : ""}`} tabIndex={0}
                  data-tip={`Sol ${r.sol}: ${r.done ? `checked in ${hm(r.min!)}` : "no check-in"}`} />
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="sec">
        <div className="sec__main">
          <h2 className="sec-t">Shared measures</h2>
          {shared.length ? (
            <div className="gp-ms">
              {shared.map((m) => {
                const st = mstatus(c.id, m.key, s.sol);
                return (
                  <div key={m.key} className="cb">
                    <span className="cb__t">{m.name} <span className="small t2 num">{m.code}</span></span>
                    <StatusRule state={st.state} note={st.base ? `${fmt(m.key, st.value)} · ${fmtDelta(m.key, st.delta)} vs normal ${fmtBase(m.key, st.base)}` : undefined} />
                    <Plot draw={(w) => trendSvg(c.id, s.sol, m.key, w)} label={`${m.name}, 28 sols, with their baseline band`} />
                    <p className="cb__reason">{reason(c.id, m.key, st).replace(/\byour\b/g, "their")}</p>
                  </div>
                );
              })}
            </div>
          ) : <p className="t2">{c.full.split(" ")[0]} shares no measures with ground. Only escalations reach Earth.</p>}
          {shared.length ? <Legend items={[["line", "Their value each sol"], ["band", "Their own normal"]]} /> : null}
        </div>
        <aside className="sec__margin">
          <div>
            <h2 className="sec-t sec-t--rule">Not shared</h2>
            {unshared.length
              ? <p className="t2">{listJoin(unshared.map((m) => MKEY[m.key].name))}. No values reach ground. If one of these reaches Act, ground is told that it did, by name, without the values.</p>
              : <p className="t2">Every measure is shared.</p>}
          </div>
        </aside>
      </section>
    </>
  );
}
