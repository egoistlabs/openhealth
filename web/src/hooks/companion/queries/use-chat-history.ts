"use client";

import { useMemo } from "react";
import type { ChatTurn } from "@/lib/brain/types";
import type { CompanionUIMessage } from "@/lib/chat/types";
import { useConsole } from "@/components/console/ConsoleProvider";

/* The turns before the current question, taken from the conversation log.
   Only what was actually said counts: parsed rows and the summary block stay out.
   The row for the message just typed is not here yet (state has not committed),
   which is what we want — the current question is sent separately. */
export function useChatHistory(limit = 6): ChatTurn[] {
  const { convo } = useConsole();
  return useMemo(() => {
    const rows = convo().filter(
      (r) => (r.who === "you" || r.who === "companion") && r.text,
    );
    return rows.slice(-limit).map((r) => ({
      role: r.who === "you" ? ("user" as const) : ("assistant" as const),
      text: r.text!,
    }));
  }, [convo, limit]);
}

/* Seeds useChat so the model still sees the conversation that was already in
   the log when the companion was opened. */
export function toSeedMessages(
  turns: ChatTurn[],
  sol: number,
): CompanionUIMessage[] {
  return turns.map((turn, index) => ({
    id: `seed-${sol}-${index}`,
    role: turn.role === "user" ? "user" : "assistant",
    parts: [{ type: "text", text: turn.text }],
  }));
}
