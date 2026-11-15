/* Simulated wearable readings (a smartwatch or a chest monitor such as the CSA's Bio-Monitor): resting heart
   rate, heart rate variability, blood oxygen, skin temperature and breathing rate, one nightly reading per
   person per sol. Deterministic (same person + sol gives the same value), each person with their own
   normal, and tied to the simulated day: a short night or a heavy day raises resting heart rate and lowers
   HRV, as real wearables show. Like everything else here this is simulated data, not a medical device. */
import { baseline, day } from "./data";

export type VitalKey = "rhr" | "hrv" | "spo2" | "temp" | "resp";
export type Vital = {
  key: VitalKey;
  label: string;
  unit: string;
  /* today's reading and the person's normal (median of the previous 14 sols) */
  value: number;
  normal: number;
  /* typical spread around the normal: outside it reads Watch, more than twice outside reads Act (urgent) */
  band: number;
  state: "normal" | "watch" | "act";
  /* which direction is the worrying one */
  bad: "high" | "low" | "both";
  digits: number;
  tip: string;
  /* typical range for healthy adults at rest, in plain words */
  range: string;
  /* one quick fact, mostly about spaceflight, for astronauts who are not medics */
  fact: string;
};

const DEF: Array<{ key: VitalKey; label: string; unit: string; bad: Vital["bad"]; digits: number; base: [number, number]; noise: number; minBand: number; tip: string; range: string; fact: string }> = [
  /* Every range and fact below is quoted from a source we checked (brain/measures/*.md cite the same pages):
     MedlinePlus vital signs and pulse oximetry, Cleveland Clinic on HRV, NASA HRP risks, CSA Bio-Monitor. */
  { key: "rhr", label: "Resting heart rate", unit: "bpm", bad: "high", digits: 0, base: [52, 64], noise: 1.6, minBand: 3,
    tip: "Lowest steady heart rate overnight. A rate that stays above your own normal can follow short sleep, stress or a heavy workload.",
    range: "60 to 100 beats per minute for an average healthy adult at rest (MedlinePlus). It varies with age, fitness and health, so your own normal matters most.",
    fact: "NASA: weightlessness alters blood circulation and how the heart and blood vessels function. The CSA's Bio-Monitor tracks the heart on the ISS." },
  { key: "hrv", label: "Heart rate variability", unit: "ms", bad: "low", digits: 0, base: [45, 75], noise: 4, minBand: 7,
    tip: "How much the time between heartbeats changes, read overnight. It is compared only with your own past nights.",
    range: "No single healthy number: an HRV that is normal for one person may not be for someone else (Cleveland Clinic). Compare only with your own normal.",
    fact: "Wrist trackers are less precise than a medical recording, so a run of low nights means more than one." },
  { key: "spo2", label: "Blood oxygen", unit: "%", bad: "low", digits: 0, base: [97, 98.6], noise: 0.4, minBand: 1,
    tip: "How much of your blood's oxygen capacity is in use (oxygen saturation), measured overnight.",
    range: "95 to 100% is normal. At 92% or lower, contact the medical officer; at 88% or lower, get immediate attention (MedlinePlus).",
    fact: "A pulse oximeter reading can be 2 to 4% higher or lower than the true level, so one reading is a guide, not a diagnosis." },
  { key: "temp", label: "Skin temperature", unit: "°C", bad: "both", digits: 1, base: [33.2, 33.8], noise: 0.12, minBand: 0.3,
    tip: "Skin temperature under the wearable overnight. Skin reads cooler than the body and changes with the room, so only the change from your own normal is used.",
    range: "No fixed healthy number for skin. Body temperature is about 36.5 to 37.3 °C (MedlinePlus); skin under a wearable reads lower.",
    fact: "A skin reading cannot confirm or rule out a fever. On Watch, check body temperature with the medical kit thermometer." },
  { key: "resp", label: "Breathing rate", unit: "/min", bad: "high", digits: 1, base: [12.5, 15], noise: 0.35, minBand: 0.8,
    tip: "Breaths per minute while asleep.",
    range: "12 to 18 breaths per minute for an average healthy adult at rest (MedlinePlus).",
    fact: "The CSA's Bio-Monitor measures breathing rate and volume on the ISS." },
];

/* small deterministic hash -> [0, 1) */
function rnd(...parts: Array<string | number>) {
  let h = 2166136261;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const gauss = (...parts: Array<string | number>) => {
  const u = Math.max(1e-9, rnd(...parts, "a")), v = rnd(...parts, "b");
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

function reading(id: string, sol: number, d: (typeof DEF)[number]): number {
  const own = d.base[0] + rnd(id, d.key, "base") * (d.base[1] - d.base[0]);
  let v = own + gauss(id, d.key, sol) * d.noise;
  /* strain from the simulated day: short sleep and a heavy workload */
  const today = day(id, sol), bs = baseline(id, "sleep", sol);
  const shortSleep = today?.sleep != null && bs ? Math.max(0, bs.med - today.sleep) : 0;
  const heavy = today?.load != null ? Math.max(0, today.load - 3) : 0;
  const strain = Math.min(3, shortSleep * 0.8 + heavy * 0.6);
  if (d.key === "rhr") v += strain * 2.5;
  if (d.key === "hrv") v -= strain * 6;
  if (d.key === "resp") v += strain * 0.3;
  if (d.key === "temp") v += strain * 0.05;
  /* a scripted story so the urgent level shows in the demo: Daniela Reyes is coming down with something
     from Sol 140, with night-time skin temperature and resting heart rate climbing, as early infection
     looks on a wearable (before any fever is felt) */
  if (id === "reyes" && sol >= 140) {
    const k = sol - 139;
    if (d.key === "temp") v += 0.45 * k;
    if (d.key === "rhr") v += 3 * k;
    if (d.key === "resp") v += 0.6 * k;
  }
  /* Kenji Sato (the default Home view): sustained high workload from Sol 140 (he rates his day 5/5 and his
     reaction time is slowing). HRV and resting heart rate drift to Watch by Sol 142: the usual wearable
     picture of stress and poor recovery. Kept at Watch, not Urgent, so the demo crew shows all three
     levels on Sol 142: Adaeze stable, Kenji on Watch, Mattias and Daniela at Act. */
  if (id === "sato" && sol >= 140) {
    const k = sol - 139;
    if (d.key === "hrv") v -= 2.5 * k;
    if (d.key === "rhr") v += 0.8 * k;
  }
  if (d.key === "spo2") v = Math.min(100, v);
  return v;
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function vitals(id: string, sol: number): Vital[] {
  return DEF.map((d) => {
    const prev = Array.from({ length: 14 }, (_, n) => reading(id, sol - 14 + n, d));
    const normal = median(prev);
    const band = Math.max(d.minBand, 1.5 * median(prev.map((x) => Math.abs(x - normal))));
    const value = reading(id, sol, d);
    /* how far into the worrying direction, in spreads */
    const dev = (d.bad === "high" ? value - normal : d.bad === "low" ? normal - value : Math.abs(value - normal)) / band;
    let state: Vital["state"] = dev > 2 ? "act" : dev > 1 ? "watch" : "normal";
    /* blood oxygen also has fixed floors, whatever the person's normal */
    /* MedlinePlus: normal is 95–100%; contact a provider at 92% or lower */
    if (d.key === "spo2") state = value <= 92 ? "act" : value < 95 && state === "normal" ? "watch" : state;
    return { key: d.key, label: d.label, unit: d.unit, value, normal, band, state, bad: d.bad, digits: d.digits, tip: d.tip, range: d.range, fact: d.fact };
  });
}

export const fmtVital = (v: Vital, x: number) => `${x.toFixed(v.digits)}${v.unit === "%" ? "%" : v.unit === "°C" ? " °C" : ` ${v.unit}`}`;
export const fmtVitalDelta = (v: Vital) => {
  const d = v.value - v.normal, r = Number(d.toFixed(v.digits));
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toFixed(v.digits)}`;
};

/* likely reasons a reading moves, per direction, in plain words for astronauts who are not medics */
const WHY: Record<VitalKey, { up: string; down: string }> = {
  rhr: {
    up: "Usual reasons: short sleep, stress, a heavy workload, a late meal or workout, or your body fighting something off.",
    down: "That usually means good recovery and is nothing to worry about on its own.",
  },
  hrv: {
    up: "Higher HRV usually means your body recovered well overnight.",
    down: "Lower HRV usually follows short sleep, stress, a heavy day or the start of an illness. A run of low nights means more than one.",
  },
  spo2: {
    up: "Higher blood oxygen is fine.",
    down: "A loose sensor or moving in your sleep can lower the reading; so can a breathing problem. Recheck with the finger oximeter in the medical kit.",
  },
  temp: {
    up: "Skin warms with a warm cabin, a heavy day, or early illness before any fever is felt. Check your body temperature with the medical kit thermometer.",
    down: "Skin cools with the room, so the usual reasons are a cooler cabin overnight, the strap sitting loose, or your arm outside the sleeping bag. Check the hab temperature and the strap; it is rarely a sign of illness on its own.",
  },
  resp: {
    up: "Faster breathing in sleep can come with stress, a warm cabin, congestion or early illness.",
    down: "Slower breathing in sleep usually means deep, settled rest.",
  },
};

/* the question Pedro answers with the wearable summary (CompanionScreen routes it to the wearable flow) */
export const READ_WEARABLE = "Sum up and analyse my wearable readings from last night.";

/* Pedro's summary and analysis of last night's wearable readings. Written by code from the readings (no
   model), so every number and pattern named is one the strip on Home shows. */
export function wearableSummary(id: string, sol: number): string {
  const vs = vitals(id, sol);
  const by = Object.fromEntries(vs.map((v) => [v.key, v])) as Record<VitalKey, Vital>;
  const off = vs.filter((v) => v.state !== "normal");
  const urgent = off.filter((v) => v.state === "act");
  const word = (v: Vital) => v.label.charAt(0).toLowerCase() + v.label.slice(1);
  const dir = (v: Vital): "up" | "down" => (v.value > v.normal ? "up" : "down");
  const join = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const out: string[] = [];

  if (!off.length) {
    out.push(`Last night all five wearable readings sat within your own normal: heart rate ${fmtVital(by.rhr, by.rhr.value)}, HRV ${fmtVital(by.hrv, by.hrv.value)}, blood oxygen ${fmtVital(by.spo2, by.spo2.value)}.`);
    out.push("Nothing to act on.");
    return out.join(" ");
  }

  out.push(`${off.length} of 5 wearable readings were off your normal last night${urgent.length ? `, ${urgent.length} of them urgent` : ""}.`);
  /* each one: what moved, then the likely reasons in plain words */
  off.forEach((v) => out.push(`${word(v).charAt(0).toUpperCase() + word(v).slice(1)} went ${dir(v)}, ${fmtVitalDelta(v)} to ${fmtVital(v, v.value)} (your normal ${fmtVital(v, v.normal)}). ${WHY[v.key][dir(v)]}`));

  /* patterns across readings, which say more than any one number */
  const up = (k: VitalKey) => by[k].state !== "normal" && by[k].value > by[k].normal;
  const down = (k: VitalKey) => by[k].state !== "normal" && by[k].value < by[k].normal;
  if (up("temp") && (up("rhr") || up("resp"))) {
    out.push("Together, skin temperature rising with heart rate or breathing can be an early sign of illness, before any fever is felt.");
  } else if (up("rhr") && down("hrv")) {
    out.push("Together, higher heart rate with lower HRV is the usual picture of strain or poor recovery.");
  }
  if (by.spo2.state !== "normal") out.push("For blood oxygen, 95 to 100% is normal, and at 92% or lower the medical officer should know.");

  /* what the day itself shows, from the check-in */
  const t = day(id, sol), bs = baseline(id, "sleep", sol);
  const causes: string[] = [];
  if (t?.sleep != null && bs && bs.med - t.sleep >= 0.5) causes.push(`you slept ${t.sleep.toFixed(1)}h against your usual ${bs.med.toFixed(1)}h`);
  if (t?.load != null && t.load >= 4) causes.push(`you rated your day load ${t.load} of 5`);
  if (causes.length) out.push(`It fits your check-in: ${join(causes)}.`);

  out.push(urgent.length
    ? "Please tell the crew medical officer today."
    : "Worth an easier evening and a full night's sleep; I'll compare again tomorrow night.");
  return out.join(" ");
}
