"use client";

import { useState, useEffect, useMemo } from "react";
import {
  X,
  Plus,
  Loader2,
  Store,
  Check,
} from "lucide-react";
import { useProductFamilies, useCreateProduct } from "@/hooks/use-products";
import { useCategories, useCreateCategory } from "@/hooks/use-categories";
import { useSubcategories, useCreateSubcategory } from "@/hooks/use-subcategories";
import { useBrands, useCreateBrand } from "@/hooks/use-brands";
import { useLocations } from "@/hooks/use-locations";
import { SelectWithQuickAdd } from "@/components/select-with-quick-add";
import { cn } from "@/lib/utils";

export function QuickAddDrawer({
  token,
  locationId,
  userRole,
  isAllLocations,
  onClose,
}: {
  token: string;
  locationId: string;
  userRole: string;
  isAllLocations: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [oemNumber, setOemNumber] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);
  const [initialStock, setInitialStock] = useState("0");
  const [error, setError] = useState<string | null>(null);

  // ── Location toggles (for All Locations mode) ──
  const { data: locationsData } = useLocations(token);
  const allLocations = useMemo(
    () => (locationsData?.data ?? []).filter((l) => l.isActive),
    [locationsData],
  );
  const [enabledLocationIds, setEnabledLocationIds] = useState<Set<string>>(new Set());

  // Default all locations to ON when data loads
  useEffect(() => {
    if (allLocations.length > 0 && enabledLocationIds.size === 0) {
      setEnabledLocationIds(new Set(allLocations.map((l) => l.id)));
    }
  }, [allLocations]);

  const toggleLocation = (id: string) => {
    setEnabledLocationIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllLocations = () => {
    if (enabledLocationIds.size === allLocations.length) {
      setEnabledLocationIds(new Set());
    } else {
      setEnabledLocationIds(new Set(allLocations.map((l) => l.id)));
    }
  };

  const showCost = ["ADMIN", "MANAGER"].includes(userRole);
  const createMutation = useCreateProduct(token, locationId);

  // Taxonomy data
  const { data: familiesData } = useProductFamilies(token, locationId);
  const families = familiesData?.data ?? [];
  const { data: categoriesData } = useCategories(token, locationId, { activeOnly: true });
  const allCategories = categoriesData?.data ?? [];
  const filteredCategories = familyId
    ? allCategories.filter((c) => c.familyId === familyId)
    : [];
  const { data: subcategoriesData } = useSubcategories(token, locationId, categoryId || undefined);
  const subcategories = (subcategoriesData?.data ?? []).filter((s) => !categoryId || s.categoryId === categoryId);
  const { data: brandsData } = useBrands(token, locationId);
  const brandsList = brandsData?.data ?? [];
  const createBrandMut = useCreateBrand(token, locationId);
  const createCategoryMut = useCreateCategory(token, locationId);
  const createSubcategoryMut = useCreateSubcategory(token, locationId);

  const handleFamilyChange = (id: string) => {
    setFamilyId(id);
    setCategoryId("");
    setSubcategoryId("");
  };
  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    setSubcategoryId("");
  };

  const familyToEnum = (familyName: string): string => {
    const n = familyName.toUpperCase();
    if (n.includes("TIRE")) return "TIRES";
    if (n.includes("LUBRIC") || n.includes("OIL") || n.includes("FLUID")) return "LUBRICANTS";
    if (n.includes("ACCESSOR")) return "ACCESSORIES";
    if (n.includes("LABOR") || n.includes("SERVICE")) return "LABOR_SERVICES";
    return "HARD_PARTS";
  };

  const selectedFamily = families.find((f) => f.id === familyId);
  const isValid = name.trim() !== "" && sku.trim() !== "" && familyId !== "";

  const handleSave = async (openFull = false) => {
    if (!isValid) return;
    setError(null);
    try {
      const payload: any = {
        name: name.trim(),
        sku: sku.trim(),
        category: familyToEnum(selectedFamily?.name ?? ""),
        familyId: familyId || undefined,
        categoryId: categoryId || undefined,
        subcategoryId: subcategoryId || undefined,
        brandId: brandId || undefined,
        unitPrice: unitPrice || "0.00",
        costPrice: showCost ? (costPrice || "0.00") : "0.00",
        barcode: barcode.trim() || undefined,
        oemNumber: oemNumber.trim() || undefined,


        trackInventory,
        initialStock: trackInventory ? parseInt(initialStock, 10) || 0 : 0,
        reorderPoint: 10,
        leadTimeDays: 7,
      };
      // When adding from All Locations, pass explicit locationIds for inventory seeding
      if (isAllLocations && enabledLocationIds.size > 0) {
        payload.locationIds = Array.from(enabledLocationIds);
      }
      const result = await createMutation.mutateAsync(payload);
      if (openFull && (result as any)?.id) {
        window.location.href = `/inventory/${(result as any).id}/edit`;
      } else {
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || "Failed to create item");
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 w-[420px] max-w-full border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Quick Add Item</h3>
              <p className="text-[11px] text-muted-foreground">Create a new catalog item</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close drawer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            )}

            {/* Name */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                Item Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Castrol Edge 5W-30 4L"
                autoFocus
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              />
            </div>

            {/* SKU */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                SKU <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                placeholder="e.g. LUB-005001"
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              />
            </div>

            {/* Family */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                Family <span className="text-destructive">*</span>
              </label>
              <select
                value={familyId}
                onChange={(e) => handleFamilyChange(e.target.value)}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              >
                <option value="">Select family…</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <SelectWithQuickAdd
              label="Category"
              value={categoryId}
              onChange={handleCategoryChange}
              options={filteredCategories}
              placeholder="Select category…"
              disabledPlaceholder="Select a family first"
              disabled={!familyId}
              labelClassName="text-[12px] font-medium text-muted-foreground"
              canAdd={!!familyId}
              onQuickAdd={async (name) => {
                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                const res: any = await createCategoryMut.mutateAsync({ name, slug, familyId: familyId || undefined });
                return { id: res?.data?.id ?? res?.id ?? "" };
              }}
            />

            {/* Sub-category */}
            <SelectWithQuickAdd
              label="Sub-category"
              value={subcategoryId}
              onChange={(v) => setSubcategoryId(v)}
              options={subcategories}
              placeholder="Select sub-category…"
              disabledPlaceholder="Select a category first"
              disabled={!categoryId}
              labelClassName="text-[12px] font-medium text-muted-foreground"
              canAdd={!!categoryId}
              onQuickAdd={async (name) => {
                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                const res: any = await createSubcategoryMut.mutateAsync({ categoryId, name, slug });
                return { id: res?.data?.id ?? res?.id ?? "" };
              }}
            />

            {/* Brand */}
            <SelectWithQuickAdd
              label="Brand"
              value={brandId}
              onChange={(v) => setBrandId(v)}
              options={brandsList}
              placeholder="No Brand"
              labelClassName="text-[12px] font-medium text-muted-foreground"
              onQuickAdd={async (name) => {
                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                const res: any = await createBrandMut.mutateAsync({ name, slug });
                return { id: res?.data?.id ?? res?.id ?? "" };
              }}
            />

            {/* Pricing Row */}
            <div className={cn("grid gap-3", showCost ? "grid-cols-2" : "grid-cols-1")}>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                  Sell Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">₱</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    placeholder="0.00"
                    className="h-9 w-full rounded-lg border border-border bg-background pl-7 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                  />
                </div>
              </div>
              {showCost && (
                <div>
                  <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                    Cost Price
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">₱</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={costPrice}
                      onChange={(e) => setCostPrice(e.target.value)}
                      placeholder="0.00"
                      className="h-9 w-full rounded-lg border border-border bg-background pl-7 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Barcode */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                Barcode
              </label>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.slice(0, 50))}
                placeholder="Auto-generated if empty"
                maxLength={50}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              />
              <p className="mt-0.5 text-[10px] text-muted-foreground">Leave blank to auto-generate a unique barcode</p>
            </div>

            {/* OEM Number */}
            <div>
              <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                OEM Number
              </label>
              <input
                type="text"
                value={oemNumber}
                onChange={(e) => setOemNumber(e.target.value.slice(0, 100))}
                placeholder="e.g. MB295982, 04465-0K160"
                maxLength={100}
                className="h-9 w-full rounded-lg border border-border bg-background px-3 font-mono text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              />
            </div>

            {/* Track Inventory */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium text-foreground">Track Inventory</p>
                <p className="text-[11px] text-muted-foreground">Monitor stock levels for this item</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={trackInventory}
                onClick={() => setTrackInventory(!trackInventory)}
                className={cn(
                  "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                  trackInventory ? "bg-primary" : "bg-border",
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                    trackInventory ? "translate-x-5" : "translate-x-0.5",
                  )}
                />
              </button>
            </div>

            {/* Initial Stock */}
            {trackInventory && !isAllLocations && (
              <div>
                <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
                  Initial Stock at Current Location
                </label>
                <input
                  type="number"
                  min="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                />
              </div>
            )}

            {/* Location Availability (All Locations mode) */}
            {isAllLocations && allLocations.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-[12px] font-medium text-muted-foreground">
                    Available at Locations
                  </label>
                  <button
                    type="button"
                    onClick={toggleAllLocations}
                    className="text-[11px] font-medium text-primary hover:underline"
                  >
                    {enabledLocationIds.size === allLocations.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="space-y-1 rounded-lg border border-border bg-muted/30 p-2">
                  {allLocations.map((loc) => {
                    const isOn = enabledLocationIds.has(loc.id);
                    return (
                      <button
                        key={loc.id}
                        type="button"
                        onClick={() => toggleLocation(loc.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors",
                          isOn ? "bg-background" : "opacity-50",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            isOn
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background",
                          )}
                        >
                          {isOn && <Check size={10} strokeWidth={3} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-foreground truncate">{loc.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {loc.type === "WAREHOUSE" ? "Warehouse" : loc.type === "RETAIL" ? "Retail Store" : loc.type}
                            {loc.code ? ` · ${loc.code}` : ""}
                          </p>
                        </div>
                        <Store size={13} className={cn("shrink-0", isOn ? "text-muted-foreground" : "text-muted-foreground/40")} />
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {enabledLocationIds.size} of {allLocations.length} locations selected
                </p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="space-y-2 border-t border-border p-4">
            <button
              onClick={() => handleSave(false)}
              disabled={!isValid || createMutation.isPending}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-primary text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {createMutation.isPending ? "Creating\u2026" : "Save Item"}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={!isValid || createMutation.isPending}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save & Open Full Setup
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
