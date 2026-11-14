import { useId, type SVGProps } from "react";

import { cn } from "@/lib/utils";

/* Dot pattern (from the shadcn / Magic UI "dot-pattern" component).
   Changes: typed props instead of `any`, and the default fill is a design token, not a slate hex. */
interface DotPatternProps extends Omit<SVGProps<SVGSVGElement>, "width" | "height" | "x" | "y"> {
  /** pattern cell width and height, px */
  width?: number;
  height?: number;
  /** pattern offset, px */
  x?: number;
  y?: number;
  /** dot centre and radius inside the cell, px */
  cx?: number;
  cy?: number;
  cr?: number;
  className?: string;
}

export function DotPattern({
  width = 24,
  height = 24,
  x = 0,
  y = 0,
  cx = 1,
  cy = 0.5,
  cr = 0.5,
  className,
  ...props
}: DotPatternProps) {
  const id = useId();

  return (
    <svg
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 h-full w-full fill-text-3/50", className)}
      {...props}
    >
      <defs>
        <pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse" x={x} y={y}>
          <circle cx={cx} cy={cy} r={cr} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}
