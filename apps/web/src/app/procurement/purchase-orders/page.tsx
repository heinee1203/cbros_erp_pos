"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
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
  destinationLocationName: string;
  receiptCount: number;
  totalReceiptValue: string;
}

interface ReceiptSummary {
  id: string;
  receiptNumber: string;
  receivedAt: string;
  receivedByName: string;
  lineCount: number;
  totalAcceptedQty: number;
  totalValue: number;
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  }) + ", " + d.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ══════════════════════════════════════════════════════════
// Purchase Orders List Page
// ══════════════════════════════════════════════════════════

export default function PurchaseOrdersPage() {
  const { token, locationId, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<POListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Expandable receipt rows
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [receiptCache, setReceiptCache] = useState<Record<string, ReceiptSummary[]>>({});
  const [loadingReceipts, setLoadingReceipts] = useState<Set<string>>(new Set());

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

  // ── Toggle expand / lazy-load receipts ──
  const toggleExpand = useCallback(
    async (po: POListItem) => {
      if (po.receiptCount === 0) return;

      const id = po.id;
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });

      // Lazy-load receipts on first expand
      if (!receiptCache[id] && !loadingReceipts.has(id)) {
        setLoadingReceipts((prev) => new Set(prev).add(id));
        try {
          const res = await apiFetch<{ data: ReceiptSummary[] }>(
            `/procurement/purchase-orders/${id}/receipts-summary`,
            { token: token!, locationId: locationId! },
          );
          setReceiptCache((prev) => ({ ...prev, [id]: res.data }));
        } catch {
          // Silently fail — row just won't show receipts
        } finally {
          setLoadingReceipts((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }
      }
    },
    [receiptCache, loadingReceipts, token, locationId],
  );

  // ── Client-side filter ──
  const filtered = search.trim()
    ? pos.filter(
        (po) =>
          po.poNo.toLowerCase().includes(search.toLowerCase()) ||
          po.supplierName.toLowerCase().includes(search.toLowerCase()) ||
          (po.destinationLocationName || "").toLowerCase().includes(search.toLowerCase()),
      )
    : pos;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">
          Loading purchase orders…
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
          placeholder="Search by PO number or supplier…"
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
                Received At
              </th>
              <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total
              </th>
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  {pos.length === 0
                    ? "No purchase orders yet. Click '+ New PO' to create one."
                    : "No matching purchase orders."}
                </td>
              </tr>
            ) : (
              filtered.map((po, i) => {
                const isExpanded = expandedIds.has(po.id);
                const hasReceipts = po.receiptCount > 0;
                const totalValue = parseFloat(po.totalReceiptValue || "0");
                const receipts = receiptCache[po.id];
                const isLoadingReceipts = loadingReceipts.has(po.id);

                return (
                  <PORow
                    key={po.id}
                    po={po}
                    index={i}
                    isExpanded={isExpanded}
                    hasReceipts={hasReceipts}
                    totalValue={totalValue}
                    receipts={receipts}
                    isLoadingReceipts={isLoadingReceipts}
                    onToggle={() => toggleExpand(po)}
                  />
                );
              })
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

// ── PO Row Component (parent + expandable receipt children) ──

function PORow({
  po,
  index,
  isExpanded,
  hasReceipts,
  totalValue,
  receipts,
  isLoadingReceipts,
  onToggle,
}: {
  po: POListItem;
  index: number;
  isExpanded: boolean;
  hasReceipts: boolean;
  totalValue: number;
  receipts?: ReceiptSummary[];
  isLoadingReceipts: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      {/* Parent PO row */}
      <tr
        className={`border-b border-border transition-colors hover:bg-accent ${
          hasReceipts ? "cursor-pointer" : ""
        } ${index % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
        onClick={hasReceipts ? onToggle : undefined}
      >
        <td className="px-3 py-2 font-mono text-sm font-semibold">
          <span className="inline-flex items-center gap-1.5">
            {hasReceipts && (
              <ChevronRight
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
                  isExpanded ? "rotate-90" : ""
                }`}
              />
            )}
            {!hasReceipts && <span className="inline-block w-3.5" />}
            <Link
              href={`/procurement/purchase-orders/${po.poNo}`}
              className="text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {po.poNo}
            </Link>
          </span>
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
        <td className="px-3 py-2 text-sm text-muted-foreground">
          {po.destinationLocationName || "—"}
        </td>
        <td className="px-3 py-2 text-right text-sm tabular-nums">
          {totalValue > 0 ? formatCurrency(totalValue) : "—"}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {new Date(po.createdAt).toLocaleDateString("en-PH")}
        </td>
      </tr>

      {/* Expanded receipt rows */}
      {isExpanded && (
        <>
          {isLoadingReceipts && !receipts && (
            <tr className="border-b border-border bg-muted/30">
              <td colSpan={6} className="px-3 py-2">
                <span className="inline-flex items-center gap-2 pl-8 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading receipts…
                </span>
              </td>
            </tr>
          )}
          {receipts?.map((r) => (
            <tr
              key={r.id}
              className="border-b border-border bg-muted/30 transition-colors hover:bg-muted/50"
            >
              <td className="py-1.5 pl-10 pr-3">
                <Link
                  href={`/procurement/purchase-orders/${po.poNo}`}
                  className="text-xs text-muted-foreground hover:text-primary hover:underline"
                >
                  #{r.receiptNumber}
                </Link>
              </td>
              <td colSpan={3} className="px-3 py-1.5">
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(r.receivedAt)}
                </span>
                <span className="ml-3 text-xs">
                  {r.lineCount} {r.lineCount === 1 ? "item" : "items"}
                </span>
              </td>
              <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                {formatCurrency(r.totalValue)}
              </td>
              <td className="px-3 py-1.5" />
            </tr>
          ))}
        </>
      )}
    </>
  );
}
