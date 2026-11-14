import { NextRequest, NextResponse } from "next/server";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  jsonSchema,
  Output,
  streamText,
  toUIMessageStream,
  type JSONSchema7,
} from "ai";
import {
  finalizeCompanionAnswer,
  prepareCompanionTurn,
  type CompanionAnswer,
} from "@/lib/brain/answer";
import { ANSWER_FORMAT, parseModelAnswer } from "@/lib/ollama/client";
import { companionModel, COMPANION_MODEL_ID } from "@/lib/ollama/provider";
import { extractPartialAnswer } from "@/lib/chat/partial-answer";
import type { CompanionVerdict } from "@/lib/chat/types";
import type { ChatTurn } from "@/lib/brain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_NUMBERS_LENGTH = 4_000;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_LENGTH = 8_000;
const MAX_MESSAGES = 20;
const MAX_CONVERSATION_LENGTH = 24_000;
const TONES = ["gentle", "direct"] as const;
type Tone = (typeof TONES)[number];

const SAFE_STREAM_ERROR =
  "Unable to complete the AI request. Check that Ollama is running locally.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function validateNumbers(value: unknown): Record<string, unknown> | null {
  if (value === undefined) return {};
  if (!isPlainObject(value)) return null;

  try {
    const serialized = JSON.stringify(value);
    if (serialized.length > MAX_NUMBERS_LENGTH) return null;
    const parsed: unknown = JSON.parse(serialized);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function validateTone(value: unknown): Tone {
  return TONES.includes(value as Tone) ? (value as Tone) : "gentle";
}

type Conversation = {
  question: string;
  history: ChatTurn[];
};

/* useChat sends the full UI message list; only plain text turns are accepted. */
function readConversation(value: unknown): Conversation | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return null;
  }

  const turns: ChatTurn[] = [];
  for (const item of value) {
    if (!isPlainObject(item)) return null;
    const role = item.role;
    if (role !== "user" && role !== "assistant") return null;
    if (!Array.isArray(item.parts)) return null;

    const raw = item.parts
      .map((part) => {
        if (!isPlainObject(part) || part.type !== "text") return null;
        return typeof part.text === "string" ? part.text : null;
      })
      .filter((part): part is string => part !== null)
      .join("");

    /* Assistant messages hold the streamed JSON envelope; history should carry
       the answer text only, the same way the non-streaming path did. */
    const text = role === "assistant" ? extractPartialAnswer(raw) || raw : raw;

    if (text.length > MAX_MESSAGE_LENGTH) return null;
    turns.push({ role, text: text.trim() });
  }

  const last = turns[turns.length - 1];
  if (!last || last.role !== "user" || !last.text) return null;

  try {
    if (JSON.stringify(turns).length > MAX_CONVERSATION_LENGTH) return null;
  } catch {
    return null;
  }

  return {
    question: last.text,
    history: turns.slice(0, -1).slice(-MAX_HISTORY_TURNS).filter((turn) => turn.text),
  };
}

function toVerdict(answer: CompanionAnswer): CompanionVerdict {
  return {
    can_answer: answer.can_answer,
    message: answer.message,
    sources: answer.sources,
    escalation: answer.escalation,
  };
}

function verdictStream(verdict: CompanionVerdict): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: "answer" });
      writer.write({ type: "text-delta", id: "answer", delta: verdict.message });
      writer.write({ type: "text-end", id: "answer" });
      writer.write({ type: "data-verdict", id: "verdict", data: verdict });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }
  if (!isPlainObject(body)) {
    return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
  }

  const conversation = readConversation(body.messages);
  if (!conversation) {
    return NextResponse.json(
      {
        error: `Messages must be 1-${MAX_MESSAGES} text turns (user or assistant) ending with a user message of at most ${MAX_MESSAGE_LENGTH} characters.`,
      },
      { status: 400 },
    );
  }

  const numbers = validateNumbers(body.numbers);
  if (!numbers) {
    return NextResponse.json(
      { error: "Numbers must be a JSON object no larger than 4 KB." },
      { status: 400 },
    );
  }

  /* Cap the history payload the same way it was validated before streaming. */
  try {
    if (JSON.stringify(conversation.history).length > MAX_HISTORY_LENGTH) {
      return NextResponse.json(
        { error: `History must be at most ${MAX_HISTORY_TURNS} turns no larger than 8 KB.` },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "History could not be read." }, { status: 400 });
  }

  const tone = validateTone(body.tone);

  let prepared;
  try {
    prepared = await prepareCompanionTurn({
      question: conversation.question,
      numbers,
      history: conversation.history,
      tone,
    });
  } catch (error) {
    console.error("AI chat pipeline error:", error);
    return NextResponse.json({ error: SAFE_STREAM_ERROR }, { status: 502 });
  }

  if ("immediate" in prepared) {
    return verdictStream(toVerdict(prepared.immediate));
  }

  const sources = prepared.sources;
  const messages = prepared.messages;
  const system = messages[0]?.role === "system" ? messages[0].content : "";
  const turns = messages[0]?.role === "system" ? messages.slice(1) : messages;

  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "start" });

      const result = streamText({
        model: companionModel(),
        instructions: system,
        messages: turns,
        /* The schema is shared with the non-streaming path; it is a valid
           JSON Schema, only widened by the object literal. */
        output: Output.object({
          schema: jsonSchema(ANSWER_FORMAT as unknown as JSONSchema7),
        }),
        temperature: 0.2,
        seed: 42,
        maxOutputTokens: 256,
        abortSignal: request.signal,
        timeout: { totalMs: 180_000 },
        onError: ({ error }) => {
          console.error("AI chat stream error:", error);
        },
        onEnd: ({ output, text }) => {
          /* An aborted turn has no verdict: the client keeps the partial draft. */
          if (request.signal.aborted) return;

          const parsed =
            parseModelAnswer(output) ?? parseModelAnswer(parseJson(text));
          const verdict = toVerdict(
            finalizeCompanionAnswer(parsed, sources, numbers, COMPANION_MODEL_ID),
          );
          try {
            writer.write({ type: "data-verdict", id: "verdict", data: verdict });
          } catch {
            /* stream already closed; nothing to record */
          }
        },
      });

      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          sendStart: false,
          onError: () => SAFE_STREAM_ERROR,
        }),
      );
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { "Cache-Control": "no-store" },
  });
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
