/* Ground (flight surgeon on Earth): what reaches Earth in a downlink.
   Privacy rule: per person, only the measures that person shares, plus escalations by name
   (an Act status on any measure, and every time the companion gave the emergency notice).
   Journals, conversation text and unshared values never leave the hab. */
import {
  CREW, KEYS, MEASURES, MISSION, MKEY, P, RANK, day, fmt, fmtDelta, isOut, mstatus, missed7, teamStatus,
  type ConvoRow, type MeasureKey, type Shares, type State,
} from "./data";

/* ---------- downlink: Earth sees the hab late, never live ---------- */
const PASSES = [6 * 60 + 30, 12 * 60 + 30, 18 * 60 + 30, 23 * 60 + 30]; // LMST, simulated relay passes
const SYNODIC_SOLS = 767;

/* Earth–Mars distance runs from about 54.6 million km (closest possible approach) to about 401 million km
   (opposite sides of the Sun). Light covers 17.99 million km a minute (299,792.458 km/s × 60), so the one-way
   delay runs from about 3 to about 22 minutes, and a question and its answer take up to about 44 minutes.
   NASA: one-way delay of 21–23 minutes at most for a crewed mission (Mars Communications Disruption and Delay,
   nasa.gov), "up to a 44-minute round-trip latency" (NASA/TM-20250003885), just over 3 minutes at closest
   approach (2024 Moon to Mars Architecture white paper). The sol's position in the 780-day synodic cycle
   (767 sols) is simulated. */
export const MIN_MKM = 54.6, MAX_MKM = 401;
const LIGHT_MKM_PER_MIN = 299_792.458 * 60 / 1e6;

/** Earth–Mars distance in million km on this sol (unrounded). */
export function earthDistanceMkm(sol: number) {
  const phase = (2 * Math.PI * (sol + 100)) / SYNODIC_SOLS;
  return MIN_MKM + (MAX_MKM - MIN_MKM) * (1 - Math.cos(phase)) / 2;
}
/** One-way light time Mars ↔ Earth in whole minutes (3 to 22) on this sol. */
export function lightDelayMin(sol: number) {
  return Math.round(earthDistanceMkm(sol) / LIGHT_MKM_PER_MIN);
}

export type Downlink = { sol: number; min: number; next: number | null; delay: number };
/** The last relay pass at or before the hab clock. Past sols are seen as of their final pass. */
export function lastDownlink(sol: number, clockMin: number): Downlink {
  const delay = lightDelayMin(sol);
  if (sol < P) return { sol, min: PASSES[PASSES.length - 1], next: null, delay };
  const done = PASSES.filter((m) => m <= clockMin);
  const min = done.length ? done[done.length - 1] : PASSES[PASSES.length - 1];
  return { sol: done.length ? sol : sol - 1, min, next: PASSES.find((m) => m > clockMin) ?? null, delay };
}

/* ---------- per person: shared measures only ---------- */
export type GroundCell = { key: MeasureKey; shared: boolean; state: State; k: number; value: string; delta: string };
export type GroundRow = {
  id: string; full: string; code: string; role: string;
  checkedIn: boolean; missed7: number; sharedN: number;
  cells: GroundCell[]; worst: State;
};
export function groundRows(sol: number, shares: Shares): GroundRow[] {
  return CREW.map((c) => {
    const mine = shares[c.id] || [];
    const cells = KEYS.map((key): GroundCell => {
      const shared = mine.includes(key);
      if (!shared) return { key, shared, state: "pending", k: 0, value: "", delta: "" };
      const st = mstatus(c.id, key, sol);
      return { key, shared, state: st.state, k: st.k, value: fmt(key, st.value), delta: st.base ? fmtDelta(key, st.delta) : "" };
    });
    const worst = cells.filter((x) => x.shared).reduce<State>((w, x) => (RANK[x.state] > RANK[w] ? x.state : w), "normal");
    return {
      id: c.id, full: c.full, code: c.code, role: c.role,
      checkedIn: !!day(c.id, sol)?.checkin, missed7: missed7(c.id, sol), sharedN: mine.length,
      cells, worst,
    };
  });
}

/* ---------- escalations: always reach Earth by name, never with values or words ---------- */
export type Escalation =
  | { kind: "act"; id: string; full: string; code: string; key: MeasureKey; k: number; shared: boolean; since: number | null }
  | { kind: "companion"; id: string; full: string; code: string; sol: number; min: number };
export function escalations(sol: number, shares: Shares, convo: Record<string, ConvoRow[]>): Escalation[] {
  const out: Escalation[] = [];
  CREW.forEach((c) => {
    MEASURES.forEach((m) => {
      const st = mstatus(c.id, m.key, sol);
      if (st.state === "act") out.push({ kind: "act", id: c.id, full: c.full, code: c.code, key: m.key, k: st.k, shared: (shares[c.id] || []).includes(m.key), since: st.from });
    });
    (convo[c.id] || []).filter((r) => r.escalation && r.sol <= sol && r.sol > sol - 14)
      .forEach((r) => out.push({ kind: "companion", id: c.id, full: c.full, code: c.code, sol: r.sol, min: r.min }));
  });
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "companion" ? -1 : 1));
}
export const escalationText = (e: Escalation) =>
  e.kind === "companion"
    ? "Pedro gave the emergency notice. What was said stays on board."
    : `${MKEY[e.key].name} at Act, ${e.k} ${MKEY[e.key].unitWord} outside their own normal${e.shared ? "" : ". Measure not shared, so no values"}.`;

/* ---------- crew-level numbers for the written downlink summary (C7: aggregates only) ---------- */
export function groundAggregate(sol: number, shares: Shares) {
  const areas = (["sleep", "mood", "load", "team"] as MeasureKey[]).map((k) => teamStatus(k, sol, shares)).filter((t) => t.state !== "pending");
  const worst = areas.reduce<State>((w, t) => (RANK[t.state] > RANK[w] ? t.state : w), "normal");
  let shared = 0, sharedOut = 0, act = 0;
  CREW.forEach((c) => {
    (shares[c.id] || []).forEach((k) => { shared++; if (isOut(mstatus(c.id, k, sol))) sharedOut++; });
    KEYS.forEach((k) => { if (mstatus(c.id, k, sol).state === "act") act++; });
  });
  return {
    sol,
    team_status: areas.length ? worst : "not enough shared",
    areas_shown: areas.length,
    areas_needing_attention: areas.filter((t) => isOut(t)).length,
    crew_size: CREW.length,
    checked_in: CREW.filter((c) => day(c.id, sol)?.checkin).length,
    shared_measures: shared,
    shared_measures_outside_normal: sharedOut,
    act_statuses: act,
    one_way_delay_minutes: lightDelayMin(sol),
  };
}

/* ---------- one person's check-ins over the last 14 sols ---------- */
export function personCheckins(id: string, sol: number) {
  const rows: Array<{ sol: number; done: boolean; min: number | null }> = [];
  for (let t = Math.max(1, sol - MISSION.window + 1); t <= sol; t++) { const c = day(id, t)?.checkin; rows.push({ sol: t, done: !!c, min: c?.min ?? null }); }
  const past = rows.filter((r) => r.sol < P);
  return { rows, done: past.filter((r) => r.done).length, of: past.length };
}

/* ---------- check-in adherence over the last 14 sols, crew-level ---------- */
export function adherence(sol: number) {
  const rows: Array<{ sol: number; done: number }> = [];
  for (let t = Math.max(1, sol - MISSION.window + 1); t <= sol; t++) rows.push({ sol: t, done: CREW.filter((c) => day(c.id, t)?.checkin).length });
  const past = rows.filter((r) => r.sol < P);
  const rate = past.length ? past.reduce((a, r) => a + r.done, 0) / (past.length * CREW.length) : null;
  return { rows, rate };
}
