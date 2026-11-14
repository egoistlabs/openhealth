import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { BrainDocument } from "./types.ts";

const BRAIN_ROOT = path.join(process.cwd(), "..", "brain");
const CONTENT_DIRECTORIES = ["reference", "procedures", "measures"] as const;

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

export async function loadBrainDocuments(): Promise<BrainDocument[]> {
  const files = (
    await Promise.all(
      CONTENT_DIRECTORIES.map((directory) =>
        markdownFiles(path.join(BRAIN_ROOT, directory)),
      ),
    )
  ).flat();

  const documents = await Promise.all(
    files.map(async (file) => {
      const relativePath = path.relative(BRAIN_ROOT, file).split(path.sep).join("/");
      const content = await readFile(file, "utf8");
      return parseDocument(relativePath, content);
    }),
  );

  return documents.filter(
    (document): document is BrainDocument =>
      document !== null && document.status.toLowerCase() === "active",
  );
}

export async function loadIdentity(): Promise<string> {
  return readFile(path.join(BRAIN_ROOT, "identity", "companion.md"), "utf8");
}

export async function loadCompanionInstructions(): Promise<string> {
  return readFile(path.join(BRAIN_ROOT, "prompts", "companion.md"), "utf8");
}
