// Checks that the brain's structure, its files and the eval question set are well formed.
// It reads files only. It never calls the model.

import { readFile, readdir } from "node:fs/promises";
import { NUMBERS_SOURCE_ID } from "./facts.ts";
import path from "node:path";
import {
  CONTENT_DIRECTORIES,
  MAX_CONTEXT_LINES,
  STAGE_FOLDER_PATTERN,
  TASKS,
  readRoutes,
  readStageContract,
} from "./stage.ts";

const REQUIRED_SECTIONS = ["Inputs", "Process", "Outputs"];
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

// The ICM structure: CLAUDE.md (map), CONTEXT.md (routing) and one contract per stage.
async function checkStructure(brainRoot: string, errors: string[], warnings: string[]) {
  const exists = (relativePath: string) =>
    readFile(path.join(brainRoot, relativePath), "utf8").then(() => true, () => false);

  if (!(await exists("CLAUDE.md"))) errors.push("CLAUDE.md: missing. It is the map of the brain folder");

  const { routes, problems } = await readRoutes(brainRoot);
  errors.push(...problems);

  for (const task of TASKS) {
    const matching = routes.filter((route) => route.task === task);
    if (matching.length === 0) errors.push(`CONTEXT.md: no route for the task "${task}", which the app runs`);
    if (matching.length > 1) errors.push(`CONTEXT.md: the task "${task}" is routed more than once`);
  }

  const routedStages = new Set<string>();
  for (const route of routes) {
    const where = route.contract;
    const stageId = path.posix.dirname(where);
    if (!(TASKS as readonly string[]).includes(route.task)) {
      warnings.push(`CONTEXT.md: the task "${route.task}" is routed, but the app has no code that runs it`);
    }
    if (path.posix.basename(where) !== "CONTEXT.md" || !STAGE_FOLDER_PATTERN.test(stageId)) {
      errors.push(`CONTEXT.md: "${where}" must look like stages/01-name/CONTEXT.md`);
      continue;
    }
    if (routedStages.has(stageId)) errors.push(`CONTEXT.md: two tasks are routed to ${stageId}. One stage does one job`);
    routedStages.add(stageId);

    const contract = await readStageContract(brainRoot, where);
    errors.push(...contract.problems);
    if (contract.lineCount === 0) continue;

    for (const name of REQUIRED_SECTIONS) {
      if (!contract.sections.includes(name)) errors.push(`${where}: the "## ${name}" section is missing`);
    }
    if (contract.sections.includes("Inputs") && contract.files.length === 0) {
      errors.push(`${where}: no input has the scope "Full file", so the model would get no instructions`);
    }
    if (route.task === "answer" && contract.collections.length === 0) {
      errors.push(`${where}: no knowledge folder is listed, so every question would be declined`);
    }
    const listed = new Set(contract.inputs.map((input) => input.path));
    for (const fullPath of await markdownFiles(path.join(brainRoot, stageId, "references"))) {
      const id = path.relative(brainRoot, fullPath).split(path.sep).join("/");
      if (!listed.has(id)) warnings.push(`${id}: no row in ${where} lists this file, so nothing reads it`);
    }
    if (contract.lineCount > MAX_CONTEXT_LINES) {
      warnings.push(`${where}: ${contract.lineCount} lines, over the ${MAX_CONTEXT_LINES} line guide. Move rules and examples into references/`);
    }
  }

  const stageFolders = await readdir(path.join(brainRoot, "stages"), { withFileTypes: true }).catch(() => []);
  for (const entry of stageFolders) {
    if (!entry.isDirectory()) continue;
    const stageId = `stages/${entry.name}`;
    if (!STAGE_FOLDER_PATTERN.test(stageId)) errors.push(`${stageId}: a stage folder is named like 01-name, in lowercase with hyphens`);
    else if (!routedStages.has(stageId)) errors.push(`${stageId}: no row in the CONTEXT.md Task Routing table points to this stage`);
  }
}

export async function checkBrain(brainRoot: string): Promise<CheckResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  await checkStructure(brainRoot, errors, warnings);

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
    let question: {
      id?: string; kind?: string; question?: string; must_cite?: string; must_include?: string[];
      must_not_include?: string[]; numbers?: string; history?: Array<{ role?: string; text?: string }>;
    };
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

    if (question.numbers !== undefined && !/^[a-z0-9-]+$/.test(String(question.numbers))) {
      errors.push(`${name}: numbers must name a fixture in web/scripts/eval-fixtures, for example "numbers-sato-sol142"`);
    }
    if (question.history !== undefined && !(Array.isArray(question.history) && question.history.every(
      (turn) => (turn.role === "user" || turn.role === "assistant") && typeof turn.text === "string",
    ))) {
      errors.push(`${name}: history must be a list of { role: "user" | "assistant", text }`);
    }

    const flagged = matchedCategories(question.question ?? "");
    if (question.kind === "answerable") {
      if (!question.must_cite) errors.push(`${name}: an answerable question needs must_cite`);
      /* the person's own numbers, worded by the app: a source that is not a brain file */
      else if (question.must_cite === NUMBERS_SOURCE_ID) {
        if (!question.numbers) errors.push(`${name}: must_cite "${NUMBERS_SOURCE_ID}" needs a numbers fixture`);
      }
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
