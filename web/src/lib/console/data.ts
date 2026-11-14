/* Companion Console data: crew, seven measures per crew member per sol, baselines,
   statuses, flags, log events and companion messages.
   Ported from docs/design/companion-console/reference/sample-data.js (simulated mission).
   Pure functions with no model calls, so every screen works with all models off (track B).
   When the B1 data shape is written down, swap `day()` for the real check-in store. */

export type MeasureKey = "sleep" | "rt" | "timing" | "mood" | "load" | "team" | "engage";
export type State = "normal" | "watch" | "act" | "pending" | "nobase";
export type Sev = State | "info";

export type Measure = {
  key: MeasureKey;
  code: string;
  name: string;
  short: string;
  bad: "low" | "high" | "both";
  minHalf: number;
  source: string;
  unitWord: string;
  tip: string;
};

export type CrewMember = {
  id: string;
  full: string;
  init: string;
  role: string;
  code: string;
  age: number;
  /** shown only on the person's own Home profile; never on Crew or Ground views */
  blood: string;
  /** optional portrait image under /public, e.g. "/crew/sato.jpg"; a drawn portrait is used otherwise */
  photo?: string;
  b: { onset: number; wake: number; rt: number; mood: number; load: number; team: number; words: number; meals: number };
  shares: MeasureKey[];
};

export type Day = {
  sol: number;
  onset: number;
  wake: number;
  sleep: number | null;
  mid: number | null;
  rt: number | null;
  slow: number | null;
  mood: number | null;
  load: number | null;
  team: number | null;
  meals: number | null;
  words: number | null;
  checkin: { min: number } | null;
};

export type Baseline = { med: number; half: number; lo: number; hi: number; n: number };

export type Status = {
  key: MeasureKey;
  state: State;
  k: number;
  latest: number | null;
  value: number | null;
  base: Baseline | null;
  delta: number | null;
  from: number | null;
  to: number | null;
  missed: number;
};

export type LogEvent = {
  sol: number;
  min: number;
  type: "tap" | "checkin" | "flag" | "journal" | "obs" | "team";
  sev: Sev;
  code: string;
  text: string;
  key?: MeasureKey;
};

export type JournalEntry = { sol: number; min: number; text: string; obs?: string };
export type Shares = Record<string, MeasureKey[]>;

export type VoicePhrase = {
  text: string;
  intent?: string;
  fail?: string;
  parse?: { key: MeasureKey | "meals"; label: string; v?: number; onset?: number; wake?: number };
};

export type ConvoRow = {
  sol: number;
  min: number;
  who: "companion" | "you" | "parsed" | "sys" | "summary";
  text?: string;
  label?: string;
  value?: string;
  key?: string;
  sources?: Array<{ id: string; title: string; source: string; added: string; authorised_by: string }>;
  /** The measures that are off, as short rows built from the numbers. */
  facts?: Array<{ key: string; label: string; value: string; detail: string }>;
  /** The one suggested action, from the app. */
  action?: string;
  escalation?: boolean;
  noAnswer?: boolean;
  offline?: boolean;
  stopped?: boolean;
  /** loaded from local storage: shown in the log, never spoken again */
  restored?: boolean;
};

export const P = 142; // present sol
export const MISSION = {
  name: "Meridian-2",
  site: "Hab-1",
  totalSols: 180,
  presentSol: P,
  clockMin: 14 * 60 + 26,
  tz: "LMST",
  window: 14,
  earthDayOfSol1: Date.UTC(2041, 2, 3),
  /* hab schedule and environment (simulated, same for every crew member) */
  firstDuty: 8 * 60 + 30,
  lightsDim: 22 * 60 + 30,
  cabinTempC: 21.5,
};

/* the companion's name, shown on its avatar and spoken in the check-in */
export const COMPANION_NAME = "Pedro";

export const MEASURES: Measure[] = [
  { key: "sleep", code: "SL-03", name: "Sleep duration", short: "sleep", bad: "low", minHalf: 0.4, source: "Asked in conversation", unitWord: "nights",
    tip: "Hours asleep last night, from the times you gave." },
  { key: "rt", code: "PF-01", name: "Reaction time", short: "reaction time", bad: "high", minHalf: 15, source: "Optional tap test", unitWord: "tests",
    tip: "Reaction time: how fast you tap when a target appears. Slower than usual can mean tiredness." },
  { key: "timing", code: "SL-07", name: "Sleep timing", short: "sleep timing", bad: "both", minHalf: 25, source: "Worked out from sleep times", unitWord: "nights",
    tip: "Sleep midpoint: the clock time halfway between falling asleep and waking. It shows whether your sleep is drifting earlier or later." },
  { key: "mood", code: "MD-02", name: "Mood", short: "mood", bad: "low", minHalf: 0.75, source: "You rate it, 1 to 5", unitWord: "days", tip: "Your own 1 to 5 rating of mood today." },
  { key: "load", code: "WL-02", name: "Workload & stress", short: "workload", bad: "high", minHalf: 0.75, source: "You rate it, 1 to 5", unitWord: "days", tip: "Your own 1 to 5 rating of how heavy the day was." },
  { key: "team", code: "TM-04", name: "Teamwork", short: "teamwork", bad: "low", minHalf: 0.75, source: "You rate it, 1 to 5, plus shared meals", unitWord: "days", tip: "How well the crew worked together, 1 to 5, and whether you shared a meal." },
  { key: "engage", code: "EN-01", name: "Engagement", short: "engagement", bad: "low", minHalf: 60, source: "Measured, never asked", unitWord: "days",
    tip: 'Engagement is measured, not asked: words spoken to the companion each sol and check-ins missed in 7 days. That way "fine" cannot hide a slow withdrawal.' },
];
export const KEYS = MEASURES.map((m) => m.key);
export const MKEY = Object.fromEntries(MEASURES.map((m) => [m.key, m])) as Record<MeasureKey, Measure>;
export const TERMS: Record<string, string> = {
  baseline: "Your baseline is your own normal: the median of your last 14 sols, with a band for your usual day-to-day spread. You are never compared with other crew.",
  "reaction time": MKEY.rt.tip,
  "sleep midpoint": MKEY.timing.tip,
  engagement: MKEY.engage.tip,
};

export const CREW: CrewMember[] = [
  { id: "okafor", full: "Adaeze Okafor", init: "AO", role: "Commander", code: "CDR", age: 46, blood: "A+", photo: "/crew/okafor.png",
    b: { onset: -20, wake: 425, rt: 255, mood: 4, load: 3, team: 4, words: 380, meals: 1.6 },
    shares: ["sleep", "rt", "timing", "mood", "load", "team", "engage"] },
  { id: "lindqvist", full: "Mattias Lindqvist", init: "ML", role: "Flight engineer", code: "FE", age: 41, blood: "O-", photo: "/crew/lindqvist.png",
    b: { onset: 0, wake: 425, rt: 265, mood: 4, load: 3, team: 4, words: 450, meals: 1.4 },
    shares: ["sleep", "mood", "load", "team", "engage"] },
  { id: "sato", full: "Kenji Sato", init: "KS", role: "Mission specialist, geology", code: "MS-1", age: 38, blood: "O+", photo: "/crew/sato.png",
    b: { onset: 15, wake: 460, rt: 248, mood: 4, load: 3, team: 4, words: 520, meals: 1.5 },
    shares: [] },
  { id: "reyes", full: "Daniela Reyes", init: "DR", role: "Mission specialist, life support", code: "MS-2", age: 35, blood: "B+", photo: "/crew/reyes.png",
    b: { onset: -10, wake: 430, rt: 260, mood: 4, load: 3, team: 4, words: 300, meals: 1.2 },
    shares: ["sleep", "mood", "team", "engage"] },
];
const cidx = (id: string) => CREW.findIndex((c) => c.id === id);
export const crewById = (id: string) => CREW[cidx(id)];
const MISSED: Record<string, number[]> = { sato: [P - 9, P - 5], reyes: [P - 6, P - 4, P - 2], lindqvist: [P - 11], okafor: [] };
const OPEN_TODAY: Record<string, boolean> = { sato: true, reyes: true };

/* journal: private, never reaches Crew */
export const JOURNAL: Record<string, JournalEntry[]> = {
  sato: [
    { sol: 130, min: 20 * 60 + 45, text: "Video letter from home. Watched it twice." },
    { sol: 132, min: 21 * 60 + 10, text: "Dust forecast pushed the traverse. Felt restless, did the full exercise block." },
    { sol: 135, min: 21 * 60 + 30, text: "Quiet sol. Read for an hour. Slept well." },
    { sol: 137, min: 22 * 60 + 5, text: "Skipped the check-in. Not avoiding it, just ran out of day.", obs: "Skipped check-ins are fine. Your baseline simply uses the days you logged." },
    { sol: 139, min: 20 * 60 + 50, text: "Shared dinner. Daniela told the greenhouse fan story. First time in a while everyone laughed at the same thing.", obs: "Teamwork rated 4 that day, your normal." },
    { sol: 140, min: 22 * 60 + 15, text: "Logged fourteen core sections. Satisfying work. Went to bed late again because I wanted to finish the labels." },
    { sol: 141, min: 21 * 60 + 40, text: "Good EVA prep session. Mattias looks tired. Should ask him to dinner.", obs: "Shared meals across the crew are down this week. That is a crew-level figure; nothing about one person is shown." },
    { sol: 142, min: 7 * 60 + 58, text: "Third night in a row I couldn't settle. My head keeps going over tomorrow's core samples.", obs: "Entries on Sol 140 and 142 mention going to bed late. Those are the same nights your sleep midpoint moved later." },
  ],
  okafor: [
    { sol: 134, min: 21 * 60 + 15, text: "Call home. Good to hear the dog in the background." },
    { sol: 138, min: 20 * 60 + 30, text: "Exercise block felt easy today." },
    { sol: 141, min: 21 * 60 + 5, text: "Long sol. Systems checks ran over, but the crew handled it well." },
  ],
  lindqvist: [
    { sol: 136, min: 22 * 60 + 40, text: "Pump fault again. Third time this month." },
    { sol: 139, min: 23 * 60 + 5, text: "Skipped dinner to finish the seals. Probably a mistake.", obs: "Workload has sat above your normal since Sol 138." },
    { sol: 141, min: 23 * 60 + 20, text: "Tired. Pump is nearly done." },
  ],
  reyes: [
    { sol: 133, min: 20 * 60 + 15, text: "Greenhouse fan is fixed. Small win." },
    { sol: 137, min: 21 * 60 + 50, text: "Quiet day. Did not feel like talking much.", obs: "Fewer words with the companion than usual this week. Nothing more is read into it." },
  ],
};

/* voice phrases (simulated; there is no microphone yet, C2 replaces this) */
export const VOICE: Record<string, VoicePhrase[]> = {
  companion: [
    { text: "How did I sleep compared to normal?", intent: "sleep" },
    { text: "Feeling a bit flat today. Mood is maybe a three.", parse: { key: "mood", label: "Mood", v: 3 } },
    { text: "Anything I should watch today?", intent: "watch" },
    { text: "Mm, not sure, could you…", fail: "Didn't catch a question. Try again, or type instead." },
    { text: "Can you summarize my week?", intent: "summary" },
  ],
  sleep: [
    { text: "Fell asleep around one forty and woke just before eight.", parse: { key: "sleep", label: "Slept", onset: 100, wake: 475 } },
    { text: "Pretty late, I think.", fail: 'Heard "pretty late" but no clock times. Tap the times instead.' },
  ],
  mood: [
    { text: "Maybe a three today.", parse: { key: "mood", label: "Mood", v: 3 } },
    { text: "Okay, I guess.", fail: 'Heard "okay" but no number from 1 to 5. Tap a mark instead.' },
  ],
  load: [
    { text: "Heavy. Call it a four.", parse: { key: "load", label: "Workload", v: 4 } },
    { text: "Busy…", fail: 'Heard "busy" but no number from 1 to 5. Tap a mark instead.' },
  ],
  team: [
    { text: "Crew worked well today, a four.", parse: { key: "team", label: "Teamwork", v: 4 } },
    { text: "Fine.", fail: 'Heard "fine" but no number from 1 to 5. Tap a mark instead.' },
  ],
  meals: [
    { text: "We had dinner together.", parse: { key: "meals", label: "Shared meals", v: 1 } },
    { text: "Um…", fail: "Didn't catch an answer. Tap one of the options instead." },
  ],
};

/* one suggested action per flag (D2 replaces this text) */
const SUGGEST: Record<MeasureKey, (u: number) => string> = {
  timing: (u) => `Start wind-down at ${hm(Math.round((u - 45) / 15) * 15)} tonight.`,
  sleep: () => "Block an 8-hour sleep window tonight.",
  rt: () => "Move precision tasks to after a break today.",
  mood: () => "Take 20 minutes off-task today.",
  load: () => "Ask to move one non-critical task.",
  team: () => "Join the next shared meal.",
  engage: () => "Do a two-minute check-in today.",
};

/* ---------- helpers ---------- */
function rnd(ci: number, sol: number, k: number) {
  let h = Math.imul(ci + 17, 0x9e3779b1) ^ Math.imul(sol + 5, 0x85ebca77) ^ Math.imul(k + 3, 0xc2b2ae3d);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const nz = (ci: number, sol: number, k: number) => (rnd(ci, sol, k) + rnd(ci, sol, k + 31) + rnd(ci, sol, k + 67) - 1.5) / 1.5;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const median = (a: number[]): number | null => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const avg = (a: number[]): number | null => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pad = (n: number) => String(n).padStart(2, "0");
export const hm = (m: number) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };
export const listJoin = (a: string[]) => (a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);

/* Overrides hold what this browser session submitted for today. */
const overrides: Record<string, Partial<Day>> = {};
let dcache = new Map<string, Day | null>(), scache = new Map<string, Status>(), ecache = new Map<string, LogEvent[]>();
function bump() { dcache = new Map(); scache = new Map(); ecache = new Map(); }
const rating = (ci: number, sol: number, k: number, base: number) => { const r = rnd(ci, sol, k); return clamp(base + (r < 0.07 ? 1 : r > 0.965 ? -1 : 0), 1, 5); };

/* ---------- one sol for one crew member ---------- */
export function day(id: string, sol: number): Day | null {
  const key = id + "|" + sol;
  if (dcache.has(key)) return dcache.get(key)!;
  const ci = cidx(id), c = CREW[ci], b = c.b, o = P - sol;
  if (sol > P || sol < 1) { dcache.set(key, null); return null; }
  const n = (k: number) => nz(ci, sol, k);
  let onset = Math.round(b.onset + n(1) * 15), wake = Math.round(b.wake + n(2) * 12);
  let rt = Math.round(b.rt + n(3) * 8), slow = rnd(ci, sol, 4) > 0.86 ? 1 : 0;
  let mood = rating(ci, sol, 5, b.mood), team = rating(ci, sol, 7, b.team);
  let load = clamp(b.load + (rnd(ci, sol, 6) < 0.05 ? 1 : 0), 1, 5);
  let words = Math.round(b.words + n(8) * 60);
  let meals = clamp(Math.floor(b.meals + rnd(ci, sol, 9) * 0.9), 0, 2);
  if (id === "sato") {
    if (o === 0) { onset = 100; wake = 475; }
    if (o === 1) { onset = 85; wake = 470; rt = 291; slow = 2; }
    if (o === 2) { onset = 68; wake = 468; rt = 296; slow = 2; }
  }
  if (id === "lindqvist") {
    if (o <= 4) { load = o === 2 ? 4 : 5; meals = 0; }
    if (o <= 2) { mood = 3; words = [268, 252, 241][o]; }
    if (o <= 1) team = 3;
  }
  if (id === "reyes" && o <= 3) words = [190, 204, 182, 211][o];
  const checked = !(MISSED[id] || []).includes(sol) && !(o === 0 && OPEN_TODAY[id]);
  const tapped = checked && rnd(ci, sol, 15) > 0.25; // the reaction test is optional
  const d: Day = {
    sol, onset, wake, sleep: (wake - onset) / 60, mid: (onset + wake) / 2,
    rt: tapped ? rt : null, slow: tapped ? slow : null,
    mood: checked ? mood : null, load: checked ? load : null, team: checked ? team : null, meals: checked ? meals : null,
    words: o === 0 ? null : words,
    checkin: checked ? { min: 19 * 60 + 40 + Math.floor(rnd(ci, sol, 10) * 50) } : null,
  };
  if (id === "sato" && (o === 1 || o === 2)) { d.rt = rt; d.slow = slow; }
  const ov = overrides[key];
  if (ov) Object.assign(d, ov);
  dcache.set(key, d);
  return d;
}
export function val(d: Day | null, key: MeasureKey): number | null {
  if (!d) return null;
  return { sleep: d.sleep, rt: d.rt, timing: d.mid, mood: d.mood, load: d.load, team: d.team, engage: d.words }[key];
}
export function series(id: string, from: number, to: number) { const a: (Day | null)[] = []; for (let s = from; s <= to; s++) a.push(day(id, s)); return a; }

/* Personal baseline at sol s: median of the previous 14 sols + a band for the usual spread (B5) */
export function baseline(id: string, key: MeasureKey, s: number): Baseline | null {
  const vals: number[] = [];
  for (let t = s - MISSION.window; t < s; t++) { const v = val(day(id, t), key); if (v != null) vals.push(v); }
  if (vals.length < 3) return null;
  const med = median(vals)!, mad = median(vals.map((v) => Math.abs(v - med)))!;
  const half = Math.max(1.5 * 1.4826 * mad, MKEY[key].minHalf);
  return { med, half, lo: med - half, hi: med + half, n: vals.length };
}
function outside(key: MeasureKey, v: number | null, b: Baseline | null) {
  if (v == null || !b) return false;
  const bad = MKEY[key].bad;
  return bad === "low" ? v < b.lo : bad === "high" ? v > b.hi : v < b.lo || v > b.hi;
}
export function missed7(id: string, s: number) { let n = 0; for (let t = s - 7; t < s; t++) { const d = day(id, t); if (d && !d.checkin) n++; } return n; }
export function checkinCount(id: string, s: number) { let n = 0; for (let t = 1; t <= s; t++) { const d = day(id, t); if (d && d.checkin) n++; } return n; }

export const RANK: Record<string, number> = { normal: 0, pending: 0, nobase: 0, info: 0, watch: 1, act: 2 };
/* State of one measure as of sol s: Normal · Watch (2+ days outside) · Act (5+) (B6) */
export function mstatus(id: string, key: MeasureKey, s: number): Status {
  const ck = id + "|" + key + "|" + s;
  if (scache.has(ck)) return scache.get(ck)!;
  let latest: number | null = null;
  for (let t = s; t > s - 4 && t > 0; t--) { if (val(day(id, t), key) != null) { latest = t; break; } }
  const res: Status = { key, state: "normal", k: 0, latest, value: null, base: null, delta: null, from: null, to: null, missed: 0 };
  if (latest == null) { res.state = "pending"; scache.set(ck, res); return res; }
  res.value = val(day(id, latest), key);
  res.base = baseline(id, key, latest);
  if (!res.base) { res.state = "nobase"; scache.set(ck, res); return res; }
  res.delta = res.value! - res.base.med;
  let k = 0, first = latest;
  for (let t = latest; t > latest - 14 && t > 0; t--) {
    const v = val(day(id, t), key);
    if (v == null) continue;
    if (outside(key, v, baseline(id, key, t))) { k++; first = t; } else break;
  }
  res.k = k; res.from = first; res.to = latest;
  res.state = k >= 5 ? "act" : k >= 2 ? "watch" : "normal";
  if (key === "engage") {
    res.missed = missed7(id, s);
    const m: State = res.missed >= 3 ? "act" : res.missed >= 2 ? "watch" : "normal";
    if (RANK[m] > RANK[res.state]) { res.state = m; if (!res.k) { res.from = s - 7; res.to = s - 1; } }
  }
  scache.set(ck, res);
  return res;
}
export function overall(id: string, s: number, keys?: MeasureKey[]): State {
  let worst: State = "normal";
  (keys || KEYS).forEach((k) => { const st = mstatus(id, k, s).state; if (RANK[st] > RANK[worst]) worst = st; });
  return worst;
}
export const isOut = (st: { state: string }) => st.state === "watch" || st.state === "act";
export function hasBaseline(id: string, s: number) { return checkinCount(id, s) >= 3 && MEASURES.some((m) => mstatus(id, m.key, s).base); }
export function usualOnset(id: string, s: number) { const v: number[] = []; for (let t = s - 14; t < s; t++) { const d = day(id, t); if (d) v.push(d.onset); } return median(v) ?? crewById(id).b.onset; }

/* ---------- formatting ---------- */
const sgn = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "±");
export function fmt(key: MeasureKey, v: number | null | undefined) {
  if (v == null) return "—";
  switch (key) {
    case "sleep": { const m = Math.round(v * 60); return `${Math.floor(m / 60)}h${pad(m % 60)}m`; }
    case "rt": return `${Math.round(v)} ms`;
    case "timing": return hm(v);
    case "engage": return `${Math.round(v)} w`;
    default: return `${Math.round(v)} /5`;
  }
}
export function fmtDelta(key: MeasureKey, d: number | null | undefined) {
  if (d == null) return "—";
  switch (key) {
    case "sleep": { const r = Math.round(d * 60), m = Math.abs(r); return `${sgn(r)}${m >= 60 ? Math.floor(m / 60) + "h" + pad(m % 60) + "m" : m + "m"}`; }
    case "rt": { const r = Math.round(d); return `${sgn(r)}${Math.abs(r)} ms`; }
    case "timing": { const r = Math.round(d); return `${sgn(r)}${Math.abs(r)}m`; }
    case "engage": { const r = Math.round(d); return `${sgn(r)}${Math.abs(r)} w`; }
    default: { const r = Math.round(d * 10) / 10; return `${sgn(r)}${Math.abs(r) % 1 ? Math.abs(r).toFixed(1) : Math.abs(r)}`; }
  }
}
export function fmtBase(key: MeasureKey, b: Baseline | null) {
  if (!b) return "—";
  return ["sleep", "rt", "timing", "engage"].includes(key) ? fmt(key, b.med) : `${Math.round(b.med * 10) / 10}`;
}

/* ---------- flag copy ---------- */
export type Tone = "gentle" | "direct";
export function flagCopy(id: string, key: MeasureKey, st: Status, tone: Tone, s: number) {
  const d = st.delta ?? 0, k = st.k;
  const nights = `${k} night${k === 1 ? "" : "s"}`, days = `${k} day${k === 1 ? "" : "s"}`;
  let what = "", gentle = "", direct = "";
  switch (key) {
    case "sleep": what = `Sleep ${fmtDelta("sleep", d).slice(1)} under your normal over ${nights}`; gentle = "worth a lighter schedule today."; direct = "Protect an 8 h sleep window tonight."; break;
    case "timing": what = `Sleep midpoint shifted ${Math.abs(Math.round(d))} min ${d > 0 ? "later" : "earlier"} over ${nights}`; gentle = d > 0 ? "worth an earlier wind-down." : "worth keeping wake time steady."; direct = "Start wind-down earlier tonight."; break;
    case "rt": what = `Reaction time ${Math.round(Math.abs(d))} ms slower than usual on ${k} tests`; gentle = "worth easing precision work until it settles."; direct = "Put precision tasks after a break."; break;
    case "mood": what = `Mood below your normal for ${days}`; gentle = "worth a quiet break or a call home."; direct = "Take time off-task today."; break;
    case "load": what = `Workload above your normal for ${days}`; gentle = "worth asking to move one task."; direct = "Ask to move one task."; break;
    case "team": what = `Teamwork rated lower for ${days}`; gentle = "worth sharing the next meal."; direct = "Join the next shared meal."; break;
    case "engage": {
      const parts: string[] = [];
      if (st.k >= 2) parts.push(`fewer words with the companion for ${days}`);
      if (st.missed >= 2) parts.push(`${st.missed} check-ins missed in 7 days`);
      what = parts.join(", ") || "engagement lower than usual";
      what = what[0].toUpperCase() + what.slice(1);
      gentle = "worth a short check-in, no pressure."; direct = "Do a short check-in today."; break;
    }
  }
  return {
    line: tone === "direct" ? `${what}. ${direct}` : `${what} — ${gentle}`,
    what,
    action: SUGGEST[key](usualOnset(id, s)),
    window: st.from != null ? ([st.from, st.to!] as [number, number]) : null,
    deviation: st.base ? `${fmtDelta(key, d)} vs your normal ${fmtBase(key, st.base)}` : "—",
  };
}
/* one-line reason for a measure row */
export function reason(id: string, key: MeasureKey, st: Status) {
  if (st.state === "pending") return "Not logged yet.";
  if (st.state === "nobase") return "Building your baseline.";
  if (isOut(st)) return flagCopy(id, key, st, "gentle", st.to!).what + ".";
  if (key === "engage" && st.missed) return `Within your normal; ${st.missed} check-in${st.missed === 1 ? "" : "s"} missed in 7 days.`;
  const near = Math.abs(st.delta!) <= st.base!.half * 0.5;
  return near ? `Close to your normal of ${fmtBase(key, st.base)}.` : `Inside your usual range, ${st.delta! > 0 ? "above" : "below"} the middle.`;
}
function logSentence(key: MeasureKey, st: Status) {
  const k = st.k, d = st.delta ?? 0;
  switch (key) {
    case "sleep": return `Your sleep ran ${fmtDelta("sleep", d).slice(1)} under your normal for ${k} nights. Worth a lighter schedule today.`;
    case "timing": return `Your sleep midpoint shifted ${Math.abs(Math.round(d))} min ${d > 0 ? "later" : "earlier"} over ${k} nights. Worth an earlier wind-down.`;
    case "rt": return `Your reaction time ran ${Math.abs(Math.round(d))} ms slower than usual on ${k} tests. Worth easing precision work.`;
    case "mood": return `Your mood sat below your normal for ${k} days. Worth a quiet break.`;
    case "load": return `Your workload sat above your normal for ${k} days. Worth moving one task.`;
    case "team": return `You rated teamwork lower for ${k} days. Worth sharing the next meal.`;
    case "engage": return st.k >= 2 ? `You spoke less with the companion for ${k} days. Worth a short check-in.` : `You missed ${st.missed} check-ins in 7 days. Worth a short check-in, no pressure.`;
  }
}

/* ---------- person events for one sol (log panel + timeline markers), second person ---------- */
export function events(id: string, s: number): LogEvent[] {
  const ck = "p|" + id + "|" + s;
  if (ecache.has(ck)) return ecache.get(ck)!;
  const d = day(id, s), out: LogEvent[] = [];
  if (d) {
    if (d.checkin) {
      if (d.rt != null) out.push({ sol: s, min: d.checkin.min - 2, type: "tap", sev: "info", code: "PF-02", text: `Your reaction test median was ${d.rt} ms.` });
      out.push({ sol: s, min: d.checkin.min, type: "checkin", sev: "info", code: "CI-01", text: "You completed your check-in." });
    } else if (s < P) out.push({ sol: s, min: 23 * 60, type: "checkin", sev: "info", code: "CI-01", text: "No check-in this sol. That is fine." });
    else out.push({ sol: s, min: 12 * 60 + 40, type: "checkin", sev: "info", code: "CI-01", text: "Your check-in is open." });
    MEASURES.forEach((m, i) => {
      const now = mstatus(id, m.key, s), prev = mstatus(id, m.key, s - 1);
      if (isOut(now) && RANK[now.state] > RANK[prev.state]) out.push({ sol: s, min: 6 * 60 + 5 + i * 3, type: "flag", sev: now.state, key: m.key, code: m.code, text: logSentence(m.key, now) });
    });
    (JOURNAL[id] || []).filter((j) => j.sol === s).forEach((j) => {
      out.push({ sol: s, min: j.min, type: "journal", sev: "info", code: "JR-01", text: "You wrote a journal entry." });
      if (j.obs) out.push({ sol: s, min: j.min + 1, type: "obs", sev: "info", code: "OB-01", text: `Observation: ${j.obs}` });
    });
  }
  out.sort((a, b) => a.min - b.min);
  ecache.set(ck, out);
  return out;
}

/* ---------- crew level: aggregate only, sharing-aware, never names (A6, B8, C7) ---------- */
export const CREW_MIN = 2;
export function contributors(key: MeasureKey, shares: Shares) { return CREW.filter((c) => (shares[c.id] || []).includes(key)); }
export type TeamStatus = { key: MeasureKey; state: State; n: number; out: number; reason: string; trend: { sol: number; z: number | null }[] };
export function teamStatus(key: MeasureKey, s: number, shares: Shares): TeamStatus {
  const cs = contributors(key, shares).filter((c) => mstatus(c.id, key, s).base);
  if (cs.length < CREW_MIN) return { key, state: "pending", n: cs.length, out: 0, reason: `Needs at least ${CREW_MIN} crew sharing this measure before a team view is shown.`, trend: [] };
  const sts = cs.map((c) => mstatus(c.id, key, s));
  const act = sts.filter((x) => x.state === "act").length, watch = sts.filter((x) => x.state === "watch").length, out = act + watch;
  const state: State = act || watch * 2 >= cs.length ? (act ? "act" : "watch") : watch ? "watch" : "normal";
  const reasonTxt = out ? `${out} of ${cs.length} sharing crew outside their normal.` : `All ${cs.length} sharing crew within their normal.`;
  // team trend: average distance from each person's own normal, in band-widths
  const trend: { sol: number; z: number | null }[] = [];
  for (let t = s - 13; t <= s; t++) {
    const z = cs.map((c) => {
      const v = val(day(c.id, t), key), b = baseline(c.id, key, t);
      if (v == null || !b) return null;
      const raw = (v - b.med) / b.half;
      return MKEY[key].bad === "high" ? raw : MKEY[key].bad === "low" ? -raw : Math.abs(raw);
    }).filter((x): x is number => x != null);
    trend.push({ sol: t, z: z.length >= 2 ? avg(z) : null });
  }
  return { key, state, n: cs.length, out, reason: reasonTxt, trend };
}
export function crewEvents(s: number, shares: Shares): LogEvent[] {
  const out: LogEvent[] = [];
  const done = CREW.filter((c) => day(c.id, s)?.checkin).length, pending = CREW.length - done;
  out.push({ sol: s, min: 8 * 60, type: "checkin", sev: "info", code: "CI-01", text: `Morning check-ins ${done} of ${CREW.length}` });
  if (pending && s === P) out.push({ sol: s, min: 12 * 60 + 40, type: "checkin", sev: "info", code: "CI-01", text: `${pending} check-in${pending > 1 ? "s" : ""} pending` });
  let raised = 0, worst: Sev = "watch";
  CREW.forEach((c) => (shares[c.id] || []).forEach((k) => { const a = mstatus(c.id, k, s), b = mstatus(c.id, k, s - 1); if (isOut(a) && RANK[a.state] > RANK[b.state]) { raised++; if (a.state === "act") worst = "act"; } }));
  if (raised) out.push({ sol: s, min: 6 * 60 + 10, type: "flag", sev: worst, code: "FL-01", text: `${raised} flag${raised > 1 ? "s" : ""} raised` });
  const ms = contributors("team", shares);
  if (ms.length >= CREW_MIN) {
    const meals = ms.reduce((a, c) => a + (day(c.id, s)?.meals || 0), 0);
    out.push({ sol: s, min: 20 * 60, type: "team", sev: "info", code: "TM-04", text: `Shared meals logged: ${meals}` });
  }
  const es = contributors("engage", shares);
  if (es.length >= CREW_MIN && s < P) {
    const ratio = avg(es.map((c) => { const b = baseline(c.id, "engage", s), v = day(c.id, s)?.words; return b && v != null ? v / b.med : null; }).filter((x): x is number => x != null));
    if (ratio != null) out.push({ sol: s, min: 23 * 60 + 30, type: "team", sev: "info", code: "EN-01", text: `Engagement ${ratio < 0.85 ? "lower than usual" : "steady"} across sharing crew` });
  }
  return out.sort((a, b) => a.min - b.min);
}
export function mealsWeek(shares: Shares, end: number) {
  const cs = contributors("team", shares);
  if (cs.length < CREW_MIN) return null;
  let n = 0;
  cs.forEach((c) => { for (let t = end - 6; t <= end; t++) n += day(c.id, t)?.meals || 0; });
  return n;
}

/* ---------- companion messages ---------- */
export function conversation(id: string, s: number): ConvoRow[] {
  const d = day(id, s);
  if (!d) return [];
  const st = mstatus(id, "timing", s);
  const rows: ConvoRow[] = [{ sol: s, min: 7 * 60 + 52, who: "companion", text: "Morning. How did you sleep? When did you fall asleep and wake up?" }];
  const said = id === "sato" && s === P ? "Fell asleep about one forty, up just before eight." : `Out around ${hm(d.onset)}, up at ${hm(d.wake)}.`;
  rows.push({ sol: s, min: 7 * 60 + 53, who: "you", text: said });
  rows.push({ sol: s, min: 7 * 60 + 53, who: "parsed", label: "Slept", value: `${hm(d.onset)} → ${hm(d.wake)} · ${fmt("sleep", d.sleep)}`, key: "sleep" });
  const base = baseline(id, "sleep", s);
  const diff = base ? d.sleep! - base.med : 0;
  rows.push({ sol: s, min: 7 * 60 + 53, who: "companion", text: isOut(st)
    ? `Logged ${fmt("sleep", d.sleep)}. Night ${st.k} with your sleep midpoint later than your normal, about ${Math.round(st.delta!)} min. Worth an earlier wind-down tonight.`
    : Math.abs(diff) >= 0.75 ? `Logged ${fmt("sleep", d.sleep)}. Sleep is about ${Math.round(Math.abs(diff))}h ${diff < 0 ? "under" : "over"} your normal.` : `Logged ${fmt("sleep", d.sleep)}. That sits within your normal.` });
  if (id === "sato" && s === P) {
    rows.push({ sol: s, min: 7 * 60 + 54, who: "you", text: "Noted. Long core logging day today." });
    rows.push({ sol: s, min: 7 * 60 + 54, who: "companion", text: "Understood. Your check-in stays open until 23:00." });
  }
  if (!d.checkin && s === P) rows.push({ sol: s, min: 12 * 60 + 40, who: "companion", text: "Check-in is open whenever you have a few minutes. Skipping is fine." });
  if (d.checkin && s < P) rows.push({ sol: s, min: d.checkin.min, who: "sys", text: "Check-in logged." });
  return rows;
}
export function insights(id: string, s: number) {
  const out: { sol: number; kind: "insight" | "observation"; state: Sev; text: string }[] = [];
  MEASURES.forEach((m) => {
    const st = mstatus(id, m.key, s);
    if (isOut(st)) out.push({ sol: st.to!, kind: "insight", state: st.state, text: flagCopy(id, m.key, st, "gentle", s).what + "." });
  });
  const steady = MEASURES.filter((m) => mstatus(id, m.key, s).state === "normal").map((m) => m.short);
  if (steady.length) out.push({ sol: s, kind: "insight", state: "normal", text: `${steady[0][0].toUpperCase() + steady[0].slice(1)}${steady.length > 1 ? ` and ${steady.length - 1} other measure${steady.length > 2 ? "s" : ""}` : ""} steady at your normal.` });
  (JOURNAL[id] || []).filter((j) => j.obs && j.sol <= s && j.sol > s - 14).forEach((j) => out.push({ sol: j.sol, kind: "observation", state: "info", text: j.obs! }));
  return out.sort((a, b) => b.sol - a.sol);
}
export function solDate(s: number) { const d = new Date(MISSION.earthDayOfSol1 + (s - 1) * 88775244); return d.toISOString().slice(0, 10); }

/* ---------- writes (B2: saving twice on one day replaces the first) ---------- */
export function setToday(id: string, vals: Partial<Day>) { setDay(id, P, vals); }
/* real values for one sol (a submitted check-in, loaded from local storage) replace the simulated ones */
export function setDay(id: string, sol: number, vals: Partial<Day>) { overrides[id + "|" + sol] = vals; bump(); }
export function previewToday<T>(id: string, vals: Partial<Day>, fn: () => T): T {
  const k = id + "|" + P, prev = overrides[k];
  overrides[k] = vals; bump();
  try { return fn(); } finally { if (prev) overrides[k] = prev; else delete overrides[k]; bump(); }
}

/* ---------- the numbers the companion is given (C5): this person's own measures only ---------- */
/* Code does the maths and the wording. The model is handed finished sentences
   ("43 ms slower than your normal"), never a signed number to interpret. */
export type CompanionFact = {
  key: MeasureKey;
  name: string;
  /** A full sentence in the second person, ready to be said aloud. */
  text: string;
  /** The short form for a row on screen: "43 ms slower than your normal". */
  value: string;
  /** How long it has been off: "2 tests". */
  detail: string;
  /** The one suggested action for this measure. */
  action: string;
  /** Words that mean this measure, in a question or an answer. */
  terms: string[];
  /** The direction word used in `text`, and words that would state it backwards. */
  direction: string | null;
  opposites: string[];
};
const FACT_TERMS: Record<MeasureKey, string[]> = {
  sleep: ["sleep", "slept", "rest", "tired"],
  timing: ["sleep", "timing", "midpoint", "bedtime"],
  rt: ["reaction", "reflex", "tap"],
  mood: ["mood", "feel", "feeling"],
  load: ["workload", "stress", "busy"],
  team: ["teamwork", "team", "crew"],
  engage: ["engagement", "check-in", "checkin", "talk"],
};
function factFor(id: string, key: MeasureKey, st: Status, s: number): CompanionFact {
  const d = st.delta ?? 0, k = st.k, unit = MKEY[key].unitWord;
  const span = `${k} ${k === 1 ? unit.replace(/s$/, "") : unit}`;
  const run = k >= 2 ? `, ${span} in a row` : "";
  let value = "", subject = "", direction: string | null = null, opposites: string[] = [], detail = span;
  switch (key) {
    case "sleep": direction = d < 0 ? "shorter" : "longer"; opposites = [d < 0 ? "longer" : "shorter"]; subject = "Your sleep was"; value = `${fmtDelta("sleep", d).slice(1)} ${direction} than your normal`; break;
    case "rt": direction = d > 0 ? "slower" : "faster"; opposites = d > 0 ? ["faster", "quicker"] : ["slower"]; subject = "Your reaction time was"; value = `${Math.round(Math.abs(d))} ms ${direction} than your normal`; break;
    case "timing": direction = d > 0 ? "later" : "earlier"; opposites = [d > 0 ? "earlier" : "later"]; subject = "Your sleep timing was"; value = `${Math.abs(Math.round(d))} min ${direction} than your normal`; break;
    case "mood": direction = "below"; opposites = ["above", "higher", "better"]; subject = "Your mood rating was"; value = "below your normal"; break;
    case "load": direction = "above"; opposites = ["below", "lower", "lighter"]; subject = "Your workload rating was"; value = "above your normal"; break;
    case "team": direction = "below"; opposites = ["above", "higher", "better"]; subject = "Your teamwork rating was"; value = "below your normal"; break;
    case "engage":
      if (st.k >= 2) { direction = "less"; opposites = ["more"]; subject = "You spoke with me"; value = "less than your normal"; }
      else { subject = "You missed"; value = `${st.missed} check-ins in the last 7 days`; detail = "7 days"; }
      break;
  }
  const text = key === "engage" && st.k < 2 ? `${subject} ${value}.` : `${subject} ${value}${run}.`;
  return { key, name: MKEY[key].name, text, value, detail, action: SUGGEST[key](usualOnset(id, s)), terms: FACT_TERMS[key], direction, opposites };
}
const FACT_ORDER: MeasureKey[] = ["timing", "sleep", "load", "mood", "engage", "team", "rt"];
export function companionFacts(id: string, s: number) {
  const sts = MEASURES.map((m) => ({ m, st: mstatus(id, m.key, s) }));
  const off = sts.filter((x) => isOut(x.st))
    .sort((a, b) => RANK[b.st.state] - RANK[a.st.state] || b.st.k - a.st.k || FACT_ORDER.indexOf(a.m.key) - FACT_ORDER.indexOf(b.m.key))
    .map((x) => factFor(id, x.m.key, x.st, s));
  const normal = sts.filter((x) => x.st.state === "normal").map((x) => ({ key: x.m.key, name: x.m.name, terms: FACT_TERMS[x.m.key] }));
  return { off, normal };
}
export function companionNumbers(id: string, s: number) {
  const measures: Record<string, unknown> = {};
  MEASURES.forEach((m) => {
    const st = mstatus(id, m.key, s);
    measures[m.name] = {
      today: fmt(m.key, st.value),
      normal: fmtBase(m.key, st.base),
      change: st.base ? fmtDelta(m.key, st.delta) : null,
      status: st.state,
      days_outside: st.k,
      ...(m.key === "engage" ? { checkins_missed_7_days: st.missed } : {}),
    };
  });
  /* `measures` is kept for the turn log only. The model is given `facts`. */
  return { sol: s, measures, facts: companionFacts(id, s) };
}
