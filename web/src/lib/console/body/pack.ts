/* The body model the pain map renders: the Somakine BodyParts3D 4.0 musculoskeletal pack plus our head and
   neck extension (real BodyParts3D jaw and neck muscles, and approximate face muscles shaped over the
   BodyParts3D skull, since BodyParts3D has no facial muscles). Both are CC BY 4.0.
   Rebuild the extension with scripts/build-head-neck-extension.mjs. */
import { composeDataPacks, type DataExtension, type DataPack } from "@somakine/core";
import type { AssetResolver } from "@somakine/viewer";
import { bodyParts3DMusculoskeletal } from "@somakine/bodyparts3d-musculoskeletal";
import headNeck from "./head-neck-extension.json";

const EXT_NS = "openhealth";

/* English labels only. The upstream pack also carries other locales, which the app never shows. Strip them
   from the base pack BEFORE composing: composeDataPacks checks that every structure has a label in every
   locale, and our extension (head-neck-extension.json) is English-only. */
const englishBase: DataPack = { ...bodyParts3DMusculoskeletal, locales: bodyParts3DMusculoskeletal.locales.filter((l) => l.locale === "en") };
export const BODY_PACK: DataPack = composeDataPacks(englishBase, [headNeck as unknown as DataExtension]).dataset;

/** structures whose shape is our approximation rather than BodyParts3D geometry */
export const isApproximate = (structureId: string) =>
  BODY_PACK.structures.find((s) => s.id === structureId)?.groups?.includes("approximate-shape") ?? false;

/* base pack GLBs are copied to /somakine on postinstall; the extension GLB is committed under /somakine-ext */
export const resolveBodyAsset: AssetResolver = async (asset, signal) => {
  const base = asset.id.startsWith(`somakine:asset:${EXT_NS}:`) ? "/somakine-ext" : "/somakine";
  const res = await fetch(`${base}/${asset.uri}`, { signal });
  if (!res.ok) throw new Error(`Could not load ${asset.uri} (${res.status})`);
  return res.arrayBuffer();
};
