"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  DollarSign,
  Warehouse,
  MapPin,
  Layers,
  Car,
  Plus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Check,
  Info,
  Settings,
  Copy,
  Search,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/auth-context";
import { useCreateProduct, useProductFamilies } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useSubcategories } from "@/hooks/use-subcategories";
import { useCreateOptionType } from "@/hooks/use-product-options";
import { useCreateVariantBatch } from "@/hooks/use-variants";
import { useBrands, useCreateBrand } from "@/hooks/use-brands";
import { useCreateCategory } from "@/hooks/use-categories";
import { useCreateSubcategory } from "@/hooks/use-subcategories";
import { useVehicleMakes, useVehicleModels } from "@/hooks/use-vehicles";
import { mergeVehicleMakes } from "@/lib/vehicle-makes";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SelectWithQuickAdd } from "@/components/select-with-quick-add";

/* ─────────────────────────────────────────────
 * Constants
 * ───────────────────────────────────────────── */

const familyToEnum = (familyName: string): string => {
  const n = familyName.toUpperCase();
  if (n.includes("TIRE")) return "TIRES";
  if (n.includes("LUBRIC") || n.includes("OIL") || n.includes("FLUID")) return "LUBRICANTS";
  if (n.includes("ACCESSOR")) return "ACCESSORIES";
  if (n.includes("LABOR") || n.includes("SERVICE")) return "LABOR_SERVICES";
  return "HARD_PARTS";
};

const UNITS_OF_MEASURE = [
  "Each",
  "Pair",
  "Set",
  "Liter",
  "Gallon",
  "Box",
  "Case",
  "Meter",
  "Foot",
  "Kilogram",
];


/* ─────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────── */

interface VehicleEntry {
  id: string;
  make: string;
  model: string;
  yearStart: string;
  yearEnd: string;
  engine: string;
  notes: string;
}

interface AttributeEntry {
  id: string;
  name: string;
  values: string;
}

interface OptionTypeEntry {
  id: string;
  name: string;
  values: string; // comma-separated
}

/* ─────────────────────────────────────────────
 * Page
 * ───────────────────────────────────────────── */

export default function AddItemPage() {
  const router = useRouter();
  const { token, locationId, user, locations } = useAuth();
  const createMutation = useCreateProduct(token, locationId);
  const createOptionTypeMutation = useCreateOptionType(token, locationId);
  const createVariantBatchMutation = useCreateVariantBatch(token, locationId);
  const familiesQuery = useProductFamilies(token, locationId);
  const families = familiesQuery.data?.data ?? [];
  const categoriesQuery = useCategories(token, locationId, { activeOnly: true });
  const allCategories = categoriesQuery.data?.data ?? [];
  const brandsQuery = useBrands(token, locationId);
  const brandsList = brandsQuery.data?.data ?? [];
  const createBrandMut = useCreateBrand(token, locationId);
  const createCategoryMut = useCreateCategory(token, locationId);
  const createSubcategoryMut = useCreateSubcategory(token, locationId);
  const { data: dbMakesData } = useVehicleMakes(token, locationId);
  const allMakes = useMemo(() => mergeVehicleMakes(dbMakesData?.data ?? []), [dbMakesData]);

  const showCost = ["ADMIN", "MANAGER"].includes(user?.role ?? "");

  // Section collapse state
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Section 1: Basic Info ──
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  // ── Inline Variants ──
  interface InlineVariant { id: string; suffix: string; sku: string; unitPrice: string; costPrice: string; }
  const [inlineVariants, setInlineVariants] = useState<InlineVariant[]>([]);
  const hasInlineVariants = inlineVariants.length > 0;

  const addInlineVariant = () => {
    setInlineVariants((prev) => [
      ...prev,
      { id: crypto.randomUUID(), suffix: "", sku: "", unitPrice: unitPrice || "", costPrice: costPrice || "" },
    ]);
  };
  const updateInlineVariant = (id: string, field: keyof InlineVariant, value: string) => {
    setInlineVariants((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  };
  const removeInlineVariant = (id: string) => {
    setInlineVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Cascading taxonomy
  const filteredCategories = familyId
    ? allCategories.filter((c) => c.familyId === familyId)
    : [];
  const subcategoriesQuery = useSubcategories(token, locationId, categoryId || undefined);
  const subcategories = (subcategoriesQuery.data?.data ?? []).filter((s) => !categoryId || s.categoryId === categoryId);
  const selectedFamily = families.find((f) => f.id === familyId);

  const handleFamilyChange = (id: string) => {
    setFamilyId(id);
    setCategoryId("");
    setSubcategoryId("");
  };
  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    setSubcategoryId("");
  };

  // ── Section 2: Pricing ──
  const [unitPrice, setUnitPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");

  // ── Section 3: Inventory Behavior ──
  const [trackInventory, setTrackInventory] = useState(true);
  const [unitOfMeasure, setUnitOfMeasure] = useState("Each");
  const [reorderPoint, setReorderPoint] = useState("10");
  const [leadTimeDays, setLeadTimeDays] = useState("7");
  const [barcode, setBarcode] = useState("");
  const [oemNumber, setOemNumber] = useState("");
  const [initialStock, setInitialStock] = useState("0");
  const [unitsPerCase, setUnitsPerCase] = useState(1);
  const [packagingUnit, setPackagingUnit] = useState<string | null>(null);

  // ── Section 4: Location Availability ──
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(() => {
    if (locationId === "ALL" && locations.length > 0) {
      return new Set(locations.map((l: any) => l.id));
    }
    return new Set([locationId]);
  });

  // ── Section 5: Attributes / Variants ──
  const [attributes, setAttributes] = useState<AttributeEntry[]>([]);

  // ── Section 5b: Variant Setup ──
  const [hasVariants, setHasVariants] = useState(false);
  const [optionTypes, setOptionTypes] = useState<OptionTypeEntry[]>([]);
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>({});

  // ── Section 6: Vehicle Compatibility ──
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([]);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const handleCopyFitments = (copiedEntries: VehicleEntry[]) => {
    setVehicles((prev) => {
      const existing = new Set(prev.map((v) => `${v.make}|${v.model}|${v.yearStart}|${v.yearEnd}`));
      const deduplicated = copiedEntries.filter(
        (v) => !existing.has(`${v.make}|${v.model}|${v.yearStart}|${v.yearEnd}`),
      );
      const skipped = copiedEntries.length - deduplicated.length;
      if (skipped > 0) {
        alert(`Copied ${deduplicated.length} entries (${skipped} duplicates skipped)`);
      }
      return [...prev, ...deduplicated];
    });
  };

  // ── Validation & Error ──
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ── Unsaved changes warning ──
  const isDirty = !!(name || sku || familyId || unitPrice || costPrice || description || barcode);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const margin = useMemo(() => {
    const sell = parseFloat(unitPrice) || 0;
    const cost = parseFloat(costPrice) || 0;
    if (sell <= 0) return null;
    return ((sell - cost) / sell * 100).toFixed(1);
  }, [unitPrice, costPrice]);

  const isValid =
    name.trim() !== "" &&
    (hasInlineVariants || sku.trim() !== "") &&
    familyId !== "" &&
    (!hasInlineVariants || inlineVariants.every((v) => v.suffix.trim() && v.sku.trim()));

  const [savingStep, setSavingStep] = useState<string | null>(null);
  const isSaving = createMutation.isPending || !!savingStep;

  const handleSave = async (addAnother = false) => {
    if (!isValid) return;
    setError(null);
    setSuccessMessage(null);
    setSavingStep(null);

    try {
      // Create the product (with inline variants if any)
      setSavingStep(hasInlineVariants ? "Creating parent + variants..." : null);
      const parentResult: any = await createMutation.mutateAsync({
        name: name.trim(),
        sku: hasInlineVariants ? "" : sku.trim(),
        category: familyToEnum(selectedFamily?.name ?? ""),
        unitPrice: unitPrice || "0.00",
        costPrice: showCost ? (costPrice || "0.00") : "0.00",
        barcode: hasInlineVariants ? undefined : (barcode.trim() || undefined),
        oemNumber: oemNumber.trim() || undefined,
        familyId: familyId || null,
        categoryId: categoryId || null,
        subcategoryId: subcategoryId || null,
        brandId: brandId || undefined,
        isParent: hasInlineVariants || undefined,
        description: description || undefined,
        trackInventory,
        reorderPoint: parseInt(reorderPoint, 10) || 10,
        leadTimeDays: parseInt(leadTimeDays, 10) || 7,
        unitsPerCase: unitsPerCase > 1 ? unitsPerCase : undefined,
        packagingUnit: packagingUnit || undefined,
        initialStock: hasInlineVariants ? 0 : (trackInventory ? parseInt(initialStock, 10) || 0 : 0),
        locationIds: Array.from(selectedLocations),
        vehicleCompatibility:
          vehicles.length > 0
            ? vehicles
                .filter((v) => v.make && v.model)
                .map((v) => ({
                  make: v.make,
                  model: v.model,
                  yearStart: v.yearStart ? parseInt(v.yearStart, 10) : 0,
                  yearEnd: v.yearEnd ? parseInt(v.yearEnd, 10) : 0,
                  engine: v.engine || undefined,
                  notes: v.notes || undefined,
                }))
            : undefined,
        // Inline variants — API creates parent + children in one transaction
        variants: hasInlineVariants
          ? inlineVariants.map((v) => ({
              suffix: v.suffix.trim(),
              sku: v.sku.trim(),
              unitPrice: v.unitPrice || unitPrice || "0.00",
              costPrice: showCost ? (v.costPrice || costPrice || "0.00") : "0.00",
            }))
          : undefined,
      });

      setSavingStep(null);

      if (addAnother) {
        setSuccessMessage(`"${name}" created successfully${hasInlineVariants ? ` with ${inlineVariants.length} variants` : ""}`);
        setName("");
        setSku("");
        setFamilyId("");
        setCategoryId("");
        setSubcategoryId("");
        setBrandId("");
        setUnitPrice("");
        setCostPrice("");
        setDescription("");
        setInitialStock("0");
        setVehicles([]);
        setAttributes([]);
        setHasVariants(false);
        setOptionTypes([]);
        setVariantPrices({});
        setInlineVariants([]);
      } else {
        router.push("/inventory");
      }
    } catch (err: any) {
      setSavingStep(null);
      setError(err?.message || "Failed to create item");
    }
  };

  // ── Vehicle helpers ──
  const addVehicle = () => {
    setVehicles((prev) => [
      ...prev,
      { id: crypto.randomUUID(), make: "", model: "", yearStart: "", yearEnd: "", engine: "", notes: "" },
    ]);
  };
  const updateVehicle = (id: string, field: keyof VehicleEntry, value: string) => {
    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  };
  const removeVehicle = (id: string) => {
    setVehicles((prev) => prev.filter((v) => v.id !== id));
  };

  // ── Attribute helpers ──
  const addAttribute = () => {
    setAttributes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", values: "" },
    ]);
  };
  const updateAttribute = (id: string, field: keyof AttributeEntry, value: string) => {
    setAttributes((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  };
  const removeAttribute = (id: string) => {
    setAttributes((prev) => prev.filter((a) => a.id !== id));
  };

  // ── Option type helpers (for variant setup) ──
  const addOptionType = () => {
    setOptionTypes((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: "", values: "" },
    ]);
  };
  const updateOptionType = (id: string, field: keyof OptionTypeEntry, value: string) => {
    setOptionTypes((prev) => prev.map((o) => (o.id === id ? { ...o, [field]: value } : o)));
  };
  const removeOptionType = (id: string) => {
    setOptionTypes((prev) => prev.filter((o) => o.id !== id));
  };

  // Generated variant rows from option types
  const generatedVariants = useMemo(() => {
    const validOpts = optionTypes.filter((o) => o.name.trim() && o.values.trim());
    if (validOpts.length === 0) return [];
    const valueSets = validOpts.map((o) =>
      o.values.split(",").map((v) => v.trim()).filter(Boolean),
    );
    const combine = (sets: string[][]): string[][] => {
      if (sets.length === 0) return [[]];
      const [first, ...rest] = sets;
      const sub = combine(rest);
      return first.flatMap((val) => sub.map((s) => [val, ...s]));
    };
    const combos = combine(valueSets);
    const baseSku = sku.trim() || "ITEM";
    return combos.map((combo) => {
      const suffix = combo
        .map((v) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 2))
        .join("-");
      const variantSku = `${baseSku}-${suffix}`;
      const key = combo.join("|");
      return {
        key,
        sku: variantSku,
        optionValues: combo,
        optionNames: validOpts.map((o) => o.name),
        price: variantPrices[key] ?? "",
      };
    });
  }, [optionTypes, sku, variantPrices]);

  // Variant preview (existing attributes section)
  const variantCombinations = useMemo(() => {
    const validAttrs = attributes.filter(
      (a) => a.name.trim() && a.values.trim(),
    );
    if (validAttrs.length === 0) return [];
    const valueSets = validAttrs.map((a) =>
      a.values.split(",").map((v) => v.trim()).filter(Boolean),
    );
    // Cartesian product
    const combine = (sets: string[][]): string[][] => {
      if (sets.length === 0) return [[]];
      const [first, ...rest] = sets;
      const subCombinations = combine(rest);
      return first.flatMap((val) => subCombinations.map((sub) => [val, ...sub]));
    };
    return combine(valueSets).slice(0, 20); // Limit preview to 20
  }, [attributes]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Page Header ── */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/inventory")}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Add New Item</h2>
            <p className="text-[12px] text-muted-foreground">
              Full item setup — catalog, pricing, inventory, and compatibility
            </p>
          </div>
        </div>
      </div>

      {/* ── Status Messages ── */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertCircle size={14} />
          {error}
        </div>
      )}
      {successMessage && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 px-3 py-2 text-[12px] text-success">
          <Check size={14} />
          {successMessage}
        </div>
      )}

      {/* ── Sections ── */}
      <div className="flex-1 overflow-y-auto pb-20 space-y-3">

        {/* ══════════════════════════════════════════
         *  SECTION 1 — Basic Info
         * ══════════════════════════════════════════ */}
        <FormSection
          id="basic"
          icon={Package}
          title="Basic Information"
          collapsed={collapsedSections.has("basic")}
          onToggle={() => toggleSection("basic")}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {/* Name — full width */}
            <div className="col-span-2">
              <FieldLabel required>Item Name</FieldLabel>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. ACDelco Brake Pad - Honda Civic 2016-2021"
                autoFocus
                className={fieldClass}
              />
            </div>

            {/* SKU — hidden when item has variants (parent has no SKU) */}
            {!hasInlineVariants && (
              <div>
                <FieldLabel required>SKU</FieldLabel>
                <input
                  type="text"
                  value={sku}
                  onChange={(e) => setSku(e.target.value.toUpperCase())}
                  placeholder="e.g. HAR-050001"
                  className={cn(fieldClass, "font-mono")}
                />
              </div>
            )}

            {/* Family */}
            <div>
              <FieldLabel required>Family</FieldLabel>
              <select value={familyId} onChange={(e) => handleFamilyChange(e.target.value)} className={fieldClass}>
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

            {/* ── Inline Variants ── */}
            <div className="col-span-2 mt-1 rounded-lg border border-border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasInlineVariants}
                    onChange={(e) => {
                      if (e.target.checked) {
                        // Add first empty variant row
                        if (inlineVariants.length === 0) addInlineVariant();
                      } else {
                        setInlineVariants([]);
                      }
                    }}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                  />
                  <span className="text-[12px] font-medium text-foreground">This item has variants</span>
                </label>
                <span className="text-[10px] text-muted-foreground">
                  (e.g. Side Mirror LH / RH, Brake Pad Front / Rear)
                </span>
              </div>

              {hasInlineVariants && (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    Each variant gets its own SKU and barcode. The parent item groups them together.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                          <th className="pb-1.5 pr-2 min-w-[120px]">Variant Name</th>
                          <th className="pb-1.5 pr-2 min-w-[100px]">SKU *</th>
                          <th className="pb-1.5 pr-2 w-[100px]">Sell Price</th>
                          {showCost && <th className="pb-1.5 pr-2 w-[100px]">Cost Price</th>}
                          <th className="pb-1.5 w-[32px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {inlineVariants.map((v) => (
                          <tr key={v.id} className="border-b border-border/50">
                            <td className="py-1.5 pr-2">
                              <input
                                type="text"
                                value={v.suffix}
                                onChange={(e) => updateInlineVariant(v.id, "suffix", e.target.value)}
                                placeholder="e.g. LH, RH, Front"
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] focus:border-primary focus:ring-1 focus:ring-primary/20"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="text"
                                value={v.sku}
                                onChange={(e) => updateInlineVariant(v.id, "sku", e.target.value)}
                                placeholder="SKU"
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] focus:border-primary focus:ring-1 focus:ring-primary/20"
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                type="text"
                                value={v.unitPrice}
                                onChange={(e) => updateInlineVariant(v.id, "unitPrice", e.target.value)}
                                placeholder="0.00"
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-right focus:border-primary focus:ring-1 focus:ring-primary/20"
                              />
                            </td>
                            {showCost && (
                              <td className="py-1.5 pr-2">
                                <input
                                  type="text"
                                  value={v.costPrice}
                                  onChange={(e) => updateInlineVariant(v.id, "costPrice", e.target.value)}
                                  placeholder="0.00"
                                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-[12px] text-right focus:border-primary focus:ring-1 focus:ring-primary/20"
                                />
                              </td>
                            )}
                            <td className="py-1.5">
                              <button
                                type="button"
                                onClick={() => removeInlineVariant(v.id)}
                                className="rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button
                    type="button"
                    onClick={addInlineVariant}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
                  >
                    <Plus size={12} /> Add Variant
                  </button>
                </div>
              )}
            </div>

            {/* Description — full width */}
            <div className="col-span-2">
              <FieldLabel>Description / Notes</FieldLabel>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Internal notes, fitment details, handling instructions…"
                className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              />
            </div>

            {/* Active Status */}
            <div className="col-span-2 flex items-center gap-2">
              <ToggleSwitch checked={isActive} onChange={setIsActive} />
              <span className="text-[13px] text-foreground">Active in catalog</span>
            </div>
          </div>
        </FormSection>

        {/* ══════════════════════════════════════════
         *  SECTION 2 — Pricing
         * ══════════════════════════════════════════ */}
        <FormSection
          id="pricing"
          icon={DollarSign}
          title="Pricing"
          collapsed={collapsedSections.has("pricing")}
          onToggle={() => toggleSection("pricing")}
        >
          <div className={cn("grid gap-x-4 gap-y-3", showCost ? "grid-cols-3" : "grid-cols-1")}>
            <div>
              <FieldLabel>Sell Price</FieldLabel>
              <CurrencyInput value={unitPrice} onChange={setUnitPrice} />
            </div>
            {showCost && (
              <>
                <div>
                  <FieldLabel>Cost Price</FieldLabel>
                  <CurrencyInput value={costPrice} onChange={setCostPrice} />
                </div>
                <div>
                  <FieldLabel>Margin</FieldLabel>
                  <div className="flex h-9 items-center rounded-lg border border-border bg-muted/40 px-3 text-[13px]">
                    {margin !== null ? (
                      <span className={cn(
                        "font-medium",
                        parseFloat(margin) > 30 ? "text-success" : parseFloat(margin) > 0 ? "text-warning" : "text-destructive",
                      )}>
                        {margin}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </FormSection>

        {/* ══════════════════════════════════════════
         *  SECTION 3 — Inventory Behavior
         * ══════════════════════════════════════════ */}
        <FormSection
          id="inventory"
          icon={Warehouse}
          title="Inventory Behavior"
          collapsed={collapsedSections.has("inventory")}
          onToggle={() => toggleSection("inventory")}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ToggleSwitch checked={trackInventory} onChange={setTrackInventory} />
              <span className="text-[13px] text-foreground">Track inventory for this item</span>
            </div>

            {trackInventory && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
                <div>
                  <FieldLabel>Unit of Measure</FieldLabel>
                  <select value={unitOfMeasure} onChange={(e) => setUnitOfMeasure(e.target.value)} className={fieldClass}>
                    {UNITS_OF_MEASURE.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel>Reorder Point</FieldLabel>
                  <input type="number" min="0" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <FieldLabel>Lead Time (Days)</FieldLabel>
                  <input type="number" min="0" value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} className={fieldClass} />
                </div>
                <div>
                  <FieldLabel>Initial Stock</FieldLabel>
                  <input type="number" min="0" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} className={fieldClass} />
                </div>
                <div className="col-span-2">
                  <FieldLabel>Barcode</FieldLabel>
                  <input type="text" value={barcode} onChange={(e) => setBarcode(e.target.value.slice(0, 50))} placeholder="Auto-generated if empty" maxLength={50} className={cn(fieldClass, "font-mono")} />
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Leave blank to auto-generate a unique barcode</p>
                </div>
                <div className="col-span-2">
                  <FieldLabel>OEM Number</FieldLabel>
                  <input type="text" value={oemNumber} onChange={(e) => setOemNumber(e.target.value.slice(0, 100))} placeholder="e.g. MB295982, 04465-0K160" maxLength={100} className={cn(fieldClass, "font-mono")} />
                </div>
              </div>
            )}
          </div>

          {/* Packaging */}
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Packaging</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Units per Case</FieldLabel>
                <input
                  type="number"
                  min={1}
                  value={unitsPerCase}
                  onChange={(e) => setUnitsPerCase(parseInt(e.target.value) || 1)}
                  className={fieldClass}
                />
                <span className="text-[10px] text-muted-foreground">
                  {unitsPerCase > 1
                    ? `1 ${packagingUnit || "case"} = ${unitsPerCase} pieces`
                    : "Sold individually"}
                </span>
              </div>
              <div>
                <FieldLabel>Packaging Unit</FieldLabel>
                <select
                  value={packagingUnit ?? ""}
                  onChange={(e) => setPackagingUnit(e.target.value || null)}
                  className={fieldClass}
                >
                  <option value="">None (pieces)</option>
                  <option value="box">Box</option>
                  <option value="case">Case</option>
                  <option value="pack">Pack</option>
                  <option value="carton">Carton</option>
                  <option value="drum">Drum</option>
                  <option value="pail">Pail</option>
                  <option value="set">Set</option>
                </select>
              </div>
            </div>
            {unitsPerCase > 1 && (parseFloat(costPrice || "0") > 0 || parseFloat(unitPrice || "0") > 0) && (
              <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {parseFloat(costPrice || "0") > 0 && (
                  <div>Cost per {packagingUnit || "case"}: ₱{(parseFloat(costPrice) * unitsPerCase).toFixed(2)}</div>
                )}
                {parseFloat(unitPrice || "0") > 0 && (
                  <div>Sell per {packagingUnit || "case"}: ₱{(parseFloat(unitPrice) * unitsPerCase).toFixed(2)}</div>
                )}
              </div>
            )}
          </div>
        </FormSection>

        {/* ══════════════════════════════════════════
         *  SECTION 4 — Location Availability
         * ══════════════════════════════════════════ */}
        <FormSection
          id="locations"
          icon={MapPin}
          title="Location Availability"
          collapsed={collapsedSections.has("locations")}
          onToggle={() => toggleSection("locations")}
          badge={`${selectedLocations.size} of ${locations.length}`}
        >
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Location</th>
                  <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                  <th scope="col" className="px-3 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Available</th>
                </tr>
              </thead>
              <tbody>
                {locations.filter((l) => l.isActive).map((loc) => (
                  <tr key={loc.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-medium text-foreground">{loc.name}</td>
                    <td className="px-3 py-2 text-muted-foreground capitalize">{loc.type.toLowerCase().replace("_", " ")}</td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedLocations.has(loc.id)}
                        onChange={() => {
                          setSelectedLocations((prev) => {
                            const next = new Set(prev);
                            if (next.has(loc.id)) next.delete(loc.id);
                            else next.add(loc.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FormSection>

        {/* ══════════════════════════════════════════
         *  SECTION 5 — Variants
         * ══════════════════════════════════════════ */}
        <FormSection
          id="variants"
          icon={Settings}
          title="Variants"
          collapsed={collapsedSections.has("variants")}
          onToggle={() => toggleSection("variants")}
          badge={hasVariants && generatedVariants.length > 0 ? `${generatedVariants.length} variants` : undefined}
        >
          <div className="space-y-4">
            {/* Toggle */}
            <div className="flex items-center gap-2">
              <ToggleSwitch checked={hasVariants} onChange={setHasVariants} />
              <span className="text-[13px] text-foreground">This item has variants</span>
            </div>

            {hasVariants && (
              <>
                {/* Info */}
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                  <Info size={13} />
                  <span>Define option types (e.g. Size, Color) and their values. Variants will be auto-generated as the cartesian product of all values.</span>
                </div>

                {/* Option Types List */}
                {optionTypes.map((opt) => (
                  <div key={opt.id} className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Option Type</span>
                      <button onClick={() => removeOptionType(opt.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <FieldLabel>Name</FieldLabel>
                        <input
                          type="text"
                          value={opt.name}
                          onChange={(e) => updateOptionType(opt.id, "name", e.target.value)}
                          placeholder="e.g. Size"
                          className={fieldClass}
                        />
                      </div>
                      <div>
                        <FieldLabel>Values</FieldLabel>
                        <input
                          type="text"
                          value={opt.values}
                          onChange={(e) => updateOptionType(opt.id, "values", e.target.value)}
                          placeholder="Small, Medium, Large"
                          className={fieldClass}
                        />
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Comma-separated</p>
                      </div>
                    </div>
                  </div>
                ))}

                <button
                  onClick={addOptionType}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80"
                >
                  <Plus size={13} />
                  Add Option Type
                </button>

                {/* Variant Preview Table */}
                {generatedVariants.length > 0 && (
                  <div className="mt-2 rounded-lg border border-border overflow-hidden">
                    <div className="bg-muted/40 px-3 py-2 border-b border-border">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Variant Preview — {generatedVariants.length} variant{generatedVariants.length !== 1 ? "s" : ""} will be created
                      </p>
                    </div>
                    <table className="w-full text-[13px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/20">
                          <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">SKU</th>
                          {generatedVariants[0]?.optionNames.map((n) => (
                            <th key={n} scope="col" className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{n}</th>
                          ))}
                          <th scope="col" className="px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Price Override</th>
                        </tr>
                      </thead>
                      <tbody>
                        {generatedVariants.slice(0, 50).map((v) => (
                          <tr key={v.key} className="border-b border-border last:border-0">
                            <td className="px-3 py-1.5 font-mono text-[12px] text-foreground">{v.sku}</td>
                            {v.optionValues.map((val, i) => (
                              <td key={i} className="px-3 py-1.5 text-foreground">{val}</td>
                            ))}
                            <td className="px-3 py-1.5">
                              <div className="relative w-28">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">₱</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={variantPrices[v.key] ?? ""}
                                  onChange={(e) =>
                                    setVariantPrices((prev) => ({ ...prev, [v.key]: e.target.value }))
                                  }
                                  placeholder={unitPrice || "0.00"}
                                  className="h-7 w-full rounded border border-border bg-background pl-6 pr-2 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/[0.08]"
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {generatedVariants.length > 50 && (
                      <div className="bg-muted/20 px-3 py-2 border-t border-border text-[11px] text-muted-foreground">
                        Showing first 50 of {generatedVariants.length} variants
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </FormSection>

        {/* ══════════════════════════════════════════
         *  SECTION 5b — Attributes (non-variant)
         * ══════════════════════════════════════════ */}
        {!hasVariants && (
          <FormSection
            id="attributes"
            icon={Layers}
            title="Attributes"
            collapsed={collapsedSections.has("attributes")}
            onToggle={() => toggleSection("attributes")}
            badge={attributes.length > 0 ? `${attributes.length} attr` : undefined}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                <Info size={13} />
                <span>Define attributes (e.g. Pack Size, Viscosity, Tire Size) as metadata for this product.</span>
              </div>

              {attributes.map((attr) => (
                <div key={attr.id} className="flex items-start gap-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={attr.name}
                      onChange={(e) => updateAttribute(attr.id, "name", e.target.value)}
                      placeholder="Attribute (e.g. Pack Size)"
                      className={fieldClass}
                    />
                    <input
                      type="text"
                      value={attr.values}
                      onChange={(e) => updateAttribute(attr.id, "values", e.target.value)}
                      placeholder="Values (comma-separated: 1L, 4L, 5L)"
                      className={fieldClass}
                    />
                  </div>
                  <button onClick={() => removeAttribute(attr.id)} className="mt-1.5 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              <button
                onClick={addAttribute}
                className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80"
              >
                <Plus size={13} />
                Add Attribute
              </button>
            </div>
          </FormSection>
        )}

        {/* ══════════════════════════════════════════
         *  SECTION 6 — Vehicle Compatibility
         * ══════════════════════════════════════════ */}
        <FormSection
          id="vehicles"
          icon={Car}
          title="Vehicle Compatibility"
          collapsed={collapsedSections.has("vehicles")}
          onToggle={() => toggleSection("vehicles")}
          badge={vehicles.length > 0 ? `${vehicles.length} entries` : undefined}
        >
          <div className="space-y-3">
            {(familyToEnum(selectedFamily?.name ?? "") === "LABOR_SERVICES" || familyToEnum(selectedFamily?.name ?? "") === "ACCESSORIES") ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                <Info size={13} />
                <span>Vehicle compatibility is typically used for Hard Parts and Tires. You can still add entries if needed.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                <Info size={13} />
                <span>Specify which vehicles this part fits. This data is persisted and searchable.</span>
              </div>
            )}

            {vehicles.map((v) => (
              <div key={v.id} className="rounded-lg border border-border bg-muted/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Fitment Entry</span>
                  <button onClick={() => removeVehicle(v.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  <div>
                    <FieldLabel>Make</FieldLabel>
                    <select value={v.make} onChange={(e) => updateVehicle(v.id, "make", e.target.value)} className={fieldClass}>
                      <option value="">Select…</option>
                      {allMakes.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Model</FieldLabel>
                    <NewPageModelInput token={token} locationId={locationId} make={v.make} value={v.model} onChange={(val) => updateVehicle(v.id, "model", val)} />
                  </div>
                  <div>
                    <FieldLabel>Year From</FieldLabel>
                    <input type="number" min="1990" max="2030" value={v.yearStart} onChange={(e) => updateVehicle(v.id, "yearStart", e.target.value)} placeholder="2016" className={fieldClass} />
                  </div>
                  <div>
                    <FieldLabel>Year To</FieldLabel>
                    <input type="number" min="1990" max="2030" value={v.yearEnd} onChange={(e) => updateVehicle(v.id, "yearEnd", e.target.value)} placeholder="2021" className={fieldClass} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <FieldLabel>Engine / Application</FieldLabel>
                    <input type="text" value={v.engine} onChange={(e) => updateVehicle(v.id, "engine", e.target.value)} placeholder="e.g. 1.5L Turbo" className={fieldClass} />
                  </div>
                  <div>
                    <FieldLabel>Fitment Notes</FieldLabel>
                    <input type="text" value={v.notes} onChange={(e) => updateVehicle(v.id, "notes", e.target.value)} placeholder="e.g. Front only, OEM replacement" className={fieldClass} />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center gap-3">
              <button
                onClick={addVehicle}
                className="flex items-center gap-1.5 text-[12px] font-medium text-primary hover:text-primary/80"
              >
                <Plus size={13} />
                Add Vehicle Fitment
              </button>
              <button
                onClick={() => setCopyModalOpen(true)}
                className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground hover:text-primary"
              >
                <Copy size={13} />
                Copy from Item
              </button>
            </div>
          </div>
        </FormSection>
      </div>

      {/* Copy Fitment Modal */}
      <CopyFitmentModal
        open={copyModalOpen}
        onClose={() => setCopyModalOpen(false)}
        onCopy={handleCopyFitments}
        token={token!}
        locationId={locationId!}
      />

      {/* ── Sticky Action Bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-sm md:left-[252px]">
        <div className="flex items-center justify-between px-6 py-3">
          <button
            onClick={() => router.push("/inventory")}
            className="rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave(true)}
              disabled={!isValid || isSaving}
              className="rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save & Add Another
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={!isValid || isSaving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Check size={14} />
              )}
              {savingStep ? savingStep : isSaving ? "Saving..." : "Save Item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Shared Sub-components
 * ───────────────────────────────────────────── */

const fieldClass =
  "h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]";

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
      {children}
      {required && <span className="text-destructive"> *</span>}
    </label>
  );
}

function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">₱</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className={cn(fieldClass, "pl-7")}
      />
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

function FormSection({
  id,
  icon: Icon,
  title,
  collapsed,
  onToggle,
  badge,
  children,
}: {
  id: string;
  icon: any;
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
          <Icon size={14} className="text-muted-foreground" />
        </div>
        <span className="flex-1 text-[13px] font-semibold text-foreground">{title}</span>
        {badge && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {badge}
          </span>
        )}
        {collapsed ? <ChevronRight size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
      </button>
      {!collapsed && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}

function NewPageModelInput({ token, locationId, make, value, onChange }: { token: string; locationId: string; make: string; value: string; onChange: (v: string) => void }) {
  const { data: modelsData } = useVehicleModels(token, locationId, make);
  const listId = useMemo(() => `models-new-${make}-${Math.random().toString(36).slice(2, 8)}`, [make]);
  return (
    <>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Civic"
        list={listId}
        className={fieldClass}
      />
      {modelsData?.data && modelsData.data.length > 0 && (
        <datalist id={listId}>
          {modelsData.data.map((m) => <option key={m} value={m} />)}
        </datalist>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
 * Copy Fitment Modal
 * ───────────────────────────────────────────── */

function CopyFitmentModal({
  open,
  onClose,
  onCopy,
  token,
  locationId,
  excludeProductId,
}: {
  open: boolean;
  onClose: () => void;
  onCopy: (entries: VehicleEntry[]) => void;
  token: string;
  locationId: string;
  excludeProductId?: string;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setDebouncedSearch("");
      setSelectedProduct(null);
    }
  }, [open]);

  const { data: searchResults, isLoading: searching } = useQuery<{ data: any[] }>({
    queryKey: ["copy-fitment-search", debouncedSearch],
    queryFn: () =>
      apiFetch<{ data: any[] }>(`/products?search=${encodeURIComponent(debouncedSearch)}&limit=10&hasVehicles=true`, {
        token,
        locationId,
      }),
    enabled: open && !!debouncedSearch && debouncedSearch.length >= 2,
    staleTime: 15_000,
  });

  const { data: vehicleData, isLoading: loadingVehicles } = useQuery<{ data: any[] }>({
    queryKey: ["copy-fitment-vehicles", selectedProduct?.id],
    queryFn: () =>
      apiFetch<{ data: any[] }>(`/products/${selectedProduct.id}/vehicles`, { token, locationId }),
    enabled: !!selectedProduct?.id,
  });

  const handleCopy = () => {
    if (!vehicleData?.data) return;
    const entries: VehicleEntry[] = vehicleData.data.map((v: any) => ({
      id: crypto.randomUUID(),
      make: v.make,
      model: v.model,
      yearStart: v.yearStart != null ? String(v.yearStart) : "",
      yearEnd: v.yearEnd != null ? String(v.yearEnd) : "",
      engine: v.engine || "",
      notes: v.notes || "",
    }));
    onCopy(entries);
    onClose();
  };

  const filteredResults = (searchResults?.data ?? []).filter(
    (p: any) => p.id !== excludeProductId,
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">Copy Vehicle Fitment from Another Item</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="border-b border-border px-5 py-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedProduct(null);
              }}
              placeholder="Search by item name or SKU..."
              className="w-full rounded-lg border border-border bg-muted/30 py-2 pl-9 pr-3 text-sm"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto px-5 py-3">
          {searching && (
            <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
              <Loader2 size={14} className="mr-2 animate-spin" /> Searching...
            </div>
          )}
          {!searching && debouncedSearch.length >= 2 && filteredResults.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No products with vehicle fitments found
            </div>
          )}
          {filteredResults.map((product: any) => (
            <button
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              className={cn(
                "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-accent",
                selectedProduct?.id === product.id && "bg-accent ring-1 ring-primary",
              )}
            >
              <div>
                <div className="text-sm font-medium">{product.name}</div>
                <div className="text-xs text-muted-foreground">{product.sku}</div>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {product.vehicleCount} fitment{product.vehicleCount !== 1 ? "s" : ""}
              </span>
            </button>
          ))}
        </div>

        {selectedProduct && (
          <div className="border-t border-border px-5 py-3">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Fitments to copy:
            </div>
            {loadingVehicles ? (
              <div className="flex items-center text-xs text-muted-foreground">
                <Loader2 size={12} className="mr-2 animate-spin" /> Loading...
              </div>
            ) : (
              <div className="space-y-1">
                {(vehicleData?.data ?? []).map((v: any, i: number) => (
                  <div key={i} className="text-xs text-muted-foreground">
                    {v.make} {v.model}
                    {(v.yearStart || v.yearEnd) && ` ${v.yearStart || "?"}–${v.yearEnd || "?"}`}
                    {v.engine ? ` (${v.engine})` : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={handleCopy}
            disabled={!vehicleData?.data?.length}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Copy {vehicleData?.data?.length ?? 0} Fitment{(vehicleData?.data?.length ?? 0) !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
