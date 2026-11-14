"use client";

import { useEffect, useRef } from "react";
import { KEYS, MEASURES } from "@/lib/console/data";
import { Segmented, Toggle } from "@/components/ui";
import { useConsole } from "./ConsoleProvider";

/* Settings (tone, voice, sharing) as a modal opened from the top bar, on every screen.
   Open state is `s.settings`. */
export function SettingsDialog() {
  const c = useConsole();
  const { s, set } = c;
  const ref = useRef<HTMLDialogElement>(null);
  const sh = c.shared(s.me);
  const close = () => set({ settings: false });

  // Open/close the native dialog from state. No close() in an effect cleanup: React dev mode runs
  // effects twice and that would fire `close` and immediately reset the state.
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (s.settings && !d.open) d.showModal();
    if (!s.settings && d.open) d.close();
  }, [s.settings]);

  const toggle = (k: (typeof KEYS)[number]) => set((p) => {
    const cur = p.shares[p.me] || [];
    const next = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
    return { shares: { ...p.shares, [p.me]: KEYS.filter((x) => next.includes(x)) } };
  });

  return (
    <dialog ref={ref} className="mmodal setdlg" aria-labelledby="setdlg-t" onClose={close}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="mmodal__in">
        <header className="mmodal__h">
          <div className="mmodal__ttl"><h2 className="mmodal__t" id="setdlg-t">Settings</h2></div>
          <span style={{ flex: 1 }} />
          <button type="button" className="mmodal__x" onClick={close} aria-label="Close">×</button>
        </header>
        <div className="settings">
          <div className="set-row"><span className="label">Tone</span><div className="ctl">
            <Segmented options={[["gentle", "Gentle"], ["direct", "Direct"]]} value={s.tone} label="Tone" onChange={(v) => set({ tone: v })} />
            <span className="small t2">Changes how flags and suggestions are worded.</span></div></div>
          <div className="set-row"><span className="label">Voice</span><div className="ctl">
            <Segmented options={[["on", "On"], ["off", "Off"]]} value={s.voice ? "on" : "off"} label="Voice" onChange={(v) => set({ voice: v === "on" })} />
            <span className="small t2">Speech always appears as text too.</span></div></div>
          <div className="set-row"><span className="label">Sharing</span><div className="ctl">
            <Segmented options={[["private", "Private"], ["share", "Share aggregates"]]} value={sh.length ? "share" : "private"} label="Sharing"
              onChange={(v) => set((p) => ({ shares: { ...p.shares, [p.me]: v === "share" ? KEYS.slice() : [] } }))} />
            <div className="mshare">{MEASURES.map((m) => <Toggle key={m.key} on={sh.includes(m.key)} label={m.name} onClick={() => toggle(m.key)} />)}</div>
            <span className="small t2">Only aggregates reach Crew, and only when at least 2 crew share a measure.</span></div></div>
          <p className="actions pt3"><button type="button" className="btn-primary" onClick={close}>Done</button></p>
        </div>
      </div>
    </dialog>
  );
}
