"use client";

import { useState, useMemo } from "react";
import {
  Wrench,
  DollarSign,
  Hash,
  TrendingUp,
  Download,
  Loader2,
  ChevronUp,
  ChevronDown,
  Info,
  Trophy,
} from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { downloadCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useLocations } from "@/hooks/use-locations";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useCommissions, type CommissionRow } from "@/hooks/use-technicians";

interface TechRow {
  technicianId: string | null;
  technicianName: string;
  jobCount: number;
  revenue: number;
  avgPerJob: number;
  pctOfTotal: number;
}

interface MechanicData {
  data: TechRow[];
  summary: { totalRevenue: number; totalJobs: number; avgPerJob: number; topTechnician: string };
}

function fmtCurrency(v: number) {
  return "\u20B1" + v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtNumber(v: number) {
  return v.toLocaleString("en-PH");
}

type SortField = "technicianName" | "jobCount" | "revenue" | "avgPerJob" | "commission";
type SortDir = "asc" | "desc";

/* ── Merge productivity data with commission data ── */
interface MergedRow {
  technicianId: string | null;
  technicianName: string;
  role: string | null;
  locationId: string | null;
  jobCount: number;
  revenue: number;
  avgPerJob: number;
  pctOfTotal: number;
  fixedCommission: number;
  rateCommission: number;
  commission: number;
  formula: string;
  commissionType: string;
}

export default function MechanicProductivityPage() {
  const { token, locationId } = useAuth();
  const locationsQuery = useLocations(token);
  const locationMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of locationsQuery.data?.data ?? []) m.set(l.id, l.name);
    return m;
  }, [locationsQuery.data]);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showFormula, setShowFormula] = useState<string | null>(null);

  const prodQuery = useQuery<MechanicData>({
    queryKey: ["mechanic-productivity", dateFrom, dateTo, locationId],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("allLocations", "true");
      if (dateFrom) params.set("from", `${dateFrom}T00:00:00Z`);
      if (dateTo) params.set("to", `${dateTo}T23:59:59Z`);
      return apiFetch<MechanicData>(`/reports/mechanic-productivity?${params.toString()}`, { token, locationId });
    },
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });

  // Default to all-time range so commissions always load
  const commFrom = dateFrom ? `${dateFrom}T00:00:00Z` : "2020-01-01T00:00:00Z";
  const commTo = dateTo ? `${dateTo}T23:59:59Z` : "2030-12-31T23:59:59Z";

  const commQuery = useCommissions(token, locationId, {
    from: commFrom,
    to: commTo,
    enabled: true,
  });

  const rawData = prodQuery.data?.data ?? [];
  const summary = prodQuery.data?.summary;
  const commissions = commQuery.data?.data ?? [];
  const commSummary = commQuery.data?.summary;

  /* ── Merge ── */
  const merged: MergedRow[] = useMemo(() => {
    const commMap = new Map<string, CommissionRow>();
    commissions.forEach((c) => commMap.set(c.technicianId, c));

    return rawData.map((d) => {
      const comm = d.technicianId ? commMap.get(d.technicianId) : undefined;
      return {
        ...d,
        role: comm?.role ?? null,
        locationId: comm?.locationId ?? null,
        fixedCommission: comm?.fixedCommission ?? 0,
        rateCommission: comm?.rateCommission ?? 0,
        commission: comm?.commission ?? 0,
        formula: comm?.formula ?? "—",
        commissionType: comm?.commissionType ?? "percentage",
      };
    });
  }, [rawData, commissions]);

  /* ── Sort ── */
  const sorted = useMemo(() => {
    return [...merged].sort((a, b) => {
      let va: number | string, vb: number | string;
      switch (sortBy) {
        case "technicianName": va = a.technicianName.toLowerCase(); vb = b.technicianName.toLowerCase(); return sortDir === "asc" ? (va < vb ? -1 : 1) : (vb < va ? -1 : 1);
        case "jobCount": va = a.jobCount; vb = b.jobCount; break;
        case "revenue": va = a.revenue; vb = b.revenue; break;
        case "avgPerJob": va = a.avgPerJob; vb = b.avgPerJob; break;
        case "commission": va = a.commission; vb = b.commission; break;
        default: va = a.revenue; vb = b.revenue;
      }
      return sortDir === "desc" ? (vb as number) - (va as number) : (va as number) - (vb as number);
    });
  }, [merged, sortBy, sortDir]);

  const totalCommission = merged.reduce((s, d) => s + d.commission, 0);
  const maxRevenue = Math.max(...merged.map((d) => d.revenue), 1);

  const handleSort = (field: SortField) => {
    if (field === sortBy) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir(field === "technicianName" ? "asc" : "desc"); }
  };

  function SortHeader({ label, field, width, align = "right" }: { label: string; field: SortField; width: string; align?: "left" | "right" }) {
    const active = sortBy === field;
    return (
      <button onClick={() => handleSort(field)}
        className={cn("flex items-center gap-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] transition-colors", width,
          align === "right" ? "justify-end" : "justify-start",
          active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
        {label}
        {active && (sortDir === "desc" ? <ChevronDown size={10} /> : <ChevronUp size={10} />)}
      </button>
    );
  }

  const ROLE_COLORS: Record<string, string> = {
    chief_mechanic: "bg-amber-500/10 text-amber-700",
    installer: "bg-blue-500/10 text-blue-600",
    mechanic: "bg-emerald-500/10 text-emerald-600",
    electrician: "bg-violet-500/10 text-violet-600",
  };
  const ROLE_LABELS: Record<string, string> = {
    chief_mechanic: "Chief",
    installer: "Installer",
    mechanic: "Mechanic",
    electrician: "Electrician",
    painter: "Painter",
  };

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      <div className="mb-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Wrench size={16} className="text-primary" /></div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Mechanic Productivity</h1>
        </div>
        <p className="mt-1.5 text-[13px] text-muted-foreground">Labor revenue, job count, and commission per technician</p>

        {/* KPI Cards */}
        {summary && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <KPICard icon={<DollarSign size={12} />} label="Total Labor" value={fmtCurrency(summary.totalRevenue)} />
            <KPICard icon={<Hash size={12} />} label="Total Jobs" value={fmtNumber(summary.totalJobs)} />
            <KPICard icon={<TrendingUp size={12} />} label="Avg/Job" value={fmtCurrency(summary.avgPerJob)} />
            <KPICard icon={<DollarSign size={12} />} label="Total Commission" value={fmtCurrency(totalCommission)} className="text-amber-600" accent />
            <KPICard icon={<Trophy size={12} />} label="Top Technician" value={summary.topTechnician} />
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="mb-3 rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={(s, e) => { setDateFrom(s); setDateTo(e); }} />
          {sorted.length > 0 && (
            <button
              onClick={() =>
                downloadCSV(
                  "commission-report",
                  ["Technician", "Role", "Jobs", "Total Revenue", "Fixed Commission", "Rate Commission", "Total Commission", "Formula"],
                  sorted.map((d) => [
                    d.technicianName,
                    d.role ?? "—",
                    String(d.jobCount),
                    d.revenue.toFixed(2),
                    d.fixedCommission.toFixed(2),
                    d.rateCommission.toFixed(2),
                    d.commission.toFixed(2),
                    d.formula,
                  ]),
                )
              }
              className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download size={12} /> Export Commission Report
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <SortHeader label="Technician" field="technicianName" width="w-36" align="left" />
          <div className="w-20 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Role</div>
          <div className="flex-1" />
          <SortHeader label="Jobs" field="jobCount" width="w-16" />
          <SortHeader label="Revenue" field="revenue" width="w-32" />
          <SortHeader label="Avg/Job" field="avgPerJob" width="w-28" />
          <SortHeader label="Commission" field="commission" width="w-32" />
          <div className="w-8" />
        </div>

        {prodQuery.isLoading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : sorted.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <Wrench size={28} className="text-muted-foreground/30" />
            <p className="text-sm font-medium">No labor data</p>
            <p className="text-xs text-muted-foreground">Select a date range to see technician productivity</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sorted.map((d, i) => {
              const pct = (d.revenue / maxRevenue) * 100;
              return (
                <div key={d.technicianId ?? i}>
                  <div className="flex items-center px-4 py-3 transition-colors hover:bg-accent/40">
                    {/* Name + branch */}
                    <div className="w-36 min-w-0">
                      <span className="text-[13px] font-medium text-foreground truncate block">{d.technicianName}</span>
                      {d.locationId && (
                        <span className="text-[10px] text-muted-foreground truncate block">{locationMap.get(d.locationId) ?? ""}</span>
                      )}
                    </div>
                    {/* Role */}
                    <div className="w-20">
                      {d.role && (
                        <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold",
                          ROLE_COLORS[d.role] ?? "bg-muted text-muted-foreground")}>
                          {ROLE_LABELS[d.role] ?? d.role}
                        </span>
                      )}
                    </div>
                    {/* Revenue bar */}
                    <div className="flex-1 pr-4">
                      <div className="h-4 w-full rounded-r-md bg-muted/40 overflow-hidden">
                        <div className="h-4 rounded-r-md transition-all"
                          style={{ width: `${Math.max(pct, 1)}%`, background: "linear-gradient(90deg, #10B981, #059669)", minWidth: "4px" }} />
                      </div>
                    </div>
                    {/* Jobs */}
                    <div className="w-16 text-right text-[12px] tabular-nums font-medium text-foreground">{fmtNumber(d.jobCount)}</div>
                    {/* Revenue */}
                    <div className="w-32 text-right text-[12px] tabular-nums font-medium text-foreground">{fmtCurrency(d.revenue)}</div>
                    {/* Avg/Job */}
                    <div className="w-28 text-right text-[12px] tabular-nums text-muted-foreground">{fmtCurrency(d.avgPerJob)}</div>
                    {/* Commission */}
                    <div className="w-32 text-right text-[12px] tabular-nums font-semibold text-amber-600">{fmtCurrency(d.commission)}</div>
                    {/* Formula toggle */}
                    <div className="w-8 flex justify-center">
                      {d.formula !== "—" && (
                        <button
                          onClick={() => setShowFormula(showFormula === d.technicianId ? null : d.technicianId)}
                          className={cn("rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
                            showFormula === d.technicianId && "bg-muted text-foreground")}
                          title="Show formula"
                        >
                          <Info size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Formula detail row */}
                  {showFormula === d.technicianId && d.formula !== "—" && (
                    <div className="bg-muted/20 border-t border-border/50 px-4 py-1.5 text-[11px] text-muted-foreground space-y-0.5">
                      {d.fixedCommission > 0 && (
                        <div><span className="font-medium text-foreground">Fixed (installs):</span> {fmtCurrency(d.fixedCommission)}</div>
                      )}
                      {d.rateCommission > 0 && (
                        <div><span className="font-medium text-foreground">Rate:</span> {fmtCurrency(d.rateCommission)}</div>
                      )}
                      <div><span className="font-medium">Formula:</span> {d.formula}</div>
                    </div>
                  )}
                </div>
              );
            })}
            {/* Total row */}
            <div className="flex items-center px-4 py-3 bg-muted/30 font-semibold">
              <div className="w-36 text-[13px] text-foreground">TOTAL</div>
              <div className="w-20" />
              <div className="flex-1" />
              <div className="w-16 text-right text-[12px] tabular-nums text-foreground">{fmtNumber(merged.reduce((s, d) => s + d.jobCount, 0))}</div>
              <div className="w-32 text-right text-[12px] tabular-nums text-foreground">{fmtCurrency(merged.reduce((s, d) => s + d.revenue, 0))}</div>
              <div className="w-28" />
              <div className="w-32 text-right text-[12px] tabular-nums text-amber-600">{fmtCurrency(totalCommission)}</div>
              <div className="w-8" />
            </div>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{sorted.length} technicians</span>
          {commSummary && (
            <span className="text-[11px] text-muted-foreground">Shop total labor: {fmtCurrency(commSummary.shopTotalLabor)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon, label, value, accent, className }: { icon: React.ReactNode; label: string; value: string; accent?: boolean; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-background p-3.5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]", accent && "border-amber-200 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/20")}>
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{icon}<span className="text-[11px] font-medium uppercase tracking-wider">{label}</span></div>
      <div className={cn("text-[18px] font-bold tabular-nums text-foreground", className)}>{value}</div>
    </div>
  );
}
