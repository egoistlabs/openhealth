import { NextRequest, NextResponse } from "next/server";
import { summarizeDailyCheckin, type DailyFlag } from "@/lib/brain/tasks/daily";
import { providerHint } from "@/lib/llm/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FLAGS = 10;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function parseFlags(value: unknown): DailyFlag[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FLAGS) {
    return null;
  }

  const flags: DailyFlag[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) return null;
    const { measure, change, action } = entry;
    if (
      typeof measure !== "string" || !measure.trim() || measure.length > 100 ||
      typeof change !== "string" || !change.trim() || change.length > 300 ||
      typeof action !== "string" || !action.trim() || action.length > 300
    ) {
      return null;
    }
    flags.push({
      measure: measure.trim(),
      change: change.trim(),
      action: action.trim(),
    });
  }
  return flags;
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const flags = isPlainObject(body) ? parseFlags(body.flags) : null;
    if (!flags) {
      return NextResponse.json(
        {
          error:
            "flags must be 1-10 items with measure, change and action strings.",
        },
        { status: 400 },
      );
    }

    const result = await summarizeDailyCheckin(flags);
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "The AI request timed out." }, { status: 504 });
    }
    console.error("Daily summary error:", error);
    return NextResponse.json(
      { error: `Unable to build the daily summary. ${providerHint()}` },
      { status: 502 },
    );
  }
}
