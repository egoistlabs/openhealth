/* UI primitives from the Companion Console prototype. Tokens only, via the classes in console.css.
   Status is never colour alone: each state pairs a shape with a word. */
import type { ReactNode } from "react";
import { TERMS } from "@/lib/console/data";

export const WORD: Record<string, string> = { normal: "Normal", watch: "Watch", act: "Act", pending: "Not logged", nobase: "New", info: "Private" };
export const CLS: Record<string, string> = { normal: "normal", watch: "watch", act: "act", pending: "pending", nobase: "pending", info: "info" };

export function StatusMark({ state }: { state: string }) {
  const c = CLS[state] || state;
  return (
    <svg className={`mk mk--${c}`} viewBox="0 0 8 8" aria-hidden="true">
      {c === "normal" && <circle cx="4" cy="4" r="3.5" />}
      {c === "watch" && <path d="M4 .4 7.8 7.6H.2Z" />}
      {c === "act" && <rect x=".5" y=".5" width="7" height="7" />}
      {c === "info" && <path d="M4 .2 7.8 4 4 7.8 .2 4Z" />}
      {c === "pending" && <circle cx="4" cy="4" r="2.5" />}
    </svg>
  );
}

export function StatusWord({ state, children }: { state: string; children?: ReactNode }) {
  return <span className={`sw sw--${CLS[state] || state}`}><StatusMark state={state} />{children ?? WORD[state]}</span>;
}

export function StatusRule({ state, word, note }: { state: string; word?: string; note?: string }) {
  return (
    <div className={`srule srule--${CLS[state] || state}`}>
      <StatusMark state={state} /><span>{word ?? WORD[state]}</span>
      {note ? <span className="srule__note">{note}</span> : null}
    </div>
  );
}

const ICONS = {
  arrow: <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  chev: <path d="m9 18 6-6-6-6" />,
  back: <path d="m15 18-6-6 6-6" />,
  mic: <><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></>,
};
export function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

export const Num = ({ children }: { children: ReactNode }) => <span className="num">{children}</span>;

export function Segmented<T extends string>({ options, value, onChange, label, disabled = [] }: {
  options: Array<[T, string]>; value: T; onChange: (v: T) => void; label: string; disabled?: T[];
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(([v, l], i) => (
        <span key={v} style={{ display: "contents" }}>
          {i ? <span className="seg__sep" aria-hidden="true">·</span> : null}
          <button type="button" className={`seg__b${v === value ? " is-on" : ""}`} aria-pressed={v === value} disabled={disabled.includes(v)} onClick={() => onChange(v)}>{l}</button>
        </span>
      ))}
    </div>
  );
}

export function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className="tg" role="switch" aria-checked={on} onClick={onClick}>
      <span className="tg__box" aria-hidden="true">[{on ? "x" : " "}]</span>{label}
    </button>
  );
}

export function Term({ children, k }: { children: ReactNode; k: string }) {
  return <span className="term" tabIndex={0} data-tip={TERMS[k]}>{children}</span>;
}

const SW = {
  band: <svg viewBox="0 0 16 10" aria-hidden="true"><rect className="band" x="0" y="0" width="16" height="10" /></svg>,
  line: <svg viewBox="0 0 16 10" aria-hidden="true"><line className="ln ln--target" x1="0" x2="16" y1="5.5" y2="5.5" /></svg>,
  dot: <svg viewBox="0 0 16 10" aria-hidden="true"><circle className="dot" cx="8" cy="5" r="3" /></svg>,
  out: <svg viewBox="0 0 16 10" aria-hidden="true"><circle className="dot dot--out" cx="8" cy="5" r="3" /></svg>,
  bar: <svg viewBox="0 0 16 10" aria-hidden="true"><rect className="bar" x="5" y="0" width="6" height="10" /></svg>,
};
export function Legend({ items }: { items: Array<[keyof typeof SW, string]> }) {
  return <div className="legend" aria-label="Legend">{items.map(([k, t]) => <span key={t}>{SW[k]}{t}</span>)}</div>;
}
