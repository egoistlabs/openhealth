import { loadBrainDocuments, loadCompanionInstructions, loadIdentity } from "./loader.ts";
import { checkRedFlags } from "./safety.ts";
import { searchBrain } from "./search.ts";
import { generateGroundedAnswer } from "../ollama/client.ts";
import { numbersIn } from "../text.ts";
import type { ScoredDocument } from "./types.ts";

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
  return [...numbersIn(answer.answer)].every((number) => allowedNumbers.has(number));
}

export async function answerQuestion(
  question: string,
  numbers: Record<string, unknown> = {},
): Promise<CompanionAnswer> {
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
  const sources = searchBrain(question, documents);
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
