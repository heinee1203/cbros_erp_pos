"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Package,
  DollarSign,
  Warehouse,
  Store,
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
  Layers,
  Clock,
} from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/app/auth-context";
import { useProductDetail, useUpdateProduct, useProductFamilies } from "@/hooks/use-products";
import { useCategories } from "@/hooks/use-categories";
import { useSubcategories } from "@/hooks/use-subcategories";
import { useBrands, useCreateBrand } from "@/hooks/use-brands";
import { useCreateCategory } from "@/hooks/use-categories";
import { useCreateSubcategory } from "@/hooks/use-subcategories";
import { useVehicleMakes, useVehicleModels } from "@/hooks/use-vehicles";
import { mergeVehicleMakes } from "@/lib/vehicle-makes";
import { useProductLocations } from "@/hooks/use-product-locations";
import { useSuppliers } from "@/hooks/use-suppliers";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/app/sidebar-context";
import { SelectWithQuickAdd } from "@/components/select-with-quick-add";
import {
  useProductOptions,
  useCreateOptionType,
  useDeleteOptionType,
  useAddOptionValue,
  useDeleteOptionValue,
  type OptionTypeRow,
} from "@/hooks/use-product-options";
import {
  useVariants,
  useCreateVariantBatch,
  useDeleteVariant,
  useUpdateVariant,
  useConvertToRegular,
  type VariantRow,
} from "@/hooks/use-variants";

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

/* ─────────────────────────────────────────────
 * Page
 * ───────────────────────────────────────────── */

export default function EditItemPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.productId as string;
  const queryClient = useQueryClient();
  const { token, locationId, user } = useAuth();
  const { isCollapsed } = useSidebar();
  const updateMutation = useUpdateProduct(token, locationId);
  const { data: product, isLoading, error: loadError } = useProductDetail(token, locationId, productId);
  const familiesQuery = useProductFamilies(token, locationId);
  const families = familiesQuery.data?.data ?? [];
  const categoriesQuery = useCategories(token, locationId, { activeOnly: true });
  const allCategories = categoriesQuery.data?.data ?? [];
  const brandsQuery = useBrands(token, locationId);
  const brandsList = brandsQuery.data?.data ?? [];
  const createBrandMut = useCreateBrand(token, locationId);
  const createCategoryMut = useCreateCategory(token, locationId);
  const createSubcategoryMut = useCreateSubcategory(token, locationId);
  const suppliersQuery = useSuppliers(token, locationId);
  const suppliersList = suppliersQuery.data?.data ?? [];

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

  // ── Form fields ──
  const [name, setName] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [barcode, setBarcode] = useState("");
  const [oemNumber, setOemNumber] = useState("");
  const [isParent, setIsParent] = useState(false);

  // ── Loyverse-style Variant System ──
  const optionsQuery = useProductOptions(token!, locationId!, isParent ? productId : undefined);
  const optionTypes: OptionTypeRow[] = optionsQuery.data?.data ?? [];
  const variantsQuery = useVariants(token!, locationId!, isParent ? productId : undefined);
  const existingVariants: VariantRow[] = variantsQuery.data?.data ?? [];
  const createOptionMut = useCreateOptionType(token!, locationId!);
  const deleteOptionMut = useDeleteOptionType(token!, locationId!);
  const addValueMut = useAddOptionValue(token!, locationId!);
  const deleteValueMut = useDeleteOptionValue(token!, locationId!);
  const createVariantBatchMut = useCreateVariantBatch(token!, locationId!);
  const deleteVariantMut = useDeleteVariant(token!, locationId!);
  const updateVariantMut = useUpdateVariant(token!, locationId!);
  const convertToRegularMut = useConvertToRegular(token!, locationId!);

  const [optionModalOpen, setOptionModalOpen] = useState(false);
  const [deletingVariantId, setDeletingVariantId] = useState<string | null>(null);
  const [showConvertConfirm, setShowConvertConfirm] = useState(false);

  // ── Variant field dirty tracking ──
  const [originalVariants, setOriginalVariants] = useState<Map<string, { name: string; unitPrice: string; costPrice: string }>>(new Map());
  const [modifiedVariants, setModifiedVariants] = useState<Map<string, { name?: string; unitPrice?: string; costPrice?: string }>>(new Map());

  // Snapshot originals when variants load from API
  useEffect(() => {
    if (existingVariants.length > 0) {
      const map = new Map<string, { name: string; unitPrice: string; costPrice: string }>();
      for (const v of existingVariants) {
        map.set(v.id, { name: v.name, unitPrice: v.unitPrice, costPrice: v.costPrice });
      }
      setOriginalVariants(map);
      setModifiedVariants(new Map());
    }
  }, [existingVariants]);

  const handleVariantFieldChange = (variantId: string, field: "name" | "unitPrice" | "costPrice", value: string) => {
    setModifiedVariants((prev) => {
      const next = new Map(prev);
      const existing = next.get(variantId) ?? {};
      next.set(variantId, { ...existing, [field]: value });
      return next;
    });
  };

  const isVariantFieldsDirty = useMemo(() => {
    if (modifiedVariants.size === 0) return false;
    for (const [id, changes] of modifiedVariants) {
      const original = originalVariants.get(id);
      if (!original) continue;
      if (changes.name !== undefined && changes.name !== original.name) return true;
      if (changes.unitPrice !== undefined && changes.unitPrice !== original.unitPrice) return true;
      if (changes.costPrice !== undefined && changes.costPrice !== original.costPrice) return true;
    }
    return false;
  }, [modifiedVariants, originalVariants]);

  const [reorderPoint, setReorderPoint] = useState("10");
  const [unitsPerCase, setUnitsPerCase] = useState(1);
  const [packagingUnit, setPackagingUnit] = useState<string | null>(null);
  const [primarySupplierId, setPrimarySupplierId] = useState<string | null>(null);
  const [reorderEnabled, setReorderEnabled] = useState(true);
  const [customReorderPoint, setCustomReorderPoint] = useState<number | null>(null);
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([]);
  const initialVehiclesRef = useRef<VehicleEntry[]>([]);
  const [initialized, setInitialized] = useState(false);

  // ── Store Availability ──
  const locationsQuery = useProductLocations(token, locationId, productId);
  const locationRows = locationsQuery.data?.data ?? [];
  const [localAvailability, setLocalAvailability] = useState<Record<string, boolean>>({});
  const [originalAvailability, setOriginalAvailability] = useState<Record<string, boolean>>({});
  const [localReorderPoints, setLocalReorderPoints] = useState<Record<string, number>>({});
  const [originalReorderPoints, setOriginalReorderPoints] = useState<Record<string, number>>({});
  const [localOptimalStocks, setLocalOptimalStocks] = useState<Record<string, number>>({});
  const [originalOptimalStocks, setOriginalOptimalStocks] = useState<Record<string, number>>({});

  useEffect(() => {
    if (locationRows.length > 0 && Object.keys(originalAvailability).length === 0) {
      const avail: Record<string, boolean> = {};
      const rp: Record<string, number> = {};
      const os: Record<string, number> = {};
      for (const loc of locationRows) {
        avail[loc.locationId] = loc.availableForSale;
        rp[loc.locationId] = loc.reorderPoint;
        os[loc.locationId] = loc.optimalStock ?? 0;
      }
      setLocalAvailability(avail);
      setOriginalAvailability(avail);
      setLocalReorderPoints(rp);
      setOriginalReorderPoints(rp);
      setLocalOptimalStocks(os);
      setOriginalOptimalStocks(os);
    }
  }, [locationRows, originalAvailability]);

  const isAvailabilityDirty = useMemo(() => {
    return Object.keys(localAvailability).some(
      (locId) => localAvailability[locId] !== originalAvailability[locId],
    ) || Object.keys(localReorderPoints).some(
      (locId) => localReorderPoints[locId] !== originalReorderPoints[locId],
    ) || Object.keys(localOptimalStocks).some(
      (locId) => localOptimalStocks[locId] !== originalOptimalStocks[locId],
    );
  }, [localAvailability, originalAvailability, localReorderPoints, originalReorderPoints, localOptimalStocks, originalOptimalStocks]);

  const availableCount = Object.values(localAvailability).filter(Boolean).length;
  const totalLocations = Object.keys(localAvailability).length;

  const masterState = useMemo(() => {
    const values = Object.values(localAvailability);
    if (values.length === 0) return false;
    if (values.every((v) => v)) return true;
    if (values.every((v) => !v)) return false;
    return "indeterminate" as const;
  }, [localAvailability]);

  const handleMasterToggle = () => {
    const newVal = masterState !== true;
    setLocalAvailability((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { next[k] = newVal; });
      return next;
    });
  };

  const handleAvailabilityToggle = (locId: string, val: boolean) => {
    setLocalAvailability((prev) => ({ ...prev, [locId]: val }));
  };

  // ── Copy Fitment Modal ──
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

  // Populate form when product data loads
  useEffect(() => {
    if (!product || initialized) return;
    setName(product.name);
    setFamilyId(product.familyId ?? "");
    setCategoryId(product.categoryId ?? "");
    setSubcategoryId(product.subcategoryId ?? "");
    setBrandId(product.brandId ?? "");
    setUnitPrice(product.unitPrice);
    setCostPrice(product.costPrice);
    setBarcode(product.barcode ?? "");
    setOemNumber(product.oemNumber ?? "");
    setIsParent(product.isParent ?? false);
    setReorderPoint(String(product.reorderPoint));
    setUnitsPerCase(product.unitsPerCase ?? 1);
    setPackagingUnit(product.packagingUnit ?? null);
    setPrimarySupplierId(product.primarySupplierId ?? null);
    setReorderEnabled((product as any).reorderEnabled ?? true);
    setCustomReorderPoint((product as any).customReorderPoint ?? null);
    if (product.vehicleCompatibility?.length > 0) {
      const mapped = product.vehicleCompatibility.map((v: any) => ({
        id: v.id,
        make: v.make,
        model: v.model,
        yearStart: String(v.yearStart),
        yearEnd: String(v.yearEnd),
        engine: v.engine ?? "",
        notes: v.notes ?? "",
      }));
      setVehicles(mapped);
      initialVehiclesRef.current = mapped.map((v: VehicleEntry) => ({ ...v }));
    }
    setInitialized(true);
  }, [product, initialized]);

  // Sync isParent if the backend auto-promoted it (e.g. via createOptionType)
  useEffect(() => {
    if (product && initialized && product.isParent && !isParent) {
      setIsParent(true);
    }
  }, [product, initialized, isParent]);

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

  // Margin calculation
  const margin = useMemo(() => {
    const sell = parseFloat(unitPrice) || 0;
    const cost = parseFloat(costPrice) || 0;
    if (sell <= 0) return null;
    return ((sell - cost) / sell * 100).toFixed(1);
  }, [unitPrice, costPrice]);

  const isValid = name.trim() !== "";

  // Dirty check
  const isDirty = useMemo(() => {
    if (!product || !initialized) return false;
    const basicDirty =
      name !== product.name ||
      familyId !== (product.familyId ?? "") ||
      categoryId !== (product.categoryId ?? "") ||
      subcategoryId !== (product.subcategoryId ?? "") ||
      brandId !== (product.brandId ?? "") ||
      unitPrice !== product.unitPrice ||
      costPrice !== product.costPrice ||
      barcode !== (product.barcode ?? "") ||
      oemNumber !== (product.oemNumber ?? "") ||
      isParent !== (product.isParent ?? false) ||
      unitsPerCase !== (product.unitsPerCase ?? 1) ||
      (packagingUnit ?? "") !== (product.packagingUnit ?? "") ||
      primarySupplierId !== (product.primarySupplierId ?? null) ||
      reorderEnabled !== ((product as any).reorderEnabled ?? true) ||
      (customReorderPoint ?? null) !== ((product as any).customReorderPoint ?? null);
    const vehicleDirty = JSON.stringify(vehicles) !== JSON.stringify(initialVehiclesRef.current);
    return basicDirty || vehicleDirty || isAvailabilityDirty || isVariantFieldsDirty;
  }, [product, initialized, name, familyId, categoryId, subcategoryId, brandId, unitPrice, costPrice, barcode, oemNumber, isParent, unitsPerCase, packagingUnit, primarySupplierId, reorderEnabled, customReorderPoint, vehicles, isAvailabilityDirty, isVariantFieldsDirty]);

  // Unsaved changes warning
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

  const handleSave = async () => {
    if (!isValid || !product) return;
    setError(null);

    const payload: Record<string, any> = { id: productId };
    if (name !== product.name) payload.name = name.trim();
    if (unitPrice !== product.unitPrice) payload.unitPrice = unitPrice || "0.00";
    if (costPrice !== product.costPrice) payload.costPrice = costPrice || "0.00";
    if (barcode !== (product.barcode ?? "")) payload.barcode = barcode.trim() || undefined;
    if (oemNumber !== (product.oemNumber ?? "")) payload.oemNumber = oemNumber.trim() || null;
    if (familyId !== (product.familyId ?? "")) payload.familyId = familyId || null;
    if (categoryId !== (product.categoryId ?? "")) payload.categoryId = categoryId || null;
    if (subcategoryId !== (product.subcategoryId ?? "")) payload.subcategoryId = subcategoryId || null;
    if (brandId !== (product.brandId ?? "")) payload.brandId = brandId || null;
    if (isParent !== (product.isParent ?? false)) payload.isParent = isParent;
    if (unitsPerCase !== (product.unitsPerCase ?? 1)) payload.unitsPerCase = unitsPerCase;
    if (packagingUnit !== (product.packagingUnit ?? null)) payload.packagingUnit = packagingUnit;
    if (primarySupplierId !== (product.primarySupplierId ?? null)) payload.primarySupplierId = primarySupplierId;
    if (reorderEnabled !== ((product as any).reorderEnabled ?? true)) payload.reorderEnabled = reorderEnabled;
    if ((customReorderPoint ?? null) !== ((product as any).customReorderPoint ?? null)) payload.customReorderPoint = customReorderPoint;

    try {
      await updateMutation.mutateAsync(payload as any);

      // Diff and sync vehicle compatibility entries
      const initialIds = new Set(initialVehiclesRef.current.map((v) => v.id));
      const validVehicles = vehicles.filter((v) => v.make && v.model); // only require make+model
      const currentIds = new Set(validVehicles.map((v) => v.id));

      const deleted = initialVehiclesRef.current.filter((v) => !currentIds.has(v.id));
      const added = validVehicles.filter((v) => !initialIds.has(v.id));
      const modified = validVehicles.filter((v) => {
        if (!initialIds.has(v.id)) return false;
        const orig = initialVehiclesRef.current.find((o) => o.id === v.id);
        return orig && JSON.stringify(orig) !== JSON.stringify(v);
      });

      const vehiclePayload = (v: VehicleEntry) => ({
        make: v.make,
        model: v.model,
        yearStart: v.yearStart ? parseInt(v.yearStart) : undefined,
        yearEnd: v.yearEnd ? parseInt(v.yearEnd) : undefined,
        engine: v.engine || undefined,
        notes: v.notes || undefined,
      });

      await Promise.all([
        ...deleted.map((v) =>
          apiFetch(`/products/${productId}/vehicles/${v.id}`, { method: "DELETE", token, locationId })
            .catch((err: any) => { if (err?.status !== 404) throw err; /* 404 = already gone, ignore */ }),
        ),
        ...added.map((v) =>
          apiFetch(`/products/${productId}/vehicles`, {
            method: "POST", token, locationId,
            body: JSON.stringify(vehiclePayload(v)),
          }),
        ),
        ...modified.map((v) =>
          apiFetch(`/products/${productId}/vehicles/${v.id}`, {
            method: "PATCH", token, locationId,
            body: JSON.stringify(vehiclePayload(v)),
          }),
        ),
      ]);

      initialVehiclesRef.current = validVehicles.map((v) => ({ ...v }));

      // Save store availability, reorder point, and optimal stock changes
      if (isAvailabilityDirty) {
        const updates: Array<{ locationId: string; availableForSale?: boolean; reorderPoint?: number; optimalStock?: number }> = [];

        for (const locId of Object.keys(localAvailability)) {
          const update: { locationId: string; availableForSale?: boolean; reorderPoint?: number; optimalStock?: number } = { locationId: locId };
          let hasChange = false;

          if (localAvailability[locId] !== originalAvailability[locId]) {
            update.availableForSale = localAvailability[locId];
            hasChange = true;
          }
          if (localReorderPoints[locId] !== originalReorderPoints[locId]) {
            update.reorderPoint = localReorderPoints[locId];
            hasChange = true;
          }
          if (localOptimalStocks[locId] !== originalOptimalStocks[locId]) {
            update.optimalStock = localOptimalStocks[locId];
            hasChange = true;
          }

          if (hasChange) updates.push(update);
        }

        if (updates.length > 0) {
          await apiFetch("/inventory/stock-levels/availability", {
            method: "PATCH",
            token,
            locationId,
            body: JSON.stringify({ productId, updates }),
          });
        }
        setOriginalAvailability({ ...localAvailability });
        setOriginalReorderPoints({ ...localReorderPoints });
        setOriginalOptimalStocks({ ...localOptimalStocks });
      }

      // Save variant field changes (name, sell, cost)
      if (isVariantFieldsDirty) {
        for (const [variantId, changes] of modifiedVariants) {
          const original = originalVariants.get(variantId);
          if (!original) continue;
          const varPayload: Record<string, string> = {};
          if (changes.name !== undefined && changes.name !== original.name) varPayload.name = changes.name;
          if (changes.unitPrice !== undefined && changes.unitPrice !== original.unitPrice) varPayload.unitPrice = changes.unitPrice;
          if (changes.costPrice !== undefined && changes.costPrice !== original.costPrice) varPayload.costPrice = changes.costPrice;
          if (Object.keys(varPayload).length > 0) {
            await apiFetch(`/products/${variantId}`, {
              method: "PATCH", token, locationId,
              body: JSON.stringify(varPayload),
            });
          }
        }
        setModifiedVariants(new Map());
      }

      // Invalidate product detail cache so re-opening edit shows fresh vehicle data
      await queryClient.invalidateQueries({ queryKey: ["product-detail", productId] });
      await queryClient.invalidateQueries({ queryKey: ["variants", productId] });

      router.push("/inventory");
    } catch (err: any) {
      setError(err?.message || "Failed to update item");
    }
  };

  // Vehicle helpers
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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading product...</span>
      </div>
    );
  }

  if (loadError || !product) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <AlertCircle size={32} className="text-destructive" />
        <p className="text-sm text-muted-foreground">
          {(loadError as any)?.message ?? "Product not found"}
        </p>
        <button
          onClick={() => router.push("/inventory")}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Back to Item List
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Page Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/inventory")}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Edit Item</h2>
            <p className="text-[12px] text-muted-foreground">
              {product.sku}
            </p>
          </div>
        </div>
        {/* View History moved to Inventory section */}
      </div>

      {/* Status Messages */}
      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Sections */}
      <div className="flex-1 overflow-y-auto pb-20 space-y-3">

        {/* SECTION 1 — Basic Info */}
        <FormSection
          id="basic"
          icon={Package}
          title="Basic Information"
          collapsed={collapsedSections.has("basic")}
          onToggle={() => toggleSection("basic")}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {/* Name */}
            <div className="col-span-2">
              <FieldLabel required>Item Name</FieldLabel>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
              />
            </div>

            {/* SKU — read-only */}
            <div>
              <FieldLabel>SKU</FieldLabel>
              <div className={cn(fieldClass, "flex items-center bg-muted/40 text-muted-foreground cursor-not-allowed font-mono")}>
                {product.sku}
              </div>
            </div>

            {/* OEM Number */}
            <div>
              <FieldLabel>OEM Number</FieldLabel>
              <input
                type="text"
                value={oemNumber}
                onChange={(e) => setOemNumber(e.target.value.slice(0, 100))}
                placeholder="e.g. MB295982, 04465-0K160"
                maxLength={100}
                className={cn(fieldClass, "font-mono")}
              />
            </div>

            {/* Family */}
            <div>
              <FieldLabel>Family</FieldLabel>
              <select value={familyId} onChange={(e) => handleFamilyChange(e.target.value)} className={fieldClass}>
                <option value="">No Family</option>
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
              placeholder="Select category..."
              disabledPlaceholder="Select a family first"
              disabled={!familyId}
              labelClassName="mb-1 block text-[12px] font-medium text-muted-foreground"
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
              placeholder="Select sub-category..."
              disabledPlaceholder="Select a category first"
              disabled={!categoryId}
              labelClassName="mb-1 block text-[12px] font-medium text-muted-foreground"
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
              labelClassName="mb-1 block text-[12px] font-medium text-muted-foreground"
              onQuickAdd={async (name) => {
                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                const res: any = await createBrandMut.mutateAsync({ name, slug });
                return { id: res?.data?.id ?? res?.id ?? "" };
              }}
            />

            {/* "This item has variants" toggle */}
            <div className="col-span-2 mt-1">
              <label className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer select-none transition-colors",
                isParent ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted/30",
                convertToRegularMut.isPending && "opacity-50 pointer-events-none",
              )}>
                <input
                  type="checkbox"
                  checked={isParent}
                  onChange={async (e) => {
                    if (!e.target.checked && existingVariants.length > 0) {
                      // Unchecking with existing variants — show confirmation
                      setShowConvertConfirm(true);
                    } else {
                      setIsParent(e.target.checked);
                    }
                  }}
                  disabled={convertToRegularMut.isPending}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <div className="flex-1">
                  <span className="text-[12px] font-medium text-foreground flex items-center gap-1.5">
                    <Layers size={13} /> This item has variants
                  </span>
                  <span className="text-[10px] text-muted-foreground block mt-0.5">
                    {convertToRegularMut.isPending
                      ? "Converting to regular item…"
                      : isParent
                        ? `Parent item — ${existingVariants.length} variant${existingVariants.length !== 1 ? "s" : ""} defined`
                        : "Enable to create variants like Left/Right, different sizes, colors, etc."}
                  </span>
                </div>
              </label>
            </div>

            {/* Confirm dialog for converting back to regular item */}
            {showConvertConfirm && (
              <>
                <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[2px]" onClick={() => setShowConvertConfirm(false)} />
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
                    <div className="mb-3 flex items-center gap-2 text-destructive">
                      <AlertCircle size={18} />
                      <h3 className="text-sm font-semibold">Remove All Variants?</h3>
                    </div>
                    <p className="mb-1 text-[12px] text-muted-foreground">
                      This will permanently delete:
                    </p>
                    <ul className="mb-4 ml-4 list-disc space-y-0.5 text-[12px] text-muted-foreground">
                      <li><span className="font-medium text-foreground">{existingVariants.length}</span> variant{existingVariants.length !== 1 ? "s" : ""} and their inventory records</li>
                      <li><span className="font-medium text-foreground">{optionTypes.length}</span> option type{optionTypes.length !== 1 ? "s" : ""} and all values</li>
                    </ul>
                    <p className="mb-4 text-[11px] text-destructive/80">
                      This action cannot be undone. The item will become a regular (non-variant) product.
                    </p>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowConvertConfirm(false)}
                        className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-muted"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={convertToRegularMut.isPending}
                        onClick={async () => {
                          try {
                            await convertToRegularMut.mutateAsync({ productId: productId! });
                            setIsParent(false);
                            setShowConvertConfirm(false);
                          } catch {
                            // error is in mutation state
                          }
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-destructive px-3 py-1.5 text-[12px] font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                      >
                        {convertToRegularMut.isPending ? (
                          <><Loader2 size={12} className="animate-spin" /> Converting…</>
                        ) : (
                          <><Trash2 size={12} /> Delete Variants & Convert</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </FormSection>

        {/* SECTION — Variants (for parent items) */}
        {isParent && (
          <FormSection
            id="variants"
            icon={Layers}
            title="Options & Variants"
            collapsed={collapsedSections.has("variants")}
            onToggle={() => toggleSection("variants")}
            badge={existingVariants.length > 0 ? `${existingVariants.length} variants` : undefined}
          >
            <div className="space-y-4">
              {/* ── OPTION TYPES ── */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-foreground">Option Types</span>
                  <button
                    type="button"
                    onClick={() => setOptionModalOpen(true)}
                    className="flex items-center gap-1 rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/20"
                  >
                    <Plus size={12} /> Add Option
                  </button>
                </div>

                {optionTypes.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-3 text-[12px] text-muted-foreground">
                    <Info size={13} />
                    <span>No options defined yet. Add options like "Side" (Left, Right) or "Color" (Black, Chrome) to generate variant combinations.</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {optionTypes.map((ot) => (
                      <div key={ot.id} className="rounded-lg border border-border bg-muted/10 px-3 py-2">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[12px] font-medium text-foreground">{ot.name}</span>
                          <button
                            type="button"
                            onClick={async () => {
                              if (confirm(`Delete option "${ot.name}" and all its values?`)) {
                                await deleteOptionMut.mutateAsync({ productId, typeId: ot.id });
                              }
                            }}
                            className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {ot.values.map((val) => (
                            <span
                              key={val.id}
                              className="group inline-flex items-center gap-1 rounded-full bg-background border border-border px-2.5 py-0.5 text-[11px] font-medium text-foreground"
                            >
                              {val.value}
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await deleteValueMut.mutateAsync({ productId, typeId: ot.id, valueId: val.id });
                                  } catch (err: any) {
                                    alert(err?.message || "Cannot delete value");
                                  }
                                }}
                                className="hidden group-hover:inline-flex ml-0.5 rounded-full p-0.5 text-muted-foreground hover:text-red-600"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                          <AddValueInline
                            onAdd={async (value) => {
                              await addValueMut.mutateAsync({ productId, typeId: ot.id, value });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── GENERATE VARIANTS ── */}
              {optionTypes.length > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2.5">
                  <div className="flex-1">
                    <span className="text-[12px] font-medium text-foreground">Generate Variants</span>
                    <p className="text-[10px] text-muted-foreground">
                      Creates all combinations from your options ({optionTypes.reduce((acc, ot) => acc * Math.max(ot.values.length, 1), 1)} possible)
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={createVariantBatchMut.isPending || optionTypes.some((ot) => ot.values.length === 0)}
                    onClick={async () => {
                      // Cartesian product of all option values
                      const valueSets = optionTypes.map((ot) => ot.values);
                      if (valueSets.some((vs) => vs.length === 0)) return;

                      const cartesian = valueSets.reduce<Array<Array<{ typeId: string; typeName: string; valueId: string; value: string }>>>(
                        (acc, vals, idx) => {
                          const typeName = optionTypes[idx].name;
                          const typeId = optionTypes[idx].id;
                          if (acc.length === 0) return vals.map((v) => [{ typeId, typeName, valueId: v.id, value: v.value }]);
                          return acc.flatMap((combo) =>
                            vals.map((v) => [...combo, { typeId, typeName, valueId: v.id, value: v.value }]),
                          );
                        },
                        [],
                      );

                      // Filter out combos that already exist
                      const existingCombos = new Set(
                        existingVariants.map((v) =>
                          v.options.map((o) => o.value).sort().join("|"),
                        ),
                      );

                      const newCombos = cartesian.filter(
                        (combo) => !existingCombos.has(combo.map((c) => c.value).sort().join("|")),
                      );

                      if (newCombos.length === 0) {
                        alert("All variant combinations already exist!");
                        return;
                      }

                      const baseSku = product?.sku ?? "ITEM";
                      const parentName = product?.name ?? "Item";
                      const variants = newCombos.map((combo, idx) => {
                        const suffix = combo.map((c) => c.value).join("-");
                        const nameSuffix = combo.map((c) => c.value).join(" / ");
                        return {
                          sku: `${baseSku}-${suffix}`.toUpperCase().replace(/\s+/g, "-").slice(0, 50),
                          name: `${parentName} — ${nameSuffix}`,
                          unitPrice: unitPrice || "0.00",
                          costPrice: costPrice || "0.00",
                          optionValueIds: combo.map((c) => c.valueId),
                        };
                      });

                      try {
                        await createVariantBatchMut.mutateAsync({ parentId: productId, variants });
                      } catch (err: any) {
                        alert(err?.message || "Failed to generate variants");
                      }
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {createVariantBatchMut.isPending ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Plus size={12} />
                    )}
                    Generate All Combinations
                  </button>
                </div>
              )}

              {/* ── EXISTING VARIANTS TABLE ── */}
              {existingVariants.length > 0 && (
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-foreground">Variants ({existingVariants.length})</span>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-left text-[11px] font-medium text-muted-foreground">
                          <th className="px-3 py-2 min-w-[180px]">Name</th>
                          <th className="px-3 py-2">Options</th>
                          <th className="px-3 py-2">SKU</th>
                          <th className="px-3 py-2 text-right w-[90px]">Sell</th>
                          {showCost && <th className="px-3 py-2 text-right w-[90px]">Cost</th>}
                          <th className="px-3 py-2 text-right">Stock</th>
                          <th className="px-3 py-2 w-[70px]"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {existingVariants.map((v) => (
                          <VariantTableRow
                            key={v.id}
                            variant={v}
                            parentId={productId}
                            showCost={showCost}
                            modifiedFields={modifiedVariants.get(v.id)}
                            onFieldChange={(field, value) => handleVariantFieldChange(v.id, field, value)}
                            onEdit={() => router.push(`/inventory/${v.id}/edit`)}
                            isDeleting={deletingVariantId === v.id}
                            onDelete={async () => {
                              if (!confirm(`Delete variant ${v.sku}?`)) return;
                              setDeletingVariantId(v.id);
                              try {
                                await deleteVariantMut.mutateAsync({ parentId: productId, variantId: v.id });
                              } catch (err: any) {
                                alert(err?.message || "Failed to delete variant");
                              } finally {
                                setDeletingVariantId(null);
                              }
                            }}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </FormSection>
        )}

        {/* Create Option Modal */}
        {optionModalOpen && (
          <CreateOptionModal
            onClose={() => setOptionModalOpen(false)}
            onSave={async (name, values) => {
              await createOptionMut.mutateAsync({ productId, name, values });
              setOptionModalOpen(false);
            }}
            saving={createOptionMut.isPending}
          />
        )}

        {/* SECTION 2 — Pricing */}
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
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </FormSection>

        {/* SECTION 3 — Inventory */}
        <FormSection
          id="inventory"
          icon={Warehouse}
          title="Inventory"
          collapsed={collapsedSections.has("inventory")}
          onToggle={() => toggleSection("inventory")}
        >
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3">
            <div>
              <FieldLabel>Current Stock</FieldLabel>
              <div className={cn(fieldClass, "flex items-center bg-muted/40 text-muted-foreground cursor-not-allowed")}>
                {(product.stockLevel ?? 0).toLocaleString()}
              </div>
              <Link
                href={`/inventory/${productId}/history`}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                <Clock size={12} />
                View stock history
              </Link>
            </div>
            <div>
              <FieldLabel>Barcode</FieldLabel>
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.slice(0, 50))}
                maxLength={50}
                className={cn(fieldClass, "font-mono")}
              />
            </div>
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

          {/* Primary Supplier */}
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Supplier</h4>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Primary Supplier</label>
              <select
                value={primarySupplierId ?? ""}
                onChange={(e) => setPrimarySupplierId(e.target.value || null)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">None</option>
                {suppliersList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Reorder Settings */}
          <div className="mt-4 border-t border-border/50 pt-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">Reorder</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={reorderEnabled}
                  onChange={(e) => setReorderEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                <label className="text-xs font-medium text-muted-foreground">Include in Reorder Suggestions</label>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Custom Reorder Point</label>
                <input
                  type="number"
                  min="0"
                  value={customReorderPoint ?? ""}
                  onChange={(e) => setCustomReorderPoint(e.target.value ? parseInt(e.target.value) : null)}
                  placeholder="Auto (from engine)"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <span className="text-[10px] text-muted-foreground">
                  {customReorderPoint ? `Fixed at ${customReorderPoint} units` : "Calculated dynamically by reorder engine"}
                </span>
              </div>
            </div>
          </div>
        </FormSection>

        {/* SECTION 4 — Store Availability */}
        <FormSection
          id="stores"
          icon={Store}
          title="Store Availability"
          collapsed={collapsedSections.has("stores")}
          onToggle={() => toggleSection("stores")}
          badge={totalLocations > 0 ? `${availableCount}/${totalLocations} stores` : undefined}
        >
          {locationsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              Loading locations...
            </div>
          ) : locationRows.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
              <Info size={13} />
              <span>No locations found. Add locations in Settings to manage availability.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Master toggle */}
              <label className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 cursor-pointer select-none hover:bg-muted/40 transition-colors">
                <input
                  type="checkbox"
                  checked={masterState === true}
                  ref={(el) => { if (el) el.indeterminate = masterState === "indeterminate"; }}
                  onChange={handleMasterToggle}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                <span className="text-[12px] font-medium">
                  {masterState === true ? "Deselect all" : "Select all"} — Available for sale
                </span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {availableCount} of {totalLocations}
                </span>
              </label>

              {/* Header row */}
              <div className="grid grid-cols-[24px_1fr_60px_70px_70px] gap-2 px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                <span />
                <span>Location</span>
                <span className="text-right">Stock</span>
                <span className="text-right">Reorder</span>
                <span className="text-right">Optimal</span>
              </div>

              {/* Location rows */}
              {locationRows.map((loc) => {
                const checked = localAvailability[loc.locationId] ?? false;
                const dirty =
                  localAvailability[loc.locationId] !== originalAvailability[loc.locationId] ||
                  localReorderPoints[loc.locationId] !== originalReorderPoints[loc.locationId] ||
                  localOptimalStocks[loc.locationId] !== originalOptimalStocks[loc.locationId];
                return (
                  <div
                    key={loc.locationId}
                    className={cn(
                      "grid grid-cols-[24px_1fr_60px_70px_70px] items-center gap-2 rounded-lg border px-3 py-2 transition-colors hover:bg-muted/30",
                      dirty
                        ? "border-amber-400 bg-amber-50/50 ring-1 ring-amber-300"
                        : "border-border",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => handleAvailabilityToggle(loc.locationId, e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                    />
                    <div className="min-w-0">
                      <span className="text-[13px] font-medium truncate block">{loc.locationName}</span>
                      <span className="text-[10px] text-muted-foreground capitalize">{loc.locationType?.toLowerCase().replace("_", " ") ?? ""}</span>
                    </div>
                    <span className={cn(
                      "text-right text-[12px] font-semibold tabular-nums",
                      loc.stockLevel === 0 ? "text-red-600" : "text-foreground",
                    )}>
                      {loc.stockLevel.toLocaleString()}
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={localReorderPoints[loc.locationId] ?? loc.reorderPoint}
                      onChange={(e) => setLocalReorderPoints((prev) => ({ ...prev, [loc.locationId]: parseInt(e.target.value) || 0 }))}
                      className="w-full rounded border border-transparent px-2 py-1 text-right text-[12px] tabular-nums hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent"
                    />
                    <input
                      type="number"
                      min="0"
                      value={localOptimalStocks[loc.locationId] ?? loc.optimalStock ?? 0}
                      onChange={(e) => setLocalOptimalStocks((prev) => ({ ...prev, [loc.locationId]: parseInt(e.target.value) || 0 }))}
                      className="w-full rounded border border-transparent px-2 py-1 text-right text-[12px] tabular-nums hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </FormSection>

        {/* SECTION 5 — Vehicle Compatibility */}
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
                <span>Vehicle compatibility is typically used for Hard Parts and Tires.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2 text-[12px] text-muted-foreground">
                <Info size={13} />
                <span>Specify which vehicles this part fits.</span>
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
                      <option value="">Select...</option>
                      {allMakes.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Model</FieldLabel>
                    <ModelInput token={token} locationId={locationId} make={v.make} value={v.model} onChange={(val) => updateVehicle(v.id, "model", val)} />
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
                    <input type="text" value={v.notes} onChange={(e) => updateVehicle(v.id, "notes", e.target.value)} placeholder="e.g. Front only" className={fieldClass} />
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
        excludeProductId={productId}
      />

      {/* Sticky Action Bar */}
      <div className={cn("fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-sm transition-[left] duration-200", isCollapsed ? "md:left-16" : "md:left-[252px]")}>
        <div className="flex items-center justify-between px-6 py-3">
          <button
            onClick={() => router.push("/inventory")}
            className="rounded-lg border border-border bg-background px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!isValid || updateMutation.isPending || !isDirty}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {updateMutation.isPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </button>
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
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">{"\u20B1"}</span>
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

function ModelInput({ token, locationId, make, value, onChange }: { token: string; locationId: string; make: string; value: string; onChange: (v: string) => void }) {
  const { data: modelsData } = useVehicleModels(token, locationId, make);
  const listId = useMemo(() => `models-${make}-${Math.random().toString(36).slice(2, 8)}`, [make]);
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

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setSearch("");
      setDebouncedSearch("");
      setSelectedProduct(null);
    }
  }, [open]);

  // Search products that have vehicle fitments
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

  // Fetch vehicles for selected product
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
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">Copy Vehicle Fitment from Another Item</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
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

        {/* Results */}
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

        {/* Preview selected product's fitments */}
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

        {/* Actions */}
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

/* ─────────────────────────────────────────────
 * Create Option Modal (Loyverse-style)
 * ───────────────────────────────────────────── */

function CreateOptionModal({
  onClose,
  onSave,
  saving,
}: {
  onClose: () => void;
  onSave: (name: string, values: string[]) => Promise<void>;
  saving: boolean;
}) {
  const [optName, setOptName] = useState("");
  const [valueInput, setValueInput] = useState("");
  const [values, setValues] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const addValue = () => {
    const trimmed = valueInput.trim();
    if (trimmed && !values.includes(trimmed)) {
      setValues((prev) => [...prev, trimmed]);
      setValueInput("");
      inputRef.current?.focus();
    }
  };

  const removeValue = (val: string) => {
    setValues((prev) => prev.filter((v) => v !== val));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addValue();
    }
    if (e.key === "Backspace" && valueInput === "" && values.length > 0) {
      setValues((prev) => prev.slice(0, -1));
    }
  };

  const canSave = optName.trim().length > 0 && values.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold">Create Option</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Option Name */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">Option Name</label>
            <input
              type="text"
              value={optName}
              onChange={(e) => setOptName(e.target.value)}
              placeholder="e.g. Side, Color, Size"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
              autoFocus
            />
          </div>

          {/* Values (tag-style) */}
          <div>
            <label className="mb-1 block text-[12px] font-medium text-muted-foreground">
              Values <span className="text-[10px] text-muted-foreground/60">(press Enter or comma to add)</span>
            </label>
            <div className="flex min-h-[40px] flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/[0.08]">
              {values.map((val) => (
                <span
                  key={val}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary"
                >
                  {val}
                  <button
                    type="button"
                    onClick={() => removeValue(val)}
                    className="rounded-full p-0.5 hover:bg-primary/20"
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                ref={inputRef}
                type="text"
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addValue}
                placeholder={values.length === 0 ? "e.g. Left, Right" : "Add more..."}
                className="min-w-[80px] flex-1 border-none bg-transparent px-1 py-0.5 text-[12px] outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            {values.length > 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">{values.length} value{values.length !== 1 ? "s" : ""}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={() => canSave && onSave(optName.trim(), values)}
            disabled={!canSave || saving}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create Option
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Inline Add Value Button (within option type row)
 * ───────────────────────────────────────────── */

function AddValueInline({ onAdd }: { onAdd: (value: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const handleSave = async () => {
    const trimmed = value.trim();
    if (!trimmed) { setEditing(false); return; }
    setSaving(true);
    try {
      await onAdd(trimmed);
      setValue("");
      inputRef.current?.focus();
    } catch (err: any) {
      alert(err?.message || "Failed to add value");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
      >
        <Plus size={10} /> Add
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); handleSave(); }
          if (e.key === "Escape") { setEditing(false); setValue(""); }
        }}
        onBlur={handleSave}
        placeholder="Value..."
        disabled={saving}
        className="w-[80px] rounded-full border border-primary/40 bg-background px-2 py-0.5 text-[11px] outline-none focus:ring-1 focus:ring-primary/20"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Variant Table Row — inline-editable Name, Sell, Cost
 * ───────────────────────────────────────────── */

function VariantTableRow({
  variant: v,
  parentId,
  showCost,
  modifiedFields,
  onFieldChange,
  onEdit,
  isDeleting,
  onDelete,
}: {
  variant: import("@/hooks/use-variants").VariantRow;
  parentId: string;
  showCost: boolean;
  modifiedFields?: { name?: string; unitPrice?: string; costPrice?: string };
  onFieldChange: (field: "name" | "unitPrice" | "costPrice", value: string) => void;
  onEdit: () => void;
  isDeleting: boolean;
  onDelete: () => void;
}) {
  const displayName = modifiedFields?.name ?? v.name;
  const displaySell = modifiedFields?.unitPrice ?? v.unitPrice;
  const displayCost = modifiedFields?.costPrice ?? v.costPrice;

  const inputCls = "w-full rounded border border-transparent px-2 py-1 text-[12px] hover:border-border focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 bg-transparent";

  return (
    <tr className="border-b border-border/50 hover:bg-muted/10">
      {/* Name — editable */}
      <td className="px-1 py-1">
        <input
          type="text"
          value={displayName}
          onChange={(e) => onFieldChange("name", e.target.value)}
          placeholder="Variant name..."
          className={cn(inputCls, "min-w-[160px] font-medium")}
        />
      </td>
      {/* Options */}
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {v.options.length > 0 ? (
            v.options.map((o, i) => (
              <span
                key={i}
                className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
              >
                {o.value}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-muted-foreground italic">No options</span>
          )}
        </div>
      </td>
      {/* SKU */}
      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{v.sku}</td>
      {/* Sell — editable */}
      <td className="px-1 py-1 text-right">
        <input
          type="number"
          step="0.01"
          min="0"
          value={displaySell}
          onChange={(e) => onFieldChange("unitPrice", e.target.value)}
          className={cn(inputCls, "w-[80px] text-right tabular-nums")}
        />
      </td>
      {/* Cost — editable */}
      {showCost && (
        <td className="px-1 py-1 text-right">
          <input
            type="number"
            step="0.01"
            min="0"
            value={displayCost}
            onChange={(e) => onFieldChange("costPrice", e.target.value)}
            className={cn(inputCls, "w-[80px] text-right tabular-nums")}
          />
        </td>
      )}
      {/* Stock */}
      <td className="px-3 py-2 text-right">
        <span className={cn(
          "inline-flex min-w-[28px] items-center justify-end rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
          v.stockLevel === 0 ? "bg-red-50 text-red-700" : "text-foreground",
        )}>
          {v.stockLevel}
        </span>
      </td>
      {/* Actions */}
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Edit variant"
          >
            <Settings size={13} />
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={onDelete}
            className="rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
            title="Delete variant"
          >
            {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </button>
        </div>
      </td>
    </tr>
  );
}
