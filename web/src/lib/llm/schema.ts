/**
 * What kind of reply the model wrote. Code audits each kind differently:
 *
 *   answer        information from the supplied sources; every claim is checked against them
 *   conversation  a reply to the person, not to a request for information: a greeting,
 *                 thanks, small talk, a question about the companion, or someone sharing
 *                 how they feel. It may carry no facts, so code checks that it carries none
 *   decline       a request for information, advice or a judgment that no source covers
 */
export const REPLY_KINDS = ["answer", "conversation", "decline"] as const;
export type ReplyKind = (typeof REPLY_KINDS)[number];

/** The JSON shape the companion answering stage must return. */
export type ModelAnswer = {
  kind: ReplyKind;
  answer: string;
  sources_used: string[];
};

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const ANSWER_FORMAT = {
  type: "object",
  properties: {
    kind: { type: "string", enum: [...REPLY_KINDS] },
    /* Before the answer on purpose: if the answer is cut short, what it was
       built from is already known, so its finished sentences can still be checked. */
    sources_used: { type: "array", items: { type: "string" } },
    answer: { type: "string" },
  },
  required: ["kind", "sources_used", "answer"],
  additionalProperties: false,
};

export const isReplyKind = (value: unknown): value is ReplyKind =>
  typeof value === "string" && (REPLY_KINDS as readonly string[]).includes(value);

export function parseModelAnswer(value: unknown): ModelAnswer | null {
  if (typeof value !== "object" || value === null) return null;
  const parsed = value as Partial<ModelAnswer>;
  if (
    !isReplyKind(parsed.kind) ||
    typeof parsed.answer !== "string" ||
    !Array.isArray(parsed.sources_used) ||
    !parsed.sources_used.every((source) => typeof source === "string")
  ) {
    return null;
  }
  return {
    kind: parsed.kind,
    answer: parsed.answer,
    sources_used: parsed.sources_used,
  };
}
