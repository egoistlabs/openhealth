import type { ScoredDocument } from "../brain/types.ts";
import { buildAnswerMessages } from "../brain/prompt.ts";

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434")
  .replace(/\/+$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? "medgemma:4b";

export type ModelAnswer = {
  can_answer: boolean;
  answer: string;
  sources_used: string[];
};

const ANSWER_FORMAT = {
  type: "object",
  properties: {
    can_answer: { type: "boolean" },
    answer: { type: "string" },
    sources_used: { type: "array", items: { type: "string" } },
  },
  required: ["can_answer", "answer", "sources_used"],
  additionalProperties: false,
};

function parseModelAnswer(content: unknown): ModelAnswer | null {
  if (typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content) as Partial<ModelAnswer>;
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
  } catch {
    return null;
  }
}

export async function generateGroundedAnswer(input: {
  identity: string;
  instructions: string;
  sources: ScoredDocument[];
  numbers?: Record<string, unknown>;
  question: string;
}): Promise<{ answer: ModelAnswer; model: string }> {
  const messages = buildAnswerMessages(input);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages:
          attempt === 0
            ? messages
            : [
                ...messages,
                {
                  role: "user",
                  content:
                    "Your previous response was not valid JSON matching the required schema. Return only a valid object with can_answer, answer, and sources_used.",
                },
              ],
        format: ANSWER_FORMAT,
        stream: false,
        keep_alive: "10m",
        options: {
          temperature: 0.2,
          seed: 42,
          num_predict: 256,
          num_ctx: 4096,
        },
      }),
      signal: AbortSignal.timeout(180_000),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Ollama returned HTTP ${response.status}`);
    }

    const result = (await response.json()) as {
      model?: string;
      message?: { content?: unknown };
    };
    const answer = parseModelAnswer(result.message?.content);
    if (answer) return { answer, model: result.model ?? OLLAMA_MODEL };
  }

  throw new Error("Ollama returned an invalid response twice.");
}
