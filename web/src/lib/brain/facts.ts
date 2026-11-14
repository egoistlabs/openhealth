import { sentencesIn } from "../text.ts";
import type { ScoredDocument } from "./types.ts";

/**
 * The crew member's own numbers, already worded by the app (see
 * companionNumbers in lib/console/data.ts). Code does the maths and the
 * wording; the model is only ever handed finished sentences.
 */
export type Fact = {
  key: string;
  name: string;
  text: string;
  value: string;
  detail: string;
  action: string;
  terms: string[];
  direction: string | null;
  opposites: string[];
};

export type Facts = {
  off: Fact[];
  normal: Array<{ key: string; name: string; terms: string[] }>;
};

/** A measure that is off, as a short row on screen. Built from the numbers, never from the model's prose. */
export type AnswerRow = { key: string; label: string; value: string; detail: string };

export const NUMBERS_SOURCE_ID = "app/your-numbers";
const NUMBERS_SOURCE_TITLE = "Your numbers today";

const isString = (value: unknown): value is string => typeof value === "string";
const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Reads `numbers.facts` from the request. Anything malformed means no facts. */
export function readFacts(numbers: Record<string, unknown> | undefined): Facts | null {
  const facts = numbers?.facts;
  if (!isRecord(facts) || !Array.isArray(facts.off) || !Array.isArray(facts.normal)) return null;

  const off: Fact[] = [];
  for (const item of facts.off) {
    if (
      !isRecord(item) || !isString(item.key) || !isString(item.name) || !isString(item.text) ||
      !isString(item.value) || !isString(item.detail) || !isString(item.action) ||
      !isStrings(item.terms) || !isStrings(item.opposites) ||
      !(item.direction === null || isString(item.direction))
    ) return null;
    off.push({
      key: item.key, name: item.name, text: item.text, value: item.value, detail: item.detail,
      action: item.action, terms: item.terms, direction: item.direction, opposites: item.opposites,
    });
  }

  const normal: Facts["normal"] = [];
  for (const item of facts.normal) {
    if (!isRecord(item) || !isString(item.key) || !isString(item.name) || !isStrings(item.terms)) return null;
    normal.push({ key: item.key, name: item.name, terms: item.terms });
  }

  return { off, normal };
}

/* Routing only: the model never sees these lists.
   A status question asks how the person is doing ("Anything I should watch?").
   Code can always answer it from the numbers, so it never ends in a decline.
   A topic question only mentions a measure ("How many hours should I sleep?").
   The numbers are offered as a source, but the model may still decline. */
const STATUS_WORDS = new Set([
  "watch", "number", "measure", "metric", "flag", "alert", "baseline", "doing",
  "trend", "status", "summary", "okay", "worry", "concern",
]);
const STATUS_PHRASE = /\bhow (did|do|was|is|am|are) (i|my)\b/i;
const TOPIC_WORDS = new Set([
  "normal", "today", "week", "sleep", "slept", "tired", "reaction", "mood",
  "workload", "stress", "teamwork", "engagement", "check-in", "checkin",
]);

const words = (text: string): string[] =>
  text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter(Boolean);
const singular = (word: string) => word.replace(/s$/, "");
const has = (text: string, terms: string[]) => {
  const present = new Set(words(text).map(singular));
  return terms.some((term) => present.has(singular(term)));
};

const hasWord = (question: string, list: Set<string>) =>
  words(question).some((word) => list.has(word) || list.has(singular(word)));

/** True when the question asks how the person is doing. Code can answer it from the numbers alone. */
export function isStatusQuestion(question: string): boolean {
  return STATUS_PHRASE.test(question) || hasWord(question, STATUS_WORDS);
}

/** True when the question is about the person's own numbers, so it needs no knowledge file to match. */
export function isNumbersQuestion(question: string): boolean {
  return isStatusQuestion(question) || hasWord(question, TOPIC_WORDS);
}

/** The facts as the text the model is given. */
export function factsText(facts: Facts): string {
  if (facts.off.length === 0) {
    return "Nothing is off your normal today. Every measure with a baseline is within your normal.";
  }
  return [
    "Off your normal today:",
    ...facts.off.map((fact) => `- ${fact.text}`),
    ...(facts.normal.length
      ? [`Within your normal: ${facts.normal.map((measure) => measure.name.toLowerCase()).join(", ")}.`]
      : []),
  ].join("\n");
}

/** The facts as one more source the model can cite. */
export function numbersSource(facts: Facts, sol: unknown): ScoredDocument {
  return {
    id: NUMBERS_SOURCE_ID,
    title: NUMBERS_SOURCE_TITLE,
    topic: "measure",
    keywords: [],
    source: "This app, from your own check-ins",
    authorisedBy: "the app, which worked them out",
    added: typeof sol === "number" ? `Sol ${sol}` : "today",
    status: "active",
    body: factsText(facts),
    score: 0,
  };
}

const toRow = (fact: Fact): AnswerRow => ({
  key: fact.key, label: fact.name, value: fact.value, detail: fact.detail,
});

/** The off measures an answer talks about. `all` is the fallback when it names none. */
export function rowsFor(facts: Facts, answer: string, all: boolean): { rows: AnswerRow[]; action: string | null } {
  const mentioned = facts.off.filter((fact) => has(answer, fact.terms));
  const shown = mentioned.length ? mentioned : all ? facts.off : [];
  return { rows: shown.map(toRow), action: shown[0]?.action ?? null };
}

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven"];
const joinList = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

/**
 * The reply code writes from the numbers alone. Used when the model's answer
 * to a numbers question fails a check, so the person still gets a correct one.
 */
export function codeReply(facts: Facts, question: string): { message: string; rows: AnswerRow[]; action: string | null } {
  if (facts.off.length === 0) {
    return { message: "Nothing is off your normal today.", rows: [], action: null };
  }

  const asked = facts.off.filter((fact) => has(question, fact.terms));
  if (asked.length) {
    const shown = asked.slice(0, 2);
    return { message: shown.map((fact) => fact.text).join(" "), rows: shown.map(toRow), action: shown[0].action };
  }

  const askedNormal = facts.normal.filter((measure) => has(question, measure.terms));
  if (askedNormal.length) {
    return { message: `${askedNormal[0].name} is within your normal.`, rows: [], action: null };
  }

  const count = facts.off.length;
  const names = joinList(facts.off.map((fact) => fact.name.toLowerCase()));
  return {
    message: `${NUMBER_WORDS[count] ?? count} ${count === 1 ? "thing is" : "things are"} off your normal: ${names}.`,
    rows: facts.off.map(toRow),
    action: facts.off[0].action,
  };
}

/**
 * A change stated backwards: a clause that names a measure and uses the
 * opposite of the direction the app worked out ("faster" for a slower
 * reaction time), without the right word anywhere in that clause.
 */
export function reversedDirections(facts: Facts, answer: string): string[] {
  const reversed: string[] = [];
  const clauses = sentencesIn(answer).flatMap((sentence) => sentence.split(/,|;|\band\b|\bbut\b/i));
  for (const fact of facts.off) {
    if (!fact.direction) continue;
    for (const clause of clauses) {
      if (!has(clause, fact.terms)) continue;
      const wrong = fact.opposites.find((opposite) => has(clause, [opposite]));
      if (wrong && !has(clause, [fact.direction])) {
        reversed.push(`${fact.name}: said "${wrong}", the numbers say "${fact.direction}"`);
        break;
      }
    }
  }
  return reversed;
}

/**
 * An answer from the numbers that talks about the wrong measures: it names one
 * that is within normal, or names none of the ones that are off. A 4B model
 * does this when it copies an example or an earlier turn instead of the facts.
 */
export function wrongMeasures(facts: Facts, answer: string): string[] {
  const offTerms = new Set(facts.off.flatMap((fact) => fact.terms));
  const problems = facts.normal
    .filter((measure) => has(answer, measure.terms.filter((term) => !offTerms.has(term))))
    .map((measure) => `${measure.name} is within normal`);
  if (facts.off.length > 0 && !facts.off.some((fact) => has(answer, fact.terms))) {
    problems.push("Names none of the measures that are off");
  }
  return problems;
}
