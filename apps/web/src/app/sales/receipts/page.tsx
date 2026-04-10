"use client";

import { useState, useMemo } from "react";
import { Receipt, Search, ChevronDown, ChevronRight, ChevronLeft, Hash, DollarSign, X } from "lucide-react";
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

const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;

export default function SalesReceiptsPage() {
  const { token, locationId } = useAuth();
  const [activeTab, setActiveTab] = useState<"pos" | "imported">("pos");
  const [search, setSearch] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("COMPLETED,REFUNDED");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drawerReceipt, setDrawerReceipt] = useState<string | null>(null);

  // Pagination state
  const [posPage, setPosPage] = useState(1);
  const [posPageSize, setPosPageSize] = useState<number>(50);
  const [histPage, setHistPage] = useState(1);
  const [histPageSize, setHistPageSize] = useState<number>(50);

  const locationsQuery = useLocations(token);
  const locations = useMemo(() =>
    (locationsQuery.data?.data ?? []).filter((l) => l.isActive),
    [locationsQuery.data],
  );

  const employeesQuery = useEmployeesQuery(token, locationId);
  const employees = employeesQuery.data?.data ?? [];

  // POS sales query — cursor-based, load current page
  const salesQuery = useSalesListQuery(token, locationId, {
    status: statusFilter,
    q: committedSearch || undefined,
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
    filterLocationId: storeFilter || undefined,
    employeeId: activeTab === "pos" ? (employeeFilter || undefined) : undefined,
    limit: posPageSize,
    allLocations: true,
  });

  // Historical receipts — offset-based with totals
  const historyQuery = useHistoricalReceiptsQuery(token, locationId, {
    q: committedSearch || undefined,
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
    filterLocationId: storeFilter || undefined,
    employeeName: activeTab === "imported" ? (employeeFilter || undefined) : undefined,
    offset: (histPage - 1) * histPageSize,
    limit: histPageSize,
  });

  const sales = salesQuery.data?.data ?? [];
  const historyData = historyQuery.data?.data ?? [];
  const histTotal = historyQuery.data?.total ?? 0;
  const histTotalRevenue = historyQuery.data?.totalRevenue ?? 0;
  const histTotalPages = Math.max(1, Math.ceil(histTotal / histPageSize));

  // Unique employee names from current page (for dropdown when no better source)
  const histEmployees = useMemo(() => {
    const names = new Set<string>();
    for (const h of historyData) { if (h.cashier) names.add(h.cashier); }
    return [...names].sort();
  }, [historyData]);

  // POS stats from loaded page
  const posStats = useMemo(() => {
    let revenue = 0, count = 0;
    for (const s of sales) {
      if (s.status === "COMPLETED") { revenue += parseFloat(s.grandTotal); count++; }
    }
    return { revenue, count };
  }, [sales]);

  // Stats depend on active tab
  const stats = activeTab === "pos"
    ? posStats
    : { count: histTotal, revenue: histTotalRevenue };

  // Reset pagination on filter change
  const handleFilterChange = () => { setPosPage(1); setHistPage(1); };
  const submitSearch = () => { setCommittedSearch(search.trim()); handleFilterChange(); };
  const clearSearch = () => { setSearch(""); setCommittedSearch(""); handleFilterChange(); };
  const handleStoreFilter = (v: string) => { setStoreFilter(v); handleFilterChange(); };
  const handleStatusFilter = (v: string) => { setStatusFilter(v); handleFilterChange(); };
  const handleEmployeeFilter = (v: string) => { setEmployeeFilter(v); handleFilterChange(); };
  const handleDateChange = (s: string, e: string) => { setDateFrom(s); setDateTo(e); handleFilterChange(); };
  const handleTabChange = (tab: "pos" | "imported") => { setActiveTab(tab); setEmployeeFilter(""); };

  if (salesQuery.isLoading && activeTab === "pos") {
    return (
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Receipt size={16} className="text-primary" /></div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Sales Receipts</h1>
          </div>
        </div>
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />)}</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Receipt size={16} className="text-primary" /></div>
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

      {/* Tabs */}
      <div className="mb-3 flex items-center gap-4 border-b border-border">
        <button onClick={() => handleTabChange("pos")}
          className={cn("px-3 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === "pos" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          POS Transactions
        </button>
        <button onClick={() => handleTabChange("imported")}
          className={cn("px-3 py-2 text-sm font-medium border-b-2 transition-colors", activeTab === "imported" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
          Imported History
          {histTotal > 0 && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{histTotal.toLocaleString()}</span>}
        </button>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitSearch(); } }}
            placeholder="Search by receipt number... (press Enter)"
            className="h-9 w-full rounded-lg border border-border bg-background pr-14 text-[13px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
            style={{ paddingLeft: "2.125rem" }} />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            {search && <button onClick={clearSearch} className="rounded p-0.5 text-muted-foreground hover:text-foreground"><X size={13} /></button>}
            <button onClick={submitSearch} className="rounded p-0.5 text-muted-foreground hover:text-primary" title="Search"><Search size={13} /></button>
          </div>
        </div>
        <select value={storeFilter} onChange={(e) => handleStoreFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none">
          <option value="">All Stores</option>
          {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => handleStatusFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none">
          <option value="COMPLETED,REFUNDED">All Receipts</option>
          <option value="COMPLETED">Completed Only</option>
          <option value="REFUNDED">Refunded Only</option>
        </select>
        <select value={employeeFilter} onChange={(e) => handleEmployeeFilter(e.target.value)}
          className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none">
          <option value="">All Employees</option>
          {activeTab === "pos"
            ? employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.fullName}</option>)
            : histEmployees.map((name) => <option key={name} value={name}>{name}</option>)
          }
        </select>
        <DateRangePicker startDate={dateFrom} endDate={dateTo} onChange={handleDateChange} />
      </div>

      {/* POS Transactions Table */}
      {activeTab === "pos" && (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Receipt size={16} className="text-muted-foreground" /></div>
              <p className="mt-3 text-[13px] font-medium text-foreground">No receipts found</p>
              <p className="mt-1 text-[12px] text-muted-foreground">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {sales.map((s) => (
                <button key={s.id} onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                  className="flex w-full flex-col text-left transition-colors duration-100 hover:bg-accent/60 active:bg-accent">
                  <div className="flex items-center px-4 py-3">
                    <div className="w-28"><div className="flex items-center gap-1.5">{expandedId === s.id ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}<span className="font-mono text-[13px] font-semibold text-foreground">{s.saleNo}</span></div></div>
                    <div className="w-24"><div className="text-[12px] text-foreground">{fmtDate(s.completedAt ?? s.createdAt)}</div><div className="text-[10px] text-muted-foreground">{fmtTime(s.completedAt ?? s.createdAt)}</div></div>
                    <div className="flex-1 min-w-0"><span className="text-[13px] text-foreground truncate block">{s.customerName ?? "Walk-in"}</span></div>
                    <div className="w-32 min-w-0"><span className="text-[12px] text-muted-foreground truncate block">{s.employeeName}</span></div>
                    <div className="w-24"><span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_STYLES[s.status] ?? "bg-muted text-muted-foreground")}>{s.status}</span></div>
                    <div className="w-20 text-center"><span className="text-[12px] tabular-nums text-muted-foreground">{s.lineCount}</span></div>
                    <div className="w-28 text-right"><span className="text-[13px] font-semibold tabular-nums text-foreground">{fmtPeso(s.grandTotal)}</span></div>
                  </div>
                  {expandedId === s.id && (
                    <div className="border-t border-border/50 bg-muted/20 px-4 py-3">
                      <div className="grid grid-cols-3 gap-4 text-[12px]">
                        <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-medium tabular-nums">{fmtPeso(s.subtotal)}</span></div>
                        <div><span className="text-muted-foreground">Discount:</span> <span className="font-medium tabular-nums text-destructive">-{fmtPeso(s.discountTotal)}</span></div>
                        <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{s.locationName}</span></div>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
          <PaginationFooter
            page={posPage} pageSize={posPageSize} total={sales.length}
            hasMore={salesQuery.data?.hasMore ?? false}
            onPageChange={setPosPage} onPageSizeChange={(s) => { setPosPageSize(s); setPosPage(1); }}
            showTotal={false}
          />
        </div>
      )}

      {/* Imported History Table */}
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
            <div className="space-y-2 p-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}</div>
          ) : historyData.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12">
              <Receipt size={28} className="text-muted-foreground/30" />
              <p className="text-[13px] text-muted-foreground">No imported sales receipts</p>
              <p className="text-[11px] text-muted-foreground/70">Import Loyverse Receipts CSV from the Import Center</p>
            </div>
          ) : (
            <div>
              {historyData.map((row: HistoricalReceiptItem, idx: number) => (
                <div key={`${row.receiptNumber}-${idx}`} onClick={() => setDrawerReceipt(row.receiptNumber)}
                  className="flex items-center border-b border-border/50 px-4 py-2.5 text-[13px] transition-colors hover:bg-muted/30 cursor-pointer">
                  <div className="w-28 font-mono text-[12px] font-medium text-primary">{row.receiptNumber}</div>
                  <div className="w-40 text-[12px] text-muted-foreground">
                    {new Date(row.date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    {" "}<span className="text-muted-foreground/60">{new Date(row.date).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div className="flex-1 text-[12px] text-foreground">{row.store || "\u2014"}</div>
                  <div className="w-28 text-[12px] text-muted-foreground">{row.cashier || "\u2014"}</div>
                  <div className="w-16 text-center">
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      row.type === "REFUND" ? "bg-orange-500/10 text-orange-600" : "bg-emerald-500/10 text-emerald-600")}>
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

          <PaginationFooter
            page={histPage} pageSize={histPageSize} total={histTotal}
            hasMore={historyQuery.data?.hasMore ?? false}
            totalPages={histTotalPages}
            onPageChange={setHistPage} onPageSizeChange={(s) => { setHistPageSize(s); setHistPage(1); }}
            showTotal
            label="receipts"
            badge="IMPORTED"
          />
        </div>
      )}

      <ReceiptDetailDrawer receiptNumber={drawerReceipt} onClose={() => setDrawerReceipt(null)} />
    </div>
  );
}

/* ── Pagination Footer ── */
function PaginationFooter({ page, pageSize, total, hasMore, totalPages, onPageChange, onPageSizeChange, showTotal, label = "receipts", badge }: {
  page: number; pageSize: number; total: number; hasMore: boolean; totalPages?: number;
  onPageChange: (p: number) => void; onPageSizeChange: (s: number) => void;
  showTotal: boolean; label?: string; badge?: string;
}) {
  const pages = totalPages ?? (hasMore ? page + 1 : page);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total || page * pageSize);

  return (
    <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground">
          {showTotal && total > 0
            ? `Showing ${from.toLocaleString()}\u2013${to.toLocaleString()} of ${total.toLocaleString()} ${label}`
            : `Showing ${to} ${label}`
          }
        </span>
        {badge && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">{badge}</span>}
      </div>

      <div className="flex items-center gap-2">
        {/* Page size selector */}
        <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-7 rounded border border-border bg-background px-1.5 text-[11px] outline-none">
          {PAGE_SIZE_OPTIONS.map((s) => <option key={s} value={s}>{s} / page</option>)}
        </select>

        {/* Prev/Next */}
        <button onClick={() => onPageChange(page - 1)} disabled={page <= 1}
          className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft size={14} />
        </button>
        {showTotal && pages > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            Page {page} of {pages.toLocaleString()}
          </span>
        )}
        <button onClick={() => onPageChange(page + 1)} disabled={!hasMore && (!totalPages || page >= pages)}
          className="flex h-7 w-7 items-center justify-center rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
