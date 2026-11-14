import { loadBrainDocuments, loadStage } from "./loader.ts";
import { checkRedFlags } from "./safety.ts";
import { searchBrain } from "./search.ts";
import { buildAnswerMessages } from "./prompt.ts";
import { generateGroundedAnswer } from "../ollama/client.ts";
import { numbersIn } from "../text.ts";
import type { ChatTurn, ScoredDocument } from "./types.ts";

export const DECLINE_MESSAGE = "I don't have that on board.";

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
};

export function verifyGroundedAnswer(
  answer: { can_answer: boolean; answer: string; sources_used: string[] },
  allowedSources: ScoredDocument[],
  numbers: Record<string, unknown>,
): boolean {
  if (!answer.can_answer) return true;
  if (!answer.answer.trim() || answer.sources_used.length === 0) return false;

  const sourceIds = new Set(allowedSources.map((source) => source.id));
  if (answer.sources_used.some((source) => !sourceIds.has(source))) return false;

  const allowedNumbers = new Set([
    ...numbersIn(allowedSources.map((source) => source.body).join("\n")),
    ...numbersIn(JSON.stringify(numbers)),
  ]);
  /* A 4B model restates a negative delta in words: "-0.9" becomes "0.9 hours
     less than normal". The magnitude is grounded, so an unsigned number in the
     answer passes when its magnitude is allowed. Invented magnitudes still fail. */
  const allowedMagnitudes = new Set([...allowedNumbers].map((n) => n.replace(/^-/, "")));
  return [...numbersIn(answer.answer)].every(
    (number) => allowedNumbers.has(number) || allowedMagnitudes.has(number),
  );
}

export type CompanionAnswerInput = {
  question: string;
  numbers?: Record<string, unknown>;
  history?: ChatTurn[];
  tone?: "gentle" | "direct";
};

/* Everything needed to stream one grounded turn, or an answer that needs no
   model call (red flag, nothing relevant on board). */
export type PreparedTurn =
  | { immediate: CompanionAnswer }
  | {
      sources: ScoredDocument[];
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
      },
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
  const sources = searchBrain(retrievalQuery, documents);
  if (sources.length === 0) {
    return {
      immediate: {
        can_answer: false,
        message: DECLINE_MESSAGE,
        model: null,
        sources: [],
        escalation: { required: false },
      },
    };
  }

  return {
    sources,
    messages: buildAnswerMessages({
      context: stage.context,
      sources,
      numbers,
      question,
      history,
      tone,
    }),
  };
}

/* The authoritative answer, after the model's output (streamed or not) has
   been parsed. Verification is identical for both paths. */
export function finalizeCompanionAnswer(
  answer: { can_answer: boolean; answer: string; sources_used: string[] } | null,
  allowedSources: ScoredDocument[],
  numbers: Record<string, unknown>,
  model: string | null,
): CompanionAnswer {
  if (
    !answer ||
    !verifyGroundedAnswer(answer, allowedSources, numbers) ||
    !answer.can_answer
  ) {
    return {
      can_answer: false,
      message: DECLINE_MESSAGE,
      model,
      sources: [],
      escalation: { required: false },
    };
  }

  return {
    can_answer: true,
    message: answer.answer.trim(),
    model,
    sources: allowedSources
      .filter((source) => answer.sources_used.includes(source.id))
      .map(({ id, title, source, added, authorisedBy }) => ({
        id,
        title,
        source,
        added,
        authorised_by: authorisedBy,
      })),
    escalation: { required: false },
  };
}

export async function answerQuestion(input: CompanionAnswerInput): Promise<CompanionAnswer> {
  const prepared = await prepareCompanionTurn(input);
  if ("immediate" in prepared) return prepared.immediate;

  const { numbers = {} } = input;
  const result = await generateGroundedAnswer({
    sources: prepared.sources,
    numbers,
    question: input.question,
    messages: prepared.messages,
  });

  return finalizeCompanionAnswer(result.answer, prepared.sources, numbers, result.model);
}
