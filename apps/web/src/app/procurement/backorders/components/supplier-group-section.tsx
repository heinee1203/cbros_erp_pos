"use client";

import { ChevronDown, ChevronRight, Loader2, ShoppingCart } from "lucide-react";

import type { BackorderItem, SupplierGroup } from "../types";
import { BackorderRow } from "./backorder-row";

interface SupplierGroupSectionProps {
  group: SupplierGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onCreatePO: () => void;
  isCreatingPO: boolean;
  onEdit: (item: BackorderItem) => void;
  onCancel: (item: BackorderItem) => void;
  onCreatePOSingle: (id: string, name: string) => void;
  onResourceItem: (item: BackorderItem) => void;
}

export function SupplierGroupSection({
  group,
  isExpanded,
  onToggle,
  onCreatePO,
  isCreatingPO,
  onEdit,
  onCancel,
  onCreatePOSingle,
  onResourceItem,
}: SupplierGroupSectionProps) {
  const pendingCount = group.items.filter((i) => i.status === "PENDING").length;
  const hasPending = pendingCount > 0;

  return (
    <div>
      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-left"
        >
          {isExpanded ? (
            <ChevronDown size={16} className="text-gray-500 shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-gray-500 shrink-0" />
          )}
          <div>
            <span className="font-semibold text-sm text-foreground">{group.supplierName}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {pendingCount} pending item{pendingCount !== 1 ? "s" : ""} &middot;{" "}
              {group.totalQty} total qty &middot; oldest {group.oldestDays}d ago
            </span>
          </div>
        </button>
        {hasPending && (
          <button
            onClick={onCreatePO}
            disabled={isCreatingPO}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isCreatingPO ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ShoppingCart size={12} />
            )}
            Create PO for {group.supplierName}
          </button>
        )}
      </div>

      {isExpanded && (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            <tr>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider">
                Product
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">
                Qty Needed
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider">
                Source PO
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">
                Days Pending
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider">
                Reason
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider">
                Priority
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider">
                Needed By
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {group.items.map((item) => (
              <BackorderRow
                key={item.id}
                item={item}
                hideSupplier
                onEdit={() => onEdit(item)}
                onCancel={() => onCancel(item)}
                onCreatePO={() => onCreatePOSingle(item.id, item.productName)}
                onResource={() => onResourceItem(item)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
