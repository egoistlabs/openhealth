import { NextRequest, NextResponse } from "next/server";
import { answerQuestion } from "@/lib/brain/answer";
import type { ChatTurn } from "@/lib/brain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 2_000;
const MAX_NUMBERS_LENGTH = 4_000;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_LENGTH = 8_000;
const TONES = ["gentle", "direct"] as const;
type Tone = (typeof TONES)[number];

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

function validateHistory(value: unknown): ChatTurn[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;

  const turns: ChatTurn[] = [];
  for (const item of value.slice(-MAX_HISTORY_TURNS)) {
    if (!isPlainObject(item)) return null;
    const role = item.role;
    const text = item.text;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string") return null;
    if (!text.trim() || text.length > MAX_MESSAGE_LENGTH) return null;
    turns.push({ role, text: text.trim() });
  }

  try {
    if (JSON.stringify(turns).length > MAX_HISTORY_LENGTH) return null;
  } catch {
    return null;
  }
  return turns;
}

function validateTone(value: unknown): Tone {
  return TONES.includes(value as Tone) ? (value as Tone) : "gentle";
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    if (!isPlainObject(body)) {
      return NextResponse.json({ error: "A JSON object is required." }, { status: 400 });
    }

    const message = body.message;
    if (
      typeof message !== "string" ||
      !message.trim() ||
      message.length > MAX_MESSAGE_LENGTH
    ) {
      return NextResponse.json(
        { error: `Message must be between 1 and ${MAX_MESSAGE_LENGTH} characters.` },
        { status: 400 },
      );
    }

    const numbers = validateNumbers(body.numbers);
    if (!numbers) {
      return NextResponse.json(
        { error: "Numbers must be a JSON object no larger than 4 KB." },
        { status: 400 },
      );
    }

    const history = validateHistory(body.history);
    if (!history) {
      return NextResponse.json(
        {
          error: `History must be an array of at most ${MAX_HISTORY_TURNS} turns (role "user" or "assistant") no larger than 8 KB.`,
        },
        { status: 400 },
      );
    }

    const tone = validateTone(body.tone);

    const result = await answerQuestion({ question: message.trim(), numbers, history, tone });
    return NextResponse.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "The AI request timed out." }, { status: 504 });
    }
    console.error("AI chat pipeline error:", error);
    return NextResponse.json(
      { error: "Unable to complete the AI request. Check that Ollama is running locally." },
      { status: 502 },
    );
  }
}
