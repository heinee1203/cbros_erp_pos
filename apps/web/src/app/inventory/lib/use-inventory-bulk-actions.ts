"use client";

import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { apiFetch } from "@/lib/api";
import { useDeleteProduct, type ProductRow } from "@/hooks/use-products";

interface UseInventoryBulkActionsOptions {
  token: string | null;
  apiLocationId: string | null;
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  products: ProductRow[];
}

export function useInventoryBulkActions({
  token,
  apiLocationId,
  selectedIds,
  setSelectedIds,
  products,
}: UseInventoryBulkActionsOptions) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const deleteMut = useDeleteProduct(token!, apiLocationId!);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [setSelectedIds]);

  const invalidateProducts = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["products"] });
  }, [queryClient]);

  const invalidateProductsAndClear = useCallback(() => {
    invalidateProducts();
    clearSelection();
  }, [clearSelection, invalidateProducts]);

  const handleBulkDelete = useCallback(async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    const parentIds = Array.from(selectedIds).filter((id) => {
      const product = products.find((item) => item.id === id);
      return product?.isParent;
    });

    const nonParentIds = Array.from(selectedIds).filter((id) => {
      const product = products.find((item) => item.id === id);
      if (product?.isParent) return false;
      if (product?.parentProductId && parentIds.includes(product.parentProductId)) return false;
      return true;
    });

    const message = parentIds.length > 0
      ? `Delete ${count} selected item${count > 1 ? "s" : ""}? This includes ${parentIds.length} parent item${parentIds.length > 1 ? "s" : ""} with all their variants. This cannot be undone.`
      : `Delete ${count} item${count > 1 ? "s" : ""}? Items with sales history will be deactivated instead.`;

    const ok = await confirm({
      title: "Delete Items",
      message,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    for (const id of parentIds) {
      await deleteMut.mutateAsync(id).catch(() => {});
    }
    for (const id of nonParentIds) {
      await deleteMut.mutateAsync(id).catch(() => {});
    }
    invalidateProductsAndClear();
  }, [selectedIds, products, confirm, deleteMut, invalidateProductsAndClear]);

  const handleBulkUpdate = useCallback(async (updates: Record<string, string | boolean>) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const fieldName = Object.keys(updates)[0]?.replace("Id", "") ?? "field";
    const confirmed = await confirm({
      title: "Apply Bulk Update?",
      message: `Update ${fieldName} for ${ids.length} item${ids.length !== 1 ? "s" : ""}?`,
      confirmLabel: "Update Items",
      variant: "warning",
    });
    if (!confirmed) return;

    try {
      await apiFetch("/products/bulk-update", {
        method: "PATCH",
        token: token ?? undefined,
        locationId: apiLocationId ?? undefined,
        body: JSON.stringify({ productIds: ids, updates }),
      });
      invalidateProductsAndClear();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk update failed");
    }
  }, [selectedIds, confirm, token, apiLocationId, invalidateProductsAndClear]);

  const handleDeleteSingle = useCallback(async (productId: string, productName: string, isParent?: boolean) => {
    const message = isParent
      ? `Delete "${productName}" and ALL its variants? This cannot be undone.`
      : `Delete "${productName}"? This cannot be undone.`;
    const ok = await confirm({
      title: isParent ? "Delete Parent + Variants" : "Delete Item",
      message,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deleteMut.mutateAsync(productId).catch(() => {});
  }, [confirm, deleteMut]);

  const handleSerialTrackingApply = useCallback(async (updates: Record<string, unknown>) => {
    await apiFetch("/products/bulk-update", {
      token: token ?? undefined,
      locationId: apiLocationId ?? undefined,
      method: "PATCH",
      body: JSON.stringify({
        productIds: Array.from(selectedIds),
        updates,
      }),
    });
    invalidateProductsAndClear();
  }, [selectedIds, token, apiLocationId, invalidateProductsAndClear]);

  return {
    clearSelection,
    deletePending: deleteMut.isPending,
    handleBulkDelete,
    handleBulkUpdate,
    handleDeleteSingle,
    handleSerialTrackingApply,
    invalidateProducts,
    invalidateProductsAndClear,
  };
}

export type InventoryBulkActionsController = ReturnType<typeof useInventoryBulkActions>;
