"use client";

import { useCallback, useState } from "react";

export function useInventorySelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  return {
    clearSelection,
    selectedCount: selectedIds.size,
    selectedIds,
    setSelectedIds,
  };
}

export type InventorySelectionController = ReturnType<typeof useInventorySelection>;
