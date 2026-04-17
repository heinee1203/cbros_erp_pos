"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { useSupplierReturns, type SupplierReturnRow } from "@/hooks/use-supplier-returns";
import { useSuppliers } from "@/hooks/use-suppliers";
import { fmtPeso, fmtDate } from "@/lib/format";

// ── Status Config ──

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUBMITTED", label: "Submitted" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
  { value: "CREDIT_RECEIVED", label: "Credit Received" },
  { value: "CLOSED", label: "Closed" },
  { value: "CLOSED_WITHOUT_CREDIT", label: "Closed Without Credit" },
  { value: "CANCELLED", label: "Cancelled" },
];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SUBMITTED: "bg-primary/10 text-primary",
  ACKNOWLEDGED: "bg-amber-100 text-amber-700",
  CREDIT_RECEIVED: "bg-green-100 text-green-700",
  CLOSED: "bg-emerald-100 text-emerald-800",
  CLOSED_WITHOUT_CREDIT: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground line-through",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  ACKNOWLEDGED: "Acknowledged",
  CREDIT_RECEIVED: "Credit Received",
  CLOSED: "Closed",
  CLOSED_WITHOUT_CREDIT: "Closed (No Credit)",
  CANCELLED: "Cancelled",
};

// ── Page ──

export default function SupplierReturnsPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("");

  const { data, isLoading, error, refetch } = useSupplierReturns(token, locationId, {
    status: statusFilter || undefined,
    supplierId: supplierFilter || undefined,
    search: search.trim() || undefined,
  });

  const suppliersQuery = useSuppliers(token, locationId);
  const suppliers = suppliersQuery.data?.data ?? [];

  const rtvs = data?.data ?? [];

  // ── Summary cards ──
  const summaryCards = useMemo(() => {
    const openStatuses = new Set(["DRAFT", "SUBMITTED", "ACKNOWLEDGED"]);
    const openCount = rtvs.filter((r) => openStatuses.has(r.status)).length;
    const pendingCreditCount = rtvs.filter((r) => r.status === "ACKNOWLEDGED").length;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const creditThisMonth = rtvs
      .filter(
        (r) =>
          (r.status === "CREDIT_RECEIVED" || r.status === "CLOSED") &&
          r.creditAmount &&
          new Date(r.updatedAt) >= monthStart,
      )
      .reduce((sum, r) => sum + parseFloat(r.creditAmount || "0"), 0);

    return { openCount, pendingCreditCount, creditThisMonth };
  }, [rtvs]);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading supplier returns...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Supplier Returns (RTV)</h2>
          <p className="text-sm text-muted-foreground">
            Manage return-to-vendor orders, credits, and inventory adjustments
          </p>
        </div>
        <Link
          href="/procurement/supplier-returns/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New RTV
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Open RTVs</p>
          <p className="mt-1 text-2xl font-bold">{summaryCards.openCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Pending Credit</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{summaryCards.pendingCreditCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-background p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Credit This Month</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{fmtPeso(summaryCards.creditThisMonth)}</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {(error as Error).message || "Failed to load supplier returns"}
          <button onClick={() => refetch()} className="ml-2 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search RTV number or supplier..."
          className="flex-1 min-w-[200px] rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        >
          <option value="">All Suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">RTV #</th>
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Supplier</th>
              <th scope="col" className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Items</th>
              <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total Cost</th>
              <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Credit</th>
              <th scope="col" className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rtvs.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No supplier returns found. Click &apos;+ New RTV&apos; to create one.
                </td>
              </tr>
            ) : (
              rtvs.map((rtv, i) => (
                <tr
                  key={rtv.id}
                  className={`border-b border-border transition-colors hover:bg-accent cursor-pointer ${
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  }`}
                  onClick={() => {
                    window.location.href = `/procurement/supplier-returns/${rtv.id}`;
                  }}
                >
                  <td className="px-3 py-2 font-mono text-sm font-semibold">
                    <Link
                      href={`/procurement/supplier-returns/${rtv.id}`}
                      className="text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rtv.rtvNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {fmtDate(rtv.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-sm">{rtv.supplierName}</td>
                  <td className="px-3 py-2 text-center text-sm">{rtv.lineCount}</td>
                  <td className="px-3 py-2 text-right text-sm font-medium">
                    {fmtPeso(rtv.totalCost)}
                  </td>
                  <td className="px-3 py-2 text-right text-sm">
                    {rtv.creditAmount ? fmtPeso(rtv.creditAmount) : "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        STATUS_COLORS[rtv.status] ?? "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABELS[rtv.status] ?? rtv.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/procurement/supplier-returns/${rtv.id}`}
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">
            Showing {rtvs.length} return{rtvs.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={() => refetch()}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
