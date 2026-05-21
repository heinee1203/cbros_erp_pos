"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import {
  X,
  Loader2,
  Layers,
  Store,
  Minus,
  Check,
  Pencil,
  Plus,
  Maximize2,
  Printer,
} from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { useProductFamilies, useUpdateProduct, type ProductRow } from "@/hooks/use-products";
import { useCategories, useCreateCategory } from "@/hooks/use-categories";
import { useSubcategories, useCreateSubcategory } from "@/hooks/use-subcategories";
import { useBrands, useCreateBrand } from "@/hooks/use-brands";
import { useProductLocations, useToggleAvailability } from "@/hooks/use-product-locations";
import { useConfirm } from "@/components/confirm-dialog";
import { SelectWithQuickAdd } from "@/components/select-with-quick-add";
import { cn } from "@/lib/utils";
import { getMarginPercent, formatPrice } from "../lib/inventory-utils";
import { DetailHistorySection } from "./detail-history-section";
import { DetailInfoRow } from "./detail-info-row";
import { DetailLabelPrintSection } from "./detail-label-print-section";
import { DetailOptionsVariants } from "./detail-options-variants";
import { DetailVelocitySection } from "./detail-velocity-section";

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

  // ── Print Label ──
  const [showPrintSection, setShowPrintSection] = useState(false);
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

  // ── Inline price editing (non-edit-mode quick edit) ──
  const [inlineEditField, setInlineEditField] = useState<"sell" | "cost" | null>(null);
  const [inlineEditValue, setInlineEditValue] = useState("");

  const handleInlinePriceSave = useCallback(async () => {
    if (!inlineEditField) return;
    const val = parseFloat(inlineEditValue);
    if (isNaN(val) || val < 0) { setInlineEditField(null); return; }

    const payload: Record<string, any> = { id: product.id };
    if (inlineEditField === "sell") payload.unitPrice = val.toFixed(2);
    else payload.costPrice = val.toFixed(2);

    try {
      await updateMut.mutateAsync(payload as any);
    } catch {}
    setInlineEditField(null);
  }, [inlineEditField, inlineEditValue, product.id, updateMut]);

  const handleInlinePriceKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleInlinePriceSave(); }
    if (e.key === "Escape") { setInlineEditField(null); }
  }, [handleInlinePriceSave]);

  // Live margin when inline editing
  const liveSell = inlineEditField === "sell" ? (parseFloat(inlineEditValue) || 0) : sell;
  const liveCost = inlineEditField === "cost" ? (parseFloat(inlineEditValue) || 0) : cost;
  const liveMargin = getMarginPercent(liveSell, liveCost);

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
                  <DetailInfoRow label="Name" value={product.name} />
                  <DetailInfoRow label="SKU" value={product.sku} mono />
                  {product.barcode && <DetailInfoRow label="Barcode" value={product.barcode} mono />}
                  {product.oemNumber && <DetailInfoRow label="OEM Number" value={product.oemNumber} mono />}
                  {/* Sell Price — inline editable */}
                  <div className="flex justify-between py-0.5">
                    <span className="text-xs text-muted-foreground">Sell Price</span>
                    {inlineEditField === "sell" ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">{"\u20B1"}</span>
                        <input type="number" min="0" step="0.01" value={inlineEditValue}
                          onChange={(e) => setInlineEditValue(e.target.value)}
                          onKeyDown={handleInlinePriceKeyDown}
                          onBlur={handleInlinePriceSave}
                          autoFocus
                          className="h-6 w-24 rounded border border-primary/40 bg-background px-1.5 text-right text-sm tabular-nums outline-none focus:ring-1 focus:ring-primary/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      </div>
                    ) : product.isVariablePrice ? (
                      <span className="text-sm font-medium text-muted-foreground italic cursor-help" title="Edit prices on individual variants">Variable</span>
                    ) : (
                      <span className="group cursor-pointer text-sm font-medium text-foreground hover:text-emerald-600 transition-colors"
                        onClick={() => { setInlineEditField("sell"); setInlineEditValue(String(sell)); }}>
                        {"\u20B1"} {formatPrice(sell)}
                        <Pencil size={11} className="inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    )}
                  </div>
                  {showFinancials && (
                    <>
                      {/* Cost Price — inline editable */}
                      <div className="flex justify-between py-0.5">
                        <span className="text-xs text-muted-foreground">Cost</span>
                        {inlineEditField === "cost" ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground">{"\u20B1"}</span>
                            <input type="number" min="0" step="0.01" value={inlineEditValue}
                              onChange={(e) => setInlineEditValue(e.target.value)}
                              onKeyDown={handleInlinePriceKeyDown}
                              onBlur={handleInlinePriceSave}
                              autoFocus
                              className="h-6 w-24 rounded border border-primary/40 bg-background px-1.5 text-right text-sm tabular-nums outline-none focus:ring-1 focus:ring-primary/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          </div>
                        ) : (
                          <span className="group cursor-pointer text-sm font-medium text-foreground hover:text-emerald-600 transition-colors"
                            onClick={() => { setInlineEditField("cost"); setInlineEditValue(String(cost)); }}>
                            {cost > 0 ? `\u20B1 ${formatPrice(cost)}` : "\u2014"}
                            <Pencil size={11} className="inline ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                        )}
                      </div>
                      {/* Margin — live updates during inline edit */}
                      <DetailInfoRow label="Margin" value={inlineEditField ? liveMargin.display : getMarginPercent(sell, cost).display} />
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
                  <DetailInfoRow label="In Stock" value={product.stockLevel.toLocaleString()} />
                  <DetailInfoRow label="Reorder Point" value={product.reorderPoint.toLocaleString()} />
                  <DetailInfoRow
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
              <DetailOptionsVariants product={product} token={token} locationId={locationId} showFinancials={showFinancials} />
            )}

            {/* ── Item History ── */}
            <DetailHistorySection productId={product.id} token={token} locationId={locationId} />

            {/* ── Stock Velocity ── */}
            <DetailVelocitySection productId={product.id} token={token} locationId={locationId} />
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

          {/* Print Label expandable section */}
          {showPrintSection && (
            <DetailLabelPrintSection
              cost={cost}
              locationId={locationId}
              product={product}
              token={token}
            />
          )}

          <div className="flex gap-2 border-t border-border p-4">
            <button onClick={() => setShowPrintSection(!showPrintSection)}
              className={cn("flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium",
                showPrintSection ? "bg-amber-600 text-white" : "bg-amber-500 text-white hover:bg-amber-600")}>
              <Printer className="h-3.5 w-3.5" />
              Print Label
            </button>
            <button onClick={onTransfer} className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">Transfer Stock</button>
            <button onClick={onAdjust} className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent">Adjust Stock</button>
          </div>
        </div>
      </div>
    </>
  );
}
