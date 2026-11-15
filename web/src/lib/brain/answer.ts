import { loadBrainDocuments, loadStage } from "./loader.ts";
import { NAMES_A_PERSON, screenMessage, type ClassifierTrace } from "./safety.ts";
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
import type { ReplyKind } from "../llm/schema.ts";
import type { ChatTurn, ScoredDocument } from "./types.ts";

export const DECLINE_MESSAGE = "I don't have that on board.";

/* An answer is at most this long. Longer ones are cut to the first sentences. */
export const MAX_SENTENCES = 3;
export const MAX_WORDS = 70;

export type CompanionAnswer = {
  /** True when the companion replied to the person: an answer or a conversational reply. */
  can_answer: boolean;
  /**
   * answer        information from the sources, checked against them
   * conversation  a reply with no facts in it, checked for having none
   * support       code's fixed reply to serious distress, naming a person to talk to
   * decline       code's fixed decline
   * escalation    code's fixed red-flag message
   */
  kind: ReplyKind | "support" | "escalation";
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

export type ParsedAnswer = { kind: ReplyKind; answer: string; sources_used: string[] };

export type AnswerOutcome =
  | "answered"
  | "conversed"
  | "answered_by_code"
  | "support_by_code"
  | "declined_by_model"
  | "declined_by_audit"
  | "declined_by_boundary"
  | "unparseable";

/** What a turn was answered from, kept from prepare to the checks. */
export type TurnContext = {
  question: string;
  /** Everything the model may cite: the matching knowledge files, then the numbers when the question is about them. Can be empty. */
  sources: ScoredDocument[];
  facts: Facts | null;
  /** The numbers were offered as a source. */
  numbersQuestion: boolean;
  /** The question asks how the person is doing, so a failed answer falls back to the code-written reply. */
  statusQuestion: boolean;
  /** The message shows serious distress, so the reply must name a person; this is code's reply if it does not. */
  supportMessage: string | null;
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
const PROMPT_ECHO = /crew numbers?|source id|application-computed|sources_used|can_answer|"kind"|app\/your-numbers|[[\]{}<>]|don't have that on board/i;
const THIRD_PERSON = /\bthe companion\b|\bthe crew member\b/i;

/* A conversational reply has no source behind it, so it may carry no content
   that would need one. These are the kinds of content it must not carry. */
const CLINICAL = /\b(diagnos\w*|prescri\w*|dos(e|es|age|ing)|mg|mcg|milligrams?|micrograms?|tablets?|pills?|capsules?|medicat\w*|medicine|melatonin|zolpidem|ambien|modafinil|ibuprofen|paracetamol|acetaminophen|aspirin|antidepressants?|sedatives?|disorder|depression|insomnia|ptsd|adhd|bipolar|syndrome|symptoms? of)\b/i;
/* Reporting what someone else said, felt or rated: the companion never knows this. */
const ABOUT_OTHERS = /\b(?:he|she|they|your crewmates?|(?!(?:You|I|We|It|That|This|There|What|Which|Who)\b)[A-Z][a-z]+)\s+(?:has |have |had )?(?:told me|said|mentioned|reported|rated|confided|feels|felt|thinks|thought)\b/;
/* Speaking as someone it is not, which is what a role-play request asks for. */
const ROLE_CLAIM = /\bI(?:'m| am)\s+(?!not\b)(?:your |a |an |the )?(doctor|physician|surgeon|flight surgeon|nurse|therapist|psychologist|psychiatrist|counsell?or|medical officer|commander|wife|husband|partner|girlfriend|boyfriend|mother|father|mom|mum|dad|son|daughter|brother|sister|friend from home|human)\b/i;
/* Taking a name other than its own ("I'm Maria"). The name is the one in brain/identity/companion.md. */
const NAME_CLAIM = /\bI(?:'m| am)\s+(?!Pedro\b)[A-Z][a-z]+\b/;
/* A number in a reply with no source could only be made up. Number words too
   ("one" is left out: "one of the hardest parts" is not a quantity). */
const NUMBER_WORDS = /\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|hundred|thousand|percent)\b/i;

const ANSWER_ENFORCED = [
  "sources_are_real",
  "no_claims_about_others",
  "stays_in_role",
  "no_invented_numbers",
  "direction_matches_numbers",
  "only_measures_that_are_off",
  "no_prompt_echo",
  "names_a_person_when_needed",
];
const CONVERSATION_ENFORCED = [
  "not_empty",
  "cites_no_source",
  "no_numbers",
  "no_clinical_content",
  "no_claims_about_others",
  "stays_in_role",
  "no_prompt_echo",
  "names_a_person_when_needed",
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
    kind: "decline",
    message: DECLINE_MESSAGE,
    model,
    sources: [],
    escalation: { required: false },
    origin: "code",
    rows: [],
    action: null,
  };
}

function support(message: string, model: string | null): CompanionAnswer {
  return {
    can_answer: true,
    kind: "support",
    message,
    model,
    sources: [],
    escalation: { required: false },
    origin: "code",
    rows: [],
    action: null,
  };
}

type Finalized = { answer: CompanionAnswer; audit: AuditCheck[]; outcome: AnswerOutcome };

const check = (audit: AuditCheck[], name: string, pass: boolean, detail?: string) =>
  audit.push({ check: name, pass, ...(!pass && detail ? { detail } : {}) });

/**
 * The authoritative answer, after the model's output has been parsed. Every
 * check is a row of the Audit table in brain/stages/04-answer/CONTEXT.md.
 *
 * The model says what kind of reply it wrote, and code holds each kind to its
 * own checks. An answer must be backed by the sources. A conversational reply
 * has no source, so it must carry nothing that would need one: no number, no
 * clinical word, nothing about another person, no claim to be someone else.
 * Labelling a reply "conversation" therefore cannot smuggle a fact past code.
 *
 * Two checks repair the text (a repeated sentence is dropped, a long answer is
 * cut). The rest reject it. A rejected reply to serious distress becomes code's
 * support message; to a question about how the person is doing, the reply code
 * writes from their numbers; anything else, the decline message.
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
    if (context.supportMessage) {
      return {
        answer: support(context.supportMessage, model),
        audit: [...audit, { check: "fallback", pass: true, detail: `Support message used (${outcome})` }],
        outcome: "support_by_code",
      };
    }
    if (!context.facts || !context.statusQuestion) return { answer: decline(model), audit, outcome };
    const reply = codeReply(context.facts, context.question);
    const source = context.sources.find((item) => item.id === NUMBERS_SOURCE_ID);
    return {
      answer: {
        can_answer: true,
        kind: "answer",
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
  /* Code, not the model, has the last word on the kind. An "answer" that
     cites no source carries nothing a source backs, so it is a conversation
     reply and gets the stricter conversation checks. A 4B model writes a fine
     "I'm sorry you feel sad, want to talk?" and labels it an answer. */
  const kind: ReplyKind = parsed.kind === "answer" && parsed.sources_used.length === 0 ? "conversation" : parsed.kind;
  audit.push({
    check: "kind",
    pass: true,
    detail: kind === parsed.kind ? kind : "the model said answer but cited no source, so it is checked as conversation",
  });
  if (kind === "decline") return fallback("declined_by_model");

  /* Repairs first: the remaining checks run on the text the person would get. */
  let text = parsed.answer.trim();
  const repeats = repeatedSentences(text);
  check(audit, "no_repeated_sentence", repeats.length === 0,
    `Dropped ${repeats.length} repeated sentence${repeats.length === 1 ? "" : "s"}`);
  if (repeats.length) text = withoutRepeats(text);

  /* Too long is repaired, not rejected: keep the leading sentences that fit.
     The first sentence leads with the point, so dropping the tail loses the
     least. Only a first sentence that is too long on its own is rejected. */
  const words = (part: string) => part.split(/\s+/).filter(Boolean).length;
  const sentences = sentencesIn(text);
  const kept: string[] = [];
  for (const sentence of sentences.slice(0, MAX_SENTENCES)) {
    if (kept.length > 0 && words([...kept, sentence].join(" ")) > MAX_WORDS) break;
    kept.push(sentence);
  }
  const originalWords = words(text);
  if (kept.length < sentences.length) text = kept.join(" ");
  const stillTooLong = words(text) > MAX_WORDS;
  check(audit, "length", kept.length === sentences.length && !stillTooLong,
    stillTooLong
      ? `${words(text)} words in the first sentence, the limit is ${MAX_WORDS}`
      : `${sentences.length} sentences and ${originalWords} words, kept the first ${kept.length}`);

  const echo = PROMPT_ECHO.exec(text);
  check(audit, "no_prompt_echo", !echo, echo ? `Found "${echo[0]}"` : undefined);

  check(audit, "names_a_person_when_needed", !context.supportMessage || NAMES_A_PERSON.test(text),
    "The message shows serious distress and the reply names no one to talk to");

  /* What another person said or felt, and speaking as someone else: no
     source ever supports either, so they fail whatever the kind. */
  const others = ABOUT_OTHERS.exec(text);
  check(audit, "no_claims_about_others", !others, others ? `Found "${others[0]}"` : undefined);
  const role = ROLE_CLAIM.exec(text) ?? NAME_CLAIM.exec(text);
  check(audit, "stays_in_role", !role, role ? `Found "${role[0]}"` : undefined);

  /* Recorded, not enforced: the knowledge files themselves say "the companion". */
  const third = THIRD_PERSON.exec(text);
  audit.push({
    check: "first_person (not enforced)",
    pass: !third,
    ...(third ? { detail: `Found "${third[0]}"` } : {}),
  });

  if (kind === "conversation") {
    check(audit, "not_empty", text.length > 0, "Empty reply");
    check(audit, "cites_no_source", parsed.sources_used.length === 0,
      `A conversational reply cited ${parsed.sources_used.join(", ")}; information must be an answer`);
    /* The person's own numbers may be said back to them ("six hours of logging
       is a long stretch"). Any other number has nothing behind it. */
    const theirs = new Set([
      ...numbersIn(context.question),
      ...(context.question.match(new RegExp(NUMBER_WORDS.source, "gi")) ?? []).map((word) => word.toLowerCase()),
    ]);
    const digits = [...numbersIn(text)].filter((number) => !theirs.has(number));
    const spelled = (text.match(new RegExp(NUMBER_WORDS.source, "gi")) ?? []).filter((word) => !theirs.has(word.toLowerCase()));
    check(audit, "no_numbers", digits.length === 0 && spelled.length === 0,
      `Found ${[...digits, ...spelled].join(", ")}`);
    const clinical = CLINICAL.exec(text);
    check(audit, "no_clinical_content", !clinical, clinical ? `Found "${clinical[0]}"` : undefined);

    if (stillTooLong || audit.some((item) => CONVERSATION_ENFORCED.includes(item.check) && !item.pass)) {
      return fallback("declined_by_audit");
    }
    return {
      answer: {
        can_answer: true,
        kind: "conversation",
        message: text,
        model,
        sources: [],
        escalation: { required: false },
        origin: "model",
        rows: [],
        action: null,
      },
      audit,
      outcome: "conversed",
    };
  }

  const sourceIds = new Set(context.sources.map((source) => source.id));
  const unknown = parsed.sources_used.filter((source) => !sourceIds.has(source));
  check(audit, "sources_are_real", text.length > 0 && parsed.sources_used.length > 0 && unknown.length === 0,
    !text
      ? "Empty answer"
      : parsed.sources_used.length === 0
        ? "No source cited"
        : `Not in the request: ${unknown.join(", ")}`);

  /* The numbers source's body is the worded facts, so one set covers both. */
  const allowedNumbers = new Set(numbersIn(context.sources.map((source) => source.body).join("\n")));
  /* A 4B model restates a negative delta in words: "-0.9" becomes "0.9 hours
     less than normal". The magnitude is grounded, so an unsigned number in the
     answer passes when its magnitude is allowed. Invented magnitudes still fail. */
  const allowedMagnitudes = new Set([...allowedNumbers].map((n) => n.replace(/^-/, "")));
  const invented = [...numbersIn(text)].filter(
    (number) => !allowedNumbers.has(number) && !allowedMagnitudes.has(number),
  );
  check(audit, "no_invented_numbers", invented.length === 0, `Not in a source: ${invented.join(", ")}`);

  const usesNumbers = parsed.sources_used.includes(NUMBERS_SOURCE_ID);
  const aboutNumbers = context.facts !== null && (usesNumbers || context.numbersQuestion);
  const reversed = context.facts && aboutNumbers ? reversedDirections(context.facts, text) : [];
  check(audit, "direction_matches_numbers", reversed.length === 0, reversed.join("; "));

  const wrong = context.facts && usesNumbers ? wrongMeasures(context.facts, text) : [];
  check(audit, "only_measures_that_are_off", wrong.length === 0, wrong.join("; "));

  if (stillTooLong || audit.some((item) => ANSWER_ENFORCED.includes(item.check) && !item.pass)) {
    return fallback("declined_by_audit");
  }

  const shown = context.facts && aboutNumbers
    ? rowsFor(context.facts, text, usesNumbers)
    : { rows: [], action: null };

  return {
    answer: {
      can_answer: true,
      kind: "answer",
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
  boundaryCategories: string[];
  supportTerms: string[];
  numbersQuestion: boolean;
  statusQuestion: boolean;
  /** The model's safety label, which can add a flag the keywords missed. */
  classifier: ClassifierTrace;
};

/* Everything needed to run one turn, or a reply code gives without the model:
   the red-flag escalation, or the decline for a boundary request. */
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
  /* Keywords and the model's typed label together: either one can raise a
     flag, only the keywords work with the model off, and the model can never
     clear a keyword flag. See screenMessage in safety.ts. */
  const { redFlag, boundary, support: supportNeeded, classifier } = await screenMessage(question);
  if (redFlag.matched) {
    return {
      immediate: {
        can_answer: false,
        kind: "escalation",
        message: redFlag.escalationMessage,
        model: null,
        sources: [],
        escalation: { required: true, categories: redFlag.categories },
        origin: "code",
        rows: [],
        action: null,
      },
      trace: { stage: null, searchQuery: null, found: [], redFlagCategories: redFlag.categories, boundaryCategories: [], supportTerms: [], numbersQuestion: false, statusQuestion: false, classifier },
    };
  }
  /* Role-play, rule overrides and questions about a crewmate's words or
     ratings are declined here. A small model asked to "pretend you are my
     wife" may simply do it, so this is not left to the prompt. */
  if (boundary.matched) {
    return {
      immediate: decline(null),
      trace: { stage: null, searchQuery: null, found: [], redFlagCategories: [], boundaryCategories: boundary.categories, supportTerms: supportNeeded.terms, numbersQuestion: false, statusQuestion: false, classifier },
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
    boundaryCategories: [],
    supportTerms: supportNeeded.terms,
    numbersQuestion,
    statusQuestion,
    classifier,
  };

  /* No source is not a dead end. The model still sees the message, and may
     only reply with conversation or a decline: an answer with no source fails
     the audit. Search decides what the companion can inform about, not
     whether it may talk. */
  return {
    trace,
    context: {
      question, sources, facts, numbersQuestion, statusQuestion,
      supportMessage: supportNeeded.matched ? supportNeeded.supportMessage : null,
    },
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
