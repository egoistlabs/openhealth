import { NextRequest, NextResponse } from "next/server";
import { parseCheckinAnswer } from "@/lib/brain/tasks/checkin";
import { providerHint } from "@/lib/llm/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_LENGTH = 2_000;

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const text =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).text
        : undefined;

    if (
      typeof text !== "string" ||
      !text.trim() ||
      text.length > MAX_TEXT_LENGTH
    ) {
      return NextResponse.json(
        { error: `Text must be between 1 and ${MAX_TEXT_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const result = await parseCheckinAnswer(text.trim());
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "The AI request timed out." }, { status: 504 });
    }
    console.error("Check-in parsing error:", error);
    return NextResponse.json(
      { error: `Unable to parse the check-in. ${providerHint()}` },
      { status: 502 },
    );
  }
}
