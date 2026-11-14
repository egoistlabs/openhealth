import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

// Files that do not change what the companion knows or how it answers.
const NOT_FINGERPRINTED = ["evals/", "inbox/", "version.json", "changelog.md", "README.md"];

export type BrainVersionFile = {
  version: number;
  released: string;
  fingerprint: string;
  note: string;
};

export type BrainVersion = {
  /** The last released version number. 0 if the brain was never released. */
  version: number;
  /** Fingerprint of the brain files as they are on disk now. */
  fingerprint: string;
  /** True when files changed after the last release. */
  modified: boolean;
  /** "v1" for a released brain, "v1+changes" when files changed after the release. */
  label: string;
};

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

/** A short hash of a set of files: their paths and their contents, line endings normalised. */
export async function fingerprintFiles(root: string, relativePaths: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const relativePath of [...relativePaths].sort()) {
    const content = (await readFile(path.join(root, relativePath), "utf8")).replace(/\r\n/g, "\n");
    hash.update(`${relativePath}\n${content}\n`);
  }
  return hash.digest("hex").slice(0, 12);
}

export async function fingerprintBrain(brainRoot: string): Promise<string> {
  const files = (await allFiles(brainRoot, brainRoot)).filter(
    (file) => !NOT_FINGERPRINTED.some((skipped) => file === skipped || file.startsWith(skipped)),
  );
  return fingerprintFiles(brainRoot, files);
}

export async function readVersionFile(brainRoot: string): Promise<BrainVersionFile | null> {
  try {
    return JSON.parse(await readFile(path.join(brainRoot, "version.json"), "utf8")) as BrainVersionFile;
  } catch {
    return null;
  }
}

export async function readBrainVersion(brainRoot: string): Promise<BrainVersion> {
  const [released, fingerprint] = await Promise.all([
    readVersionFile(brainRoot),
    fingerprintBrain(brainRoot),
  ]);
  const version = released?.version ?? 0;
  const modified = !released || released.fingerprint !== fingerprint;
  return { version, fingerprint, modified, label: modified ? `v${version}+changes` : `v${version}` };
}
