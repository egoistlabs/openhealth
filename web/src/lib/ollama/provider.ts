import { createOpenAI } from "@ai-sdk/openai";

/* Ollama speaks the OpenAI Chat Completions API at /v1. The responses API
   (the @ai-sdk/openai default) is not implemented by Ollama, so callers must
   use .chat(modelId) rather than the plain provider function. */
const OLLAMA_BASE_URL = (
  process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"
).replace(/\/+$/, "");

export const COMPANION_MODEL_ID = process.env.OLLAMA_MODEL ?? "medgemma:4b";

const ollama = createOpenAI({
  name: "ollama",
  baseURL: `${OLLAMA_BASE_URL}/v1`,
  apiKey: process.env.OLLAMA_API_KEY ?? "ollama",
});

export function companionModel() {
  return ollama.chat(COMPANION_MODEL_ID);
}
