import type { CSSProperties } from "react";
import { StatusWord } from "@/components/ui";

/* Colour key for status words and the two-colour card charts (Home "Today", Crew "Crew at a glance").
   Styles are inline so the key renders correctly even if the stylesheet is stale. */
const KEY = {
  row: { display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: "4px 16px", fontSize: 12, lineHeight: "16px", fontWeight: 400, color: "var(--c-text-2)" },
  item: { display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" },
  sep: { width: 1, height: 14, background: "var(--c-hair-strong)" },
  sw: { display: "inline-block", width: 14, height: 10, borderRadius: 2 },
} satisfies Record<string, CSSProperties>;

export function ColourKey({ refLabel = "Healthy range" }: { refLabel?: string }) {
  return (
    <span className="ckey" aria-label="Colour key" style={KEY.row}>
      <span style={KEY.item}><StatusWord state="normal" /></span>
      <span style={KEY.item}><StatusWord state="watch" /></span>
      <span style={KEY.item}><StatusWord state="act" /></span>
      <span aria-hidden="true" style={KEY.sep} />
      <span style={KEY.item}><i style={{ ...KEY.sw, background: "rgb(127 176 105 / .7)" }} />Past it, good side</span>
      <span style={KEY.item}><i style={{ ...KEY.sw, background: "rgb(212 167 44 / .45)" }} />Drifting</span>
      <span style={KEY.item}><i style={{ ...KEY.sw, background: "rgb(229 83 75 / .75)" }} />Past it, worse side</span>
      <span style={KEY.item}><i style={{ ...KEY.sw, background: "rgb(143 163 189 / .15)", borderTop: "1.5px dashed #8FA3BD", borderBottom: "1.5px dashed #8FA3BD", borderRadius: 0 }} />{refLabel}</span>
    </span>
  );
}
