import { cn } from "@/lib/utils";

type ImportPreviewActionsProps = {
  hasUnmappedLocations: boolean;
  hasMissingFamilies: boolean;
  profileName: string;
  savingProfile: boolean;
  onProfileNameChange: (name: string) => void;
  onSaveProfile: () => void;
  onCancel: () => void;
  onExecute: () => void;
};

export function ImportPreviewActions({
  hasUnmappedLocations,
  hasMissingFamilies,
  profileName,
  savingProfile,
  onProfileNameChange,
  onSaveProfile,
  onCancel,
  onExecute,
}: ImportPreviewActionsProps) {
  const disabled = hasUnmappedLocations || hasMissingFamilies;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="text-sm font-medium text-foreground">Save these settings as a profile</label>
            <input
              value={profileName}
              onChange={(event) => onProfileNameChange(event.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              placeholder="e.g. Weekly update only"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Saves mode, toggles, mappings, and the current field-lock policy for future uploads.
            </p>
          </div>
          <button
            type="button"
            onClick={onSaveProfile}
            disabled={savingProfile || !profileName.trim()}
            className={cn(
              "h-10 rounded-lg px-4 text-sm font-medium transition",
              savingProfile || !profileName.trim()
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "border border-border bg-background text-foreground hover:bg-muted",
            )}
          >
            {savingProfile ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted"
        >
          Cancel
        </button>
        <button
          onClick={onExecute}
          disabled={disabled}
          className={cn(
            "rounded-lg px-5 py-2 text-sm font-medium transition",
            disabled
              ? "cursor-not-allowed bg-muted text-muted-foreground"
              : "bg-blue-600 text-white hover:bg-blue-500",
          )}
        >
          {hasMissingFamilies ? "Select families for new categories" : "Start Import"}
        </button>
      </div>
    </div>
  );
}
