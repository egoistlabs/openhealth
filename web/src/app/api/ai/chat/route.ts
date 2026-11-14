import { NextRequest, NextResponse } from "next/server";
import {
  consumeStream,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import type { CompanionAnswer } from "@/lib/brain/answer";
import { NUMBERS_SOURCE_ID } from "@/lib/brain/facts";
import { resolveBrainRoot } from "@/lib/brain/root";
import { runCompanionTurn, type TurnReport } from "@/lib/brain/turn";
import { readBrainVersion } from "@/lib/brain/version";
import type { ChatTurn } from "@/lib/brain/types";
import { startTurn, type TurnEvent } from "@/lib/chat/turn-log";
import type { CompanionUIMessage, CompanionVerdict } from "@/lib/chat/types";
import { companionModelId, providerHint } from "@/lib/llm/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_NUMBERS_LENGTH = 8_000;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_LENGTH = 8_000;
const MAX_MESSAGES = 20;
const MAX_CONVERSATION_LENGTH = 24_000;
const TONES = ["gentle", "direct"] as const;
type Tone = (typeof TONES)[number];

function safeStreamError(): string {
  return `Unable to complete the AI request. ${providerHint()}`;
}

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

function validateCrew(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_-]{1,40}$/i.test(value) ? value : null;
}

type Conversation = {
  question: string;
  history: ChatTurn[];
};

/* useChat sends the full UI message list. Only text parts are read: an
   assistant message's text part is its checked answer, nothing else. */
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

    const text = item.parts
      .map((part) =>
        isPlainObject(part) && part.type === "text" && typeof part.text === "string"
          ? part.text
          : "",
      )
      .join("");

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
    kind: answer.kind,
    message: answer.message,
    sources: answer.sources,
    escalation: answer.escalation,
    origin: answer.origin,
    rows: answer.rows,
    action: answer.action,
  };
}

async function brainVersionLabel(): Promise<string | null> {
  try {
    return (await readBrainVersion(resolveBrainRoot())).label;
  } catch {
    return null;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/* The runner's report, as fields of the turn's wide event. */
function reportFields(report: TurnReport): Partial<TurnEvent> {
  return {
    outcome: report.outcome,
    stage: report.trace?.stage ?? null,
    search_query: report.trace?.searchQuery ?? null,
    files_found: report.trace?.found ?? [],
    red_flag_categories: report.trace?.redFlagCategories ?? [],
    boundary_categories: report.trace?.boundaryCategories ?? [],
    support_terms: report.trace?.supportTerms ?? [],
    numbers_question: report.trace?.numbersQuestion ?? false,
    status_question: report.trace?.statusQuestion ?? false,
    model: report.model,
    model_called: report.modelCalled,
    options: report.options,
    request_body: report.requestBody,
    prompt_chars: report.promptChars,
    raw_output: report.rawOutput,
    finish_reason: report.finishReason,
    raw_finish_reason: report.rawFinishReason,
    tokens: report.tokens,
    output_chunks: report.outputChunks,
    first_token_ms: report.firstTokenMs,
    warnings: report.warnings,
    audit: report.audit,
    stopped_by: report.stopped === "client" ? null : report.stopped,
    aborted_at_ms: report.stoppedAtMs,
    error: report.error,
  };
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
      { error: "Numbers must be a JSON object no larger than 8 KB." },
      { status: 400 },
    );
  }

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
  const brainVersion = await brainVersionLabel();

  /* One wide event per turn, written once when the response stream ends. */
  const turn = startTurn({
    crew: validateCrew(body.crew),
    sol: typeof numbers.sol === "number" ? numbers.sol : null,
    tone,
    question: conversation.question,
    history_turns: conversation.history.length,
    brain_version: brainVersion,
  });
  const metadata = { turnId: turn.event.turn_id, model: companionModelId(), brainVersion };

  /* The stream carries typed parts only. The model's draft never leaves the
     server: the browser gets progress steps, then the checked answer. */
  const stream = createUIMessageStream<CompanionUIMessage>({
    execute: async ({ writer }) => {
      writer.write({ type: "start", messageMetadata: metadata });

      let result;
      try {
        result = await runCompanionTurn(
          { question: conversation.question, numbers, history: conversation.history, tone },
          {
            signal: request.signal,
            /* same id each time, so the browser updates one part in place */
            onStep: (step) => writer.write({ type: "data-progress", id: "progress", data: { step } }),
          },
        );
      } catch (error) {
        console.error("AI chat pipeline error:", error);
        const report = (error as { report?: TurnReport }).report;
        turn.set({ ...(report ? reportFields(report) : {}), outcome: "error", error: describeError(error) });
        /* becomes an `error` part: the browser falls back to its own offline reply */
        throw error;
      }

      turn.set(reportFields(result.report));
      /* The browser aborted (Stop, or the tab went away): nobody to answer. */
      if (!result.answer) return;

      const verdict = toVerdict(result.answer);
      turn.set({
        verdict: {
          can_answer: verdict.can_answer,
          kind: verdict.kind,
          message: verdict.message,
          sources: verdict.sources.map((source) => source.id),
          escalation: verdict.escalation.required,
          origin: verdict.origin,
          rows: verdict.rows.map((row) => `${row.label}: ${row.value}`),
          action: verdict.action,
        },
      });

      /* The knowledge files the answer came from, as the SDK's own source parts. */
      for (const source of verdict.sources) {
        if (source.id === NUMBERS_SOURCE_ID) continue;
        writer.write({
          type: "source-document",
          sourceId: source.id,
          mediaType: "text/markdown",
          title: source.title,
          filename: source.id,
        });
      }
      /* The text part is the checked answer, so it is what the next turn's
         history carries. */
      writer.write({ type: "text-start", id: "answer" });
      writer.write({ type: "text-delta", id: "answer", delta: verdict.message });
      writer.write({ type: "text-end", id: "answer" });
      writer.write({ type: "data-verdict", id: "verdict", data: verdict });
      writer.write({
        type: "finish",
        finishReason: "stop",
        messageMetadata: { ...metadata, totalMs: turn.elapsed() },
      });
      turn.set({ verdict_sent: !request.signal.aborted });
    },
    onError: () => safeStreamError(),
    /* Runs once when the response stream ends, however it ends. */
    onEnd: async ({ isAborted, isCancelled, outcome }) => {
      await turn.end({
        stream_outcome: isCancelled
          ? "cancelled"
          : isAborted
            ? "aborted"
            : outcome.status === "unknown"
              ? "completed"
              : outcome.status,
        client_aborted: request.signal.aborted,
      });
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { "Cache-Control": "no-store" },
    /* Without this the stream's onEnd does not run when the browser aborts. */
    consumeSseStream: consumeStream,
  });
}
