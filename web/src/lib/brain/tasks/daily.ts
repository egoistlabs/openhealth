import { loadStage } from "../loader.ts";
import { generateJson } from "../../llm/client.ts";
import { mentionsSubstance, numbersIn, sentencesIn } from "../../text.ts";

export type DailyFlag = {
  measure: string;
  change: string;
  action: string;
};

export type DailySummaryResult = {
  summary: string;
  verified: boolean;
  issues: string[];
  fallback: boolean;
};

const SUMMARY_SCHEMA = {
  type: "object",
  properties: { summary: { type: "string" } },
  required: ["summary"],
  additionalProperties: false,
};

function validateRaw(value: unknown): { summary: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const summary = (value as Record<string, unknown>).summary;
  if (typeof summary !== "string" || !summary.trim()) return null;
  return { summary: summary.trim() };
}

/** C6's format rules, checked in code: 2-3 sentences, no invented numbers,
 * and the last sentence must end on the supplied action. */
function checkSummary(
  summary: string,
  flags: DailyFlag[],
): { verified: boolean; issues: string[] } {
  const issues: string[] = [];
  const sentences = sentencesIn(summary);
  if (sentences.length < 2 || sentences.length > 3) {
    issues.push(`expected 2-3 sentences, found ${sentences.length}`);
  }

  const allowedNumbers = numbersIn(JSON.stringify(flags));
  for (const number of numbersIn(summary)) {
    if (!allowedNumbers.has(number)) issues.push(`invented number: ${number}`);
  }

  const lastSentence = sentences.at(-1) ?? "";
  const actions = flags.map((flag) => flag.action);
  if (!actions.some((action) => mentionsSubstance(lastSentence, action))) {
    issues.push("last sentence does not name the suggested action");
  }

  return { verified: issues.length === 0, issues };
}

function fallbackSummary(flags: DailyFlag[]): string {
  const first = flags[0];
  if (!first) return "There are no new flags today.";
  const intro =
    flags.length === 1
      ? `Today's flag is about ${first.measure}: ${first.change}.`
      : `Today there are ${flags.length} flags, starting with ${first.measure}: ${first.change}.`;
  return `${intro} Suggested action: ${first.action}.`;
}

/**
 * C6: a short summary of today's flags and actions. The model phrases it; code
 * enforces the shape and the "ends on the action" rule, and falls back to a
 * deterministic sentence when the model's text breaks those rules.
 */
export async function summarizeDailyCheckin(
  flags: DailyFlag[],
): Promise<DailySummaryResult> {
  const instructions = (await loadStage("daily-summary")).context.join("\n\n");
  try {
    const { data } = await generateJson({
      messages: [
        { role: "system", content: instructions },
        {
          role: "user",
          content: `TODAY'S FLAGS (use only these; do not calculate anything):\n${JSON.stringify(flags)}`,
        },
      ],
      schema: SUMMARY_SCHEMA,
      validate: validateRaw,
      retryHint:
        "Your previous response was not valid JSON. Return only {\"summary\": \"...\"}.",
      temperature: 0.2,
      maxOutputTokens: 200,
    });

    const check = checkSummary(data.summary, flags);
    if (check.verified) {
      return { summary: data.summary, verified: true, issues: [], fallback: false };
    }
    return {
      summary: fallbackSummary(flags),
      verified: false,
      issues: check.issues,
      fallback: true,
    };
  } catch {
    return {
      summary: fallbackSummary(flags),
      verified: false,
      issues: ["the model did not return a usable summary"],
      fallback: true,
    };
  }
}
