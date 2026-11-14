import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Files that do not change what the companion knows or how it answers.
// CLAUDE.md is the map for people and coding agents; code never reads it. The
// routing file (CONTEXT.md) and the stage contracts are fingerprinted, because
// they decide what the model is given.
const NOT_FINGERPRINTED = ["evals/", "inbox/", "version.json", "changelog.md", "README.md", "CLAUDE.md"];

/**
 * Why a version was made. The intent decides which part of the number goes up.
 *   fix    1.0.0 -> 1.0.1  tune or correct what is already there
 *   add    1.0.0 -> 1.1.0  the companion knows or can do something new
 *   change 1.0.0 -> 2.0.0  guidance, behaviour, safety rules or structure are different
 */
export const INTENTS = {
  fix: "Tune or correct what is already there: wording, keywords, tuning a stage prompt. No new knowledge.",
  add: "The companion knows or can do something new: a new file, a new topic, a new red-flag term, a new stage.",
  change: "Guidance, behaviour, safety rules or structure are different: a file was replaced or retired, the identity changed, a red flag was removed, the routing or a stage's inputs changed.",
} as const;

export type Intent = keyof typeof INTENTS;

export type BrainVersionFile = {
  version: string;
  intent: Intent | "first";
  released: string;
  note: string;
  score: string;
  fingerprint: string;
  /** A hash of each file at release, used to show what changed since. */
  files: Record<string, string>;
};

export type BrainChanges = { added: string[]; removed: string[]; edited: string[] };

export type BrainVersion = {
  /** The last released version, for example "1.2.0". "0.0.0" if never released. */
  version: string;
  /** Fingerprint of the brain files as they are on disk now. */
  fingerprint: string;
  /** True when files changed after the last release. */
  modified: boolean;
  /** "v1.2.0" for a released brain, "v1.2.0+changes" when files changed after the release. */
  label: string;
  changes: BrainChanges;
};

export function nextVersion(version: string, intent: Intent): string {
  const [major, minor, patch] = version.split(".").map(Number);
  if (intent === "change") return `${major + 1}.0.0`;
  if (intent === "add") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

async function allFiles(directory: string, root: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return allFiles(fullPath, root);
      return entry.isFile() ? [path.relative(root, fullPath).split(path.sep).join("/")] : [];
    }),
  );
  return nested.flat();
}

function shortHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

async function hashFiles(root: string, relativePaths: string[]): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const relativePath of [...relativePaths].sort()) {
    const content = (await readFile(path.join(root, relativePath), "utf8")).replace(/\r\n/g, "\n");
    hashes[relativePath] = shortHash(content);
  }
  return hashes;
}

/** A short hash of a set of files: their paths and their contents, line endings normalised. */
export async function fingerprintFiles(root: string, relativePaths: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const relativePath of [...relativePaths].sort()) {
    const content = (await readFile(path.join(root, relativePath), "utf8")).replace(/\r\n/g, "\n");
    hash.update(`${relativePath}\n${content}\n`);
  }
  return hash.digest("hex").slice(0, 12);
}

/** A hash of every brain file that affects what the companion knows or how it answers. */
export async function hashBrainFiles(brainRoot: string): Promise<Record<string, string>> {
  const files = (await allFiles(brainRoot, brainRoot)).filter(
    (file) => !NOT_FINGERPRINTED.some((skipped) => file === skipped || file.startsWith(skipped)),
  );
  return hashFiles(brainRoot, files);
}

export async function fingerprintBrain(brainRoot: string): Promise<string> {
  return fingerprintFiles(brainRoot, Object.keys(await hashBrainFiles(brainRoot)));
}

export async function readVersionFile(brainRoot: string): Promise<BrainVersionFile | null> {
  try {
    return JSON.parse(await readFile(path.join(brainRoot, "version.json"), "utf8")) as BrainVersionFile;
  } catch {
    return null;
  }
}

export async function readBrainVersion(brainRoot: string): Promise<BrainVersion> {
  const [released, current] = await Promise.all([readVersionFile(brainRoot), hashBrainFiles(brainRoot)]);
  const fingerprint = await fingerprintFiles(brainRoot, Object.keys(current));
  const before = released?.files ?? {};
  const changes: BrainChanges = {
    added: Object.keys(current).filter((file) => !(file in before)),
    removed: Object.keys(before).filter((file) => !(file in current)),
    edited: Object.keys(current).filter((file) => file in before && before[file] !== current[file]),
  };
  const version = released?.version ?? "0.0.0";
  const modified = !released || released.fingerprint !== fingerprint;
  return {
    version,
    fingerprint,
    modified,
    label: modified ? `v${version}+changes` : `v${version}`,
    changes,
  };
}
