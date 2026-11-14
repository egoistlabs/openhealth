// Show or release the brain version.
//   pnpm brain:version                 show the current version and whether files changed since
//   pnpm brain:release "what changed"  record the brain as it is now as the next version

import { appendFile, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBrain } from "../src/lib/brain/check.ts";
import { fingerprintBrain, readBrainVersion, readVersionFile } from "../src/lib/brain/version.ts";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const brainDirectory = path.resolve(scriptDirectory, "../brain");

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

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command !== "release") {
    const current = await readBrainVersion(brainDirectory);
    const released = await readVersionFile(brainDirectory);
    console.log(`Brain ${current.label} (fingerprint ${current.fingerprint})`);
    if (released) console.log(`Last release: v${released.version} on ${released.released}: ${released.note}`);
    console.log(`Eval score for these files: ${(await scoreFor(current.fingerprint)) ?? "not run yet"}`);
    if (current.modified) {
      console.log('Files changed since the last release. Run: pnpm brain:release "what changed"');
    }
    return;
  }

  const note = rest.join(" ").trim();
  if (!note) {
    console.error('Say what changed: pnpm brain:release "what changed"');
    process.exitCode = 1;
    return;
  }

  const current = await readBrainVersion(brainDirectory);
  if (!current.modified) {
    console.log(`Nothing changed since ${current.label}. No new version was made.`);
    return;
  }

  const check = await checkBrain(brainDirectory);
  if (check.errors.length > 0) {
    for (const error of check.errors) console.error(`ERROR    ${error}`);
    console.error("\nThe brain has errors, so no version was made. Fix them, then run pnpm brain:check.");
    process.exitCode = 1;
    return;
  }

  const version = current.version + 1;
  const released = new Date().toISOString().slice(0, 10);
  const fingerprint = await fingerprintBrain(brainDirectory);
  const score = (await scoreFor(fingerprint)) ?? "not run";

  await writeFile(
    path.join(brainDirectory, "version.json"),
    `${JSON.stringify({ version, released, fingerprint, note, score }, null, 2)}\n`,
  );
  await appendFile(
    path.join(brainDirectory, "changelog.md"),
    `\n## v${version}, ${released}\n\n- ${note}\n- Evals: ${score}\n- Fingerprint: ${fingerprint}\n`,
  );
  console.log(`Released brain v${version} (fingerprint ${fingerprint}). Evals: ${score}.`);
}

main().catch((error) => {
  console.error("Unable to read or release the brain version:", error);
  process.exitCode = 1;
});
