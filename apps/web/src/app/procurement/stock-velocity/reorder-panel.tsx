"use client";

import { useState, useMemo, useCallback } from "react";
import { X, ShoppingCart, Loader2, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { useBrands } from "@/hooks/use-brands";
import { useCategories } from "@/hooks/use-categories";
import { useSuppliers } from "@/hooks/use-suppliers";
import { useQuery } from "@tanstack/react-query";
import { useLocations } from "@/hooks/use-locations";

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 180) return `${Math.floor(diffDays / 30)}mo ago`;
  return d.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
}

// ── Types ──

interface ReorderItem {
  productId: string;
  productName: string;
  productSku: string;
  brandName: string | null;
  categoryName: string | null;
  totalStock: number;
  avgMonth3m: number;
  minMonthsLeft: number | null;
  suggestedQty: number;
  costPrice: string | null;
  avgSellingPrice: string | null;
  lastSaleDate: string | null;
  primarySupplierId: string | null;
  primarySupplierName: string | null;
  specialOrder?: boolean;
  discontinued?: boolean;
  // Aliases for convenience
  supplierName?: string | null;
  supplierId?: string | null;
}

interface ReorderResponse {
  data: ReorderItem[];
  total: number;
}

// ── Helpers ──

function fmtPeso(v: number): string {
  return `₱${v.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getUrgencyColor(val: number | null): string {
  if (val === null) return "";
  if (val <= 0.5) return "bg-[rgba(181,101,29,0.6)] text-white";
  if (val <= 1.5) return "bg-[rgba(212,160,23,0.5)] text-black";
  if (val <= 3.0) return "bg-[rgba(198,142,23,0.3)]";
  return "";
}

// ── Panel ──

export function ReorderSuggestionsPanel({ open, onClose, inline, lastSoldAfter, lastSoldBefore, urgencyAll, urgency12M, urgency6M, urgency3M, urgency1M, velocityClass }: {
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

  // Filters
  const [targetMonths, setTargetMonths] = useState(3);
  const [urgency, setUrgency] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Selection + order qty overrides
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [orderQtys, setOrderQtys] = useState<Record<string, number>>({});
  const [initialized, setInitialized] = useState(false);

  // Supplier assignment modal
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createdPOs, setCreatedPOs] = useState<Array<{ poNo: string; supplierName: string; itemCount: number; action: "created" | "updated" }>>([]);
  // Per-item supplier assignment: productId → supplierId
  const [supplierAssignments, setSupplierAssignments] = useState<Record<string, string>>({});
  const [panelSearch, setPanelSearch] = useState("");

  const { data: brandsData } = useBrands(token, apiLocationId);
  const { data: categoriesData } = useCategories(token, apiLocationId);
  const { data: suppliersData } = useSuppliers(token!, apiLocationId);
  const brands = brandsData?.data ?? [];
  const categories = categoriesData?.data ?? [];

  // Fetch suggestions — pass ALL active velocity filters
  const params = new URLSearchParams();
  params.set("targetMonths", String(targetMonths));
  params.set("limit", "200");
  if (urgency) params.set("urgency", urgency);
  if (brandFilter) params.set("brandId", brandFilter);
  if (categoryFilter) params.set("categoryId", categoryFilter);
  if (lastSoldAfter) params.set("lastSoldAfter", lastSoldAfter);
  if (lastSoldBefore) params.set("lastSoldBefore", lastSoldBefore);
  if (urgencyAll) params.set("urgencyAll", urgencyAll);
  if (urgency12M) params.set("urgency12M", urgency12M);
  if (urgency6M) params.set("urgency6M", urgency6M);
  if (urgency3M) params.set("urgency3M", urgency3M);
  if (urgency1M) params.set("urgency1M", urgency1M);
  if (velocityClass) params.set("velocityClass", velocityClass);

  const { data, isLoading } = useQuery<ReorderResponse>({
    queryKey: ["reorder-suggestions", targetMonths, urgency, brandFilter, categoryFilter, lastSoldAfter, lastSoldBefore, urgencyAll, urgency12M, urgency6M, urgency3M, urgency1M, velocityClass],
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
        {/* Header — compact when inline (tab label already visible) */}
        {inline ? null : (
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <ShoppingCart size={16} className="text-primary" />
              <h2 className="text-sm font-semibold">Reorder Suggestions</h2>
            </div>
            <button onClick={onClose} className="rounded p-1 hover:bg-muted"><X size={16} /></button>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <label className="text-[10px] text-muted-foreground">Target:</label>
          <select value={targetMonths} onChange={(e) => { setTargetMonths(+e.target.value); setInitialized(false); }} className="h-6 rounded border border-border bg-background px-1.5 text-[11px]">
            <option value={1}>1 month</option>
            <option value={2}>2 months</option>
            <option value={3}>3 months</option>
            <option value={6}>6 months</option>
          </select>
          <select value={urgency} onChange={(e) => { setUrgency(e.target.value); setInitialized(false); }} className="h-6 rounded border border-border bg-background px-1.5 text-[11px]">
            <option value="">All Urgency</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="monitor">Monitor</option>
          </select>
          <select value={brandFilter} onChange={(e) => { setBrandFilter(e.target.value); setInitialized(false); }} className="h-6 rounded border border-border bg-background px-1.5 text-[11px]">
            <option value="">All Brands</option>
            {brands.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setInitialized(false); }} className="h-6 rounded border border-border bg-background px-1.5 text-[11px]">
            <option value="">All Categories</option>
            {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-muted-foreground">Deliver to:</label>
            <select
              value={destinationLocationId}
              onChange={(e) => setDestinationLocationId(e.target.value)}
              className="h-6 rounded border border-border bg-background px-1.5 text-[11px]"
            >
              {allLocations
                .filter((l: any) => l.isActive !== false && l.type !== "TRANSIT_BUFFER")
                .map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <span className="ml-auto text-[10px] text-muted-foreground">{items.length} items</span>
        </div>

        {/* Success state */}
        {createdPOs.length > 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Check size={24} className="text-green-600" />
            </div>
            <h3 className="font-semibold">Reorder Items Processed</h3>
            {createdPOs.map(po => (
              <div key={po.poNo} className="text-sm text-muted-foreground">
                <span className="font-mono font-medium text-primary">{po.poNo}</span>
                {" — "}{po.supplierName} ({po.itemCount} items)
                <span className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                  po.action === "updated" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"
                }`}>
                  {po.action === "updated" ? "Merged" : "Created"}
                </span>
              </div>
            ))}
            <button onClick={onClose} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Close</button>
          </div>
        ) : (
          <>
            {/* Table */}
            <div className="flex-1 overflow-auto">
              {isLoading ? (
                <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Check size={28} className="mb-2 text-green-500" />
                  <p className="text-sm font-medium">All stocked up!</p>
                  <p className="text-xs text-muted-foreground">No products currently need reordering at the selected threshold.</p>
                </div>
              ) : (
                <>
                {/* Bulk supplier assignment */}
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5">
                  <span className="text-[10px] text-muted-foreground">Bulk set supplier:</span>
                  <select
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const updates: Record<string, string> = {};
                      items.forEach(item => { if (selected.has(item.productId)) updates[item.productId] = e.target.value; });
                      setSupplierAssignments(prev => ({ ...prev, ...updates }));
                      e.target.value = "";
                    }}
                    className="h-6 rounded border border-border bg-background px-1 text-[10px] outline-none"
                  >
                    <option value="">Choose for {selectedCount} selected...</option>
                    {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                {/* Search within suggestions — hidden when inline (main page search handles it) */}
                {!inline && (
                  <div className="px-2 pb-2">
                    <input
                      type="text"
                      value={panelSearch}
                      onChange={(e) => setPanelSearch(e.target.value)}
                      placeholder="Search items..."
                      className="w-full h-7 rounded border border-border bg-background px-2 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-primary"
                    />
                    {panelSearch && (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        Showing {items.length} of {allItems.length} items
                      </div>
                    )}
                  </div>
                )}
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
                    <tr>
                      <th className="w-8 px-2 py-1.5"><input type="checkbox" checked={items.length > 0 && items.every(i => selected.has(i.productId))} onChange={toggleAll} className="h-3 w-3" /></th>
                      <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Product</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">Stock</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">Avg/Mo</th>
                      <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase text-muted-foreground">Urgency</th>
                      <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Last Sold</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">Suggest</th>
                      <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">Order Qty</th>
                      {showCost && <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">Unit Cost</th>}
                      {showCost && <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">Line Total</th>}
                      <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">Supplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(item => {
                      const qty = orderQtys[item.productId] ?? item.suggestedQty;
                      const cost = parseFloat(item.costPrice || "0");
                      const lineTotal = cost > 0 ? qty * cost : null;
                      return (
                        <tr key={item.productId} className={cn("border-b border-border/30 hover:bg-muted/30", selected.has(item.productId) && "bg-primary/[0.03]")}>
                          <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={selected.has(item.productId)} onChange={() => toggleOne(item.productId)} className="h-3 w-3" /></td>
                          <td className="max-w-[200px] px-2 py-1.5">
                            <div className="flex items-center gap-1">
                              <span className="truncate font-medium" title={item.productName}>{item.productName}</span>
                              {item.specialOrder && <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">SO</span>}
                              {item.discontinued && <span className="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">DC</span>}
                            </div>
                            <div className="text-[9px] font-mono text-muted-foreground">{item.productSku}</div>
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{item.totalStock}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{item.avgMonth3m.toFixed(1)}</td>
                          <td className="px-2 py-1.5 text-center">
                            <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums", getUrgencyColor(item.minMonthsLeft))}>
                              {item.minMonthsLeft !== null ? `${item.minMonthsLeft.toFixed(1)}mo` : "∞"}
                            </span>
                          </td>
                          <td className={cn("px-2 py-1.5 text-[10px]", item.lastSaleDate && (Date.now() - new Date(item.lastSaleDate).getTime() > 180 * 86400000) ? "text-muted-foreground/50" : "text-muted-foreground")}>
                            {item.lastSaleDate ? formatRelativeDate(item.lastSaleDate) : "Never"}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{item.suggestedQty}</td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              min={1}
                              value={qty}
                              onChange={(e) => setOrderQty(item.productId, parseInt(e.target.value) || 1)}
                              className="w-14 rounded border border-border bg-background px-1 py-0.5 text-right text-xs tabular-nums outline-none focus:border-primary"
                            />
                          </td>
                          {showCost && <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{cost > 0 ? fmtPeso(cost) : "—"}</td>}
                          {showCost && <td className="px-2 py-1.5 text-right tabular-nums font-medium">{lineTotal ? fmtPeso(lineTotal) : "—"}</td>}
                          <td className="px-2 py-1.5">
                            <select
                              value={supplierAssignments[item.productId] || item.primarySupplierId || ""}
                              onChange={(e) => setSupplierAssignments(prev => ({ ...prev, [item.productId]: e.target.value }))}
                              className={cn("w-28 rounded border bg-background px-1 py-0.5 text-[10px] outline-none focus:border-primary", !(supplierAssignments[item.productId] || item.primarySupplierId) && "border-amber-300 text-amber-600")}
                            >
                              <option value="">Select...</option>
                              {suppliers.map((s: any) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2.5">
              <div className="text-xs text-muted-foreground">
                Selected: <span className="font-semibold text-foreground">{totalSelectedCount}</span> items
                {panelSearch && ` (showing ${items.length} of ${allItems.length})`}
                {showCost && estTotal > 0 && (
                  <span className="ml-3">Est. Total: <span className="font-semibold text-foreground">{fmtPeso(estTotal)}</span>{!hasAllCosts && " (partial)"}</span>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
                <button
                  onClick={() => {
                    const noSupplierGroup = supplierGroups.find(g => !g.supplierId);
                    const hasSupplierGroups = supplierGroups.filter(g => g.supplierId);
                    if (hasSupplierGroups.length === 0) {
                      alert(`All ${selectedCount} items need a supplier assigned before creating a PO. Use the Supplier dropdown on each row.`);
                      return;
                    }
                    if (noSupplierGroup && noSupplierGroup.items.length > 0) {
                      const proceed = confirm(`${noSupplierGroup.items.length} items have no supplier and will be skipped. Create PO(s) for the ${hasSupplierGroups.reduce((s, g) => s + g.items.length, 0)} items that have suppliers?`);
                      if (!proceed) return;
                    }
                    if (hasSupplierGroups.length > 1) {
                      setShowSupplierModal(true);
                    } else {
                      handleCreatePOs();
                    }
                  }}
                  disabled={selectedCount === 0 || creating}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {creating ? "Creating..." : `Create Draft PO${supplierGroups.filter(g => g.supplierId).length > 1 ? `s (${supplierGroups.filter(g => g.supplierId).length})` : ""}`}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Supplier Grouping Modal */}
        {showSupplierModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50" onClick={() => setShowSupplierModal(false)}>
            <div className="w-full max-w-md rounded-lg bg-background p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-3 text-sm font-semibold">Items span multiple suppliers</h3>
              <div className="space-y-2">
                {supplierGroups.map((group, i) => (
                  <div key={group.supplierId || i} className="rounded-md border border-border p-3">
                    <div className="font-medium text-sm">{group.supplierName}</div>
                    <div className="text-xs text-muted-foreground">{group.items.length} items</div>
                    {!group.supplierId && (
                      <div className="mt-1 flex items-center gap-1">
                        <AlertTriangle size={12} className="text-warning" />
                        <span className="text-[10px] text-warning">No supplier — PO will be skipped</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setShowSupplierModal(false)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted">Cancel</button>
                <button onClick={handleCreatePOs} disabled={creating} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {creating ? "Creating..." : `Create ${supplierGroups.filter(g => g.supplierId).length} Draft POs`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );

  if (inline) return content as JSX.Element;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      {content}
    </div>
  );
}
