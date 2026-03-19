"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CreditCard } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso, fmtDate } from "@/lib/format";

/* ─── Types ─── */

interface PDCEntry {
  id: string;
  cvNo: string;
  supplierName: string;
  checkNo: string;
  bankName: string;
  checkDate: string;
  amount: string;
  status: string;
}

interface PDCListResponse {
  data: PDCEntry[];
  monthlySummary: { month: string; total: number }[];
}

/* ─── Status styling ─── */

const STATUS_COLORS: Record<string, string> = {
  APPROVED: "bg-blue-100 text-blue-700",
  PRINTED: "bg-indigo-100 text-indigo-700",
  RELEASED: "bg-emerald-100 text-emerald-700",
  CLEARED: "bg-green-100 text-green-800",
  VOIDED: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  APPROVED: "Approved",
  PRINTED: "Printed",
  RELEASED: "Released",
  CLEARED: "Cleared",
  VOIDED: "Voided",
};

/* ═══════════════════════════════════════════════════ */
/*  PDC Report Page                                    */
/* ═══════════════════════════════════════════════════ */

export default function PDCReportPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<PDCEntry[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<
    { month: string; total: number }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPDCs = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<PDCListResponse>("/ap/reports/pdcs", {
        token,
        locationId,
      });
      setEntries(res.data);
      setMonthlySummary(res.monthlySummary || []);
    } catch (err: any) {
      setError(err.message || "Failed to load PDC report");
    } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading && token && locationId) {
      fetchPDCs();
    }
  }, [authLoading, token, locationId, fetchPDCs]);

  // Compute monthly summary from entries if API doesn't provide it
  const computedSummary = useMemo(() => {
    if (monthlySummary.length > 0) return monthlySummary;
    const map = new Map<string, number>();
    entries.forEach((e) => {
      const d = new Date(e.checkDate);
      const key = d.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
      });
      map.set(key, (map.get(key) || 0) + parseFloat(e.amount));
    });
    return Array.from(map.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }, [entries, monthlySummary]);

  if (authLoading || loading) {
    return (
      <div className="mx-auto flex h-full max-w-6xl flex-col">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <Calendar size={16} className="text-primary" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight">
            Post-Dated Checks Report
          </h1>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-6xl flex-col">
      {/* Header */}
      <div className="mb-6 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
          <Calendar size={16} className="text-primary" />
        </div>
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight">
            Post-Dated Checks Report
          </h1>
          <p className="text-xs text-muted-foreground">
            Outstanding post-dated checks with future maturity dates
          </p>
        </div>
      </div>

      {/* Monthly Summary */}
      {computedSummary.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {computedSummary.map((ms) => (
            <div
              key={ms.month}
              className="rounded-xl border border-border bg-background px-4 py-3 shadow-sm"
            >
              <div className="text-[11px] font-medium text-muted-foreground">
                {ms.month}
              </div>
              <div className="mt-0.5 text-lg font-bold tabular-nums">
                {fmtPeso(ms.total)}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
          <button
            onClick={fetchPDCs}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  CV #
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Supplier
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Check #
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Bank
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Check Date
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-12 text-center text-sm text-muted-foreground"
                  >
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <CreditCard
                          size={16}
                          className="text-muted-foreground"
                        />
                      </div>
                      <p className="mt-3 text-[13px] font-medium">
                        No post-dated checks found.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                entries.map((pdc, i) => (
                  <tr
                    key={pdc.id}
                    onClick={() =>
                      router.push(`/ap/check-vouchers/${pdc.id}`)
                    }
                    className={`cursor-pointer border-b border-border transition-colors hover:bg-accent/50 ${
                      i % 2 === 0 ? "bg-background" : "bg-muted/10"
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono text-[13px] font-semibold text-primary">
                      {pdc.cvNo}
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">
                      {pdc.supplierName}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {pdc.checkNo}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {pdc.bankName}
                    </td>
                    <td className="px-3 py-2.5 text-xs font-medium">
                      {fmtDate(pdc.checkDate)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums">
                      {fmtPeso(pdc.amount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_COLORS[pdc.status] ??
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABELS[pdc.status] ??
                          pdc.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">
            {entries.length} post-dated check{entries.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={fetchPDCs}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
