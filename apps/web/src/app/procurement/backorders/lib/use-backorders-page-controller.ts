"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/app/auth-context";

import type {
  BackorderItem,
  BackorderSummary,
  SupplierGroup,
} from "../types";
import {
  cancelBackorder,
  createBackorder,
  createPurchaseOrderFromBackorders,
  createSingleBackorderPo,
  fetchBackorderSummary,
  fetchBackorders,
  fetchBackordersBySupplier,
  getBackordersErrorMessage,
  includeBackordersInPurchaseOrder,
  resourceBackorder,
  updateBackorder,
} from "./backorders-api";
import {
  countGroupedPending,
  filterBackorderItems,
  filterSupplierGroups,
} from "./backorders-filtering";
import { useBackorderProductSearch } from "./use-backorder-product-search";
import { useBackorderSuppliers } from "./use-backorder-suppliers";

export function useBackordersPageController() {
  const { token, locationId, loading: authLoading } = useAuth();

  const [summary, setSummary] = useState<BackorderSummary | null>(null);
  const [supplierGroups, setSupplierGroups] = useState<SupplierGroup[]>([]);
  const [flatItems, setFlatItems] = useState<BackorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<string>("PENDING");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [creatingPO, setCreatingPO] = useState<string | null>(null);

  const [cancelModal, setCancelModal] = useState<BackorderItem | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelLoading, setCancelLoading] = useState(false);

  const [editModal, setEditModal] = useState<BackorderItem | null>(null);
  const [editPriority, setEditPriority] = useState<string>("NORMAL");
  const [editNeededBy, setEditNeededBy] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const [resourceModal, setResourceModal] = useState<BackorderItem | null>(null);
  const [resourceSupplierId, setResourceSupplierId] = useState("");
  const [resourceLoading, setResourceLoading] = useState(false);

  const [newModal, setNewModal] = useState(false);
  const [newSupplierId, setNewSupplierId] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [newReason, setNewReason] = useState("");
  const [newPriority, setNewPriority] = useState<string>("NORMAL");
  const [newNeededBy, setNewNeededBy] = useState("");
  const [newLoading, setNewLoading] = useState(false);
  const {
    newProductResults,
    newProductSearch,
    newSelectedProduct,
    productSearchLoading,
    resetProductSearch,
    setNewProductResults,
    setNewProductSearch,
    setNewSelectedProduct,
  } = useBackorderProductSearch({ locationId, token });
  const suppliers = useBackorderSuppliers({
    enabled: newModal || !!resourceModal,
    locationId,
    token,
  });

  const isGroupedView = activeTab === "PENDING";

  const showSuccess = useCallback((message: string) => {
    setSuccessMsg(message);
    setTimeout(() => setSuccessMsg(null), 5000);
  }, []);

  const fetchSummary = useCallback(async () => {
    if (!token || !locationId) return;
    try {
      const data = await fetchBackorderSummary(token, locationId);
      setSummary(data);
    } catch {
      // Summary fetch is non-critical.
    }
  }, [token, locationId]);

  const fetchBySupplier = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const groups = await fetchBackordersBySupplier(token, locationId);
      setSupplierGroups(groups);
      setExpandedSuppliers(new Set(groups.map((g: SupplierGroup) => g.supplierId)));
    } catch (err) {
      setError(getBackordersErrorMessage(err, "Failed to load backorders"));
    } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  const fetchFlat = useCallback(
    async (status: string) => {
      if (!token || !locationId) return;
      setLoading(true);
      setError(null);
      try {
        const data = await fetchBackorders(token, locationId, status);
        setFlatItems(data);
      } catch (err) {
        setError(getBackordersErrorMessage(err, "Failed to load backorders"));
      } finally {
        setLoading(false);
      }
    },
    [token, locationId],
  );

  useEffect(() => {
    if (!token || !locationId) return;
    fetchSummary();
    if (isGroupedView) {
      fetchBySupplier();
    } else {
      fetchFlat(activeTab);
    }
  }, [token, locationId, activeTab, isGroupedView, fetchSummary, fetchBySupplier, fetchFlat]);

  const reload = useCallback(() => {
    fetchSummary();
    if (isGroupedView) {
      fetchBySupplier();
    } else {
      fetchFlat(activeTab);
    }
  }, [fetchSummary, isGroupedView, fetchBySupplier, fetchFlat, activeTab]);

  const filteredSupplierGroups = useMemo(() => {
    return filterSupplierGroups(supplierGroups, searchQuery);
  }, [supplierGroups, searchQuery]);

  const filteredFlatItems = useMemo(() => {
    return filterBackorderItems(flatItems, searchQuery);
  }, [flatItems, searchQuery]);

  const totalGroupedPending = useMemo(
    () => countGroupedPending(filteredSupplierGroups),
    [filteredSupplierGroups],
  );

  const toggleSupplierExpand = useCallback((supplierId: string) => {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(supplierId)) {
        next.delete(supplierId);
      } else {
        next.add(supplierId);
      }
      return next;
    });
  }, []);

  const openCancelModal = useCallback((item: BackorderItem) => {
    setCancelModal(item);
    setCancelReason("");
  }, []);

  const openResourceModal = useCallback((item: BackorderItem) => {
    setResourceModal(item);
    setResourceSupplierId("");
  }, []);

  const openEditModal = useCallback((item: BackorderItem) => {
    setEditModal(item);
    setEditPriority(item.priority);
    setEditNeededBy(item.neededBy ? item.neededBy.substring(0, 10) : "");
    setEditNotes(item.notes ?? "");
  }, []);

  const resetNewModal = useCallback(() => {
    setNewModal(false);
    resetProductSearch();
    setNewSupplierId("");
    setNewQty(1);
    setNewReason("");
    setNewPriority("NORMAL");
    setNewNeededBy("");
  }, [resetProductSearch]);

  const handleCreatePO = useCallback(
    async (supplierId: string, supplierName: string) => {
      if (!token || !locationId) return;
      setCreatingPO(supplierId);
      try {
        const group = supplierGroups.find((g) => g.supplierId === supplierId);
        if (!group) return;

        const pendingIds = group.items
          .filter((item) => item.status === "PENDING")
          .map((item) => item.id);

        if (pendingIds.length === 0) return;

        const pendingItems = group.items.filter((item) => item.status === "PENDING");

        const poResult = await createPurchaseOrderFromBackorders({
          locationId,
          pendingItems,
          supplierId,
          token,
        });

        const poId = poResult.id ?? poResult.data?.id;
        const poNum = poResult.poNo ?? poResult.data?.poNo ?? "Draft";

        await includeBackordersInPurchaseOrder({
          backorderIds: pendingIds,
          locationId,
          targetPoId: poId,
          targetPoNumber: poNum,
          token,
        });

        showSuccess(`Created PO ${poNum} for ${supplierName} with ${pendingIds.length} item(s)`);
        reload();
      } catch (err) {
        setError(getBackordersErrorMessage(err, "Failed to create PO"));
      } finally {
        setCreatingPO(null);
      }
    },
    [token, locationId, supplierGroups, showSuccess, reload],
  );

  const handleCancel = useCallback(async () => {
    if (!cancelModal || !token || !locationId) return;
    setCancelLoading(true);
    try {
      await cancelBackorder({
        backorderId: cancelModal.id,
        locationId,
        reason: cancelReason,
        token,
      });
      showSuccess(`Cancelled backorder for ${cancelModal.productName}`);
      setCancelModal(null);
      setCancelReason("");
      reload();
    } catch (err) {
      setError(getBackordersErrorMessage(err, "Failed to cancel backorder"));
    } finally {
      setCancelLoading(false);
    }
  }, [cancelModal, cancelReason, token, locationId, showSuccess, reload]);

  const handleCreatePOSingle = useCallback(
    async (backorderId: string, productName: string) => {
      if (!token || !locationId) return;
      try {
        const result = await createSingleBackorderPo({
          backorderId,
          locationId,
          token,
        });
        showSuccess(`Draft PO ${result.newPoNo} created for ${productName}`);
        reload();
      } catch (err) {
        setError(getBackordersErrorMessage(err, "Failed to create PO"));
      }
    },
    [token, locationId, showSuccess, reload],
  );

  const handleResource = useCallback(async () => {
    if (!resourceModal || !resourceSupplierId || !token || !locationId) return;
    setResourceLoading(true);
    try {
      const result = await resourceBackorder({
        backorderId: resourceModal.id,
        locationId,
        newSupplierId: resourceSupplierId,
        token,
      });
      showSuccess(`Re-sourced to ${result.newSupplierName ?? "new supplier"}. Draft PO ${result.newPoNo} created.`);
      setResourceModal(null);
      setResourceSupplierId("");
      reload();
    } catch (err) {
      setError(getBackordersErrorMessage(err, "Failed to re-source"));
    } finally {
      setResourceLoading(false);
    }
  }, [resourceModal, resourceSupplierId, token, locationId, showSuccess, reload]);

  const handleEdit = useCallback(async () => {
    if (!editModal || !token || !locationId) return;
    setEditLoading(true);
    try {
      await updateBackorder({
        backorderId: editModal.id,
        locationId,
        neededBy: editNeededBy || null,
        notes: editNotes || null,
        priority: editPriority,
        token,
      });
      showSuccess(`Updated backorder for ${editModal.productName}`);
      setEditModal(null);
      reload();
    } catch (err) {
      setError(getBackordersErrorMessage(err, "Failed to update backorder"));
    } finally {
      setEditLoading(false);
    }
  }, [editModal, editPriority, editNeededBy, editNotes, token, locationId, showSuccess, reload]);

  const handleCreateNew = useCallback(async () => {
    if (!newSelectedProduct || !newSupplierId || !token || !locationId) return;
    setNewLoading(true);
    try {
      await createBackorder({
        locationId,
        neededBy: newNeededBy || null,
        priority: newPriority,
        productId: newSelectedProduct.id,
        qtyNeeded: newQty,
        reason: newReason,
        supplierId: newSupplierId,
        token,
      });
      showSuccess(`Created backorder for ${newSelectedProduct.name}`);
      resetNewModal();
      reload();
    } catch (err) {
      setError(getBackordersErrorMessage(err, "Failed to create backorder"));
    } finally {
      setNewLoading(false);
    }
  }, [
    newSelectedProduct,
    newSupplierId,
    newQty,
    newReason,
    newPriority,
    newNeededBy,
    token,
    locationId,
    showSuccess,
    resetNewModal,
    reload,
  ]);

  return {
    activeTab,
    authLoading,
    cancelLoading,
    cancelModal,
    cancelReason,
    creatingPO,
    editLoading,
    editModal,
    editNeededBy,
    editNotes,
    editPriority,
    error,
    expandedSuppliers,
    filteredFlatItems,
    filteredSupplierGroups,
    handleCancel,
    handleCreateNew,
    handleCreatePO,
    handleCreatePOSingle,
    handleEdit,
    handleResource,
    isGroupedView,
    loading,
    newLoading,
    newModal,
    newNeededBy,
    newPriority,
    newProductResults,
    newProductSearch,
    newQty,
    newReason,
    newSelectedProduct,
    newSupplierId,
    openCancelModal,
    openEditModal,
    openResourceModal,
    productSearchLoading,
    reload,
    resetNewModal,
    resourceLoading,
    resourceModal,
    resourceSupplierId,
    searchQuery,
    setActiveTab,
    setCancelModal,
    setCancelReason,
    setEditModal,
    setEditNeededBy,
    setEditNotes,
    setEditPriority,
    setError,
    setNewModal,
    setNewNeededBy,
    setNewPriority,
    setNewProductResults,
    setNewProductSearch,
    setNewQty,
    setNewReason,
    setNewSelectedProduct,
    setNewSupplierId,
    setResourceModal,
    setResourceSupplierId,
    setSearchQuery,
    setSuccessMsg,
    successMsg,
    summary,
    suppliers,
    toggleSupplierExpand,
    totalGroupedPending,
  };
}

export type BackordersPageController = ReturnType<typeof useBackordersPageController>;
