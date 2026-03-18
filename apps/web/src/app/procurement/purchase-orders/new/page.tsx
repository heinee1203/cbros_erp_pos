"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { useSuppliers, type SupplierRow } from "@/hooks/use-suppliers";
import { useLocations } from "@/hooks/use-locations";
import { fmtPeso } from "@/lib/format";

// ── Types ──

interface ProductSearchResult {
  id: string;
  name: string;
  sku: string;
  mnemonicSku: string;
  costPrice: string;
  barcode: string | null;
  categoryName?: string;
  unitsPerCase?: number;
  packagingUnit?: string | null;
}

interface POLineInput {
  localId: string;
  productId: string;
  productName: string;
  sku: string;
  orderedQty: number;
  listPrice: string;
  discountChain: string;
  netCost: string;
  isManualCost: boolean;
  unitsPerCase: number;
  packagingUnit: string | null;
  entryUnit: "piece" | "case";
}

interface CSVPreviewRow {
  sku: string;
  qty: number;
  listPrice: string;
  discount: string;
  match: ProductSearchResult | null;
  status: "matched" | "not_found" | "searching";
}

// ── Helpers ──

function calculateNetCost(listPrice: number, discountChain: string): number {
  if (!listPrice || listPrice <= 0) return 0;
  const discounts = discountChain
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((d) => !isNaN(d) && d > 0 && d < 100);
  let net = listPrice;
  for (const discount of discounts) {
    net = net * (1 - discount / 100);
  }
  return Math.round(net * 100) / 100;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ══════════════════════════════════════════════════════════
// New Purchase Order Page
// ══════════════════════════════════════════════════════════

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, locationId, loading: authLoading } = useAuth();

  // ── Data hooks ──
  const suppliersQuery = useSuppliers(token, locationId);
  const locationsQuery = useLocations(token);

  const suppliers = suppliersQuery.data?.data ?? [];
  const locations = locationsQuery.data?.data ?? [];
  const validLocations = useMemo(
    () => locations.filter((l) => l.type !== "TRANSIT_BUFFER"),
    [locations],
  );

  // ── Order details state ──
  const [supplierId, setSupplierId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [notes, setNotes] = useState("");

  // Auto-set destination to current location
  useEffect(() => {
    if (locationId && !destinationId) {
      const match = validLocations.find((l) => l.id === locationId);
      if (match) setDestinationId(locationId);
    }
  }, [locationId, destinationId, validLocations]);

  // ── Inline supplier creation ──
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({
    name: "",
    mnemonicCode: "",
    contactEmail: "",
    contactPhone: "",
  });
  const [supplierSaving, setSupplierSaving] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // ── Line items state ──
  const [lines, setLines] = useState<POLineInput[]>([]);

  // ── Product search ──
  const [productSearch, setProductSearch] = useState("");
  const [productResults, setProductResults] = useState<ProductSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── CSV state ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<CSVPreviewRow[]>([]);
  const [showCSVModal, setShowCSVModal] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  // ── Submit state ──
  const [submitting, setSubmitting] = useState(false);
  const [submitAction, setSubmitAction] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    const existing = lines.find((l) => l.productId === product.id);
    if (existing) {
      // Increment qty for duplicate
      setLines((prev) =>
        prev.map((l) =>
          l.productId === product.id
            ? { ...l, orderedQty: l.orderedQty + 1 }
            : l,
        ),
      );
    } else {
      const costPrice = product.costPrice || "0.00";
      setLines((prev) => [
        ...prev,
        {
          localId: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          orderedQty: 1,
          listPrice: costPrice,
          discountChain: "",
          netCost: costPrice,
          isManualCost: false,
          unitsPerCase: product.unitsPerCase ?? 1,
          packagingUnit: product.packagingUnit ?? null,
          entryUnit: (product.unitsPerCase ?? 1) > 1 ? "case" : "piece",
        },
      ]);
    }
    setProductSearch("");
    setShowDropdown(false);
    searchRef.current?.focus();
  };

  // ── Update line field ──
  const updateLine = (
    localId: string,
    field: keyof POLineInput,
    value: string | number | boolean,
  ) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.localId !== localId) return l;
        const updated = { ...l, [field]: value };

        if (field === "orderedQty") {
          updated.orderedQty = Math.max(1, parseInt(String(value)) || 1);
        }

        if (field === "listPrice") {
          updated.listPrice = String(value);
          if (!updated.isManualCost) {
            const lp = parseFloat(String(value)) || 0;
            updated.netCost = String(
              calculateNetCost(lp, updated.discountChain) || value,
            );
          }
        }

        if (field === "discountChain") {
          updated.discountChain = String(value);
          const lp = parseFloat(updated.listPrice) || 0;
          const chain = String(value).trim();
          if (chain) {
            updated.netCost = String(calculateNetCost(lp, chain));
            updated.isManualCost = false;
          } else {
            // No discount: net cost = list price (unless manual)
            if (!updated.isManualCost) {
              updated.netCost = updated.listPrice;
            }
          }
        }

        if (field === "netCost") {
          // Only allow manual edit when discount is empty
          if (!updated.discountChain.trim()) {
            updated.netCost = String(value);
            updated.isManualCost = true;
          }
        }

        return updated;
      }),
    );
  };

  // ── Remove line ──
  const removeLine = (localId: string) => {
    setLines((prev) => prev.filter((l) => l.localId !== localId));
  };

  // ── Grand total ──
  const grandTotal = useMemo(
    () =>
      lines.reduce(
        (sum, l) => sum + l.orderedQty * (parseFloat(l.netCost) || 0),
        0,
      ),
    [lines],
  );

  // ── Can save? ──
  const canSave =
    !!supplierId &&
    !!destinationId &&
    lines.length > 0 &&
    lines.every(
      (l) => l.orderedQty > 0 && parseFloat(l.netCost) > 0,
    );

  // ── Inline supplier creation ──
  const handleCreateSupplier = async () => {
    if (!newSupplierForm.name.trim()) return;
    setSupplierSaving(true);
    setSupplierError(null);
    try {
      const res = await apiFetch<{ data: SupplierRow }>("/procurement/suppliers", {
        method: "POST",
        body: JSON.stringify({
          name: newSupplierForm.name.trim(),
          mnemonicCode: newSupplierForm.mnemonicCode.trim() || undefined,
          contactEmail: newSupplierForm.contactEmail.trim() || undefined,
          contactPhone: newSupplierForm.contactPhone.trim() || undefined,
        }),
        token,
        locationId,
      });
      // Invalidate supplier cache and auto-select
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setSupplierId(res.data.id);
      setShowNewSupplier(false);
      setNewSupplierForm({ name: "", mnemonicCode: "", contactEmail: "", contactPhone: "" });
    } catch (err: any) {
      setSupplierError(err.message || "Failed to create supplier");
    } finally {
      setSupplierSaving(false);
    }
  };

  // ── Save / Submit ──
  const handleSave = async (action: "draft" | "submit") => {
    if (!canSave) return;
    setSubmitting(true);
    setSubmitAction(action);
    setError(null);

    try {
      const body = {
        supplierId,
        destinationLocationId: destinationId,
        expectedDeliveryDate: expectedDelivery
          ? new Date(expectedDelivery).toISOString()
          : undefined,
        notes: notes.trim() || undefined,
        lines: lines.map((l) => {
          const actualQty = l.entryUnit === "case" ? l.orderedQty * l.unitsPerCase : l.orderedQty;
          const actualUnitCost = l.entryUnit === "case"
            ? String((parseFloat(l.netCost) / l.unitsPerCase).toFixed(2))
            : l.netCost;
          const actualListPrice = l.entryUnit === "case" && l.listPrice
            ? String((parseFloat(l.listPrice) / l.unitsPerCase).toFixed(2))
            : l.listPrice;
          return {
            productId: l.productId,
            orderedQty: actualQty,
            unitCost: actualUnitCost,
            listPrice: actualListPrice,
            discountChain: l.discountChain || undefined,
          };
        }),
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

      if (action === "submit") {
        // Immediately submit after creating
        await apiFetch(
          `/procurement/purchase-orders/${result.po.id}/submit`,
          {
            method: "POST",
            body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
            token,
            locationId,
          },
        );
      }

      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      router.push(`/procurement/purchase-orders/${result.po.poNo}`);
    } catch (err: any) {
      setError(err.message || "Failed to create purchase order");
    } finally {
      setSubmitting(false);
      setSubmitAction(null);
    }
  };

  // ── CSV Import ──
  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset file input so same file can be re-uploaded
    e.target.value = "";
    setCsvError(null);

    const text = await file.text();
    const rows = text.split("\n").map((row) =>
      row.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")),
    );
    if (rows.length < 2) {
      setCsvError("CSV must have at least a header row and one data row.");
      return;
    }

    const header = rows[0].map((h) =>
      h.toLowerCase().replace(/[^a-z0-9]/g, ""),
    );
    const skuIdx = header.findIndex((h) =>
      ["sku", "productsku", "itemsku", "barcode"].includes(h),
    );
    const qtyIdx = header.findIndex((h) =>
      ["qty", "quantity", "orderedqty", "order"].includes(h),
    );
    const costIdx = header.findIndex((h) =>
      ["cost", "unitcost", "price", "purchasecost", "listprice"].includes(h),
    );
    const discountIdx = header.findIndex((h) =>
      ["discount", "discountchain", "less"].includes(h),
    );

    if (skuIdx === -1) {
      setCsvError("CSV must have a SKU column (sku, productsku, itemsku, or barcode).");
      return;
    }

    const dataRows = rows.slice(1).filter((r) => r.length > skuIdx && r[skuIdx].trim());
    if (dataRows.length === 0) {
      setCsvError("No data rows found in CSV.");
      return;
    }

    // Parse rows into preview format
    const preview: CSVPreviewRow[] = dataRows.map((r) => ({
      sku: r[skuIdx].trim(),
      qty: qtyIdx >= 0 ? Math.max(1, parseInt(r[qtyIdx]) || 1) : 1,
      listPrice: costIdx >= 0 ? r[costIdx].trim() || "0" : "0",
      discount:
        discountIdx >= 0
          ? r[discountIdx]
              .trim()
              .replace(/\//g, ", ")
          : "",
      match: null,
      status: "searching",
    }));

    setCsvPreview(preview);
    setShowCSVModal(true);

    // Look up each SKU
    for (let i = 0; i < preview.length; i++) {
      try {
        const res = await apiFetch<{ data: ProductSearchResult[] }>(
          `/products?search=${encodeURIComponent(preview[i].sku)}&limit=5`,
          { token, locationId },
        );
        const exactMatch = res.data.find(
          (p) =>
            p.sku === preview[i].sku ||
            p.barcode === preview[i].sku ||
            p.mnemonicSku === preview[i].sku,
        );
        setCsvPreview((prev) =>
          prev.map((row, idx) =>
            idx === i
              ? {
                  ...row,
                  match: exactMatch || null,
                  status: exactMatch ? "matched" : "not_found",
                }
              : row,
          ),
        );
      } catch {
        setCsvPreview((prev) =>
          prev.map((row, idx) =>
            idx === i ? { ...row, status: "not_found" } : row,
          ),
        );
      }
    }
  };

  const csvMatched = csvPreview.filter((r) => r.status === "matched");
  const csvNotFound = csvPreview.filter((r) => r.status === "not_found");
  const csvSearching = csvPreview.some((r) => r.status === "searching");

  const handleCSVImport = () => {
    for (const row of csvMatched) {
      if (!row.match) continue;
      const product = row.match;
      const existing = lines.find((l) => l.productId === product.id);
      if (existing) {
        // Increment qty
        setLines((prev) =>
          prev.map((l) =>
            l.productId === product.id
              ? { ...l, orderedQty: l.orderedQty + row.qty }
              : l,
          ),
        );
      } else {
        const lp = row.listPrice && parseFloat(row.listPrice) > 0
          ? row.listPrice
          : product.costPrice || "0.00";
        const disc = row.discount || "";
        const net = disc
          ? String(calculateNetCost(parseFloat(lp), disc))
          : lp;
        setLines((prev) => [
          ...prev,
          {
            localId: crypto.randomUUID(),
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            orderedQty: row.qty,
            listPrice: lp,
            discountChain: disc,
            netCost: net,
            isManualCost: false,
            unitsPerCase: product.unitsPerCase ?? 1,
            packagingUnit: product.packagingUnit ?? null,
            entryUnit: "piece" as const,
          },
        ]);
      }
    }
    setShowCSVModal(false);
    setCsvPreview([]);
  };

  const handleDownloadPOTemplate = () => {
    const headers = "SKU,Qty,List Price,Discount,Notes";
    const sample1 = 'SDG-30003,10,26500,"20,5,3",Sample with chain discount';
    const sample2 = "DB-1390,20,1550,15,Sample with single discount";
    const sample3 = "14624134,5,3400,,Sample with no discount";
    const csv = `\ufeff${headers}\n${sample1}\n${sample2}\n${sample3}\n`;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "apex-po-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Loading state ──
  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Back link + title */}
      <div className="mb-4">
        <Link
          href="/procurement/purchase-orders"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Purchase Orders
        </Link>
        <h2 className="text-lg font-semibold">New Purchase Order</h2>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* ORDER DETAILS card */}
      <div className="mb-4 rounded-lg border border-border bg-background p-4">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Order Details
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Supplier */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Supplier <span className="text-destructive">*</span>
            </label>
            <div className="flex items-center gap-2">
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              >
                <option value="">Select a supplier...</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.mnemonicCode ? `[${s.mnemonicCode}] ` : ""}
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowNewSupplier(!showNewSupplier)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                title="Add new supplier"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          {/* Destination */}
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Destination <span className="text-destructive">*</span>
            </label>
            <select
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
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

          {/* Expected delivery */}
          <div>
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
          <div>
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
        </div>

        {/* Inline new supplier form */}
        {showNewSupplier && (
          <div className="mt-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
            <h4 className="mb-2 text-xs font-semibold text-primary">New Supplier</h4>
            {supplierError && (
              <div className="mb-2 rounded border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
                {supplierError}
              </div>
            )}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Supplier name *"
                value={newSupplierForm.name}
                onChange={(e) =>
                  setNewSupplierForm((f) => ({ ...f, name: e.target.value }))
                }
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
              <input
                type="text"
                placeholder="Code (2 chars)"
                value={newSupplierForm.mnemonicCode}
                onChange={(e) =>
                  setNewSupplierForm((f) => ({
                    ...f,
                    mnemonicCode: e.target.value.toUpperCase().slice(0, 2),
                  }))
                }
                maxLength={2}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
              <input
                type="email"
                placeholder="Email"
                value={newSupplierForm.contactEmail}
                onChange={(e) =>
                  setNewSupplierForm((f) => ({ ...f, contactEmail: e.target.value }))
                }
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
              <input
                type="tel"
                placeholder="Phone"
                value={newSupplierForm.contactPhone}
                onChange={(e) =>
                  setNewSupplierForm((f) => ({ ...f, contactPhone: e.target.value }))
                }
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
              />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={handleCreateSupplier}
                disabled={!newSupplierForm.name.trim() || supplierSaving}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
              >
                {supplierSaving ? "Saving..." : "Add & Select"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewSupplier(false);
                  setSupplierError(null);
                }}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* LINE ITEMS card */}
      <div className="mb-4 flex-1 rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Line Items
          </h3>
        </div>

        {/* Product search + CSV import */}
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products to add..."
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
            {searchLoading && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              </div>
            )}
            {showDropdown && productResults.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-background shadow-lg"
              >
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addProduct(p)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <div>
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {p.sku}
                      </span>
                      {p.categoryName && (
                        <span className="ml-2 text-[10px] text-muted-foreground/70">
                          {p.categoryName}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-mono text-muted-foreground">
                      {fmtPeso(p.costPrice || "0.00")}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Import CSV
          </button>
          <button
            type="button"
            onClick={handleDownloadPOTemplate}
            className="text-xs text-primary hover:underline"
          >
            Download template
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCSVUpload}
            className="hidden"
          />
        </div>

        {csvError && (
          <div className="mb-3 rounded border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-xs text-destructive">
            {csvError}
          </div>
        )}

        {/* Lines table */}
        {lines.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th scope="col" className="w-8 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      #
                    </th>
                    <th scope="col" className="min-w-[180px] px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Item
                    </th>
                    <th scope="col" className="w-20 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Qty
                    </th>
                    <th scope="col" className="w-28 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      List Price
                    </th>
                    <th scope="col" className="w-28 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Discount
                    </th>
                    <th scope="col" className="w-28 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Net Cost
                    </th>
                    <th scope="col" className="w-28 px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Total
                    </th>
                    <th scope="col" className="w-10 px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => {
                    const lineTotal =
                      line.orderedQty * (parseFloat(line.netCost) || 0);
                    const hasDiscount = line.discountChain.trim().length > 0;
                    const isAutoCalc = hasDiscount && !line.isManualCost;

                    return (
                      <tr
                        key={line.localId}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="px-2 py-1.5 text-center text-xs text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="text-sm font-medium leading-tight">
                            {line.productName}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {line.sku}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {line.unitsPerCase > 1 ? (
                              <select
                                value={line.entryUnit}
                                onChange={(e) =>
                                  updateLine(line.localId, "entryUnit", e.target.value as "piece" | "case")
                                }
                                className="w-auto rounded border border-border px-1 py-0.5 text-xs"
                              >
                                <option value="piece">pc</option>
                                <option value="case">{line.packagingUnit || "case"} ({line.unitsPerCase}/cs)</option>
                              </select>
                            ) : (
                              <span className="text-xs text-muted-foreground">pc</span>
                            )}
                            <input
                              type="number"
                              min={1}
                              value={line.orderedQty}
                              onChange={(e) =>
                                updateLine(line.localId, "orderedQty", e.target.value)
                              }
                              className="w-16 rounded border border-border bg-background px-1.5 py-1 text-right text-sm font-mono tabular-nums outline-none focus:border-primary"
                            />
                          </div>
                          {line.entryUnit === "case" && line.unitsPerCase > 1 && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
                              = {line.orderedQty * line.unitsPerCase} pieces @ {fmtPeso((parseFloat(line.netCost) / line.unitsPerCase).toFixed(2))}/pc
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="text"
                            value={line.listPrice}
                            onChange={(e) =>
                              updateLine(line.localId, "listPrice", e.target.value)
                            }
                            className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right text-sm font-mono tabular-nums outline-none focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="text"
                            value={line.discountChain}
                            onChange={(e) =>
                              updateLine(
                                line.localId,
                                "discountChain",
                                e.target.value,
                              )
                            }
                            placeholder="e.g. 20, 5, 3"
                            className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right text-sm font-mono tabular-nums outline-none placeholder:text-muted-foreground/40 focus:border-primary"
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <div>
                            <input
                              type="text"
                              value={line.netCost}
                              onChange={(e) =>
                                updateLine(line.localId, "netCost", e.target.value)
                              }
                              readOnly={isAutoCalc}
                              className={`w-24 rounded border border-border px-1.5 py-1 text-right text-sm font-mono tabular-nums outline-none focus:border-primary ${
                                isAutoCalc
                                  ? "cursor-default bg-muted/50 text-muted-foreground"
                                  : "bg-background"
                              }`}
                            />
                            <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                              {line.isManualCost
                                ? "manual"
                                : isAutoCalc
                                  ? "auto"
                                  : ""}
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums">
                          {fmtPeso(lineTotal)}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <button
                            onClick={() => removeLine(line.localId)}
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
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Grand total footer */}
            <div className="flex items-center justify-between border-t border-border bg-muted/30 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {lines.length} item{lines.length !== 1 ? "s" : ""} ·{" "}
                {lines.reduce((sum, l) => sum + l.orderedQty, 0)} units
              </span>
              <span className="text-sm font-semibold">
                Grand Total: {fmtPeso(grandTotal)}
              </span>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Search and add products above, or import from a CSV file.
          </div>
        )}
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-border bg-background px-4 py-3">
        <Link
          href="/procurement/purchase-orders"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Cancel
        </Link>
        <button
          type="button"
          onClick={() => handleSave("draft")}
          disabled={!canSave || submitting}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-40"
        >
          {submitting && submitAction === "draft" ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
              Saving...
            </span>
          ) : (
            "Save as Draft"
          )}
        </button>
        <button
          type="button"
          onClick={() => handleSave("submit")}
          disabled={!canSave || submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {submitting && submitAction === "submit" ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Submitting...
            </span>
          ) : (
            "Submit PO"
          )}
        </button>
      </div>

      {/* CSV Preview Modal */}
      {showCSVModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-3xl rounded-xl border border-border bg-background shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="text-base font-semibold">CSV Import Preview</h3>
              <button
                onClick={() => {
                  setShowCSVModal(false);
                  setCsvPreview([]);
                }}
                className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Table */}
            <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th scope="col" className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      SKU
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Match
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Qty
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      List Price
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Discount
                    </th>
                    <th scope="col" className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((row, i) => (
                    <tr
                      key={i}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-2 py-1.5 font-mono text-xs">
                        {row.sku}
                      </td>
                      <td className="px-2 py-1.5 text-xs">
                        {row.match ? (
                          <span className="text-foreground">
                            {row.match.name}
                          </span>
                        ) : row.status === "searching" ? (
                          <span className="text-muted-foreground">
                            Searching...
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Not found
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
                        {row.qty}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
                        {row.listPrice && parseFloat(row.listPrice) > 0
                          ? formatNumber(parseFloat(row.listPrice))
                          : "--"}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs">
                        {row.discount || "--"}
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        {row.status === "matched" ? (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-success/10 text-success">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </span>
                        ) : row.status === "searching" ? (
                          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                        ) : (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-warning/10 text-warning">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-border px-6 py-3">
              <span className="text-xs text-muted-foreground">
                {csvMatched.length} matched, {csvNotFound.length} not found
                {csvSearching && " (still searching...)"}
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setShowCSVModal(false);
                    setCsvPreview([]);
                  }}
                  className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCSVImport}
                  disabled={csvMatched.length === 0 || csvSearching}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  Import {csvMatched.length} Matched Item
                  {csvMatched.length !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
