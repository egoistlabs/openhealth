"use client";

/* The Somakine 3D viewer (BodyParts3D 4.0 musculoskeletal pack), loaded only in the browser through
   next/dynamic from BodyMap. Hands its imperative handle up through onReady because next/dynamic does
   not forward refs. GLBs are served from public/somakine (copied on postinstall). */

import { useRef } from "react";
import { SomakineViewer, type SomakineViewerHandle } from "@somakine/react";
import type { ViewerAssetProgress, ViewerSelectionGroup } from "@somakine/viewer";
import { BODY_PACK, resolveBodyAsset } from "@/lib/console/body/pack";

const LOADING = { mode: "eager", concurrency: 4 } as const;
/* keep scroll zoom gentle: a little closer or further than the fitted whole-body view, no deep zoom */
const ZOOM = { initialDistanceFactor: 1, minDistanceFactor: 0.7, maxDistanceFactor: 1.3 } as const;

export default function BodyModel({ onReady, onPick, onProgress, onError, viewDirection }: {
  onReady: (h: SomakineViewerHandle) => void;
  onPick: (picks: ViewerSelectionGroup) => void;
  onProgress: (p: ViewerAssetProgress) => void;
  onError: (e: unknown) => void;
  /** camera direction for the first framing (default: the viewer's slightly-from-above front view) */
  viewDirection?: readonly [number, number, number];
}) {
  const ref = useRef<SomakineViewerHandle>(null);
  return (
    <SomakineViewer
      ref={ref}
      dataset={BODY_PACK}
      accessibleLabel="3D body model. Drag to turn it, scroll to zoom, tap a muscle or bone that hurts."
      background={null}
      loading={LOADING}
      zoomLimits={ZOOM}
      initialViewDirection={viewDirection}
      assetResolver={resolveBodyAsset}
      onStateChange={(s) => { if (s.phase === "ready" && ref.current) onReady(ref.current); }}
      onSelectionGroup={onPick}
      onAssetProgress={onProgress}
      onError={onError}
      style={{ width: "100%", height: "100%" }}
    />
  );
}
