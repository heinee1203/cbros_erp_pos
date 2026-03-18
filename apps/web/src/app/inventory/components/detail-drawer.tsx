"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  X,
  Loader2,
  Layers,
  Store,
  Minus,
  Check,
  Settings,
  Zap,
  Pencil,
  Plus,
  Maximize2,
  Trash2,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { useProductFamilies, useUpdateProduct, type ProductRow } from "@/hooks/use-products";
import { useCategories, useCreateCategory } from "@/hooks/use-categories";
import { useSubcategories, useCreateSubcategory } from "@/hooks/use-subcategories";
import { useBrands, useCreateBrand } from "@/hooks/use-brands";
import { useProductLocations, useToggleAvailability } from "@/hooks/use-product-locations";
import { useVariants, useCreateVariantBatch, useDeleteVariant } from "@/hooks/use-variants";
import {
  useProductOptions,
  useCreateOptionType,
  useDeleteOptionType,
  useAddOptionValue,
  useDeleteOptionValue,
} from "@/hooks/use-product-options";
import { useConfirm } from "@/components/confirm-dialog";
import { SelectWithQuickAdd } from "@/components/select-with-quick-add";
import { cn } from "@/lib/utils";
import { getMarginPercent, formatPrice } from "../lib/inventory-utils";

/* ─────────────────────────────────────────────
 * Detail Drawer
 * ───────────────────────────────────────────── */
export function DetailDrawer({
  product,
  showFinancials,
  onClose,
  onTransfer,
  onAdjust,
}: {
  product: ProductRow;
  showFinancials: boolean;
  onClose: () => void;
  onTransfer: () => void;
  onAdjust: () => void;
}) {
  const sell = parseFloat(product.unitPrice) || 0;
  const cost = parseFloat(product.costPrice) || 0;
  const { token, apiLocationId: locationId } = useAuth();
  const confirm = useConfirm();

  // ── Edit mode ──
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(product.name);
  const [editBarcode, setEditBarcode] = useState(product.barcode ?? "");
  const [editSellPrice, setEditSellPrice] = useState(product.unitPrice);
  const [editCostPrice, setEditCostPrice] = useState(product.costPrice);
  const [editFamilyId, setEditFamilyId] = useState(product.familyId ?? "");
  const [editCategoryId, setEditCategoryId] = useState(product.subCategoryId ?? "");
  const [editSubcategoryId, setEditSubcategoryId] = useState(product.subcategoryId ?? "");
  const [editBrandId, setEditBrandId] = useState(product.brandId ?? "");
  const [editReorderPoint, setEditReorderPoint] = useState(String(product.reorderPoint));

  // Reset edit fields when product changes
  useEffect(() => {
    setEditName(product.name);
    setEditBarcode(product.barcode ?? "");
    setEditSellPrice(product.unitPrice);
    setEditCostPrice(product.costPrice);
    setEditFamilyId(product.familyId ?? "");
    setEditCategoryId(product.subCategoryId ?? "");
    setEditSubcategoryId(product.subcategoryId ?? "");
    setEditBrandId(product.brandId ?? "");
    setEditReorderPoint(String(product.reorderPoint));
    setEditing(false);
  }, [product.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Taxonomy data for dropdowns
  const { data: familiesData } = useProductFamilies(token, locationId);
  const families = familiesData?.data ?? [];
  const { data: catsData } = useCategories(token, locationId, { activeOnly: true });
  const allCategories = catsData?.data ?? [];
  const filteredCategories = editFamilyId
    ? allCategories.filter((c) => c.familyId === editFamilyId)
    : allCategories;
  const { data: subsData } = useSubcategories(token, locationId, editCategoryId || undefined);
  const filteredSubcategories = subsData?.data ?? [];
  const { data: brandsData } = useBrands(token, locationId);
  const allBrands = brandsData?.data ?? [];
  const detailCreateBrand = useCreateBrand(token, locationId);
  const detailCreateCategory = useCreateCategory(token, locationId);
  const detailCreateSubcategory = useCreateSubcategory(token, locationId);

  // Cascading resets
  const handleFamilyChange = useCallback((val: string) => {
    setEditFamilyId(val);
    setEditCategoryId("");
    setEditSubcategoryId("");
  }, []);

  const handleCategoryChange = useCallback((val: string) => {
    setEditCategoryId(val);
    setEditSubcategoryId("");
  }, []);

  // Update product mutation
  const updateMut = useUpdateProduct(token, locationId);

  // Edit dirty check
  const isEditDirty = useMemo(() => {
    if (!editing) return false;
    return (
      editName !== product.name ||
      editBarcode !== (product.barcode ?? "") ||
      editSellPrice !== product.unitPrice ||
      editCostPrice !== product.costPrice ||
      editFamilyId !== (product.familyId ?? "") ||
      editCategoryId !== (product.subCategoryId ?? "") ||
      editSubcategoryId !== (product.subcategoryId ?? "") ||
      editBrandId !== (product.brandId ?? "") ||
      editReorderPoint !== String(product.reorderPoint)
    );
  }, [editing, editName, editBarcode, editSellPrice, editCostPrice, editFamilyId, editCategoryId, editSubcategoryId, editBrandId, editReorderPoint, product]);

  // Margin auto-calculation for edit mode
  const editSell = parseFloat(editSellPrice) || 0;
  const editCost = parseFloat(editCostPrice) || 0;
  const editMargin = getMarginPercent(editSell, editCost);

  // Save product edits
  const handleEditSave = useCallback(async () => {
    const payload: Record<string, any> = { id: product.id };
    if (editName !== product.name) payload.name = editName;
    if (editSellPrice !== product.unitPrice) payload.unitPrice = editSellPrice;
    if (editCostPrice !== product.costPrice) payload.costPrice = editCostPrice;
    if (editBarcode !== (product.barcode ?? "")) payload.barcode = editBarcode || undefined;
    if (editFamilyId !== (product.familyId ?? "")) payload.familyId = editFamilyId || null;
    if (editCategoryId !== (product.subCategoryId ?? "")) payload.categoryId = editCategoryId || null;
    if (editSubcategoryId !== (product.subcategoryId ?? "")) payload.subcategoryId = editSubcategoryId || null;
    if (editBrandId !== (product.brandId ?? "")) payload.brandId = editBrandId || null;
    const rp = parseInt(editReorderPoint, 10);
    if (!isNaN(rp) && rp !== product.reorderPoint) payload.reorderPoint = rp;

    try {
      await updateMut.mutateAsync(payload as any);
      setEditing(false);
    } catch {
      // error handled by mutation state
    }
  }, [product, editName, editSellPrice, editCostPrice, editBarcode, editFamilyId, editCategoryId, editSubcategoryId, editBrandId, editReorderPoint, updateMut]);

  const handleEditDiscard = useCallback(() => {
    setEditName(product.name);
    setEditBarcode(product.barcode ?? "");
    setEditSellPrice(product.unitPrice);
    setEditCostPrice(product.costPrice);
    setEditFamilyId(product.familyId ?? "");
    setEditCategoryId(product.subCategoryId ?? "");
    setEditSubcategoryId(product.subcategoryId ?? "");
    setEditBrandId(product.brandId ?? "");
    setEditReorderPoint(String(product.reorderPoint));
    setEditing(false);
  }, [product]);

  // ── Stores / availability ──
  const { data: locData, isLoading: locLoading } = useProductLocations(token, locationId, product.id);
  const toggleMutation = useToggleAvailability(token, locationId);
  const locationRows = locData?.data ?? [];

  // ── Batch save: local state tracking ──
  const [originalAvailability, setOriginalAvailability] = useState<Record<string, boolean>>({});
  const [localAvailability, setLocalAvailability] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Build a stable fingerprint from location data to detect real changes
  const locFingerprint = useMemo(
    () => locationRows.map((r) => `${r.locationId}:${r.availableForSale}`).join(","),
    [locationRows],
  );

  // Sync local state when server data loads (keyed on stable fingerprint)
  useEffect(() => {
    if (locationRows.length === 0) return;
    const map: Record<string, boolean> = {};
    for (const row of locationRows) {
      map[row.locationId] = row.availableForSale;
    }
    setOriginalAvailability(map);
    setLocalAvailability(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locFingerprint]);

  // Dirty check (availability)
  const isAvailDirty = useMemo(() => {
    return Object.keys(localAvailability).some(
      (locId) => localAvailability[locId] !== originalAvailability[locId],
    );
  }, [localAvailability, originalAvailability]);

  // Combined dirty state
  const isDirty = isEditDirty || isAvailDirty;

  // Derived checkbox states from local state
  const allChecked = locationRows.length > 0 && locationRows.every((r) => localAvailability[r.locationId]);
  const noneChecked = locationRows.length > 0 && locationRows.every((r) => !localAvailability[r.locationId]);
  const isMasterIndeterminate = !allChecked && !noneChecked;

  // Toggle updates local state only
  const handleToggle = useCallback((locId: string) => {
    setLocalAvailability((prev) => ({ ...prev, [locId]: !prev[locId] }));
  }, []);

  const handleMasterToggle = useCallback(() => {
    const newValue = !allChecked;
    setLocalAvailability((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) next[key] = newValue;
      return next;
    });
  }, [allChecked]);

  // Save availability — single batch PATCH with only the diff
  const handleAvailSave = useCallback(async () => {
    const updates = Object.entries(localAvailability)
      .filter(([locId, val]) => val !== originalAvailability[locId])
      .map(([lid, availableForSale]) => ({ locationId: lid, availableForSale }));
    if (updates.length === 0) return;

    setIsSaving(true);
    try {
      await toggleMutation.mutateAsync({ productId: product.id, updates });
      setOriginalAvailability({ ...localAvailability });
    } finally {
      setIsSaving(false);
    }
  }, [localAvailability, originalAvailability, toggleMutation, product.id]);

  // Discard availability — revert to original
  const handleAvailDiscard = useCallback(() => {
    setLocalAvailability({ ...originalAvailability });
  }, [originalAvailability]);

  // Combined save all
  const handleSaveAll = useCallback(async () => {
    if (isEditDirty) await handleEditSave();
    if (isAvailDirty) await handleAvailSave();
  }, [isEditDirty, isAvailDirty, handleEditSave, handleAvailSave]);

  // Combined discard all
  const handleDiscardAll = useCallback(() => {
    if (isEditDirty) handleEditDiscard();
    if (isAvailDirty) handleAvailDiscard();
  }, [isEditDirty, isAvailDirty, handleEditDiscard, handleAvailDiscard]);

  // Close with unsaved changes warning
  const handleClose = useCallback(async () => {
    if (isDirty) {
      const confirmed = await confirm({
        title: "Unsaved Changes",
        message: "You have unsaved changes. Discard them?",
        confirmLabel: "Discard",
        cancelLabel: "Keep Editing",
        variant: "warning",
      });
      if (!confirmed) return;
      handleDiscardAll();
    }
    onClose();
  }, [isDirty, confirm, handleDiscardAll, onClose]);

  // Input class for edit fields
  const inputCls = "h-8 w-full rounded-md border border-border bg-background px-2.5 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30";
  const selectCls = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30";

  return (
    <>
      <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] transition-opacity" onClick={handleClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-[400px] max-w-full border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h3 className="text-sm font-semibold">{editing ? "Quick Edit" : "Item Details"}</h3>
            <div className="flex items-center gap-1">
              {editing && (
                <Link
                  href={`/inventory/${product.id}/edit`}
                  onClick={async (e) => {
                    if (isDirty) {
                      e.preventDefault();
                      const ok = await confirm({
                        title: "Unsaved Changes",
                        message: "You have unsaved changes. Discard and open Full Editor?",
                        confirmLabel: "Discard & Open",
                        cancelLabel: "Keep Editing",
                        variant: "warning",
                      });
                      if (ok) {
                        handleDiscardAll();
                        window.location.href = `/inventory/${product.id}/edit`;
                      }
                    }
                  }}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Maximize2 size={12} /> Full Editor
                </Link>
              )}
              {!editing && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Pencil size={12} /> Quick Edit
                  </button>
                  <Link
                    href={`/inventory/${product.id}/edit`}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Maximize2 size={12} /> Full Edit
                  </Link>
                  <Link
                    href={`/inventory/${product.id}/history`}
                    className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Clock size={12} /> History
                  </Link>
                </div>
              )}
              <button onClick={handleClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Close drawer"><X size={16} /></button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">

            {/* Taxonomy — view mode: badges / edit mode: dropdowns */}
            {editing ? (
              <section className="mb-5 space-y-2.5">
                <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Classification</h4>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Family</label>
                  <select className={selectCls} value={editFamilyId} onChange={(e) => handleFamilyChange(e.target.value)}>
                    <option value="">— None —</option>
                    {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </div>
                <SelectWithQuickAdd
                  label="Category"
                  value={editCategoryId}
                  onChange={handleCategoryChange}
                  options={filteredCategories}
                  placeholder="— None —"
                  labelClassName="text-[11px] font-medium text-muted-foreground"
                  canAdd={!!editFamilyId}
                  onQuickAdd={async (name) => {
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                    const res: any = await detailCreateCategory.mutateAsync({ name, slug, familyId: editFamilyId || undefined });
                    return { id: res?.data?.id ?? res?.id ?? "" };
                  }}
                />
                <SelectWithQuickAdd
                  label="Sub-category"
                  value={editSubcategoryId}
                  onChange={(v) => setEditSubcategoryId(v)}
                  options={filteredSubcategories}
                  placeholder="— None —"
                  disabled={!editCategoryId}
                  labelClassName="text-[11px] font-medium text-muted-foreground"
                  canAdd={!!editCategoryId}
                  onQuickAdd={async (name) => {
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                    const res: any = await detailCreateSubcategory.mutateAsync({ categoryId: editCategoryId, name, slug });
                    return { id: res?.data?.id ?? res?.id ?? "" };
                  }}
                />
                <SelectWithQuickAdd
                  label="Brand"
                  value={editBrandId}
                  onChange={(v) => setEditBrandId(v)}
                  options={allBrands}
                  placeholder="— None —"
                  labelClassName="text-[11px] font-medium text-muted-foreground"
                  onQuickAdd={async (name) => {
                    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                    const res: any = await detailCreateBrand.mutateAsync({ name, slug });
                    return { id: res?.data?.id ?? res?.id ?? "" };
                  }}
                />
              </section>
            ) : (
              <>
                {product.familyName && (
                  <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Layers size={12} />
                    <span>Family: <span className="font-medium text-foreground">{product.familyName}</span></span>
                  </div>
                )}
                {product.subCategoryName && (
                  <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block h-3 w-3 rounded bg-muted" />
                    <span>Category: <span className="font-medium text-foreground">{product.subCategoryName}</span></span>
                  </div>
                )}
                {product.subcategoryName && (
                  <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block h-3 w-3 rounded bg-muted/60" />
                    <span>Sub-category: <span className="font-medium text-foreground">{product.subcategoryName}</span></span>
                  </div>
                )}
                {product.brandName && (
                  <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block h-3 w-3 rounded bg-muted/40" />
                    <span>Brand: <span className="font-medium text-foreground">{product.brandName}</span></span>
                  </div>
                )}
              </>
            )}

            {/* Information — edit mode: inputs / view mode: static */}
            <section className="mb-5">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Information</h4>
              {editing ? (
                <div className="space-y-2.5">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Name</label>
                    <input className={inputCls} value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">SKU</label>
                    <div className="flex h-8 items-center rounded-md border border-border bg-muted/50 px-2.5 text-sm font-mono text-muted-foreground">{product.sku}</div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Barcode</label>
                    <input className={cn(inputCls, "font-mono")} value={editBarcode} onChange={(e) => setEditBarcode(e.target.value)} placeholder="UPC / EAN / barcode" maxLength={50} />
                  </div>
                  {!product.isVariablePrice && (
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Sell Price</label>
                      <input className={inputCls} type="number" step="0.01" min="0" value={editSellPrice} onChange={(e) => setEditSellPrice(e.target.value)} />
                    </div>
                  )}
                  {showFinancials && (
                    <>
                      <div>
                        <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Cost Price</label>
                        <input className={inputCls} type="number" step="0.01" min="0" value={editCostPrice} onChange={(e) => setEditCostPrice(e.target.value)} />
                      </div>
                      <div className="flex justify-between py-0.5">
                        <span className="text-[11px] text-muted-foreground">Margin</span>
                        <span className={cn("text-sm font-medium", editMargin.value > 0 && editMargin.value < 20 ? "text-destructive" : "text-foreground")}>{editMargin.display}</span>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5 text-sm">
                  <InfoRow label="Name" value={product.name} />
                  <InfoRow label="SKU" value={product.sku} mono />
                  {product.barcode && <InfoRow label="Barcode" value={product.barcode} mono />}
                  {product.oemNumber && <InfoRow label="OEM Number" value={product.oemNumber} mono />}
                  <InfoRow label="Sell Price" value={product.isVariablePrice ? "Variable" : `\u20B1 ${formatPrice(sell)}`} />
                  {showFinancials && (
                    <>
                      <InfoRow label="Cost" value={cost > 0 ? `\u20B1 ${formatPrice(cost)}` : "\u2014"} />
                      <InfoRow label="Margin" value={getMarginPercent(sell, cost).display} />
                    </>
                  )}
                </div>
              )}
            </section>

            {/* Stock */}
            <section className="mb-5">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock</h4>
              {editing ? (
                <div className="space-y-2.5">
                  <div className="flex justify-between py-0.5">
                    <span className="text-[11px] text-muted-foreground">In Stock</span>
                    <span className="text-sm font-medium">{product.stockLevel.toLocaleString()}</span>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Reorder Point</label>
                    <input className={inputCls} type="number" min="0" step="1" value={editReorderPoint} onChange={(e) => setEditReorderPoint(e.target.value)} />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5 text-sm">
                  <InfoRow label="In Stock" value={product.stockLevel.toLocaleString()} />
                  <InfoRow label="Reorder Point" value={product.reorderPoint.toLocaleString()} />
                  <InfoRow
                    label="Status"
                    value={
                      product.stockLevel === 0
                        ? "Out of Stock"
                        : product.stockLevel <= product.reorderPoint
                          ? "Low Stock"
                          : "In Stock"
                    }
                    statusColor={
                      product.stockLevel === 0
                        ? "text-destructive"
                        : product.stockLevel <= product.reorderPoint
                          ? "text-warning"
                          : "text-success"
                    }
                  />
                </div>
              )}
            </section>

            {/* Stores — per-location availability */}
            <section className="mb-5">
              <h4 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Store size={10} className="mb-px mr-1 inline" />
                Stores
              </h4>

              {locLoading ? (
                <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                  <Loader2 size={14} className="animate-spin" /> Loading locations…
                </div>
              ) : locationRows.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No locations found.</p>
              ) : (
                <div className="space-y-0">
                  {/* Master toggle */}
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-accent/50">
                    <span
                      role="checkbox"
                      aria-checked={allChecked ? "true" : isMasterIndeterminate ? "mixed" : "false"}
                      onClick={handleMasterToggle}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        allChecked
                          ? "border-primary bg-primary text-primary-foreground"
                          : isMasterIndeterminate
                            ? "border-primary bg-primary/20 text-primary"
                            : "border-muted-foreground/40",
                      )}
                    >
                      {allChecked && <Check size={12} strokeWidth={3} />}
                      {isMasterIndeterminate && <Minus size={12} strokeWidth={3} />}
                    </span>
                    <span className="text-xs font-medium">Available for sale in all stores</span>
                  </label>

                  {/* Header row */}
                  <div className="mt-1 grid grid-cols-[20px_1fr_50px_50px_50px] items-center gap-x-2 px-1 pb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                    <span />
                    <span>Store</span>
                    <span className="text-right">Stock</span>
                    <span className="text-right">Reorder</span>
                    <span className="text-right">Optimal</span>
                  </div>

                  {/* Per-location rows */}
                  {locationRows.map((row) => {
                    const isChecked = localAvailability[row.locationId] ?? row.availableForSale;
                    const isChanged = localAvailability[row.locationId] !== originalAvailability[row.locationId];
                    return (
                      <label
                        key={row.locationId}
                        className={cn(
                          "grid cursor-pointer grid-cols-[20px_1fr_50px_50px_50px] items-center gap-x-2 rounded-md px-1 py-1 hover:bg-accent/50",
                          isChanged && "bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:ring-amber-800",
                        )}
                      >
                        <span
                          role="checkbox"
                          aria-checked={isChecked}
                          onClick={() => handleToggle(row.locationId)}
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            isChecked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/40",
                          )}
                        >
                          {isChecked && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span className="truncate text-xs">{row.locationName}</span>
                        <span className="text-right font-mono text-xs tabular-nums">{row.stockLevel}</span>
                        <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">{row.reorderPoint}</span>
                        <span className="text-right font-mono text-xs tabular-nums text-muted-foreground">{row.optimalStock ?? 0}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Option Types & Variants — only for parent products */}
            {product.isParent && (
              <OptionTypesAndVariants product={product} token={token} locationId={locationId} showFinancials={showFinancials} />
            )}
          </div>

          {/* Sticky save bar — shown when any unsaved changes exist */}
          {isDirty && (
            <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDiscardAll}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Discard
                </button>
                <button
                  onClick={handleSaveAll}
                  disabled={isSaving || updateMut.isPending}
                  className="rounded-lg bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {isSaving || updateMut.isPending ? "Saving\u2026" : "Save Changes"}
                </button>
              </div>
            </div>
          )}

          {/* Error display */}
          {updateMut.isError && (
            <div className="border-t border-destructive/30 bg-destructive/5 px-4 py-2">
              <p className="text-xs text-destructive">{(updateMut.error as any)?.message ?? "Failed to update product"}</p>
            </div>
          )}

          <div className="flex gap-2 border-t border-border p-4">
            <button onClick={onTransfer} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Transfer Stock</button>
            <button onClick={onAdjust} className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Adjust Stock</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
 * Option Types & Variants (inside Detail Drawer)
 * ───────────────────────────────────────────── */
function OptionTypesAndVariants({
  product,
  token,
  locationId,
  showFinancials,
}: {
  product: ProductRow;
  token: string;
  locationId: string;
  showFinancials: boolean;
}) {
  const confirm = useConfirm();
  const [showAddOption, setShowAddOption] = useState(false);
  const [addingValueForType, setAddingValueForType] = useState<string | null>(null);
  const [newValueInput, setNewValueInput] = useState("");
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);

  // Hooks
  const optionsQuery = useProductOptions(token, locationId, product.id);
  const optionTypes = optionsQuery.data?.data ?? [];
  const variantsQuery = useVariants(token, locationId, product.id);
  const variants = variantsQuery.data?.data ?? [];
  const createOptionType = useCreateOptionType(token, locationId);
  const deleteOptionType = useDeleteOptionType(token, locationId);
  const addOptionValue = useAddOptionValue(token, locationId);
  const deleteOptionValue = useDeleteOptionValue(token, locationId);
  const createVariantBatch = useCreateVariantBatch(token, locationId);
  const deleteVariant = useDeleteVariant(token, locationId);

  const handleDeleteOptionType = async (typeId: string, typeName: string) => {
    const ok = await confirm({
      title: "Delete Option Type",
      message: `Delete "${typeName}" and all its values? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteOptionType.mutate({ productId: product.id, typeId });
  };

  const handleDeleteOptionValue = async (typeId: string, valueId: string, valueName: string) => {
    const ok = await confirm({
      title: "Delete Option Value",
      message: `Delete "${valueName}"?`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteOptionValue.mutate({ productId: product.id, typeId, valueId });
  };

  const handleAddValue = (typeId: string) => {
    const val = newValueInput.trim();
    if (!val) return;
    addOptionValue.mutate(
      { productId: product.id, typeId, value: val },
      { onSuccess: () => { setNewValueInput(""); setAddingValueForType(null); } },
    );
  };

  const handleDeleteVariant = async (variantId: string, label: string) => {
    const ok = await confirm({
      title: "Delete Variant",
      message: `Delete variant "${label}"? This cannot be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteVariant.mutate({ parentId: product.id, variantId });
  };

  // Generate all combinations
  const cartesianProduct = (arrays: string[][]): string[][] => {
    if (arrays.length === 0) return [[]];
    return arrays.reduce<string[][]>(
      (acc, arr) => acc.flatMap((combo) => arr.map((val) => [...combo, val])),
      [[]],
    );
  };

  const generateVariants = () => {
    if (optionTypes.length === 0) return;
    const valueArrays = optionTypes.map((ot) => ot.values.map((v) => v.id));
    const labelArrays = optionTypes.map((ot) => ot.values.map((v) => v.value));
    const idCombinations = cartesianProduct(valueArrays);
    const labelCombinations = cartesianProduct(labelArrays);

    const parentSku = product.sku || "ITEM";
    const newVariants = idCombinations.map((ids, i) => {
      const labels = labelCombinations[i];
      const suffix = labels.map((l) => l.slice(0, 2).toUpperCase()).join("-");
      return {
        sku: `${parentSku}-${suffix}`,
        optionValueIds: ids,
      };
    });

    createVariantBatch.mutate(
      { parentId: product.id, variants: newVariants },
      { onSuccess: () => setShowGenerateConfirm(false) },
    );
  };

  const totalCombinations = optionTypes.length > 0
    ? optionTypes.reduce((acc, ot) => acc * Math.max(ot.values.length, 1), 1)
    : 0;

  return (
    <>
      {/* ── Option Types ── */}
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Settings size={10} className="mb-px mr-1 inline" />
            Option Types
          </h4>
          <button
            onClick={() => setShowAddOption(true)}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/[0.06]"
          >
            <Plus size={11} /> Add Option
          </button>
        </div>

        {optionsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading options...
          </div>
        ) : optionTypes.length === 0 && !showAddOption ? (
          <p className="py-2 text-xs text-muted-foreground">No option types defined. Add options like Size, Color, etc.</p>
        ) : (
          <div className="space-y-3">
            {optionTypes.map((ot) => (
              <div key={ot.id} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-foreground">{ot.name}</span>
                  <button
                    onClick={() => handleDeleteOptionType(ot.id, ot.name)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <X size={12} />
                  </button>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ot.values.map((v) => (
                    <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium text-foreground border border-border">
                      {v.value}
                      <button
                        onClick={() => handleDeleteOptionValue(ot.id, v.id, v.value)}
                        className="rounded-full p-px text-muted-foreground/60 hover:text-destructive"
                      >
                        <X size={9} />
                      </button>
                    </span>
                  ))}
                </div>
                {addingValueForType === ot.id ? (
                  <div className="mt-2 flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newValueInput}
                      onChange={(e) => setNewValueInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddValue(ot.id); } if (e.key === "Escape") { setAddingValueForType(null); setNewValueInput(""); } }}
                      placeholder="Value..."
                      autoFocus
                      className="h-7 flex-1 rounded-md border border-border bg-background px-2 text-[11px] outline-none focus:border-primary/40"
                    />
                    <button
                      onClick={() => handleAddValue(ot.id)}
                      disabled={!newValueInput.trim()}
                      className="rounded-md bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground disabled:opacity-40"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setAddingValueForType(null); setNewValueInput(""); }}
                      className="text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingValueForType(ot.id); setNewValueInput(""); }}
                    className="mt-1.5 text-[10px] font-medium text-primary hover:underline"
                  >
                    + Add Value
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {showAddOption && (
          <AddOptionTypeForm
            productId={product.id}
            token={token}
            locationId={locationId}
            onClose={() => setShowAddOption(false)}
          />
        )}
      </section>

      {/* ── Variants ── */}
      <section className="mb-5">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Variants
            {variants.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium tabular-nums">
                {variants.length}
              </span>
            )}
          </h4>
          {optionTypes.length > 0 && totalCombinations > 0 && (
            <button
              onClick={() => setShowGenerateConfirm(true)}
              className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-primary hover:bg-primary/[0.06]"
            >
              <Zap size={11} /> Generate All
            </button>
          )}
        </div>

        {variantsQuery.isLoading ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 size={14} className="animate-spin" /> Loading variants...
          </div>
        ) : variants.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No variants yet. Add option types and generate combinations.</p>
        ) : (
          <div className="space-y-1">
            {variants.map((v) => {
              const optLabel = v.options.map((o) => o.value).join(" \u00B7 ");
              return (
                <div key={v.id} className="flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap gap-1 mb-0.5">
                      {v.options.map((o, i) => (
                        <span key={i} className="rounded-full bg-primary/[0.06] px-1.5 py-px text-[10px] font-medium text-primary">
                          {o.value}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="font-mono tracking-tight">{v.sku}</span>
                      <span className="tabular-nums">{formatPrice(parseFloat(v.unitPrice) || 0)}</span>
                      <span className="tabular-nums">Stock: {v.stockLevel}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteVariant(v.id, optLabel || v.sku)}
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Generate confirmation */}
        {showGenerateConfirm && (
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
            <p className="text-[12px] font-medium text-foreground">
              Generate {totalCombinations} variant SKU{totalCombinations !== 1 ? "s" : ""}?
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              This will create variants from all combinations of your option values.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                onClick={generateVariants}
                disabled={createVariantBatch.isPending}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createVariantBatch.isPending ? <Loader2 size={11} className="animate-spin" /> : <Zap size={11} />}
                {createVariantBatch.isPending ? "Generating..." : "Generate"}
              </button>
              <button
                onClick={() => setShowGenerateConfirm(false)}
                className="rounded-md px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/* ─────────────────────────────────────────────
 * Add Option Type Form (inline)
 * ───────────────────────────────────────────── */
function AddOptionTypeForm({
  productId,
  token,
  locationId,
  onClose,
}: {
  productId: string;
  token: string;
  locationId: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [valuesStr, setValuesStr] = useState("");
  const createOptionType = useCreateOptionType(token, locationId);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const values = valuesStr
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) return;
    createOptionType.mutate(
      { productId, name: trimmedName, values },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div className="mt-3 rounded-lg border border-primary/20 bg-primary/[0.04] p-3 space-y-2">
      <div>
        <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground">Option Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Size, Color"
          autoFocus
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
        />
      </div>
      <div>
        <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground">Values (comma-separated)</label>
        <input
          type="text"
          value={valuesStr}
          onChange={(e) => setValuesStr(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSave(); } }}
          placeholder="e.g. Small, Medium, Large"
          className="h-7 w-full rounded-md border border-border bg-background px-2 text-[12px] outline-none focus:border-primary/40"
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={!name.trim() || !valuesStr.trim() || createOptionType.isPending}
          className="rounded-md bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        >
          {createOptionType.isPending ? "Saving..." : "Save"}
        </button>
        <button onClick={onClose} className="text-[11px] text-muted-foreground hover:text-foreground">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * InfoRow (used in Detail Drawer)
 * ───────────────────────────────────────────── */
function InfoRow({ label, value, mono, statusColor }: { label: string; value: string; mono?: boolean; statusColor?: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn(
        "max-w-[60%] truncate text-right text-sm font-medium",
        mono && "font-mono text-[13px]",
        statusColor ?? "text-foreground",
      )}>
        {value}
      </span>
    </div>
  );
}
