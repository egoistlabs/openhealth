// Checks that the brain files and the eval question set are well formed.
// It reads files only. It never calls the model.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const CONTENT_DIRECTORIES = ["reference", "procedures", "measures"];
const REQUIRED_FIELDS = ["title", "topic", "keywords", "source", "authorised_by", "added", "status"];
const MAX_WORDS = 400;

export type CheckResult = { errors: string[]; warnings: string[] };

type ContentFile = { id: string; fields: Map<string, string>; body: string };

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return markdownFiles(fullPath);
      return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
    }),
  );
  return nested.flat();
}

export async function checkBrain(brainRoot: string): Promise<CheckResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Content files
  const files = new Map<string, ContentFile>();
  for (const directory of CONTENT_DIRECTORIES) {
    for (const fullPath of await markdownFiles(path.join(brainRoot, directory))) {
      const id = path.relative(brainRoot, fullPath).split(path.sep).join("/");
      const text = (await readFile(fullPath, "utf8")).replace(/\r\n/g, "\n");
      const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!match) {
        errors.push(`${id}: the header block (between --- lines) is missing`);
        continue;
      }
      const fields = new Map<string, string>();
      for (const line of match[1].split("\n")) {
        const field = line.match(/^([a-z_]+):\s*(.*)$/i);
        if (field) fields.set(field[1], field[2].trim());
      }
      files.set(id, { id, fields, body: match[2].trim() });

      for (const name of REQUIRED_FIELDS) {
        if (!fields.get(name)) errors.push(`${id}: header field "${name}" is missing or empty`);
      }
      if (fields.get("keywords") === "[]") errors.push(`${id}: keywords is empty, so search cannot find this file`);
      const status = fields.get("status");
      if (status && status !== "active" && status !== "replaced") {
        errors.push(`${id}: status must be "active" or "replaced", not "${status}"`);
      }
      const added = fields.get("added");
      if (added && !/^\d{4}-\d{2}-\d{2}$/.test(added)) errors.push(`${id}: added must be a date like 2026-11-14`);
      const wordCount = match[2].trim().split(/\s+/).filter(Boolean).length;
      if (wordCount === 0) errors.push(`${id}: the file has no content`);
      if (wordCount > MAX_WORDS) warnings.push(`${id}: ${wordCount} words, over the ${MAX_WORDS} word guide. Consider splitting it`);
    }
  }

  for (const file of files.values()) {
    const replaces = file.fields.get("replaces");
    if (!replaces) continue;
    const target = files.get(replaces);
    if (!target) errors.push(`${file.id}: replaces "${replaces}", which does not exist. Use the path from the brain folder, like reference/sleep/old-file.md`);
    else if (target.fields.get("status") !== "replaced") {
      errors.push(`${file.id}: replaces "${replaces}", but that file is still active. Set its status to replaced`);
    }
  }

  const activeIds = new Set(
    [...files.values()].filter((file) => file.fields.get("status") === "active").map((file) => file.id),
  );

  // Red flags
  let redFlagTerms: Array<{ id: string; terms: string[] }> = [];
  try {
    const config = JSON.parse(await readFile(path.join(brainRoot, "safety", "red-flags.json"), "utf8"));
    if (!config.escalation_message) errors.push("safety/red-flags.json: escalation_message is missing");
    redFlagTerms = config.categories ?? [];
    if (redFlagTerms.length === 0) errors.push("safety/red-flags.json: there are no categories");
    for (const category of redFlagTerms) {
      if (!category.terms?.length) errors.push(`safety/red-flags.json: category "${category.id}" has no terms`);
    }
  } catch {
    errors.push("safety/red-flags.json: missing or not valid JSON");
  }
  const matchedCategories = (question: string) => {
    const lowered = question.toLowerCase().replace(/\s+/g, " ");
    return redFlagTerms
      .filter((category) => (category.terms ?? []).some((term) => lowered.includes(term.toLowerCase())))
      .map((category) => category.id);
  };

  // Eval questions
  const seenIds = new Set<string>();
  const citedFiles = new Set<string>();
  const testedCategories = new Set<string>();
  let lines: string[] = [];
  try {
    lines = (await readFile(path.join(brainRoot, "evals", "questions.jsonl"), "utf8")).split(/\r?\n/);
  } catch {
    errors.push("evals/questions.jsonl: missing");
  }
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const where = `evals/questions.jsonl line ${index + 1}`;
    let question: { id?: string; kind?: string; question?: string; must_cite?: string; must_include?: string[] };
    try {
      question = JSON.parse(line);
    } catch {
      errors.push(`${where}: not valid JSON`);
      return;
    }
    const name = question.id ? `${where} (${question.id})` : where;
    if (!question.id) errors.push(`${where}: id is missing`);
    else if (seenIds.has(question.id)) errors.push(`${name}: this id is used twice`);
    else seenIds.add(question.id);
    if (!question.question?.trim()) errors.push(`${name}: question is missing`);

    const flagged = matchedCategories(question.question ?? "");
    if (question.kind === "answerable") {
      if (!question.must_cite) errors.push(`${name}: an answerable question needs must_cite`);
      else if (!files.has(question.must_cite)) errors.push(`${name}: must_cite "${question.must_cite}" does not exist`);
      else if (!activeIds.has(question.must_cite)) errors.push(`${name}: must_cite "${question.must_cite}" is a replaced file`);
      else citedFiles.add(question.must_cite);
      if (!question.must_include?.length) errors.push(`${name}: an answerable question needs at least one must_include fact`);
      if (flagged.length) errors.push(`${name}: the question contains a red-flag term, so it will be escalated and can never be answered`);
    } else if (question.kind === "decline") {
      if (flagged.length) errors.push(`${name}: the question contains a red-flag term, so it tests escalation, not declining`);
    } else if (question.kind === "red-flag") {
      if (flagged.length === 0) errors.push(`${name}: the question matches no red-flag term, so this test cannot pass`);
      flagged.forEach((category) => testedCategories.add(category));
    } else {
      errors.push(`${name}: kind must be answerable, decline or red-flag`);
    }
  });

  for (const id of [...activeIds].sort()) {
    if (!citedFiles.has(id)) warnings.push(`${id}: no eval question tests this file`);
  }
  for (const category of redFlagTerms) {
    if (!testedCategories.has(category.id)) warnings.push(`safety/red-flags.json: no eval question tests the "${category.id}" category`);
  }

  return { errors, warnings };
}
