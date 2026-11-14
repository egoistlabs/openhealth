"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CREW } from "@/lib/console/data";
import { fmtVital, fmtVitalDelta, vitals, type Vital } from "@/lib/console/wearable";
import { StatusMark } from "@/components/ui";
import { CrewPortrait } from "./CrewPortrait";

const SHORT: Record<string, string> = { rhr: "HR", hrv: "HRV", spo2: "SpO₂", temp: "Temp", resp: "Resp" };
const UNIT: Record<string, string> = { rhr: "bpm", hrv: "ms", spo2: "%", temp: "°C", resp: "/min" };
const WORD: Record<Vital["state"], string> = { normal: "Stable", watch: "Watch", act: "Urgent" };

/* Ground: one poster card per crew member (same look as the Crew roster), with last night's wearable
   vitals underneath, each against that person's own normal. Vitals are physiological readings that
   downlink after the one-way light time; journals and conversations still never leave the hab. */
export function GroundCrewCards({ sol }: { sol: number }) {
  const all = useMemo(() => CREW.map((p) => ({ p, vs: vitals(p.id, sol) })), [sol]);
  return (
    <ul className="gcards" aria-label="Crew vitals, last night">
      {all.map(({ p, vs }) => {
        const spec = p.role.includes(",") ? p.role.split(",")[1].trim() : p.role;
        const title = p.role.includes(",") ? p.role.split(",")[0].trim() : null;
        const urgent = vs.filter((v) => v.state === "act").length, off = vs.filter((v) => v.state !== "normal").length;
        const worst: Vital["state"] = urgent ? "act" : off ? "watch" : "normal";
        return (
          <li key={p.id} className={`gcard gcard--${worst}`}>
            <Link href={`/ground/${p.id}`} className="rcard gcard__hero" aria-label={`${p.full}, open shared measures`}>
              <div className="rcard__txt">
                <p className="rcard__name">{p.full}</p>
                <p className="rcard__spec">{spec.charAt(0).toUpperCase() + spec.slice(1)}</p>
                <p className="rcard__meta"><span className="rcard__code">{p.code}</span>{title ? <span>{title}</span> : null}</p>
              </div>
              <div className="rcard__pic"><CrewPortrait person={p} className="rcard__img" bare /></div>
            </Link>
            <div className="gcard__vh">
              <span>Wearable · last night</span>
              <span className={`gcard__sum gcard__sum--${worst}`}>
                {urgent ? `${urgent} urgent${off > urgent ? `, ${off - urgent} watch` : ""}` : off ? `${off} on watch` : "All stable"}
              </span>
            </div>
            <VitalStrip vs={vs} first={p.full.split(" ")[0]} />
          </li>
        );
      })}
    </ul>
  );
}

/* five vitals side by side: short label, last night's value, change from the person's own normal */
export function VitalStrip({ vs, first, className = "" }: { vs: Vital[]; first: string; className?: string }) {
  return (
    <ul className={`gcard__vit ${className}`}>
      {vs.map((v) => (
        <li key={v.key} className={`gvit gvit--${v.state}`} tabIndex={0}
          data-tip={`${v.label}: ${WORD[v.state]}.\nNormal for ${first}: ${fmtVital(v, v.normal)}. Last night: ${fmtVital(v, v.value)} (${fmtVitalDelta(v)}).\n\nHealthy range: ${v.range}`}
          aria-label={`${v.label} ${fmtVital(v, v.value)}, ${fmtVitalDelta(v)} from normal of ${fmtVital(v, v.normal)}, ${WORD[v.state]}`}>
          <span className="gvit__l"><StatusMark state={v.state} />{SHORT[v.key]}</span>
          <span className="gvit__v num">{v.value.toFixed(v.digits)}<small>{UNIT[v.key]}</small></span>
          <span className="gvit__d num">{fmtVitalDelta(v)}</span>
        </li>
      ))}
    </ul>
  );
}
