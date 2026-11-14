// Reads the brain's routing file and stage contracts.
//
// The brain is an ICM workspace (Interpretable Context Methodology,
// https://arxiv.org/abs/2603.16021). Two of its layers are read here, by code:
//   Layer 1  brain/CONTEXT.md            the Task Routing table: task -> stage
//   Layer 2  brain/stages/NN-name/CONTEXT.md   the stage contract; its Inputs
//            table decides which files a model call is given
// The model never reads either file. It only receives what a contract lists.

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** The tasks the app runs. Each needs a row in the Task Routing table. */
export const TASKS = ["checkin-parse", "daily-summary", "crew-summary", "answer"] as const;
export type Task = (typeof TASKS)[number];

/** Folders of knowledge files. Each file there carries the checked header block. */
export const CONTENT_DIRECTORIES = ["reference", "procedures", "measures"] as const;

export const STAGE_FOLDER_PATTERN = /^stages\/\d{2}-[a-z0-9-]+$/;
export const MAX_CONTEXT_LINES = 80;

export type Route = { task: string; contract: string; description: string };

export type StageInput = {
  source: string;
  /** The File/Location cell as written, without backticks. */
  location: string;
  scope: string;
  /**
   * file        a brain file sent to the model in full ("Full file")
   * code-only   a brain file that code reads and the model never sees ("Code only")
   * collection  a folder of knowledge files that code searches
   * request     supplied by the app with each request, not stored in the brain
   * unknown     the row does not follow the rules; brain:check reports it
   */
  kind: "file" | "code-only" | "collection" | "request" | "unknown";
  /** Path from the brain folder, for rows that name a brain file or folder. */
  path: string | null;
};

export type StageContract = {
  /** For example "stages/04-answer". */
  id: string;
  lineCount: number;
  sections: string[];
  inputs: StageInput[];
  /** Files sent to the model in full, in the order the Inputs table lists them. */
  files: string[];
  /** Knowledge folders this stage searches. */
  collections: string[];
  problems: string[];
};

function normalise(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** The body of a "## Heading" section, up to the next heading of the same level. */
function section(text: string, heading: string): string | null {
  const lines = normalise(text).split("\n");
  const start = lines.findIndex((line) => line.trim().toLowerCase() === `## ${heading.toLowerCase()}`);
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s/.test(line));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

/** The rows of the first markdown table in a block of text, without the header rows. */
function tableRows(text: string): string[][] {
  const rows = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .map((line) => line.replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim()));
  return rows.filter((cells, index) => index > 0 && !cells.every((cell) => /^:?-+:?$/.test(cell)));
}

function unquote(cell: string): string | null {
  const match = cell.match(/^`([^`]+)`$/);
  return match ? match[1] : null;
}

function toBrainPath(brainRoot: string, fromDirectory: string, written: string): string | null {
  const relative = path.relative(brainRoot, path.resolve(brainRoot, fromDirectory, written));
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.split(path.sep).join("/");
}

export async function readRoutes(brainRoot: string): Promise<{ routes: Route[]; problems: string[] }> {
  const problems: string[] = [];
  let text: string;
  try {
    text = await readFile(path.join(brainRoot, "CONTEXT.md"), "utf8");
  } catch {
    return { routes: [], problems: ["CONTEXT.md: missing. It holds the Task Routing table"] };
  }
  const routing = section(text, "Task Routing");
  if (routing === null) {
    return { routes: [], problems: ['CONTEXT.md: the "## Task Routing" section is missing'] };
  }
  const routes: Route[] = [];
  for (const cells of tableRows(routing)) {
    const task = unquote(cells[0] ?? "");
    const contract = unquote(cells[1] ?? "");
    if (!task || !contract) {
      problems.push(`CONTEXT.md: routing row "${cells.join(" | ")}" needs a task and a path, each in backticks`);
      continue;
    }
    routes.push({ task, contract, description: cells[2] ?? "" });
  }
  if (routes.length === 0) problems.push("CONTEXT.md: the Task Routing table has no rows");
  return { routes, problems };
}

export async function readStageContract(brainRoot: string, contractPath: string): Promise<StageContract> {
  const id = path.posix.dirname(contractPath);
  const contract: StageContract = {
    id,
    lineCount: 0,
    sections: [],
    inputs: [],
    files: [],
    collections: [],
    problems: [],
  };
  let text: string;
  try {
    text = normalise(await readFile(path.join(brainRoot, contractPath), "utf8"));
  } catch {
    contract.problems.push(`${contractPath}: missing`);
    return contract;
  }
  contract.lineCount = text.trimEnd().split("\n").length;
  contract.sections = [...text.matchAll(/^##\s+(.+)$/gm)].map((match) => match[1].trim());

  const inputs = section(text, "Inputs");
  if (inputs === null) return contract;

  for (const cells of tableRows(inputs)) {
    const [source = "", locationCell = "", scope = ""] = cells;
    const written = unquote(locationCell);
    const input: StageInput = { source, location: written ?? locationCell, scope, kind: "unknown", path: null };
    contract.inputs.push(input);

    if (written === null) {
      if (locationCell.toLowerCase() === "(request)") input.kind = "request";
      else contract.problems.push(`${contractPath}: input "${source}" must name a path in backticks, or (request)`);
      continue;
    }

    input.path = toBrainPath(brainRoot, id, written);
    if (input.path === null) {
      contract.problems.push(`${contractPath}: input "${written}" points outside the brain folder`);
      continue;
    }
    const fullPath = path.join(brainRoot, input.path);
    if (!existsSync(fullPath)) {
      contract.problems.push(`${contractPath}: input "${written}" does not exist`);
      continue;
    }

    if (statSync(fullPath).isDirectory()) {
      if (!(CONTENT_DIRECTORIES as readonly string[]).includes(input.path)) {
        contract.problems.push(
          `${contractPath}: input "${written}" is a folder, and only ${CONTENT_DIRECTORIES.join("/, ")}/ can be searched`,
        );
        continue;
      }
      input.kind = "collection";
      contract.collections.push(input.path);
    } else if (scope.toLowerCase() === "full file") {
      input.kind = "file";
      contract.files.push(input.path);
    } else if (scope.toLowerCase().startsWith("code only")) {
      input.kind = "code-only";
    } else {
      contract.problems.push(
        `${contractPath}: input "${written}" has scope "${scope}". Use "Full file" (sent to the model) or "Code only" (never sent)`,
      );
    }
  }
  return contract;
}

/** Finds the stage for a task through the routing table and reads its contract. */
export async function resolveStage(brainRoot: string, task: Task): Promise<StageContract> {
  const { routes } = await readRoutes(brainRoot);
  const route = routes.find((candidate) => candidate.task === task);
  if (!route) throw new Error(`brain/CONTEXT.md has no route for the task "${task}".`);
  const contract = await readStageContract(brainRoot, route.contract);
  if (contract.problems.length > 0) {
    throw new Error(`The stage contract for "${task}" has errors: ${contract.problems.join("; ")}. Run npm run brain:check.`);
  }
  if (contract.files.length === 0) {
    throw new Error(`The stage contract for "${task}" lists no "Full file" input, so the model would get no instructions.`);
  }
  return contract;
}
