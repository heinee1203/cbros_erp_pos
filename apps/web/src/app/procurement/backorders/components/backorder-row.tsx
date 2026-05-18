"use client";

import { ArrowRightLeft, Check, Pencil, ShoppingCart, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

import { PRIORITY_BADGES, PRIORITY_LABELS, STATUS_BADGES, STATUS_LABELS } from "../constants";
import type { BackorderItem } from "../types";

interface BackorderRowProps {
  item: BackorderItem;
  hideSupplier?: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onCreatePO: () => void;
  onResource: () => void;
}

export function BackorderRow({
  item,
  hideSupplier,
  onEdit,
  onCancel,
  onCreatePO,
  onResource,
}: BackorderRowProps) {
  const priorityBadge = PRIORITY_BADGES[item.priority] ?? "bg-gray-100 text-gray-600";
  const statusBadge = STATUS_BADGES[item.status] ?? "bg-gray-100 text-gray-600";

  const waitUntilStr = item.waitUntil
    ? new Date(item.waitUntil).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "--";

  const overdueFlag =
    item.isOverdue ||
    (item.waitUntil && item.status === "PENDING" && new Date(item.waitUntil) < new Date());

  const isPending = item.status === "PENDING";

  return (
    <tr className={cn("group transition-colors hover:bg-muted/30", overdueFlag && isPending && "bg-red-50/50 dark:bg-red-900/10")}>
      <td className="max-w-[240px] px-4 py-1.5">
        <div className="truncate text-sm font-medium text-foreground" title={item.productName}>
          {item.productName}
        </div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">{item.sku}</div>
      </td>

      {!hideSupplier && (
        <td className="max-w-[140px] whitespace-nowrap px-4 py-1.5 text-sm text-foreground">
          <span className="truncate block" title={item.supplierName}>
            {item.supplierName}
          </span>
        </td>
      )}

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm font-medium text-foreground">
        {(item.quantityOutstanding ?? item.qtyNeeded).toLocaleString()}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
        {item.unitCost ? `\u20b1${parseFloat(item.unitCost).toLocaleString()}` : "--"}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-sm text-muted-foreground">
        {item.sourcePONumber ? (
          <span className="font-mono text-xs">{item.sourcePONumber}</span>
        ) : (
          <span className="text-muted-foreground/50">--</span>
        )}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-sm">
        {item.status === "INCLUDED_IN_PO" && item.targetPoNumber ? (
          <span className="font-mono text-xs text-blue-600">{item.targetPoNumber}</span>
        ) : (
          <span
            className={cn(
              overdueFlag ? "text-red-600 font-medium" : "text-muted-foreground",
            )}
          >
            {waitUntilStr}
            {overdueFlag && isPending && (
              <span className="ml-1 inline-flex rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                OVERDUE
              </span>
            )}
          </span>
        )}
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-right tabular-nums text-sm">
        <span
          className={cn(
            item.daysPending > 14
              ? "text-red-600 font-medium"
              : item.daysPending > 7
                ? "text-amber-600"
                : "text-muted-foreground",
          )}
        >
          {item.daysPending}d
        </span>
      </td>

      <td className="whitespace-nowrap px-4 py-1.5 text-center">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
            priorityBadge,
          )}
        >
          {PRIORITY_LABELS[item.priority] ?? item.priority}
        </span>
      </td>

      {!hideSupplier && (
        <td className="whitespace-nowrap px-4 py-1.5 text-center">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
              statusBadge,
            )}
          >
            {STATUS_LABELS[item.status] ?? item.status}
          </span>
        </td>
      )}

      <td className="whitespace-nowrap px-4 py-1.5 text-center">
        <div className="flex items-center justify-center gap-1">
          {isPending && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onCreatePO(); }}
                className="flex h-6 items-center gap-1 rounded bg-blue-600 px-2 text-[10px] font-medium text-white transition-colors hover:bg-blue-700"
                title="Create new PO for this item"
              >
                <ShoppingCart size={10} />
                PO
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onResource(); }}
                className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Re-source to different supplier"
              >
                <ArrowRightLeft size={10} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Edit backorder"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                title="Cancel backorder"
              >
                <XCircle size={10} />
              </button>
            </>
          )}
          {item.status === "FULFILLED" && (
            <span className="flex items-center gap-1 text-[10px] text-green-600"><Check size={10} /> Fulfilled</span>
          )}
          {item.status === "INCLUDED_IN_PO" && item.targetPoNumber && (
            <span className="text-[10px] text-blue-600">{"\u2192"} {item.targetPoNumber}</span>
          )}
          {item.status === "CANCELLED" && (
            <span className="text-[10px] text-muted-foreground/50">Cancelled</span>
          )}
        </div>
      </td>
    </tr>
  );
}
