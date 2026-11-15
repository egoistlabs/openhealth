import type { ClassifierTrace } from "../brain/safety.ts";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * One wide event per companion turn: a single JSON line, written when the turn
 * ends, that is enough to explain a bad answer afterwards.
 *
 * The file holds what a crew member typed, so it stays on this machine. It is
 * git-ignored and never goes in brain/.
 *
 *   COMPANION_TURN_LOG=off          turn logging off
 *   COMPANION_TURN_LOG=<file path>  write somewhere else
 *   (unset)                         <cwd>/.logs/companion-turns.jsonl
 */
export type TurnOutcome =
  /* code answered without the model */
  | "red_flag"
  | "declined_by_boundary"
  /* older log lines only: search found nothing and the model was not called */
  | "nothing_found"
  /* the model ran and code checked its output */
  | "answered"
  | "conversed"
  | "answered_by_code"
  | "support_by_code"
  | "declined_by_model"
  | "declined_by_audit"
  | "unparseable"
  /* no verdict was produced */
  | "aborted"
  | "error";

export type TurnAudit = { check: string; pass: boolean; detail?: string };

export type TurnEvent = {
  event: "companion_turn";
  turn_id: string;
  time: string;
  outcome: TurnOutcome;

  /* who asked what */
  crew: string | null;
  sol: number | null;
  tone: string;
  question: string;
  history_turns: number;

  /* what code found before the model */
  brain_version: string | null;
  stage: string | null;
  search_query: string | null;
  files_found: Array<{ id: string; score: number }>;
  red_flag_categories: string[];
  /** Boundary requests in the message (role-play, rule override, a crewmate's words), from brain/safety/boundaries.json. Declined without the model. */
  boundary_categories: string[];
  /** Signs of serious distress in the message, from brain/safety/support.json. The reply had to name a person. */
  support_terms: string[];
  /** The question was about the person's own numbers, so it needed no knowledge file. */
  numbers_question: boolean;
  /** The question asked how the person is doing, so code could always answer it. */
  status_question: boolean;
  /** The model's safety label (null when it did not run). */
  safety_classifier: ClassifierTrace | null;

  /* the model call; null on the paths that never call it */
  model: string | null;
  model_called: boolean;
  options: Record<string, unknown> | null;
  request_body: Record<string, unknown> | null;
  prompt_chars: number | null;
  raw_output: string | null;
  finish_reason: string | null;
  raw_finish_reason: string | null;
  tokens: { input: number | null; output: number | null } | null;
  output_chunks: number;
  first_token_ms: number | null;
  warnings: string[];

  /* what code decided */
  audit: TurnAudit[];
  verdict: {
    can_answer: boolean;
    kind: string;
    message: string;
    sources: string[];
    escalation: boolean;
    origin: string;
    rows: string[];
    action: string | null;
  } | null;

  /* how the turn ended on the wire */
  verdict_sent: boolean;
  /** The request was aborted from the browser: Stop was pressed, or the tab closed or reloaded. */
  client_aborted: boolean;
  /** Why code cut the model call short: "timeout", "loop" (a sentence repeated) or "long" (past the sentence limit). */
  stopped_by: string | null;
  /** When the model call was cut short, in ms from the start of the turn. */
  aborted_at_ms: number | null;
  stream_outcome: string | null;
  error: string | null;
  total_ms: number;
};

export function turnLogPath(): string | null {
  const setting = process.env.COMPANION_TURN_LOG;
  if (setting === "off") return null;
  return setting
    ? path.resolve(process.cwd(), setting)
    : path.resolve(process.cwd(), ".logs", "companion-turns.jsonl");
}

export type TurnLog = {
  readonly event: TurnEvent;
  /** Milliseconds since the turn started. */
  elapsed(): number;
  /** Add context to the event. Later values replace earlier ones. */
  set(fields: Partial<TurnEvent>): void;
  /** Write the line. Safe to call from every exit path: only the first call writes. */
  end(fields?: Partial<TurnEvent>): Promise<void>;
};

export function startTurn(fields: Partial<TurnEvent>): TurnLog {
  const startedAt = performance.now();
  let written = false;

  const event: TurnEvent = {
    event: "companion_turn",
    turn_id: crypto.randomUUID(),
    time: new Date().toISOString(),
    outcome: "error",
    crew: null,
    sol: null,
    tone: "gentle",
    question: "",
    history_turns: 0,
    brain_version: null,
    stage: null,
    search_query: null,
    files_found: [],
    red_flag_categories: [],
    boundary_categories: [],
    support_terms: [],
    numbers_question: false,
    status_question: false,
    safety_classifier: null,
    model: null,
    model_called: false,
    options: null,
    request_body: null,
    prompt_chars: null,
    raw_output: null,
    finish_reason: null,
    raw_finish_reason: null,
    tokens: null,
    output_chunks: 0,
    first_token_ms: null,
    warnings: [],
    audit: [],
    verdict: null,
    verdict_sent: false,
    client_aborted: false,
    stopped_by: null,
    aborted_at_ms: null,
    stream_outcome: null,
    error: null,
    total_ms: 0,
    ...fields,
  };

  const elapsed = () => Math.round(performance.now() - startedAt);

  return {
    event,
    elapsed,
    set(more) {
      Object.assign(event, more);
    },
    async end(more) {
      if (written) return;
      written = true;
      if (more) Object.assign(event, more);
      event.total_ms = elapsed();

      const file = turnLogPath();
      if (!file) return;
      try {
        await mkdir(path.dirname(file), { recursive: true });
        await appendFile(file, `${JSON.stringify(event)}\n`, "utf8");
      } catch (error) {
        /* Logging must never break a turn. */
        console.error("Companion turn log could not be written:", error);
      }
    },
  };
}
