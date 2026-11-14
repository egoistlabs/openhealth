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
  { key: "rhr", label: "Resting heart rate", unit: "bpm", bad: "high", digits: 0, base: [52, 64], noise: 1.6, minBand: 3,
    tip: "Lowest steady heart rate overnight. It rises with short sleep, stress, illness or dehydration.",
    range: "60 to 100 bpm for most adults; fit people often sit at 40 to 60.",
    fact: "In low gravity the heart does less work against gravity and can lose some fitness on long missions, so exercise keeps it strong. A resting rate several beats above your normal for a few nights is worth noting." },
  { key: "hrv", label: "Heart rate variability", unit: "ms", bad: "low", digits: 0, base: [45, 75], noise: 4, minBand: 7,
    tip: "How much the gap between heartbeats varies overnight (RMSSD). Higher usually means well rested; lower than your normal often means stress, poor sleep or illness.",
    range: "Very personal: roughly 20 to 100 ms in healthy adults, and it falls with age. Compare only with your own normal.",
    fact: "HRV is one of the earliest signs of strain: it often drops a day or two before you feel run down." },
  { key: "spo2", label: "Blood oxygen", unit: "%", bad: "low", digits: 0, base: [97, 98.6], noise: 0.4, minBand: 1,
    tip: "How much of your blood's oxygen capacity is in use (oxygen saturation), measured overnight.",
    range: "95 to 100% is normal. Below 95% is worth a check; below 90% is low and needs attention, especially with a headache or breathlessness.",
    fact: "Habitat air pressure and oxygen level set how much oxygen you breathe in, so a crew-wide dip can point to the air supply, not to people." },
  { key: "temp", label: "Skin temperature", unit: "°C", bad: "both", digits: 1, base: [33.2, 33.8], noise: 0.12, minBand: 0.3,
    tip: "Wrist skin temperature overnight. Skin runs cooler than the inside of your body, so the change from your normal matters more than the number.",
    range: "Wrist skin is usually about 32 to 35 °C (body core is about 37 °C). Nights more than about 0.5 °C above your normal are worth noting.",
    fact: "A rise in night-time skin temperature can show up before a fever does. In a closed habitat, catching an infection early protects the whole crew." },
  { key: "resp", label: "Breathing rate", unit: "/min", bad: "high", digits: 1, base: [12.5, 15], noise: 0.35, minBand: 0.8,
    tip: "Breaths per minute while asleep.",
    range: "12 to 20 breaths a minute at rest for adults, usually at the lower end during sleep.",
    fact: "Carbon dioxide builds up more in a closed habitat than in Earth's air, which can make you breathe faster and cause headaches. A crew-wide rise points to the air, not to you." },
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
     reaction time is slowing). HRV falls steeply, to urgent by Sol 142, and resting heart rate creeps up
     to Watch: the usual wearable picture of stress and poor recovery */
  if (id === "sato" && sol >= 140) {
    const k = sol - 139;
    if (d.key === "hrv") v -= 7 * k;
    if (d.key === "rhr") v += 1.2 * k;
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
    if (d.key === "spo2") state = value < 92 ? "act" : value < 95 && state === "normal" ? "watch" : state;
    return { key: d.key, label: d.label, unit: d.unit, value, normal, band, state, bad: d.bad, digits: d.digits, tip: d.tip, range: d.range, fact: d.fact };
  });
}

export const fmtVital = (v: Vital, x: number) => `${x.toFixed(v.digits)}${v.unit === "%" ? "%" : v.unit === "°C" ? " °C" : ` ${v.unit}`}`;
export const fmtVitalDelta = (v: Vital) => {
  const d = v.value - v.normal, r = Number(d.toFixed(v.digits));
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r).toFixed(v.digits)}`;
};
