import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  companionModelId,
  isLocalLlm,
  ollamaBaseUrl,
  requireAnthropicKey,
} from "./config.ts";

/* Ollama speaks the OpenAI Chat Completions API at /v1. The responses API
   (the @ai-sdk/openai default) is not implemented by Ollama, so callers must
   use .chat(modelId) rather than the plain provider function. */
function ollamaModel() {
  const ollama = createOpenAI({
    name: "ollama",
    baseURL: `${ollamaBaseUrl()}/v1`,
    apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
  });
  return ollama.chat(companionModelId());
}

function anthropicModel() {
  const anthropic = createAnthropic({ apiKey: requireAnthropicKey() });
  return anthropic(companionModelId());
}

/**
 * The model for one call, chosen by LOCAL_LLM. Both providers are built here
 * rather than at import time, so a build without an API key still succeeds.
 */
export function companionModel() {
  return isLocalLlm() ? ollamaModel() : anthropicModel();
}
