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

interface PendingReturn {
  rtvId: string;
  rtvNo: string;
  status: string;
  supplierId: string;
  supplierName: string;
  locationId: string;
  locationName: string;
  quantity: number;
  reason: string;
  condition: string;
  createdAt: string;
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
  const { token, locationId, apiLocationId, loading: authLoading } = useAuth();

  // ── Data hooks ──
  const suppliersQuery = useSuppliers(token, locationId);
  const locationsQuery = useLocations(token);
  const createMutation = useCreateSupplierReturn(token, locationId);

  const suppliers = suppliersQuery.data?.data ?? [];
  const locations = useMemo(
    () => (locationsQuery.data?.data ?? []).filter((l) => l.type !== "TRANSIT_BUFFER"),
    [locationsQuery.data],
  );

  // ── Edit mode ──
  const editId = searchParams.get("edit");
  const isEdit = !!editId;
  const [editLoaded, setEditLoaded] = useState(false);

  // ── Form state ──
  const [supplierId, setSupplierId] = useState(searchParams.get("supplierId") || "");
  const [returnLocationId, setReturnLocationId] = useState("");
  const [reason, setReason] = useState("");
  const [sourcePOId, setSourcePOId] = useState(searchParams.get("poId") || "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<RTVLineInput[]>([]);
  const [pendingReturnsMap, setPendingReturnsMap] = useState<Record<string, PendingReturn[]>>({});
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [matchingDraft, setMatchingDraft] = useState<{ id: string; rtvNo: string; supplierName: string; locationName: string; lineCount: number; totalCost: string } | null>(null);
  const [draftDismissed, setDraftDismissed] = useState(false);

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

  // Auto-set location to current (use apiLocationId to avoid "ALL" sentinel)
  useEffect(() => {
    if (!returnLocationId && locations.length > 0) {
      const realId = locationId === "ALL" ? apiLocationId : locationId;
      if (realId && locations.find((l) => l.id === realId)) {
        setReturnLocationId(realId);
      }
    }
  }, [locationId, apiLocationId, returnLocationId, locations]);

  // ── Check for existing draft RTVs when supplier + location change ──
  useEffect(() => {
    if (!token || !locationId || !supplierId || !returnLocationId || isEdit) {
      setMatchingDraft(null);
      return;
    }
    setDraftDismissed(false);
    apiFetch<{ data: any[] }>(
      `/procurement/supplier-returns?status=DRAFT&supplierId=${supplierId}&limit=10`,
      { token, locationId: "ALL" },
    )
      .then((res) => {
        const match = res.data?.find((r: any) => r.locationId === returnLocationId);
        setMatchingDraft(match ? {
          id: match.id,
          rtvNo: match.rtvNo,
          supplierName: match.supplierName ?? "",
          locationName: match.locationName ?? "",
          lineCount: match.lineCount ?? 0,
          totalCost: match.totalCost ?? "0",
        } : null);
      })
      .catch(() => setMatchingDraft(null));
  }, [token, locationId, supplierId, returnLocationId, isEdit]);

  // ── Load existing RTV for edit mode ──
  useEffect(() => {
    if (!editId || !token || !locationId || editLoaded) return;
    setEditLoaded(true);
    (async () => {
      try {
        const rtv = await apiFetch<any>(`/procurement/supplier-returns/${editId}`, { token, locationId });
        if (!rtv?.id) return;
        setSupplierId(rtv.supplierId);
        setReturnLocationId(rtv.locationId);
        setReason(rtv.reason ?? "");
        setSourcePOId(rtv.sourcePoId ?? "");
        setNotes(rtv.notes ?? "");
        if (rtv.lines?.length > 0) {
          setLines(rtv.lines.map((l: any) => ({
            localId: crypto.randomUUID(),
            productId: l.productId,
            productName: l.productName ?? "",
            sku: l.sku ?? "",
            quantity: l.quantity,
            costPerUnit: l.costPrice ?? l.costPerUnit ?? "0.00",
            condition: l.condition ?? "DEFECTIVE",
            notes: l.notes ?? "",
          })));
        }
      } catch {
        // Ignore — user can fill manually
      }
    })();
  }, [editId, token, locationId, editLoaded]);

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
    // Check for pending returns for this product
    if (token && locationId) {
      apiFetch<{ pendingReturns: PendingReturn[] }>(`/products/${product.id}/pending-returns`, { token, locationId })
        .then((res) => {
          if (res.pendingReturns.length > 0) {
            setPendingReturnsMap((prev) => ({ ...prev, [product.id]: res.pendingReturns }));
          }
        })
        .catch(() => {});
    }
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

  function handleSubmit() {
    if (isEdit) {
      // PATCH existing draft
      apiFetch(`/procurement/supplier-returns/${editId}`, {
        method: "PATCH",
        token,
        locationId,
        body: JSON.stringify({
          reason,
          notes: notes || undefined,
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            costPrice: l.costPerUnit,
            condition: l.condition,
            notes: l.notes || undefined,
          })),
        }),
      })
        .then(() => router.push(`/procurement/supplier-returns/${editId}`))
        .catch((err: any) => alert(err.message || "Update failed"));
    } else {
      createMutation.mutate(
        {
          supplierId,
          locationId: returnLocationId,
          reason,
          sourcePOId: sourcePOId || undefined,
          notes: notes || undefined,
          idempotencyKey: crypto.randomUUID(),
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            costPrice: l.costPerUnit,
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
        <h2 className="text-lg font-semibold">{isEdit ? "Edit Supplier Return" : "Create Supplier Return"}</h2>
        <p className="text-sm text-muted-foreground">{isEdit ? "Update draft return details" : "Return items to a supplier for credit or replacement"}</p>
      </div>

      {/* Error */}
      {createMutation.isError && (() => {
        const err = createMutation.error as any;
        const details = err?.body?.details?.fieldErrors;
        const formErrors = err?.body?.details?.formErrors;
        return (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
            <div className="font-medium">{err?.message || "Failed to create RTV"}</div>
            {details && Object.keys(details).length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {Object.entries(details).map(([field, msgs]) => (
                  <li key={field}><strong>{field}</strong>: {(msgs as string[]).join(", ")}</li>
                ))}
              </ul>
            )}
            {formErrors && (formErrors as string[]).length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs">
                {(formErrors as string[]).map((msg, i) => <li key={i}>{msg}</li>)}
              </ul>
            )}
          </div>
        );
      })()}

      {/* Existing draft banner */}
      {matchingDraft && !draftDismissed && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
          <p className="text-sm font-medium text-gray-900">
            A draft return to <strong>{matchingDraft.supplierName}</strong> from <strong>{matchingDraft.locationName}</strong> already exists:{" "}
            <strong>{matchingDraft.rtvNo}</strong> ({matchingDraft.lineCount} item{matchingDraft.lineCount !== 1 ? "s" : ""}, {"\u20B1"}{parseFloat(matchingDraft.totalCost).toLocaleString("en-PH", { minimumFractionDigits: 2 })}).
          </p>
          <p className="mt-1 text-xs text-gray-500">You can add items to it instead of creating a new one.</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => router.push(`/procurement/supplier-returns/new?edit=${matchingDraft.id}`)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Edit {matchingDraft.rtvNo}
            </button>
            <button
              type="button"
              onClick={() => setDraftDismissed(true)}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Create new RTV anyway
            </button>
          </div>
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
                    {/* Pending returns warning */}
                    {pendingReturnsMap[line.productId] && !dismissedWarnings.has(line.productId) && (() => {
                      const returns = pendingReturnsMap[line.productId];
                      const matchingDraft = returns.find((r) =>
                        r.status === "DRAFT" && r.supplierId === supplierId && r.locationId === returnLocationId
                      );
                      return matchingDraft ? (
                        <div className="mt-2 rounded border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
                          <p className="font-medium text-destructive">
                            This item is already in {matchingDraft.rtvNo} (Draft) for the same supplier and location.
                          </p>
                          <div className="mt-1.5 flex gap-2">
                            <button
                              type="button"
                              onClick={() => router.push(`/procurement/supplier-returns/new?edit=${matchingDraft.rtvId}`)}
                              className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              Edit {matchingDraft.rtvNo} instead
                            </button>
                            <button
                              type="button"
                              onClick={() => setDismissedWarnings((prev) => new Set(prev).add(line.productId))}
                              className="rounded border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                            >
                              Create new RTV anyway
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs dark:border-amber-800/30 dark:bg-amber-950/20">
                          <p className="font-medium text-amber-800 dark:text-amber-400">Pending returns for this item:</p>
                          {returns.map((r) => (
                            <div key={r.rtvId} className="mt-1 flex items-center justify-between">
                              <span className="text-amber-700 dark:text-amber-300">
                                {r.rtvNo} ({r.status}) — {r.quantity} unit(s), {r.supplierName}
                              </span>
                              <button
                                type="button"
                                onClick={() => router.push(`/procurement/supplier-returns/${r.rtvId}`)}
                                className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700"
                              >
                                View
                              </button>
                            </div>
                          ))}
                          <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-500">
                            You can still add this item if it's for a different reason or supplier.
                          </p>
                        </div>
                      );
                    })()}
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
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {createMutation.isPending ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create RTV")}
        </button>
      </div>
    </div>
  );
}
