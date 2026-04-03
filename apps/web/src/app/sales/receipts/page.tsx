"use client";

import { useState, useMemo } from "react";
import { Receipt, Search, ChevronDown, ChevronRight, Hash, DollarSign } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { cn } from "@/lib/utils";
import { fmtPeso, fmtDate, fmtTime } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { useLocations } from "@/hooks/use-locations";
import { useEmployeesQuery } from "@/hooks/use-sales-reports";
import { useSalesListQuery, useHistoricalReceiptsQuery, type SaleListItem, type HistoricalReceiptItem } from "@/hooks/use-sales-query";
import { ReceiptDetailDrawer } from "@/components/receipt-detail-drawer";

const STATUS_STYLES: Record<string, string> = {
  COMPLETED: "bg-emerald-500/10 text-emerald-600",
  REFUNDED: "bg-orange-500/10 text-orange-600",
  VOIDED: "bg-red-500/10 text-red-600",
};

export default function SalesReceiptsPage() {
  const { token, locationId } = useAuth();
  const [activeTab, setActiveTab] = useState<"pos" | "imported">("pos");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("COMPLETED,REFUNDED");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerReceipt, setDrawerReceipt] = useState<string | null>(null);

  const locationsQuery = useLocations(token);
  const locations = useMemo(() =>
    (locationsQuery.data?.data ?? []).filter((l) => l.isActive),
    [locationsQuery.data],
  );

  const employeesQuery = useEmployeesQuery(token, locationId);
  const employees = employeesQuery.data?.data ?? [];

  const salesQuery = useSalesListQuery(token, locationId, {
    status: statusFilter,
    q: search || undefined,
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
    filterLocationId: storeFilter || undefined,
    employeeId: activeTab === "pos" ? (employeeFilter || undefined) : undefined,
    limit: 50,
    allLocations: true,
  });

  const historyQuery = useHistoricalReceiptsQuery(token, locationId, {
    q: search || undefined,
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
    filterLocationId: storeFilter || undefined,
    employeeName: activeTab === "imported" ? (employeeFilter || undefined) : undefined,
    limit: 50,
  });

  const sales = salesQuery.data?.data ?? [];
  const historyData = historyQuery.data?.data ?? [];

  // Collect unique employee/cashier names from imported data for the dropdown
  const histEmployees = useMemo(() => {
    const names = new Set<string>();
    for (const h of historyData) {
      if (h.cashier) names.add(h.cashier);
    }
    return [...names].sort();
  }, [historyData]);

  // Stats for POS tab
  const posStats = useMemo(() => {
    let revenue = 0;
    let count = 0;
    for (const s of sales) {
      if (s.status === "COMPLETED") {
        revenue += parseFloat(s.grandTotal);
        count++;
      }
    }
    return { revenue, count };
  }, [sales]);

  // Stats for Imported tab
  const importedStats = useMemo(() => {
    let revenue = 0;
    let count = 0;
    for (const h of historyData) {
      count++;
      if (h.type !== "REFUND") {
        revenue += h.receiptTotal;
      } else {
        revenue -= h.receiptTotal;
      }
    }
    return { revenue, count };
  }, [historyData]);

  const stats = activeTab === "pos" ? posStats : importedStats;

  if (salesQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
              <Receipt size={16} className="text-primary" />
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sales Receipts</h1>
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">View, search, and review completed sales.</p>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <Receipt size={16} className="text-primary" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sales Receipts</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">View, search, and review completed sales.</p>
        <div className="mt-4 flex gap-5">
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Hash size={11} className="text-muted-foreground" /></div>
            <span className="text-muted-foreground">Transactions</span>
            <span className="font-semibold tabular-nums text-foreground">{stats.count.toLocaleString()}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><DollarSign size={11} className="text-muted-foreground" /></div>
            <span className="text-muted-foreground">Revenue</span>
            <span className="font-semibold tabular-nums text-foreground">{fmtPeso(stats.revenue)}</span>
          </div>
          {activeTab === "imported" && (
            <>
              <div className="h-4 w-px bg-border" />
              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">IMPORTED</span>
            </>
          )}
        </div>
      </div>

      {/* POS / Imported History Tabs */}
      <div className="mb-3 flex items-center gap-4 border-b border-border">
        <button
          onClick={() => setActiveTab("pos")}
          className={cn(
            "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "pos" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          POS Transactions
        </button>
        <button
          onClick={() => setActiveTab("imported")}
          className={cn(
            "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
            activeTab === "imported" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          Imported History
          {historyData.length > 0 && (
            <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              {historyData.length}
            </span>
          )}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by sale number..."
            className="h-9 w-full rounded-lg border border-border bg-background pr-3 text-[13px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            style={{ paddingLeft: "2.125rem" }}
          />
        </div>
        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none"
        >
          <option value="">All Stores</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none"
        >
          <option value="COMPLETED,REFUNDED">All Receipts</option>
          <option value="COMPLETED">Completed Only</option>
          <option value="REFUNDED">Refunded Only</option>
        </select>
        <select
          value={employeeFilter}
          onChange={(e) => setEmployeeFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none"
        >
          <option value="">All Employees</option>
          {activeTab === "pos"
            ? employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.fullName}</option>
              ))
            : histEmployees.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))
          }
        </select>
        <DateRangePicker
          startDate={dateFrom}
          endDate={dateTo}
          onChange={(start, end) => { setDateFrom(start); setDateTo(end); }}
        />
      </div>

      {/* POS Transactions Table */}
      {activeTab === "pos" && <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="w-28 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Sale No.</div>
          <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Date</div>
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Customer</div>
          <div className="w-32 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Employee</div>
          <div className="w-24 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Status</div>
          <div className="w-20 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center">Items</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total</div>
        </div>

        {sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Receipt size={16} className="text-muted-foreground" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-foreground">No receipts found</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sales.map((s) => (
              <button
                key={s.id}
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                className="flex w-full flex-col text-left transition-colors duration-100 hover:bg-accent/60 active:bg-accent"
              >
                <div className="flex items-center px-4 py-3">
                  <div className="w-28">
                    <div className="flex items-center gap-1.5">
                      {expandedId === s.id ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
                      <span className="font-mono text-[13px] font-semibold text-foreground">{s.saleNo}</span>
                    </div>
                  </div>
                  <div className="w-24">
                    <div className="text-[12px] text-foreground">{fmtDate(s.completedAt ?? s.createdAt)}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtTime(s.completedAt ?? s.createdAt)}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] text-foreground truncate block">{s.customerName ?? "Walk-in"}</span>
                  </div>
                  <div className="w-32 min-w-0">
                    <span className="text-[12px] text-muted-foreground truncate block">{s.employeeName}</span>
                  </div>
                  <div className="w-24">
                    <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_STYLES[s.status] ?? "bg-muted text-muted-foreground")}>
                      {s.status}
                    </span>
                  </div>
                  <div className="w-20 text-center">
                    <span className="text-[12px] tabular-nums text-muted-foreground">{s.lineCount}</span>
                  </div>
                  <div className="w-28 text-right">
                    <span className="text-[13px] font-semibold tabular-nums text-foreground">{fmtPeso(s.grandTotal)}</span>
                  </div>
                </div>

                {expandedId === s.id && (
                  <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
                    <div className="grid grid-cols-3 gap-4 text-[12px]">
                      <div>
                        <span className="text-muted-foreground">Subtotal:</span>{" "}
                        <span className="font-medium tabular-nums">{fmtPeso(s.subtotal)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Discount:</span>{" "}
                        <span className="font-medium tabular-nums text-destructive">-{fmtPeso(s.discountTotal)}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Location:</span>{" "}
                        <span className="font-medium">{s.locationName}</span>
                      </div>
                    </div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">Showing {sales.length} receipts</span>
          {salesQuery.data?.hasMore && (
            <span className="text-[11px] text-muted-foreground">More results available</span>
          )}
        </div>
      </div>}

      {/* Imported History */}
      {activeTab === "imported" && (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
            <div className="w-28 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Receipt #</div>
            <div className="w-40 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Date</div>
            <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Store</div>
            <div className="w-28 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Employee</div>
            <div className="w-16 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground text-center">Type</div>
            <div className="w-14 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Items</div>
            <div className="w-24 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total</div>
          </div>

          {historyQuery.isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded bg-muted" />
              ))}
            </div>
          ) : historyData.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <Receipt size={28} className="text-muted-foreground/30" />
              <p className="text-[13px] text-muted-foreground">No imported sales receipts</p>
              <p className="text-[11px] text-muted-foreground/70">Import Loyverse Receipts CSV from the Import Center</p>
            </div>
          ) : (
            <div>
              {historyData.map((row: HistoricalReceiptItem) => (
                <div
                  key={row.receiptNumber}
                  className="flex items-center border-b border-border/50 px-4 py-2.5 text-[13px] transition-colors hover:bg-muted/30 cursor-pointer"
                  onClick={() => setDrawerReceipt(row.receiptNumber)}
                >
                  <div className="w-28 font-mono text-[12px] font-medium text-primary">
                    {row.receiptNumber}
                  </div>
                  <div className="w-40 text-[12px] text-muted-foreground">
                    {new Date(row.date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    {" "}
                    <span className="text-muted-foreground/60">{new Date(row.date).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex-1 text-[12px] text-foreground">{row.store || "\u2014"}</div>
                  <div className="w-28 text-[12px] text-muted-foreground">{row.cashier || "\u2014"}</div>
                  <div className="w-16 text-center">
                    <span className={cn(
                      "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      row.type === "REFUND" ? "bg-orange-500/10 text-orange-600" : "bg-emerald-500/10 text-emerald-600",
                    )}>
                      {row.type === "REFUND" ? "Refund" : "Sale"}
                    </span>
                  </div>
                  <div className="w-14 text-right tabular-nums text-[12px] text-muted-foreground">{row.lineCount}</div>
                  <div className="w-24 text-right tabular-nums font-medium">
                    {row.receiptTotal > 0 ? (
                      <span className={row.type === "REFUND" ? "text-red-600" : ""}>
                        {row.type === "REFUND" ? "-" : ""}{"\u20B1"}{row.receiptTotal.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    ) : "\u2014"}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
            <span className="text-[11px] text-muted-foreground">
              Showing {historyData.length} receipts
              <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">IMPORTED</span>
            </span>
            {historyQuery.data?.hasMore && (
              <span className="text-[11px] text-muted-foreground">More results available</span>
            )}
          </div>
        </div>
      )}

      {/* Receipt detail drawer for imported entries */}
      <ReceiptDetailDrawer
        receiptNumber={drawerReceipt}
        onClose={() => setDrawerReceipt(null)}
      />
    </div>
  );
}
