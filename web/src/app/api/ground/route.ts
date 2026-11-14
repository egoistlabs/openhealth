import { NextResponse } from "next/server";
import { groundReport } from "@/lib/ground/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Ground view: companion counts, brain version and the newest eval runs. Aggregate only. */
export async function GET() {
  try {
    return NextResponse.json(await groundReport(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Ground report error:", error);
    return NextResponse.json({ error: "Unable to build the ground report." }, { status: 500 });
  }
}
