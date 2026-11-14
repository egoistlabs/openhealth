import type { ChatTurn, ScoredDocument } from "./types.ts";

export type AnswerPromptInput = {
  /** The stage's "Full file" inputs, in contract order: identity, then the prompt. */
  context: string[];
  /** What the model may cite: knowledge files, and the person's numbers when the question is about them. */
  sources: ScoredDocument[];
  question: string;
  /* turns before the current question; the current question itself is never included */
  history?: ChatTurn[];
  tone?: "gentle" | "direct";
};

/**
 * Lays out one request. Every rule the model is told lives in
 * brain/stages/04-answer/references/prompt.md (part of `context`), not here:
 * this file only labels the data that changes per request.
 */
export function buildAnswerMessages(input: AnswerPromptInput) {
  const sourceBlocks = input.sources.map(
    (source) => `[SOURCE ID: ${source.id}]\nTITLE: ${source.title}\n${source.body}`,
  );

  const historyMessages = (input.history ?? []).map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));

  return [
    { role: "system" as const, content: input.context.join("\n\n") },
    ...historyMessages,
    {
      role: "user" as const,
      content: [
        "--- BEGIN SOURCES ---",
        sourceBlocks.join("\n\n"),
        "--- END SOURCES ---",
        "",
        `TONE: ${input.tone === "direct" ? "direct" : "gentle"}`,
        "",
        `QUESTION: ${input.question}`,
      ].join("\n"),
    },
  ];
}
