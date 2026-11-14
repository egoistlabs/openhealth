import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { CircleCheckIcon, CircleDotIcon, CircleIcon } from "lucide-react";

export type ProgressStep = {
  label: string;
  completed: boolean;
  /* the step on screen now */
  current?: boolean;
  /* short word after the label, e.g. "Skipped" or "Optional" */
  note?: string;
};

const DEMO_STEPS: ProgressStep[] = [
  { label: "Account", completed: true },
  { label: "Profile", completed: true },
  { label: "Preferences", completed: false },
  { label: "Review", completed: false },
];

/* Step list with a progress bar (from the c-progress-7 pattern). Each state pairs an icon shape with text,
   so it never relies on colour alone. layout="row" lays it out in one line, for a title bar. */
export default function Pattern({
  title = "Setup Progress",
  steps = DEMO_STEPS,
  className,
  listClassName,
  layout = "stack",
}: {
  title?: string;
  steps?: ProgressStep[];
  className?: string;
  listClassName?: string;
  layout?: "stack" | "row";
}) {
  const row = layout === "row";
  const completedSteps = steps.filter((s) => s.completed).length;
  const progressValue = (completedSteps / steps.length) * 100;

  return (
    <div className={cn(row ? "flex w-full min-w-0 items-center gap-4" : "mx-auto w-full max-w-xs space-y-4", className)}>
      <div className={cn("flex items-center justify-between", row && "shrink-0 gap-2")}>
        <span className="text-sm font-medium">{title}</span>
        <span className="text-muted-foreground text-xs" aria-live="polite">
          {completedSteps} of {steps.length} steps
        </span>
      </div>
      <Progress value={progressValue} className={cn("h-1.5", row && "w-28 shrink-0")} aria-label={`${title}: ${completedSteps} of ${steps.length} steps`} />
      <ol className={cn(row ? "flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1" : "flex flex-col gap-2", listClassName)}>
        {steps.map((step) => (
          <li key={step.label} className={cn("flex items-center text-sm", row ? "gap-1.5 whitespace-nowrap" : "gap-2")} aria-current={step.current ? "step" : undefined}>
            {step.completed ? (
              <CircleCheckIcon className="text-success size-4 shrink-0" aria-hidden="true" />
            ) : step.current ? (
              <CircleDotIcon className="text-primary size-4 shrink-0" aria-hidden="true" />
            ) : (
              <CircleIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
            )}
            <span
              className={cn(
                step.completed || step.current ? "text-foreground" : "text-muted-foreground",
                step.current && "font-medium",
              )}
            >
              {step.label}
            </span>
            {step.note ? <span className="text-muted-foreground text-xs">· {step.note}</span> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
