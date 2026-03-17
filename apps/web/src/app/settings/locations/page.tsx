"use client";

import { useState, useMemo } from "react";
import {
  MapPin,
  Plus,
  Pencil,
  Power,
  PowerOff,
  Warehouse,
  Store,
  X,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useConfirm } from "@/components/confirm-dialog";
import {
  useLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  useReactivateLocation,
  type LocationRow,
  type CreateLocationPayload,
  type UpdateLocationPayload,
} from "@/hooks/use-locations";

/* ─────────────────────────────────────────────
 * Constants
 * ───────────────────────────────────────────── */

const LOCATION_TYPES = [
  { value: "WAREHOUSE", label: "Warehouse" },
  { value: "RETAIL_STORE", label: "Retail Store" },
  { value: "SHOWROOM", label: "Showroom" },
  { value: "STORE", label: "Store" },
  { value: "TRANSIT_BUFFER", label: "Transit Buffer" },
] as const;

const TYPE_ICONS: Record<string, typeof Warehouse> = {
  WAREHOUSE: Warehouse,
  RETAIL_STORE: Store,
  SHOWROOM: Store,
  STORE: Store,
  TRANSIT_BUFFER: Warehouse,
};

const TYPE_COLORS: Record<string, string> = {
  WAREHOUSE: "bg-blue-500/10 text-blue-600",
  RETAIL_STORE: "bg-emerald-500/10 text-emerald-600",
  SHOWROOM: "bg-violet-500/10 text-violet-600",
  STORE: "bg-amber-500/10 text-amber-600",
  TRANSIT_BUFFER: "bg-slate-500/10 text-slate-600",
};

/** Generate a suggested code from name, e.g. "Main Warehouse" → "MW01" */
function suggestCode(name: string, existingCodes: string[]): string {
  const prefix = name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase())
    .join("")
    .slice(0, 2)
    .padEnd(2, "X");

  for (let i = 1; i <= 99; i++) {
    const code = `${prefix}${String(i).padStart(2, "0")}`;
    if (!existingCodes.includes(code)) return code;
  }
  return `${prefix}01`;
}

/* ─────────────────────────────────────────────
 * Main Page
 * ───────────────────────────────────────────── */

export default function LocationsPage() {
  const { token, refreshLocations } = useAuth();
  const confirm = useConfirm();
  const { data, isLoading } = useLocations(token, true); // include inactive
  const deleteMutation = useDeleteLocation(token, { onSettled: refreshLocations });
  const allLocations = data?.data ?? [];

  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<LocationRow | null>(null);

  const activeLocations = useMemo(
    () => allLocations.filter((l) => l.isActive),
    [allLocations],
  );
  const inactiveLocations = useMemo(
    () => allLocations.filter((l) => !l.isActive),
    [allLocations],
  );

  const displayedLocations = tab === "active" ? activeLocations : inactiveLocations;
  const existingCodes = useMemo(
    () => allLocations.map((l) => l.code),
    [allLocations],
  );

  function openAdd() {
    setEditTarget(null);
    setModalMode("add");
  }

  function openEdit(loc: LocationRow) {
    setEditTarget(loc);
    setModalMode("edit");
  }

  function closeModal() {
    setModalMode(null);
    setEditTarget(null);
  }

  async function handleDeactivate(loc: LocationRow) {
    const ok = await confirm({
      title: "Deactivate Location",
      message: `Are you sure you want to deactivate "${loc.name}"? It will no longer appear in the location selector. You can reactivate it later.`,
      confirmLabel: "Deactivate",
      variant: "danger",
    });
    if (ok) {
      await deleteMutation.mutateAsync(loc.id);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <MapPin size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Locations</h1>
            <p className="text-sm text-muted-foreground">
              Manage warehouses, retail stores, and other locations
            </p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          <Plus size={16} />
          Add Location
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
        <button
          onClick={() => setTab("active")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "active"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Active ({activeLocations.length})
        </button>
        <button
          onClick={() => setTab("inactive")}
          className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            tab === "inactive"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Inactive ({inactiveLocations.length})
        </button>
      </div>

      {/* Location Cards */}
      {displayedLocations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <MapPin size={32} className="text-muted-foreground/40" />
          <p className="mt-3 text-sm text-muted-foreground">
            {tab === "active"
              ? "No active locations. Add your first location."
              : "No inactive locations."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayedLocations.map((loc) => (
            <LocationCard
              key={loc.id}
              location={loc}
              onEdit={() => openEdit(loc)}
              onDeactivate={() => handleDeactivate(loc)}
              token={token}
              onMutationSuccess={refreshLocations}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalMode && (
        <LocationModal
          mode={modalMode}
          location={editTarget}
          existingCodes={existingCodes}
          token={token}
          onClose={closeModal}
          onMutationSuccess={refreshLocations}
        />
      )}

    </div>
  );
}

/* ─────────────────────────────────────────────
 * Location Card
 * ───────────────────────────────────────────── */

function LocationCard({
  location,
  onEdit,
  onDeactivate,
  token,
  onMutationSuccess,
}: {
  location: LocationRow;
  onEdit: () => void;
  onDeactivate: () => void;
  token: string;
  onMutationSuccess: () => void;
}) {
  const reactivate = useReactivateLocation(token, { onSettled: onMutationSuccess });
  const Icon = TYPE_ICONS[location.type] ?? MapPin;
  const typeLabel = LOCATION_TYPES.find((t) => t.value === location.type)?.label ?? location.type;
  const colorClass = TYPE_COLORS[location.type] ?? "bg-muted text-muted-foreground";

  return (
    <div className="group relative flex flex-col rounded-xl border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Type badge + system badge */}
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colorClass}`}>
          <Icon size={12} />
          {typeLabel}
        </span>
        {location.isSystem && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            System
          </span>
        )}
        {!location.isActive && (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-600">
            Inactive
          </span>
        )}
      </div>

      {/* Name & Code */}
      <h3 className="mt-3 text-sm font-semibold text-foreground">{location.name}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground font-mono">{location.code}</p>

      {/* Address */}
      {location.address && (
        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{location.address}</p>
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-2 border-t pt-3">
        {location.isActive ? (
          <>
            <button
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Pencil size={12} />
              Edit
            </button>
            {!location.isSystem && (
              <button
                onClick={onDeactivate}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10"
              >
                <PowerOff size={12} />
                Deactivate
              </button>
            )}
          </>
        ) : (
          <button
            onClick={() => reactivate.mutate(location.id)}
            disabled={reactivate.isPending}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 disabled:opacity-50"
          >
            {reactivate.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Power size={12} />
            )}
            Reactivate
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Add / Edit Modal
 * ───────────────────────────────────────────── */

function LocationModal({
  mode,
  location,
  existingCodes,
  token,
  onClose,
  onMutationSuccess,
}: {
  mode: "add" | "edit";
  location: LocationRow | null;
  existingCodes: string[];
  token: string;
  onClose: () => void;
  onMutationSuccess: () => void;
}) {
  const createMutation = useCreateLocation(token, { onSettled: onMutationSuccess });
  const updateMutation = useUpdateLocation(token, { onSettled: onMutationSuccess });

  const [name, setName] = useState(location?.name ?? "");
  const [code, setCode] = useState(location?.code ?? "");
  const [type, setType] = useState(location?.type ?? "WAREHOUSE");
  const [address, setAddress] = useState(location?.address ?? "");
  const [error, setError] = useState("");

  const isPending = createMutation.isPending || updateMutation.isPending;

  function handleNameChange(val: string) {
    setName(val);
    // Auto-suggest code only when adding a new location and code hasn't been manually edited
    if (mode === "add" && val.length >= 2) {
      setCode(suggestCode(val, existingCodes));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!code.trim()) {
      setError("Code is required");
      return;
    }

    try {
      if (mode === "add") {
        const payload: CreateLocationPayload = {
          name: name.trim(),
          code: code.trim(),
          type,
          ...(address.trim() ? { address: address.trim() } : {}),
        };
        await createMutation.mutateAsync(payload);
      } else if (location) {
        const payload: UpdateLocationPayload & { id: string } = {
          id: location.id,
          name: name.trim(),
          code: code.trim(),
          type,
          address: address.trim() || null,
        };
        await updateMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Operation failed");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-card border shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">
            {mode === "add" ? "Add Location" : "Edit Location"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Location Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Main Warehouse"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
          </div>

          {/* Code */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. WH01"
              maxLength={50}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Auto-suggested from name. Must be unique within your organization.
            </p>
          </div>

          {/* Type */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {LOCATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          {/* Address */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Address <span className="text-muted-foreground/50">(optional)</span>
            </label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Street address, city, region..."
              rows={2}
              className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {isPending && <Loader2 size={14} className="animate-spin" />}
              {mode === "add" ? "Create Location" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

