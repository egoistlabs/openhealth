"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import type { SomakineViewerHandle } from "@somakine/react";
import type { RegionId, StructureId, StructureType } from "@somakine/core";
import type { ViewerAssetProgress, ViewerSelectionGroup } from "@somakine/viewer";
import { BODY_PACK as PACK, isApproximate } from "@/lib/console/body/pack";

/* Pain body map for the daily check-in (step 2): a 3D musculoskeletal model (Somakine viewer with the
   BodyParts3D 4.0 pack, CC BY 4.0). Drag to turn it, tap a muscle or bone that hurts, rate it 1–10 in the
   panel. Marked parts are tinted by severity; parts that hurt on earlier sols glow amber. Region buttons
   below zoom the model to one area and list its muscles, including ones the model has no shape for
   (abdominals, lats), so every area can still be logged. Head and neck muscles come from our extension
   (lib/console/body/pack.ts): real BodyParts3D jaw and neck muscles plus approximate face muscles. */

const BodyModel = dynamic(() => import("./BodyModel"), { ssr: false });

export type View = "front" | "back" | "side";
/* note: when the pain happens (e.g. "during treadmill"); kind: what a skin problem is (rash, bite…).
   The note is required for every mark, and the kind for skin marks, before the check-in moves on. */
export type PainMark = { id: string; view: View; x: number; y: number; region: string; level: number; note?: string; kind?: string };
export const isSkinMark = (p: PainMark) => p.id.includes(":openhealth-skin-");
export const needsDetails = (p: PainMark) => !p.note?.trim() || (isSkinMark(p) && !p.kind);
const WHEN = ["During exercise", "At rest", "When moving", "After waking", "During EVA or suit work", "All the time"];
const SKIN_KINDS = ["Rash", "Bite or sting", "Cut or scrape", "Bruise", "Burn", "Itch", "Dry or cracked", "Blister", "Swelling", "Other"];

/* ---------- catalogue built from the data pack ---------- */
type Side = "left" | "right" | null;
type Part = { key: string; id: string; side: Side; label: string; name: string; region: RegionId; type: StructureType | "area"; onModel: boolean };

const EN = PACK.locales.find((l) => l.locale === "en")?.labels ?? {};
const MODE = new Map(PACK.representations.map((r) => [r.structureId, r.mode]));
/* area buttons: Skin first (crew mostly log skin problems), then the body regions in pack order */
const isSkinRegion = (id: string) => id.endsWith("-skin");
const REGIONS = [...PACK.regions].sort((a, b) => Number(isSkinRegion(b.id)) - Number(isSkinRegion(a.id)) || a.order - b.order).map((r) => ({ id: r.id, name: EN[r.id] ?? r.id }));
const regionName = (id: RegionId) => REGIONS.find((r) => r.id === id)?.name ?? "";

const keyOf = (id: string, side: Side) => `${id}#${side ?? "mid"}`;
const sideWord = (s: Side) => (s === "left" ? "Left " : s === "right" ? "Right " : "");

const PARTS = new Map<string, Part>();
for (const s of PACK.structures) {
  const name = EN[s.id] ?? s.id.replace("somakine:structure:", "");
  const sides: Side[] = s.laterality === "paired" ? ["left", "right"] : [null];
  for (const side of sides) {
    const key = keyOf(s.id, side);
    PARTS.set(key, { key, id: s.id, side, name, label: `${sideWord(side)}${name}`, region: s.regionIds[0], type: s.type, onModel: MODE.get(s.id) !== "unavailable" });
  }
}
/* a general head area (headache, scalp) that is not one muscle */
for (const [slug, name] of [["head", "Head (general, headache)"]] as const) {
  const key = keyOf(`area:${slug}`, null);
  PARTS.set(key, { key, id: `area:${slug}`, side: null, name, label: name, region: "somakine:region:head-neck", type: "area", onModel: false });
}
/* what each region's list offers: muscles and tendons, then off-model areas */
const LISTABLE = new Set<Part["type"]>(["muscle", "tendon", "area", "skin"]);
const regionParts = (region: RegionId) =>
  [...PARTS.values()].filter((p) => p.region === region && LISTABLE.has(p.type))
    .sort((a, b) => Number(b.onModel) - Number(a.onModel) || a.name.localeCompare(b.name) || (a.side ?? "").localeCompare(b.side ?? ""));

export const SEV = [
  { name: "Mild", range: "1–3", colour: "#F5B82E", test: (n: number) => n <= 3 },
  { name: "Moderate", range: "4–6", colour: "#F2701D", test: (n: number) => n >= 4 && n <= 6 },
  { name: "Severe", range: "7–10", colour: "#B3261E", test: (n: number) => n >= 7 },
];
export const sevColour = (n: number) => (SEV.find((s) => s.test(n)) ?? SEV[0]).colour;

const TIPS: Partial<Record<RegionId, string>> = {
  "somakine:region:spine-trunk": "Lower back pain is common in low gravity, as the spine lengthens. Gentle stretching and core exercise help.",
  "somakine:region:head-neck": "Headaches and neck tension are common in space. Note if they come with poor sleep, stuffy air or long screen work.",
  "somakine:region:shoulder": "Shoulder and upper back tension often builds during long screen or robotics sessions. Short breaks help.",
  "somakine:region:elbow-forearm": "Forearm soreness often comes from glove and handrail work. Mention it if it lasts more than a sol or two.",
  "somakine:region:wrist-hand": "Hand and wrist soreness often comes from glove and handrail work. Mention it if it lasts more than a sol or two.",
  "somakine:region:hip-pelvis": "Hip soreness often follows treadmill or resistance sessions. Note if it does not settle by the next sol.",
  "somakine:region:knee": "Leg soreness often follows treadmill or resistance sessions. Note if it does not settle by the next sol.",
  "somakine:region:ankle-foot": "Calf and foot soreness often follows treadmill sessions or foot-loop work. Note if it does not settle by the next sol.",
};

const JAW = /masseter|temporalis/;
const JAW_TIP = "Jaw and temple pain often comes from clenching or grinding, which is more common under stress and during sleep. Note if it is worse on waking.";

const PAST = "#F5B82E";
const LAYERS: Array<[string, StructureType[]]> = [["Muscles", ["muscle"]], ["Bones", ["bone"]], ["Joints & ligaments", ["joint", "ligament", "tendon"]]];

export function BodyMap({ value, onChange, history, noPain, onNoPain }: {
  value: PainMark[]; onChange: (v: PainMark[]) => void; history: PainMark[]; noPain: boolean; onNoPain: () => void;
}) {
  const viewer = useRef<SomakineViewerHandle | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [group, setGroup] = useState<RegionId | null>(null);
  const [layers, setLayers] = useState<Record<string, boolean>>({ Muscles: true, Bones: true, "Joints & ligaments": true });
  /* skin on (default): taps mark skin areas; off: taps reach the muscles and bones */
  const [skinOn, setSkinOn] = useState(true);

  const byKey = useMemo(() => new Map(value.map((p) => [p.id, p])), [value]);
  const pastCount = useCallback((key: string) => history.filter((h) => h.id === key).length, [history]);

  const add = (key: string) => {
    const part = PARTS.get(key);
    if (!part || value.some((p) => p.id === key)) return;
    onChange([...value, { id: key, view: "front", x: 0, y: 0, region: part.label, level: 4 }]);
  };
  const remove = (key: string) => onChange(value.filter((p) => p.id !== key));
  const setLevel = (key: string, level: number) => onChange(value.map((p) => (p.id === key ? { ...p, level } : p)));
  const setNote = (key: string, note: string) => onChange(value.map((p) => (p.id === key ? { ...p, note } : p)));
  const setKind = (key: string, kind: string) => onChange(value.map((p) => (p.id === key ? { ...p, kind } : p)));
  const addWhen = (key: string, when: string) => {
    const cur = byKey.get(key)?.note?.trim() ?? "";
    if (cur.toLowerCase().includes(when.toLowerCase())) return;
    setNote(key, cur ? `${cur}, ${when.toLowerCase()}` : when);
  };

  /* highlight a part on the model (list clicks); the viewer echoes it back through onPick */
  const show = (key: string) => {
    const part = PARTS.get(key);
    if (part?.onModel) viewer.current?.selectStructure(part.id as StructureId, part.side ? { side: part.side } : undefined);
  };
  const pick = (key: string) => { add(key); setFocus(key); setGroup(null); show(key); };

  /* the viewer reads its callbacks through a ref, so a fresh function each render is fine */
  const onPick = (sel: ViewerSelectionGroup) => {
    const last = sel[sel.length - 1];
    if (!last) { setFocus(null); return; }
    const side: Side = last.side === "left" || last.side === "right" ? last.side : null;
    const key = PARTS.has(keyOf(last.structure.id, side)) ? keyOf(last.structure.id, side) : keyOf(last.structure.id, null);
    if (!PARTS.has(key)) return;
    add(key); setFocus(key); setGroup(null);
  };

  const onReady = useCallback((h: SomakineViewerHandle) => { viewer.current = h; setReady(true); setFailed(null); }, []);
  const onProgress = useCallback((p: ViewerAssetProgress) => setProgress({ done: p.completed, total: p.total }), []);
  const onError = useCallback((e: unknown) => setFailed(e instanceof Error ? e.message : "The 3D model could not load."), []);

  /* tint marked parts by severity and earlier pain in amber; clear anything no longer marked */
  const styled = useRef(new Set<string>());
  useEffect(() => {
    const v = viewer.current;
    if (!ready || !v) return;
    const want = new Map<string, { color?: string; emissive: string; emissiveIntensity: number }>();
    for (const h of history) if (PARTS.get(h.id)?.onModel) want.set(h.id, { emissive: PAST, emissiveIntensity: 0.35 });
    for (const m of value) if (PARTS.get(m.id)?.onModel) { const c = sevColour(m.level); want.set(m.id, { color: c, emissive: c, emissiveIntensity: 0.45 }); }
    for (const key of styled.current) if (!want.has(key)) {
      const p = PARTS.get(key)!;
      v.setStructureStyle(p.id as StructureId, null, p.side ? { side: p.side } : undefined);
    }
    for (const [key, style] of want) {
      const p = PARTS.get(key)!;
      v.setStructureStyle(p.id as StructureId, style, p.side ? { side: p.side } : undefined);
    }
    styled.current = new Set(want.keys());
  }, [ready, value, history]);

  /* layer and skin visibility; re-applied after area changes, since "Whole body" shows everything again */
  useEffect(() => {
    const v = viewer.current;
    if (!ready || !v) return;
    for (const [name, types] of LAYERS) types.forEach((t) => v.setLayerVisibility(t, layers[name]));
    v.setLayerVisibility("skin", skinOn);
  }, [ready, layers, skinOn, group]);

  const toggleLayer = (name: string) => setLayers((l) => ({ ...l, [name]: !l[name] }));
  /* area buttons zoom the model to that area and open its list; "Whole body" goes back to the full figure */
  const openRegion = (id: RegionId | null) => {
    setGroup(id); setFocus(null);
    if (id && isSkinRegion(id)) setSkinOn(true);
    if (id) viewer.current?.focusRegion(id); else viewer.current?.showBody();
  };

  const all = [...history, ...value];
  const total = all.length;
  const focusPart = focus ? PARTS.get(focus) : undefined;
  const focusMark = focus ? byKey.get(focus) : undefined;

  /* ---------- right panel ---------- */
  let panel: React.ReactNode;
  if (focus && focusPart) {
    const past = pastCount(focus), tip = JAW.test(focusPart.id) ? JAW_TIP : TIPS[focusPart.region];
    panel = (
      <div style={S.pIn}>
        <div style={S.pHead}>
          <div>
            <p style={S.pKicker}>{regionName(focusPart.region)}{focusPart.type !== "area" && focusPart.type !== "skin" ? ` · ${focusPart.type}` : ""}</p>
            <h3 style={S.pTitle}>{focusPart.label}</h3>
          </div>
          <button type="button" className="ta ta--quiet" onClick={() => setFocus(null)} aria-label="Close part">×</button>
        </div>
        {!focusPart.onModel ? <p style={S.pPast}>Not shown on the 3D model.</p> : null}
        {isApproximate(focusPart.id) ? <p style={{ ...S.pPast, color: "var(--c-text-3)" }}>Approximate shape: placed over the skull, not a scanned muscle.</p> : null}
        <p style={{ ...S.pPast, color: past ? PAST : "var(--c-text-3)" }}>{past ? `Hurt here on ${past} of the last 14 sols.` : "No pain logged here in the last 14 sols."}</p>
        {focusMark ? <>
          <span style={S.pLabel}>{isSkinMark(focusMark) ? "How much does it bother you?" : "How bad is it now?"} <b style={{ color: sevColour(focusMark.level) }}>{focusMark.level}/10</b></span>
          <div role="radiogroup" aria-label={`${focusPart.label}, pain 1 to 10`} style={S.levelsBig}>
            {Array.from({ length: 10 }, (_, k) => k + 1).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={focusMark.level === n} onClick={() => setLevel(focus, n)}
                style={{ ...S.lvlBig, background: focusMark.level === n ? sevColour(n) : "transparent", color: focusMark.level === n ? "#0B0D12" : "var(--c-text-2)", borderColor: focusMark.level === n ? sevColour(n) : "var(--c-hair-strong)" }}>{n}</button>
            ))}
          </div>
          <div style={S.scale}><span>Barely there</span><span>Distracting</span><span>Worst</span></div>
          {isSkinMark(focusMark) ? <>
            <span style={S.pLabel}>What is it? <b style={{ color: focusMark.kind ? "var(--c-text-3)" : "#F2701D" }}>{focusMark.kind ? "Added" : "Required"}</b></span>
            <div style={S.when} role="radiogroup" aria-label="What is it">
              {SKIN_KINDS.map((k) => (
                <button key={k} type="button" role="radio" aria-checked={focusMark.kind === k} onClick={() => setKind(focus, k)}
                  style={{ ...S.whenChip, ...(focusMark.kind === k ? { borderColor: "var(--c-action)", color: "var(--c-text)", background: "rgb(111 168 160 / .15)" } : null) }}>{k}</button>
              ))}
            </div>
          </> : null}
          <label style={S.pLabel} htmlFor={`pain-note-${focus}`}>
            {isSkinMark(focusMark) ? "When did it start or when does it bother you?" : "When does it hurt?"} <b style={{ color: !focusMark.note?.trim() ? "#F2701D" : "var(--c-text-3)" }}>{!focusMark.note?.trim() ? "Required" : "Added"}</b>
          </label>
          <div style={S.when}>
            {WHEN.map((w) => (
              <button key={w} type="button" onClick={() => addWhen(focus, w)} style={S.whenChip}>{w}</button>
            ))}
          </div>
          <textarea id={`pain-note-${focus}`} value={focusMark.note ?? ""} onChange={(e) => setNote(focus, e.target.value)} rows={2} maxLength={240}
            placeholder="e.g. sharp when I lift my arm, started after the treadmill session"
            aria-required="true" aria-invalid={!focusMark.note?.trim()}
            style={{ ...S.note, borderColor: !focusMark.note?.trim() ? "#F2701D" : "var(--c-hair-strong)" }} />
          <button type="button" className="ta" onClick={() => { remove(focus); setFocus(null); }} style={{ justifySelf: "start", fontSize: 12 }}>Remove this part</button>
        </> : <button type="button" className="btn-primary" onClick={() => add(focus)}>Mark as painful</button>}
        {tip ? <p style={S.tip}>{tip}</p> : null}
      </div>
    );
  } else if (group) {
    panel = (
      <div style={S.pIn}>
        <div style={S.pHead}>
          <h3 style={S.pTitle}>{regionName(group)}</h3>
          <button type="button" className="ta ta--quiet" onClick={() => openRegion(null)} aria-label="Close region">×</button>
        </div>
        <p style={S.pPast}>Tap the model, or pick the part that hurts.</p>
        <div style={S.gList}>
          {regionParts(group).map((p) => {
            const m = byKey.get(p.key), past = pastCount(p.key);
            return (
              <button key={p.key} type="button" onClick={() => pick(p.key)}
                style={{ ...S.gItem, ...(m ? { borderColor: sevColour(m.level) } : null) }}>
                <span style={{ ...S.dot, background: m ? sevColour(m.level) : "transparent", border: m ? "none" : "1px solid var(--c-hair-strong)" }} />
                <span style={{ flex: 1, textAlign: "left" }}>{p.label}{p.onModel ? null : <span style={{ color: "var(--c-text-3)" }}> · not on model</span>}</span>
                {m ? <span className="num" style={{ fontSize: 11 }}>{m.level}/10</span> : past ? <span style={{ fontSize: 11, color: PAST }}>{past}×</span> : null}
              </button>
            );
          })}
        </div>
      </div>
    );
  } else {
    panel = (
      <div style={S.pIn}>
        {value.length ? <>
          <h3 style={S.pTitle}>Where it hurts today</h3>
          <div style={S.gList}>
            {value.map((p) => (
              <button key={p.id} type="button" onClick={() => { setFocus(p.id); show(p.id); }}
                style={{ ...S.gItem, borderColor: sevColour(p.level) }}>
                <span style={{ ...S.dot, background: sevColour(p.level) }} />
                <span style={{ flex: 1, textAlign: "left" }}>{p.region}
                  <span style={{ display: "block", fontSize: 11, color: needsDetails(p) ? "#F2701D" : "var(--c-text-3)" }}>{needsDetails(p) ? (isSkinMark(p) && !p.kind ? "Add what it is" : "Add when it hurts") : [p.kind, p.note].filter(Boolean).join(" · ")}</span>
                </span>
                <span className="num" style={{ fontSize: 11 }}>{p.level}/10</span>
              </button>
            ))}
          </div>
        </> : <p style={S.empty}>Tap a muscle or bone that hurts.<br /><span style={{ fontSize: 12 }}>Drag to turn the body, scroll to zoom, or pick an area below.</span></p>}
        {total ? (
          <div style={S.sum} aria-label="Pain breakdown, today and the last 14 sols">
            <span style={S.pLabel}>Severity, today + last 14 sols</span>
            {SEV.map((s) => {
              const n = all.filter((p) => s.test(p.level)).length, pct = Math.round((n / total) * 100);
              return (
                <div key={s.name} style={S.bar}>
                  <span>{s.name} <span style={{ color: "var(--c-text-3)" }}>{s.range}</span></span>
                  <span style={S.track}><i style={{ ...S.fill, width: `${pct}%`, background: s.colour }} /></span>
                  <span className="num" style={S.pct}>{pct}%</span>
                </div>
              );
            })}
          </div>
        ) : null}
        <button type="button" className={noPain && !value.length ? "opt is-on" : "opt"} aria-pressed={noPain && !value.length}
          onClick={() => { onNoPain(); setFocus(null); setGroup(null); }} style={{ alignSelf: "flex-start", marginTop: "auto" }}>No pain today</button>
      </div>
    );
  }

  return (
    <div style={S.root}>
      <div style={S.top}>
        <div style={S.card}>
          <div style={S.tools}>
            {LAYERS.map(([name]) => (
              <button key={name} type="button" aria-pressed={layers[name]} onClick={() => toggleLayer(name)} disabled={!ready}
                style={{ ...S.tool, ...(layers[name] ? S.toolOn : null) }}>{name}</button>
            ))}
            <button type="button" aria-pressed={skinOn} onClick={() => setSkinOn((s) => !s)} disabled={!ready}
              style={{ ...S.tool, ...(skinOn ? S.toolOn : null) }}>Skin</button>
            <button type="button" onClick={() => { openRegion(null); viewer.current?.resetView(); }} disabled={!ready} style={{ ...S.tool, marginLeft: "auto" }}>Reset view</button>
          </div>
          <div style={S.stage} aria-busy={!ready}>
            <BodyModel onReady={onReady} onPick={onPick} onProgress={onProgress} onError={onError} />
            {!ready || failed ? (
              <div style={S.overlay} role="status">
                {failed ? <>The 3D body could not load.<br /><span style={{ fontSize: 11 }}>{failed}</span><br /><span style={{ fontSize: 11 }}>You can still pick an area below.</span></>
                  : `Loading body model${progress?.total ? ` ${progress.done}/${progress.total}` : "…"}`}
              </div>
            ) : null}
          </div>
          <p style={S.credit}>3D anatomy: <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html" target="_blank" rel="noreferrer">BodyParts3D</a>, © The Database Center for Life Science, <a href="https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html" target="_blank" rel="noreferrer">CC BY 4.0</a>. Face muscles are approximate shapes built on the BodyParts3D skull. Viewer: Somakine (MIT).</p>
        </div>
        <div style={S.panel}>{panel}</div>
      </div>
      <div style={S.chips}>
        <button type="button" aria-pressed={group === null} onClick={() => openRegion(null)} style={{ ...S.chip, ...(group === null ? S.chipOn : null) }}>Whole body</button>
        {REGIONS.map((r) => {
          const n = value.filter((p) => PARTS.get(p.id)?.region === r.id).length;
          return (
            <button key={r.id} type="button" aria-pressed={group === r.id} onClick={() => openRegion(group === r.id ? null : r.id)}
              style={{ ...S.chip, ...(group === r.id ? S.chipOn : null), ...(n ? { borderColor: "#F2701D" } : null) }}>
              {r.name} {n ? <span style={{ color: "#F2701D" }}>{n} marked</span> : null}
            </button>
          );
        })}
        {value.length ? <button type="button" onClick={() => { onChange([]); setFocus(null); }} style={{ ...S.chip, background: "transparent" }}>Clear all</button> : null}
      </div>
    </div>
  );
}

const S = {
  root: { display: "grid", gap: 10 },
  top: { display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(280px, 1fr)", gap: 14, alignItems: "stretch" },
  card: { display: "grid", gridTemplateRows: "auto minmax(0, 1fr) auto", gap: 8, padding: 12, borderRadius: 14, border: "0.5px solid var(--c-hair-strong)", background: "rgb(143 163 189 / .05)" },
  tools: { display: "flex", flexWrap: "wrap", gap: 6 },
  tool: { padding: "4px 9px", fontSize: 11, borderRadius: 6, border: "0.5px solid var(--c-hair-strong)", background: "transparent", color: "var(--c-text-2)", cursor: "pointer" },
  toolOn: { borderColor: "var(--c-action)", color: "var(--c-text)", background: "rgb(111 168 160 / .15)" },
  stage: { position: "relative", height: "min(56vh, calc(100vh - 380px))", minHeight: 320, borderRadius: 10, background: "radial-gradient(ellipse at 50% 40%, rgb(59 99 128 / .35), rgb(11 13 18 / .6) 70%)", overflow: "hidden", cursor: "grab" },
  overlay: { position: "absolute", inset: 0, display: "grid", placeContent: "center", textAlign: "center", gap: 4, fontSize: 13, color: "var(--c-text-2)", pointerEvents: "none" },
  credit: { fontSize: 10, color: "var(--c-text-3)", lineHeight: 1.4 },
  panel: { display: "flex", borderRadius: 14, border: "0.5px solid var(--c-hair-strong)", background: "rgb(143 163 189 / .05)", minHeight: 0 },
  pIn: { display: "flex", flexDirection: "column", gap: 8, padding: 16, width: "100%", minHeight: 0, overflowY: "auto", maxHeight: "min(62vh, calc(100vh - 320px))" },
  pHead: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  pKicker: { fontSize: 11, color: "var(--c-text-3)", textTransform: "uppercase", letterSpacing: ".06em" },
  pTitle: { fontSize: 18, fontWeight: 600, color: "var(--c-text)" },
  pLabel: { display: "block", fontSize: 11, color: "var(--c-text-3)", marginBottom: 2 },
  pPast: { fontSize: 12 },
  levelsBig: { display: "grid", gridTemplateColumns: "repeat(10, minmax(0, 1fr))", gap: 3 },
  lvlBig: { height: 28, border: "0.5px solid", borderRadius: 5, fontFamily: "var(--f-mono)", fontSize: 12, padding: 0, cursor: "pointer" },
  scale: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--c-text-3)" },
  tip: { fontSize: 12, color: "var(--c-text-2)", padding: "6px 8px", borderLeft: "2px solid var(--c-info)", background: "rgb(143 163 189 / .08)" },
  empty: { margin: "auto", textAlign: "center", color: "var(--c-text-2)", fontSize: 14 },
  gList: { display: "grid", gap: 4 },
  gItem: { display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", fontSize: 12, borderRadius: 8, border: "0.5px solid var(--c-hair-strong)", background: "transparent", color: "var(--c-text)", cursor: "pointer" },
  dot: { width: 10, height: 10, borderRadius: "50%", flex: "none" },
  sum: { display: "grid", gap: 3, paddingTop: 8, borderTop: "0.5px solid var(--c-hair)" },
  bar: { display: "grid", gridTemplateColumns: "88px minmax(0, 1fr) 34px", alignItems: "center", gap: 8, fontSize: 11, color: "var(--c-text)" },
  track: { height: 6, borderRadius: 3, background: "rgb(143 163 189 / .12)", overflow: "hidden" },
  fill: { display: "block", height: "100%", borderRadius: 3 },
  pct: { fontSize: 11, color: "var(--c-text-2)", textAlign: "right" },
  chips: { display: "flex", flexWrap: "wrap", gap: 6 },
  chip: { padding: "5px 10px", fontSize: 12, borderRadius: 6, border: "0.5px solid var(--c-hair-strong)", background: "rgb(143 163 189 / .08)", color: "var(--c-text)", cursor: "pointer", display: "inline-flex", gap: 6 },
  when: { display: "flex", flexWrap: "wrap", gap: 4 },
  whenChip: { padding: "3px 8px", fontSize: 11, borderRadius: 999, border: "0.5px solid var(--c-hair-strong)", background: "transparent", color: "var(--c-text-2)", cursor: "pointer" },
  note: { width: "100%", resize: "vertical", padding: "6px 8px", fontSize: 12, borderRadius: 8, border: "1px solid", background: "rgb(11 13 18 / .4)", color: "var(--c-text)", fontFamily: "inherit" },
  chipOn: { borderColor: "var(--c-action)", background: "rgb(111 168 160 / .15)" },
} satisfies Record<string, CSSProperties>;
