"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";

// ── Types ──

interface POListItem {
  id: string;
  poNo: string;
  status: string;
  supplierId: string;
  destinationLocationId: string;
  expectedDeliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
  supplierName: string;
}

// ── Constants ──

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SUBMITTED: "bg-primary/10 text-primary",
  PARTIALLY_RECEIVED: "bg-warning/10 text-warning",
  FULLY_RECEIVED: "bg-success/10 text-success",
  CLOSED_WITH_VARIANCE: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PARTIALLY_RECEIVED: "Partially Received",
  FULLY_RECEIVED: "Fully Received",
  CLOSED_WITH_VARIANCE: "Closed (Variance)",
  CANCELLED: "Cancelled",
};

// ══════════════════════════════════════════════════════════
// Purchase Orders List Page
// ══════════════════════════════════════════════════════════

export default function PurchaseOrdersPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<POListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ── Fetch POs ──
  const fetchPOs = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: POListItem[] }>(
        "/procurement/purchase-orders",
        { token, locationId },
      );
      setPos(res.data);
    } catch (err: any) {
      setError(err.message || "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading && token && locationId) {
      fetchPOs();
    }
  }, [authLoading, token, locationId, fetchPOs]);

  // ── Client-side filter ──
  const filtered = search.trim()
    ? pos.filter(
        (po) =>
          po.poNo.toLowerCase().includes(search.toLowerCase()) ||
          po.supplierName.toLowerCase().includes(search.toLowerCase()),
      )
    : pos;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">
          Loading purchase orders...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Purchase Orders</h2>
          <p className="text-sm text-muted-foreground">
            Manage supplier orders, receiving, and procurement
          </p>
        </div>
        <Link
          href="/procurement/purchase-orders/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New Purchase Order
        </Link>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
          <button
            onClick={fetchPOs}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by PO number or supplier..."
          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                PO Number
              </th>
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Supplier
              </th>
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  {pos.length === 0
                    ? "No purchase orders yet. Click '+ New PO' to create one."
                    : "No matching purchase orders."}
                </td>
              </tr>
            ) : (
              filtered.map((po, i) => (
                <tr
                  key={po.id}
                  className={`border-b border-border transition-colors hover:bg-accent ${
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-sm font-semibold">
                    <Link
                      href={`/procurement/purchase-orders/${po.poNo}`}
                      className="text-primary hover:underline"
                    >
                      {po.poNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-sm">{po.supplierName}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        STATUS_COLORS[po.status] ??
                        "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABELS[po.status] ?? po.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(po.createdAt).toLocaleDateString("en-PH")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/procurement/purchase-orders/${po.poNo}`}
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
          <span className="text-[10px] text-muted-foreground">
            Showing {filtered.length} purchase order{filtered.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={fetchPOs}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>

    </div>
  );
}
