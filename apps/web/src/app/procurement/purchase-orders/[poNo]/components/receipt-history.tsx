import { useEffect, useMemo, useState } from "react";

import type { PODetail } from "@/hooks/use-po-query";
import { SectionHeader } from "./shared";

type ReceiptHistoryProps = {
  po: PODetail;
  receipts?: any[];
  onPrintReceipt: (receipt: any, po: PODetail) => void;
};

export function ReceiptHistory({ po, receipts = [], onPrintReceipt }: ReceiptHistoryProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (receipts.length > 0 && expandedIds.size === 0) {
      setExpandedIds(new Set([receipts[0].id]));
    }
  }, [receipts, expandedIds.size]);

  const toggleReceipt = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (receipts.length === 0 && po.receiptEvents.length > 0) {
    return <LegacyReceiptHistory po={po} />;
  }
  if (receipts.length === 0) return null;

  return (
    <section>
      <SectionHeader>
        Receipt History ({receipts.length} receipt{receipts.length !== 1 ? "s" : ""})
      </SectionHeader>
      <div className="space-y-3">
        {receipts.map((receipt) => {
          const isExpanded = expandedIds.has(receipt.id);
          return (
            <div key={receipt.id} className="overflow-hidden rounded-lg border border-border">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleReceipt(receipt.id)}
                className="flex w-full cursor-pointer items-center justify-between bg-muted/40 px-4 py-1.5 text-left transition-colors hover:bg-muted/60"
              >
                <div>
                  <span className="text-sm font-bold text-foreground">{receipt.supplierDrNo}</span>
                  <span className="ml-3 text-xs text-muted-foreground">
                    Received by {receipt.receivedBy} &middot; {receipt.lineCount} line{receipt.lineCount !== 1 ? "s" : ""} &middot; {receipt.totalAcceptedQty} units accepted
                    {receipt.totalRejectedQty > 0 && ` \u00b7 ${receipt.totalRejectedQty} rejected`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPrintReceipt(receipt, po);
                    }}
                    className="rounded border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    Print Slip
                  </button>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {new Date(receipt.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <svg
                    className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30">
                        <th scope="col" className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                        <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Accepted</th>
                        <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Rejected</th>
                        <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Unit Cost</th>
                        <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipt.lines.map((line: any, index: number) => (
                        <tr key={index} className={`border-b border-border last:border-0 ${index % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                          <td className="px-4 py-1.5">
                            <div className="text-xs font-medium">
                              {(line as any).parentName ? `${(line as any).parentName} (${line.productName})` : line.productName}
                            </div>
                            <div className="mt-px flex items-center gap-1.5">
                              <span className="font-mono text-[10px] text-muted-foreground">{line.sku}</span>
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium text-success">
                            {line.acceptedQty > 0 ? `+${line.acceptedQty}` : "\u2014"}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium text-destructive">
                            {line.rejectedQty > 0 ? `-${line.rejectedQty}` : "\u2014"}
                          </td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{line.unitCost}</td>
                          <td className="max-w-[200px] truncate px-3 py-1.5 text-muted-foreground">{line.notes ?? "\u2014"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {receipt.notes && (
                    <div className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
                      <strong>Notes:</strong> {receipt.notes}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LegacyReceiptHistory({ po }: { po: PODetail }) {
  const productNames = useMemo(() => {
    const map = new Map<string, { name: string }>();
    for (const line of po.lines) {
      map.set(line.id, { name: line.productName });
    }
    return map;
  }, [po.lines]);

  return (
    <section>
      <SectionHeader>Receipt History</SectionHeader>
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date
              </th>
              <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Item
              </th>
              <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Accepted
              </th>
              <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Rejected
              </th>
              <th scope="col" className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Cost
              </th>
              <th scope="col" className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {po.receiptEvents.map((event, index) => {
              const product = productNames.get(event.poLineId);
              return (
                <tr
                  key={event.id}
                  className={`border-b border-border ${index % 2 === 0 ? "bg-background" : "bg-muted/20"}`}
                >
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">
                    {new Date(event.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="px-3 py-1.5">{product?.name}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium text-success">
                    {event.receivedAcceptedQty > 0 ? `+${event.receivedAcceptedQty}` : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium text-destructive">
                    {event.rejectedQty > 0 ? `-${event.rejectedQty}` : "\u2014"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {event.unitCost}
                  </td>
                  <td className="max-w-[200px] truncate px-3 py-1.5 text-muted-foreground">
                    {event.notes ?? "\u2014"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
