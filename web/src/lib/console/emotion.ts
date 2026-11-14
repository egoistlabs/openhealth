/* Which face the companion shows, chosen from the scenario, not from words in the reply.
   One place to tune it. The avatar cross-fades between faces.

   | Scenario                                              | Face        |
   | ----------------------------------------------------- | ----------- |
   | Person is typing, or holding the mic                   | listening   |
   | Model is working on an answer (before it is verified)  | thinking    |
   | Reply escalates a red flag (C8)                        | concerned   |
   | Reply is "I don't have that on board" (C11)            | concerned   |
   | Reply while a measure is on Act                        | concerned   |
   | Reply while a measure is on Watch                      | listening   |
   | Reply while everything is within normal                | happy       |
   | Model offline, or the person stopped the reply         | neutral     |
   | Resting, a measure on Act                              | concerned   |
   | Resting, otherwise                                     | neutral     |
*/
import type { ConvoRow, State } from "./data";

export type Emotion = "neutral" | "happy" | "curious" | "thinking" | "listening" | "surprised" | "concerned";

/** Resting face between replies, from the person's own worst status. */
export function restEmotion(worst: State): Emotion {
  return worst === "act" ? "concerned" : "neutral";
}

/** Face held while the companion is not speaking: null means "rest". */
export function holdEmotion(p: { working: boolean; listening: boolean; typing: boolean }): Emotion | null {
  if (p.working) return "thinking";
  if (p.listening || p.typing) return "listening";
  return null;
}

/** Face for a reply the companion is about to speak (only verified replies are spoken). */
export function replyEmotion(row: ConvoRow, worst: State): Emotion {
  if (row.escalation) return "concerned";
  if (row.noAnswer) return "concerned";
  if (row.offline || row.stopped) return "neutral";
  if (worst === "act") return "concerned";
  if (worst === "watch") return "listening";
  return "happy";
}
