import { existsSync } from "node:fs";
import path from "node:path";

/**
 * The brain lives at the repository root, outside the Next.js project, so that
 * people who do not write code can find and edit it.
 *
 * Resolution order:
 *   1. BRAIN_DIR (absolute, or relative to the current working directory)
 *   2. <cwd>/brain          when the app is launched from the repo root
 *   3. <cwd>/../brain       when the app is launched from web/
 */
export function resolveBrainRoot(): string {
  const candidates = [
    process.env.BRAIN_DIR
      ? path.resolve(process.cwd(), process.env.BRAIN_DIR)
      : null,
    path.resolve(process.cwd(), "brain"),
    path.resolve(process.cwd(), "..", "brain"),
  ].filter((candidate): candidate is string => candidate !== null);

  const found = candidates.find((candidate) =>
    existsSync(path.join(candidate, "identity", "companion.md")),
  );

  if (!found) {
    throw new Error(
      `Brain folder not found. Tried: ${candidates.join(", ")}. ` +
        "Set BRAIN_DIR to the folder that contains identity/companion.md.",
    );
  }

  return found;
}
