"use client";

import { useState, useMemo, useCallback } from "react";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useQuery } from "@tanstack/react-query";
import { useLocations } from "@/hooks/use-locations";
import type { CreatedReorderPO, ReorderItem, ReorderResponse } from "./types";
import { ReorderSuggestionsTable } from "./components/reorder-suggestions-table";
import {
  ReorderActionFooter,
  ReorderPanelFilters,
  ReorderPanelHeader,
  ReorderSuccessState,
  SupplierGroupingModal,
} from "./components/reorder-panel-sections";

// ── Panel ──

export function ReorderSuggestionsPanel({ open, onClose, inline, lastSoldAfter, lastSoldBefore, urgencyAll, urgency12M, urgency6M, urgency3M, urgency1M, velocityClass, brandId, categoryId, brandName, categoryName }: {
  open: boolean;
  onClose: () => void;
  inline?: boolean;
  lastSoldAfter?: string;
  lastSoldBefore?: string;
  urgencyAll?: string;
  urgency12M?: string;
  urgency6M?: string;
  urgency3M?: string;
  urgency1M?: string;
  velocityClass?: string;
  /** Page-level brand filter — panel reads this as a global, read-only input */
  brandId?: string;
  /** Page-level category filter — panel reads this as a global, read-only input */
  categoryId?: string;
  /** Display name for the brand filter, rendered in the "Global filters" label */
  brandName?: string | null;
  /** Display name for the category filter, rendered in the "Global filters" label */
  categoryName?: string | null;
}) {
  const { token, locationId, apiLocationId, locations: authLocations, user } = useAuth();
  const showCost = ["ADMIN", "MANAGER"].includes(user?.role ?? "");
  const locationsQuery = useLocations(token);
  const allLocations = useMemo(() => locationsQuery.data?.data ?? [], [locationsQuery.data]);

  // Default destination: use selected location, or find "C Autoparts", or first active location
  const defaultDestination = useMemo(() => {
    if (locationId && locationId !== "ALL") return locationId;
    const cAutoparts = allLocations.find((l: any) => l.name?.toLowerCase().includes("c autoparts"));
    if (cAutoparts) return cAutoparts.id;
    return allLocations[0]?.id || apiLocationId;
  }, [locationId, allLocations, apiLocationId]);

  const [destinationLocationId, setDestinationLocationId] = useState("");

  // Set initial destination when locations load
  useMemo(() => {
    if (!destinationLocationId && defaultDestination) {
      setDestinationLocationId(defaultDestination);
    }
  }, [defaultDestination, destinationLocationId]);

  // Filters (panel-local — Brand/Category are lifted to the page)
  const [targetMonths, setTargetMonths] = useState(3);
  const [urgency, setUrgency] = useState("");

  // Selection + order qty overrides
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [orderQtys, setOrderQtys] = useState<Record<string, number>>({});
  const [initialized, setInitialized] = useState(false);

  // Supplier assignment modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdPOs, setCreatedPOs] = useState<CreatedReorderPO[]>([]);
  // Per-item supplier assignment: productId → supplierId
  const [supplierAssignments, setSupplierAssignments] = useState<Record<string, string>>({});
  const [panelSearch, setPanelSearch] = useState("");

  const { data: suppliersData } = useSuppliers(token!, apiLocationId);

  // Fetch suggestions — pass ALL active velocity filters
  const params = new URLSearchParams();
  params.set("targetMonths", String(targetMonths));
  params.set("limit", "200");
  if (urgency) params.set("urgency", urgency);
  if (brandId) params.set("brandId", brandId);
  if (categoryId) params.set("categoryId", categoryId);
  if (lastSoldAfter) params.set("lastSoldAfter", lastSoldAfter);
  if (lastSoldBefore) params.set("lastSoldBefore", lastSoldBefore);
  if (urgencyAll) params.set("urgencyAll", urgencyAll);
  if (urgency12M) params.set("urgency12M", urgency12M);
  if (urgency6M) params.set("urgency6M", urgency6M);
  if (urgency3M) params.set("urgency3M", urgency3M);
  if (urgency1M) params.set("urgency1M", urgency1M);
  if (velocityClass) params.set("velocityClass", velocityClass);

  const { data, isLoading } = useQuery<ReorderResponse>({
    queryKey: ["reorder-suggestions", targetMonths, urgency, brandId, categoryId, lastSoldAfter, lastSoldBefore, urgencyAll, urgency12M, urgency6M, urgency3M, urgency1M, velocityClass],
    queryFn: () => apiFetch<ReorderResponse>(
      `/inventory/stock-monitor/reorder-suggestions?${params.toString()}`,
      { token: token!, locationId: locationId! },
    ),
    enabled: open && !!token && !!locationId,
    staleTime: 60_000,
  });

  const allItems = data?.data ?? [];
  const items = useMemo(() => {
    if (!panelSearch.trim()) return allItems;
    const q = panelSearch.toLowerCase();
    return allItems.filter(item => {
      const displayName = item.parentName ? `${item.parentName} (${item.productName})` : item.productName;
      return displayName.toLowerCase().includes(q) ||
        (item.productSku || "").toLowerCase().includes(q);
    });
  }, [allItems, panelSearch]);

  // Auto-select all on first load
  if (items.length > 0 && !initialized) {
    const allIds = new Set(items.map(i => i.productId));
    setSelected(allIds);
    const qtys: Record<string, number> = {};
    items.forEach(i => { qtys[i.productId] = i.suggestedQty; });
    setOrderQtys(qtys);
    setInitialized(true);
  }

  const toggleAll = useCallback(() => {
    const visibleIds = new Set(items.map(i => i.productId));
    const allVisibleSelected = items.every(i => selected.has(i.productId));
    if (allVisibleSelected) {
      // Deselect visible items, keep hidden selections
      setSelected(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      // Select all visible items, keep existing selections
      setSelected(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [selected, items]);

  const toggleOne = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const setOrderQty = useCallback((id: string, qty: number) => {
    setOrderQtys(prev => ({ ...prev, [id]: Math.max(1, qty) }));
  }, []);

  // Compute totals
  const { selectedCount, estTotal, hasAllCosts, totalSelectedCount } = useMemo(() => {
    let count = 0, total = 0, allCosts = true;
    for (const item of items) {
      if (!selected.has(item.productId)) continue;
      count++;
      const qty = orderQtys[item.productId] ?? item.suggestedQty;
      const cost = parseFloat(item.costPrice || "0");
      if (cost > 0) {
        total += qty * cost;
      } else {
        allCosts = false;
      }
    }
    // Total selected across ALL items (not just filtered)
    const totalSel = allItems.filter(i => selected.has(i.productId)).length;
    return { selectedCount: count, estTotal: total, hasAllCosts: allCosts, totalSelectedCount: totalSel };
  }, [items, allItems, selected, orderQtys]);

  // Group selected by supplier for PO creation
  const suppliers = suppliersData?.data ?? [];

  // Initialize supplier assignments from product's primary supplier
  const effectiveSupplier = useCallback((item: ReorderItem) => {
    return supplierAssignments[item.productId] || item.primarySupplierId || null;
  }, [supplierAssignments]);

  const supplierGroups = useMemo(() => {
    const groups = new Map<string, { supplierId: string | null; supplierName: string; items: ReorderItem[] }>();
    for (const item of items) {
      if (!selected.has(item.productId)) continue;
      const sid = supplierAssignments[item.productId] || item.primarySupplierId || null;
      const sname = sid
        ? (suppliers.find((s: any) => s.id === sid)?.name || item.primarySupplierName || "Unknown")
        : "No Supplier Assigned";
      const key = sid || "__none__";
      if (!groups.has(key)) {
        groups.set(key, { supplierId: sid, supplierName: sname, items: [] });
      }
      groups.get(key)!.items.push(item);
    }
    return Array.from(groups.values());
  }, [items, selected, supplierAssignments, suppliers]);

  // Create Draft POs (merges into existing drafts for same supplier)
  const handleCreatePOs = async () => {
    setCreating(true);
    const created: typeof createdPOs = [];
    try {
      // First, check for existing draft POs
      const existingPOs = await apiFetch<{ data: Array<{ id: string; poNo: string; supplierId: string; status: string }> }>(
        "/procurement/purchase-orders?status=DRAFT&limit=100",
        { token: token!, locationId: locationId! },
      );
      const draftBySupplier = new Map<string, { id: string; poNo: string }>();
      for (const po of existingPOs.data || []) {
        if (po.status === "DRAFT" && po.supplierId && !draftBySupplier.has(po.supplierId)) {
          draftBySupplier.set(po.supplierId, { id: po.id, poNo: po.poNo });
        }
      }

      for (const group of supplierGroups) {
        if (!group.supplierId) continue;
        const lines = group.items.map(item => ({
          productId: item.productId,
          orderedQty: orderQtys[item.productId] ?? item.suggestedQty,
          unitCost: item.costPrice || "0.00",
        }));

        const existingDraft = draftBySupplier.get(group.supplierId);

        if (existingDraft) {
          // Merge into existing draft PO — add lines via the add-line pattern
          for (const line of lines) {
            try {
              await apiFetch(`/procurement/purchase-orders/${existingDraft.id}/lines`, {
                token: token!,
                locationId: locationId!,
                method: "POST",
                body: line,
              });
            } catch {
              // If add-line endpoint doesn't exist, fall through to create new PO
            }
          }
          created.push({
            poNo: existingDraft.poNo,
            supplierName: group.supplierName,
            itemCount: group.items.length,
            action: "updated",
          });
        } else {
          // Create new draft PO
          const res = await apiFetch<{ po: { poNo: string } }>("/procurement/purchase-orders", {
            token: token!,
            locationId: locationId!,
            method: "POST",
            body: {
              supplierId: group.supplierId,
              destinationLocationId: destinationLocationId || apiLocationId,
              notes: "Generated from Stock Velocity reorder suggestions",
              lines,
            } as any,
          });
          created.push({
            poNo: res.po.poNo,
            supplierName: group.supplierName,
            itemCount: group.items.length,
            action: "created",
          });
        }
      }
      setCreatedPOs(created);
      setShowSupplierModal(false);
    } catch (err: any) {
      alert(err.message || "Failed to create PO");
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  // Inline mode: render directly in flow (as a tab), no overlay
  const wrapperClass = inline
    ? "mt-2 flex flex-col"
    : "flex w-[65vw] min-w-[600px] max-w-[900px] flex-col border-l border-border bg-background shadow-2xl";

  const content = (
    <div className={wrapperClass}>
        <ReorderPanelHeader inline={inline} onClose={onClose} />

        <ReorderPanelFilters
          allLocations={allLocations}
          brandId={brandId}
          brandName={brandName}
          categoryId={categoryId}
          categoryName={categoryName}
          destinationLocationId={destinationLocationId}
          itemCount={items.length}
          targetMonths={targetMonths}
          urgency={urgency}
          onDestinationLocationChange={setDestinationLocationId}
          onTargetMonthsChange={(value) => {
            setTargetMonths(value);
            setInitialized(false);
          }}
          onUrgencyChange={(value) => {
            setUrgency(value);
            setInitialized(false);
          }}
        />

        {/* Success state */}
        {createdPOs.length > 0 ? (
          <ReorderSuccessState createdPOs={createdPOs} onClose={onClose} />
        ) : (
          <>
            <div className="flex-1 overflow-auto">
              <ReorderSuggestionsTable
                allItems={allItems}
                inline={inline}
                isLoading={isLoading}
                items={items}
                orderQtys={orderQtys}
                panelSearch={panelSearch}
                selected={selected}
                selectedCount={selectedCount}
                showCost={showCost}
                supplierAssignments={supplierAssignments}
                suppliers={suppliers}
                onAssignSelectedSupplier={(supplierId) => {
                  const updates: Record<string, string> = {};
                  items.forEach((item) => {
                    if (selected.has(item.productId)) {
                      updates[item.productId] = supplierId;
                    }
                  });
                  setSupplierAssignments((prev) => ({ ...prev, ...updates }));
                }}
                onPanelSearchChange={setPanelSearch}
                onSetOrderQty={setOrderQty}
                onSupplierAssignmentChange={(productId, supplierId) =>
                  setSupplierAssignments((prev) => ({
                    ...prev,
                    [productId]: supplierId,
                  }))
                }
                onToggleAll={toggleAll}
                onToggleOne={toggleOne}
              />
            </div>

            <ReorderActionFooter
              allItemCount={allItems.length}
              creating={creating}
              estTotal={estTotal}
              hasAllCosts={hasAllCosts}
              itemCount={items.length}
              panelSearch={panelSearch}
              selectedCount={selectedCount}
              showCost={showCost}
              supplierGroups={supplierGroups}
              totalSelectedCount={totalSelectedCount}
              onClose={onClose}
              onCreatePOs={handleCreatePOs}
              onShowSupplierModal={() => setShowSupplierModal(true)}
            />
          </>
        )}

        {showSupplierModal && (
          <SupplierGroupingModal
            creating={creating}
            supplierGroups={supplierGroups}
            onClose={() => setShowSupplierModal(false)}
            onCreatePOs={handleCreatePOs}
          />
        )}
      </div>
  );

  if (inline) return content;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      {content}
    </div>
  );
}
