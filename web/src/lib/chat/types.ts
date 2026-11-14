import type { UIMessage } from "ai";
import { z } from "zod";

/* The contract between the chat route and the Companion screen. The browser
   validates every part against these schemas (useChat's dataPartSchemas), so a
   malformed part is an error, never something half-rendered. */

/** The server's checked answer for one companion turn. The only text the screen shows or speaks. */
export const verdictSchema = z.object({
  can_answer: z.boolean(),
  /** answer (from sources), conversation (no facts), support, decline or escalation (all three written by code). */
  kind: z.enum(["answer", "conversation", "support", "decline", "escalation"]),
  message: z.string(),
  sources: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      source: z.string(),
      added: z.string(),
      authorised_by: z.string(),
    }),
  ),
  escalation: z.object({
    required: z.boolean(),
    categories: z.array(z.string()).optional(),
  }),
  /** Who wrote the message: the model (then checked by code), or code alone. */
  origin: z.enum(["model", "code"]),
  /** The measures that are off, built from the numbers, never from the model's prose. */
  rows: z.array(
    z.object({ key: z.string(), label: z.string(), value: z.string(), detail: z.string() }),
  ),
  /** The one suggested action, from the app. */
  action: z.string().nullable(),
});
export type CompanionVerdict = z.infer<typeof verdictSchema>;

/** Where the turn is. Shown instead of the model's unchecked draft. */
export const progressSchema = z.object({
  step: z.enum(["searching", "thinking", "writing", "checking"]),
});
export type CompanionProgress = z.infer<typeof progressSchema>;

/** About the message as a whole. `turnId` finds the turn in the local turn log. */
export const metadataSchema = z.object({
  turnId: z.string(),
  model: z.string().nullable(),
  brainVersion: z.string().nullable(),
  totalMs: z.number().optional(),
});
export type CompanionMetadata = z.infer<typeof metadataSchema>;

export const companionDataSchemas = { verdict: verdictSchema, progress: progressSchema };

export type CompanionUIData = { verdict: CompanionVerdict; progress: CompanionProgress };

export type CompanionUIMessage = UIMessage<CompanionMetadata, CompanionUIData>;
