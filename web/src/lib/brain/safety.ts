import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveBrainRoot } from "./root.ts";
import { classifierEnabled, classifyIntent, type IntentClassification } from "./classify.ts";

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

/** What the model's classifier added to the keyword checks, for the turn log. */
export type ClassifierTrace =
  | { ran: false; reason: "disabled" | "not-needed" }
  | { ran: true; ok: true; classification: IntentClassification; model: string; ms: number }
  | { ran: true; ok: false; error: string; ms: number };

export type Screening = {
  redFlag: { matched: boolean; categories: string[]; escalationMessage: string };
  boundary: { matched: boolean; categories: string[] };
  support: { matched: boolean; terms: string[]; supportMessage: string };
  classifier: ClassifierTrace;
};

/**
 * All three safety checks for one message, in two layers:
 *
 * 1. Keywords (red-flags.json, boundaries.json, support.json). Deterministic,
 *    instant, and they work with the model switched off.
 * 2. The model, asked for a typed label (see classify.ts). It catches the same
 *    intent said in words nobody listed.
 *
 * A flag from either layer counts. The model can add a flag but never remove
 * one, and if it fails the keyword result stands. Model categories are marked
 * "model:" so the turn log shows which layer caught what.
 */
export async function screenMessage(message: string): Promise<Screening> {
  const useModel = classifierEnabled();
  const [redFlag, boundary, support] = await Promise.all([
    checkRedFlags(message),
    checkBoundaries(message),
    checkSupportNeeded(message),
  ]);
  /* A keyword red flag already decides the turn: no need to wait on the model. */
  if (!useModel || redFlag.matched) {
    return { redFlag, boundary, support, classifier: { ran: false, reason: useModel ? "not-needed" : "disabled" } };
  }

  const result = await classifyIntent(message);
  if (!result.ok) {
    return { redFlag, boundary, support, classifier: { ran: true, ok: false, error: result.error, ms: result.ms } };
  }
  const { emergency, distress, boundary: boundaryLabel } = result.classification;
  const add = (list: string[], label: string) => (list.includes(label) ? list : [...list, label]);
  return {
    redFlag:
      emergency === "none"
        ? redFlag
        : { ...redFlag, matched: true, categories: add(redFlag.categories, `model:${emergency}`) },
    boundary:
      boundaryLabel === "none"
        ? boundary
        : { matched: true, categories: add(boundary.categories, `model:${boundaryLabel}`) },
    support: distress ? { ...support, matched: true, terms: add(support.terms, "model:distress") } : support,
    classifier: { ran: true, ok: true, classification: result.classification, model: result.model, ms: result.ms },
  };
}
