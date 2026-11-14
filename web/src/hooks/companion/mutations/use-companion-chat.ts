"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  companionDataSchemas,
  metadataSchema,
  type CompanionProgress,
  type CompanionUIMessage,
  type CompanionVerdict,
} from "@/lib/chat/types";
import { useConsole } from "@/components/console/ConsoleProvider";
import { useCompanionNumbers } from "../queries/use-companion-numbers";
import { toSeedMessages, useChatHistory } from "../queries/use-chat-history";

export function verdictOf(
  message?: CompanionUIMessage,
): CompanionVerdict | undefined {
  return message?.parts.find((part) => part.type === "data-verdict")?.data;
}

function progressOf(message?: CompanionUIMessage): CompanionProgress["step"] | undefined {
  return message?.parts.find((part) => part.type === "data-progress")?.data.step;
}

/**
 * One companion turn end to end: seeds useChat from the existing log, follows
 * the turn's progress, then commits the server's verdict to the log.
 *
 * Only the verdict is ever shown, spoken or saved. The server does not send the
 * model's unchecked draft, so there is no draft to keep when a turn is stopped.
 */
export function useCompanionChat(options: { onOffline: (question: string) => void }) {
  const c = useConsole();
  const { s } = c;
  const numbers = useCompanionNumbers();
  const history = useChatHistory();
  const [seed] = useState(() => toSeedMessages(history, s.sol));

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai/chat",
        /* only the last six exchanges are useful to the prompt; keep the body small */
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...body, messages: messages.slice(-12) },
        }),
      }),
    [],
  );

  /* callbacks are configured once, so read live values through refs */
  const latest = useRef({
    numbers,
    tone: s.tone,
    crew: s.me,
    addLines: c.addLines,
    onOffline: options.onOffline,
    question: "",
  });
  useEffect(() => {
    latest.current.numbers = numbers;
    latest.current.tone = s.tone;
    latest.current.crew = s.me;
    latest.current.addLines = c.addLines;
    latest.current.onOffline = options.onOffline;
  });

  const {
    messages,
    sendMessage,
    stop,
    status,
    error,
  } = useChat<CompanionUIMessage>({
    id: `companion-${s.me}-${s.sol}`,
    messages: seed,
    transport,
    /* every part the server sends is validated before it reaches the screen */
    dataPartSchemas: companionDataSchemas,
    messageMetadataSchema: metadataSchema,
    onFinish: ({ message, isAbort, isError, isDisconnect }) => {
      /* onError supplies the offline reply for errors and disconnects */
      if (isError || isDisconnect) return;

      const verdict = verdictOf(message);
      if (verdict) {
        latest.current.addLines([
          {
            who: "companion",
            text: verdict.message,
            sources: verdict.sources,
            facts: verdict.rows,
            action: verdict.action ?? undefined,
            escalation: verdict.escalation.required || undefined,
            noAnswer: !verdict.can_answer && !verdict.escalation.required ? true : undefined,
          },
        ]);
        return;
      }

      /* No verdict. Stop was pressed: say so, and keep nothing of the answer. */
      if (isAbort) {
        latest.current.addLines([
          { who: "companion", text: "Stopped before I answered.", stopped: true },
        ]);
        return;
      }

      /* The stream ended without a verdict and without an error. The server
         never does this on purpose, so treat it like the model being off. */
      latest.current.onOffline(latest.current.question);
    },
    onError: () => {
      latest.current.onOffline(latest.current.question);
    },
  });

  const send = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question) return;
      latest.current.question = question;
      void sendMessage(
        { text: question },
        {
          body: {
            numbers: latest.current.numbers,
            tone: latest.current.tone,
            /* for the local turn log only; the model is never given it */
            crew: latest.current.crew,
          },
        },
      );
    },
    [sendMessage],
  );

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages],
  );
  const streaming = status === "submitted" || status === "streaming";

  return {
    messages,
    status,
    streaming,
    /* where the running turn is: searching, thinking, writing, checking */
    progress: streaming ? progressOf(lastAssistant) ?? "searching" : undefined,
    verdict: verdictOf(lastAssistant),
    error,
    send,
    stop,
  };
}
