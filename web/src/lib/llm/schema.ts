/** The JSON shape the companion answering stage must return. */
export type ModelAnswer = {
  can_answer: boolean;
  answer: string;
  sources_used: string[];
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const ANSWER_FORMAT = {
  type: "object",
  properties: {
    can_answer: { type: "boolean" },
    /* Before the answer on purpose: if the answer is cut short, what it was
       built from is already known, so its finished sentences can still be checked. */
    sources_used: { type: "array", items: { type: "string" } },
    answer: { type: "string" },
  },
  required: ["can_answer", "sources_used", "answer"],
  additionalProperties: false,
};

export function parseModelAnswer(value: unknown): ModelAnswer | null {
  if (typeof value !== "object" || value === null) return null;
  const parsed = value as Partial<ModelAnswer>;
  if (
    typeof parsed.can_answer !== "boolean" ||
    typeof parsed.answer !== "string" ||
    !Array.isArray(parsed.sources_used) ||
    !parsed.sources_used.every((source) => typeof source === "string")
  ) {
    return null;
  }
  return {
    can_answer: parsed.can_answer,
    answer: parsed.answer,
    sources_used: parsed.sources_used,
  };
}
