"use client";

import { useLayoutEffect, useRef, useState } from "react";

/* Measures its own width and renders an SVG string from one of the plot functions in lib/console/plots.
   The width is 0 on the server and on the first client render, so hydration always matches. */
export function Plot({ className = "plot", draw, label, as = "div" }: {
  className?: string;
  draw: (w: number) => string;
  label?: string;
  as?: "div" | "span";
}) {
  const ref = useRef<HTMLElement>(null);
  const [w, setW] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.floor(el.clientWidth)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const svg = w ? draw(w) : "";
  const Tag = as;
  return <Tag ref={ref as never} className={className} aria-label={label} aria-hidden={label ? undefined : true} dangerouslySetInnerHTML={{ __html: svg }} />;
}

/* Like Plot, but measures width AND height, so the chart fills whatever box the layout gives it
   (used by the Home and Crew measure cards). The SVG is absolutely positioned so it never props
   the box open. */
export function FillPlot({ className, draw }: { className?: string; draw: (w: number, h: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: Math.floor(el.clientWidth), h: Math.max(32, Math.floor(el.clientHeight)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return <span ref={ref} className={className} aria-hidden="true" dangerouslySetInnerHTML={{ __html: box.w ? draw(box.w, box.h) : "" }} />;
}
