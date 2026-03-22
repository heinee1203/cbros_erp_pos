"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowRightLeft, Search, X, Package, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { useTransfersList } from "@/hooks/use-transfers-list";

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  APPROVED: "bg-primary/10 text-primary",
  PICKING: "bg-violet-100 text-violet-700",
  DISPATCHED: "bg-warning/10 text-warning",
  PARTIALLY_RECEIVED: "bg-orange-100 text-orange-700",
  RECEIVED: "bg-success/10 text-success",
  DISCREPANCY_REVIEW: "bg-red-100 text-red-700",
  CLOSED_WITH_VARIANCE: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-destructive/10 text-destructive",
};

export default function TransferOrdersPage() {
  const { token, locationId } = useAuth();
  const transfersQuery = useTransfersList(token, locationId);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const transfers = transfersQuery.data?.data ?? [];

  const filtered = useMemo(() => {
    let list = transfers;
    if (statusFilter) {
      list = list.filter((t) => t.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.transferNo.toLowerCase().includes(q) ||
          t.sourceLocationName.toLowerCase().includes(q) ||
          t.destinationLocationName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [transfers, search, statusFilter]);

  const drafts = transfers.filter((t) => t.status === "DRAFT").length;
  const inTransit = transfers.filter((t) =>
    ["APPROVED", "PICKING", "DISPATCHED", "PARTIALLY_RECEIVED"].includes(t.status)
  ).length;
  const received = transfers.filter((t) =>
    ["RECEIVED", "CLOSED_WITH_VARIANCE"].includes(t.status)
  ).length;

  if (transfersQuery.isLoading) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Transfer Orders</h2>
          <p className="text-sm text-muted-foreground">
            Inter-location stock movements, dispatch, and receiving
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
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Transfer Orders</h2>
          <p className="text-sm text-muted-foreground">
            Inter-location stock movements, dispatch, and receiving
          </p>
        </div>
        <Link
          href="/procurement/transfer-orders/new"
          className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} /> New Transfer
        </Link>
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
          placeholder="Search by transfer number or location…"
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

      {/* Filters + summary */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{transfers.length} total</span>
          <span>{drafts} drafts</span>
          <span>{inTransit} in transit</span>
          <span>{received} received</span>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="">All Statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="APPROVED">Approved</option>
          <option value="PICKING">Picking</option>
          <option value="DISPATCHED">Dispatched</option>
          <option value="PARTIALLY_RECEIVED">Partially Received</option>
          <option value="RECEIVED">Received</option>
          <option value="CLOSED_WITH_VARIANCE">Closed w/ Variance</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Transfer No.
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                From
              </th>
              <th scope="col" className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground" />
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                To
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Items
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center">
                  <div className="flex flex-col items-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Package size={16} className="text-muted-foreground" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-foreground">
                      No transfers found
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {search ? "Try adjusting your search" : "No transfer orders have been created yet"}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((t, i) => (
                <tr
                  key={t.id}
                  className={cn(
                    "border-b border-border transition-colors hover:bg-accent",
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  )}
                >
                  <td className="px-3 py-2 font-mono text-sm font-semibold">
                    <Link
                      href={`/procurement/transfer-orders/${t.transferNo}`}
                      className="text-primary hover:underline"
                    >
                      {t.transferNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-sm">{t.sourceLocationName}</td>
                  <td className="px-3 py-2 text-center text-muted-foreground">
                    <ArrowRightLeft size={12} />
                  </td>
                  <td className="px-3 py-2 text-sm">
                    {t.destinationLocationName}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold",
                        STATUS_COLORS[t.status] ?? "bg-muted text-muted-foreground"
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {t.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {fmtDate(t.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                    {t.lineCount ?? 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-xs text-muted-foreground">
            {filtered.length} transfer{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
