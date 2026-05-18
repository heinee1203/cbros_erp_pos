"use client";

import type { CSVPreviewRow } from "../types";
import { formatNumber } from "../utils";

interface CSVPreviewModalProps {
  rows: CSVPreviewRow[];
  onClose: () => void;
  onImport: () => void;
}

export function CSVPreviewModal({ rows, onClose, onImport }: CSVPreviewModalProps) {
  const matched = rows.filter((r) => r.status === "matched");
  const notFound = rows.filter((r) => r.status === "not_found");
  const searching = rows.some((r) => r.status === "searching");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-3xl rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-base font-semibold">CSV Import Preview</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th scope="col" className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  SKU
                </th>
                <th scope="col" className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Match
                </th>
                <th scope="col" className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Qty
                </th>
                <th scope="col" className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  List Price
                </th>
                <th scope="col" className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Discount
                </th>
                <th scope="col" className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border last:border-b-0"
                >
                  <td className="px-2 py-1.5 font-mono text-xs">
                    {row.sku}
                  </td>
                  <td className="px-2 py-1.5 text-xs">
                    {row.match ? (
                      <span className="text-foreground">
                        {row.match.name}
                      </span>
                    ) : row.status === "searching" ? (
                      <span className="text-muted-foreground">
                        Searching...
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">
                        Not found
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
                    {row.qty}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
                    {row.listPrice && parseFloat(row.listPrice) > 0
                      ? formatNumber(parseFloat(row.listPrice))
                      : "--"}
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">
                    {row.discount || "--"}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {row.status === "matched" ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/10 text-success">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </span>
                    ) : row.status === "searching" ? (
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                    ) : (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-warning/10 text-warning">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-3">
          <span className="text-xs text-muted-foreground">
            {matched.length} matched, {notFound.length} not found
            {searching && " (still searching...)"}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={onImport}
              disabled={matched.length === 0 || searching}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              Import {matched.length} Matched Item
              {matched.length !== 1 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
