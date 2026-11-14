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
