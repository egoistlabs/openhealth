"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatTurn } from "@/lib/brain/types";
import type { ConvoRow } from "@/lib/console/data";
import { useConsole } from "@/components/console/ConsoleProvider";
import { useCompanionNumbers } from "../queries/use-companion-numbers";

export type ChatResponse = {
  success?: boolean;
  error?: string;
  can_answer: boolean;
  message: string;
  sources: NonNullable<ConvoRow["sources"]>;
  escalation: { required: boolean; categories?: string[] };
};

export type SendMessageInput = {
  message: string;
  /* turns before this message; the current question itself is never included */
  history?: ChatTurn[];
};

/* The one mutation for companion chat: assembles the grounded request
   (this person's numbers, recent turns, tone) and posts to /api/ai/chat.
   Throws on failure so the caller can decide on the fallback (C9). */
export function useSendMessage() {
  const { s } = useConsole();
  const numbers = useCompanionNumbers();

  /* refs keep the callback stable while always sending the latest numbers and tone */
  const latest = useRef({ numbers, tone: s.tone });
  useEffect(() => {
    latest.current = { numbers, tone: s.tone };
  });

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const send = useCallback(
    async ({ message, history = [] }: SendMessageInput): Promise<ChatResponse> => {
      setPending(true);
      setError(null);
      try {
        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message,
            numbers: latest.current.numbers,
            history,
            tone: latest.current.tone,
          }),
        });
        const data = (await res.json()) as ChatResponse;
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        return data;
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));
        setError(e);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [],
  );

  const reset = useCallback(() => setError(null), []);
  return { send, pending, error, reset };
}
