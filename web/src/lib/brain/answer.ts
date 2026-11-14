import { loadBrainDocuments, loadCompanionInstructions, loadIdentity } from "./loader.ts";
import { checkRedFlags } from "./safety.ts";
import { searchBrain } from "./search.ts";
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

export async function answerQuestion(input: CompanionAnswerInput): Promise<CompanionAnswer> {
  const { question, numbers = {}, history = [], tone = "gentle" } = input;
  const redFlag = await checkRedFlags(question);
  if (redFlag.matched) {
    return {
      can_answer: false,
      message: redFlag.escalationMessage,
      model: null,
      sources: [],
      escalation: { required: true, categories: redFlag.categories },
    };
  }

  const documents = await loadBrainDocuments();
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
      can_answer: false,
      message: DECLINE_MESSAGE,
      model: null,
      sources: [],
      escalation: { required: false },
    };
  }

  const [identity, instructions] = await Promise.all([
    loadIdentity(),
    loadCompanionInstructions(),
  ]);
  const result = await generateGroundedAnswer({
    identity,
    instructions,
    sources,
    numbers,
    question,
    history,
    tone,
  });

  if (
    !verifyGroundedAnswer(result.answer, sources, numbers) ||
    !result.answer.can_answer
  ) {
    return {
      can_answer: false,
      message: DECLINE_MESSAGE,
      model: result.model,
      sources: [],
      escalation: { required: false },
    };
  }

  return {
    can_answer: true,
    message: result.answer.answer.trim(),
    model: result.model,
    sources: sources
      .filter((source) => result.answer.sources_used.includes(source.id))
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
