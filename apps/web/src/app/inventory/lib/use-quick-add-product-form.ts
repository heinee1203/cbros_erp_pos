import { useEffect, useMemo, useState } from "react";
import { useBrands, useCreateBrand } from "@/hooks/use-brands";
import { useCategories, useCreateCategory } from "@/hooks/use-categories";
import { useLocations } from "@/hooks/use-locations";
import { useCreateProduct, useProductFamilies } from "@/hooks/use-products";
import { useCreateSubcategory, useSubcategories } from "@/hooks/use-subcategories";

type UseQuickAddProductFormArgs = {
  token: string;
  locationId: string;
  userRole: string;
  isAllLocations: boolean;
  onClose: () => void;
};

function familyToEnum(familyName: string): string {
  const n = familyName.toUpperCase();
  if (n.includes("TIRE")) return "TIRES";
  if (n.includes("LUBRIC") || n.includes("OIL") || n.includes("FLUID")) return "LUBRICANTS";
  if (n.includes("ACCESSOR")) return "ACCESSORIES";
  if (n.includes("LABOR") || n.includes("SERVICE")) return "LABOR_SERVICES";
  return "HARD_PARTS";
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function useQuickAddProductForm({
  token,
  locationId,
  userRole,
  isAllLocations,
  onClose,
}: UseQuickAddProductFormArgs) {
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
  const [enabledLocationIds, setEnabledLocationIds] = useState<Set<string>>(new Set());

  const { data: locationsData } = useLocations(token);
  const allLocations = useMemo(
    () => (locationsData?.data ?? []).filter((l) => l.isActive),
    [locationsData],
  );

  useEffect(() => {
    if (allLocations.length > 0 && enabledLocationIds.size === 0) {
      setEnabledLocationIds(new Set(allLocations.map((l) => l.id)));
    }
  }, [allLocations]); // Preserve original initialization behavior.

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

  const quickAddCategory = async (name: string) => {
    const res: any = await createCategoryMut.mutateAsync({
      name,
      slug: slugify(name),
      familyId: familyId || undefined,
    });
    return { id: res?.data?.id ?? res?.id ?? "" };
  };

  const quickAddSubcategory = async (name: string) => {
    const res: any = await createSubcategoryMut.mutateAsync({
      categoryId,
      name,
      slug: slugify(name),
    });
    return { id: res?.data?.id ?? res?.id ?? "" };
  };

  const quickAddBrand = async (name: string) => {
    const res: any = await createBrandMut.mutateAsync({ name, slug: slugify(name) });
    return { id: res?.data?.id ?? res?.id ?? "" };
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

  return {
    allLocations,
    barcode,
    brandId,
    brandsList,
    categoryId,
    costPrice,
    createMutation,
    enabledLocationIds,
    error,
    families,
    familyId,
    filteredCategories,
    handleCategoryChange,
    handleFamilyChange,
    handleSave,
    initialStock,
    isValid,
    name,
    oemNumber,
    quickAddBrand,
    quickAddCategory,
    quickAddSubcategory,
    setBarcode,
    setBrandId,
    setCostPrice,
    setInitialStock,
    setName,
    setOemNumber,
    setSku,
    setSubcategoryId,
    setTrackInventory,
    setUnitPrice,
    showCost,
    sku,
    subcategories,
    subcategoryId,
    toggleAllLocations,
    toggleLocation,
    trackInventory,
    unitPrice,
  };
}
