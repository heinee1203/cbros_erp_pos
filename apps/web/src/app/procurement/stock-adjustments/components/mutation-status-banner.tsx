import type { AdjustmentMutationStatus } from "@/hooks/use-adjustment-mutation";

type MutationStatusBannerProps = {
  status: AdjustmentMutationStatus;
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
  const icons: Record<string, string> = {
    submitting: "\u23f3",
    success: "\u2713",
    already_processed: "\u21bb",
    contention_retry: "\u27f3",
    needs_reconcile: "\u26a0",
    error: "\u2715",
  };

  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
        styles[status] ?? ""
      }`}
    >
      <span className="shrink-0 text-sm">{icons[status] ?? ""}</span>
      <span>{message}</span>
    </div>
  );
}
