"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  Clock,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { fmtPeso, fmtDate, fmtTime } from "@/lib/format";

interface ShiftListItem {
  id: string;
  status: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: string;
  actualCash: string | null;
  cashVariance: string | null;
  notes: string | null;
  cashierName: string;
  locationName: string;
  grossSales: string;
}

interface ShiftListResponse {
  data: ShiftListItem[];
  nextCursor: string | null;
  hasMore: boolean;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-amber-500/10 text-amber-500",
  CLOSED: "bg-emerald-500/10 text-emerald-500",
  FORCE_CLOSED: "bg-red-500/10 text-red-500",
};

type SortField = "openedAt" | "closedAt" | "grossSales" | "cashVariance";
type SortDir = "asc" | "desc";

export default function ShiftsPage() {
  const router = useRouter();
  const { token, locationId } = useAuth();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("openedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Build query string
  const queryString = useMemo(() => {
    const parts: string[] = ["limit=100", "allLocations=true"];
    if (statusFilter) parts.push(`status=${statusFilter}`);
    if (dateFrom) parts.push(`from=${dateFrom}`);
    if (dateTo) parts.push(`to=${dateTo}`);
    return parts.join("&");
  }, [statusFilter, dateFrom, dateTo]);

  const { data, isLoading } = useQuery<ShiftListResponse>({
    queryKey: ["shifts", "list", queryString, locationId],
    queryFn: () =>
      apiFetch<ShiftListResponse>(`/shifts?${queryString}`, {
        token,
        locationId,
      }),
    enabled: !!token && !!locationId,
    staleTime: 15_000,
  });

  const shifts = data?.data ?? [];

  // Sort
  const sorted = useMemo(() => {
    return [...shifts].sort((a, b) => {
      let cmp = 0;
      if (sortField === "openedAt") {
        cmp = new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
      } else if (sortField === "closedAt") {
        const aT = a.closedAt ? new Date(a.closedAt).getTime() : 0;
        const bT = b.closedAt ? new Date(b.closedAt).getTime() : 0;
        cmp = aT - bT;
      } else if (sortField === "grossSales") {
        cmp = parseFloat(a.grossSales) - parseFloat(b.grossSales);
      } else if (sortField === "cashVariance") {
        cmp =
          parseFloat(a.cashVariance ?? "0") -
          parseFloat(b.cashVariance ?? "0");
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [shifts, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ChevronsUpDown size={11} className="opacity-30" />;
    return sortDir === "asc" ? (
      <ChevronUp size={11} />
    ) : (
      <ChevronDown size={11} />
    );
  };

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
          <Clock size={16} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Shifts</h1>
          <p className="text-[13px] text-muted-foreground">
            Cashier shifts, Z-readings, and cash reconciliation
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground"
        >
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
          <option value="FORCE_CLOSED">Force Closed</option>
        </select>

        <DateRangePicker
          startDate={dateFrom}
          endDate={dateTo}
          onChange={(start, end) => { setDateFrom(start); setDateTo(end); }}
        />

        {(statusFilter || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setStatusFilter("");
              setDateFrom("");
              setDateTo("");
            }}
            className="h-8 rounded-md px-2.5 text-[13px] text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        {/* Header */}
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <div className="w-[140px]">Employee</div>
          <div className="w-[120px]">Location</div>
          <div className="w-[130px]">
            <button
              onClick={() => handleSort("openedAt")}
              className="group inline-flex items-center gap-0.5"
            >
              Opened <SortIcon field="openedAt" />
            </button>
          </div>
          <div className="w-[130px]">
            <button
              onClick={() => handleSort("closedAt")}
              className="group inline-flex items-center gap-0.5"
            >
              Closed <SortIcon field="closedAt" />
            </button>
          </div>
          <div className="w-[100px]">Status</div>
          <div className="w-[120px] text-right">
            <button
              onClick={() => handleSort("grossSales")}
              className="group inline-flex items-center gap-0.5"
            >
              Gross Sales <SortIcon field="grossSales" />
            </button>
          </div>
          <div className="flex-1 text-right">
            <button
              onClick={() => handleSort("cashVariance")}
              className="group inline-flex items-center gap-0.5"
            >
              Cash Variance <SortIcon field="cashVariance" />
            </button>
          </div>
        </div>

        {/* Body */}
        {isLoading ? (
          <div className="space-y-0">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-12 animate-pulse border-b border-border bg-muted/20"
              />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Clock size={16} className="text-muted-foreground" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-muted-foreground">
              No shifts found
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sorted.map((shift) => {
              const variance = parseFloat(shift.cashVariance ?? "0");
              const isOpen = shift.status === "OPEN";

              return (
                <div
                  key={shift.id}
                  onClick={() => router.push(`/sales/shifts/${shift.id}`)}
                  className={cn(
                    "flex cursor-pointer items-center px-4 py-1.5 transition-colors hover:bg-accent/40",
                    isOpen && "bg-amber-500/[0.03]",
                  )}
                >
                  <div className="w-[140px] text-[13px] font-medium truncate">
                    {shift.cashierName}
                  </div>
                  <div className="w-[120px] text-[13px] text-muted-foreground truncate">
                    {shift.locationName}
                  </div>
                  <div className="w-[130px] text-[12px] text-muted-foreground font-mono">
                    {fmtDate(shift.openedAt)}
                    <br />
                    {fmtTime(shift.openedAt)}
                  </div>
                  <div className="w-[130px] text-[12px] text-muted-foreground font-mono">
                    {shift.closedAt ? (
                      <>
                        {fmtDate(shift.closedAt)}
                        <br />
                        {fmtTime(shift.closedAt)}
                      </>
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="w-[100px]">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                        STATUS_STYLES[shift.status] ??
                          "bg-muted text-muted-foreground",
                      )}
                    >
                      {shift.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="w-[120px] text-right text-[13px] font-mono font-medium">
                    {fmtPeso(shift.grossSales)}
                  </div>
                  <div className="flex-1 text-right">
                    {shift.cashVariance !== null ? (
                      <span
                        className={cn(
                          "text-[13px] font-mono font-medium",
                          Math.abs(variance) < 1
                            ? "text-emerald-500"
                            : Math.abs(variance) < 50
                              ? "text-amber-500"
                              : "text-red-500",
                        )}
                      >
                        {variance >= 0 ? "+" : ""}
                        {fmtPeso(variance)}
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">
                        —
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
