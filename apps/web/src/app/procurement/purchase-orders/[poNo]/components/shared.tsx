import type { ReactNode } from "react";

import type { POMutationStatus } from "@/hooks/use-po-mutations";

type InfoChipProps = {
  label: string;
  primary: string;
  secondary?: string;
};

export function InfoChip({ label, primary, secondary }: InfoChipProps) {
  return (
    <div className="flex-1 rounded-md border border-border/50 bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-semibold">{primary}</div>
      {secondary && (
        <div className="font-mono text-[10px] text-muted-foreground">
          {secondary}
        </div>
      )}
    </div>
  );
}

type TimelineCardProps = {
  label: string;
  date: string | null;
};

export function TimelineCard({ label, date }: TimelineCardProps) {
  return (
    <div className="rounded-md border border-border/50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-xs font-medium tabular-nums">
        {date
          ? new Date(date).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })
          : "\u2014"}
      </div>
    </div>
  );
}

export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}

type ThProps = {
  children?: ReactNode;
  align: "left" | "right";
  width?: string;
};

export function Th({ children, align, width }: ThProps) {
  return (
    <th
      className={`px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground ${
        align === "right" ? "text-right" : "text-left"
      } ${width ?? ""}`}
    >
      {children}
    </th>
  );
}

type MutationStatusBannerProps = {
  status: POMutationStatus;
  message: string;
};

export function MutationStatusBanner({ status, message }: MutationStatusBannerProps) {
  const styles: Record<string, string> = {
    submitting: "bg-primary/5 border-primary/20 text-primary",
    success: "bg-success/10 border-success/20 text-success",
    already_processed: "bg-warning/10 border-warning/20 text-warning",
    contention_retry: "bg-warning/10 border-warning/20 text-warning",
    needs_reconcile: "bg-destructive/10 border-destructive/20 text-destructive",
    error: "bg-destructive/10 border-destructive/20 text-destructive",
  };

  return (
    <div
      className={`mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
        styles[status] ?? ""
      }`}
    >
      {status === "submitting" && <Spinner />}
      <span>{message}</span>
    </div>
  );
}

export function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
