"use client";

import { useEffect, useRef, useState } from "react";
import { COMPANION_NAME } from "@/lib/console/data";
import { Presence } from "@/lib/console/presence";
import { VegaAvatar, type VegaApi } from "./VegaAvatar";
import { HoldButton, VoiceState, type VState } from "./Voice";

export type PedroLine = { id: number; text: string };

/* The companion inside the check-in: says each question, listens when held, and reads back what it set.
   `line` is what Pedro says now (a new id says it again). `onHeard` gets the transcript; the parent
   answers by setting a new line. With voice off, Pedro still shows the words but stays silent and the mic is disabled. */
export function CheckinPedro({ line, voiceOn, canListen, onHeard }: {
  line: PedroLine;
  voiceOn: boolean;
  /** false on steps with nothing to say (the reaction game, the review) */
  canListen: boolean;
  onHeard: (text: string) => Promise<void>;
}) {
  const vega = useRef<VegaApi | null>(null);
  const [v, setV] = useState<VState>(null);
  const [busy, setBusy] = useState(false);
  const voiceRef = useRef(voiceOn);
  useEffect(() => { voiceRef.current = voiceOn; });

  useEffect(() => {
    vega.current?.speak(line.text, { silent: !voiceRef.current });
  }, [line.id, line.text]);
  useEffect(() => () => { vega.current?.stop(); Presence.setState("idle"); }, []);

  return (
    <div className="pedro" aria-label={COMPANION_NAME}>
      <div className="pedro__face">
        <VegaAvatar onReady={(api) => {
          vega.current = api;
          // the first line was set before the avatar finished loading
          api?.speak(line.text, { silent: !voiceRef.current });
        }} />
      </div>
      <p className="pedro__name">{COMPANION_NAME}</p>
      <p className="pedro__say" aria-live="polite">{line.text}</p>
      <VoiceState v={v} inCheckin />
      {!canListen ? null : voiceOn ? (
        <HoldButton ctx="checkin" quiet live enabled={!busy} setV={setV} label={`Hold to tell ${COMPANION_NAME}`}
          tip="Answer in your own words, e.g. “asleep around midnight, up at seven” or “pretty good today”."
          onStart={() => vega.current?.stop()}
          onPhrase={async (p) => {
            setBusy(true);
            setV({ kind: "working", text: p.text });
            Presence.setState("working");
            try {
              await onHeard(p.text);
              setV(null);
            } finally {
              setBusy(false);
              Presence.setState("idle");
            }
          }} />
      ) : (
        <p className="pedro__off">Voice is off. Turn it on in the companion to answer out loud.</p>
      )}
    </div>
  );
}
