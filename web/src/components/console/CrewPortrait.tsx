"use client";

import { useState } from "react";
import type { CrewMember } from "@/lib/console/data";

/* Official-portrait style picture of a crew member: suited astronaut in front of the moon,
   helmet at their side. Drawn in SVG so no stock photo is needed. Set `photo` on the crew member
   to use a real image instead (falls back to the drawing if it fails to load). */

const LOOK: Record<string, { skin: string; hair: string; long?: boolean }> = {
  okafor: { skin: "#7A4E33", hair: "#1C1512", long: true },
  lindqvist: { skin: "#E9C4A6", hair: "#C9A46A" },
  sato: { skin: "#E2B98F", hair: "#1E1A18" },
  reyes: { skin: "#C48E66", hair: "#3A2418", long: true },
};

/* `bare`: head-and-shoulders cut-out with no moon backdrop or helmet, for poster cards. */
export function CrewPortrait({ person, size = 160, className = "portrait", bare = false }: { person: CrewMember; size?: number; className?: string; bare?: boolean }) {
  const [photoOk, setPhotoOk] = useState(true);
  const h = Math.round(size * 1.2);
  if (person.photo && photoOk) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={className} src={person.photo} width={size} height={h} alt={`Portrait of ${person.full}`}
        onError={() => setPhotoOk(false)} />
    );
  }
  const L = LOOK[person.id] ?? { skin: "#D8AE8A", hair: "#2A211C" };
  return (
    <svg className={className} preserveAspectRatio={bare ? "xMidYMax meet" : "xMidYMin slice"} viewBox={bare ? "36 78 128 162" : "0 0 200 240"} width={size} height={h} role="img" aria-label={`Portrait of ${person.full}`}>
      <defs>
        <radialGradient id={`moon-${person.id}`} cx="45%" cy="40%" r="60%">
          <stop offset="0" stopColor="#8D949C" /><stop offset="1" stopColor="#3B4048" />
        </radialGradient>
        <linearGradient id={`suit-${person.id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#F4F5F2" /><stop offset="1" stopColor="#C9CCCB" />
        </linearGradient>
        <linearGradient id={`visor-${person.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E3A04A" /><stop offset=".55" stopColor="#9C3F1E" /><stop offset="1" stopColor="#3A1A10" />
        </linearGradient>
      </defs>
      {bare ? null : <>{/* backdrop: space + moon */}
      <rect width="200" height="240" fill="#0B0D12" />
      <circle cx="100" cy="100" r="96" fill={`url(#moon-${person.id})`} />
      <g fill="#2F343B" opacity=".55">
        <circle cx="52" cy="70" r="14" /><circle cx="140" cy="48" r="9" /><circle cx="70" cy="140" r="10" /><circle cx="160" cy="120" r="7" />
      </g></>}
      {/* suit body */}
      <path d="M38 240 C40 186 62 166 100 162 C138 166 160 186 162 240 Z" fill={`url(#suit-${person.id})`} />
      <path d="M100 172 V240" stroke="#B5B9B8" strokeWidth="1.5" />
      {/* neck ring */}
      <ellipse cx="100" cy="160" rx="34" ry="11" fill="#1F3E73" />
      <ellipse cx="100" cy="157" rx="27" ry="7" fill="#0E1B33" />
      {/* head */}
      <rect x="90" y="136" width="20" height="22" rx="6" fill={L.skin} />
      <ellipse cx="100" cy="112" rx="24" ry="29" fill={L.skin} />
      <path d={L.long
        ? "M74 114 C70 78 130 74 126 114 C128 98 118 88 100 88 C82 88 72 98 74 114 Z M74 112 C72 130 76 142 80 146 L78 112 Z M126 112 C128 130 124 142 120 146 L122 112 Z"
        : "M76 108 C74 82 126 80 124 108 C122 94 112 90 100 90 C88 90 78 94 76 108 Z"} fill={L.hair} />
      <circle cx="91" cy="112" r="2.2" fill="#1A1412" /><circle cx="109" cy="112" r="2.2" fill="#1A1412" />
      <path d="M93 127 Q100 131 107 127" stroke="#6B3E2E" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* chest: patch, name tag, flag-free mission stripe, connectors */}
      <circle cx="72" cy="192" r="9" fill="#1F3E73" /><path d="M66 194 L78 189" stroke="#E4E7EA" strokeWidth="1.5" />
      <rect x="86" y="186" width="32" height="10" rx="1" fill="#E9EBE8" stroke="#9EA3A2" strokeWidth=".8" />
      <text x="102" y="193.5" textAnchor="middle" fontSize="7" fontWeight="700" fontFamily="monospace" fill="#2A2F35">{person.init}</text>
      <rect x="128" y="184" width="22" height="13" fill="#1F3E73" /><rect x="128" y="189" width="22" height="3" fill="#E4E7EA" />
      <circle cx="96" cy="214" r="6" fill="#2C5AA8" /><circle cx="96" cy="230" r="6" fill="#B23A2E" /><circle cx="112" cy="222" r="5" fill="#3E7CC9" />
      {/* helmet at their side */}
      {bare ? null : <><circle cx="30" cy="206" r="30" fill="#EDEFEC" />
      <ellipse cx="32" cy="204" rx="22" ry="21" fill={`url(#visor-${person.id})`} />
      <ellipse cx="24" cy="196" rx="6" ry="4" fill="#FFFFFF" opacity=".35" /></>}
    </svg>
  );
}
