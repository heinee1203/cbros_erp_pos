"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { BarChart3, Download, Printer } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso } from "@/lib/format";
import { downloadCSV } from "@/lib/csv-export";

/* ─── Types ─── */

interface APAgingRow {
  supplierId: string;
  supplierName: string;
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days91to120: number;
  days121to180: number;
  over180: number;
  total: number;
}

/* ═══════════════════════════════════════════════════ */
/*  AP Aging Report Page                               */
/* ═══════════════════════════════════════════════════ */

export default function APAgingReportPage() {
  const { token, locationId, loading: authLoading } = useAuth();

  const [rows, setRows] = useState<APAgingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAging = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: APAgingRow[] }>(
        "/ap/reports/aging",
        { token, locationId }
      );
      setRows(res.data);
    } catch (err: any) {
      setError(err.message || "Failed to load aging report");
    } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading && token && locationId) {
      fetchAging();
    }
  }, [authLoading, token, locationId, fetchAging]);

  const totals = useMemo(() => {
    if (!rows.length) return { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days91to120: 0, days121to180: 0, over180: 0, total: 0 };
    return rows.reduce(
      (acc, r) => ({
        current: acc.current + r.current,
        days1to30: acc.days1to30 + r.days1to30,
        days31to60: acc.days31to60 + r.days31to60,
        days61to90: acc.days61to90 + r.days61to90,
        days91to120: acc.days91to120 + r.days91to120,
        days121to180: acc.days121to180 + r.days121to180,
        over180: acc.over180 + r.over180,
        total: acc.total + r.total,
      }),
      {
        current: 0,
        days1to30: 0,
        days31to60: 0,
        days61to90: 0,
        days91to120: 0,
        days121to180: 0,
        over180: 0,
        total: 0,
      }
    );
  }, [rows]);

  const handleExportCSV = () => {
    const headers = [
      "Supplier",
      "Current",
      "1-30",
      "31-60",
      "61-90",
      "91-120",
      "121-180",
      "180+",
      "Total",
    ];
    const csvRows = rows.map((r) => [
      r.supplierName,
      String(r.current),
      String(r.days1to30),
      String(r.days31to60),
      String(r.days61to90),
      String(r.days91to120),
      String(r.days121to180),
      String(r.over180),
      String(r.total),
    ]);
    downloadCSV("ap-aging-report", headers, csvRows);
  };

  const handlePrint = () => {
    window.print();
  };

  if (authLoading || loading) {
    return (
      <div className="mx-auto flex h-full max-w-7xl flex-col">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <BarChart3 size={16} className="text-primary" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight">
            AP Aging Report
          </h1>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-7xl flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <BarChart3 size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">
              AP Aging Report
            </h1>
            <p className="text-xs text-muted-foreground">
              Outstanding payables breakdown by supplier and aging bucket
            </p>
          </div>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              <Printer size={14} />
              Print
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Download size={14} />
              Export CSV
            </button>
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 print:hidden">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <BarChart3 size={14} />
            Total Payables
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {fmtPeso(totals.total)}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
            <BarChart3 size={14} />
            Suppliers with Balance
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-foreground">
            {rows.length}
          </div>
          <div className="text-[11px] text-muted-foreground">suppliers</div>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
          <button
            onClick={fetchAging}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Supplier
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Current
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  1-30
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  31-60
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  61-90
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  91-120
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  121-180
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  180+
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-12 text-center text-sm text-muted-foreground"
                  >
                    No outstanding payables found.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.supplierId}
                    className={`border-b border-border transition-colors hover:bg-accent/50 ${
                      i % 2 === 0 ? "bg-background" : "bg-muted/10"
                    }`}
                  >
                    <td className="px-3 py-2.5 text-[13px] font-medium">
                      {r.supplierName}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                      {fmtPeso(r.current)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                      {fmtPeso(r.days1to30)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                      {fmtPeso(r.days31to60)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                      {fmtPeso(r.days61to90)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                      {fmtPeso(r.days91to120)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                      {fmtPeso(r.days121to180)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted-foreground">
                      {fmtPeso(r.over180)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums">
                      {fmtPeso(r.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/40">
                  <td className="px-3 py-2.5 text-[13px] font-bold">Total</td>
                  <td className="px-3 py-2.5 text-right text-[12px] font-bold tabular-nums">
                    {fmtPeso(totals.current)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] font-bold tabular-nums">
                    {fmtPeso(totals.days1to30)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] font-bold tabular-nums">
                    {fmtPeso(totals.days31to60)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] font-bold tabular-nums">
                    {fmtPeso(totals.days61to90)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] font-bold tabular-nums">
                    {fmtPeso(totals.days91to120)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] font-bold tabular-nums">
                    {fmtPeso(totals.days121to180)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[12px] font-bold tabular-nums">
                    {fmtPeso(totals.over180)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-[13px] font-bold tabular-nums">
                    {fmtPeso(totals.total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
