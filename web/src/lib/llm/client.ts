import {
  generateText,
  jsonSchema,
  NoObjectGeneratedError,
  Output,
  type JSONSchema7,
} from "ai";
import {
  companionModelId,
  isLocalLlm,
  ollamaBaseUrl,
  requireAnthropicKey,
} from "./config.ts";
import { companionModel } from "./provider.ts";
import type { ChatMessage } from "./schema.ts";

export type GenerateJsonInput<Result> = {
  messages: ChatMessage[];
  schema: object;
  validate: (value: unknown) => Result | null;
  retryHint: string;
  temperature?: number;
  /** Maps to Ollama's num_predict and to Anthropic's max output tokens. */
  maxOutputTokens?: number;
  timeoutMs?: number;
};

type ConversationMessage = { role: "user" | "assistant"; content: string };

/** Ollama's native /api/chat, with its JSON schema mode. */
async function generateWithOllama<Result>(
  input: GenerateJsonInput<Result>,
): Promise<{ data: Result; model: string }> {
  const requestedModel = companionModelId();
  const baseUrl = ollamaBaseUrl();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: requestedModel,
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
          num_predict: input.maxOutputTokens ?? 256,
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
    if (data !== null) {
      return { data, model: result.model ?? requestedModel };
    }
  }

  throw new Error("Ollama returned an invalid response twice.");
}

/** AI SDK models reject system messages inside `messages`, so split them out. */
function splitSystem(messages: ChatMessage[]): {
  system: string;
  conversation: ConversationMessage[];
} {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const conversation = messages.filter(
    (message): message is ConversationMessage => message.role !== "system",
  );
  return { system, conversation };
}

/** The Anthropic Messages API through the AI SDK, with a JSON schema output. */
async function generateWithAnthropic<Result>(
  input: GenerateJsonInput<Result>,
): Promise<{ data: Result; model: string }> {
  requireAnthropicKey();
  const { system, conversation } = splitSystem(input.messages);
  const model = companionModelId();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    let output: unknown;
    try {
      const result = await generateText({
        model: companionModel(),
        ...(system ? { system } : {}),
        messages:
          attempt === 0
            ? conversation
            : [
                ...conversation,
                { role: "user" as const, content: input.retryHint },
              ],
        output: Output.object({
          schema: jsonSchema(input.schema as JSONSchema7),
        }),
        temperature: input.temperature ?? 0.2,
        /* A Claude model can spend output tokens before the visible JSON, so a
           small-model cap cuts the object off. Each task's own validation
           bounds the content, not this number. */
        maxOutputTokens: Math.max(input.maxOutputTokens ?? 256, 1024),
        /* The loop below is the one retry, matching the Ollama path. */
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(input.timeoutMs ?? 180_000),
      });
      output = result.output;
    } catch (error) {
      /* A malformed reply is worth one retry. API, network and timeout errors are not. */
      if (NoObjectGeneratedError.isInstance(error)) continue;
      throw error;
    }

    const data = input.validate(output);
    if (data !== null) {
      return { data, model };
    }
  }

  throw new Error("Anthropic returned an invalid response twice.");
}

/**
 * One JSON-shaped chat call with a single retry. Every task (check-in parsing,
 * daily and crew summaries) goes through here so the timeout, schema
 * enforcement and retry behaviour stay identical across providers.
 */
export async function generateJson<Result>(
  input: GenerateJsonInput<Result>,
): Promise<{ data: Result; model: string }> {
  return isLocalLlm()
    ? generateWithOllama(input)
    : generateWithAnthropic(input);
}
