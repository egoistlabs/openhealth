import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveBrainRoot } from "./root.ts";

type RedFlagConfiguration = {
  escalation_message: string;
  categories: Array<{ id: string; terms: string[] }>;
};

type SupportConfiguration = {
  support_message: string;
  terms: string[];
};

/** A reply that points the person to someone who can help. */
export const NAMES_A_PERSON =
  /medical officer|flight surgeon|crew ?mate|commander|mission support|support (team|person)|medical (team|professional)|behaviou?ral[- ]health/i;

const normalize = (message: string) => message.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");

async function readSafetyFile<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(resolveBrainRoot(), "safety", name), "utf8")) as T;
}

export async function checkRedFlags(
  message: string,
): Promise<{ matched: boolean; categories: string[]; escalationMessage: string }> {
  const configuration = await readSafetyFile<RedFlagConfiguration>("red-flags.json");
  const normalizedMessage = normalize(message);
  const categories = configuration.categories
    .filter((category) =>
      category.terms.some((term) => normalizedMessage.includes(term.toLowerCase())),
    )
    .map((category) => category.id);

  return {
    matched: categories.length > 0,
    categories,
    escalationMessage: configuration.escalation_message,
  };
}

type BoundaryConfiguration = {
  categories: Array<{ id: string; patterns: string[] }>;
};

/**
 * Requests the companion refuses whatever the model would say: to role-play,
 * to drop its rules, or to report another crew member's words or ratings.
 * Checked by code before the model is called, like a red flag.
 */
export async function checkBoundaries(message: string): Promise<{ matched: boolean; categories: string[] }> {
  const configuration = await readSafetyFile<BoundaryConfiguration>("boundaries.json");
  const normalizedMessage = normalize(message);
  const categories = configuration.categories
    .filter((category) => category.patterns.some((pattern) => new RegExp(pattern, "i").test(normalizedMessage)))
    .map((category) => category.id);
  return { matched: categories.length > 0, categories };
}

/**
 * Signs of serious distress that are not an emergency. They do not stop the
 * turn, but whatever the companion replies must name a person to talk to.
 */
export async function checkSupportNeeded(
  message: string,
): Promise<{ matched: boolean; terms: string[]; supportMessage: string }> {
  const configuration = await readSafetyFile<SupportConfiguration>("support.json");
  const normalizedMessage = normalize(message);
  const terms = configuration.terms.filter((term) => normalizedMessage.includes(term.toLowerCase()));
  return { matched: terms.length > 0, terms, supportMessage: configuration.support_message };
}
