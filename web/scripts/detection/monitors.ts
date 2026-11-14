// The monitors the detection eval compares. Each one reads a crew member's
// daily records and says, for every day and measure, Normal (0), Watch (1) or
// Act (2).

import type { DayRecord } from "../../src/lib/sim/mission.ts";
import { median } from "../lib/stats.ts";

export const MEASURES = [
  "sleep_duration",
  "sleep_timing",
  "reaction_time",
  "mood",
  "workload",
  "teamwork",
  "engagement",
] as const;
export type Measure = (typeof MEASURES)[number];
export type Level = 0 | 1 | 2;
export type DayLevels = Record<Measure, Level>;
export type Monitor = {
  name: string;
  what: string;
  evaluate(days: DayRecord[]): DayLevels[];
};

const quiet = (): DayLevels => ({
  sleep_duration: 0, sleep_timing: 0, reaction_time: 0, mood: 0, workload: 0, teamwork: 0, engagement: 0,
});

// Which number each measure reads, and which way is worse (0 = either way).
const READS: Record<Measure, { value: (day: DayRecord) => number | null; worse: -1 | 0 | 1 }> = {
  sleep_duration: { value: (day) => day.sleep_hours, worse: -1 },
  sleep_timing: { value: (day) => day.sleep_midpoint_min, worse: 0 },
  reaction_time: { value: (day) => day.rt_median_ms, worse: 1 },
  mood: { value: (day) => day.mood, worse: -1 },
  workload: { value: (day) => day.workload, worse: 1 },
  teamwork: { value: (day) => day.teamwork, worse: -1 },
  engagement: { value: (day) => day.words, worse: -1 },
};

function standardDeviation(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

export type OwnBaselineRule = {
  baselineCheckins: number;
  window: number;
  watchGap: number;
  actGap: number;
  daysInARow: number;
  missedForAct: number;
  /** "sd" = standard deviation. "mad" = middle distance from the middle value. */
  spread: "sd" | "mad";
  /** Smallest spread allowed, per measure. Stops a flat baseline dividing by zero. */
  minimumSpread: Partial<Record<Measure, number>>;
  measures: readonly Measure[];
};

/** The rule exactly as the build brief words it. */
export const RULE_AS_WRITTEN: OwnBaselineRule = {
  baselineCheckins: 14,
  window: 3,
  watchGap: 1.5,
  actGap: 2.5,
  daysInARow: 3,
  missedForAct: 3,
  spread: "sd",
  minimumSpread: {},
  measures: MEASURES,
};

/** "Me against my own normal": the middle of the last few days against the first 14 check-ins. */
export function ownBaseline(name: string, what: string, rule: OwnBaselineRule): Monitor {
  return {
    name,
    what,
    evaluate(days) {
      const levels = days.map(quiet);
      for (const measure of rule.measures) {
        const { value, worse } = READS[measure];
        const seen: number[] = [];
        let middle = 0;
        let spread = 0;
        let ready = false;
        let watchRun = 0;
        let actRun = 0;
        let level: Level = 0;
        days.forEach((day, index) => {
          const today = value(day);
          if (today !== null) {
            seen.push(today);
            if (!ready && seen.length === rule.baselineCheckins) {
              middle = median(seen);
              spread =
                rule.spread === "sd"
                  ? standardDeviation(seen)
                  : 1.4826 * median(seen.map((entry) => Math.abs(entry - middle)));
              spread = Math.max(spread, rule.minimumSpread[measure] ?? 0);
              ready = true;
            } else if (ready) {
              const difference = median(seen.slice(-rule.window)) - middle;
              const signed = worse === 0 ? Math.abs(difference) : difference * worse;
              const gap = signed <= 0 ? 0 : spread === 0 ? Number.POSITIVE_INFINITY : signed / spread;
              watchRun = gap >= rule.watchGap ? watchRun + 1 : 0;
              actRun = gap >= rule.actGap ? actRun + 1 : 0;
              level = actRun >= rule.daysInARow ? 2 : watchRun >= rule.daysInARow ? 1 : 0;
            }
          }
          // A skipped day keeps yesterday's status.
          levels[index][measure] = level;
        });
      }
      if (rule.measures.includes("engagement")) {
        days.forEach((_, index) => {
          if (index < rule.baselineCheckins) return;
          const missed = days.slice(Math.max(0, index - 6), index + 1).filter((day) => !day.checked_in).length;
          if (missed >= rule.missedForAct) levels[index].engagement = 2;
        });
      }
      return levels;
    },
  };
}

/** The same limit for everyone, with no personal baseline. Watch only. */
export function fixedLimits(
  name: string,
  what: string,
  limits: Partial<Record<Measure, (middleOfLastThree: number) => boolean>>,
): Monitor {
  return {
    name,
    what,
    evaluate(days) {
      const levels = days.map(quiet);
      for (const measure of Object.keys(limits) as Measure[]) {
        const seen: number[] = [];
        let run = 0;
        let level: Level = 0;
        days.forEach((day, index) => {
          const today = READS[measure].value(day);
          if (today !== null) {
            seen.push(today);
            if (seen.length >= 3) {
              run = limits[measure]!(median(seen.slice(-3))) ? run + 1 : 0;
              level = run >= 3 ? 1 : 0;
            }
          }
          levels[index][measure] = level;
        });
      }
      return levels;
    },
  };
}

export const askOnly = fixedLimits(
  "Ask only",
  "A chatbot that asks \"how are you?\": mood rating of 2 or less",
  { mood: (value) => value <= 2 },
);

export const sameLimitsForEveryone = fixedLimits(
  "Same limits for everyone",
  "Population limits: sleep under 6 h, mood 2 or less, workload 5, teamwork 2 or less",
  {
    sleep_duration: (value) => value < 6,
    mood: (value) => value <= 2,
    workload: (value) => value >= 5,
    teamwork: (value) => value <= 2,
  },
);

export const askAgainstOwnNormal = ownBaseline(
  "Ask, against own normal",
  "Mood rating only, compared with the person's own baseline",
  { ...RULE_AS_WRITTEN, measures: ["mood"] },
);
