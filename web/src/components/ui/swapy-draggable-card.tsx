"use client";

import type React from "react";
import { useEffect, useRef } from "react";
import { createSwapy, type Swapy, type SlotItemMapArray } from "swapy";
import { cn } from "@/lib/utils";

/* Drag-to-swap card layout built on swapy. Adapted from the swapy-draggable-card snippet:
   swapy is created once on mount (config and onSwap are read through refs, so passing inline
   objects does not rebuild it every render), and the instance is handed back via `onReady`
   so a caller using manualSwap can call utils.dynamicSwapy / swapy.update(). */

type Config = {
  animation: "dynamic" | "spring" | "none";
  continuousMode: boolean;
  manualSwap: boolean;
  swapMode: "hover" | "drop";
  autoScrollOnDrag: boolean;
};

type SwapEvent = { newSlotItemMap: { asArray: SlotItemMapArray } };

export const SwapyLayout = ({ id, enable = true, onSwap, onReady, config = {}, className, children }: {
  id: string;
  enable?: boolean;
  onSwap?: (event: SwapEvent) => void;
  onReady?: (swapy: Swapy) => void;
  config?: Partial<Config>;
  className?: string;
  children: React.ReactNode;
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const swapyRef = useRef<Swapy | null>(null);
  const live = useRef({ config, onSwap, onReady });
  useEffect(() => { live.current = { config, onSwap, onReady }; });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const swapy = createSwapy(container, live.current.config);
    swapy.onSwap((e) => live.current.onSwap?.(e as SwapEvent));
    swapyRef.current = swapy;
    live.current.onReady?.(swapy);
    return () => { swapy.destroy(); swapyRef.current = null; };
  }, []);

  useEffect(() => { swapyRef.current?.enable(enable); }, [enable]);

  return <div id={id} ref={containerRef} className={className}>{children}</div>;
};

export const DragHandle = ({ className, label = "Drag to reorder" }: { className?: string; label?: string }) => (
  <span data-swapy-handle role="img" aria-label={label} title={label}
    className={cn("cursor-grab active:cursor-grabbing text-[var(--c-text-3)] hover:text-[var(--c-text)]", className)}>
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" />
      <circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" />
    </svg>
  </span>
);

export const SwapySlot = ({ id, className, children }: { id: string; className?: string; children: React.ReactNode }) => (
  <div className={className} data-swapy-slot={id}>{children}</div>
);

const dragOpacityClassMap: Record<number, string> = {
  10: "data-[swapy-dragging]:opacity-10", 20: "data-[swapy-dragging]:opacity-20", 30: "data-[swapy-dragging]:opacity-30",
  40: "data-[swapy-dragging]:opacity-40", 50: "data-[swapy-dragging]:opacity-50", 60: "data-[swapy-dragging]:opacity-60",
  70: "data-[swapy-dragging]:opacity-70", 80: "data-[swapy-dragging]:opacity-80", 90: "data-[swapy-dragging]:opacity-90",
  100: "data-[swapy-dragging]:opacity-100",
};

export const SwapyItem = ({ id, className, children, dragItemOpacity = 100 }: {
  id: string;
  className?: string;
  children: React.ReactNode;
  dragItemOpacity?: number;
}) => (
  <div className={cn(dragOpacityClassMap[dragItemOpacity] ?? "data-[swapy-dragging]:opacity-50", className)} data-swapy-item={id}>
    {children}
  </div>
);
