import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { resolveBrainRoot } from "./root.ts";
import { CONTENT_DIRECTORIES, resolveStage, type Task } from "./stage.ts";
import type { BrainDocument } from "./types.ts";

function brainRoot(): string {
  return resolveBrainRoot();
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  const match = value.trim().match(/^\[(.*)\]$/);
  if (!match) return [value.trim()];
  return match[1]
    .split(",")
    .map((item) => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function parseDocument(id: string, text: string): BrainDocument | null {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;

  const fields = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (field) fields.set(field[1], field[2].trim());
  }

  const title = fields.get("title");
  if (!title) return null;

  return {
    id,
    title,
    topic: fields.get("topic") ?? "",
    keywords: parseList(fields.get("keywords")),
    source: fields.get("source") ?? "",
    authorisedBy: fields.get("authorised_by") ?? "",
    added: fields.get("added") ?? "",
    status: fields.get("status") ?? "",
    body: match[2].trim(),
  };
}

async function markdownFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(fullPath);
      return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

/** The active knowledge files in the given folders. A stage passes the folders its contract lists. */
export async function loadBrainDocuments(
  directories: readonly string[] = CONTENT_DIRECTORIES,
): Promise<BrainDocument[]> {
  const root = brainRoot();
  const files = (
    await Promise.all(
      directories.map((directory) =>
        markdownFiles(path.join(root, directory)),
      ),
    )
  ).flat();

  const documents = await Promise.all(
    files.map(async (file) => {
      const relativePath = path.relative(root, file).split(path.sep).join("/");
      const content = await readFile(file, "utf8");
      return parseDocument(relativePath, content);
    }),
  );

  return documents.filter(
    (document): document is BrainDocument =>
      document !== null && document.status.toLowerCase() === "active",
  );
}

export type LoadedStage = {
  /** For example "stages/04-answer". */
  id: string;
  /** The files the model is given in full, in the order the stage's Inputs table lists them. */
  context: string[];
  /** The knowledge folders the stage searches. */
  collections: string[];
};

/**
 * Loads what a task's model call is given. The task is routed through
 * brain/CONTEXT.md to its stage, and the stage's CONTEXT.md Inputs table
 * decides which files are read. Nothing else from the brain reaches the model.
 */
export async function loadStage(task: Task): Promise<LoadedStage> {
  const root = brainRoot();
  const stage = await resolveStage(root, task);
  const context = await Promise.all(
    stage.files.map((file) => readFile(path.join(root, file), "utf8")),
  );
  return { id: stage.id, context, collections: stage.collections };
}
