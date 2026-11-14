// Simulated crew members for the demo (story D1) and for the detection eval
// (D3, D4). Everything here is made up by code from a seed: no real crew data.
//
// What is set from published figures, and what is our own assumption, is listed
// in docs/tech-spec/eval-design.md. In short: the average sleep (6.09 h, with
// crew members differing by about 0.67 h) is from Barger et al. 2014. How much a
// measure moves from day to day, and the shape of each decline, are assumptions.

export type DayRecord = {
  day: number;
  /** False when the check-in was skipped. All answers are then null. */
  checked_in: boolean;
  sleep_time: string | null;
  wake_time: string | null;
  sleep_hours: number | null;
  /** Middle of the sleep period, in minutes after midnight. */
  sleep_midpoint_min: number | null;
  rt_median_ms: number | null;
  /** Taps slower than 355 ms, the PVT-B lapse limit. */
  rt_slow_count: number | null;
  mood: number | null;
  workload: number | null;
  teamwork: number | null;
  shared_meal: boolean | null;
  /** Words said to the companion that day. */
  words: number | null;
};

export const SCENARIOS = [
  "healthy",
  // Hidden declines: something measured moves while the mood rating mostly stays put.
  "sleep-debt",
  "going-quiet",
  "crew-friction",
  "clock-drift",
  "slow-boil",
  // A known blind spot: already short of sleep when the baseline is taken.
  "short-from-launch",
  // Healthy cases that must stay quiet.
  "one-bad-night",
  "heavy-week",
  "flat-rater",
  "ops-skips",
] as const;
export type Scenario = (typeof SCENARIOS)[number];

export type SimulationInput = {
  seed: number;
  scenario: Scenario;
  /** How far the measure moves at full strength, in units of its own day-to-day spread. 0 gives the healthy twin of the same person. */
  size?: number;
  /** How much of the decline the person notices and reports in their mood rating. 0 = none, 1 = all of it. */
  awareness?: number;
  days?: number;
};

export type Simulation = {
  scenario: Scenario;
  size: number;
  awareness: number;
  /** First day of the change, or null when nothing changes. */
  onset: number | null;
  /** Day the cause ends, for cases that end. */
  ends: number | null;
  days: DayRecord[];
};

type Channel = "sleep" | "midpoint" | "rt" | "mood" | "workload" | "teamwork" | "words";
const CHANNELS: Channel[] = ["sleep", "midpoint", "rt", "mood", "workload", "teamwork", "words"];

// [average across crew, how much crew members differ, day-to-day spread within one person]
const SHAPE: Record<Channel, [number, number, number]> = {
  sleep: [6.09, 0.67, 0.8], // hours
  midpoint: [210, 40, 35], // minutes after midnight
  rt: [255, 20, 14], // milliseconds
  mood: [3.9, 0.4, 0.6], // 1 to 5
  workload: [3.0, 0.5, 0.7], // 1 to 5
  teamwork: [4.0, 0.4, 0.6], // 1 to 5
  words: [120, 30, 40], // words a day
};
const CARRY_OVER = 0.3; // how much one day resembles the day before
const SKIP_CHANCE = 0.02; // a healthy person skips about one check-in in fifty

function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    const u = Math.max(next(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * next());
  };
  return { next, normal };
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const rating = (value: number) => clamp(Math.round(value), 1, 5);
const ramp = (day: number, start: number, length: number) => clamp((day - start) / length, 0, 1);

function clock(minutesAfterMidnight: number): string {
  const minutes = ((Math.round(minutesAfterMidnight) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * One simulated crew member. The same seed with size 0 gives the same person
 * with nothing wrong, so every decline has an exact healthy twin to compare with.
 */
export function simulateCrewMember(input: SimulationInput): Simulation {
  const { seed, scenario } = input;
  const size = input.size ?? 2;
  const awareness = input.awareness ?? 0;
  const days = input.days ?? 90;
  const rng = random(seed);

  // Who this person is. Drawn first, so it never depends on the scenario.
  const usual = {} as Record<Channel, number>;
  for (const channel of CHANNELS) usual[channel] = SHAPE[channel][0] + SHAPE[channel][1] * rng.normal();
  const onsetDraw = 25 + Math.floor(rng.next() * 26); // day 25 to 50
  const eventDay = 20 + Math.floor(rng.next() * 55);

  // Ordinary ups and downs, in units of each measure's own spread.
  const noise = {} as Record<Channel, number[]>;
  for (const channel of CHANNELS) {
    const series: number[] = [];
    let previous = rng.normal();
    for (let day = 0; day < days; day += 1) {
      const value = day === 0 ? previous : CARRY_OVER * previous + Math.sqrt(1 - CARRY_OVER ** 2) * rng.normal();
      series.push(value);
      previous = value;
    }
    noise[channel] = series;
  }
  const skipDraw = Array.from({ length: days }, () => rng.next());
  const mealDraw = Array.from({ length: days }, () => rng.next());
  const lapseDraw = Array.from({ length: days }, () => rng.next());

  let onset: number | null = null;
  let ends: number | null = null;
  if (["sleep-debt", "going-quiet", "crew-friction", "clock-drift"].includes(scenario)) onset = onsetDraw;
  if (scenario === "slow-boil") onset = 20;
  if (scenario === "short-from-launch") onset = 1;
  if (scenario === "heavy-week") {
    onset = eventDay;
    ends = eventDay + 6;
  }

  const records: DayRecord[] = [];
  for (let index = 0; index < days; index += 1) {
    const day = index + 1;
    // The push on each channel today, in units of its spread. Positive = higher value.
    const push: Record<Channel, number> = { sleep: 0, midpoint: 0, rt: 0, mood: 0, workload: 0, teamwork: 0, words: 0 };
    let skipChance = SKIP_CHANCE;
    let mealChance = 0.6;
    let spreadScale = 1;

    if (onset !== null && size > 0) {
      const hidden = (start: number, length: number) => -awareness * size * ramp(day, start, length);
      if (scenario === "sleep-debt") {
        push.sleep = -size * ramp(day, onset, 10);
        push.rt = size * ramp(day, onset + 3, 14);
        push.mood = hidden(onset + 3, 14);
      } else if (scenario === "going-quiet") {
        push.words = -size * ramp(day, onset, 14);
        push.teamwork = -0.5 * size * ramp(day, onset + 5, 14);
        push.mood = hidden(onset, 14);
        skipChance += 0.05 * size * ramp(day, onset, 14);
      } else if (scenario === "crew-friction") {
        push.teamwork = -size * ramp(day, onset, 14);
        push.mood = hidden(onset, 14);
        mealChance -= 0.15 * size * ramp(day, onset, 14);
      } else if (scenario === "clock-drift") {
        push.midpoint = size * ramp(day, onset, 8);
        push.mood = hidden(onset, 8);
      } else if (scenario === "slow-boil") {
        push.sleep = -size * ramp(day, onset, 60);
        push.rt = 0.7 * size * ramp(day, onset + 5, 60);
        push.mood = hidden(onset + 5, 60);
      } else if (scenario === "short-from-launch") {
        push.sleep = -size;
        push.rt = 0.7 * size;
      } else if (scenario === "heavy-week" && ends !== null && day >= onset && day <= ends) {
        push.workload = 2;
        push.sleep = -0.7;
      }
    }
    if (scenario === "one-bad-night") {
      if (day === eventDay) push.sleep = -3.5;
      if (day === eventDay + 1) {
        push.rt = 2.5;
        push.mood = -1.5;
      }
    }
    if (scenario === "flat-rater") spreadScale = 0.15; // taps the same rating nearly every day
    if (scenario === "ops-skips" && (day === eventDay || day === eventDay + 1)) skipChance = 1;

    const value = (channel: Channel, scale = 1) =>
      usual[channel] + SHAPE[channel][2] * (noise[channel][index] * scale + push[channel]);

    if (skipDraw[index] < skipChance) {
      records.push({
        day, checked_in: false, sleep_time: null, wake_time: null, sleep_hours: null, sleep_midpoint_min: null,
        rt_median_ms: null, rt_slow_count: null, mood: null, workload: null, teamwork: null, shared_meal: null, words: null,
      });
      continue;
    }

    const sleepHours = clamp(Math.round(value("sleep") * 4) / 4, 2, 11); // quarter hours
    const midpoint = Math.round(value("midpoint") / 5) * 5;
    const reaction = Math.round(clamp(value("rt"), 170, 600));
    // More slow taps as the middle time rises. About 2 on a usual day.
    const expectedSlow = 2 * Math.exp((reaction - usual.rt) / (2 * SHAPE.rt[2]));
    const slowCount = Math.max(0, Math.round(expectedSlow + (lapseDraw[index] - 0.5) * 2 * Math.sqrt(expectedSlow)));
    records.push({
      day,
      checked_in: true,
      sleep_time: clock(midpoint - (sleepHours * 60) / 2),
      wake_time: clock(midpoint + (sleepHours * 60) / 2),
      sleep_hours: sleepHours,
      sleep_midpoint_min: midpoint,
      rt_median_ms: reaction,
      rt_slow_count: slowCount,
      mood: rating(value("mood", spreadScale)),
      workload: rating(value("workload", spreadScale)),
      teamwork: rating(value("teamwork", spreadScale)),
      shared_meal: mealDraw[index] < clamp(mealChance, 0.05, 0.95),
      words: Math.max(5, Math.round(value("words"))),
    });
  }

  return { scenario, size: onset === null ? 0 : size, awareness, onset, ends, days: records };
}

/**
 * The demo mission (D1): four crew, 90 days, one planted decline. Sam goes
 * quiet from about day 40 while still rating mood as usual.
 */
export function simulateMission(seed = 2026) {
  const crew: Array<{ id: string; name: string; scenario: Scenario; size: number }> = [
    { id: "cm-1", name: "Alex", scenario: "healthy", size: 0 },
    { id: "cm-2", name: "Sam", scenario: "going-quiet", size: 3 },
    { id: "cm-3", name: "Jordan", scenario: "one-bad-night", size: 0 },
    { id: "cm-4", name: "Riley", scenario: "healthy", size: 0 },
  ];
  return {
    simulated: true,
    note: "Simulated data. Not from any real crew member.",
    seed,
    crew: crew.map((member, index) => {
      const run = simulateCrewMember({ seed: seed * 10 + index, scenario: member.scenario, size: member.size, awareness: 0 });
      return { id: member.id, name: member.name, planted: member.scenario, onset_day: run.onset, days: run.days };
    }),
  };
}
