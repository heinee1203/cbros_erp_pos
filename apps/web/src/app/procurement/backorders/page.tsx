"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  X,
  Loader2,
  Plus,
  ClipboardList,
  Clock,
  AlertTriangle,
  Users,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Pencil,
  XCircle,
  ShoppingCart,
  Check,
  ArrowRightLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";

/* ═══════════════════════════════════════════════════════
 * TYPES
 * ═══════════════════════════════════════════════════════ */

interface BackorderItem {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  supplierId: string;
  supplierName: string;
  qtyNeeded: number;
  quantityOrdered: number | null;
  quantityReceived: number | null;
  quantityOutstanding: number | null;
  unitCost: string | null;
  sourcePo: string | null;
  sourcePONumber: string | null;
  originalPoLineId: string | null;
  daysPending: number;
  reason: string;
  priority: "HIGH" | "NORMAL" | "LOW";
  neededBy: string | null;
  waitUntil: string | null;
  isOverdue: boolean;
  status: "PENDING" | "INCLUDED_IN_PO" | "FULFILLED" | "CANCELLED";
  targetPoId: string | null;
  targetPoNumber: string | null;
  newSupplierId: string | null;
  newSupplierName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

interface SupplierGroup {
  supplierId: string;
  supplierName: string;
  items: BackorderItem[];
  totalQty: number;
  oldestDays: number;
}

interface BackorderSummary {
  pendingTotal: number;
  suppliersWithPending: number;
  oldestPendingDays: number;
  neededThisWeek: number;
  overdueCount: number;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
}

interface SupplierOption {
  id: string;
  name: string;
}

/* ═══════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════ */

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

const STATUS_TABS = [
  { key: "PENDING", label: "Pending" },
  { key: "INCLUDED_IN_PO", label: "Included in PO" },
  { key: "FULFILLED", label: "Fulfilled" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "ALL", label: "All" },
] as const;

const PRIORITY_BADGES: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  NORMAL: "bg-blue-100 text-blue-700",
  LOW: "bg-gray-100 text-gray-600",
};

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: "High",
  NORMAL: "Normal",
  LOW: "Low",
};

const STATUS_BADGES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  INCLUDED_IN_PO: "bg-blue-100 text-blue-700",
  FULFILLED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-600",
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  INCLUDED_IN_PO: "Included in PO",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};

/* ═══════════════════════════════════════════════════════
 * API HELPER
 * ═══════════════════════════════════════════════════════ */

async function apiFetch(
  path: string,
  token: string,
  locationId: string,
  options?: RequestInit,
) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Location-ID": locationId,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/* ═══════════════════════════════════════════════════════
 * MAIN PAGE
 * ═══════════════════════════════════════════════════════ */

export default function BackordersPage() {
  const router = useRouter();
  const { token, locationId, loading: authLoading } = useAuth();

  // ── Data state ──
  const [summary, setSummary] = useState<BackorderSummary | null>(null);
  const [supplierGroups, setSupplierGroups] = useState<SupplierGroup[]>([]);
  const [flatItems, setFlatItems] = useState<BackorderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── UI state ──
  const [activeTab, setActiveTab] = useState<string>("PENDING");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [creatingPO, setCreatingPO] = useState<string | null>(null);

  // ── Modal state ──
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
  const [newProductSearch, setNewProductSearch] = useState("");
  const [newProductResults, setNewProductResults] = useState<ProductSearchResult[]>([]);
  const [newSelectedProduct, setNewSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [newSupplierId, setNewSupplierId] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [newReason, setNewReason] = useState("");
  const [newPriority, setNewPriority] = useState<string>("NORMAL");
  const [newNeededBy, setNewNeededBy] = useState("");
  const [newLoading, setNewLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [productSearchLoading, setProductSearchLoading] = useState(false);

  // ── Determine if we use grouped or flat view ──
  const isGroupedView = activeTab === "PENDING";

  // ── Fetch summary ──
  const fetchSummary = useCallback(async () => {
    if (!token || !locationId) return;
    try {
      const data = await apiFetch("/procurement/backorders/summary", token, locationId);
      setSummary(data);
    } catch {
      // summary fetch is non-critical
    }
  }, [token, locationId]);

  // ── Fetch supplier-grouped data ──
  const fetchBySupplier = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch("/procurement/backorders/by-supplier", token, locationId);
      setSupplierGroups(data.data ?? data);
      // Auto-expand all suppliers
      const ids = (data.data ?? data).map((g: SupplierGroup) => g.supplierId);
      setExpandedSuppliers(new Set(ids));
    } catch (err: any) {
      setError(err.message || "Failed to load backorders");
    } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  // ── Fetch flat list ──
  const fetchFlat = useCallback(
    async (status: string) => {
      if (!token || !locationId) return;
      setLoading(true);
      setError(null);
      try {
        const qs = status !== "ALL" ? `?status=${status}` : "";
        const data = await apiFetch(`/procurement/backorders${qs}`, token, locationId);
        setFlatItems(data.data ?? data);
      } catch (err: any) {
        setError(err.message || "Failed to load backorders");
      } finally {
        setLoading(false);
      }
    },
    [token, locationId],
  );

  // ── Fetch suppliers (for new modal) ──
  const fetchSuppliers = useCallback(async () => {
    if (!token || !locationId) return;
    try {
      const data = await apiFetch("/procurement/suppliers", token, locationId);
      setSuppliers(data.data ?? data);
    } catch {
      // non-critical
    }
  }, [token, locationId]);

  // ── Initial + tab-change fetch ──
  useEffect(() => {
    if (!token || !locationId) return;
    fetchSummary();
    if (isGroupedView) {
      fetchBySupplier();
    } else {
      fetchFlat(activeTab);
    }
  }, [token, locationId, activeTab, isGroupedView, fetchSummary, fetchBySupplier, fetchFlat]);

  // ── Reload helper ──
  const reload = useCallback(() => {
    fetchSummary();
    if (isGroupedView) {
      fetchBySupplier();
    } else {
      fetchFlat(activeTab);
    }
  }, [fetchSummary, isGroupedView, fetchBySupplier, fetchFlat, activeTab]);

  // ── Product search for new backorder ──
  useEffect(() => {
    if ((!newModal && !resourceModal) || !token || !locationId) return;
    fetchSuppliers();
  }, [newModal, resourceModal, token, locationId, fetchSuppliers]);

  useEffect(() => {
    if (!newProductSearch.trim() || !token || !locationId) {
      setNewProductResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setProductSearchLoading(true);
      try {
        const data = await apiFetch(
          `/products?search=${encodeURIComponent(newProductSearch.trim())}&limit=10`,
          token,
          locationId,
        );
        setNewProductResults(data.data ?? data);
      } catch {
        setNewProductResults([]);
      } finally {
        setProductSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [newProductSearch, token, locationId]);

  // ── Filter items by search ──
  const filteredSupplierGroups = useMemo(() => {
    if (!searchQuery.trim()) return supplierGroups;
    const q = searchQuery.toLowerCase();
    return supplierGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.productName.toLowerCase().includes(q) ||
            item.sku.toLowerCase().includes(q) ||
            (item.sourcePONumber ?? "").toLowerCase().includes(q),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [supplierGroups, searchQuery]);

  const filteredFlatItems = useMemo(() => {
    if (!searchQuery.trim()) return flatItems;
    const q = searchQuery.toLowerCase();
    return flatItems.filter(
      (item) =>
        item.productName.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.supplierName.toLowerCase().includes(q) ||
        (item.sourcePONumber ?? "").toLowerCase().includes(q),
    );
  }, [flatItems, searchQuery]);

  // ── Toggle supplier group expand ──
  const toggleSupplierExpand = (supplierId: string) => {
    setExpandedSuppliers((prev) => {
      const next = new Set(prev);
      if (next.has(supplierId)) {
        next.delete(supplierId);
      } else {
        next.add(supplierId);
      }
      return next;
    });
  };

  // ── Create PO for supplier ──
  const handleCreatePO = useCallback(
    async (supplierId: string, supplierName: string) => {
      if (!token || !locationId) return;
      setCreatingPO(supplierId);
      try {
        // Get pending backorder IDs for this supplier
        const group = supplierGroups.find((g) => g.supplierId === supplierId);
        if (!group) return;

        const pendingIds = group.items
          .filter((item) => item.status === "PENDING")
          .map((item) => item.id);

        if (pendingIds.length === 0) return;

        // Fetch product cost prices for PO lines
        const pendingItems = group.items.filter((item) => item.status === "PENDING");

        // Create a draft PO with the pending items
        const poResult = await apiFetch("/procurement/purchase-orders", token, locationId, {
          method: "POST",
          body: JSON.stringify({
            supplierId,
            destinationLocationId: locationId,
            lines: pendingItems.map((item) => ({
              productId: item.productId,
              orderedQty: item.qtyNeeded,
              unitCost: "0.00", // will be filled from product cost
            })),
            notes: `Created from backorders: ${pendingItems.map(i => i.sourcePONumber).filter(Boolean).join(", ")}`,
          }),
        });

        const poId = poResult.id ?? poResult.data?.id;
        const poNum = poResult.poNo ?? poResult.data?.poNo ?? "Draft";

        // Mark backorders as included in PO
        await apiFetch("/procurement/backorders/include-in-po", token, locationId, {
          method: "POST",
          body: JSON.stringify({
            backorderIds: pendingIds,
            targetPoId: poId,
            targetPoNumber: poNum,
          }),
        });
        setSuccessMsg(`Created PO ${poNum} for ${supplierName} with ${pendingIds.length} item(s)`);
        setTimeout(() => setSuccessMsg(null), 5000);
        reload();
      } catch (err: any) {
        setError(err.message || "Failed to create PO");
      } finally {
        setCreatingPO(null);
      }
    },
    [token, locationId, supplierGroups, reload],
  );

  // ── Cancel backorder ──
  const handleCancel = useCallback(async () => {
    if (!cancelModal || !token || !locationId) return;
    setCancelLoading(true);
    try {
      await apiFetch(`/procurement/backorders/${cancelModal.id}/cancel`, token, locationId, {
        method: "POST",
        body: JSON.stringify({ reason: cancelReason }),
      });
      setSuccessMsg(`Cancelled backorder for ${cancelModal.productName}`);
      setTimeout(() => setSuccessMsg(null), 5000);
      setCancelModal(null);
      setCancelReason("");
      reload();
    } catch (err: any) {
      setError(err.message || "Failed to cancel backorder");
    } finally {
      setCancelLoading(false);
    }
  }, [cancelModal, cancelReason, token, locationId, reload]);

  // ── Create PO for single backorder ──
  const handleCreatePOSingle = useCallback(
    async (backorderId: string, productName: string) => {
      if (!token || !locationId) return;
      try {
        const result = await apiFetch(
          `/procurement/backorders/${backorderId}/create-po`,
          token,
          locationId,
          { method: "POST" },
        );
        setSuccessMsg(`Draft PO ${result.newPoNo} created for ${productName}`);
        setTimeout(() => setSuccessMsg(null), 5000);
        reload();
      } catch (err: any) {
        setError(err.message || "Failed to create PO");
      }
    },
    [token, locationId, reload],
  );

  const handleResource = useCallback(async () => {
    if (!resourceModal || !resourceSupplierId || !token || !locationId) return;
    setResourceLoading(true);
    try {
      const result = await apiFetch(
        `/procurement/backorders/${resourceModal.id}/resource`,
        token,
        locationId,
        {
          method: "POST",
          body: JSON.stringify({ newSupplierId: resourceSupplierId }),
        },
      );
      setSuccessMsg(`Re-sourced to ${result.newSupplierName ?? "new supplier"}. Draft PO ${result.newPoNo} created.`);
      setTimeout(() => setSuccessMsg(null), 5000);
      setResourceModal(null);
      setResourceSupplierId("");
      reload();
    } catch (err: any) {
      setError(err.message || "Failed to re-source");
    } finally {
      setResourceLoading(false);
    }
  }, [resourceModal, resourceSupplierId, token, locationId, reload]);

  // ── Edit backorder ──
  const handleEdit = useCallback(async () => {
    if (!editModal || !token || !locationId) return;
    setEditLoading(true);
    try {
      await apiFetch(`/procurement/backorders/${editModal.id}`, token, locationId, {
        method: "PATCH",
        body: JSON.stringify({
          priority: editPriority,
          neededBy: editNeededBy || null,
          notes: editNotes || null,
        }),
      });
      setSuccessMsg(`Updated backorder for ${editModal.productName}`);
      setTimeout(() => setSuccessMsg(null), 5000);
      setEditModal(null);
      reload();
    } catch (err: any) {
      setError(err.message || "Failed to update backorder");
    } finally {
      setEditLoading(false);
    }
  }, [editModal, editPriority, editNeededBy, editNotes, token, locationId, reload]);

  // ── Create new backorder ──
  const handleCreateNew = useCallback(async () => {
    if (!newSelectedProduct || !newSupplierId || !token || !locationId) return;
    setNewLoading(true);
    try {
      await apiFetch("/procurement/backorders", token, locationId, {
        method: "POST",
        body: JSON.stringify({
          productId: newSelectedProduct.id,
          supplierId: newSupplierId,
          qtyNeeded: newQty,
          reason: newReason,
          priority: newPriority,
          neededBy: newNeededBy || null,
        }),
      });
      setSuccessMsg(`Created backorder for ${newSelectedProduct.name}`);
      setTimeout(() => setSuccessMsg(null), 5000);
      resetNewModal();
      reload();
    } catch (err: any) {
      setError(err.message || "Failed to create backorder");
    } finally {
      setNewLoading(false);
    }
  }, [newSelectedProduct, newSupplierId, newQty, newReason, newPriority, newNeededBy, token, locationId, reload]);

  const resetNewModal = () => {
    setNewModal(false);
    setNewProductSearch("");
    setNewProductResults([]);
    setNewSelectedProduct(null);
    setNewSupplierId("");
    setNewQty(1);
    setNewReason("");
    setNewPriority("NORMAL");
    setNewNeededBy("");
  };

  // ── Open edit modal with prefilled values ──
  const openEditModal = (item: BackorderItem) => {
    setEditModal(item);
    setEditPriority(item.priority);
    setEditNeededBy(item.neededBy ? item.neededBy.substring(0, 10) : "");
    setEditNotes(item.notes ?? "");
  };

  // ── Auth loading ──
  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Compute total pending from grouped view ──
  const totalGroupedPending = filteredSupplierGroups.reduce(
    (sum, g) => sum + g.items.filter((i) => i.status === "PENDING").length,
    0,
  );

  return (
    <div className="flex h-full flex-col">
      {/* ── Success Banner ── */}
      {successMsg && (
        <div className="flex items-center gap-2 border-b border-green-200 bg-green-50 px-6 py-2.5 text-sm text-green-800">
          <Check size={14} />
          {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Error Banner ── */}
      {error && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-6 py-2.5 text-sm text-red-800">
          <AlertTriangle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="border-b border-border bg-background px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <ClipboardList size={18} className="text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Backorders</h1>
              <p className="text-xs text-muted-foreground">
                Track and manage items on backorder from suppliers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNewModal(true)}
              className="flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Plus size={12} />
              New Backorder
            </button>
          </div>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      {summary && <SummaryCards summary={summary} />}

      {/* ── Filter Tabs + Search ── */}
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Tabs */}
          <div className="flex items-center gap-1">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  activeTab === tab.key
                    ? "bg-blue-600 text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50",
                )}
              >
                {tab.label}
                {tab.key === "PENDING" && summary ? (
                  <span className="ml-1.5 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
                    {summary.pendingTotal}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search product, SKU, PO..."
              className="h-8 w-64 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isGroupedView ? (
          /* ── Supplier-Grouped View ── */
          filteredSupplierGroups.length === 0 ? (
            <EmptyState
              message={
                searchQuery
                  ? "No backorders match your search"
                  : "No pending backorders"
              }
              submessage={
                searchQuery
                  ? "Try broadening your search criteria."
                  : 'All caught up! Click "+ New Backorder" to add one manually.'
              }
            />
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredSupplierGroups.map((group) => (
                <SupplierGroupSection
                  key={group.supplierId}
                  group={group}
                  isExpanded={expandedSuppliers.has(group.supplierId)}
                  onToggle={() => toggleSupplierExpand(group.supplierId)}
                  onCreatePO={() => handleCreatePO(group.supplierId, group.supplierName)}
                  isCreatingPO={creatingPO === group.supplierId}
                  onEdit={openEditModal}
                  onCancel={(item) => {
                    setCancelModal(item);
                    setCancelReason("");
                  }}
                  onCreatePOSingle={handleCreatePOSingle}
                  onResourceItem={(item) => {
                    setResourceModal(item);
                    setResourceSupplierId("");
                  }}
                />
              ))}
            </div>
          )
        ) : /* ── Flat List View ── */
        filteredFlatItems.length === 0 ? (
          <EmptyState
            message={
              searchQuery
                ? "No backorders match your search"
                : `No ${activeTab === "ALL" ? "" : STATUS_LABELS[activeTab]?.toLowerCase() + " "}backorders`
            }
            submessage={
              searchQuery
                ? "Try broadening your search criteria."
                : 'Click "+ New Backorder" to create one.'
            }
          />
        ) : (
          <div>
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">
                    Product
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">
                    Supplier
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">
                    Qty
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">
                    Source PO
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider">
                    Days Pending
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">
                    Reason
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider">
                    Priority
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider">
                    Status
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider">
                    Needed By
                  </th>
                  <th scope="col" className="whitespace-nowrap px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredFlatItems.map((item) => (
                  <BackorderRow
                    key={item.id}
                    item={item}
                    onEdit={() => openEditModal(item)}
                    onCancel={() => {
                      setCancelModal(item);
                      setCancelReason("");
                    }}
                    onCreatePO={() => handleCreatePOSingle(item.id, item.productName)}
                    onResource={() => {
                      setResourceModal(item);
                      setResourceSupplierId("");
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-border bg-background px-6 py-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {isGroupedView
              ? `${filteredSupplierGroups.length} supplier(s), ${totalGroupedPending} pending item(s)`
              : `${filteredFlatItems.length} backorder(s)`}
            {searchQuery ? " (filtered)" : ""}
          </span>
          <button
            onClick={reload}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── Cancel Modal ── */}
      {cancelModal && (
        <ModalOverlay onClose={() => setCancelModal(null)}>
          <div className="bg-white rounded-xl border shadow-lg p-6 w-full max-w-md">
            <h3 className="text-base font-semibold text-foreground mb-1">Cancel Backorder</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Cancel backorder for <span className="font-medium text-foreground">{cancelModal.productName}</span>?
            </p>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Reason for cancellation
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Enter reason..."
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setCancelModal(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Keep Active
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelLoading}
                className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelLoading && <Loader2 size={12} className="animate-spin" />}
                Cancel Backorder
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Re-source Modal ── */}
      {resourceModal && (
        <ModalOverlay onClose={() => setResourceModal(null)}>
          <div className="bg-white rounded-xl border shadow-lg p-6 w-full max-w-md">
            <h3 className="text-base font-semibold text-foreground mb-1">Re-source to Different Supplier</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Re-source <span className="font-medium text-foreground">{resourceModal.productName}</span> ({resourceModal.quantityOutstanding ?? resourceModal.qtyNeeded} pcs)
            </p>
            <label className="block text-xs font-medium text-gray-700 mb-1">New Supplier</label>
            <select
              value={resourceSupplierId}
              onChange={(e) => setResourceSupplierId(e.target.value)}
              className="w-full rounded-lg border border-input px-3 py-2 text-sm mb-4"
            >
              <option value="">Select supplier...</option>
              {suppliers
                .filter((s: SupplierOption) => s.id !== resourceModal.supplierId)
                .map((s: SupplierOption) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setResourceModal(null)}
                className="rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={handleResource}
                disabled={!resourceSupplierId || resourceLoading}
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {resourceLoading && <Loader2 size={14} className="animate-spin" />}
                Create PO & Re-source
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── Edit Modal ── */}
      {editModal && (
        <ModalOverlay onClose={() => setEditModal(null)}>
          <div className="bg-white rounded-xl border shadow-lg p-6 w-full max-w-md">
            <h3 className="text-base font-semibold text-foreground mb-1">Edit Backorder</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Editing backorder for <span className="font-medium text-foreground">{editModal.productName}</span>
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                >
                  <option value="HIGH">High</option>
                  <option value="NORMAL">Normal</option>
                  <option value="LOW">Low</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Needed By</label>
                <input
                  type="date"
                  value={editNeededBy}
                  onChange={(e) => setEditNeededBy(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Additional notes..."
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setEditModal(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Discard
              </button>
              <button
                onClick={handleEdit}
                disabled={editLoading}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {editLoading && <Loader2 size={12} className="animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* ── New Backorder Modal ── */}
      {newModal && (
        <ModalOverlay onClose={resetNewModal}>
          <div className="bg-white rounded-xl border shadow-lg p-6 w-full max-w-lg">
            <h3 className="text-base font-semibold text-foreground mb-1">New Backorder</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Manually create a backorder for an item that a supplier cannot currently fulfill.
            </p>

            <div className="space-y-3">
              {/* Product search */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Product <span className="text-red-500">*</span>
                </label>
                {newSelectedProduct ? (
                  <div className="flex items-center justify-between rounded-md border border-border bg-gray-50 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium text-foreground">{newSelectedProduct.name}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{newSelectedProduct.sku}</div>
                    </div>
                    <button
                      onClick={() => {
                        setNewSelectedProduct(null);
                        setNewProductSearch("");
                      }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="text"
                      value={newProductSearch}
                      onChange={(e) => setNewProductSearch(e.target.value)}
                      placeholder="Search product by name or SKU..."
                      className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
                    />
                    {productSearchLoading && (
                      <Loader2
                        size={14}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
                      />
                    )}
                    {newProductResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-md border border-border bg-white shadow-lg">
                        {newProductResults.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setNewSelectedProduct(p);
                              setNewProductSearch("");
                              setNewProductResults([]);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50"
                          >
                            <div>
                              <div className="font-medium text-foreground">{p.name}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">{p.sku}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Supplier <span className="text-red-500">*</span>
                </label>
                <select
                  value={newSupplierId}
                  onChange={(e) => setNewSupplierId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity + Priority row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Quantity <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={newQty}
                    onChange={(e) => setNewQty(parseInt(e.target.value, 10) || 1)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  >
                    <option value="HIGH">High</option>
                    <option value="NORMAL">Normal</option>
                    <option value="LOW">Low</option>
                  </select>
                </div>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                <input
                  type="text"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="e.g., Out of stock at supplier, Delayed shipment"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>

              {/* Needed By */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Needed By</label>
                <input
                  type="date"
                  value={newNeededBy}
                  onChange={(e) => setNewNeededBy(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={resetNewModal}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNew}
                disabled={newLoading || !newSelectedProduct || !newSupplierId}
                className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {newLoading && <Loader2 size={12} className="animate-spin" />}
                Create Backorder
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SUMMARY CARDS
 * ═══════════════════════════════════════════════════════ */

function SummaryCards({ summary }: { summary: BackorderSummary }) {
  const cards = [
    {
      label: "Pending Backorders",
      value: summary.pendingTotal,
      icon: <ClipboardList size={16} />,
      color: "text-amber-700",
    },
    {
      label: "Suppliers with Pending",
      value: summary.suppliersWithPending,
      icon: <Users size={16} />,
      color: "text-blue-700",
    },
    {
      label: "Oldest Pending",
      value: summary.oldestPendingDays > 0 ? `${summary.oldestPendingDays}d` : "--",
      icon: <Clock size={16} />,
      color: summary.oldestPendingDays > 14 ? "text-red-700" : "text-gray-700",
    },
    {
      label: "Needed This Week",
      value: summary.neededThisWeek,
      icon: <CalendarClock size={16} />,
      color: summary.neededThisWeek > 0 ? "text-orange-700" : "text-gray-700",
    },
  ];

  return (
    <div className="border-b border-border bg-background px-6 py-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border shadow-sm p-5 flex items-start gap-3"
          >
            <div className={cn("mt-0.5", card.color)}>{card.icon}</div>
            <div>
              <div className={cn("text-xl font-bold tabular-nums", card.color)}>
                {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
              </div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-0.5">
                {card.label}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * SUPPLIER GROUP SECTION
 * ═══════════════════════════════════════════════════════ */

function SupplierGroupSection({
  group,
  isExpanded,
  onToggle,
  onCreatePO,
  isCreatingPO,
  onEdit,
  onCancel,
  onCreatePOSingle,
  onResourceItem,
}: {
  group: SupplierGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onCreatePO: () => void;
  isCreatingPO: boolean;
  onEdit: (item: BackorderItem) => void;
  onCancel: (item: BackorderItem) => void;
  onCreatePOSingle: (id: string, name: string) => void;
  onResourceItem: (item: BackorderItem) => void;
}) {
  const pendingCount = group.items.filter((i) => i.status === "PENDING").length;
  const hasPending = pendingCount > 0;

  return (
    <div>
      {/* Group Header */}
      <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-left"
        >
          {isExpanded ? (
            <ChevronDown size={16} className="text-gray-500 shrink-0" />
          ) : (
            <ChevronRight size={16} className="text-gray-500 shrink-0" />
          )}
          <div>
            <span className="font-semibold text-sm text-foreground">{group.supplierName}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {pendingCount} pending item{pendingCount !== 1 ? "s" : ""} &middot;{" "}
              {group.totalQty} total qty &middot; oldest {group.oldestDays}d ago
            </span>
          </div>
        </button>
        {hasPending && (
          <button
            onClick={onCreatePO}
            disabled={isCreatingPO}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isCreatingPO ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <ShoppingCart size={12} />
            )}
            Create PO for {group.supplierName}
          </button>
        )}
      </div>

      {/* Group Items Table */}
      {isExpanded && (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
            <tr>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider">
                Product
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">
                Qty Needed
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider">
                Source PO
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">
                Days Pending
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider">
                Reason
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider">
                Priority
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-[11px] font-semibold uppercase tracking-wider">
                Needed By
              </th>
              <th scope="col" className="whitespace-nowrap px-4 py-2 text-center text-[11px] font-semibold uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {group.items.map((item) => (
              <BackorderRow
                key={item.id}
                item={item}
                hideSupplier
                onEdit={() => onEdit(item)}
                onCancel={() => onCancel(item)}
                onCreatePO={() => onCreatePOSingle(item.id, item.productName)}
                onResource={() => onResourceItem(item)}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * BACKORDER TABLE ROW
 * ═══════════════════════════════════════════════════════ */

function BackorderRow({
  item,
  hideSupplier,
  onEdit,
  onCancel,
  onCreatePO,
  onResource,
}: {
  item: BackorderItem;
  hideSupplier?: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onCreatePO: () => void;
  onResource: () => void;
}) {
  const priorityBadge = PRIORITY_BADGES[item.priority] ?? "bg-gray-100 text-gray-600";
  const statusBadge = STATUS_BADGES[item.status] ?? "bg-gray-100 text-gray-600";

  const waitUntilStr = item.waitUntil
    ? new Date(item.waitUntil).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "--";

  const overdueFlag =
    item.isOverdue ||
    (item.waitUntil && item.status === "PENDING" && new Date(item.waitUntil) < new Date());

  const isPending = item.status === "PENDING";

  return (
    <tr className={cn("group transition-colors hover:bg-muted/30", overdueFlag && isPending && "bg-red-50/50 dark:bg-red-900/10")}>
      {/* Product Name + SKU */}
      <td className="max-w-[240px] px-4 py-2.5">
        <div className="truncate text-sm font-medium text-foreground" title={item.productName}>
          {item.productName}
        </div>
        <div className="truncate font-mono text-[10px] text-muted-foreground">{item.sku}</div>
      </td>

      {/* Supplier (shown in flat view) */}
      {!hideSupplier && (
        <td className="max-w-[140px] whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
          <span className="truncate block" title={item.supplierName}>
            {item.supplierName}
          </span>
        </td>
      )}

      {/* Qty */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm font-medium text-foreground">
        {(item.quantityOutstanding ?? item.qtyNeeded).toLocaleString()}
      </td>

      {/* Unit Cost */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-muted-foreground">
        {item.unitCost ? `₱${parseFloat(item.unitCost).toLocaleString()}` : "--"}
      </td>

      {/* Source PO */}
      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-muted-foreground">
        {item.sourcePONumber ? (
          <span className="font-mono text-xs">{item.sourcePONumber}</span>
        ) : (
          <span className="text-muted-foreground/50">--</span>
        )}
      </td>

      {/* Wait Until / Target PO */}
      <td className="whitespace-nowrap px-4 py-2.5 text-sm">
        {item.status === "INCLUDED_IN_PO" && item.targetPoNumber ? (
          <span className="font-mono text-xs text-blue-600">{item.targetPoNumber}</span>
        ) : (
          <span
            className={cn(
              overdueFlag ? "text-red-600 font-medium" : "text-muted-foreground",
            )}
          >
            {waitUntilStr}
            {overdueFlag && isPending && (
              <span className="ml-1 inline-flex rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">
                OVERDUE
              </span>
            )}
          </span>
        )}
      </td>

      {/* Days */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm">
        <span
          className={cn(
            item.daysPending > 14
              ? "text-red-600 font-medium"
              : item.daysPending > 7
                ? "text-amber-600"
                : "text-muted-foreground",
          )}
        >
          {item.daysPending}d
        </span>
      </td>

      {/* Priority */}
      <td className="whitespace-nowrap px-4 py-2.5 text-center">
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
            priorityBadge,
          )}
        >
          {PRIORITY_LABELS[item.priority] ?? item.priority}
        </span>
      </td>

      {/* Status (shown in flat view) */}
      {!hideSupplier && (
        <td className="whitespace-nowrap px-4 py-2.5 text-center">
          <span
            className={cn(
              "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold",
              statusBadge,
            )}
          >
            {STATUS_LABELS[item.status] ?? item.status}
          </span>
        </td>
      )}

      {/* Actions */}
      <td className="whitespace-nowrap px-4 py-2.5 text-center">
        <div className="flex items-center justify-center gap-1">
          {isPending && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); onCreatePO(); }}
                className="flex h-6 items-center gap-1 rounded bg-blue-600 px-2 text-[10px] font-medium text-white transition-colors hover:bg-blue-700"
                title="Create new PO for this item"
              >
                <ShoppingCart size={10} />
                PO
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onResource(); }}
                className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Re-source to different supplier"
              >
                <ArrowRightLeft size={10} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title="Edit backorder"
              >
                <Pencil size={10} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onCancel(); }}
                className="flex h-6 items-center gap-1 rounded border border-border px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                title="Cancel backorder"
              >
                <XCircle size={10} />
              </button>
            </>
          )}
          {item.status === "FULFILLED" && (
            <span className="flex items-center gap-1 text-[10px] text-green-600"><Check size={10} /> Fulfilled</span>
          )}
          {item.status === "INCLUDED_IN_PO" && item.targetPoNumber && (
            <span className="text-[10px] text-blue-600">→ {item.targetPoNumber}</span>
          )}
          {item.status === "CANCELLED" && (
            <span className="text-[10px] text-muted-foreground/50">Cancelled</span>
          )}
        </div>
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
 * EMPTY STATE
 * ═══════════════════════════════════════════════════════ */

function EmptyState({
  message,
  submessage,
}: {
  message: string;
  submessage: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <ClipboardList size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{message}</p>
        <p className="mt-1 text-xs text-muted-foreground">{submessage}</p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * MODAL OVERLAY
 * ═══════════════════════════════════════════════════════ */

function ModalOverlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />
      {/* Content */}
      <div className="relative z-10 mx-4">{children}</div>
    </div>
  );
}
