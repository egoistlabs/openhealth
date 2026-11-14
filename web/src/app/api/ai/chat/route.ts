
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL;
const OLLAMA_MODEL = process.env.OLLAMA_MODEL;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const message = body.message;
    // validate
    if (
      typeof message !== "string" ||
      !message.trim()
    ) {
      return NextResponse.json(
        { error: "Message is required." },
        { status: 400 }
      );
    }

    // send request to ollama
    const response = await fetch(
      `${OLLAMA_BASE_URL}/api/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [
                {
                role: "user",
                content: message.trim(),
                },
            ],
            stream: false,
            keep_alive: "10m",
            options: {
                num_predict: 256,
                num_ctx: 4096,
            },
            }),
        signal: AbortSignal.timeout(180000),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const errorDetails = await response.text();

      console.error("Ollama Error:", errorDetails);

      return NextResponse.json(
        {
          error: "Ollama request failed.",
          details: errorDetails,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Return AI response
    return NextResponse.json({
      success: true,
      model: data.model,
      message: data.message?.content ?? "",
    });
  } catch (error) {
    console.error("AI API Error:", error);

    if (
      error instanceof Error &&
      error.name === "TimeoutError"
    ) {
      return NextResponse.json(
        { error: "The AI request timed out." },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: "Unable to communicate with Ollama.",
      },
      { status: 500 }
    );
  }
}
