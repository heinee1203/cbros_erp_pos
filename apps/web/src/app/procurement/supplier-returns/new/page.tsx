"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { useSuppliers, type SupplierRow } from "@/hooks/use-suppliers";
import { useLocations } from "@/hooks/use-locations";
import { useProductSearch, type ProductSearchResult } from "@/hooks/use-product-search";
import { useCreateSupplierReturn } from "@/hooks/use-supplier-returns";
import { fmtPeso } from "@/lib/format";
import { apiFetch } from "@/lib/api";

// ── Types ──

interface RTVLineInput {
  localId: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  costPerUnit: string;
  condition: string;
  notes: string;
}

interface POOption {
  id: string;
  poNo: string;
}

const REASON_OPTIONS = [
  { value: "", label: "Select reason..." },
  { value: "DEFECTIVE", label: "Defective" },
  { value: "DAMAGED_ON_DELIVERY", label: "Damaged on Delivery" },
  { value: "WRONG_ITEM", label: "Wrong Item" },
  { value: "OVERSHIPMENT", label: "Overshipment" },
  { value: "WARRANTY", label: "Warranty" },
  { value: "EXPIRED", label: "Expired" },
  { value: "OTHER", label: "Other" },
];

const CONDITION_OPTIONS = [
  { value: "DEFECTIVE", label: "Defective" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "GOOD", label: "Good" },
  { value: "EXPIRED", label: "Expired" },
  { value: "OTHER", label: "Other" },
];

// ── Page ──

export default function NewSupplierReturnPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token, locationId, loading: authLoading } = useAuth();

  // ── Data hooks ──
  const suppliersQuery = useSuppliers(token, locationId);
  const locationsQuery = useLocations(token);
  const createMutation = useCreateSupplierReturn(token, locationId);

  const suppliers = suppliersQuery.data?.data ?? [];
  const locations = useMemo(
    () => (locationsQuery.data?.data ?? []).filter((l) => l.type !== "TRANSIT_BUFFER"),
    [locationsQuery.data],
  );

  // ── Form state ──
  const [supplierId, setSupplierId] = useState(searchParams.get("supplierId") || "");
  const [returnLocationId, setReturnLocationId] = useState("");
  const [reason, setReason] = useState("");
  const [sourcePOId, setSourcePOId] = useState(searchParams.get("poId") || "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<RTVLineInput[]>([]);

  // ── PO search for supplier ──
  const [poOptions, setPOOptions] = useState<POOption[]>([]);
  const [poSearch, setPOSearch] = useState("");

  useEffect(() => {
    if (!token || !locationId || !supplierId) {
      setPOOptions([]);
      return;
    }
    apiFetch<{ data: POOption[] }>(
      `/procurement/purchase-orders?supplierId=${supplierId}&limit=20`,
      { token, locationId },
    )
      .then((res) => setPOOptions(res.data))
      .catch(() => setPOOptions([]));
  }, [token, locationId, supplierId]);

  // Auto-set location to current
  useEffect(() => {
    if (locationId && !returnLocationId) {
      setReturnLocationId(locationId);
    }
  }, [locationId, returnLocationId]);

  // ── Product search ──
  const [productQuery, setProductQuery] = useState("");
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const productSearch = useProductSearch(token, locationId, productQuery);
  const productResults = productSearch.data?.data ?? [];

  function addProduct(product: ProductSearchResult) {
    if (lines.some((l) => l.productId === product.id)) return;
    setLines((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        quantity: 1,
        costPerUnit: product.costPrice,
        condition: "DEFECTIVE",
        notes: "",
      },
    ]);
    setProductQuery("");
    setShowProductDropdown(false);
  }

  function updateLine(localId: string, field: keyof RTVLineInput, value: string | number) {
    setLines((prev) =>
      prev.map((l) => (l.localId === localId ? { ...l, [field]: value } : l)),
    );
  }

  function removeLine(localId: string) {
    setLines((prev) => prev.filter((l) => l.localId !== localId));
  }

  const runningTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.quantity * parseFloat(l.costPerUnit || "0"), 0),
    [lines],
  );

  // ── Validation ──
  const canSubmit = !!supplierId && !!returnLocationId && !!reason && lines.length > 0 && !createMutation.isPending;

  function handleCreate() {
    createMutation.mutate(
      {
        supplierId,
        locationId: returnLocationId,
        reason,
        sourcePOId: sourcePOId || undefined,
        notes: notes || undefined,
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          costPerUnit: l.costPerUnit,
          condition: l.condition,
          notes: l.notes || undefined,
        })),
      },
      {
        onSuccess: (data) => {
          router.push(`/procurement/supplier-returns/${data.id}`);
        },
      },
    );
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6">
      {/* Header */}
      <div>
        <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Link href="/procurement/supplier-returns" className="hover:text-foreground hover:underline">
            Supplier Returns
          </Link>
          <span>/</span>
          <span className="text-foreground">New RTV</span>
        </div>
        <h2 className="text-lg font-semibold">Create Supplier Return</h2>
        <p className="text-sm text-muted-foreground">Return items to a supplier for credit or replacement</p>
      </div>

      {/* Error */}
      {createMutation.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {(createMutation.error as Error)?.message || "Failed to create RTV"}
        </div>
      )}

      {/* Form */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column — Details */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="mb-3 text-sm font-semibold">Return Details</h3>
            <div className="flex flex-col gap-3">
              {/* Supplier */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Supplier <span className="text-destructive">*</span>
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => {
                    setSupplierId(e.target.value);
                    setSourcePOId("");
                  }}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select supplier...</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Return From Location */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Return From <span className="text-destructive">*</span>
                </label>
                <select
                  value={returnLocationId}
                  onChange={(e) => setReturnLocationId(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select location...</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* Reason */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Reason <span className="text-destructive">*</span>
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {REASON_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Source PO */}
              {supplierId && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Source PO (optional)</label>
                  <select
                    value={sourcePOId}
                    onChange={(e) => setSourcePOId(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  >
                    <option value="">None</option>
                    {poOptions.map((po) => (
                      <option key={po.id} value={po.id}>
                        {po.poNo}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-muted-foreground">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional notes about this return..."
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  rows={3}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column — Line Items */}
        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="mb-3 text-sm font-semibold">Items to Return</h3>

            {/* Product Search */}
            <div className="relative mb-3">
              <input
                type="text"
                value={productQuery}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  setShowProductDropdown(true);
                }}
                onFocus={() => setShowProductDropdown(true)}
                placeholder="Search products by name or SKU..."
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {showProductDropdown && productQuery.length >= 2 && productResults.length > 0 && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-background shadow-lg">
                  {productResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <div>
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{p.sku}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{fmtPeso(p.costPrice)}</span>
                    </button>
                  ))}
                </div>
              )}
              {showProductDropdown && productQuery.length >= 2 && productResults.length === 0 && !productSearch.isLoading && (
                <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-background p-3 text-center text-sm text-muted-foreground shadow-lg">
                  No products found
                </div>
              )}
            </div>

            {/* Lines */}
            {lines.length === 0 ? (
              <div className="rounded-md border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                Search and add products above
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {lines.map((line) => (
                  <div key={line.localId} className="rounded-md border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{line.productName}</p>
                        <p className="font-mono text-xs text-muted-foreground">{line.sku}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(line.localId)}
                        className="shrink-0 text-xs text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Qty</label>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => updateLine(line.localId, "quantity", parseInt(e.target.value) || 1)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Cost/Unit</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.costPerUnit}
                          onChange={(e) => updateLine(line.localId, "costPerUnit", e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Condition</label>
                        <select
                          value={line.condition}
                          onChange={(e) => updateLine(line.localId, "condition", e.target.value)}
                          className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                        >
                          {CONDITION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Line Total</label>
                        <p className="mt-1.5 text-sm font-medium">
                          {fmtPeso(line.quantity * parseFloat(line.costPerUnit || "0"))}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="text-[10px] text-muted-foreground">Notes</label>
                      <input
                        type="text"
                        value={line.notes}
                        onChange={(e) => updateLine(line.localId, "notes", e.target.value)}
                        placeholder="Optional notes for this item..."
                        className="mt-0.5 w-full rounded border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Running Total */}
            {lines.length > 0 && (
              <div className="mt-3 flex items-center justify-between rounded-md bg-muted/50 px-3 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {lines.length} item{lines.length !== 1 ? "s" : ""}
                </span>
                <span className="text-sm font-bold">{fmtPeso(runningTotal)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <Link
          href="/procurement/supplier-returns"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancel
        </Link>
        <button
          onClick={handleCreate}
          disabled={!canSubmit}
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating..." : "Create RTV"}
        </button>
      </div>
    </div>
  );
}
