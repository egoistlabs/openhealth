import { NextRequest, NextResponse } from "next/server";
import { screenMessage } from "@/lib/brain/safety";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT_LENGTH = 2_000;

/* The safety screening on its own (red flags, support, boundaries: keywords, then the model), for messages
   the companion screen handles without a chat turn, such as "my back hurts" opening the body map. The
   screen calls this first, so a red flag ("my chest hurts", "I want to hurt myself") still escalates. */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const text = typeof body === "object" && body !== null ? (body as Record<string, unknown>).text : undefined;
    if (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ error: `Text must be between 1 and ${MAX_TEXT_LENGTH} characters.` }, { status: 400 });
    }
    const s = await screenMessage(text);
    return NextResponse.json({
      redFlag: s.redFlag,
      support: { matched: s.support.matched },
      boundary: { matched: s.boundary.matched },
    });
  } catch {
    return NextResponse.json({ error: "Screening failed." }, { status: 500 });
  }
}
