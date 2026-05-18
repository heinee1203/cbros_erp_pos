"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ModalShell } from "@/app/inventory/components/modal-shell";

export interface PendingOrdersData {
  draftPOs: { poId: string; poNumber: string; supplierId: string; supplierName: string; quantity: number; status: string }[];
  submittedPOs: { poId: string; poNumber: string; supplierId: string; supplierName: string; quantityOrdered: number; quantityReceived: number; quantityRemaining: number; status: string }[];
  backorders: { backorderId: string; sourcePoNumber: string; supplierId: string; supplierName: string; quantityOutstanding: number; status: string; waitUntil: string | null }[];
  lastSupplier: { supplierId: string; supplierName: string; lastCost: string; lastPoNumber: string; lastPoDate: string } | null;
  suggestedQty: number;
}

export interface ReorderTarget {
  productId: string;
  productName: string;
}

interface UseProductReorderOptions {
  token: string | null;
  locationId: string | null;
  invalidateKeys?: QueryKey[];
}

export function useProductReorder({ token, locationId, invalidateKeys = [] }: UseProductReorderOptions) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [modal, setModal] = useState<{ item: ReorderTarget; data: PendingOrdersData } | null>(null);
  const [loadingProductId, setLoadingProductId] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const showSuccess = useCallback((message: string) => {
    setSuccessMessage(message);
    setTimeout(() => setSuccessMessage(null), 4000);
  }, []);

  const invalidate = useCallback(() => {
    for (const queryKey of invalidateKeys) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [invalidateKeys, queryClient]);

  const createDraftPO = useCallback(async (
    item: ReorderTarget,
    lastSupplier: PendingOrdersData["lastSupplier"],
    suggestedQty: number,
  ) => {
    if (!token || !locationId) return;
    if (!lastSupplier) {
      router.push(`/procurement/purchase-orders/new?productId=${item.productId}&qty=${suggestedQty}`);
      return;
    }

    const drafts = await apiFetch<{ data: { id: string; poNo: string }[] }>(
      `/procurement/purchase-orders?status=DRAFT&supplierId=${lastSupplier.supplierId}&limit=1`,
      { token, locationId },
    );

    if (drafts.data && drafts.data.length > 0) {
      const draft = drafts.data[0];
      await apiFetch(`/procurement/purchase-orders/${draft.id}/lines`, {
        token,
        locationId,
        method: "POST",
        body: JSON.stringify({ productId: item.productId, orderedQty: suggestedQty, unitCost: lastSupplier.lastCost }),
      });
      setModal(null);
      showSuccess(`Added ${suggestedQty} units to ${draft.poNo}`);
      router.push(`/procurement/purchase-orders/${draft.poNo}`);
    } else {
      setModal(null);
      const params = new URLSearchParams({
        productId: item.productId,
        qty: String(suggestedQty),
        supplierId: lastSupplier.supplierId,
        unitCost: lastSupplier.lastCost,
      });
      router.push(`/procurement/purchase-orders/new?${params.toString()}`);
    }
  }, [token, locationId, router, showSuccess]);

  const reorder = useCallback(async (item: ReorderTarget) => {
    if (!token || !locationId) return;
    setLoadingProductId(item.productId);
    try {
      const pendingData = await apiFetch<PendingOrdersData>(`/products/${item.productId}/pending-orders`, { token, locationId });
      const hasExisting = pendingData.draftPOs.length > 0 || pendingData.submittedPOs.length > 0 || pendingData.backorders.length > 0;
      if (hasExisting) {
        setModal({ item, data: pendingData });
      } else {
        await createDraftPO(item, pendingData.lastSupplier, pendingData.suggestedQty);
      }
    } catch {
      // User can retry from the row action.
    } finally {
      setLoadingProductId(null);
    }
  }, [token, locationId, createDraftPO]);

  const snooze = useCallback(async (productId: string, days: number) => {
    if (!token || !locationId) return;
    await apiFetch(`/products/${productId}/snooze-reorder`, {
      token,
      locationId,
      method: "POST",
      body: JSON.stringify({ days }),
    });
    setModal(null);
    showSuccess(`Snoozed for ${days} days`);
    invalidate();
  }, [token, locationId, invalidate, showSuccess]);

  const viewExistingDraft = useCallback((poNumber: string) => {
    setModal(null);
    router.push(`/procurement/purchase-orders/${poNumber}`);
  }, [router]);

  return {
    modal,
    loadingProductId,
    successMessage,
    reorder,
    snooze,
    dismissModal: () => setModal(null),
    createDraftPO,
    viewExistingDraft,
  };
}

export function ReorderSuccessToast({ message, showIcon = true }: { message: string | null; showIcon?: boolean }) {
  if (!message) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-[13px] font-medium text-emerald-800 shadow-lg animate-in slide-in-from-bottom-2">
      {showIcon && <CheckCircle2 size={15} />}
      {message}
    </div>
  );
}

export function ProductReorderModal({
  item,
  data,
  onDismiss,
  onAddToExisting,
  onCreateNew,
  onSnooze,
}: {
  item: ReorderTarget;
  data: PendingOrdersData;
  onDismiss: () => void;
  onAddToExisting: (po: PendingOrdersData["draftPOs"][0]) => void;
  onCreateNew: () => void | Promise<void>;
  onSnooze: (days: number) => void | Promise<void>;
}) {
  const [showSnooze, setShowSnooze] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleAction = async (fn: () => Promise<void> | void) => {
    setActionLoading(true);
    try {
      await fn();
    } catch {
      // Parent owns the retry path.
    }
    setActionLoading(false);
  };

  return (
    <ModalShell title={`Reorder: ${item.productName}`} onClose={onDismiss} wide>
      <div className="mb-4 space-y-2">
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-amber-600">
          <AlertTriangle size={13} />
          This item has pending orders:
        </p>

        {data.draftPOs.map((po) => (
          <div key={po.poId} className="flex justify-between rounded bg-muted/50 p-2 text-[12px]">
            <span>{po.poNumber} <span className="text-muted-foreground">(Draft)</span> &mdash; {po.quantity} units</span>
            <span className="text-muted-foreground">{po.supplierName}</span>
          </div>
        ))}

        {data.submittedPOs.map((po) => (
          <div key={po.poId} className="flex justify-between rounded bg-blue-50 p-2 text-[12px]">
            <span>{po.poNumber} <span className="text-muted-foreground">({po.status})</span> &mdash; {po.quantityRemaining} remaining</span>
            <span className="text-muted-foreground">{po.supplierName}</span>
          </div>
        ))}

        {data.backorders.map((bo) => (
          <div key={bo.backorderId} className="flex justify-between rounded bg-orange-50 p-2 text-[12px]">
            <span>Backorder{bo.sourcePoNumber ? ` from ${bo.sourcePoNumber}` : ""} &mdash; {bo.quantityOutstanding} pending</span>
            <span className="text-muted-foreground">{bo.supplierName}</span>
          </div>
        ))}
      </div>

      <div className="mb-5 text-[12px] text-muted-foreground">
        Suggested reorder qty: <strong className="text-foreground">{data.suggestedQty}</strong>
        <span className="ml-1">(reorder point - current stock)</span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={onDismiss}
          className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-muted"
        >
          Dismiss
        </button>

        <div className="relative">
          <button
            onClick={() => setShowSnooze(!showSnooze)}
            className="flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-muted"
          >
            Snooze <ChevronDown size={12} />
          </button>
          {showSnooze && (
            <div className="absolute bottom-full right-0 z-10 mb-1 min-w-[100px] rounded-md border border-border bg-background shadow-lg">
              {[7, 14, 30, 90].map((days) => (
                <button
                  key={days}
                  onClick={() => { setShowSnooze(false); void onSnooze(days); }}
                  className="block w-full px-3 py-1.5 text-left text-[12px] transition-colors first:rounded-t-md last:rounded-b-md hover:bg-muted"
                >
                  {days} days
                </button>
              ))}
            </div>
          )}
        </div>

        {data.draftPOs.length > 0 && (
          <button
            onClick={() => onAddToExisting(data.draftPOs[0])}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-blue-700"
          >
            View {data.draftPOs[0].poNumber}
          </button>
        )}

        <button
          onClick={() => handleAction(onCreateNew)}
          disabled={actionLoading}
          className="rounded-md bg-emerald-600 px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          Create New PO
        </button>
      </div>
    </ModalShell>
  );
}
