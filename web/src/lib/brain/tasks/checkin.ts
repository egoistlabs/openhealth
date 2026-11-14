import { loadStage } from "../loader.ts";
import { generateJson } from "../../llm/client.ts";

/**
 * The check-in subset of the B1 data shape (stories A1 / C3): sleep and wake
 * time, mood, workload, teamwork and shared meal. B1 is owned by the core loop;
 * when the agreed shape lands, this subset should be aligned to it.
 */
export type CheckinFields = {
  sleep_time?: string;
  wake_time?: string;
  mood?: number;
  workload?: number;
  teamwork?: number;
  shared_meal?: boolean;
};

export type CheckinParseResult = {
  complete: boolean;
  fields: CheckinFields;
  unclear: string[];
  impossible: string[];
  question: string | null;
};

/** The question the companion has open. The wording matches what it says in the check-in. */
export const CHECKIN_QUESTIONS = {
  sleep: {
    fields: ["sleep_time", "wake_time"],
    ask: "When did you fall asleep, and when did you wake up?",
  },
  mood: { fields: ["mood"], ask: "How's your mood today, 1 to 5?" },
  workload: {
    fields: ["workload"],
    ask: "How heavy was today, 1 to 5? Count both workload and stress.",
  },
  teamwork: {
    fields: ["teamwork"],
    ask: "How well did the crew work together, 1 to 5?",
  },
  shared_meal: { fields: ["shared_meal"], ask: "Did you eat with anyone today?" },
} as const satisfies Record<string, { fields: readonly (keyof CheckinFields)[]; ask: string }>;
export type CheckinQuestion = keyof typeof CHECKIN_QUESTIONS;

export type CheckinParseContext = {
  /** The question the answer replies to. Without it, the answer is read as a free check-in. */
  asked?: CheckinQuestion;
  /** The crew member's usual value for that question, in words ("mood 4"). */
  usual?: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const RATING_FIELDS = ["mood", "workload", "teamwork"] as const;
const RATING_LABELS: Record<(typeof RATING_FIELDS)[number], string> = {
  mood: "mood",
  workload: "workload",
  teamwork: "teamwork",
};

const CHECKIN_SCHEMA = {
  type: "object",
  properties: {
    sleep_time: { type: ["string", "null"], description: "24-hour HH:MM or null" },
    wake_time: { type: ["string", "null"], description: "24-hour HH:MM or null" },
    mood: { type: ["integer", "null"], description: "1 to 5 or null" },
    workload: { type: ["integer", "null"], description: "1 to 5 or null" },
    teamwork: { type: ["integer", "null"], description: "1 to 5 or null" },
    shared_meal: { type: ["boolean", "null"] },
  },
  required: [
    "sleep_time",
    "wake_time",
    "mood",
    "workload",
    "teamwork",
    "shared_meal",
  ],
  additionalProperties: false,
};

/**
 * Shape-only validation, so that out-of-range values reach the range checks
 * below instead of causing a whole-response retry. The companion must be able
 * to say "that value is impossible" (C3), not fail the request.
 */
type RawCheckin = {
  sleep_time: string | null;
  wake_time: string | null;
  mood: number | null;
  workload: number | null;
  teamwork: number | null;
  shared_meal: boolean | null;
};

/**
 * With a question open the model is asked for less: whether the question was
 * answered at all, then only that question's fields. A small model decides
 * "did they answer?" first, and has no other fields to fill by mistake.
 */
function askedSchema(fields: readonly string[]) {
  const properties: Record<string, unknown> = {
    answered: {
      type: "boolean",
      description: "false if they did not answer the question asked",
    },
  };
  for (const field of fields) {
    properties[field] =
      CHECKIN_SCHEMA.properties[field as keyof typeof CHECKIN_SCHEMA.properties];
  }
  return {
    type: "object",
    properties,
    required: ["answered", ...fields],
    additionalProperties: false,
  };
}

/** The person pointed at their own normal ("same as usual", "later than normal"). */
const USUAL_PATTERN = /\b(usual|usually|normal|normally|same|typical|typically|regular|always)\b/i;

function validateRaw(
  value: unknown,
  askedFields?: readonly string[],
): RawCheckin | null {
  if (typeof value !== "object" || value === null) return null;
  let record = value as Record<string, unknown>;
  if (askedFields) {
    if (typeof record.answered !== "boolean") return null;
    if (Object.keys(record).some((key) => key !== "answered" && !askedFields.includes(key))) return null;
    if (askedFields.some((key) => !(key in record))) return null;
    /* not answered: nothing is kept, whatever else the model wrote */
    record = record.answered
      ? Object.fromEntries(askedFields.map((key) => [key, record[key]]))
      : {};
  }
  const allowed = Object.keys(CHECKIN_SCHEMA.properties);
  if (Object.keys(record).some((key) => !allowed.includes(key))) return null;
  record = { ...Object.fromEntries(allowed.map((key) => [key, null])), ...record };

  const timeOk = (candidate: unknown) =>
    candidate === null || typeof candidate === "string";
  if (!timeOk(record.sleep_time) || !timeOk(record.wake_time)) return null;

  const ratingOk = (candidate: unknown) =>
    candidate === null ||
    (typeof candidate === "number" && Number.isInteger(candidate));
  if (
    !ratingOk(record.mood) ||
    !ratingOk(record.workload) ||
    !ratingOk(record.teamwork)
  ) {
    return null;
  }

  if (record.shared_meal !== null && typeof record.shared_meal !== "boolean") {
    return null;
  }

  return {
    sleep_time: (record.sleep_time as string | null) ?? null,
    wake_time: (record.wake_time as string | null) ?? null,
    mood: (record.mood as number | null) ?? null,
    workload: (record.workload as number | null) ?? null,
    teamwork: (record.teamwork as number | null) ?? null,
    shared_meal: (record.shared_meal as boolean | null) ?? null,
  };
}

function clarificationQuestion(unclear: string[], impossible: string[]): string {
  const parts: string[] = [];
  if (unclear.length > 0) parts.push(`I didn't catch ${unclear.join(", ")}`);
  if (impossible.length > 0) {
    parts.push(`${impossible.join(", ")} must be within the allowed range`);
  }
  const sentence = `${parts.join(", and ")}. Could you say that again?`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/**
 * C3: turn a spoken or typed check-in answer into B1 numbers. The model reads
 * the answer the way a person would ("pretty good" is a mood of 4), helped by
 * the question that was asked and the crew member's usual value. Range checking
 * is done here in code, and the app reads the value back before it is saved.
 */
export async function parseCheckinAnswer(
  text: string,
  context: CheckinParseContext = {},
): Promise<CheckinParseResult> {
  const asked = context.asked ? CHECKIN_QUESTIONS[context.asked] : null;
  const lead = asked
    ? `QUESTION ASKED: ${asked.ask}\n` +
      /* sent only when they refer to it, so the model cannot fall back on it */
      (context.usual && USUAL_PATTERN.test(text) ? `THEIR USUAL: ${context.usual}\n` : "")
    : "";
  const instructions = (await loadStage("checkin-parse")).context.join("\n\n");
  const { data } = await generateJson({
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: `${lead}CHECK-IN ANSWER:\n${text}` },
    ],
    schema: asked ? askedSchema(asked.fields) : CHECKIN_SCHEMA,
    validate: (value) => validateRaw(value, asked?.fields),
    retryHint:
      "Your previous response was not valid JSON for the check-in schema. " +
      "Return every field asked for, using null when the answer says nothing about it.",
    temperature: 0,
    maxOutputTokens: 200,
  });

  const fields: CheckinFields = {};
  const unclear: string[] = [];
  const impossible: string[] = [];
  /* With a question open, only its own fields can be missing or wrong. */
  const wanted = (key: keyof CheckinFields) =>
    !asked || (asked.fields as readonly string[]).includes(key);

  const checkTime = (value: string | null, label: string, key: "sleep_time" | "wake_time") => {
    if (value === null) {
      if (wanted(key)) unclear.push(label);
    } else if (TIME_PATTERN.test(value)) {
      fields[key] = value;
    } else if (wanted(key)) {
      impossible.push(`${label} (use 24-hour HH:MM)`);
    }
  };
  checkTime(data.sleep_time, "your sleep time", "sleep_time");
  checkTime(data.wake_time, "your wake time", "wake_time");

  for (const field of RATING_FIELDS) {
    const value = data[field];
    if (value === null) {
      if (wanted(field)) unclear.push(`your ${RATING_LABELS[field]} rating (1 to 5)`);
    } else if (value >= 1 && value <= 5) {
      fields[field] = value;
    } else if (wanted(field)) {
      impossible.push(`your ${RATING_LABELS[field]} rating (1 to 5)`);
    }
  }

  if (data.shared_meal === null) {
    if (wanted("shared_meal")) unclear.push("whether you shared a meal");
  } else {
    fields.shared_meal = data.shared_meal;
  }

  const complete = unclear.length === 0 && impossible.length === 0;
  return {
    complete,
    fields,
    unclear,
    impossible,
    question: complete ? null : clarificationQuestion(unclear, impossible),
  };
}
