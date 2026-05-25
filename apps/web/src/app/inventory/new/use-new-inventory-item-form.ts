"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import type { LocationInfo } from "@/app/auth-context";
import { useBrands, useCreateBrand } from "@/hooks/use-brands";
import { useCategories, useCreateCategory } from "@/hooks/use-categories";
import { useProductFamilies, useCreateProduct } from "@/hooks/use-products";
import { useCreateSubcategory, useSubcategories } from "@/hooks/use-subcategories";
import { useVehicleMakes } from "@/hooks/use-vehicles";
import { mergeVehicleMakes } from "@/lib/vehicle-makes";

import type {
  AttributeEntry,
  InlineVariant,
  OptionTypeEntry,
  VehicleEntry,
} from "./types";
import {
  createAttributeEntry,
  createInlineVariant,
  createOptionTypeEntry,
  createVehicleEntry,
  makeSlug,
} from "./form-helpers";
import { mergeCopiedFitments } from "./fitment-utils";
import { buildNewItemPayload } from "./payload";
import { familyToEnum } from "./utils";
import { generateVariants } from "./variant-utils";

type UseNewInventoryItemFormOptions = {
  token: string;
  locationId: string;
  role?: string;
  locations: LocationInfo[];
  onCreated: () => void;
};

export function useNewInventoryItemForm({
  token,
  locationId,
  role,
  locations,
  onCreated,
}: UseNewInventoryItemFormOptions) {
  const createMutation = useCreateProduct(token, locationId);
  const familiesQuery = useProductFamilies(token, locationId);
  const categoriesQuery = useCategories(token, locationId, { activeOnly: true });
  const brandsQuery = useBrands(token, locationId);
  const createBrandMut = useCreateBrand(token, locationId);
  const createCategoryMut = useCreateCategory(token, locationId);
  const createSubcategoryMut = useCreateSubcategory(token, locationId);
  const { data: dbMakesData } = useVehicleMakes(token, locationId);

  const families = familiesQuery.data?.data ?? [];
  const allCategories = categoriesQuery.data?.data ?? [];
  const brandsList = brandsQuery.data?.data ?? [];
  const allMakes = useMemo(
    () => mergeVehicleMakes(dbMakesData?.data ?? []),
    [dbMakesData],
  );
  const showCost = ["ADMIN", "MANAGER"].includes(role ?? "");

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [inlineVariants, setInlineVariants] = useState<InlineVariant[]>([]);
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [unitPrice, setUnitPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);
  const [unitOfMeasure, setUnitOfMeasure] = useState("Each");
  const [reorderPoint, setReorderPoint] = useState("5");
  const [optimalStock, setOptimalStock] = useState("0");
  const [leadTimeDays, setLeadTimeDays] = useState("7");
  const [barcode, setBarcode] = useState("");
  const [oemNumber, setOemNumber] = useState("");
  const [initialStock, setInitialStock] = useState("0");
  const [unitsPerCase, setUnitsPerCase] = useState(1);
  const [packagingUnit, setPackagingUnit] = useState<string | null>(null);
  const [sellingUnit, setSellingUnit] = useState("piece");
  const [purchaseUnit, setPurchaseUnit] = useState("");
  const [conversionFactor, setConversionFactor] = useState("1");
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(() => {
    if (locationId === "ALL" && locations.length > 0) {
      return new Set(locations.map((location) => location.id));
    }
    return new Set([locationId]);
  });
  const [attributes, setAttributes] = useState<AttributeEntry[]>([]);
  const [hasVariants, setHasVariants] = useState(false);
  const [optionTypes, setOptionTypes] = useState<OptionTypeEntry[]>([]);
  const [variantPrices, setVariantPrices] = useState<Record<string, string>>({});
  const [vehicles, setVehicles] = useState<VehicleEntry[]>([]);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [savingStep, setSavingStep] = useState<string | null>(null);

  const hasInlineVariants = inlineVariants.length > 0;
  const filteredCategories = familyId
    ? allCategories.filter((category) => category.familyId === familyId)
    : [];
  const subcategoriesQuery = useSubcategories(token, locationId, categoryId || undefined);
  const subcategories = (subcategoriesQuery.data?.data ?? []).filter(
    (subcategory) => !categoryId || subcategory.categoryId === categoryId,
  );
  const selectedFamily = families.find((family) => family.id === familyId);

  const isDirty = !!(
    name ||
    sku ||
    familyId ||
    unitPrice ||
    costPrice ||
    description ||
    barcode
  );

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const margin = useMemo(() => {
    const sell = parseFloat(unitPrice) || 0;
    const cost = parseFloat(costPrice) || 0;
    if (sell <= 0) return null;
    return (((sell - cost) / sell) * 100).toFixed(1);
  }, [unitPrice, costPrice]);

  const isValid =
    name.trim() !== "" &&
    (hasInlineVariants || sku.trim() !== "") &&
    familyId !== "" &&
    (!hasInlineVariants ||
      inlineVariants.every((variant) => variant.suffix.trim() && variant.sku.trim()));

  const isSaving = createMutation.isPending || !!savingStep;

  const handleFamilyChange = (id: string) => {
    setFamilyId(id);
    setCategoryId("");
    setSubcategoryId("");
  };

  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    setSubcategoryId("");
  };

  const quickAddCategory = async (value: string) => {
    const slug = makeSlug(value);
    const res: any = await createCategoryMut.mutateAsync({
      name: value,
      slug,
      familyId: familyId || undefined,
    });
    return { id: res?.data?.id ?? res?.id ?? "" };
  };

  const quickAddSubcategory = async (value: string) => {
    const slug = makeSlug(value);
    const res: any = await createSubcategoryMut.mutateAsync({
      categoryId,
      name: value,
      slug,
    });
    return { id: res?.data?.id ?? res?.id ?? "" };
  };

  const quickAddBrand = async (value: string) => {
    const slug = makeSlug(value);
    const res: any = await createBrandMut.mutateAsync({ name: value, slug });
    return { id: res?.data?.id ?? res?.id ?? "" };
  };

  const addInlineVariant = () => {
    setInlineVariants((prev) => [
      ...prev,
      createInlineVariant({ unitPrice, costPrice }),
    ]);
  };

  const updateInlineVariant = (
    id: string,
    field: keyof InlineVariant,
    value: string,
  ) => {
    setInlineVariants((prev) =>
      prev.map((variant) =>
        variant.id === id ? { ...variant, [field]: value } : variant,
      ),
    );
  };

  const removeInlineVariant = (id: string) => {
    setInlineVariants((prev) => prev.filter((variant) => variant.id !== id));
  };

  const toggleSelectedLocation = (id: string) => {
    setSelectedLocations((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addAttribute = () => {
    setAttributes((prev) => [...prev, createAttributeEntry()]);
  };

  const updateAttribute = (
    id: string,
    field: keyof AttributeEntry,
    value: string,
  ) => {
    setAttributes((prev) =>
      prev.map((attribute) =>
        attribute.id === id ? { ...attribute, [field]: value } : attribute,
      ),
    );
  };

  const removeAttribute = (id: string) => {
    setAttributes((prev) => prev.filter((attribute) => attribute.id !== id));
  };

  const addOptionType = () => {
    setOptionTypes((prev) => [...prev, createOptionTypeEntry()]);
  };

  const updateOptionType = (
    id: string,
    field: keyof OptionTypeEntry,
    value: string,
  ) => {
    setOptionTypes((prev) =>
      prev.map((option) =>
        option.id === id ? { ...option, [field]: value } : option,
      ),
    );
  };

  const removeOptionType = (id: string) => {
    setOptionTypes((prev) => prev.filter((option) => option.id !== id));
  };

  const generatedVariants = useMemo(
    () => generateVariants({ optionTypes, sku, variantPrices }),
    [optionTypes, sku, variantPrices],
  );

  const handleVariantPriceChange = (key: string, value: string) => {
    setVariantPrices((prev) => ({ ...prev, [key]: value }));
  };

  const addVehicle = () => {
    setVehicles((prev) => [...prev, createVehicleEntry()]);
  };

  const updateVehicle = (
    id: string,
    field: keyof VehicleEntry,
    value: string,
  ) => {
    setVehicles((prev) =>
      prev.map((vehicle) =>
        vehicle.id === id ? { ...vehicle, [field]: value } : vehicle,
      ),
    );
  };

  const removeVehicle = (id: string) => {
    setVehicles((prev) => prev.filter((vehicle) => vehicle.id !== id));
  };

  const handleCopyFitments = (copiedEntries: VehicleEntry[]) => {
    setVehicles((prev) => {
      const result = mergeCopiedFitments(prev, copiedEntries);
      if (result.skippedCount > 0) {
        toast.info(
          `Copied ${result.copiedCount} entries (${result.skippedCount} duplicates skipped)`,
        );
      }
      return result.entries;
    });
  };

  const resetForAddAnother = () => {
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
  };

  const handleSave = async (addAnother = false) => {
    if (!isValid) return;
    setError(null);
    setSuccessMessage(null);
    setSavingStep(null);

    try {
      setSavingStep(hasInlineVariants ? "Creating parent + variants..." : null);
      await createMutation.mutateAsync(
        buildNewItemPayload({
          name,
          sku,
          hasInlineVariants,
          selectedFamilyName: selectedFamily?.name ?? "",
          unitPrice,
          showCost,
          costPrice,
          barcode,
          oemNumber,
          familyId,
          categoryId,
          subcategoryId,
          brandId,
          description,
          trackInventory,
          reorderPoint,
          optimalStock,
          leadTimeDays,
          unitsPerCase,
          packagingUnit,
          sellingUnit,
          purchaseUnit,
          conversionFactor,
          initialStock,
          selectedLocations,
          vehicles,
          inlineVariants,
        }),
      );

      setSavingStep(null);

      if (addAnother) {
        setSuccessMessage(
          `"${name}" created successfully${
            hasInlineVariants ? ` with ${inlineVariants.length} variants` : ""
          }`,
        );
        resetForAddAnother();
      } else {
        onCreated();
      }
    } catch (err: any) {
      setSavingStep(null);
      setError(err?.message || "Failed to create item");
    }
  };

  return {
    basic: {
      name,
      onNameChange: setName,
      sku,
      onSkuChange: setSku,
      familyId,
      onFamilyChange: handleFamilyChange,
      families,
      categoryId,
      onCategoryChange: handleCategoryChange,
      categories: filteredCategories,
      subcategoryId,
      onSubcategoryChange: setSubcategoryId,
      subcategories,
      brandId,
      onBrandChange: setBrandId,
      brands: brandsList,
      hasInlineVariants,
      inlineVariants,
      showCost,
      onAddInlineVariant: addInlineVariant,
      onUpdateInlineVariant: updateInlineVariant,
      onRemoveInlineVariant: removeInlineVariant,
      onClearInlineVariants: () => setInlineVariants([]),
      description,
      onDescriptionChange: setDescription,
      isActive,
      onActiveChange: setIsActive,
      onQuickAddCategory: quickAddCategory,
      onQuickAddSubcategory: quickAddSubcategory,
      onQuickAddBrand: quickAddBrand,
    },
    pricing: {
      showCost,
      unitPrice,
      onUnitPriceChange: setUnitPrice,
      costPrice,
      onCostPriceChange: setCostPrice,
      margin,
    },
    inventory: {
      trackInventory,
      onTrackInventoryChange: setTrackInventory,
      unitOfMeasure,
      onUnitOfMeasureChange: setUnitOfMeasure,
      reorderPoint,
      onReorderPointChange: setReorderPoint,
      optimalStock,
      onOptimalStockChange: setOptimalStock,
      leadTimeDays,
      onLeadTimeDaysChange: setLeadTimeDays,
      initialStock,
      onInitialStockChange: setInitialStock,
      barcode,
      onBarcodeChange: setBarcode,
      oemNumber,
      onOemNumberChange: setOemNumber,
      unitsPerCase,
      onUnitsPerCaseChange: setUnitsPerCase,
      packagingUnit,
      onPackagingUnitChange: setPackagingUnit,
      sellingUnit,
      onSellingUnitChange: setSellingUnit,
      purchaseUnit,
      onPurchaseUnitChange: setPurchaseUnit,
      conversionFactor,
      onConversionFactorChange: setConversionFactor,
      costPrice,
      unitPrice,
    },
    locations: {
      locations,
      selectedLocations,
      onToggleLocation: toggleSelectedLocation,
    },
    variants: {
      hasVariants,
      onHasVariantsChange: setHasVariants,
      optionTypes,
      generatedVariants,
      variantPrices,
      onVariantPriceChange: handleVariantPriceChange,
      unitPrice,
      onAddOptionType: addOptionType,
      onUpdateOptionType: updateOptionType,
      onRemoveOptionType: removeOptionType,
    },
    attributes: {
      attributes,
      onAddAttribute: addAttribute,
      onUpdateAttribute: updateAttribute,
      onRemoveAttribute: removeAttribute,
    },
    vehicles: {
      selectedFamilyEnum: familyToEnum(selectedFamily?.name ?? ""),
      vehicles,
      allMakes,
      token,
      locationId,
      onAddVehicle: addVehicle,
      onUpdateVehicle: updateVehicle,
      onRemoveVehicle: removeVehicle,
      onCopyFromItem: () => setCopyModalOpen(true),
    },
    fitmentModal: {
      open: copyModalOpen,
      onClose: () => setCopyModalOpen(false),
      onCopy: handleCopyFitments,
      token,
      locationId,
    },
    status: {
      error,
      successMessage,
      isValid,
      isSaving,
      savingStep,
      hasVariants,
    },
    actions: {
      handleSave,
    },
  };
}

export type NewInventoryItemFormController = ReturnType<
  typeof useNewInventoryItemForm
>;
