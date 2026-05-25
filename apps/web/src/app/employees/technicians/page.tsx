"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Wrench,
  Plus,
  Pencil,
  X,
  Loader2,
  Trash2,
  Phone,
  MapPin,
  Users,
  Lightbulb,
  ChevronDown,
  Database,
  DollarSign,
  Save,
  AlertTriangle,
  Search,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useConfirm } from "@/components/confirm-dialog";
import { useLocations } from "@/hooks/use-locations";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  useTechnicians,
  useCreateTechnician,
  useUpdateTechnician,
  useDeleteTechnician,
  useBackfillHistorical,
  useSeedTechnicians,
  useSeedFromProducts,
  useBatchUpdateTechnicians,
  type Technician,
  type CreateTechnicianInput,
} from "@/hooks/use-technicians";

/* ── Role display ── */
const ROLE_LABELS: Record<string, string> = {
  mechanic: "Mechanic",
  installer: "Installer",
  chief_mechanic: "Chief Mechanic",
  electrician: "Electrician",
  painter: "Painter",
};
const ROLE_COLORS: Record<string, string> = {
  chief_mechanic: "bg-amber-500/10 text-amber-700",
  installer: "bg-blue-500/10 text-blue-600",
  mechanic: "bg-emerald-500/10 text-emerald-600",
  electrician: "bg-violet-500/10 text-violet-600",
  painter: "bg-rose-500/10 text-rose-600",
};

const COMMISSION_LABELS: Record<string, string> = {
  percentage: "% of own labor",
  higher_of: "Higher of two rates",
  fixed_per_job: "Fixed per job",
};

function commissionSummary(t: Technician) {
  switch (t.commissionType) {
    case "percentage":
      return `${t.commissionRate}% of own labor`;
    case "higher_of":
      return `Higher of: ${t.commissionRate}% own / ${t.commissionRateAlt ?? 0}% shop total`;
    case "fixed_per_job":
      return `\u20B1${t.commissionRate.toLocaleString()} per job`;
    default:
      return "—";
  }
}

/* ═════════════════════════════════════════════════════════
 * Slide-Over Form
 * ═════════════════════════════════════════════════════════ */
function TechnicianForm({
  tech,
  locations,
  onSave,
  onClose,
  saving,
}: {
  tech: Technician | null;
  locations: { id: string; name: string }[];
  onSave: (data: CreateTechnicianInput & { id?: string }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(tech?.name ?? "");
  const [nickname, setNickname] = useState(tech?.nickname ?? "");
  const [role, setRole] = useState(tech?.role ?? "mechanic");
  const [phone, setPhone] = useState(tech?.phone ?? "");
  const [commissionType, setCommissionType] = useState(tech?.commissionType ?? "percentage");
  const [commissionRate, setCommissionRate] = useState(String(tech?.commissionRate ?? 10));
  const [commissionRateAlt, setCommissionRateAlt] = useState(String(tech?.commissionRateAlt ?? 5));
  const [locationId, setLocationId] = useState(tech?.locationId ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: tech?.id,
      name: name.trim(),
      nickname: nickname.trim() || name.trim().toUpperCase(),
      role,
      phone: phone.trim() || undefined,
      commissionType,
      commissionRate: parseFloat(commissionRate) || 0,
      commissionRateAlt: commissionType === "higher_of" ? (parseFloat(commissionRateAlt) || 0) : undefined,
      locationId: locationId || null,
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />
      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-[16px] font-semibold text-foreground">{tech ? "Edit Technician" : "Add Technician"}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Name */}
          <div>
            <label className="block text-[12px] font-medium text-foreground mb-1">Full Name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
          </div>

          {/* Nickname */}
          <div>
            <label className="block text-[12px] font-medium text-foreground mb-1">Nickname *</label>
            <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value.toUpperCase())} placeholder={name.toUpperCase() || "ALLAN"}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-mono uppercase outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            <p className="mt-0.5 text-[11px] text-muted-foreground">Shown in POS technician dropdown</p>
          </div>

          {/* Role */}
          <div>
            <label className="block text-[12px] font-medium text-foreground mb-1">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20">
              {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-[12px] font-medium text-foreground mb-1">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0917-xxx-xxxx"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
          </div>

          {/* Branch */}
          <div>
            <label className="block text-[12px] font-medium text-foreground mb-1">Primary Branch *</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} required
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20">
              <option value="" disabled>Select branch...</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>

          {/* Commission Setup */}
          <div className="rounded-lg border border-border p-4 space-y-4">
            <h3 className="text-[13px] font-semibold text-foreground">Commission Setup</h3>

            {/* Type selector */}
            <div className="space-y-2">
              {(["percentage", "higher_of", "fixed_per_job"] as const).map((type) => (
                <label key={type} className={cn("flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors",
                  commissionType === type ? "border-primary/40 bg-primary/[0.03]" : "border-border hover:bg-muted/30")}>
                  <input type="radio" name="commType" value={type} checked={commissionType === type}
                    onChange={() => setCommissionType(type)}
                    className="mt-0.5 h-3.5 w-3.5 accent-primary" />
                  <div>
                    <span className="text-[12px] font-medium text-foreground">{COMMISSION_LABELS[type]}</span>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {type === "percentage" && "Gets X% of the labor revenue from jobs they did. Most common."}
                      {type === "higher_of" && "Compares X% of own labor vs Y% of total shop labor — pays whichever is higher."}
                      {type === "fixed_per_job" && "Flat rate per job regardless of labor amount."}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {/* Rate fields based on type */}
            {commissionType === "percentage" && (
              <div>
                <label className="block text-[12px] font-medium text-foreground mb-1">Rate (%)</label>
                <div className="flex items-center gap-2">
                  <input type="number" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)}
                    min="0" max="100" step="0.5"
                    className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-[13px] tabular-nums text-right outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
                  <span className="text-[12px] text-muted-foreground">% of own labor revenue</span>
                </div>
              </div>
            )}

            {commissionType === "higher_of" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[12px] font-medium text-foreground mb-1">Rate A — Own labor (%)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)}
                      min="0" max="100" step="0.5"
                      className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-[13px] tabular-nums text-right outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
                    <span className="text-[12px] text-muted-foreground">% of own labor</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-foreground mb-1">Rate B — Shop total (%)</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={commissionRateAlt} onChange={(e) => setCommissionRateAlt(e.target.value)}
                      min="0" max="100" step="0.5"
                      className="h-9 w-24 rounded-lg border border-border bg-background px-3 text-[13px] tabular-nums text-right outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
                    <span className="text-[12px] text-muted-foreground">% of total shop labor</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground italic">Payout = whichever is higher</p>
              </div>
            )}

            {commissionType === "fixed_per_job" && (
              <div>
                <label className="block text-[12px] font-medium text-foreground mb-1">Amount per job</label>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] text-muted-foreground">{"\u20B1"}</span>
                  <input type="number" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)}
                    min="0" step="50"
                    className="h-9 w-28 rounded-lg border border-border bg-background px-3 text-[13px] tabular-nums text-right outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
                  <span className="text-[12px] text-muted-foreground">per job</span>
                </div>
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="h-9 rounded-lg border border-border px-4 text-[13px] font-medium text-muted-foreground hover:bg-muted transition-colors">Cancel</button>
          <button onClick={handleSubmit as any} disabled={saving || !name.trim() || !locationId}
            className="h-9 rounded-lg bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {tech ? "Save Changes" : "Add Technician"}
          </button>
        </div>
      </div>
    </>
  );
}

/* ═════════════════════════════════════════════════════════
 * Main Page
 * ═════════════════════════════════════════════════════════ */
export default function TechniciansPage() {
  const { token, locationId } = useAuth();
  const confirm = useConfirm();
  const techQuery = useTechnicians(token, locationId);
  const locationsQuery = useLocations(token);
  const createMut = useCreateTechnician(token, locationId);
  const updateMut = useUpdateTechnician(token, locationId);
  const deleteMut = useDeleteTechnician(token, locationId);
  const seedMut = useSeedTechnicians(token, locationId);
  const seedFromProductsMut = useSeedFromProducts(token, locationId);
  const backfillMut = useBackfillHistorical(token, locationId);
  const batchMut = useBatchUpdateTechnicians(token, locationId);
  const [actionResult, setActionResult] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const qc = useQueryClient();

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBranch, setBatchBranch] = useState("");
  const [batchRate, setBatchRate] = useState("10");

  // Commission rates on products
  interface CommRateRow { id: string; name: string; parent_name: string; is_variant: boolean; commission_amount: number; }
  const commRatesQuery = useQuery<{ data: CommRateRow[] }>({
    queryKey: ["commission-rates"],
    queryFn: () => apiFetch<{ data: CommRateRow[] }>("/technicians/commission-rates", { token, locationId }),
    enabled: !!token,
    staleTime: 30_000,
  });
  const commRates = commRatesQuery.data?.data ?? [];
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [editingRateValue, setEditingRateValue] = useState("");

  const saveRateMut = useMutation({
    mutationFn: ({ productId, amount }: { productId: string; amount: number | null }) =>
      apiFetch(`/technicians/commission-rates/${productId}`, { token, locationId, method: "PATCH", body: { commissionAmount: amount } as any }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["commission-rates"] }); setEditingRateId(null); },
  });

  const allTechs = techQuery.data?.data ?? [];
  const locations = (locationsQuery.data?.data ?? []).filter((l) => l.isActive && !l.isSystem);
  const locationMap = new Map(locations.map((l) => [l.id, l.name]));

  const [showForm, setShowForm] = useState(false);
  const [editTech, setEditTech] = useState<Technician | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Filters + sort
  const [searchFilter, setSearchFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  type SortField = "name" | "role" | "branch" | "commissionRate";
  type SortDir = "asc" | "desc";
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (field: SortField) => {
    if (field === sortBy) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortBy(field); setSortDir(field === "commissionRate" ? "desc" : "asc"); }
  };

  const showResult = (type: "success" | "error", message: string) => {
    setActionResult({ type, message });
    setTimeout(() => setActionResult(null), 8000);
  };

  // Unique values for filter dropdowns
  const uniqueRoles = useMemo(() => {
    const roles = new Set(allTechs.map((t) => t.role ?? "mechanic"));
    return [...roles].sort();
  }, [allTechs]);

  const uniqueBranches = useMemo(() => {
    const branches = new Map<string, string>();
    for (const t of allTechs) {
      if (t.locationId) branches.set(t.locationId, locationMap.get(t.locationId) ?? t.locationId);
    }
    return [...branches.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [allTechs, locationMap]);

  const filteredTechs = useMemo(() => {
    let result = showInactive ? [...allTechs] : allTechs.filter((t) => t.isActive);

    if (searchFilter.length >= 2) {
      const q = searchFilter.toLowerCase();
      result = result.filter((t) => t.name.toLowerCase().includes(q) || (t.nickname ?? "").toLowerCase().includes(q));
    }
    if (roleFilter) result = result.filter((t) => (t.role ?? "mechanic") === roleFilter);
    if (branchFilter) result = result.filter((t) => t.locationId === branchFilter);

    result.sort((a, b) => {
      let va: string | number, vb: string | number;
      switch (sortBy) {
        case "name": va = a.name.toLowerCase(); vb = b.name.toLowerCase(); break;
        case "role": va = (a.role ?? "mechanic").toLowerCase(); vb = (b.role ?? "mechanic").toLowerCase(); break;
        case "branch": va = (locationMap.get(a.locationId ?? "") ?? "zzz").toLowerCase(); vb = (locationMap.get(b.locationId ?? "") ?? "zzz").toLowerCase(); break;
        case "commissionRate": va = a.commissionRate; vb = b.commissionRate; break;
        default: va = a.name.toLowerCase(); vb = b.name.toLowerCase();
      }
      if (typeof va === "string") return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });

    return result;
  }, [allTechs, showInactive, searchFilter, roleFilter, branchFilter, sortBy, sortDir, locationMap]);

  const isFiltered = searchFilter || roleFilter || branchFilter;

  const handleSave = async (data: CreateTechnicianInput & { id?: string }) => {
    try {
      if (data.id) {
        const { id, ...rest } = data;
        await updateMut.mutateAsync({ id, ...rest });
      } else {
        await createMut.mutateAsync(data);
      }
      setShowForm(false);
      setEditTech(null);
    } catch {}
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: "Deactivate technician?",
      message: "They will no longer appear in the POS dropdown, but historical records remain intact.",
      confirmLabel: "Deactivate",
      variant: "warning",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(id);
    } catch {}
  };

  const handleEdit = (tech: Technician) => {
    setEditTech(tech);
    setShowForm(true);
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Wrench size={16} className="text-primary" /></div>
            <div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Technicians & Mechanics</h1>
              <p className="text-[13px] text-muted-foreground">Manage mechanics, installers, and their commission rates</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  const res = await seedFromProductsMut.mutateAsync();
                  showResult("success", res.message);
                } catch (err: any) {
                  showResult("error", `Discover failed: ${err?.message || "Unknown error"}`);
                }
              }}
              disabled={seedFromProductsMut.isPending}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              {seedFromProductsMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Users size={12} />}
              Discover from Products
            </button>
            {allTechs.length > 0 && (
              <button
                onClick={async () => {
                  try {
                    const res = await backfillMut.mutateAsync();
                    showResult("success", res.message);
                  } catch (err: any) {
                    showResult("error", `Backfill failed: ${err?.message || "Unknown error"}`);
                  }
                }}
                disabled={backfillMut.isPending}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                {backfillMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Database size={12} />}
                Backfill Historical
              </button>
            )}
            <button
              onClick={() => { setEditTech(null); setShowForm(true); }}
              className="flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              <Plus size={14} /> Add Technician
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-4 flex gap-5 text-[13px]">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Users size={11} className="text-muted-foreground" /></div>
            <span className="text-muted-foreground">Active</span>
            <span className="font-semibold tabular-nums text-foreground">{allTechs.filter((t) => t.isActive).length}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary rounded" />
            Show inactive
          </label>
        </div>
      </div>

      {/* Filter bar */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px] max-w-xs">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Search name..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20" />
            {searchFilter && <button onClick={() => setSearchFilter("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={12} /></button>}
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40">
            <option value="">All Roles</option>
            {uniqueRoles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
          </select>
          <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[12px] text-foreground outline-none focus:border-primary/40">
            <option value="">All Branches</option>
            {uniqueBranches.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          {isFiltered && (
            <button onClick={() => { setSearchFilter(""); setRoleFilter(""); setBranchFilter(""); }}
              className="h-8 rounded-lg border border-border px-2.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">Reset</button>
          )}
          {isFiltered && (
            <span className="text-[11px] text-muted-foreground ml-auto">Showing {filteredTechs.length} of {allTechs.filter((t) => showInactive || t.isActive).length}</span>
          )}
        </div>
      </div>

      {/* Action result banner */}
      {actionResult && (
        <div className={cn("mb-3 flex items-center gap-2 rounded-lg border px-4 py-1.5 text-[12px]",
          actionResult.type === "success"
            ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800"
            : "border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800"
        )}>
          <Database size={14} className={actionResult.type === "success" ? "text-emerald-600 flex-shrink-0" : "text-red-600 flex-shrink-0"} />
          <span className={actionResult.type === "success" ? "text-emerald-800 dark:text-emerald-200" : "text-red-800 dark:text-red-200"}>
            {actionResult.message}
          </span>
          <button onClick={() => setActionResult(null)} className={cn("ml-auto", actionResult.type === "success" ? "text-emerald-600 hover:text-emerald-800" : "text-red-600 hover:text-red-800")}><X size={14} /></button>
        </div>
      )}

      {/* Unassigned branch warning */}
      {(() => {
        const unassigned = allTechs.filter((t) => t.isActive && !t.locationId);
        if (unassigned.length === 0) return null;
        return (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-2 text-[12px] text-amber-800 dark:text-amber-200">
            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" />
            {unassigned.length} technician{unassigned.length !== 1 ? "s have" : " has"} no branch assigned &mdash; commission calculation may be inaccurate.
            {" "}({unassigned.map((t) => t.name).join(", ")})
          </div>
        );
      })()}

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] px-4 py-1.5">
          <span className="text-[12px] font-semibold text-foreground">{selectedIds.size} selected</span>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Branch:</span>
            <select value={batchBranch} onChange={(e) => setBatchBranch(e.target.value)}
              className="h-7 rounded border border-border bg-background px-1.5 text-[11px] outline-none">
              <option value="">Select...</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button
              onClick={async () => {
                if (!batchBranch) return;
                try {
                  const res = await batchMut.mutateAsync({ ids: Array.from(selectedIds), updates: { locationId: batchBranch } });
                  showResult("success", `Updated ${res.updated} technicians' branch`);
                  setSelectedIds(new Set());
                } catch (err: any) { showResult("error", err?.message || "Failed"); }
              }}
              disabled={!batchBranch || batchMut.isPending}
              className="h-7 rounded bg-primary px-2 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >Apply</button>
          </div>
          <div className="w-px h-5 bg-border" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Rate:</span>
            <input type="number" value={batchRate} onChange={(e) => setBatchRate(e.target.value)} min="0" max="100" step="0.5"
              className="h-7 w-14 rounded border border-border bg-background px-1.5 text-[11px] text-right tabular-nums outline-none" />
            <span className="text-[11px] text-muted-foreground">%</span>
            <button
              onClick={async () => {
                const rate = parseFloat(batchRate);
                if (isNaN(rate)) return;
                try {
                  const res = await batchMut.mutateAsync({ ids: Array.from(selectedIds), updates: { commissionRate: rate, commissionType: "percentage" } });
                  showResult("success", `Updated ${res.updated} technicians to ${rate}%`);
                  setSelectedIds(new Set());
                } catch (err: any) { showResult("error", err?.message || "Failed"); }
              }}
              disabled={batchMut.isPending}
              className="h-7 rounded bg-primary px-2 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >Apply</button>
          </div>
          <div className="w-px h-5 bg-border" />
          <button onClick={() => setSelectedIds(new Set())} className="text-[11px] text-muted-foreground hover:text-foreground">Clear</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        {techQuery.isLoading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : filteredTechs.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <Wrench size={28} className="text-muted-foreground/30" />
            <p className="text-sm font-medium">No technicians yet</p>
            <p className="text-xs text-muted-foreground">Add your first technician or seed the CBROS defaults</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[32px_1fr_100px_140px_1fr_80px] gap-1 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <span>
                <input type="checkbox"
                  checked={filteredTechs.length > 0 && filteredTechs.every((t) => selectedIds.has(t.id))}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(new Set(filteredTechs.map((t) => t.id)));
                    else setSelectedIds(new Set());
                  }}
                  className="h-3.5 w-3.5 accent-primary rounded" />
              </span>
              <button onClick={() => handleSort("name")} className={cn("flex items-center gap-0.5", sortBy === "name" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                Name {sortBy === "name" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
              </button>
              <button onClick={() => handleSort("role")} className={cn("flex items-center gap-0.5", sortBy === "role" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                Role {sortBy === "role" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
              </button>
              <button onClick={() => handleSort("branch")} className={cn("flex items-center gap-0.5", sortBy === "branch" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                Branch {sortBy === "branch" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
              </button>
              <button onClick={() => handleSort("commissionRate")} className={cn("flex items-center gap-0.5", sortBy === "commissionRate" ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                Commission {sortBy === "commissionRate" && (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
              </button>
              <span className="text-right">Actions</span>
            </div>
            <div className="divide-y divide-border">
              {filteredTechs.map((tech) => (
                <div key={tech.id} className={cn("grid grid-cols-[32px_1fr_100px_140px_1fr_80px] gap-1 px-4 py-3 items-center transition-colors hover:bg-accent/40",
                  !tech.isActive && "opacity-50",
                  selectedIds.has(tech.id) && "bg-primary/[0.03]")}>
                  {/* Checkbox */}
                  <div>
                    <input type="checkbox" checked={selectedIds.has(tech.id)}
                      onChange={(e) => {
                        setSelectedIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(tech.id); else next.delete(tech.id);
                          return next;
                        });
                      }}
                      className="h-3.5 w-3.5 accent-primary rounded" />
                  </div>
                  {/* Name + nickname */}
                  <div className="min-w-0">
                    <span className="text-[13px] font-medium text-foreground">{tech.name}</span>
                    {tech.nickname && tech.nickname !== tech.name.toUpperCase() && (
                      <span className="ml-1.5 text-[11px] font-mono text-muted-foreground">{tech.nickname}</span>
                    )}
                    {tech.phone && (
                      <div className="flex items-center gap-1 mt-0.5 text-[10px] text-muted-foreground">
                        <Phone size={9} /> {tech.phone}
                      </div>
                    )}
                  </div>
                  {/* Role */}
                  <div>
                    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold capitalize",
                      ROLE_COLORS[tech.role ?? "mechanic"] ?? "bg-muted text-muted-foreground")}>
                      {ROLE_LABELS[tech.role ?? "mechanic"] ?? tech.role}
                    </span>
                  </div>
                  {/* Branch */}
                  <div className="text-[12px] text-muted-foreground truncate">
                    {tech.locationId ? (locationMap.get(tech.locationId) ?? "—") : (
                      <span className="flex items-center gap-1 text-amber-600"><MapPin size={10} /> Unassigned</span>
                    )}
                  </div>
                  {/* Commission */}
                  <div className="text-[12px] text-foreground">{commissionSummary(tech)}</div>
                  {/* Actions */}
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => handleEdit(tech)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <Pencil size={13} />
                    </button>
                    {tech.isActive && (
                      <button onClick={() => handleDelete(tech.id)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{filteredTechs.length} technician{filteredTechs.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Product-Specific Commission Rates */}
      {commRates.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={14} className="text-amber-500" />
            <h2 className="text-[14px] font-semibold text-foreground">Product-Specific Commission Rates</h2>
          </div>
          <p className="text-[12px] text-muted-foreground mb-3">Fixed commission per unit for installation labor. Other labor uses the technician&apos;s default percentage rate.</p>

          <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="grid grid-cols-[1fr_120px_80px] gap-1 border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              <span>Product</span>
              <span className="text-right">Commission/Unit</span>
              <span />
            </div>
            <div className="divide-y divide-border">
              {commRates.map((r) => (
                <div key={r.id} className="grid grid-cols-[1fr_120px_80px] gap-1 px-4 py-1.5 items-center hover:bg-accent/30 transition-colors">
                  <div className="min-w-0">
                    <span className="text-[13px] font-medium text-foreground">
                      {r.is_variant ? `${r.parent_name} \u2014 ${r.name}` : r.name}
                    </span>
                  </div>
                  <div className="text-right">
                    {editingRateId === r.id ? (
                      <div className="flex items-center justify-end gap-1">
                        <span className="text-[11px] text-muted-foreground">{"\u20B1"}</span>
                        <input type="number" value={editingRateValue} onChange={(e) => setEditingRateValue(e.target.value)}
                          min="0" step="10" autoFocus
                          className="h-7 w-20 rounded border border-primary/40 bg-background px-2 text-[12px] text-right tabular-nums outline-none focus:ring-1 focus:ring-primary/20" />
                        <button onClick={() => saveRateMut.mutate({ productId: r.id, amount: parseFloat(editingRateValue) || 0 })}
                          disabled={saveRateMut.isPending}
                          className="rounded p-1 text-emerald-600 hover:bg-emerald-50">
                          {saveRateMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        </button>
                      </div>
                    ) : (
                      <span className="text-[13px] font-semibold tabular-nums text-amber-600">
                        {"\u20B1"}{Number(r.commission_amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-end">
                    {editingRateId !== r.id && (
                      <button onClick={() => { setEditingRateId(r.id); setEditingRateValue(String(r.commission_amount)); }}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Info note */}
      <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/20 px-4 py-3 text-[12px] text-muted-foreground">
        <Lightbulb size={14} className="flex-shrink-0 mt-0.5 text-amber-500" />
        <div>
          <p>Technicians appear in the POS technician picker when a labor item is added to the cart.</p>
          <p className="mt-1">If you previously tracked mechanics as product variants in Loyverse (e.g., &quot;CERWIN&quot; as a variant of &quot;ACC INSTALL ALARM&quot;), you can now remove those variants. The technician picker replaces that approach.</p>
        </div>
      </div>

      {/* Slide-over form */}
      {showForm && (
        <TechnicianForm
          tech={editTech}
          locations={locations}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditTech(null); }}
          saving={createMut.isPending || updateMut.isPending}
        />
      )}
    </div>
  );
}
