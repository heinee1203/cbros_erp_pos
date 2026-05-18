type AdjustmentNotesFieldProps = {
  disabled: boolean;
  notes: string;
  notesRequired: boolean;
  onNotesChange: (value: string) => void;
};

export function AdjustmentNotesField({
  disabled,
  notes,
  notesRequired,
  onNotesChange,
}: AdjustmentNotesFieldProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          Notes{" "}
          {notesRequired ? (
            <span className="text-destructive">* required</span>
          ) : (
            <span className="text-muted-foreground/60">(optional)</span>
          )}
        </label>
        <span className="text-[10px] tabular-nums text-muted-foreground/60">
          {notes.length}/500
        </span>
      </div>
      <textarea
        value={notes}
        onChange={(e) => onNotesChange(e.target.value.slice(0, 500))}
        placeholder={
          notesRequired
            ? "Describe the reason for this adjustment..."
            : "Optional adjustment notes..."
        }
        rows={3}
        disabled={disabled}
        className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
      />
    </div>
  );
}
