import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Add a source package to the brain with one command:
 *
 *   npm run brain:add -- inbox/my-package
 *   npm run brain:add -- inbox/my-package --package-only
 *
 * 1. Validate the package (frontmatter, length, tests)
 * 2. Stage a temporary copy of the brain and apply the change there
 * 3. Run the package's own tests, then the full test set (unless --package-only)
 * 4. Go live only if the new tests pass and nothing that passed before now fails
 * 5. Archive the package, append the changelog, keep replaced files
 */

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const webDirectory = path.resolve(scriptDirectory, "..");
const repoRoot = path.resolve(webDirectory, "..");
const MAX_BODY_WORDS = 400;

type PackageTest = {
  id: string;
  kind: "answerable" | "decline" | "red-flag";
  question: string;
  must_cite?: string;
  must_include?: string[];
};

type PackageInfo = {
  directory: string;
  slug: string;
  title: string;
  authorisedBy: string;
  replaces: string | null;
  fileText: string;
  tests: PackageTest[];
};

function fail(message: string): never {
  console.error(`\nCannot add package: ${message}\n`);
  process.exit(1);
}

function parseFrontmatter(text: string): {
  fields: Map<string, string>;
  body: string;
} | null {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (field) fields.set(field[1], field[2].trim());
  }
  return { fields, body: match[2].trim() };
}

function kebabCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveBrainRoot(): Promise<string> {
  const candidates = [
    process.env.BRAIN_DIR
      ? path.resolve(process.cwd(), process.env.BRAIN_DIR)
      : null,
    path.join(repoRoot, "brain"),
  ].filter((candidate): candidate is string => candidate !== null);

  for (const candidate of candidates) {
    try {
      await stat(path.join(candidate, "identity", "companion.md"));
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  fail(`brain folder not found. Tried: ${candidates.join(", ")}`);
}

async function loadPackage(
  brainRoot: string,
  argument: string,
): Promise<PackageInfo> {
  const direct = path.resolve(process.cwd(), argument);
  let directory = direct;
  try {
    const info = await stat(direct);
    if (!info.isDirectory()) fail(`${argument} is not a directory`);
  } catch {
    directory = path.join(
      brainRoot,
      argument.startsWith("inbox/") ? argument : path.join("inbox", argument),
    );
  }

  let files: string[];
  try {
    files = await readdir(directory);
  } catch {
    fail(`package folder not found: ${directory}`);
  }

  const markdownFiles = files.filter(
    (file) => file.endsWith(".md") && !file.startsWith("README"),
  );
  if (markdownFiles.length !== 1) {
    fail(`expected exactly one source .md file, found ${markdownFiles.length}`);
  }

  const fileText = await readFile(path.join(directory, markdownFiles[0]), "utf8");
  const parsed = parseFrontmatter(fileText);
  if (!parsed) fail("the source file needs a frontmatter header");

  for (const required of ["title", "topic", "keywords", "source", "authorised_by"]) {
    if (!parsed.fields.get(required)) {
      fail(`frontmatter is missing "${required}"`);
    }
  }

  const status = (parsed.fields.get("status") ?? "").toLowerCase();
  if (status !== "active") {
    fail(`frontmatter status must be "active" before a package can go live`);
  }

  const wordCount = parsed.body.split(/\s+/).filter(Boolean).length;
  if (wordCount > MAX_BODY_WORDS) {
    fail(`the source body is ${wordCount} words; the limit is ${MAX_BODY_WORDS}`);
  }

  const replaces = parsed.fields.get("replaces")?.trim() || null;
  if (replaces && !/^(procedures|reference|measures)\//.test(replaces)) {
    fail('"replaces" must name a file under procedures/, reference/ or measures/');
  }

  let tests: PackageTest[] = [];
  if (files.includes("tests.jsonl")) {
    const lines = (await readFile(path.join(directory, "tests.jsonl"), "utf8"))
      .split(/\r?\n/)
      .filter(Boolean);
    tests = lines.map((line, index) => {
      try {
        const test = JSON.parse(line) as PackageTest;
        if (
          typeof test.id !== "string" ||
          !["answerable", "decline", "red-flag"].includes(test.kind) ||
          typeof test.question !== "string"
        ) {
          throw new Error("invalid test shape");
        }
        return test;
      } catch {
        fail(`tests.jsonl line ${index + 1} is not a valid test`);
      }
    });
    if (tests.length === 0) fail("tests.jsonl has no tests");
  } else {
    fail("the package needs tests.jsonl");
  }

  return {
    directory,
    slug: kebabCase(parsed.fields.get("title") ?? "package"),
    title: parsed.fields.get("title") ?? "Untitled source",
    authorisedBy: parsed.fields.get("authorised_by") ?? "unknown",
    replaces,
    fileText,
    tests,
  };
}

function withStatusReplaced(text: string): string {
  const match = text.match(/^(---\r?\n[\s\S]*?)\r?\n---/)
  if (!match) return text;
  const header = match[1].replace(/^status:.*$/m, "status: replaced");
  return `${header}\n---${text.slice(match[0].length)}`;
}

async function stageBrain(brainRoot: string): Promise<string> {
  const staging = await mkdtemp(path.join(tmpdir(), "astronaut-brain-"));
  await cp(brainRoot, staging, {
    recursive: true,
    filter: (source) =>
      !source.includes(`${path.sep}inbox${path.sep}added`) &&
      !source.includes(`${path.sep}evals${path.sep}results`),
  });
  return staging;
}

async function runEvals(input: {
  staging: string;
  testsPath: string;
  baselinePath: string | null;
  packageOnly: boolean;
}): Promise<{ passed: boolean; reportPath: string | null }> {
  const environment = {
    ...process.env,
    BRAIN_DIR: input.staging,
    EVAL_EXTRA_CASES: input.testsPath,
    EVAL_STRICT: "1",
    EVAL_SKIP_THRESHOLDS: "1",
    ...(input.packageOnly
      ? { EVAL_ONLY_EXTRA: "1" }
      : input.baselinePath
        ? { EVAL_BASELINE: input.baselinePath }
        : {}),
  };

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
        "--experimental-strip-types",
        path.join(scriptDirectory, "evals.ts"),
      ],
      { cwd: webDirectory, env: environment, stdio: "inherit" },
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });

  let reportPath: string | null = null;
  try {
    const resultsDirectory = path.join(input.staging, "evals", "results");
    const files = (await readdir(resultsDirectory))
      .filter((file) => file.endsWith(".json"))
      .sort();
    if (files.length > 0) {
      reportPath = path.join(resultsDirectory, files.at(-1) as string);
    }
  } catch {
    // No report means the run failed before writing one.
  }

  return { passed: exitCode === 0, reportPath };
}

async function latestBaseline(brainRoot: string): Promise<string | null> {
  try {
    const directory = path.join(brainRoot, "evals", "results");
    const files = (await readdir(directory))
      .filter((file) => file.endsWith(".json") && !file.startsWith("add-"))
      .sort();
    return files.length > 0 ? path.join(directory, files.at(-1) as string) : null;
  } catch {
    return null;
  }
}

async function promote(input: {
  brainRoot: string;
  staging: string;
  info: PackageInfo;
  destination: string;
  packageOnly: boolean;
}): Promise<void> {
  const stagedSource = path.join(input.staging, input.destination);
  const finalPath = path.join(input.brainRoot, input.destination);
  await mkdir(path.dirname(finalPath), { recursive: true });
  await cp(stagedSource, finalPath);

  if (input.info.replaces) {
    const replacedPath = path.join(input.brainRoot, input.info.replaces);
    await writeFile(
      replacedPath,
      withStatusReplaced(await readFile(replacedPath, "utf8")),
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const changelogPath = path.join(input.brainRoot, "changelog.md");
  const changelog = await readFile(changelogPath, "utf8");
  const entry = [
    `## ${stamp} — Added ${input.info.title}`,
    "",
    `- File: \`${input.destination}\``,
    `- Replaces: ${input.info.replaces ? `\`${input.info.replaces}\`` : "nothing"}`,
    `- Tests: ${input.info.tests.length} package tests passed; ${
      input.packageOnly
        ? "package-only mode, full set not run"
        : "no regressions in the full set"
    }`,
    `- Authorised by: ${input.info.authorisedBy}`,
    "",
    changelog.replace(/^# Brain changelog\r?\n+/, ""),
  ].join("\n");
  await writeFile(
    changelogPath,
    `# Brain changelog\n\n${entry.trim()}\n`,
  );

  const inboxRoot = path.join(input.brainRoot, "inbox");
  const insideInbox = path
    .relative(inboxRoot, input.info.directory)
    .startsWith("..") === false;
  if (insideInbox) {
    const archiveDirectory = path.join(
      inboxRoot,
      "added",
      `${new Date().toISOString().replace(/[:.]/g, "-")}-${input.info.slug}`,
    );
    await mkdir(path.dirname(archiveDirectory), { recursive: true });
    await rename(input.info.directory, archiveDirectory);
  } else {
    console.log(
      "The package came from outside the inbox, so it was left where it is.",
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  const packageOnly = args.includes("--package-only");
  const argument = args.find((arg) => !arg.startsWith("--"));
  if (!argument) fail("usage: npm run brain:add -- inbox/<package> [--package-only]");

  try {
    process.loadEnvFile(path.join(webDirectory, ".env"));
  } catch {
    // Model settings can also come from exported environment variables.
  }

  const brainRoot = await resolveBrainRoot();
  const info = await loadPackage(brainRoot, argument);
  const destination =
    info.replaces ?? `procedures/${info.slug}.md`;

  console.log(`Package:  ${info.title}`);
  console.log(`Tests:    ${info.tests.length}`);
  console.log(`Goes to:  ${destination}`);
  console.log(`Replaces: ${info.replaces ?? "nothing"}`);
  console.log(`Mode:     ${packageOnly ? "package tests only (demo mode)" : "package tests + full set"}`);

  const staging = await stageBrain(brainRoot);
  try {
    // Apply the change to the staged copy.
    const stagedDestination = path.join(staging, destination);
    await mkdir(path.dirname(stagedDestination), { recursive: true });
    await writeFile(stagedDestination, info.fileText);
    if (info.replaces) {
      const stagedReplaced = path.join(staging, info.replaces);
      await writeFile(
        stagedReplaced,
        withStatusReplaced(await readFile(stagedReplaced, "utf8")),
      );
    }

    const testsPath = path.join(info.directory, "tests.jsonl");
    const baselinePath = packageOnly ? null : await latestBaseline(brainRoot);
    const result = await runEvals({
      staging,
      testsPath,
      baselinePath,
      packageOnly,
    });

    if (result.reportPath) {
      const resultsDirectory = path.join(brainRoot, "evals", "results");
      await mkdir(resultsDirectory, { recursive: true });
      await cp(
        result.reportPath,
        path.join(
          resultsDirectory,
          `add-${info.slug}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        ),
      );
    }

    if (!result.passed) {
      console.error(
        "\nThe package did NOT go live. It stays in the inbox; the report lists what failed.",
      );
      process.exitCode = 1;
      return;
    }

    await promote({ brainRoot, staging, info, destination, packageOnly });
    console.log(
      `\nAdded "${info.title}" to ${destination}. The package was archived under brain/inbox/added/.`,
    );
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error("Unable to add the package:", error);
  process.exitCode = 1;
});
