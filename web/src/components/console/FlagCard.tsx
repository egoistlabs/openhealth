"use client";

import { MKEY, flagCopy, hm, type MeasureKey, type Status } from "@/lib/console/data";
import { CLS, Icon, Num, StatusMark, StatusWord, Term } from "@/components/ui";
import { useConsole, type Flag } from "./ConsoleProvider";

/* A5: what changed, one suggested action, a Done button and a text status label. B7: Done is recorded. */
export function FlagCard({ k, st, ctx }: { k: MeasureKey; st: Status; ctx: string }) {
  const c = useConsole();
  const { s, set } = c;
  const copy = flagCopy(s.me, k, st, s.tone, s.sol);
  const dk = c.doneKey(k), done = s.done[dk], wk = `${k}-${ctx}`, open = !!s.why[wk];
  return (
    <div className={`fb fb--${CLS[st.state]}${done ? " is-done" : ""}`}>
      <div className="fb__h"><StatusWord state={st.state} /><span>{MKEY[k].name}</span><span className={`fb__state${done ? "" : " is-open"}`}>{done ? "Done" : "Open"}</span></div>
      <p className="fb__what">{copy.line} {copy.window ? <span className="t2 small">Sol <Num>{copy.window[0]}</Num>–<Num>{copy.window[1]}</Num></span> : null}</p>
      <div className="fb__act">
        <span className="fb__act-t"><span className="label">Suggested</span>{copy.action}</span>
        {done
          ? <span className="small t2">Done at <Num>{hm(done.min)}</Num> <button type="button" className="ta ta--quiet" onClick={() => undo(c, k)}>Undo</button></span>
          : <button type="button" className="btn" aria-label={`Mark done: ${copy.action}`} onClick={() => markDone(c, k)}>Done</button>}
      </div>
      <button type="button" className="why" aria-expanded={open} onClick={() => set((p) => ({ why: { ...p.why, [wk]: !p.why[wk] } }))}><Icon name="chev" />Why</button>
      {open ? (
        <dl className="dl small">
          <dt>Measure</dt><dd>{MKEY[k].name}</dd>
          {copy.window ? <><dt>Window</dt><dd>Sol <Num>{copy.window[0]}</Num>–<Num>{copy.window[1]}</Num></dd></> : null}
          <dt>Change</dt><dd className="num">{copy.deviation}</dd>
          <dt>Compared with</dt><dd>Your <Term k="baseline">baseline</Term>, never other crew</dd>
        </dl>
      ) : null}
    </div>
  );
}

type C = ReturnType<typeof useConsole>;
export function markDone(c: C, k: MeasureKey) {
  const { s, set, clockMin, say } = c;
  const action = flagCopy(s.me, k, c.st(k), s.tone, s.sol).action;
  set((p) => ({
    done: { ...p.done, [c.doneKey(k)]: { min: clockMin } },
    extra: { ...p.extra, [p.me]: [...(p.extra[p.me] || []), { sol: p.sol, min: clockMin, type: "flag", sev: "normal", key: k, code: MKEY[k].code, text: `You marked done: ${action}` }] },
  }));
  say(`Marked done: ${action}`);
}
function undo(c: C, k: MeasureKey) {
  c.set((p) => {
    const done = { ...p.done };
    delete done[c.doneKey(k)];
    return { done, extra: { ...p.extra, [p.me]: (p.extra[p.me] || []).filter((x) => !(x.key === k && x.sol === p.sol && x.text.startsWith("You marked done"))) } };
  });
}

export function FlagList({ flags, ctx, grid }: { flags: Flag[]; ctx: string; grid?: boolean }) {
  return <div className={`flags${grid ? " flags--grid" : ""}`}>{flags.map((x) => <FlagCard key={x.key} k={x.key} st={x.st} ctx={ctx} />)}</div>;
}

export function OkLine({ state, children }: { state: string; children: React.ReactNode }) {
  return <p className="ok-line"><StatusMark state={state} /><span>{children}</span></p>;
}
