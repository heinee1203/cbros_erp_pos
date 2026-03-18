"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Calendar, Loader2 } from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useProductDetail } from "@/hooks/use-products";
import { useStockJournal, type JournalEntry } from "@/hooks/use-stock-journal";
import { useLocations } from "@/hooks/use-locations";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<string, string> = {
  SALE: "Sale",
  RETURN: "Refund",
  RECEIVING: "PO Receipt",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ADJUSTMENT: "Adjustment",
  STOCKTAKE: "Inventory Count",
  VOID: "Void",
  JOB_CARD_ISSUE: "Job Card Issue",
  JOB_CARD_RETURN: "Job Card Return",
  OPENING_BALANCE: "Opening Balance",
};

const getReasonStyle = (type: string): string => {
  switch (type) {
    case "SALE": return "bg-blue-50 text-blue-700";
    case "RETURN": return "bg-purple-50 text-purple-700";
    case "RECEIVING": return "bg-green-50 text-green-700";
    case "TRANSFER_IN": return "bg-emerald-50 text-emerald-700";
    case "TRANSFER_OUT": return "bg-amber-50 text-amber-700";
    case "ADJUSTMENT": return "bg-orange-50 text-orange-700";
    case "STOCKTAKE": return "bg-cyan-50 text-cyan-700";
    case "VOID": return "bg-red-50 text-red-700";
    case "JOB_CARD_ISSUE": return "bg-violet-50 text-violet-700";
    case "JOB_CARD_RETURN": return "bg-violet-50 text-violet-700";
    case "OPENING_BALANCE": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-PH", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Map referenceType to the route path for the source document */
function getDocumentLink(referenceType: string, referenceNumber: string | null): string | null {
  if (!referenceNumber) return null;
  switch (referenceType) {
    case "RECEIVING":
      return `/procurement/purchase-orders/${referenceNumber}`;
    case "TRANSFER_IN":
    case "TRANSFER_OUT":
      return `/procurement/transfer-orders/${referenceNumber}`;
    case "SALE":
    case "RETURN":
    case "VOID":
      return `/sales/${referenceNumber}`;
    default:
      return null;
  }
}

export default function ItemHistoryPage() {
  const { productId } = useParams<{ productId: string }>();
  const { token, locationId, apiLocationId } = useAuth();

  const { data: product } = useProductDetail(token, apiLocationId, productId);

  const locationsQuery = useLocations(token);
  const locations = useMemo(() => locationsQuery.data?.data ?? [], [locationsQuery.data]);

  // Filters
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [storeFilter, setStoreFilter] = useState("");
  const [reasonFilter, setReasonFilter] = useState("");

  const journal = useStockJournal(token, apiLocationId, {
    productId,
    allLocations: true,
    locationId: storeFilter || undefined,
    referenceType: reasonFilter || undefined,
    dateFrom,
    dateTo,
  }, 100);

  const entries = useMemo(() => {
    return journal.data?.pages.flatMap((p) => p.data) ?? [];
  }, [journal.data]);

  const totalIn = useMemo(() => entries.reduce((s, e) => s + (e.changeQuantity > 0 ? e.changeQuantity : 0), 0), [entries]);
  const totalOut = useMemo(() => entries.reduce((s, e) => s + (e.changeQuantity < 0 ? e.changeQuantity : 0), 0), [entries]);

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={`/inventory/${productId}/edit`}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
        >
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">Item History</h1>
          {product && (
            <p className="truncate text-[12px] text-muted-foreground">
              {product.name} &middot; {product.sku}
            </p>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-muted-foreground" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12px]"
          />
          <span className="text-muted-foreground text-xs">&ndash;</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-[12px]"
          />
        </div>

        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
        >
          <option value="">All Stores</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-[12px]"
        >
          <option value="">All Reasons</option>
          <option value="SALE">Sale</option>
          <option value="RETURN">Refund</option>
          <option value="RECEIVING">PO Receipt</option>
          <option value="TRANSFER_IN">Transfer In</option>
          <option value="TRANSFER_OUT">Transfer Out</option>
          <option value="ADJUSTMENT">Adjustment</option>
          <option value="STOCKTAKE">Inventory Count</option>
          <option value="VOID">Void</option>
          <option value="JOB_CARD_ISSUE">Job Card Issue</option>
          <option value="JOB_CARD_RETURN">Job Card Return</option>
          <option value="OPENING_BALANCE">Opening Balance</option>
        </select>
      </div>

      {/* Summary strip */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{entries.length} movements</span>
        <span className="text-green-600">+{totalIn} in</span>
        <span className="text-red-600">{totalOut} out</span>
        <span>Net: {totalIn + totalOut >= 0 ? "+" : ""}{totalIn + totalOut}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Date</th>
              <th className="px-3 py-2 text-left font-medium">Store</th>
              <th className="px-3 py-2 text-left font-medium">Employee</th>
              <th className="px-3 py-2 text-left font-medium">Reason</th>
              <th className="px-3 py-2 text-right font-medium">Adjustment</th>
              <th className="px-3 py-2 text-right font-medium">Stock After</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border/50 hover:bg-accent/30">
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {formatDateTime(entry.effectiveAt)}
                </td>
                <td className="px-3 py-2">{entry.locationName}</td>
                <td className="px-3 py-2 text-muted-foreground">{entry.actorName ?? "System"}</td>
                <td className="px-3 py-2">
                  <span className={cn(
                    "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium",
                    getReasonStyle(entry.referenceType),
                  )}>
                    {TYPE_LABELS[entry.referenceType] ?? entry.referenceType}
                  </span>
                  {entry.referenceNumber && (() => {
                    const href = getDocumentLink(entry.referenceType, entry.referenceNumber);
                    return href ? (
                      <Link
                        href={href}
                        className="ml-1 text-[10px] font-medium text-green-600 hover:underline hover:opacity-80"
                      >
                        #{entry.referenceNumber}
                      </Link>
                    ) : (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        #{entry.referenceNumber}
                      </span>
                    );
                  })()}
                  {entry.reasonCode && (
                    <span className="ml-1 text-[10px] text-muted-foreground">
                      ({entry.reasonCode.replace(/_/g, " ").toLowerCase()})
                    </span>
                  )}
                </td>
                <td className={cn(
                  "px-3 py-2 text-right font-semibold tabular-nums",
                  entry.changeQuantity > 0 ? "text-green-600" : "text-red-600",
                )}>
                  {entry.changeQuantity > 0 ? "+" : ""}{entry.changeQuantity}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {entry.balanceAfter}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {journal.isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        )}

        {!journal.isLoading && entries.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No stock movements found for this item in the selected period.
          </div>
        )}
      </div>

      {/* Load More */}
      {journal.hasNextPage && (
        <div className="flex justify-center">
          <button
            onClick={() => journal.fetchNextPage()}
            disabled={journal.isFetchingNextPage}
            className="rounded-lg border border-border px-4 py-2 text-[12px] font-medium hover:bg-muted disabled:opacity-50"
          >
            {journal.isFetchingNextPage ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}
