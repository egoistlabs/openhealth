"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { COMPANION_NAME, CREW, MISSION, P, crewEvents, crewById, day, hasBaseline, hm, solDate, type LogEvent } from "@/lib/console/data";
import { FlagList } from "./FlagCard";
import { SettingsDialog } from "./SettingsDialog";
import { PedroGuide } from "./PedroGuide";
import { earthDistanceMkm, escalations, lightDelayMin } from "@/lib/console/ground";
import { Rocket } from "lucide-react";
import { DEMO_DELAY_MIN } from "@/lib/console/earth-notes";
import { tok } from "@/lib/console/plots";
import { Icon, Num, Segmented, StatusMark, Toggle } from "@/components/ui";
import { DotPattern } from "@/components/ui/dot-pattern";
import { THEMES, useConsole } from "./ConsoleProvider";
import { EarthToast } from "./EarthToast";

export const ROUTE = { home: "/", checkin: "/check-in", companion: "/companion", crew: "/crew", ground: "/ground", groundEsc: "/ground/escalations", groundReports: "/ground/reports" } as const;

/* Who you can view as. "crew" (crew lead) still works in code but is hidden: for now the crew lead is just an astronaut. */
const VIEW_AS: Array<["astro" | "ground", string]> = [["astro", "Astronaut"], ["ground", "Ground"]];
const roleRoute = (r: string) => (r === "crew" ? ROUTE.crew : r === "ground" ? ROUTE.ground : ROUTE.home);

export function ConsoleShell({ children }: { children: ReactNode }) {
  const { s, live, atPresent, theme } = useConsole();
  const path = usePathname();
  const focus = path.startsWith(ROUTE.checkin) && atPresent;
  const full = path.startsWith(ROUTE.companion);
  const alertsPanel = s.alerts && !full && s.role !== "ground";
  const mainRef = useRef<HTMLElement>(null);

  // scroll to top on route change (the progress line restarts because it is keyed on the path)
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
    if (window.innerWidth < 1280) window.scrollTo(0, 0);
  }, [path]);

  return (
    <>
      {theme === "blueprint" ? <DotBackground /> : null}
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
      <div className={`app${s.log || alertsPanel ? " has-log" : ""}${focus ? " is-focus" : ""}`} id="app">
        <Header />
        <Spine />
        <Nav />
        <div className="ribbon" hidden />
        <main className="main" id="main" tabIndex={-1} ref={mainRef}>
          <div key={path} className="progress is-run" aria-hidden="true" />
          <div id="view" className={full ? "is-full" : undefined}>{children}</div>
        </main>
        {alertsPanel ? <AlertsPanel /> : <LogPanel />}
      </div>
      {!full && !path.startsWith(ROUTE.checkin) && !path.startsWith(ROUTE.ground) ? (
        <PedroGuide />
      ) : null}
      {s.role === "ground" ? null : <SettingsDialog />}
      <Tips />
      <EarthToast companionRoute={ROUTE.companion} />
      <div className="vh" aria-live="polite" aria-atomic="true">{live}</div>
    </>
  );
}

/* "Viewing Sol N · Return to today" on every screen when a past sol is chosen */
export function ReplayNote() {
  const { s, set, atPresent } = useConsole();
  if (atPresent) return null;
  return (
    <p className="replay">
      Viewing Sol <Num>{s.sol}</Num> · <Num>{solDate(s.sol)}</Num>. Readouts show that sol.{" "}
      <button type="button" className="ta" onClick={() => set({ sol: P })}>Return to today (Sol <Num>{P}</Num>)</button>
    </p>
  );
}

/* ---------- header: mission, sol, simulated-data pill, demo menu (A8) ---------- */
function Header() {
  const { s, set, atPresent, clockMin, landing, theme, setTheme, say } = useConsole();
  const router = useRouter();
  const detRef = useRef<HTMLDetailsElement>(null);
  const c = crewById(s.me);

  useEffect(() => {
    const close = (e: MouseEvent) => { const d = detRef.current; if (d?.open && !d.contains(e.target as Node)) d.open = false; };
    const esc = (e: KeyboardEvent) => { const d = detRef.current; if (e.key === "Escape" && d?.open) { d.open = false; d.querySelector("summary")?.focus(); } };
    document.addEventListener("click", close, true);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close, true); document.removeEventListener("keydown", esc); };
  }, []);

  return (
    <header className="hdr" id="hdr">
      <div className="hdr__l" style={{ flex: "1 1 auto" }}>
        <Link className="hdr__mission" href={landing}>Pedro</Link>
        <span className="hdr__sol">
          Sol <Num>{s.sol}</Num>
          <span className="hdr__time">
            {atPresent ? <> · <Num>{hm(clockMin)}</Num><span className="tz">&nbsp;{MISSION.tz}</span></> : <> · <Num>{solDate(s.sol)}</Num></>}
          </span>
        </span>
        {/* how far Earth is, and so how late its messages are (real light time); the demo itself delivers in 1 min */}
        <span className="hdr__earth" tabIndex={0}
          data-tip={`Distance from Earth: about ${Math.round(earthDistanceMkm(s.sol))} million km (${Math.round(earthDistanceMkm(s.sol) * 0.621371)} million miles) on Sol ${s.sol}. One-way light time (OWLT): ${lightDelayMin(s.sol)} min, the time a radio message takes to cross that distance at the speed of light. Round-trip light time (RTLT): ${2 * lightDelayMin(s.sol)} min, a message there plus the answer back. Over a mission OWLT runs from about 3 to 22 min (RTLT up to about 44 min), per NASA. In this demo, messages between Earth and the crew arrive within ${DEMO_DELAY_MIN} min. The ship on the route marks progress through the ${MISSION.totalSols}-sol mission (simulation only).`}
          aria-label={`Earth ${Math.round(earthDistanceMkm(s.sol))} million kilometres away, ${lightDelayMin(s.sol)} minute minutes one-way light time, ${2 * lightDelayMin(s.sol)} minutes round-trip light time. Demo delivers in ${DEMO_DELAY_MIN} minute.`}>
          <span className="hdr__planet"><span className="hdr__orb hdr__orb--earth" aria-hidden="true" />Earth</span>
          {/* route from Earth to Mars; the ship marks how far through the mission this sol is (simulation only) */}
          <span className="hdr__link" aria-hidden="true">
            <span className="hdr__beam" />
            <span className="hdr__ship" style={{ left: `${Math.min(100, (s.sol / MISSION.totalSols) * 100)}%` }} title="Simulated">
              <Rocket className="hdr__rocket" />
              <span className="hdr__mlabel">Sol <Num>{s.sol}</Num>/<Num>{MISSION.totalSols}</Num> · sim</span>
            </span>
          </span>
          <span className="hdr__planet">Mars<span className="hdr__orb hdr__orb--mars" aria-hidden="true" /></span>
          <span className="hdr__dist"><span className="t3">Distance from Earth</span> <Num>{Math.round(earthDistanceMkm(s.sol))}</Num> million km <span aria-hidden="true">·</span> <span className="t3">One-way light time</span> <Num>{lightDelayMin(s.sol)}</Num> min<span className="hdr__info" tabIndex={0} role="note" aria-label="What is one-way light time?" data-tip={`One-way light time: how long a message takes to travel between Mars and Earth at the speed of light. Today a message you send reaches Earth after ${lightDelayMin(s.sol)} min, and a note from Earth reaches you after ${lightDelayMin(s.sol)} min.`}>i</span> <span aria-hidden="true">·</span> <span className="t3">Round-trip</span> <Num>{2 * lightDelayMin(s.sol)}</Num> min<span className="hdr__info" tabIndex={0} role="note" aria-label="What is round-trip?" data-tip={`Round-trip: the shortest time between asking Earth something and hearing back. Your message takes ${lightDelayMin(s.sol)} min to reach Earth and the answer ${lightDelayMin(s.sol)} min to come back, so at least ${2 * lightDelayMin(s.sol)} min, plus however long Earth takes to write the answer. That is why anything urgent is handled on board, with ${COMPANION_NAME} and the crew medical officer, instead of waiting for Earth.`}>i</span><span className="hdr__demo">demo: <Num>{DEMO_DELAY_MIN}</Num> min</span></span>
        </span>
      </div>
      <div className="hdr__r">
        {s.role === "ground" ? null : (
          <button type="button" className="hdr__item hdr__set" aria-pressed={s.settings} aria-haspopup="dialog" onClick={() => set((p) => ({ settings: !p.settings }))}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
        )}
        <span className="hdr__sim" tabIndex={0} data-tip="Prototype running on simulated data. Not a medical device.">Simulated data</span>
        <details className="demo" ref={detRef}>
          <summary className="demo__btn" aria-label="Demo controls: who you are viewing as, and the look">
            <span className="demo__init demo__init--sm" aria-hidden="true">{s.role === "crew" ? "CL" : s.role === "ground" ? "FS" : c.init}</span>
            <span className="demo__who">{s.role === "crew" ? "Crew lead" : s.role === "ground" ? "Flight surgeon" : c.full}</span>
            <Icon name="chev" />
          </summary>
          <div className="demo__pop" role="group" aria-label="Demo controls">
            <p className="demo__h">View as</p>
            <Segmented options={VIEW_AS} value={s.role === "ground" ? "ground" : "astro"} label="View as"
              onChange={(v) => { set({ role: v }); router.push(roleRoute(v)); }} />
            <p className="demo__h">Astronaut</p>
            <div className="demo__people">
              {CREW.map((p) => (
                <button key={p.id} type="button" className={`demo__p${p.id === s.me ? " is-on" : ""}`} aria-pressed={p.id === s.me}
                  onClick={() => set({ me: p.id, open: {}, why: {} })}>
                  <span className="demo__init" aria-hidden="true">{p.init}</span>
                  <span>{p.full}<span className="t2 small"> · {p.code}</span></span>
                </button>
              ))}
            </div>
            <p className="demo__h">Look</p>
            <div className="demo__themes">
              {THEMES.map(([k, n, d]) => (
                <button key={k} type="button" className={`th-sw${theme === k ? " is-on" : ""}`} aria-pressed={theme === k}
                  onClick={() => { setTheme(k); say(`Look changed to ${n}.`); }}>
                  <span className="th-sw__chip" data-chip={k} aria-hidden="true"><i /><i /><i /></span>
                  <span className="th-sw__n">{n}</span><span className="th-sw__d">{d}</span>
                </button>
              ))}
            </div>
          </div>
        </details>
      </div>
    </header>
  );
}

/* ---------- mission timeline: a role="slider" over every sol (A8, B9) ---------- */
function Spine() {
  const { s, set, personEvents } = useConsole();
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ W: 0, H: 0 });
  const drag = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const setSol = useCallback((v: number) => {
    v = Math.max(1, Math.min(P, Math.round(v)));
    set((p) => (v === p.sol ? {} : { sol: v }));
  }, [set]);

  const solFrom = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect(), horiz = r.width > r.height, L = horiz ? r.width : r.height, pad = horiz ? tok("--s-6") : tok("--s-8");
    const at = (horiz ? e.clientX - r.left : e.clientY - r.top) - pad;
    return 1 + (at / (L - pad * 2)) * (MISSION.totalSols - 1);
  };

  const { W, H } = size;
  let svg = "";
  const horiz = W > H;
  if (W && H) {
    const L = horiz ? W : H, pad = horiz ? tok("--s-6") : tok("--s-8");
    const pos = (k: number) => pad + ((k - 1) / (MISSION.totalSols - 1)) * (L - pad * 2);
    const A = horiz ? H / 2 - 4 : 12;
    const pt = (along: number, across: number) => (horiz ? [along, across] : [across, along]);
    const line = (a1: number, a2: number, c1: number, c2: number, cls: string) => { const [x1, y1] = pt(a1, c1), [x2, y2] = pt(a2, c2); return `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`; };
    svg = `<svg width="${W}" height="${H}" aria-hidden="true">`;
    svg += line(pos(1), pos(P), A + 0.5, A + 0.5, "sp-line") + line(pos(P), pos(MISSION.totalSols), A + 0.5, A + 0.5, "sp-fut");
    for (let k = 1; k <= MISSION.totalSols; k++) {
      const major = k % 10 === 0, fut = k > P, a = Math.round(pos(k)) + 0.5;
      svg += line(a, a, major ? A - 6 : A - 3, A, `sp-tick${major ? " is-major" : ""}${fut ? " is-fut" : ""}`);
      if (fut) continue;
      const ev = personEvents(s.me, k), types = new Set(ev.map((e) => e.type));
      const fl = ev.filter((e) => e.type === "flag" && e.sev !== "normal");
      if (fl.length) {
        const sev = fl.some((e) => e.sev === "act") ? "act" : "watch", c = A - 8, [x, y] = pt(Math.round(pos(k)), c);
        svg += `<path class="sp-m sp-m--${sev}${s.hi && s.hi.sol === k && s.hi.type === "flag" ? " is-hi" : ""}" d="M${x} ${y - 3}L${x + 3} ${y + 2}L${x - 3} ${y + 2}Z"/>`;
      }
      ([["checkin", 3], ["tap", 6], ["journal", 9], ["obs", 12]] as const).forEach(([t, off]) => {
        if (!types.has(t)) return;
        if (t === "checkin" && !day(s.me, k)?.checkin) return;
        const [x, y] = pt(Math.round(pos(k)) - 1, A + off);
        svg += `<rect class="sp-m sp-m--${t}${s.hi && s.hi.sol === k && s.hi.type === t ? " is-hi" : ""}" x="${x}" y="${y}" width="2" height="2"/>`;
      });
    }
    const h = pos(s.sol);
    if (horiz) {
      svg += `<line class="sp-cur" x1="${Math.round(h) + 0.5}" x2="${Math.round(h) + 0.5}" y1="2" y2="${H - 2}"/>`;
      svg += `<rect class="sp-handle" x="${h - 4}" y="${A - 8}" width="8" height="16"/>`;
      const lx = Math.max(14, Math.min(W - 14, h));
      svg += `<rect class="sp-label-bg" x="${lx - 14}" y="${H - 14}" width="28" height="13"/><text class="sp-label" text-anchor="middle" x="${lx}" y="${H - 4}">${s.sol}</text>`;
    } else {
      // caption so the strip reads as a timeline, not decoration
      svg += `<text class="sp-cap" text-anchor="middle" x="${W / 2}" y="14">SOLS</text>`;
      svg += `<text class="sp-cap sp-cap--side" text-anchor="middle" transform="translate(${W - 13} ${H / 2}) rotate(90)">MISSION TIMELINE · DRAG TO REVIEW</text>`;
      svg += `<line class="sp-cur" x1="2" x2="${W - 2}" y1="${Math.round(h) + 0.5}" y2="${Math.round(h) + 0.5}"/>`;
      svg += `<rect class="sp-handle" x="4" y="${h - 4}" width="${W - 8}" height="8"/>`;
      const ly = h < 40 ? h + 20 : h - 8;
      svg += `<rect class="sp-label-bg" x="2" y="${ly - 11}" width="${W - 4}" height="15"/><text class="sp-label" text-anchor="middle" x="${W / 2}" y="${ly}">Sol ${s.sol}</text>`;
    }
    svg += "</svg>";
  }

  return (
    <div className="spine" id="spine" ref={ref} role="slider" title="Mission timeline: drag or use arrow keys to view another sol" tabIndex={0} aria-label="Mission timeline: choose a sol to view"
      aria-valuemin={1} aria-valuemax={P} aria-valuenow={s.sol} aria-orientation={horiz ? "horizontal" : "vertical"}
      aria-valuetext={`Sol ${s.sol}, ${solDate(s.sol)}${s.sol === P ? ", today" : ""}`}
      onPointerDown={(e) => { drag.current = true; set({ logRange: "sol" }); try { ref.current?.setPointerCapture(e.pointerId); } catch { /* optional */ } setSol(solFrom(e)); }}
      onPointerMove={(e) => { if (drag.current) setSol(solFrom(e)); }}
      onPointerUp={() => { drag.current = false; }}
      onKeyDown={(e) => {
        const k = ({ ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1, PageUp: -7, PageDown: 7 } as Record<string, number>)[e.key];
        if (k) { setSol(s.sol + k); e.preventDefault(); }
        if (e.key === "Home") { setSol(1); e.preventDefault(); }
        if (e.key === "End") { setSol(P); e.preventDefault(); }
      }}
      dangerouslySetInnerHTML={{ __html: svg }} />
  );
}

/* ---------- nav: Home, Companion, Crew; then Alerts, Mission log (check-in is a card on Home) ---------- */
function Nav() {
  const { s, set, openFlags } = useConsole();
  const path = usePathname();
  const on = (r: string) => (r === "/" ? path === "/" : path.startsWith(r));
  const inPedro = on(ROUTE.companion);
  const drawerAlerts = inPedro && s.drawer && s.tab === "alerts" && !s.settings;
  const alertsOn = drawerAlerts || (!inPedro && s.alerts);
  let screens: Array<[string, string, boolean, ReactNode]> = [
    [ROUTE.home, "Home", on(ROUTE.home) || on(ROUTE.checkin), null],
    [ROUTE.companion, "Pedro", inPedro && !drawerAlerts, null],
    [ROUTE.crew, "Crew", on(ROUTE.crew), null],
  ];
  if (s.role === "crew") screens = [screens[2], screens[0], screens[1]];
  if (s.role === "ground") {
    const nEsc = escalations(s.sol, s.shares, s.convo).length;
    screens = [
      [ROUTE.ground, "Dashboard", path === ROUTE.ground, null],
      [ROUTE.groundEsc, "Escalations", path === ROUTE.groundEsc, nEsc ? <span className="nav__n nav__n--alert num">{nEsc}</span> : null],
      [ROUTE.groundReports, "Pedro reports", path === ROUTE.groundReports, <span key="n" className="nav__n num">{CREW.filter((c) => day(c.id, s.sol)?.checkin).length}/{CREW.length}</span>],
    ];
  }
  const nAlerts = openFlags().length;
  const [help, setHelp] = useState(false);

  return (
    <nav className="nav" id="nav" aria-label="Screens">
      <div className="nav__top">
        <ul className="nav__list" aria-label="Screens">
          {screens.map(([href, label, isOn, badge]) => (
            <li key={href}>
              <Link href={href} className={`nav__a${isOn ? " is-on" : ""}`} aria-current={isOn ? "page" : undefined}
                onClick={() => { if (href === ROUTE.companion) set({ drawer: false, tab: "conversation", settings: false }); }}>
                <span>{label}</span>{badge}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <div className="nav__bottom">
        <ul className="nav__list nav__list--tools">
          {s.role === "ground" ? null : <li>
            <button type="button" className={`nav__a${alertsOn ? " is-on" : ""}`} aria-label={`Alerts, ${nAlerts} open`}
              aria-pressed={inPedro ? undefined : s.alerts} aria-controls={inPedro ? undefined : "log"}
              onClick={() => {
                // On the Pedro page alerts live in its drawer; everywhere else they open a side panel
                // that pushes the content, like the Mission log (one panel at a time).
                if (inPedro) set({ drawer: true, tab: "alerts", settings: false });
                else set((p) => ({ alerts: !p.alerts, log: false }));
              }}>
              <span>Alerts</span>{nAlerts ? <span className="nav__n nav__n--alert num">{nAlerts}</span> : null}
            </button>
          </li>}
          <li>
            <button type="button" className={`nav__a${s.log ? " is-open" : ""}`} aria-pressed={s.log} aria-controls="log"
              onClick={() => set((p) => ({ log: !p.log, alerts: false }))}>
              <span>Mission log</span>{s.log ? <span className="nav__n">Open</span> : null}
            </button>
          </li>
        </ul>
        <details className="nav__help" open={help} onToggle={(e) => setHelp((e.target as HTMLDetailsElement).open)}>
          <summary>How the timeline works</summary>
          <p>The strip on the far left labelled “Mission timeline” is the whole mission. Drag it, or focus it and use the arrow keys, to look back at any sol.</p>
          <div className="nav__legend" aria-label="Timeline legend">
            <span><StatusMark state="watch" />Flag raised</span>
            <span><svg className="mk" viewBox="0 0 8 8" aria-hidden="true"><rect className="sp-m--checkin" x="2" y="2" width="4" height="4" /></svg>Check-in</span>
            <span><svg className="mk" viewBox="0 0 8 8" aria-hidden="true"><rect className="sp-m--tap" x="2" y="2" width="4" height="4" /></svg>Reaction test</span>
            <span><svg className="mk" viewBox="0 0 8 8" aria-hidden="true"><rect className="sp-m--journal" x="2" y="2" width="4" height="4" /></svg>Journal</span>
          </div>
        </details>
      </div>
    </nav>
  );
}


/* ---------- mission log side panel ---------- */
/* Alerts side panel: same slot and push behaviour as the Mission log, so the current screen stays put. */
function AlertsPanel() {
  const c = useConsole();
  const { s, set } = c;
  const ready = hasBaseline(s.me, s.sol), flags = ready ? c.flagsFor() : [], open = c.openFlags().length;
  return (
    <aside className="log" id="log" aria-label="Alerts">
      <div className="log__head">
        <div className="log__row1">
          <h2 className="sec-t m0">Alerts</h2>
          <button type="button" className="ta ta--quiet small" onClick={() => set({ alerts: false })}>Close</button>
        </div>
        <span className="num small t2">Sol {s.sol} · {open} open of {flags.length}</span>
      </div>
      <div className="alerts-panel">
        {!ready ? <p className="log__empty">Alerts start once your baseline exists.</p>
          : flags.length ? <FlagList flags={flags} ctx="p" />
            : <p className="log__empty">No open alerts. All seven measures sit within your normal.</p>}
      </div>
    </aside>
  );
}

function LogPanel() {
  const { s, set, personEvents } = useConsole();
  const path = usePathname();
  const crewOnly = path.startsWith(ROUTE.crew) || path.startsWith(ROUTE.ground);
  const scope = crewOnly ? "crew" : s.logScope;
  if (!s.log) return <aside className="log" id="log" aria-label="Mission log" />;
  const [a, b] = s.logRange === "sol" ? [s.sol, s.sol] : [Math.max(1, s.sol - 2), s.sol];
  const F = s.logF;
  const groups: Array<{ sol: number; rows: LogEvent[] }> = [];
  for (let k = b; k >= a; k--) {
    const ev = scope === "crew" ? crewEvents(k, s.shares) : personEvents(s.me, k);
    const f = ev.filter((e) => (e.type === "flag" && F.flag) || ((e.type === "checkin" || e.type === "tap" || e.type === "team") && F.checkin) || (e.type === "journal" && F.journal) || (e.type === "obs" && F.obs));
    groups.push({ sol: k, rows: f.slice().reverse() });
  }
  const any = groups.some((g) => g.rows.length);
  const toggleF = (k: keyof typeof F) => set((p) => ({ logF: { ...p.logF, [k]: !p.logF[k] } }));

  return (
    <aside className="log" id="log" aria-label="Mission log">
      <div className="log__head">
        <div className="log__row1">
          <h2 className="sec-t m0">Mission log</h2>
          <span className="log__tools">
            <Segmented options={[["person", "Person"], ["crew", "Crew"]]} value={scope} label="Log scope" disabled={crewOnly ? ["person"] : []}
              onChange={(v) => set({ logScope: v })} />
            <button type="button" className="log__x" aria-label="Close mission log" title="Close" onClick={() => set({ log: false })}>×</button>
          </span>
        </div>
        <div className="log__row1">
          <span className="num small t2">{a === b ? `Sol ${b}` : `Sol ${a}–${b}`} · newest first</span>
          {a === b
            ? <button type="button" className="ta ta--quiet small" onClick={() => set({ logRange: "three" })}>Show 3 sols</button>
            : <button type="button" className="ta ta--quiet small" onClick={() => set({ logRange: "sol" })}>This sol only</button>}
        </div>
        <div className="log__filters" role="group" aria-label="Filters">
          <Toggle on={F.flag} label="Flags" onClick={() => toggleF("flag")} />
          <Toggle on={F.checkin} label="Check-ins" onClick={() => toggleF("checkin")} />
          {scope === "person" ? <>
            <Toggle on={F.journal} label="Journal" onClick={() => toggleF("journal")} />
            <Toggle on={F.obs} label="Observations" onClick={() => toggleF("obs")} />
          </> : null}
        </div>
        <p className="small t2">{scope === "crew" ? "Team-level events only. No names, no individual values." : `Your events, ${crewById(s.me).full}. Private to you.`}</p>
      </div>
      {any ? groups.map((g) => (
        <div key={g.sol}>
          <div className="lr-sol"><span>Sol <Num>{g.sol}</Num>{g.sol === P ? " · Today" : ""}</span><span className="num">{solDate(g.sol)}</span></div>
          {g.rows.length ? g.rows.map((e, i) => {
            const hi = s.hi && s.hi.sol === g.sol && s.hi.idx === `${e.type}${e.min}`;
            return (
              <button key={i} type="button" className={`lr${hi ? " is-hi" : ""}`}
                onClick={() => {
                  set({ hi: { sol: g.sol, type: e.type, key: e.key ?? null, idx: `${e.type}${e.min}` } });
                  window.setTimeout(() => set((p) => (p.hi ? { hi: { ...p.hi, key: null } } : {})), 2400);
                }}>
                <span className="lr__t">{hm(e.min)}</span><span className="lr__m"><StatusMark state={e.sev} /></span>
                <span className="lr__x">{e.text}</span><span className="lr__c">{e.code}</span>
              </button>
            );
          }) : <p className="log__empty">Nothing logged with these filters.</p>}
        </div>
      )) : (
        <p className="log__empty">Nothing logged for {a === b ? `Sol ${b}` : "these sols"} with these filters.{" "}
          <button type="button" className="ta" onClick={() => set({ logRange: "three" })}>Show 3 sols</button></p>
      )}
    </aside>
  );
}

/* ---------- tooltips for [data-tip]: hover or focus; Esc dismisses ---------- */
function Tips() {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<string | null>(null);
  const forEl = useRef<HTMLElement | null>(null);
  const [placeFor, setPlaceFor] = useState(0);

  /* Place the tip once it is visible with its new text, so its real height is known: below the element,
     or above it when below would run off the bottom of the window (e.g. the check-in bars). */
  useLayoutEffect(() => {
    const tip = ref.current, el = forEl.current;
    if (!tip || !el || text == null) return;
    const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight, g = tok("--s-2");
    const left = Math.min(window.innerWidth - tw - g, Math.max(g, r.left));
    let top = r.bottom + g;
    if (top + th > window.innerHeight - g) top = Math.max(g, r.top - th - g);
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }, [text, placeFor]);

  useEffect(() => {
    const show = (el: HTMLElement) => {
      forEl.current = el;
      setText(el.dataset.tip || "");
      el.setAttribute("aria-describedby", "tip");
      setPlaceFor((n) => n + 1); // position after React has rendered the new text (see the layout effect)
    };
    const hide = () => { forEl.current?.removeAttribute("aria-describedby"); forEl.current = null; setText(null); };
    const over = (e: MouseEvent) => { const t = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]"); if (t && t !== forEl.current) show(t); else if (!t && forEl.current) hide(); };
    const focusin = (e: FocusEvent) => { const t = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]"); if (t) show(t); else hide(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && forEl.current) hide(); };
    document.addEventListener("mouseover", over);
    document.addEventListener("focusin", focusin);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("focusin", focusin);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", key);
    };
  }, []);

  return <div ref={ref} className="tip" id="tip" role="tooltip" hidden={text == null}>{text}</div>;
}

/* Blueprint look background: navy page, a soft spotlight near the top, and a static dot pattern
   that fades out towards the edges. Sits behind the app and ignores the pointer. */
function DotBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 bg-bg">
      <div className="absolute inset-0 bg-[radial-gradient(circle_720px_at_50%_200px,var(--c-spot),transparent_70%)]" />
      <DotPattern width={20} height={20} cx={1} cy={1} cr={1}
        className="fill-[var(--c-dot)] [mask-image:radial-gradient(ellipse_at_center,white_35%,transparent_90%)]" />
    </div>
  );
}
