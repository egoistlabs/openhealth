const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434")
  .replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "medgemma:4b";

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

/**
 * One JSON-shaped chat call with a single retry. Every task (companion Q&A,
 * check-in parsing, summaries) goes through here so the timeout, schema
 * enforcement and retry behaviour stay identical.
 */
export async function generateJson<Result>(input: {
  messages: ChatMessage[];
  schema: object;
  validate: (value: unknown) => Result | null;
  retryHint: string;
  temperature?: number;
  numPredict?: number;
  timeoutMs?: number;
}): Promise<{ data: Result; model: string }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages:
          attempt === 0
            ? input.messages
            : [
                ...input.messages,
                { role: "user", content: input.retryHint },
              ],
        format: input.schema,
        stream: false,
        keep_alive: "10m",
        options: {
          temperature: input.temperature ?? 0.2,
          seed: 42,
          num_predict: input.numPredict ?? 256,
          num_ctx: 4096,
        },
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 180_000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }

    const result = (await response.json()) as {
      model?: string;
      message?: { content?: unknown };
    };
    let parsed: unknown = null;
    if (typeof result.message?.content === "string") {
      try {
        parsed = JSON.parse(result.message.content);
      } catch {
        parsed = null;
      }
    }
    const data = parsed === null ? null : input.validate(parsed);
    if (data !== null) return { data, model: result.model ?? OLLAMA_MODEL };
  }

  throw new Error("Ollama returned an invalid response twice.");
}
