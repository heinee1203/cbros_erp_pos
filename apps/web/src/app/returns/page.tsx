"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, Search, X, Plus, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate, fmtPeso } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { useReturns } from "@/hooks/use-returns";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  COMPLETED: "bg-success/10 text-success",
  VOIDED: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  COMPLETED: "Completed",
  VOIDED: "Voided",
};

const REFUND_LABELS: Record<string, string> = {
  CASH: "Cash",
  ORIGINAL_METHOD: "Original Method",
  STORE_CREDIT: "Store Credit",
  ACCOUNT_CREDIT: "Account Credit",
};

export default function ReturnsListPage() {
  const router = useRouter();
  const { token, locationId } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const returnsQuery = useReturns(token, locationId, {
    status: statusFilter || undefined,
    search: search.trim() || undefined,
  });

  const allReturns = returnsQuery.data?.data ?? [];

  const filtered = useMemo(() => {
    let list = allReturns;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.returnNumber.toLowerCase().includes(q) ||
          (r.customerName && r.customerName.toLowerCase().includes(q)) ||
          (r.saleNo && r.saleNo.toLowerCase().includes(q))
      );
    }
    return list;
  }, [allReturns, search]);

  // Summary cards: today + this month
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const monthStr = now.toISOString().slice(0, 7);

  const todayReturns = allReturns.filter(
    (r) => r.createdAt.slice(0, 10) === todayStr
  );
  const monthReturns = allReturns.filter(
    (r) => r.createdAt.slice(0, 7) === monthStr
  );

  const todayTotal = todayReturns.reduce(
    (sum, r) => sum + parseFloat(r.total || "0"),
    0
  );
  const monthTotal = monthReturns.reduce(
    (sum, r) => sum + parseFloat(r.total || "0"),
    0
  );

  if (returnsQuery.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Customer Returns</h2>
          <p className="text-sm text-muted-foreground">
            Process and manage product returns and refunds
          </p>
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
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Customer Returns</h2>
          <p className="text-sm text-muted-foreground">
            Process and manage product returns and refunds
          </p>
        </div>
        <Link
          href="/returns/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} /> New Return
        </Link>
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="text-xs font-medium text-muted-foreground">Returns Today</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-semibold">{todayReturns.length}</span>
            <span className="text-sm text-muted-foreground">{fmtPeso(todayTotal)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <div className="text-xs font-medium text-muted-foreground">Returns This Month</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-semibold">{monthReturns.length}</span>
            <span className="text-sm text-muted-foreground">{fmtPeso(monthTotal)}</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by return number, customer, or sale number\u2026"
          className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{allReturns.length} total</span>
          <span>{allReturns.filter((r) => r.status === "DRAFT").length} drafts</span>
          <span>{allReturns.filter((r) => r.status === "COMPLETED").length} completed</span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="COMPLETED">Completed</option>
          <option value="VOIDED">Voided</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Return #
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Date
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Original Sale
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Customer
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Refund Method
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <RotateCcw size={16} className="text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-foreground">
                      No returns found
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {search
                        ? "Try adjusting your search"
                        : "No returns have been processed yet"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => router.push(`/returns/${r.id}`)}
                  className={cn(
                    "border-b border-border cursor-pointer transition-colors hover:bg-accent",
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <td className="px-3 py-2 font-mono text-sm font-semibold">
                    {r.returnNumber}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {fmtDate(r.createdAt)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {r.saleNo ?? "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {r.customerName ?? "\u2014"}
                  </td>
                  <td className="px-3 py-2 text-right text-sm font-medium">
                    {fmtPeso(r.total)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {REFUND_LABELS[r.refundMethod] ?? r.refundMethod}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                        STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground"
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {STATUS_LABELS[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/returns/${r.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs font-medium text-primary hover:underline"
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
          <span className="text-xs text-muted-foreground">
            {filtered.length} return{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
