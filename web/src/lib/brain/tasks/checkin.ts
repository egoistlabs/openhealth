import { loadPromptFile } from "../loader.ts";
import { generateJson } from "../../ollama/client.ts";

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

function validateRaw(value: unknown): RawCheckin | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  const allowed = Object.keys(CHECKIN_SCHEMA.properties);
  if (Object.keys(record).some((key) => !allowed.includes(key))) return null;

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
 * C3: turn a spoken or typed check-in answer into B1 numbers. Range checking is
 * done here in code; the model only extracts what was explicitly said.
 */
export async function parseCheckinAnswer(
  text: string,
): Promise<CheckinParseResult> {
  const instructions = await loadPromptFile("checkin-parse");
  const { data } = await generateJson({
    messages: [
      { role: "system", content: instructions },
      { role: "user", content: `CHECK-IN ANSWER:\n${text}` },
    ],
    schema: CHECKIN_SCHEMA,
    validate: validateRaw,
    retryHint:
      "Your previous response was not valid JSON for the check-in schema. " +
      "Return every field, using null when the answer did not state it.",
    temperature: 0,
    numPredict: 200,
  });

  const fields: CheckinFields = {};
  const unclear: string[] = [];
  const impossible: string[] = [];

  const checkTime = (value: string | null, label: string, key: "sleep_time" | "wake_time") => {
    if (value === null) {
      unclear.push(label);
    } else if (TIME_PATTERN.test(value)) {
      fields[key] = value;
    } else {
      impossible.push(`${label} (use 24-hour HH:MM)`);
    }
  };
  checkTime(data.sleep_time, "your sleep time", "sleep_time");
  checkTime(data.wake_time, "your wake time", "wake_time");

  for (const field of RATING_FIELDS) {
    const value = data[field];
    if (value === null) {
      unclear.push(`your ${RATING_LABELS[field]} rating (1 to 5)`);
    } else if (value >= 1 && value <= 5) {
      fields[field] = value;
    } else {
      impossible.push(`your ${RATING_LABELS[field]} rating (1 to 5)`);
    }
  }

  if (data.shared_meal === null) {
    unclear.push("whether you shared a meal");
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
