"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isTextUIPart } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractPartialAnswer } from "@/lib/chat/partial-answer";
import type { CompanionUIMessage, CompanionVerdict } from "@/lib/chat/types";
import { useConsole } from "@/components/console/ConsoleProvider";
import { useCompanionNumbers } from "../queries/use-companion-numbers";
import { toSeedMessages, useChatHistory } from "../queries/use-chat-history";

export function messageText(message?: CompanionUIMessage): string {
  if (!message) return "";
  return message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("");
}

export function verdictOf(
  message?: CompanionUIMessage,
): CompanionVerdict | undefined {
  return message?.parts.find((part) => part.type === "data-verdict")?.data;
}

/**
 * One companion turn end to end: seeds useChat from the existing log, streams
 * the grounded answer, then commits the server's verdict to the log. Only the
 * verdict (never the unverified draft) is written to the conversation.
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
    addLines: c.addLines,
    onOffline: options.onOffline,
    question: "",
  });
  useEffect(() => {
    latest.current.numbers = numbers;
    latest.current.tone = s.tone;
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
    onFinish: ({ message, isAbort, isError, isDisconnect }) => {
      /* Errors and disconnects never persist unverified text; onError supplies
         the offline fallback. Only an explicit user stop commits a draft. */
      if (isError || isDisconnect) return;

      const verdict = verdictOf(message);
      const text = verdict?.message ?? extractPartialAnswer(messageText(message));
      latest.current.addLines([
        {
          who: "companion",
          text: text || "I stopped before answering.",
          sources: verdict?.sources,
          escalation: verdict?.escalation?.required,
          noAnswer: verdict
            ? !verdict.can_answer && !verdict.escalation?.required
            : undefined,
          stopped: isAbort || undefined,
        },
      ]);
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
        { body: { numbers: latest.current.numbers, tone: latest.current.tone } },
      );
    },
    [sendMessage],
  );

  const lastAssistant = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant"),
    [messages],
  );
  const lastText = messageText(lastAssistant);
  const verdict = verdictOf(lastAssistant);
  const streaming = status === "submitted" || status === "streaming";

  return {
    messages,
    status,
    streaming,
    liveText: streaming ? extractPartialAnswer(lastText) : "",
    verdict,
    error,
    send,
    stop,
  };
}
