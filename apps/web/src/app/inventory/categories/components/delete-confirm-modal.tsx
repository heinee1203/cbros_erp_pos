import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

type DeleteConfirmModalProps = {
  title: string;
  itemName: string;
  itemCount: number;
  warningMessage?: string;
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
  error: string | null;
};

export function DeleteConfirmModal({
  title,
  itemName,
  itemCount,
  warningMessage,
  onClose,
  onConfirm,
  submitting,
  error,
}: DeleteConfirmModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]">
      <div className="w-full max-w-sm rounded-xl border border-border bg-background shadow-2xl">
        <div className="px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle size={18} className="text-destructive" />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold text-foreground">{title}</h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">This action cannot be undone.</p>
            </div>
          </div>

          <p className="mt-4 text-[13px] text-foreground">
            Are you sure you want to delete <span className="font-semibold">{itemName}</span>?
          </p>

          {itemCount > 0 && (
            <div className="mt-3 rounded-lg border border-warning/20 bg-warning/5 px-3 py-2 text-[12px] text-warning">
              {warningMessage || `This item has ${itemCount.toLocaleString()} products assigned. Reassign them before deleting.`}
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3.5">
          <button
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-border px-3.5 py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || itemCount > 0}
            className="flex items-center gap-1.5 rounded-lg bg-destructive px-3.5 py-2 text-[13px] font-medium text-destructive-foreground shadow-sm transition-all hover:bg-destructive/90 active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
