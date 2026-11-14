import { loadStage } from "../loader.ts";
import { generateJson } from "../../ollama/client.ts";
import { numbersIn, sentencesIn } from "../../text.ts";

export type CrewNumbers = Record<string, number | string | boolean | null>;

export type CrewSummaryResult = {
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

const INDIVIDUAL_KEY_PATTERN =
  /(name|crew[_-]?member|astronaut|journal|conversation|transcript|note|individual|email|id$)/i;

/**
 * C7: the crew view must read crew-level numbers only. Reject individual or
 * free-text fields before the model is ever called.
 */
export function isAggregateOnly(crew: CrewNumbers): boolean {
  for (const [key, value] of Object.entries(crew)) {
    if (INDIVIDUAL_KEY_PATTERN.test(key)) return false;
    if (
      value !== null &&
      typeof value !== "number" &&
      typeof value !== "string" &&
      typeof value !== "boolean"
    ) {
      return false;
    }
  }
  return true;
}

function validateRaw(value: unknown): { summary: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const summary = (value as Record<string, unknown>).summary;
  if (typeof summary !== "string" || !summary.trim()) return null;
  return { summary: summary.trim() };
}

function checkSummary(
  summary: string,
  crew: CrewNumbers,
): { verified: boolean; issues: string[] } {
  const issues: string[] = [];
  const sentenceCount = sentencesIn(summary).length;
  if (sentenceCount < 2 || sentenceCount > 3) {
    issues.push(`expected 2-3 sentences, found ${sentenceCount}`);
  }

  const allowedNumbers = numbersIn(JSON.stringify(crew));
  for (const number of numbersIn(summary)) {
    if (!allowedNumbers.has(number)) issues.push(`invented number: ${number}`);
  }

  return { verified: issues.length === 0, issues };
}

function fallbackSummary(crew: CrewNumbers): string {
  const parts = Object.entries(crew)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`);
  return parts.length > 0
    ? `Crew-level numbers only: ${parts.join("; ")}. See the crew tiles for the full picture.`
    : "There are not enough answers yet for a crew summary.";
}

/**
 * C7: a summary of crew-level numbers. Individual data is rejected in code, and
 * the model is told to work from aggregates only.
 */
export async function summarizeCrew(
  crew: CrewNumbers,
): Promise<CrewSummaryResult> {
  const instructions = (await loadStage("crew-summary")).context.join("\n\n");
  try {
    const { data } = await generateJson({
      messages: [
        { role: "system", content: instructions },
        {
          role: "user",
          content: `CREW-LEVEL NUMBERS (aggregates only):\n${JSON.stringify(crew)}`,
        },
      ],
      schema: SUMMARY_SCHEMA,
      validate: validateRaw,
      retryHint:
        "Your previous response was not valid JSON. Return only {\"summary\": \"...\"}.",
      temperature: 0.2,
      numPredict: 200,
    });

    const check = checkSummary(data.summary, crew);
    if (check.verified) {
      return { summary: data.summary, verified: true, issues: [], fallback: false };
    }
    return {
      summary: fallbackSummary(crew),
      verified: false,
      issues: check.issues,
      fallback: true,
    };
  } catch {
    return {
      summary: fallbackSummary(crew),
      verified: false,
      issues: ["the model did not return a usable summary"],
      fallback: true,
    };
  }
}
