// Detection suite (replaces D3 and D4): does the status rule catch a decline the
// person did not report, and does it stay quiet when nothing is wrong?
//
// No model. It simulates many crew members, so it shows the trade-off that one
// planted decline hides. Options:
//   EVAL_SPLIT=tune    use the seeds for tuning thresholds (default: report)
//   EVAL_SWEEP=1       also print the trade-off across thresholds
//   EVAL_PEOPLE=200    crew members per group (default 500 healthy, 200 per decline)

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { simulateCrewMember, type Scenario } from "../src/lib/sim/mission.ts";
import { candidate } from "./detection/candidate.ts";
import {
  askAgainstOwnNormal,
  askOnly,
  MEASURES,
  ownBaseline,
  RULE_AS_WRITTEN,
  sameLimitsForEveryone,
  type DayLevels,
  type Measure,
  type Monitor,
} from "./detection/monitors.ts";
import { median, percent } from "./lib/stats.ts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const split = process.env.EVAL_SPLIT === "tune" ? "tune" : "report";
// Two sets of seeds that never overlap: tune thresholds on one, report on the other.
const SEED_BASE = split === "tune" ? 1_000 : 900_000;
const people = Number(process.env.EVAL_PEOPLE ?? 0);
const HEALTHY = people || 500;
const PER_DECLINE = people || 200;
const BASELINE_DAYS = 14;

const PASS_MARKS = { false_watch_per_person: 1, share_reaching_act: 0.02 };

// The measures that really change in each decline. A catch only counts on one of these.
const CHANGED: Partial<Record<Scenario, Measure[]>> = {
  "sleep-debt": ["sleep_duration", "reaction_time"],
  "going-quiet": ["engagement", "teamwork"],
  "crew-friction": ["teamwork"],
  "clock-drift": ["sleep_timing"],
  "slow-boil": ["sleep_duration", "reaction_time"],
  "short-from-launch": ["sleep_duration", "reaction_time"],
};
const DECLINES: Scenario[] = ["sleep-debt", "going-quiet", "crew-friction", "clock-drift", "slow-boil"];
const SIZES = [1, 2, 3];

/** First day in [fromDay, toDay] with Watch or worse on any of the measures. */
function firstAlert(levels: DayLevels[], measures: readonly Measure[], fromDay: number, toDay: number): number | null {
  for (let day = Math.max(1, fromDay); day <= Math.min(levels.length, toDay); day += 1) {
    if (measures.some((measure) => levels[day - 1][measure] >= 1)) return day;
  }
  return null;
}

/** How many separate times a status left Normal, over all measures. */
function watchEpisodes(levels: DayLevels[]): number {
  let episodes = 0;
  for (const measure of MEASURES) {
    for (let index = BASELINE_DAYS; index < levels.length; index += 1) {
      if (levels[index][measure] >= 1 && levels[index - 1][measure] === 0) episodes += 1;
    }
  }
  return episodes;
}

const reachesAct = (levels: DayLevels[]) => levels.some((day) => MEASURES.some((measure) => day[measure] === 2));

function healthyScores(monitor: Monitor, scenario: Scenario = "healthy") {
  let episodes = 0;
  let act = 0;
  let meetsD4 = 0;
  for (let person = 0; person < HEALTHY; person += 1) {
    const levels = monitor.evaluate(simulateCrewMember({ seed: SEED_BASE + person, scenario, size: 1 }).days);
    const own = watchEpisodes(levels);
    const acted = reachesAct(levels);
    episodes += own;
    if (acted) act += 1;
    if (!acted && own <= 1) meetsD4 += 1;
  }
  return {
    false_watch_per_person: episodes / HEALTHY,
    share_reaching_act: act / HEALTHY,
    share_meeting_old_d4: meetsD4 / HEALTHY,
  };
}

function declineScores(monitor: Monitor, scenario: Scenario, size: number, awareness: number, anyMeasure = false) {
  const measures = anyMeasure ? MEASURES : CHANGED[scenario]!;
  let caught10 = 0;
  let caught21 = 0;
  let twin10 = 0;
  let twin21 = 0;
  const delays: number[] = [];
  for (let person = 0; person < PER_DECLINE; person += 1) {
    const seed = SEED_BASE + 10_000 + person;
    const run = simulateCrewMember({ seed, scenario, size, awareness });
    const twin = simulateCrewMember({ seed, scenario, size: 0, awareness });
    const onset = run.onset!;
    const levels = monitor.evaluate(run.days);
    const twinLevels = monitor.evaluate(twin.days);
    if (firstAlert(levels, measures, onset, onset + 10) !== null) caught10 += 1;
    if (firstAlert(levels, measures, onset, onset + 21) !== null) caught21 += 1;
    if (firstAlert(twinLevels, measures, onset, onset + 10) !== null) twin10 += 1;
    if (firstAlert(twinLevels, measures, onset, onset + 21) !== null) twin21 += 1;
    const first = firstAlert(levels, measures, onset, run.days.length);
    delays.push(first === null ? Number.POSITIVE_INFINITY : first - onset);
  }
  return {
    caught_in_10_days: caught10 / PER_DECLINE,
    healthy_twin_in_10_days: twin10 / PER_DECLINE,
    caught_in_21_days: caught21 / PER_DECLINE,
    healthy_twin_in_21_days: twin21 / PER_DECLINE,
    median_days_to_catch: median(delays),
  };
}

const days = (value: number) => (Number.isFinite(value) ? `${value}` : "not caught");

function main() {
  console.log(`\nDetection suite (${split} seeds, ${HEALTHY} healthy crew members, ${PER_DECLINE} per decline, 90 days)`);
  console.log(`Rule under test: ${candidate.name}\n`);

  // 1. Stay quiet.
  const monitors = [askOnly, askAgainstOwnNormal, sameLimitsForEveryone, candidate];
  const healthy = Object.fromEntries(monitors.map((monitor) => [monitor.name, healthyScores(monitor)]));
  console.log("1. Healthy crew members: how often does each monitor flag someone who is fine?");
  console.table(
    Object.fromEntries(
      Object.entries(healthy).map(([name, score]) => [
        name,
        {
          "false Watch per person, 90 days": score.false_watch_per_person.toFixed(2),
          "ever reach Act": percent(score.share_reaching_act),
          "meet old D4": percent(score.share_meeting_old_d4),
        },
      ]),
    ),
  );

  // 2. Catch, for the rule under test, on the measures that really changed.
  const catches: Record<string, ReturnType<typeof declineScores>> = {};
  for (const scenario of DECLINES) {
    for (const size of SIZES) catches[`${scenario}, size ${size}`] = declineScores(candidate, scenario, size, 0);
  }
  console.log("2. Hidden declines (mood rating does not move): does the rule under test catch them?");
  console.log("   A catch counts only on a measure that really changed. \"Healthy twin\" is the same person, same days, nothing wrong.");
  console.table(
    Object.fromEntries(
      Object.entries(catches).map(([name, score]) => [
        name,
        {
          "caught in 10 days": percent(score.caught_in_10_days),
          "healthy twin": percent(score.healthy_twin_in_10_days),
          "caught in 21 days": percent(score.caught_in_21_days),
          "twin, 21 days": percent(score.healthy_twin_in_21_days),
          "median days": days(score.median_days_to_catch),
        },
      ]),
    ),
  );

  // 3. Against the other monitors, as the person notices more of the decline themselves.
  const fast: Scenario[] = ["sleep-debt", "going-quiet", "crew-friction", "clock-drift"];
  const comparison: Record<string, Record<string, { caught: number; twin: number }>> = {};
  for (const awareness of [0, 0.5, 1]) {
    const label = awareness === 0 ? "notices none of it" : awareness === 1 ? "notices all of it" : "notices half of it";
    comparison[label] = {};
    for (const monitor of monitors) {
      const scores = fast.map((scenario) => declineScores(monitor, scenario, 2, awareness, true));
      comparison[label][monitor.name] = {
        caught: scores.reduce((sum, score) => sum + score.caught_in_21_days, 0) / scores.length,
        twin: scores.reduce((sum, score) => sum + score.healthy_twin_in_21_days, 0) / scores.length,
      };
    }
  }
  console.log("3. Against a monitor that only asks. Size 2 declines, any flag within 21 days, four fast scenarios averaged.");
  console.log("   Each cell: caught (same window on the healthy twin). The gap between the two is what the monitor adds.");
  console.table(
    Object.fromEntries(
      Object.entries(comparison).map(([label, row]) => [
        label,
        Object.fromEntries(Object.entries(row).map(([name, cell]) => [name, `${percent(cell.caught)} (${percent(cell.twin)})`])),
      ]),
    ),
  );

  // 4. Cases that must stay quiet, and one known blind spot.
  const stayQuiet = {
    "flat rater (taps the same rating daily)": healthyScores(candidate, "flat-rater"),
    "two check-ins skipped for operations": healthyScores(candidate, "ops-skips"),
    "one terrible night": healthyScores(candidate, "one-bad-night"),
  };
  console.log("4. Cases that should stay quiet (rule under test). Compare with the healthy row in table 1.");
  console.table(
    Object.fromEntries(
      Object.entries(stayQuiet).map(([name, score]) => [
        name,
        { "false Watch per person": score.false_watch_per_person.toFixed(2), "ever reach Act": percent(score.share_reaching_act) },
      ]),
    ),
  );

  // A heavy week should flag workload while it lasts, and clear once it is over.
  const heavyWeek = { during: 0, ten_days_after: 0, twin_ten_days_after: 0 };
  for (let person = 0; person < PER_DECLINE; person += 1) {
    const seed = SEED_BASE + 30_000 + person;
    const run = simulateCrewMember({ seed, scenario: "heavy-week", size: 1 });
    const twin = simulateCrewMember({ seed, scenario: "heavy-week", size: 0 });
    const after = Math.min(run.ends! + 10, run.days.length);
    if (firstAlert(candidate.evaluate(run.days), ["workload"], run.onset!, run.ends! + 2) !== null) heavyWeek.during += 1;
    if (candidate.evaluate(run.days)[after - 1].workload >= 1) heavyWeek.ten_days_after += 1;
    if (candidate.evaluate(twin.days)[after - 1].workload >= 1) heavyWeek.twin_ten_days_after += 1;
  }
  console.log(
    `   A heavy week that ends: workload flagged during it for ${percent(heavyWeek.during / PER_DECLINE)}; ` +
      `still flagged 10 days after for ${percent(heavyWeek.ten_days_after / PER_DECLINE)} ` +
      `(healthy twin on that day: ${percent(heavyWeek.twin_ten_days_after / PER_DECLINE)}).\n`,
  );

  const blindSpot = Object.fromEntries(
    [candidate, sameLimitsForEveryone].map((monitor) => {
      let flagged = 0;
      for (let person = 0; person < PER_DECLINE; person += 1) {
        const run = simulateCrewMember({ seed: SEED_BASE + 20_000 + person, scenario: "short-from-launch", size: 2 });
        if (firstAlert(monitor.evaluate(run.days), ["sleep_duration"], BASELINE_DAYS + 1, 90) !== null) flagged += 1;
      }
      return [monitor.name, flagged / PER_DECLINE];
    }),
  );
  console.log("5. Known blind spot: already about 1.6 h short of sleep when the baseline is taken. Share ever flagged for sleep:");
  console.table(Object.fromEntries(Object.entries(blindSpot).map(([name, share]) => [name, percent(share)])));

  // Optional: the trade-off across thresholds, for choosing the rule.
  let sweep: unknown = null;
  if (process.env.EVAL_SWEEP === "1") {
    const rows: Record<string, Record<string, string>> = {};
    for (const watchGap of [1.5, 2, 2.5, 3]) {
      for (const floor of [0, 1]) {
        const rule = {
          ...RULE_AS_WRITTEN,
          watchGap,
          actGap: watchGap + 1,
          minimumSpread: floor ? { mood: floor, workload: floor, teamwork: floor } : {},
        };
        const monitor = ownBaseline("sweep", "", rule);
        const quiet = healthyScores(monitor);
        const scores = fast.map((scenario) => declineScores(monitor, scenario, 2, 0));
        const mean = (key: "caught_in_10_days" | "caught_in_21_days") => scores.reduce((sum, score) => sum + score[key], 0) / scores.length;
        rows[`Watch at ${watchGap}${floor ? ", ratings spread at least 1" : ""}`] = {
          "false Watch per person": quiet.false_watch_per_person.toFixed(2),
          "ever reach Act": percent(quiet.share_reaching_act),
          "caught in 10 days": percent(mean("caught_in_10_days")),
          "caught in 21 days": percent(mean("caught_in_21_days")),
        };
      }
    }
    console.log("Sweep: one rule has to pass both sides. Size 2 declines, four fast scenarios averaged.");
    console.table(rows);
    sweep = rows;
  }

  const own = healthy[candidate.name];
  const passed =
    own.false_watch_per_person <= PASS_MARKS.false_watch_per_person &&
    own.share_reaching_act < PASS_MARKS.share_reaching_act;
  console.log(
    `Pass marks: at most ${PASS_MARKS.false_watch_per_person} false Watch per healthy person in 90 days (got ${own.false_watch_per_person.toFixed(2)}), ` +
      `under ${percent(PASS_MARKS.share_reaching_act)} of healthy people reach Act (got ${percent(own.share_reaching_act)}).`,
  );
  console.log("The catch rates above are reported, not marked: fix the false-alarm budget first, then see what catch time it buys.");
  console.log(passed ? "\nPASS" : "\nFAIL");

  let commit: string | null = null;
  try {
    commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: scriptDirectory, encoding: "utf8" }).trim();
  } catch {
    // Not a git checkout.
  }
  const report = {
    suite: "detection",
    ran_at: new Date().toISOString(),
    code_commit: commit,
    simulated: true,
    split,
    people: { healthy: HEALTHY, per_decline: PER_DECLINE },
    rule_under_test: candidate.name,
    pass_marks: PASS_MARKS,
    passed,
    healthy,
    catches,
    comparison,
    stay_quiet: stayQuiet,
    heavy_week: heavyWeek,
    blind_spot_short_from_launch: blindSpot,
    sweep,
  };
  const resultsDirectory = path.resolve(scriptDirectory, "../eval-results");
  return mkdir(resultsDirectory, { recursive: true }).then(async () => {
    const resultPath = path.join(resultsDirectory, `detection-${report.ran_at.replace(/[:.]/g, "-")}.json`);
    await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Report: ${path.relative(process.cwd(), resultPath)}`);
    if (!passed) process.exitCode = 1;
  });
}

main().catch((error) => {
  console.error("Unable to run the detection suite:", error);
  process.exitCode = 1;
});
