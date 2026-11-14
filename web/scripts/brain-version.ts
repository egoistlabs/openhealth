// Show or release the brain version.
//   npm run brain:version                          show the version and what changed since
//   npm run brain:release <intent> "what changed"  record the brain as it is now as the next version
//
// The intent says why the version was made, and decides the number:
//   fix    1.0.0 -> 1.0.1   add    1.0.0 -> 1.1.0   change 1.0.0 -> 2.0.0
// A brain that has never been released (no version.json) is released as v1.0.0
// with the word "first": npm run brain:release first "what this brain is"
//
// The version covers the routing file (CONTEXT.md), the stage contracts and
// prompts (stages/), identity, the knowledge folders and safety.

import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBrain } from "../src/lib/brain/check.ts";
import {
  INTENTS,
  hashBrainFiles,
  nextVersion,
  readBrainVersion,
  readVersionFile,
  type BrainChanges,
  type Intent,
} from "../src/lib/brain/version.ts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const brainDirectory = process.env.BRAIN_DIR
  ? path.resolve(process.cwd(), process.env.BRAIN_DIR)
  : path.resolve(scriptDirectory, "../../brain");
const CONTENT = ["reference/", "procedures/", "measures/"];

type Score = { passed: number; total: number };

// The newest eval report that ran against exactly these brain files, if there is one.
async function scoreFor(fingerprint: string): Promise<string | null> {
  const resultsDirectory = path.join(brainDirectory, "evals", "results");
  let best: { ran_at: string; scores: Record<string, Score> } | null = null;
  for (const name of await readdir(resultsDirectory).catch(() => [])) {
    if (!name.endsWith(".json")) continue;
    try {
      const report = JSON.parse(await readFile(path.join(resultsDirectory, name), "utf8"));
      if (report.brain?.fingerprint !== fingerprint) continue;
      if (!best || report.ran_at > best.ran_at) best = report;
    } catch {
      // not a report
    }
  }
  if (!best) return null;
  const { answerable, decline, red_flag } = best.scores;
  return `answerable ${answerable.passed}/${answerable.total}, decline ${decline.passed}/${decline.total}, red flag ${red_flag.passed}/${red_flag.total}`;
}

function printChanges(changes: BrainChanges) {
  for (const file of changes.added) console.log(`  added    ${file}`);
  for (const file of changes.edited) console.log(`  edited   ${file}`);
  for (const file of changes.removed) console.log(`  removed  ${file}`);
}

function printIntents() {
  for (const [name, meaning] of Object.entries(INTENTS)) console.log(`  ${name.padEnd(7)}${meaning}`);
}

// The intent is the person's call, except where the files plainly say otherwise.
function intentProblem(intent: Intent, changes: BrainChanges): string | null {
  const isContent = (file: string) => CONTENT.some((folder) => file.startsWith(folder));
  if (intent === "fix" && changes.added.some(isContent)) {
    return 'A knowledge file was added, so this is not a fix. Use "add", or "change" if it replaces older guidance.';
  }
  if (intent === "fix" && changes.added.some((file) => file.startsWith("stages/"))) {
    return 'A file was added under stages/, so this is not a fix. Use "add" for a new stage, or "change" if an existing stage is now given different files.';
  }
  if (intent !== "change" && changes.removed.length > 0) {
    return 'A file was deleted. Brain files should be marked "status: replaced", not deleted. If the deletion is intended, use "change".';
  }
  return null;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command !== "release") {
    const current = await readBrainVersion(brainDirectory);
    const released = await readVersionFile(brainDirectory);
    console.log(`Brain ${current.label} (fingerprint ${current.fingerprint})`);
    if (released) {
      console.log(`Last release: v${released.version} (${released.intent}) on ${released.released}: ${released.note}`);
    }
    console.log(`Eval score for these files: ${(await scoreFor(current.fingerprint)) ?? "not run yet"}`);
    if (current.modified) {
      console.log("\nChanged since the last release:");
      printChanges(current.changes);
      if (released) {
        console.log('\nTo release: npm run brain:release <intent> "what changed"');
        printIntents();
      } else {
        console.log('\nThis brain has never been released. To release it as v1.0.0: npm run brain:release first "what this brain is"');
      }
    }
    return;
  }

  const note = rest.slice(1).join(" ").trim();
  const first = (await readVersionFile(brainDirectory)) === null;
  if (first && (rest[0] !== "first" || !note)) {
    console.error('This brain has never been released. Release it as v1.0.0 with: npm run brain:release first "what this brain is"');
    process.exitCode = 1;
    return;
  }
  if (!first && rest[0] === "first") {
    console.error('This brain already has a version, so "first" cannot be used. Pick an intent:');
    printIntents();
    process.exitCode = 1;
    return;
  }
  const intent = rest[0] as Intent;
  if (!first && (!(intent in INTENTS) || !note)) {
    console.error('Give an intent and say what changed: npm run brain:release <intent> "what changed"');
    printIntents();
    process.exitCode = 1;
    return;
  }

  const current = await readBrainVersion(brainDirectory);
  if (!current.modified) {
    console.log(`Nothing changed since ${current.label}. No new version was made.`);
    return;
  }

  const problem = first ? null : intentProblem(intent, current.changes);
  if (problem) {
    console.error(problem);
    process.exitCode = 1;
    return;
  }

  const check = await checkBrain(brainDirectory);
  if (check.errors.length > 0) {
    for (const error of check.errors) console.error(`ERROR    ${error}`);
    console.error("\nThe brain has errors, so no version was made. Fix them, then run npm run brain:check.");
    process.exitCode = 1;
    return;
  }

  const version = first ? "1.0.0" : nextVersion(current.version, intent);
  const released = new Date().toISOString().slice(0, 10);
  const score = (await scoreFor(current.fingerprint)) ?? "not run";
  const files = await hashBrainFiles(brainDirectory);

  await writeFile(
    path.join(brainDirectory, "version.json"),
    `${JSON.stringify({ version, intent: first ? "first" : intent, released, note, score, fingerprint: current.fingerprint, files }, null, 2)}\n`,
  );
  const changed = [
    ...current.changes.added.map((file) => `added ${file}`),
    ...current.changes.edited.map((file) => `edited ${file}`),
    ...current.changes.removed.map((file) => `removed ${file}`),
  ];
  await appendFile(
    path.join(brainDirectory, "changelog.md"),
    first
      ? `\n## v${version} (first), ${released}\n\n- ${note}\n- Files: ${Object.keys(files).length} files\n- Evals: ${score}\n- Fingerprint: ${current.fingerprint}\n`
      : `\n## v${version} (${intent}), ${released}\n\n- ${note}\n- Files: ${changed.join(", ")}\n- Evals: ${score}\n- Fingerprint: ${current.fingerprint}\n`,
  );
  console.log(`Released brain v${version} (${first ? "first" : intent}). Evals: ${score}.`);
}

main().catch((error) => {
  console.error("Unable to read or release the brain version:", error);
  process.exitCode = 1;
});
