"use client";

import { useEffect, useState } from "react";
import type { QuickAddEntityType } from "../components/quick-add-entity-modal";

interface UseInventoryModalStateOptions {
  selectedCount: number;
  onClearSelection: () => void;
}

export function useInventoryModalState({
  selectedCount,
  onClearSelection,
}: UseInventoryModalStateOptions) {
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showFindReplace, setShowFindReplace] = useState(false);
  const [showSerialModal, setShowSerialModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showAvailModal, setShowAvailModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [addModal, setAddModal] = useState<QuickAddEntityType | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (showTransferModal) setShowTransferModal(false);
      else if (showAdjustModal) setShowAdjustModal(false);
      else if (selectedProductId) setSelectedProductId(null);
      else if (selectedCount > 0) onClearSelection();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedProductId, showTransferModal, showAdjustModal, selectedCount, onClearSelection]);

  return {
    addModal,
    selectedProductId,
    setAddModal,
    setSelectedProductId,
    setShowAdjustModal,
    setShowAvailModal,
    setShowFindReplace,
    setShowImportModal,
    setShowQuickAdd,
    setShowSerialModal,
    setShowTransferModal,
    showAdjustModal,
    showAvailModal,
    showFindReplace,
    showImportModal,
    showQuickAdd,
    showSerialModal,
    showTransferModal,
  };
}

export type InventoryModalStateController = ReturnType<typeof useInventoryModalState>;
