import { loadBrainDocuments, loadStage } from "./loader.ts";
import { checkRedFlags } from "./safety.ts";
import { searchBrain } from "./search.ts";
import { buildAnswerMessages } from "./prompt.ts";
import {
  codeReply,
  isNumbersQuestion,
  isStatusQuestion,
  numbersSource,
  NUMBERS_SOURCE_ID,
  readFacts,
  reversedDirections,
  rowsFor,
  wrongMeasures,
  type AnswerRow,
  type Facts,
} from "./facts.ts";
import { numbersIn, sentencesIn } from "../text.ts";
import type { ChatTurn, ScoredDocument } from "./types.ts";

export const DECLINE_MESSAGE = "I don't have that on board.";

/* An answer is at most this long. Longer ones are cut to the first sentences. */
export const MAX_SENTENCES = 3;
export const MAX_WORDS = 70;

export type CompanionAnswer = {
  can_answer: boolean;
  message: string;
  model: string | null;
  sources: Array<{
    id: string;
    title: string;
    source: string;
    added: string;
    authorised_by: string;
  }>;
  escalation: { required: boolean; categories?: string[] };
  /** Who wrote `message`: the model (checked by code), or code alone. */
  origin: "model" | "code";
  /** The measures that are off, as short rows built from the numbers. */
  rows: AnswerRow[];
  /** The one suggested action, from the app. */
  action: string | null;
};

export type AuditCheck = { check: string; pass: boolean; detail?: string };

export type ParsedAnswer = { can_answer: boolean; answer: string; sources_used: string[] };

export type AnswerOutcome =
  | "answered"
  | "answered_by_code"
  | "declined_by_model"
  | "declined_by_audit"
  | "unparseable";

/** What a turn was answered from, kept from prepare to the checks. */
export type TurnContext = {
  question: string;
  /** Everything the model may cite: the matching knowledge files, then the numbers when the question is about them. */
  sources: ScoredDocument[];
  facts: Facts | null;
  /** The numbers were offered as a source. */
  numbersQuestion: boolean;
  /** The question asks how the person is doing, so a failed answer falls back to the code-written reply. */
  statusQuestion: boolean;
};

const normalise = (sentence: string) => sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Sentences that already appeared earlier in the text, whole. */
export function repeatedSentences(text: string): string[] {
  const seen = new Set<string>();
  const repeats: string[] = [];
  for (const sentence of sentencesIn(text)) {
    const key = normalise(sentence);
    if (!key) continue;
    if (seen.has(key)) repeats.push(sentence);
    seen.add(key);
  }
  return repeats;
}

function withoutRepeats(text: string): string {
  const seen = new Set<string>();
  return sentencesIn(text)
    .filter((sentence) => {
      const key = normalise(sentence);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(" ");
}

/* Our own prompt showing through in the answer, or a decline inside an answer. */
const PROMPT_ECHO = /crew numbers?|source id|application-computed|sources_used|can_answer|app\/your-numbers|[[\]{}<>]|don't have that on board/i;
const THIRD_PERSON = /\bthe companion\b|\bthe crew member\b/i;
const ENFORCED = [
  "sources_are_real",
  "no_invented_numbers",
  "direction_matches_numbers",
  "only_measures_that_are_off",
  "no_prompt_echo",
];

function toSources(answer: ParsedAnswer, context: TurnContext): CompanionAnswer["sources"] {
  return context.sources
    .filter((source) => answer.sources_used.includes(source.id))
    .map(({ id, title, source, added, authorisedBy }) => ({
      id, title, source, added, authorised_by: authorisedBy,
    }));
}

function decline(model: string | null): CompanionAnswer {
  return {
    can_answer: false,
    message: DECLINE_MESSAGE,
    model,
    sources: [],
    escalation: { required: false },
    origin: "code",
    rows: [],
    action: null,
  };
}

type Finalized = { answer: CompanionAnswer; audit: AuditCheck[]; outcome: AnswerOutcome };

/**
 * The authoritative answer, after the model's output has been parsed. Every
 * check is a row of the Audit table in brain/stages/04-answer/CONTEXT.md.
 *
 * Two checks repair the text (a repeated sentence is dropped, a long answer is
 * cut). The rest reject it. A rejected answer to a question about how the
 * person is doing falls back to the reply code writes from their numbers; any
 * other rejected answer is the decline message.
 */
export function finalizeCompanionAnswer(
  parsed: ParsedAnswer | null,
  context: TurnContext,
  model: string | null,
  /** Set when the output was cut short and `parsed` holds only its finished sentences. */
  cutShort?: string,
): Finalized {
  const audit: AuditCheck[] = [];

  const fallback = (outcome: AnswerOutcome): Finalized => {
    if (!context.facts || !context.statusQuestion) return { answer: decline(model), audit, outcome };
    const reply = codeReply(context.facts, context.question);
    const source = context.sources.find((item) => item.id === NUMBERS_SOURCE_ID);
    return {
      answer: {
        can_answer: true,
        message: reply.message,
        model,
        sources: source
          ? [{ id: source.id, title: source.title, source: source.source, added: source.added, authorised_by: source.authorisedBy }]
          : [],
        escalation: { required: false },
        origin: "code",
        rows: reply.rows,
        action: reply.action,
      },
      audit: [...audit, { check: "fallback", pass: true, detail: `Code-written reply used (${outcome})` }],
      outcome: "answered_by_code",
    };
  };

  if (!parsed) {
    audit.push({ check: "shape", pass: false, detail: "Not valid JSON in the required shape" });
    return fallback("unparseable");
  }
  audit.push({
    check: "shape",
    pass: !cutShort,
    ...(cutShort ? { detail: `${cutShort}. Kept the finished sentences` } : {}),
  });
  if (!parsed.can_answer) return fallback("declined_by_model");

  /* Repairs first: the remaining checks run on the text the person would get. */
  let text = parsed.answer.trim();
  const repeats = repeatedSentences(text);
  audit.push({
    check: "no_repeated_sentence",
    pass: repeats.length === 0,
    ...(repeats.length ? { detail: `Dropped ${repeats.length} repeated sentence${repeats.length === 1 ? "" : "s"}` } : {}),
  });
  if (repeats.length) text = withoutRepeats(text);

  const sentences = sentencesIn(text);
  const tooMany = sentences.length > MAX_SENTENCES;
  if (tooMany) text = sentences.slice(0, MAX_SENTENCES).join(" ");
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const stillTooLong = wordCount > MAX_WORDS;
  audit.push({
    check: "length",
    pass: !tooMany && !stillTooLong,
    ...(stillTooLong
      ? { detail: `${wordCount} words, the limit is ${MAX_WORDS}` }
      : tooMany
        ? { detail: `${sentences.length} sentences, kept the first ${MAX_SENTENCES}` }
        : {}),
  });

  const sourceIds = new Set(context.sources.map((source) => source.id));
  const unknown = parsed.sources_used.filter((source) => !sourceIds.has(source));
  audit.push({
    check: "sources_are_real",
    pass: text.length > 0 && parsed.sources_used.length > 0 && unknown.length === 0,
    ...(!text
      ? { detail: "Empty answer" }
      : parsed.sources_used.length === 0
        ? { detail: "No source cited" }
        : unknown.length
          ? { detail: `Not in the request: ${unknown.join(", ")}` }
          : {}),
  });

  /* The numbers source's body is the worded facts, so one set covers both. */
  const allowedNumbers = new Set(numbersIn(context.sources.map((source) => source.body).join("\n")));
  /* A 4B model restates a negative delta in words: "-0.9" becomes "0.9 hours
     less than normal". The magnitude is grounded, so an unsigned number in the
     answer passes when its magnitude is allowed. Invented magnitudes still fail. */
  const allowedMagnitudes = new Set([...allowedNumbers].map((n) => n.replace(/^-/, "")));
  const invented = [...numbersIn(text)].filter(
    (number) => !allowedNumbers.has(number) && !allowedMagnitudes.has(number),
  );
  audit.push({
    check: "no_invented_numbers",
    pass: invented.length === 0,
    ...(invented.length ? { detail: `Not in a source: ${invented.join(", ")}` } : {}),
  });

  const usesNumbers = parsed.sources_used.includes(NUMBERS_SOURCE_ID);
  const aboutNumbers = context.facts !== null && (usesNumbers || context.numbersQuestion);
  const reversed = context.facts && aboutNumbers ? reversedDirections(context.facts, text) : [];
  audit.push({
    check: "direction_matches_numbers",
    pass: reversed.length === 0,
    ...(reversed.length ? { detail: reversed.join("; ") } : {}),
  });

  const wrong = context.facts && usesNumbers ? wrongMeasures(context.facts, text) : [];
  audit.push({
    check: "only_measures_that_are_off",
    pass: wrong.length === 0,
    ...(wrong.length ? { detail: wrong.join("; ") } : {}),
  });

  const echo = PROMPT_ECHO.exec(text);
  audit.push({
    check: "no_prompt_echo",
    pass: !echo,
    ...(echo ? { detail: `Found "${echo[0]}"` } : {}),
  });

  /* Recorded, not enforced: the knowledge files themselves say "the companion". */
  const third = THIRD_PERSON.exec(text);
  audit.push({
    check: "first_person (not enforced)",
    pass: !third,
    ...(third ? { detail: `Found "${third[0]}"` } : {}),
  });

  if (stillTooLong || audit.some((check) => ENFORCED.includes(check.check) && !check.pass)) {
    return fallback("declined_by_audit");
  }

  const shown = context.facts && aboutNumbers
    ? rowsFor(context.facts, text, usesNumbers)
    : { rows: [], action: null };

  return {
    answer: {
      can_answer: true,
      message: text,
      model,
      sources: toSources(parsed, context),
      escalation: { required: false },
      origin: "model",
      rows: shown.rows,
      action: shown.action,
    },
    audit,
    outcome: "answered",
  };
}

export type CompanionAnswerInput = {
  question: string;
  numbers?: Record<string, unknown>;
  history?: ChatTurn[];
  tone?: "gentle" | "direct";
};

/* What code did before the model, kept for the turn log. */
export type TurnTrace = {
  stage: string | null;
  searchQuery: string | null;
  found: Array<{ id: string; score: number }>;
  redFlagCategories: string[];
  numbersQuestion: boolean;
  statusQuestion: boolean;
};

/* Everything needed to run one grounded turn, or an answer that needs no
   model call (red flag, nothing relevant on board). */
export type PreparedTurn =
  | { immediate: CompanionAnswer; trace: TurnTrace }
  | {
      trace: TurnTrace;
      context: TurnContext;
      messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    };

export async function prepareCompanionTurn(
  input: CompanionAnswerInput,
): Promise<PreparedTurn> {
  const { question, numbers = {}, history = [], tone = "gentle" } = input;
  const redFlag = await checkRedFlags(question);
  if (redFlag.matched) {
    return {
      immediate: {
        can_answer: false,
        message: redFlag.escalationMessage,
        model: null,
        sources: [],
        escalation: { required: true, categories: redFlag.categories },
        origin: "code",
        rows: [],
        action: null,
      },
      trace: { stage: null, searchQuery: null, found: [], redFlagCategories: redFlag.categories, numbersQuestion: false, statusQuestion: false },
    };
  }

  const stage = await loadStage("answer");
  const documents = await loadBrainDocuments(stage.collections);
  /* Retrieval sees the recent user turns as well, so short follow-ups like
     "why?" still find the right sources. The model's own question stays
     standalone; only the search query is widened. */
  const retrievalQuery = [
    ...history.filter((turn) => turn.role === "user").map((turn) => turn.text),
    question,
  ].join(" ");
  const found = searchBrain(retrievalQuery, documents);

  /* A question about the person's own numbers needs no knowledge file to
     match: the numbers, worded by the app, are a source of their own. */
  const facts = readFacts(numbers);
  const numbersQuestion = facts !== null && isNumbersQuestion(question);
  const statusQuestion = numbersQuestion && isStatusQuestion(question);
  const sources = numbersQuestion && facts ? [...found, numbersSource(facts, numbers.sol)] : found;

  const trace: TurnTrace = {
    stage: stage.id,
    searchQuery: retrievalQuery,
    found: found.map(({ id, score }) => ({ id, score })),
    redFlagCategories: [],
    numbersQuestion,
    statusQuestion,
  };
  if (sources.length === 0) return { immediate: decline(null), trace };

  return {
    trace,
    context: { question, sources, facts, numbersQuestion, statusQuestion },
    messages: buildAnswerMessages({
      context: stage.context,
      sources,
      question,
      /* An earlier decline is not something to build on: a 4B model copies it into the next answer. */
      history: history.filter((turn) => !(turn.role === "assistant" && turn.text.trim() === DECLINE_MESSAGE)),
      tone,
    }),
  };
}

/** One question in, one checked answer out, through the same model call the app makes. */
export async function answerQuestion(input: CompanionAnswerInput): Promise<CompanionAnswer> {
  const { runCompanionTurn } = await import("./turn.ts");
  const { answer } = await runCompanionTurn(input);
  if (!answer) throw new Error("The turn ended without an answer.");
  return answer;
}
