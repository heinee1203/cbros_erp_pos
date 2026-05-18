import { CheckCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Step } from "../types";

const STEP_SEQUENCE = ["upload", "preview", "progress", "results"] as const;
const STEP_LABELS = ["Upload", "Preview", "Import", "Results"];

type ImportStepIndicatorProps = {
  step: Step;
};

export function ImportStepIndicator({ step }: ImportStepIndicatorProps) {
  const currentStep = step === "parsing" ? "upload" : step;
  const stepIndex = STEP_SEQUENCE.indexOf(currentStep);

  return (
    <div className="flex items-center gap-2 text-xs font-medium">
      {STEP_SEQUENCE.map((item, index) => {
        const isActive = index === stepIndex;
        const isDone = index < stepIndex;

        return (
          <div key={item} className="flex items-center gap-2">
            {index > 0 && <div className={cn("h-px w-8", isDone ? "bg-emerald-500" : "bg-border")} />}
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition",
                isDone && "bg-emerald-500/20 text-emerald-600",
                isActive && "bg-primary/10 text-primary ring-1 ring-primary/30",
                !isDone && !isActive && "bg-muted text-muted-foreground",
              )}
            >
              {isDone ? <CheckCircle size={12} /> : index + 1}
            </div>
            <span
              className={cn(
                "hidden sm:inline",
                isDone && "text-emerald-600",
                isActive && "text-primary",
                !isDone && !isActive && "text-muted-foreground",
              )}
            >
              {STEP_LABELS[index]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
