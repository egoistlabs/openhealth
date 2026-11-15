// Why does the emergency check raise so many false alarms?
//
// The app asks the model for a safety label only when no keyword matched, and
// the model may add a flag but never clear one. This experiment asks the model
// anyway, for every message, and shows what would change if it could overrule
// the keyword list:
//
// 1. Look-alikes (should NOT escalate): which layer escalates each one, and
//    what the model says about the ones the keywords caught.
// 2. Real emergencies the keywords catch (listed + open set): would the model
//    have cleared any of them?
// 3. Distress messages (should get a support reply, not an emergency).
//
// Never reads the sealed set. Ollama must be running. Each message is labelled
// RUNS times (default 2) because labels can vary between runs.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveBrainRoot } from "../src/lib/brain/root.ts";
import { checkRedFlags } from "../src/lib/brain/safety.ts";
import { classifyIntent } from "../src/lib/brain/classify.ts";

const RUNS = Number(process.env.RUNS ?? 2);
const brain = resolveBrainRoot();

async function readJsonl<T>(file: string): Promise<T[]> {
  return (await readFile(path.join(brain, file), "utf8"))
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

/** The model's emergency label, RUNS times. "ERROR" when the call failed. */
async function label(message: string): Promise<{ emergency: string[]; distress: boolean[] }> {
  const emergency: string[] = [];
  const distress: boolean[] = [];
  for (let run = 0; run < RUNS; run++) {
    const result = await classifyIntent(message);
    emergency.push(result.ok ? result.classification.emergency : "ERROR");
    distress.push(result.ok ? result.classification.distress : false);
  }
  return { emergency, distress };
}

const flagged = (labels: string[]) => labels.some((value) => value !== "none");
const show = (labels: string[]) => [...new Set(labels)].join(" / ");
const quote = (text: string, width = 58) => {
  const value = `"${text}"`;
  return value.length > width ? `${value.slice(0, width - 2)}…"` : value.padEnd(width);
};

const questions = await readJsonl<{ id: string; kind: string; question: string }>("evals/questions.jsonl");
const lookalikes = await readJsonl<{ id: string; category: string; message: string }>("evals/emergencies/lookalikes.jsonl");
const open = await readJsonl<{ id: string; message: string }>("evals/emergencies/open.jsonl");

console.log(`False-alarm experiment (model labels every message, ${RUNS} runs each)\n`);

/* 1. Look-alikes. */
let keywordAlarms = 0;
let modelOnlyAlarms = 0;
let modelWouldClear = 0;
let stillFlaggedIfOverrule = 0;
const lookalikeLines: string[] = [];
for (const item of lookalikes) {
  const keywords = await checkRedFlags(item.message);
  const model = await label(item.message);
  const modelFlags = flagged(model.emergency);
  if (keywords.matched) {
    keywordAlarms++;
    if (!modelFlags) modelWouldClear++;
  } else if (modelFlags) {
    modelOnlyAlarms++;
  }
  if (modelFlags) stillFlaggedIfOverrule++;
  if (keywords.matched || modelFlags) {
    const by = keywords.matched ? `keyword ${keywords.categories.join(",")}` : "model only";
    lookalikeLines.push(`  ${quote(item.message)} ${by.padEnd(26)} model says: ${show(model.emergency)}`);
  }
}
console.log(`1. Look-alikes that should NOT escalate: ${keywordAlarms + modelOnlyAlarms} of ${lookalikes.length} escalated today`);
for (const line of lookalikeLines) console.log(line);
console.log(`   Keywords raised ${keywordAlarms}; the app never asks the model about these.`);
console.log(`   Asked anyway, the model says "none" for ${modelWouldClear} of those ${keywordAlarms}.`);
console.log(`   If the model could overrule the keywords: ${keywordAlarms + modelOnlyAlarms} -> ${stillFlaggedIfOverrule} false alarms.\n`);

/* 2. Real emergencies the keywords catch. */
const real = [
  ...questions.filter((q) => q.kind === "red-flag").map((q) => ({ id: q.id, message: q.question })),
  ...open,
];
let caughtByKeywords = 0;
const cleared: string[] = [];
for (const item of real) {
  const keywords = await checkRedFlags(item.message);
  if (!keywords.matched) continue;
  caughtByKeywords++;
  const model = await label(item.message);
  if (model.emergency.some((value) => value === "none")) {
    cleared.push(`  ${quote(item.message)} keyword ${keywords.categories.join(",").padEnd(18)} model says: ${show(model.emergency)}`);
  }
}
console.log(`2. Real emergencies the keywords catch (listed + open set): ${caughtByKeywords}`);
for (const line of cleared) console.log(line);
console.log(`   The model would clear ${cleared.length} of ${caughtByKeywords}. Letting it overrule trades false alarms for missed emergencies.\n`);

/* 3. Distress. */
const support = questions.filter((q) => q.kind === "support");
let escalated = 0;
console.log(`3. Distress messages that need a support reply, not an emergency: ${support.length}`);
for (const item of support) {
  const model = await label(item.question);
  if (flagged(model.emergency)) escalated++;
  console.log(`  ${quote(item.question)} model says: ${show(model.emergency)}${model.distress.every(Boolean) ? " + distress" : ""}`);
}
console.log(`   The model labels ${escalated} of ${support.length} as an emergency.\n`);

console.log("Conclusion: one general model writes the replies AND labels each message. It is right about");
console.log("most look-alikes, but not reliably enough to overrule the keyword list, and it reads distress");
console.log("as self-harm. Next step: a second, dedicated classifier model for these decisions.");
