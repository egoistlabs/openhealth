/**
 * Which model answers: Ollama on this machine, or the Anthropic API.
 *
 *   LOCAL_LLM unset / true / 1   -> Ollama (the default)
 *   LOCAL_LLM false / 0          -> Anthropic, using ANTHROPIC_API_KEY
 *
 * Everything here is read when a call is made, not when the module is
 * imported: the eval scripts load web/.env after their imports.
 */

export type LlmProvider = "ollama" | "anthropic";

const TRUE_VALUES = new Set(["true", "1", "yes", "on"]);
const FALSE_VALUES = new Set(["false", "0", "no", "off"]);

let cloudWarningShown = false;
let modelWarningShown = false;

export function isLocalLlm(): boolean {
  const raw = process.env.LOCAL_LLM?.trim().toLowerCase();
  if (!raw) return true;
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) {
    if (!cloudWarningShown) {
      cloudWarningShown = true;
      console.warn(
        "LOCAL_LLM is false: prompts, answers and crew numbers are sent to the Anthropic API.",
      );
    }
    return false;
  }
  throw new Error(`LOCAL_LLM must be true or false (got "${raw}").`);
}

export function llmProvider(): LlmProvider {
  return isLocalLlm() ? "ollama" : "anthropic";
}

export function ollamaBaseUrl(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(
    /\/+$/,
    "",
  );
}

export function companionModelId(): string {
  if (isLocalLlm()) {
    return process.env.OLLAMA_MODEL?.trim() || "medgemma:4b";
  }
  const model = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
  if (!model.startsWith("claude-") && !modelWarningShown) {
    modelWarningShown = true;
    console.warn(
      `ANTHROPIC_MODEL="${model}" does not look like a Claude model id; the API will reject it.`,
    );
  }
  return model;
}

/** The sampling settings both providers share. Anthropic ignores `seed`. */
export function modelSettings(): {
  temperature: number;
  maxOutputTokens: number;
  seed?: number;
} {
  return {
    temperature: 0.2,
    maxOutputTokens: 256,
    ...(isLocalLlm() ? { seed: 42 } : {}),
  };
}

export function requireAnthropicKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new Error("LOCAL_LLM is false but ANTHROPIC_API_KEY is not set.");
  }
  return key;
}

/** The part of a route error message that tells the operator what to check. */
export function providerHint(): string {
  try {
    return isLocalLlm()
      ? "Check that Ollama is running locally."
      : "Check that ANTHROPIC_API_KEY is set and valid.";
  } catch {
    /* The config error itself is already in the log; do not hide the request error. */
    return "Check LOCAL_LLM, OLLAMA_BASE_URL and ANTHROPIC_API_KEY.";
  }
}
