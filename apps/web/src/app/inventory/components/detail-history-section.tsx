"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowRightLeft,
  ClipboardList,
  Clock,
  Package,
  ShoppingCart,
  X,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const HISTORY_ICONS: Record<string, typeof ShoppingCart> = {
  SALE: ShoppingCart,
  RECEIVING: Package,
  TRANSFER_IN: ArrowRightLeft,
  TRANSFER_OUT: ArrowRightLeft,
  ADJUSTMENT: ClipboardList,
  RETURN: ShoppingCart,
  STOCKTAKE: ClipboardList,
  VOID: X,
  SUPPLIER_RETURN: Package,
  OPENING_BALANCE: Package,
};

const HISTORY_LABELS: Record<string, string> = {
  SALE: "Sale",
  RECEIVING: "PO Received",
  TRANSFER_IN: "Transfer In",
  TRANSFER_OUT: "Transfer Out",
  ADJUSTMENT: "Adjustment",
  RETURN: "Return",
  STOCKTAKE: "Stocktake",
  VOID: "Voided",
  SUPPLIER_RETURN: "Supplier Return",
  SUPPLIER_RETURN_CANCEL: "RTV Cancel",
  JOB_CARD_ISSUE: "Job Card Issue",
  JOB_CARD_RETURN: "Job Card Return",
  OPENING_BALANCE: "Opening Balance",
};

const HISTORY_COLORS: Record<string, string> = {
  SALE: "text-blue-600",
  RECEIVING: "text-emerald-600",
  TRANSFER_IN: "text-violet-600",
  TRANSFER_OUT: "text-violet-600",
  ADJUSTMENT: "text-amber-600",
  RETURN: "text-orange-600",
  VOID: "text-red-600",
  SUPPLIER_RETURN: "text-red-600",
};

interface DetailHistorySectionProps {
  locationId: string;
  productId: string;
  token: string;
}

export function DetailHistorySection({
  locationId,
  productId,
  token,
}: DetailHistorySectionProps) {
  const { data, isLoading } = useQuery<{ data: any[] }>({
    queryKey: ["item-history", productId],
    queryFn: () =>
      apiFetch<{ data: any[] }>(
        `/inventory/journal?productId=${productId}&allLocations=true&limit=10`,
        { token, locationId },
      ),
    enabled: !!productId && !!token,
    staleTime: 15_000,
  });

  const entries = data?.data ?? [];

  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock size={10} className="mb-px mr-1 inline" />
          Item History
        </h4>
        <Link
          href={`/inventory/${productId}/history`}
          className="text-[10px] font-medium text-primary hover:underline"
        >
          View All &rarr;
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => (
            <div key={item} className="h-10 animate-pulse rounded-md bg-muted/30" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">No history found for this item.</p>
      ) : (
        <div className="space-y-1">
          {entries.map((entry: any) => {
            const Icon = HISTORY_ICONS[entry.referenceType] ?? ClipboardList;
            const label = HISTORY_LABELS[entry.referenceType] ?? entry.referenceType;
            const color = HISTORY_COLORS[entry.referenceType] ?? "text-muted-foreground";
            const qty = entry.changeQuantity;
            const price = entry.unitPrice ? parseFloat(entry.unitPrice) : null;
            const ref = entry.referenceNumber;
            return (
              <div
                key={entry.id}
                className="flex items-start gap-2 rounded-md px-1 py-1.5 transition-colors hover:bg-muted/30"
              >
                <Icon size={12} className={cn("mt-0.5 shrink-0", color)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("text-[11px] font-semibold", color)}>{label}</span>
                    <span className="text-[11px] text-foreground">
                      {qty > 0 ? "+" : ""}{qty} unit{Math.abs(qty) !== 1 ? "s" : ""}
                      {price ? ` @ \u20B1${price.toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : ""}
                    </span>
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {entry.locationName}{ref ? ` \u2022 ${ref}` : ""}
                  </div>
                </div>
                <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">
                  {timeAgo(entry.effectiveAt)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
