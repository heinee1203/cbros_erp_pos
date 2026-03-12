"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";

// ── Types ──

interface POListItem {
  id: string;
  poNo: string;
  status: string;
  supplierId: string;
  destinationLocationId: string;
  expectedDeliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
  supplierName: string;
}

interface Supplier {
  id: string;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
}

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  unitPrice: string;
  barcode: string | null;
}

interface POLineInput {
  productId: string;
  productName: string;
  sku: string;
  orderedQty: number;
  unitCost: string;
}

// ── Constants ──

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SUBMITTED: "bg-primary/10 text-primary",
  PARTIALLY_RECEIVED: "bg-warning/10 text-warning",
  FULLY_RECEIVED: "bg-success/10 text-success",
  CLOSED_WITH_VARIANCE: "bg-orange-100 text-orange-700",
  CANCELLED: "bg-destructive/10 text-destructive",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  PARTIALLY_RECEIVED: "Partially Received",
  FULLY_RECEIVED: "Fully Received",
  CLOSED_WITH_VARIANCE: "Closed (Variance)",
  CANCELLED: "Cancelled",
};

// ══════════════════════════════════════════════════════════
// Purchase Orders List Page
// ══════════════════════════════════════════════════════════

export default function PurchaseOrdersPage() {
  const { token, locationId, locations, loading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<POListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewPO, setShowNewPO] = useState(false);

  // ── Fetch POs ──
  const fetchPOs = useCallback(async () => {
    if (!token || !locationId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: POListItem[] }>(
        "/procurement/purchase-orders",
        { token, locationId },
      );
      setPos(res.data);
    } catch (err: any) {
      setError(err.message || "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  }, [token, locationId]);

  useEffect(() => {
    if (!authLoading && token && locationId) {
      fetchPOs();
    }
  }, [authLoading, token, locationId, fetchPOs]);

  // ── Client-side filter ──
  const filtered = search.trim()
    ? pos.filter(
        (po) =>
          po.poNo.toLowerCase().includes(search.toLowerCase()) ||
          po.supplierName.toLowerCase().includes(search.toLowerCase()),
      )
    : pos;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">
          Loading purchase orders...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Purchase Orders</h2>
          <p className="text-sm text-muted-foreground">
            Manage supplier orders, receiving, and procurement
          </p>
        </div>
        <button
          onClick={() => setShowNewPO(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          + New PO
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
          <button
            onClick={fetchPOs}
            className="ml-2 underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by PO number or supplier..."
          className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/20"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                PO Number
              </th>
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Supplier
              </th>
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th scope="col" className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-muted-foreground"
                >
                  {pos.length === 0
                    ? "No purchase orders yet. Click '+ New PO' to create one."
                    : "No matching purchase orders."}
                </td>
              </tr>
            ) : (
              filtered.map((po, i) => (
                <tr
                  key={po.id}
                  className={`border-b border-border transition-colors hover:bg-accent ${
                    i % 2 === 0 ? "bg-background" : "bg-muted/20"
                  }`}
                >
                  <td className="px-3 py-2 font-mono text-sm font-semibold">
                    <Link
                      href={`/procurement/purchase-orders/${po.poNo}`}
                      className="text-primary hover:underline"
                    >
                      {po.poNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-sm">{po.supplierName}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        STATUS_COLORS[po.status] ??
                        "bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABELS[po.status] ?? po.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(po.createdAt).toLocaleDateString("en-PH")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/procurement/purchase-orders/${po.poNo}`}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
          <span className="text-[10px] text-muted-foreground">
            Showing {filtered.length} purchase order{filtered.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={fetchPOs}
            className="text-[10px] font-medium text-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* New PO Dialog */}
      {showNewPO && (
        <NewPODialog
          token={token}
          locationId={locationId}
          locations={locations}
          onClose={() => setShowNewPO(false)}
          onCreated={() => {
            setShowNewPO(false);
            fetchPOs();
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// New PO Dialog
// ══════════════════════════════════════════════════════════

function NewPODialog({
  token,
  locationId,
  locations,
  onClose,
  onCreated,
}: {
  token: string;
  locationId: string;
  locations: { id: string; name: string; code: string; type: string }[];
  onClose: () => void;
  onCreated: () => void;
}) {
  // ── State ──
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(true);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedDestinationId, setSelectedDestinationId] = useState(locationId);
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<POLineInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successPoNo, setSuccessPoNo] = useState<string | null>(null);

  // Product search state
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch suppliers ──
  useEffect(() => {
    if (!token || !locationId) return;
    (async () => {
      try {
        const res = await apiFetch<{ data: Supplier[] }>(
          "/procurement/suppliers",
          { token, locationId },
        );
        setSuppliers(res.data);
        if (res.data.length === 1) {
          setSelectedSupplierId(res.data[0].id);
        }
      } catch {
        // Suppliers failed to load
      } finally {
        setSuppliersLoading(false);
      }
    })();
  }, [token, locationId]);

  // ── Product search with debounce ──
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!productSearch.trim() || productSearch.trim().length < 2) {
      setProductResults([]);
      setShowDropdown(false);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiFetch<{ data: ProductSearchResult[] }>(
          `/products?search=${encodeURIComponent(productSearch.trim())}&limit=10`,
          { token, locationId },
        );
        setProductResults(res.data);
        setShowDropdown(true);
      } catch {
        setProductResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [productSearch, token, locationId]);

  // ── Close dropdown on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        searchRef.current &&
        !searchRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Add product to lines ──
  const addProduct = (product: ProductSearchResult) => {
    // Don't add duplicates
    if (lines.some((l) => l.productId === product.id)) {
      setProductSearch("");
      setShowDropdown(false);
      return;
    }
    setLines((prev) => [
      ...prev,
      {
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        orderedQty: 1,
        unitCost: product.unitPrice,
      },
    ]);
    setProductSearch("");
    setShowDropdown(false);
    searchRef.current?.focus();
  };

  // ── Update line ──
  const updateLine = (index: number, field: "orderedQty" | "unitCost", value: string) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l;
        if (field === "orderedQty") {
          return { ...l, orderedQty: Math.max(1, parseInt(value) || 1) };
        }
        return { ...l, unitCost: value };
      }),
    );
  };

  // ── Remove line ──
  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (!selectedSupplierId || !selectedDestinationId || lines.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = {
        supplierId: selectedSupplierId,
        destinationLocationId: selectedDestinationId,
        expectedDeliveryDate: expectedDelivery
          ? new Date(expectedDelivery).toISOString()
          : undefined,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          orderedQty: l.orderedQty,
          unitCost: l.unitCost,
        })),
      };
      const result = await apiFetch<{ po: { id: string; poNo: string } }>(
        "/procurement/purchase-orders",
        {
          method: "POST",
          body: JSON.stringify(body),
          token,
          locationId,
        },
      );
      setSuccessPoNo(result.po.poNo);
    } catch (err: any) {
      setError(err.message || "Failed to create PO");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !!selectedSupplierId &&
    !!selectedDestinationId &&
    lines.length > 0 &&
    lines.every((l) => l.orderedQty > 0 && parseFloat(l.unitCost) > 0) &&
    !submitting;

  // ── Filter locations to non-transit types ──
  const validLocations = locations.filter((l) => l.type !== "TRANSIT_BUFFER");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12">
      <div className="w-full max-w-2xl rounded-xl border border-border bg-background shadow-xl">
        {/* Dialog Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h3 className="text-base font-semibold">New Purchase Order</h3>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success State */}
        {successPoNo ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success/10">
              <svg className="h-6 w-6 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h4 className="text-base font-semibold">PO Created Successfully</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-mono font-bold">{successPoNo}</span> has
              been created in DRAFT status.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <Link
                href={`/procurement/purchase-orders/${successPoNo}`}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                View PO
              </Link>
              <button
                onClick={onCreated}
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto px-6 py-4">
            {/* Error */}
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Supplier */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Supplier <span className="text-destructive">*</span>
              </label>
              {suppliersLoading ? (
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                  Loading suppliers...
                </div>
              ) : (
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                >
                  <option value="">Select a supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Destination Location */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Destination Location <span className="text-destructive">*</span>
              </label>
              <select
                value={selectedDestinationId}
                onChange={(e) => setSelectedDestinationId(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              >
                <option value="">Select destination...</option>
                {validLocations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name} ({l.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Expected Delivery */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Expected Delivery Date
              </label>
              <input
                type="date"
                value={expectedDelivery}
                onChange={(e) => setExpectedDelivery(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>

            {/* Notes */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes..."
                rows={2}
                maxLength={1000}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>

            {/* Line Items */}
            <div className="mb-4">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Line Items <span className="text-destructive">*</span>
              </label>

              {/* Product search */}
              <div className="relative mb-2">
                <input
                  ref={searchRef}
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products to add..."
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                />
                {searchLoading && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                  </div>
                )}
                {showDropdown && productResults.length > 0 && (
                  <div
                    ref={dropdownRef}
                    className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
                  >
                    {productResults.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p)}
                        disabled={lines.some((l) => l.productId === p.id)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-40"
                      >
                        <div>
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {p.sku}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          ₱{p.unitPrice}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Lines table */}
              {lines.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th scope="col" className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase text-muted-foreground">
                          Product
                        </th>
                        <th scope="col" className="w-20 px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
                          Qty
                        </th>
                        <th scope="col" className="w-28 px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
                          Unit Cost
                        </th>
                        <th scope="col" className="w-24 px-2 py-1.5 text-right text-[10px] font-semibold uppercase text-muted-foreground">
                          Line Total
                        </th>
                        <th scope="col" className="w-10 px-2 py-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, i) => (
                        <tr
                          key={line.productId}
                          className="border-b border-border last:border-b-0"
                        >
                          <td className="px-2 py-1.5">
                            <div className="text-sm font-medium">
                              {line.productName}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {line.sku}
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="number"
                              min={1}
                              value={line.orderedQty}
                              onChange={(e) =>
                                updateLine(i, "orderedQty", e.target.value)
                              }
                              className="w-16 rounded border border-border bg-background px-1.5 py-1 text-right text-sm font-mono outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <input
                              type="text"
                              value={line.unitCost}
                              onChange={(e) =>
                                updateLine(i, "unitCost", e.target.value)
                              }
                              className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right text-sm font-mono outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono text-sm">
                            ₱
                            {(
                              line.orderedQty * (parseFloat(line.unitCost) || 0)
                            ).toFixed(2)}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button
                              onClick={() => removeLine(i)}
                              className="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Total */}
                  <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      {lines.length} item{lines.length !== 1 ? "s" : ""} ·{" "}
                      {lines.reduce((sum, l) => sum + l.orderedQty, 0)} units
                    </span>
                    <span className="text-sm font-semibold">
                      Total: ₱
                      {lines
                        .reduce(
                          (sum, l) =>
                            sum + l.orderedQty * (parseFloat(l.unitCost) || 0),
                          0,
                        )
                        .toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {lines.length === 0 && (
                <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                  Search and add products above to create PO line items.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {!successPoNo && (
          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-3">
            <button
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              {submitting ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Creating...
                </span>
              ) : (
                "Create PO (Draft)"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
