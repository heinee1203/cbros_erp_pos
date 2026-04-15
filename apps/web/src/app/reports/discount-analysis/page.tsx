"use client";

import { useState } from "react";
import { Tag, Users, Package, Grid3x3, Download, Loader2 } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { downloadCSV } from "@/lib/csv-export";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useDiscountAnalysisQuery, type ReportFilters } from "@/hooks/use-sales-reports";

function fmt(v: number) {
  return v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getDatePreset(preset: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  let from: Date;
  switch (preset) {
    case "today": from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); break;
    case "week": from = new Date(now); from.setDate(from.getDate() - 7); break;
    case "month": from = new Date(now); from.setMonth(from.getMonth() - 1); break;
    case "30d": from = new Date(now); from.setDate(from.getDate() - 30); break;
    default: from = new Date(now); from.setDate(from.getDate() - 30);
  }
  return { from: from.toISOString(), to };
}

type Tab = "employee" | "product" | "category";

export default function DiscountAnalysisPage() {
  const { token, locationId } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("employee");

  const filters: ReportFilters = {
    from: dateFrom ? `${dateFrom}T00:00:00Z` : undefined,
    to: dateTo ? `${dateTo}T23:59:59Z` : undefined,
  };

  const query = useDiscountAnalysisQuery(token, locationId, filters);
  const data = query.data;
  const summary = data?.summary;

  function applyPreset(preset: string) {
    setActivePreset(preset);
    const { from, to } = getDatePreset(preset);
    setDateFrom(from.slice(0, 10));
    setDateTo(to.slice(0, 10));
  }

  function clearDates() { setDateFrom(""); setDateTo(""); setActivePreset(null); }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Discount Analysis</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Breakdown of discounts by employee, product, and category</p>
        </div>
      </div>

      {/* Date filters */}
      <div className="flex flex-wrap items-center gap-2">
        {["today", "week", "30d", "month"].map((p) => (
          <button
            key={p}
            onClick={() => applyPreset(p)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activePreset === p
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/50",
            )}
          >
            {p === "today" ? "Today" : p === "week" ? "7 Days" : p === "30d" ? "30 Days" : "Month"}
          </button>
        ))}
        <DateRangePicker
          startDate={dateFrom}
          endDate={dateTo}
          onChange={(start, end) => { setDateFrom(start); setDateTo(end); setActivePreset(null); }}
        />
        {(dateFrom || dateTo) && (
          <button onClick={clearDates} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
        )}
      </div>

      {query.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : !summary ? (
        <div className="py-20 text-center text-sm text-muted-foreground">No data for this period</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Discounts</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{"\u20B1"}{fmt(summary.totalDiscount)}</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Avg Discount %</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{summary.avgDiscountPct.toFixed(2)}%</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Sales with Discount</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{summary.salesWithDiscount.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">of {summary.totalSales.toLocaleString()} total</div>
            </div>
            <div className="rounded-xl border border-border bg-background p-4">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total Revenue</div>
              <div className="mt-1 text-xl font-bold tabular-nums text-foreground">{"\u20B1"}{fmt(summary.totalRevenue)}</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 rounded-lg bg-muted/30 p-1">
            {([
              { key: "employee" as Tab, label: "By Employee", icon: Users },
              { key: "product" as Tab, label: "By Product", icon: Package },
              { key: "category" as Tab, label: "By Category", icon: Grid3x3 },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === t.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon size={13} /> {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === "employee" && (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-1.5 text-left">Employee</th>
                    <th className="px-4 py-1.5 text-right">Transactions</th>
                    <th className="px-4 py-1.5 text-right">Total Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data!.byEmployee.map((row) => (
                    <tr key={row.userId} className="hover:bg-muted/20">
                      <td className="px-4 py-1.5 font-medium text-foreground">{row.employeeName}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{row.transactionCount.toLocaleString()}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums font-medium text-destructive">{"\u20B1"}{fmt(row.totalDiscount)}</td>
                    </tr>
                  ))}
                  {data!.byEmployee.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No discounts in this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "product" && (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-1.5 text-left">Product</th>
                    <th className="px-4 py-1.5 text-left">SKU</th>
                    <th className="px-4 py-1.5 text-right">Qty</th>
                    <th className="px-4 py-1.5 text-right">Transactions</th>
                    <th className="px-4 py-1.5 text-right">Total Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data!.byProduct.map((row) => (
                    <tr key={row.productId} className="hover:bg-muted/20">
                      <td className="px-4 py-1.5 font-medium text-foreground max-w-[200px] truncate">{row.productName}</td>
                      <td className="px-4 py-1.5 text-xs text-muted-foreground font-mono">{row.sku}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{row.totalQty.toLocaleString()}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{row.transactionCount.toLocaleString()}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums font-medium text-destructive">{"\u20B1"}{fmt(row.totalDiscount)}</td>
                    </tr>
                  ))}
                  {data!.byProduct.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No line-level discounts in this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === "category" && (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th className="px-4 py-1.5 text-left">Category</th>
                    <th className="px-4 py-1.5 text-right">Qty</th>
                    <th className="px-4 py-1.5 text-right">Transactions</th>
                    <th className="px-4 py-1.5 text-right">Total Discount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data!.byCategory.map((row) => (
                    <tr key={row.categoryName} className="hover:bg-muted/20">
                      <td className="px-4 py-1.5 font-medium text-foreground">{row.categoryName}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{row.totalQty.toLocaleString()}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{row.transactionCount.toLocaleString()}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums font-medium text-destructive">{"\u20B1"}{fmt(row.totalDiscount)}</td>
                    </tr>
                  ))}
                  {data!.byCategory.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No line-level discounts in this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
