import { NextRequest, NextResponse } from "next/server";
import {
  isAggregateOnly,
  summarizeCrew,
  type CrewNumbers,
} from "@/lib/brain/tasks/crew";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_KEYS = 20;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function parseCrewNumbers(value: unknown): CrewNumbers | null {
  if (!isPlainObject(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.length > MAX_KEYS) return null;

  const crew: CrewNumbers = {};
  for (const [key, entry] of entries) {
    if (key.length > 60) return null;
    if (
      entry !== null &&
      typeof entry !== "number" &&
      typeof entry !== "string" &&
      typeof entry !== "boolean"
    ) {
      return null;
    }
    if (typeof entry === "string" && entry.length > 120) return null;
    crew[key] = entry;
  }
  return crew;
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const crew = isPlainObject(body) ? parseCrewNumbers(body.crew) : null;
    if (!crew) {
      return NextResponse.json(
        {
          error:
            "crew must be 1-20 crew-level aggregate fields with primitive values.",
        },
        { status: 400 },
      );
    }

    if (!isAggregateOnly(crew)) {
      return NextResponse.json(
        {
          error:
            "The crew summary reads crew-level numbers only. Individual or free-text fields are not accepted.",
        },
        { status: 400 },
      );
    }

    const result = await summarizeCrew(crew);
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "The AI request timed out." }, { status: 504 });
    }
    console.error("Crew summary error:", error);
    return NextResponse.json(
      { error: "Unable to build the crew summary. Check that Ollama is running locally." },
      { status: 502 },
    );
  }
}
