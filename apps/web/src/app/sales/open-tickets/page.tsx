"use client";

import { useMemo } from "react";
import { Bookmark, Play, XCircle, Hash, ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmtPeso } from "@/lib/format";
import { useAuth } from "@/app/auth-context";
import { useConfirm } from "@/components/confirm-dialog";
import { useSalesListQuery, type SaleListItem } from "@/hooks/use-sales-query";
import { useResumeSaleMutation, useVoidSaleMutation } from "@/hooks/use-sale-mutations";

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-blue-500/10 text-blue-600",
  PARKED: "bg-amber-500/10 text-amber-600",
};

// Uses shared fmtPeso from @/lib/format

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function OpenTicketsPage() {
  const { token, locationId } = useAuth();
  const confirm = useConfirm();
  const salesQuery = useSalesListQuery(token, locationId, {
    status: "OPEN,PARKED",
    limit: 100,
  });

  const resumeSale = useResumeSaleMutation(token, locationId);
  const voidSale = useVoidSaleMutation(token, locationId);

  const sales = salesQuery.data?.data ?? [];

  const stats = useMemo(() => {
    let open = 0;
    let parked = 0;
    for (const s of sales) {
      if (s.status === "OPEN") open++;
      else if (s.status === "PARKED") parked++;
    }
    return { open, parked };
  }, [sales]);

  function handleResume(sale: SaleListItem) {
    resumeSale.submit(sale.id, {});
    // Query invalidation handled by the mutation hook
  }

  async function handleVoid(sale: SaleListItem) {
    const ok = await confirm({
      title: "Void Sale",
      message: `Void sale ${sale.saleNo}? This cannot be undone.`,
      confirmLabel: "Void",
      variant: "danger",
    });
    if (!ok) return;
    voidSale.submit(sale.id, {});
  }

  if (salesQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full max-w-5xl flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
              <Bookmark size={16} className="text-primary" />
            </div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Open Tickets</h1>
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Manage parked carts and in-progress sales.</p>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]">
            <Bookmark size={16} className="text-primary" />
          </div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Open Tickets</h1>
        </div>
        <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Manage parked carts and in-progress sales.</p>
        <div className="mt-4 flex gap-5">
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-500/10"><ShoppingCart size={11} className="text-blue-600" /></div>
            <span className="text-muted-foreground">Open</span>
            <span className="font-semibold tabular-nums text-foreground">{stats.open}</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/10"><Bookmark size={11} className="text-amber-600" /></div>
            <span className="text-muted-foreground">Parked</span>
            <span className="font-semibold tabular-nums text-foreground">{stats.parked}</span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="w-28 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Sale No.</div>
          <div className="w-20 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Status</div>
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Customer</div>
          <div className="w-16 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Items</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Total</div>
          <div className="w-20 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Created</div>
          <div className="w-36 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Actions</div>
        </div>

        {sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Bookmark size={16} className="text-muted-foreground" />
            </div>
            <p className="mt-3 text-[13px] font-medium text-foreground">No open tickets</p>
            <p className="mt-1 text-[12px] text-muted-foreground">All sales have been completed or voided</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sales.map((s) => (
              <div key={s.id} className="flex items-center px-4 py-3">
                <div className="w-28">
                  <span className="font-mono text-[13px] font-semibold text-foreground">{s.saleNo}</span>
                </div>
                <div className="w-20">
                  <span className={cn("inline-flex rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase", STATUS_STYLES[s.status] ?? "bg-muted text-muted-foreground")}>
                    {s.status}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-[13px] text-foreground truncate block">{s.customerName ?? "Walk-in"}</span>
                  <span className="text-[11px] text-muted-foreground">{s.employeeName}</span>
                </div>
                <div className="w-16 text-center">
                  <span className="text-[12px] tabular-nums text-muted-foreground">{s.lineCount}</span>
                </div>
                <div className="w-28 text-right">
                  <span className="text-[13px] font-semibold tabular-nums text-foreground">{fmtPeso(s.grandTotal)}</span>
                </div>
                <div className="w-20 text-right">
                  <span className="text-[11px] text-muted-foreground">{timeAgo(s.createdAt)}</span>
                </div>
                <div className="w-36 flex items-center justify-end gap-1.5">
                  {s.status === "PARKED" && (
                    <button
                      onClick={() => handleResume(s)}
                      disabled={resumeSale.isSubmitting || voidSale.isSubmitting}
                      className="flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
                    >
                      <Play size={11} />Resume
                    </button>
                  )}
                  <button
                    onClick={() => handleVoid(s)}
                    disabled={resumeSale.isSubmitting || voidSale.isSubmitting}
                    className="flex items-center gap-1 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                  >
                    <XCircle size={11} />Void
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">{sales.length} open ticket{sales.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
