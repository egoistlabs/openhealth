import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { resolveBrainRoot } from "../brain/root.ts";
import { readBrainVersion, readVersionFile } from "../brain/version.ts";
import { turnLogPath, type TurnEvent } from "../chat/turn-log.ts";

/* What the Ground view is sent about the companion. Counts only: the turn log holds what
   crew typed and who typed it, so no question, answer or crew id leaves this function. */
export type CompanionStats = {
  turns: number;
  first: string | null;
  last: string | null;
  answered: number;
  fromNumbers: number;
  notOnBoard: number;
  escalated: number;
  failed: number;
  modelCalled: number;
  medianMs: number | null;
  sources: Array<{ id: string; n: number }>;
  redFlags: Array<{ category: string; n: number }>;
  stages: Array<{ stage: string; n: number }>;
};

export type EvalRun = { suite: string; ranAt: string; headline: string; passed: boolean | null; model: string | null };

export type GroundReport = {
  companion: CompanionStats | null;
  brain: { label: string; version: string; modified: boolean; released: string | null; score: string | null; note: string | null; changed: number } | null;
  evals: EvalRun[];
};

const median = (a: number[]) => {
  if (!a.length) return null;
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const tally = (items: string[]) => {
  const m = new Map<string, number>();
  items.forEach((x) => m.set(x, (m.get(x) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

async function companionStats(): Promise<CompanionStats | null> {
  const file = turnLogPath();
  if (!file) return null;
  let raw = "";
  try { raw = await readFile(file, "utf8"); } catch { return null; }
  const turns: TurnEvent[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try { const e = JSON.parse(line) as TurnEvent; if (e?.event === "companion_turn") turns.push(e); } catch { /* skip a torn line */ }
  }
  if (!turns.length) return { turns: 0, first: null, last: null, answered: 0, fromNumbers: 0, notOnBoard: 0, escalated: 0, failed: 0, modelCalled: 0, medianMs: null, sources: [], redFlags: [], stages: [] };
  const escalated = turns.filter((t) => t.outcome === "red_flag" || t.verdict?.escalation);
  const isEsc = new Set(escalated);
  const rest = turns.filter((t) => !isEsc.has(t));
  const times = turns.map((t) => t.time).sort();
  return {
    turns: turns.length,
    first: times[0] ?? null,
    last: times[times.length - 1] ?? null,
    answered: rest.filter((t) => t.outcome === "answered" || t.outcome === "answered_by_code" || t.outcome === "conversed" || t.outcome === "support_by_code").length,
    fromNumbers: rest.filter((t) => t.numbers_question || t.status_question).length,
    notOnBoard: rest.filter((t) => t.outcome === "nothing_found" || t.outcome === "declined_by_model" || t.outcome === "declined_by_audit" || t.outcome === "declined_by_boundary").length,
    escalated: escalated.length,
    failed: rest.filter((t) => t.outcome === "unparseable" || t.outcome === "aborted" || t.outcome === "error").length,
    modelCalled: turns.filter((t) => t.model_called).length,
    medianMs: median(turns.map((t) => t.total_ms).filter((x) => typeof x === "number")),
    sources: tally(turns.flatMap((t) => t.verdict?.sources ?? [])).slice(0, 5).map(([id, n]) => ({ id, n })),
    redFlags: tally(turns.flatMap((t) => t.red_flag_categories ?? [])).map(([category, n]) => ({ category, n })),
    stages: tally(turns.map((t) => t.stage ?? "none")).map(([stage, n]) => ({ stage, n })),
  };
}

async function brainStatus(root: string) {
  try {
    const [v, file] = await Promise.all([readBrainVersion(root), readVersionFile(root)]);
    const changed = v.changes.added.length + v.changes.removed.length + v.changes.edited.length;
    return { label: v.label, version: v.version, modified: v.modified, released: file?.released ?? null, score: file?.score ?? null, note: file?.note ?? null, changed };
  } catch { return null; }
}

async function jsonFiles(dir: string) {
  try { return (await readdir(dir)).filter((f) => f.endsWith(".json")).map((f) => path.join(dir, f)); } catch { return []; }
}
async function readJson(file: string): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>; } catch { return null; }
}
type Score = { passed?: number; total?: number; escalated?: number; rate?: number };
const frac = (s: Score | undefined, n: "passed" | "escalated") => (s && s.total != null ? `${s[n] ?? 0}/${s.total}` : "—");

/* The newest run of each suite: companion answers (brain/evals/results), emergencies and detection (web/eval-results). */
async function latestEvals(root: string): Promise<EvalRun[]> {
  const webDir = [path.resolve(process.cwd(), "eval-results"), path.resolve(process.cwd(), "web", "eval-results")];
  const files = [...await jsonFiles(path.join(root, "evals", "results")), ...(await Promise.all(webDir.map(jsonFiles))).flat()];
  const newest = new Map<string, EvalRun>();
  for (const f of files) {
    const j = await readJson(f);
    if (!j || typeof j.ran_at !== "string") continue;
    const suite = typeof j.suite === "string" ? j.suite : "answers";
    let run: EvalRun;
    if (suite === "answers") {
      const sc = j.scores as Record<string, Score> | undefined, th = j.thresholds as Record<string, number> | undefined;
      const passed = sc && th ? Object.entries(th).every(([k, min]) => (sc[k]?.rate ?? 0) >= min) : null;
      run = { suite, ranAt: j.ran_at, passed, model: typeof j.model === "string" ? j.model : null,
        headline: `Answerable ${frac(sc?.answerable, "passed")} · decline ${frac(sc?.decline, "passed")} · red flag ${frac(sc?.red_flag, "passed")}` };
    } else if (suite === "emergencies") {
      const sc = j.scores as (Record<string, Score> & { dead_ends?: number }) | undefined;
      const pm = j.pass_marks as { listed?: number; sealed?: number; dead_ends?: number } | undefined;
      const rate = (s?: Score) => (s?.total ? (s.escalated ?? 0) / s.total : 0);
      const passed = sc && pm ? rate(sc.listed) >= (pm.listed ?? 1) && rate(sc.sealed) >= (pm.sealed ?? 1) && (sc.dead_ends ?? 0) <= (pm.dead_ends ?? 0) : null;
      run = { suite, ranAt: j.ran_at, passed, model: j.with_model ? "with model" : "code only",
        headline: `Listed ${frac(sc?.listed, "escalated")} · sealed ${frac(sc?.sealed, "escalated")} escalated` };
    } else {
      run = { suite, ranAt: j.ran_at, passed: typeof j.passed === "boolean" ? j.passed : null, model: null,
        headline: typeof j.rule_under_test === "string" ? `Rule under test: ${j.rule_under_test}` : "See the report file" };
    }
    const prev = newest.get(suite);
    if (!prev || prev.ranAt < run.ranAt) newest.set(suite, run);
  }
  return [...newest.values()].sort((a, b) => a.suite.localeCompare(b.suite));
}

export async function groundReport(): Promise<GroundReport> {
  let root: string | null = null;
  try { root = resolveBrainRoot(); } catch { /* no brain on this machine */ }
  const [companion, brain, evals] = await Promise.all([
    companionStats(),
    root ? brainStatus(root) : Promise.resolve(null),
    root ? latestEvals(root) : Promise.resolve([]),
  ]);
  return { companion, brain, evals };
}
