"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Receipt, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { fmtPeso, fmtDate } from "@/lib/format";
import { DateRangePicker } from "@/components/ui/date-range-picker";

/* ─── Types ─── */

interface Supplier {
  id: string;
  name: string;
}

interface CheckVoucher {
  id: string;
  cvNo: string;
  cvDate: string;
  supplierId: string;
  supplierName: string;
  checkNo: string | null;
  bankName: string | null;
  grossAmount: string;
  deductions: string;
  netAmount: string;
  status: string;
  createdAt: string;
}

interface CVListResponse {
  data: CheckVoucher[];
  cursor: string | null;
}

/* ─── Status styling ─── */

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  APPROVED: "bg-blue-100 text-blue-700",
  PRINTED: "bg-indigo-100 text-indigo-700",
  RELEASED: "bg-emerald-100 text-emerald-700",
  CLEARED: "bg-green-100 text-green-800",
  VOIDED: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  APPROVED: "Approved",
  PRINTED: "Printed",
  RELEASED: "Released",
  CLEARED: "Cleared",
  VOIDED: "Voided",
};

/* ═══════════════════════════════════════════════════ */
/*  Check Voucher List Page                            */
/* ═══════════════════════════════════════════════════ */

export default function CheckVouchersPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const router = useRouter();

  const [vouchers, setVouchers] = useState<CheckVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [prevCursors, setPrevCursors] = useState<string[]>([]);

  // Filters
  const [supplierFilter, setSupplierFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  const fetchSuppliers = useCallback(async () => {
    if (!token || !locationId) return;
    try {
      const res = await apiFetch<{ data: Supplier[] }>(
        "/procurement/suppliers",
        { token, locationId }
      );
      setSuppliers(res.data);
    } catch {}
  }, [token, locationId]);

  const fetchVouchers = useCallback(
    async (newCursor?: string) => {
      if (!token || !locationId) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (newCursor) params.set("cursor", newCursor);
        params.set("limit", "50");
        if (supplierFilter) params.set("supplierId", supplierFilter);
        if (statusFilter) params.set("status", statusFilter);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);

        const res = await apiFetch<CVListResponse>(
          `/ap/check-vouchers?${params.toString()}`,
          { token, locationId }
        );
        setVouchers(res.data);
        setHasMore(!!res.cursor);
        setCursor(res.cursor);
      } catch (err: any) {
        setError(err.message || "Failed to load check vouchers");
      } finally {
        setLoading(false);
      }
    },
    [token, locationId, supplierFilter, statusFilter, dateFrom, dateTo]
  );

  useEffect(() => {
    if (!authLoading && token && locationId) {
      fetchVouchers();
      fetchSuppliers();
    }
  }, [authLoading, token, locationId, fetchVouchers, fetchSuppliers]);

  const handleNextPage = () => {
    if (cursor) {
      setPrevCursors((p) => [...p, ""]);
      fetchVouchers(cursor);
    }
  };

  const handlePrevPage = () => {
    const prev = [...prevCursors];
    prev.pop();
    setPrevCursors(prev);
    fetchVouchers(prev[prev.length - 1] || undefined);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <Receipt size={16} className="text-primary" />
          </div>
          <div>
            <h1 className="text-[18px] font-semibold tracking-tight">
              Check Vouchers
            </h1>
            <p className="text-xs text-muted-foreground">
              Manage check vouchers and supplier payments
            </p>
          </div>
        </div>
        <Link
          href="/ap/check-vouchers/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} />
          New Check Voucher
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All Suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>

        <DateRangePicker
          startDate={dateFrom}
          endDate={dateTo}
          onChange={(start, end) => { setDateFrom(start); setDateTo(end); }}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
          <button
            onClick={() => fetchVouchers()}
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
                  Date
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
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Amount
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Deductions
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Net
                </th>
                <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={9} className="px-3 py-3">
                      <div className="h-5 animate-pulse rounded bg-muted" />
                    </td>
                  </tr>
                ))
              ) : vouchers.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-12 text-center text-sm text-muted-foreground"
                  >
                    No check vouchers found. Click &quot;+ New Check
                    Voucher&quot; to create one.
                  </td>
                </tr>
              ) : (
                vouchers.map((cv, i) => (
                  <tr
                    key={cv.id}
                    onClick={() => router.push(`/ap/check-vouchers/${cv.id}`)}
                    className={`cursor-pointer border-b border-border transition-colors hover:bg-accent/50 ${
                      i % 2 === 0 ? "bg-background" : "bg-muted/20"
                    }`}
                  >
                    <td className="px-3 py-2.5 font-mono text-[13px] font-semibold text-primary">
                      {cv.cvNo}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {fmtDate(cv.cvDate)}
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">
                      {cv.supplierName}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {cv.checkNo || "\u2014"}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {cv.bankName || "\u2014"}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] tabular-nums">
                      {fmtPeso(cv.grossAmount)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] tabular-nums text-muted-foreground">
                      {fmtPeso(cv.deductions)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-[13px] font-semibold tabular-nums">
                      {fmtPeso(cv.netAmount)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_COLORS[cv.status] ??
                          "bg-muted text-muted-foreground"
                        }`}
                      >
                        {STATUS_LABELS[cv.status] ??
                          cv.status.replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">
            Showing {vouchers.length} voucher{vouchers.length !== 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            {prevCursors.length > 0 && (
              <button
                onClick={handlePrevPage}
                className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                <ChevronLeft size={12} /> Previous
              </button>
            )}
            {hasMore && (
              <button
                onClick={handleNextPage}
                className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
              >
                Next <ChevronRight size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
