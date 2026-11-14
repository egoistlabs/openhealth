import { jsonSchema, Output, streamText, type JSONSchema7 } from "ai";
import { companionModelId, modelSettings } from "../llm/config.ts";
import { companionModel } from "../llm/provider.ts";
import { ANSWER_FORMAT, parseModelAnswer } from "../llm/schema.ts";
import { extractPartialAnswer } from "../chat/partial-answer.ts";
import { sentencesIn } from "../text.ts";
import {
  finalizeCompanionAnswer,
  MAX_SENTENCES,
  prepareCompanionTurn,
  repeatedSentences,
  type AnswerOutcome,
  type AuditCheck,
  type CompanionAnswer,
  type CompanionAnswerInput,
  type ParsedAnswer,
  type TurnTrace,
} from "./answer.ts";

export const MODEL_TIMEOUT_MS = 180_000;

export type TurnStep = "searching" | "thinking" | "writing" | "checking";

/** Why the model call was cut short by code, if it was. */
export type StopReason = "client" | "timeout" | "loop" | "long";

const CUT_SHORT: Record<string, string> = {
  loop: "Stopped by code: a sentence repeated",
  long: `Stopped by code: more than ${MAX_SENTENCES} sentences`,
  timeout: "Stopped by code: the time limit",
  length: "Cut off at the output limit",
};

const finishedSentences = (text: string) =>
  sentencesIn(text).filter((sentence) => /[.!?]$/.test(sentence));

/**
 * What can still be checked when the output was cut short. `kind` and
 * `sources_used` come before `answer` in the JSON, so they are complete; the
 * answer is kept up to its last finished sentence. A cut-short decline needs
 * no salvage: code writes the decline itself.
 */
function salvage(raw: string): ParsedAnswer | null {
  const kind = /"kind"\s*:\s*"(answer|conversation)"/.exec(raw);
  const sources = /"sources_used"\s*:\s*(\[[^\]]*\])/.exec(raw);
  if (!kind || !sources) return null;
  let sourcesUsed: unknown;
  try {
    sourcesUsed = JSON.parse(sources[1]);
  } catch {
    return null;
  }
  if (!Array.isArray(sourcesUsed) || !sourcesUsed.every((source) => typeof source === "string")) return null;
  const answer = finishedSentences(extractPartialAnswer(raw)).join(" ");
  return answer ? { kind: kind[1] as "answer" | "conversation", sources_used: sourcesUsed, answer } : null;
}

export type TurnOutcome =
  | AnswerOutcome
  | "red_flag"
  | "aborted"
  | "error";

/** Everything worth knowing about one turn, for the turn log. */
export type TurnReport = {
  outcome: TurnOutcome;
  trace: TurnTrace | null;
  model: string | null;
  modelCalled: boolean;
  options: Record<string, unknown> | null;
  requestBody: Record<string, unknown> | null;
  promptChars: number | null;
  rawOutput: string | null;
  finishReason: string | null;
  rawFinishReason: string | null;
  tokens: { input: number | null; output: number | null } | null;
  outputChunks: number;
  firstTokenMs: number | null;
  warnings: string[];
  audit: AuditCheck[];
  stopped: StopReason | null;
  stoppedAtMs: number | null;
  error: string | null;
};

export type TurnResult = {
  /** Null only when the caller's own signal aborted the turn: nobody is waiting for an answer. */
  answer: CompanionAnswer | null;
  report: TurnReport;
};

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/* What was sent to the model, without the prompt (its size is logged separately). */
function requestOptionsSent(body: unknown): Record<string, unknown> | null {
  const parsed = typeof body === "string" ? parseJson(body) : body;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  const options = { ...(parsed as Record<string, unknown>) };
  delete options.messages;
  return options;
}

/**
 * One companion turn, end to end: red-flag check, search, one model call,
 * the checks for the kind of reply the model wrote. The app's chat route and the eval runner both call this, so an
 * eval score describes the path a crew member actually uses.
 *
 * The model's text is never returned unchecked. While the model writes, code
 * watches the draft and stops the call the moment a sentence repeats.
 */
export async function runCompanionTurn(
  input: CompanionAnswerInput,
  hooks: { signal?: AbortSignal; onStep?: (step: TurnStep) => void } = {},
): Promise<TurnResult> {
  const startedAt = performance.now();
  const elapsed = () => Math.round(performance.now() - startedAt);
  const report: TurnReport = {
    outcome: "error",
    trace: null,
    model: null,
    modelCalled: false,
    options: null,
    requestBody: null,
    promptChars: null,
    rawOutput: null,
    finishReason: null,
    rawFinishReason: null,
    tokens: null,
    outputChunks: 0,
    firstTokenMs: null,
    warnings: [],
    audit: [],
    stopped: null,
    stoppedAtMs: null,
    error: null,
  };

  hooks.onStep?.("searching");
  const prepared = await prepareCompanionTurn(input);
  report.trace = prepared.trace;

  /* Only a red flag or a boundary request is answered without the model.
     Finding no knowledge file is not a reason to stop: the person may not be
     asking for information. */
  if ("immediate" in prepared) {
    report.outcome = prepared.immediate.escalation.required ? "red_flag" : "declined_by_boundary";
    return { answer: prepared.immediate, report };
  }

  const { context, messages } = prepared;
  const system = messages[0]?.role === "system" ? messages[0].content : "";
  const turns = messages[0]?.role === "system" ? messages.slice(1) : messages;
  const modelId = companionModelId();
  const settings = modelSettings();

  report.model = modelId;
  report.modelCalled = true;
  report.options = { ...settings, timeout_total_ms: MODEL_TIMEOUT_MS, stop_on_repeated_sentence: true, stop_after_sentences: MAX_SENTENCES };
  report.promptChars = messages.reduce((total, message) => total + message.content.length, 0);

  /* One controller owns every reason to stop: the browser went away, the model
     took too long, or it started to loop. The timer is ours because the SDK's
     `timeout` option is built on AbortSignal.any + AbortSignal.timeout, which
     stops firing after a garbage collection on Node 22. */
  const controller = new AbortController();
  const stop = (reason: StopReason) => {
    if (controller.signal.aborted) return;
    report.stopped = reason;
    report.stoppedAtMs = elapsed();
    controller.abort(reason);
  };
  const onClientAbort = () => stop("client");
  if (hooks.signal?.aborted) stop("client");
  hooks.signal?.addEventListener("abort", onClientAbort, { once: true });
  const timer = setTimeout(() => stop("timeout"), MODEL_TIMEOUT_MS);

  let raw = "";
  hooks.onStep?.("thinking");
  try {
    const result = streamText({
      model: companionModel(),
      instructions: system,
      messages: turns,
      /* The schema is a valid JSON Schema, only widened by the object literal. */
      output: Output.object({
        schema: jsonSchema(ANSWER_FORMAT as unknown as JSONSchema7),
      }),
      ...settings,
      /* keep the request body, for the turn log */
      include: { requestBody: true },
      abortSignal: controller.signal,
      onError: ({ error }) => {
        report.error = describeError(error);
      },
      onEnd: ({ rawFinishReason, warnings, request }) => {
        report.rawFinishReason = rawFinishReason ?? null;
        report.warnings = (warnings ?? []).map((warning) => JSON.stringify(warning));
        report.requestBody = requestOptionsSent(request?.body);
      },
    });

    for await (const part of result.stream) {
      if (part.type === "text-delta") {
        if (report.firstTokenMs === null) {
          report.firstTokenMs = elapsed();
          hooks.onStep?.("writing");
        }
        raw += part.text;
        report.outputChunks += 1;
        /* The stop rules. A whole sentence said twice is a loop, and anything
           past the sentence limit would be cut anyway. Stop the model here
           rather than let it burn the rest of the output. */
        const draft = extractPartialAnswer(raw);
        if (repeatedSentences(draft).length > 0) stop("loop");
        else if (finishedSentences(draft).length > MAX_SENTENCES) stop("long");
      } else if (part.type === "finish") {
        report.finishReason = part.finishReason;
        report.tokens = {
          input: part.totalUsage.inputTokens ?? null,
          output: part.totalUsage.outputTokens ?? null,
        };
      } else if (part.type === "error") {
        report.error = describeError(part.error);
      }
    }
  } catch (error) {
    if (!controller.signal.aborted) report.error = describeError(error);
  } finally {
    clearTimeout(timer);
    hooks.signal?.removeEventListener("abort", onClientAbort);
  }
  report.rawOutput = raw;

  if (report.stopped === "client") {
    report.outcome = "aborted";
    return { answer: null, report };
  }

  hooks.onStep?.("checking");
  /* A call that failed outright (the provider is not reachable) is an error,
     not an answer to decline: the caller shows its own offline message. */
  if (report.error && !raw) {
    report.outcome = "error";
    throw Object.assign(new Error(report.error), { report });
  }

  const complete = parseModelAnswer(parseJson(raw));
  const cutShort = complete ? undefined : CUT_SHORT[report.stopped ?? report.finishReason ?? ""];
  const finalized = finalizeCompanionAnswer(
    complete ?? (cutShort ? salvage(raw) : null),
    context,
    modelId,
    cutShort,
  );
  report.audit = finalized.audit;
  report.outcome = finalized.outcome;
  return { answer: finalized.answer, report };
}
