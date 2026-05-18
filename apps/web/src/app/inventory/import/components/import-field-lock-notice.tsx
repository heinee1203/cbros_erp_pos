import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getImportModeFieldLockPolicy,
  getModeScopedUpdateCount,
} from "../import-mode-policy";
import type { ImportMode, PreviewResponse } from "../types";

type ImportFieldLockNoticeProps = {
  preview: PreviewResponse;
  importMode: ImportMode;
};

export function ImportFieldLockNotice({
  preview,
  importMode,
}: ImportFieldLockNoticeProps) {
  const policy = getImportModeFieldLockPolicy(importMode);
  const scopedUpdateCount = getModeScopedUpdateCount(preview, importMode);
  const lockedOnlyRows =
    importMode === "update_only"
      ? Math.max(0, preview.updateCount - scopedUpdateCount)
      : 0;
  const Icon = policy.tone === "broad" ? AlertTriangle : ShieldCheck;

  return (
    <section
      className={cn(
        "rounded-xl border bg-card p-4 shadow-sm",
        policy.tone === "strict" && "border-emerald-200 bg-emerald-50/60",
        policy.tone === "safe" && "border-sky-200 bg-sky-50/60",
        policy.tone === "broad" && "border-amber-200 bg-amber-50/70",
      )}
      aria-label="Import field lock policy"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              policy.tone === "strict" && "bg-emerald-100 text-emerald-700",
              policy.tone === "safe" && "bg-sky-100 text-sky-700",
              policy.tone === "broad" && "bg-amber-100 text-amber-700",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">{policy.title}</h3>
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  policy.tone === "strict" && "bg-emerald-100 text-emerald-700",
                  policy.tone === "safe" && "bg-sky-100 text-sky-700",
                  policy.tone === "broad" && "bg-amber-100 text-amber-700",
                )}
              >
                {policy.badge}
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {policy.criticalCopy ?? policy.note}
            </p>
            {policy.criticalCopy ? (
              <p className="mt-1 text-xs text-muted-foreground">{policy.note}</p>
            ) : null}
            {lockedOnlyRows > 0 ? (
              <p className="mt-2 text-xs font-medium text-emerald-700">
                {lockedOnlyRows.toLocaleString()} update row
                {lockedOnlyRows === 1 ? "" : "s"} only changed locked fields and will move to No
                Change.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <FieldChipGroup
          icon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
          title="What will change"
          chips={policy.whatWillChange}
          tone="allowed"
        />
        <FieldChipGroup
          icon={<Lock className="h-3.5 w-3.5" aria-hidden="true" />}
          title="Locked fields"
          chips={policy.lockedFields}
          tone="locked"
        />
      </div>
    </section>
  );
}

function FieldChipGroup({
  icon,
  title,
  chips,
  tone,
}: {
  icon: ReactNode;
  title: string;
  chips: string[];
  tone: "allowed" | "locked";
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {title}
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
              tone === "allowed" &&
                "border-emerald-200 bg-emerald-50 text-emerald-700",
              tone === "locked" && "border-slate-200 bg-slate-50 text-slate-600",
            )}
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}
