"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Presence } from "@/lib/console/presence";
import { OrbCanvas, usePresenceState } from "./Orb";
import { COMPANION_NAME } from "@/lib/console/data";

/* The companion's face (A7). One still picture, animated as a cut-out puppet:
   - speaking: the jaw drops with the voice level and a mouth opening appears in the gap
   - idle: slow breathing; listening: head tilts in; working: head tilts the other way
   - a ring around the face shows the state; under reduced motion the face stays still
   Optional extra pictures (same size and framing, only the face changed) can be added to
   PERSONA below: a blink frame, and mouth frames that replace the puppet jaw when present.
   If the picture fails to load, the orb is shown instead (A7 fallback). */

export const PERSONA: {
  base: string;
  blink?: string;
  mouthHalf?: string;
  mouthOpen?: string;
} = {
  base: "/companion/base.png",
  // blink: "/companion/blink.png",
  // mouthHalf: "/companion/mouth-half.png",
  // mouthOpen: "/companion/mouth-open.png",
};

/* Geometry of base.png (554 × 554), measured on the picture. If the picture changes, re-measure these. */
const S = 554;
/* the smile line, left corner to right corner */
const SMILE: Array<[number, number]> = [[221, 267], [232, 273], [245, 278], [258, 281], [272, 281.5], [286, 280], [300, 276], [313, 270], [327, 263]];
const pts = (a: number[][]) => a.map((p) => p.join(",")).join(" ");
/* hard cut along the smile line (the top of the moving jaw); generous everywhere else */
const CUT = pts([...SMILE.map(([x, y]) => [x, y + 1]), [327, 240], [400, 240], [400, 420], [150, 420], [150, 240], [221, 240]]);
/* the lower face, blurred into a soft mask so the jaw blends into the cheeks and chin */
const SOFT = pts([[214, 250], [340, 250], [344, 290], [338, 312], [320, 330], [298, 340], [276, 343], [254, 339], [234, 327], [218, 309], [210, 288]]);
const PIVOT = "277 330"; // head turns around the neck
const MAX_OPEN = 7;      // jaw drop at full voice, in image pixels
const VIEW = "87 8 380 380"; // visible part of the picture: head and shoulders

const taper = (i: number) => Math.sin((Math.PI * i) / (SMILE.length - 1));
function mouthPath(open: number, lift = 0) {
  const top = SMILE.map(([x, y]) => `${x} ${y - 1.5}`);
  const bottom = SMILE.slice().reverse().map(([x, y], j) => `${x} ${y + lift + open * taper(SMILE.length - 1 - j)}`);
  return `M${top.join(" L")} L${bottom.join(" L")} Z`;
}

export function Persona() {
  const state = usePresenceState();
  const [failed, setFailed] = useState(false);
  const clipId = useId().replace(/:/g, "");
  const head = useRef<SVGGElement>(null);
  const jaw = useRef<SVGGElement>(null);
  const mouth = useRef<SVGPathElement>(null);
  const teeth = useRef<SVGPathElement>(null);
  const blink = useRef<SVGImageElement>(null);
  const half = useRef<SVGImageElement>(null);
  const openImg = useRef<SVGImageElement>(null);

  useEffect(() => {
    let open = 0, tilt = 0, nextBlink = 0, blinkUntil = 0;
    const frames = !!(PERSONA.mouthHalf || PERSONA.mouthOpen);
    return Presence.onFrame(({ t, amp, state: st, still }) => {
      // mouth: only while the companion speaks, never while it listens to you
      const want = !still && st === "speaking" ? Math.max(0, Math.min(1, (amp - 0.08) / 0.55)) : 0;
      open += (want - open) * 0.35;
      const tiltTo = still ? 0 : st === "listening" ? -2.2 : st === "working" ? 1.6 : 0;
      tilt += (tiltTo - tilt) * 0.08;
      const breathe = still ? 0 : Math.sin(t * 1.3) * 1.2;
      const nod = still || st !== "speaking" ? 0 : Math.sin(t * 2.4) * 0.5 * (0.4 + open);
      head.current?.setAttribute("transform", `translate(0 ${breathe.toFixed(2)}) rotate(${(tilt + nod).toFixed(2)} ${PIVOT})`);

      if (frames) {
        // picture mode: cross-fade the mouth frames by voice level
        half.current?.setAttribute("opacity", open > 0.15 && open < 0.55 ? "1" : "0");
        openImg.current?.setAttribute("opacity", open >= 0.55 ? "1" : "0");
      } else {
        // puppet mode: drop the jaw and show the mouth opening behind it
        const d = open * MAX_OPEN;
        jaw.current?.setAttribute("transform", `translate(0 ${d.toFixed(2)})`);
        mouth.current?.setAttribute("d", mouthPath(d));
        teeth.current?.setAttribute("d", mouthPath(Math.min(1.8, d * 0.25)));
        mouth.current?.setAttribute("opacity", d > 0.3 ? "1" : "0");
        teeth.current?.setAttribute("opacity", d > 1.5 ? "0.75" : "0");
      }

      // blink every 3–6 s, if a blink frame exists
      if (PERSONA.blink && !still) {
        if (t > nextBlink) { blinkUntil = t + 0.12; nextBlink = t + 3 + Math.random() * 3; }
        blink.current?.setAttribute("opacity", t < blinkUntil ? "1" : "0");
      }
    });
  }, []);

  if (failed) return <div className="avatar"><OrbCanvas label /></div>;

  return (
    <div className="persona" data-state={state}>
      {/* framed on the head and shoulders, so the mouth is easy to see */}
      <svg viewBox={VIEW} role="img" aria-label={`${COMPANION_NAME}, ${state}`}>
        <defs>
          <clipPath id={`cut-${clipId}`}><polygon points={CUT} /></clipPath>
          <filter id={`soft-${clipId}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7" /></filter>
          <mask id={`jaw-${clipId}`} maskUnits="userSpaceOnUse" x="0" y="0" width={S} height={S}>
            <polygon points={SOFT} fill="white" filter={`url(#soft-${clipId})`} />
          </mask>
          <linearGradient id={`mouth-${clipId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a1213" /><stop offset="1" stopColor="#5a2a2a" />
          </linearGradient>
        </defs>
        <g ref={head}>
          <image href={PERSONA.base} width={S} height={S} onError={() => setFailed(true)} />
          {/* mouth opening and upper teeth, revealed as the jaw drops (artwork colours, part of the picture) */}
          <path ref={mouth} fill={`url(#mouth-${clipId})`} opacity="0" />
          <path ref={teeth} fill="#e8ded6" opacity="0" />
          <g ref={jaw}>
            <g clipPath={`url(#cut-${clipId})`}>
              <image href={PERSONA.base} width={S} height={S} mask={`url(#jaw-${clipId})`} />
            </g>
          </g>
          {PERSONA.mouthHalf ? <image ref={half} href={PERSONA.mouthHalf} width={S} height={S} opacity="0" /> : null}
          {PERSONA.mouthOpen ? <image ref={openImg} href={PERSONA.mouthOpen} width={S} height={S} opacity="0" /> : null}
          {PERSONA.blink ? <image ref={blink} href={PERSONA.blink} width={S} height={S} opacity="0" /> : null}
        </g>
      </svg>
    </div>
  );
}

/* Small face for the corner button that opens the companion. */
export function PersonaThumb() {
  const state = usePresenceState();
  return (
    <span className="persona persona--thumb" data-state={state}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PERSONA.base} alt="" width={56} height={56} />
    </span>
  );
}
