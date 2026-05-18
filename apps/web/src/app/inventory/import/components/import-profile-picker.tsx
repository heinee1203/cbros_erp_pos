import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ImportProfile } from "../types";

type ImportProfilePickerProps = {
  profiles: ImportProfile[];
  selectedProfileId: string;
  isLoading: boolean;
  busyProfileId: string | null;
  onSelectedProfileChange: (profileId: string) => void;
  onRenameProfile: (profileId: string, name: string) => Promise<void>;
  onDeleteProfile: (profileId: string) => Promise<void>;
};

export function ImportProfilePicker({
  profiles,
  selectedProfileId,
  isLoading,
  busyProfileId,
  onSelectedProfileChange,
  onRenameProfile,
  onDeleteProfile,
}: ImportProfilePickerProps) {
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );
  const [renameValue, setRenameValue] = useState(selectedProfile?.name ?? "");
  const [deleteArmed, setDeleteArmed] = useState(false);

  useEffect(() => {
    setRenameValue(selectedProfile?.name ?? "");
    setDeleteArmed(false);
  }, [selectedProfile?.id, selectedProfile?.name]);

  const busy = selectedProfile ? busyProfileId === selectedProfile.id : false;

  return (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">Saved Import Profile</h3>
            {isLoading && <Loader2 size={13} className="animate-spin text-muted-foreground" />}
          </div>
          <select
            value={selectedProfileId}
            onChange={(event) => onSelectedProfileChange(event.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">No saved profile</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted-foreground">
            Profiles remember mode, create/update toggles, location/category mappings, and field-lock policy.
          </p>
        </div>

        {selectedProfile && (
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              className="h-10 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              placeholder="Profile name"
              disabled={busy}
            />
            <button
              type="button"
              disabled={busy || !renameValue.trim() || renameValue.trim() === selectedProfile.name}
              onClick={() => onRenameProfile(selectedProfile.id, renameValue)}
              className={cn(
                "h-10 rounded-lg px-3 text-sm font-medium transition",
                busy || !renameValue.trim() || renameValue.trim() === selectedProfile.name
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "border border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              Save Name
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!deleteArmed) {
                  setDeleteArmed(true);
                  return;
                }
                onDeleteProfile(selectedProfile.id);
              }}
              className={cn(
                "h-10 rounded-lg px-3 text-sm font-medium transition",
                deleteArmed
                  ? "bg-red-600 text-white hover:bg-red-500"
                  : "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
                busy && "cursor-not-allowed opacity-60",
              )}
            >
              {deleteArmed ? "Confirm Delete" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
