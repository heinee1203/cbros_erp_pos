"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Search,
  Plus,
  Upload,
  Download,
  Trash2,
  ArrowUpDown,
  X,
  Loader2,
  Layers,
  FileUp,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useProducts, useDeleteProduct, useProductFamilies, type ProductRow, type SortField, type SortDir } from "@/hooks/use-products";
import { apiFetch } from "@/lib/api";
import { useCategories } from "@/hooks/use-categories";
import { useSubcategories } from "@/hooks/use-subcategories";
import { useBrands } from "@/hooks/use-brands";
import { useAuth, ALL_LOCATIONS } from "@/app/auth-context";
import { useLocations, type LocationRow } from "@/hooks/use-locations";
import { useConfirm } from "@/components/confirm-dialog";
import { cn } from "@/lib/utils";
import { DrillDownView } from "./drill-down";
import { SortableHeader, StockPill, StockPopover, RowActions, ParentAwareCheckbox, FlatProductRow, VariantSubRows } from "./components/inventory-table";
import { DetailDrawer } from "./components/detail-drawer";
import { QuickAddDrawer } from "./components/quick-add-drawer";
import { AdjustModal } from "./components/adjust-modal";
import { TransferModal } from "./components/transfer-modal";
import { SearchableSelect } from "./components/searchable-select";
import { ModalShell } from "./components/modal-shell";
import { EmptyState } from "./components/empty-state";
import { PAGE_SIZES, DEFAULT_PAGE_SIZE, getStockStatus, formatPrice, getVariantDescriptor, type StockStatus } from "./lib/inventory-utils";

interface ExportProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  oemNumber: string | null;
  description: string | null;
  unitPrice: string;
  costPrice: string;
  isVariablePrice: boolean;
  isParent: boolean;
  parentProductId: string | null;
  unitsPerCase: number;
  packagingUnit: string | null;
  handle: string;
  familyName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  brandName: string | null;
  locations: Array<{
    locationId: string;
    locationName: string;
    availableForSale: boolean;
    stockLevel: number;
    reorderPoint: number;
    optimalStock: number;
  }>;
}

interface ExportResponse {
  data: ExportProduct[];
  locations: Array<{ id: string; name: string }>;
}

/* ─────────────────────────────────────────────
 * Bulk Dropdown — searchable picker for bulk actions
 * ───────────────────────────────────────────── */
function BulkDropdown({ label, options, onSelect }: {
  label: string;
  options: { id: string; name: string }[];
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors"
      >
        Change {label}
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 w-56 rounded-lg border border-border bg-background shadow-lg z-50">
          <div className="p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full rounded border border-border px-2 py-1.5 text-xs bg-background text-foreground"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground">No results</div>
            )}
            {filtered.map(opt => (
              <button
                key={opt.id}
                onClick={() => { onSelect(opt.id); setOpen(false); setSearch(""); }}
                className="w-full px-3 py-1.5 text-left text-xs hover:bg-accent transition-colors"
              >
                {opt.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Page Root
 * ───────────────────────────────────────────── */
export default function InventoryPage() {
  const { token, locationId, apiLocationId, user } = useAuth();

  const locationsQuery = useLocations(token);
  const orgLocations = useMemo(() => {
    return (locationsQuery.data?.data ?? []).filter((l: LocationRow) => l.isActive);
  }, [locationsQuery.data]);

  const isAllLocations = locationId === ALL_LOCATIONS;

  const showFinancials = true;

  /* State */
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subCategoryFilter, setSubCategoryFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  /* Import modal state */
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<Array<{
    row: number; sku: string; name: string; action: "create" | "update" | "error"; error?: string;
    raw: Record<string, string>;
  }>>([]);
  const [importStats, setImportStats] = useState<{ created: number; updated: number; errors: number } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "done">("upload");
  const importFileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  /* View mode — independent of sort */
  const [viewMode, setViewMode] = useState<"flat" | "nested">("flat");
  const effectiveViewMode = debouncedSearch.length >= 2 ? "flat" : viewMode;

  /* Expand/collapse state for parent products (variants) */
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());

  /* Debounce search input */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  /* Fetch product families for Group filter */
  const familiesQuery = useProductFamilies(token, apiLocationId);
  const families = useMemo(() => {
    const fams = familiesQuery.data?.data ?? [];
    return [...fams].sort((a, b) => a.name.localeCompare(b.name));
  }, [familiesQuery.data]);

  /* Fetch categories for Category filter — cascaded by selected family */
  const categoriesQuery = useCategories(token, apiLocationId);
  const filteredCategories = useMemo(() => {
    const cats = categoriesQuery.data?.data ?? [];
    const sorted = [...cats].sort((a, b) => a.name.localeCompare(b.name));
    if (!familyFilter) return sorted;
    return sorted.filter((c) => c.familyId === familyFilter);
  }, [categoriesQuery.data, familyFilter]);

  /* Fetch sub-categories for Sub-cat filter — cascaded by selected category */
  const subcategoriesQuery = useSubcategories(token, apiLocationId, categoryFilter || undefined);
  const filteredSubcategories = useMemo(() => {
    const subs = subcategoriesQuery.data?.data ?? [];
    return [...subs].sort((a, b) => a.name.localeCompare(b.name));
  }, [subcategoriesQuery.data]);

  /* Fetch brands for Brand filter */
  const brandsQuery = useBrands(token, apiLocationId);
  const brandsList = useMemo(() => {
    const brands = brandsQuery.data?.data ?? [];
    return [...brands].sort((a, b) => a.name.localeCompare(b.name));
  }, [brandsQuery.data]);

  /* Reset page when filters / sort / location / pageSize change */
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, familyFilter, categoryFilter, subCategoryFilter, stockStatusFilter, brandFilter, sortBy, sortDir, locationId, pageSize, viewMode]);

  /* Fetch real data */
  const { data, isLoading, isFetching } = useProducts(token, apiLocationId, {
    search: debouncedSearch,
    familyId: familyFilter || undefined,
    subCategoryId: categoryFilter || undefined,
    subcategoryId: subCategoryFilter || undefined,
    stockStatus: stockStatusFilter,
    brandId: brandFilter || undefined,
    sortBy,
    sortDir,
    page,
    limit: pageSize,
    parentOnly: true,
    allLocations: isAllLocations,
  });

  const products = data?.data ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const hasMore = data?.hasMore ?? false;

  /* Sort toggle: asc -> desc -> reset to name asc */
  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortBy) {
        if (sortDir === "asc") {
          setSortDir("desc");
        } else {
          setSortBy("name");
          setSortDir("asc");
        }
      } else {
        setSortBy(field);
        setSortDir("asc");
      }
    },
    [sortBy, sortDir],
  );

  const hasActiveFilters =
    familyFilter !== "" || categoryFilter !== "" || subCategoryFilter !== "" || stockStatusFilter !== "" || brandFilter !== "" || searchQuery.trim() !== "";

  const clearAllFilters = useCallback(() => {
    setFamilyFilter("");
    setCategoryFilter("");
    setSubCategoryFilter("");
    setStockStatusFilter("");
    setBrandFilter("");
    setSearchQuery("");
    setDebouncedSearch("");
  }, []);

  /* ── CSV Export helpers ── */
  const escapeCSVCell = useCallback((value: string): string => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }, []);

  const buildCSV = useCallback((items: ExportProduct[], locs: Array<{ id: string; name: string }>): string => {
    const staticHeaders = [
      "Handle", "Name", "SKU", "Barcode", "OEM Number",
      "Family", "Category", "Sub-category", "Brand",
      "Default Price", "Cost", "Variable Price", "Track Stock", "Description",
      "Units per Case", "Packaging Unit",
    ];
    const locationHeaders = locs.flatMap((loc) => [
      `Available for sale [${loc.name}]`,
      `Price [${loc.name}]`,
      `In stock [${loc.name}]`,
      `Low stock [${loc.name}]`,
      `Optimal stock [${loc.name}]`,
    ]);
    const headers = [...staticHeaders, ...locationHeaders];
    const lines = [headers.map(escapeCSVCell).join(",")];

    for (const item of items) {
      const staticCells = [
        item.handle ?? "",
        item.name ?? "",
        item.sku ?? "",
        item.barcode ?? "",
        item.oemNumber ?? "",
        item.familyName ?? "",
        item.categoryName ?? "",
        item.subcategoryName ?? "",
        item.brandName ?? "",
        item.unitPrice ?? "0.00",
        item.costPrice ?? "0.00",
        item.isVariablePrice ? "Y" : "N",
        "Y",
        item.description ?? "",
        String(item.unitsPerCase ?? 1),
        item.packagingUnit ?? "",
      ];
      const locationCells = locs.flatMap((loc) => {
        const inv = item.locations.find((l) => l.locationId === loc.id);
        return [
          inv?.availableForSale ? "Y" : "N",
          "",
          String(inv?.stockLevel ?? 0),
          String(inv?.reorderPoint ?? 0),
          String(inv?.optimalStock ?? 0),
        ];
      });
      lines.push([...staticCells, ...locationCells].map(escapeCSVCell).join(","));
    }
    return "\uFEFF" + lines.join("\n");
  }, [escapeCSVCell]);

  const downloadCSV = useCallback((csv: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `apex-items-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleExport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      if (debouncedSearch && debouncedSearch.length >= 2) params.set("search", debouncedSearch);
      if (familyFilter) params.set("familyId", familyFilter);
      if (categoryFilter) params.set("subCategoryId", categoryFilter);
      if (subCategoryFilter) params.set("subcategoryId", subCategoryFilter);
      if (stockStatusFilter) params.set("stockStatus", stockStatusFilter);
      if (brandFilter) params.set("brandId", brandFilter);

      const resp = await apiFetch<ExportResponse>(
        `/products/export?${params.toString()}`,
        { token, locationId: apiLocationId },
      );
      downloadCSV(buildCSV(resp.data, resp.locations));
    } catch {
      // Silent fail — user can retry
    }
  }, [sortBy, sortDir, debouncedSearch, familyFilter, categoryFilter, subCategoryFilter, stockStatusFilter, brandFilter, token, apiLocationId, buildCSV, downloadCSV]);

  const handleExportSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      const resp = await apiFetch<ExportResponse>(
        `/products/export`,
        { token, locationId: apiLocationId },
      );
      const selected = resp.data.filter((p) => selectedIds.has(p.id));
      downloadCSV(buildCSV(selected, resp.locations));
    } catch {}
  }, [selectedIds, token, apiLocationId, buildCSV, downloadCSV]);

  /* ── CSV Import helpers ── */
  const handleDownloadTemplate = useCallback(() => {
    const locs = orgLocations;
    const staticHeaders = [
      "Handle", "Name", "SKU", "Barcode", "OEM Number",
      "Family", "Category", "Sub-category", "Brand",
      "Default Price", "Cost", "Variable Price", "Track Stock", "Description",
      "Units per Case", "Packaging Unit",
    ];
    const locationHeaders = locs.flatMap((loc: LocationRow) => [
      `Available for sale [${loc.name}]`,
      `Price [${loc.name}]`,
      `In stock [${loc.name}]`,
      `Low stock [${loc.name}]`,
      `Optimal stock [${loc.name}]`,
    ]);
    const headers = [...staticHeaders, ...locationHeaders];

    const staticSample = [
      "sample-handle", "Sample Brake Pad", "SAMPLE-001", "1234567890123", "MB-000001",
      "Brakes", "Brake Pad", "", "AKEBONO",
      "2500.00", "1630.00", "N", "Y", "Sample item - delete this row",
      "1", "",
    ];
    const locationSample = locs.flatMap(() => ["Y", "", "0", "10", "25"]);
    const sampleRow = [...staticSample, ...locationSample];

    const csv = "\uFEFF" + headers.map(escapeCSVCell).join(",") + "\n" + sampleRow.map(escapeCSVCell).join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "apex-item-import-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [orgLocations, escapeCSVCell]);

  const parseImportCSV = useCallback((text: string): { rows: Record<string, string>[]; rawHeaders: string[] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length < 2) return { rows: [], rawHeaders: [] };

    // Parse a CSV line handling quoted fields
    const parseLine = (line: string): string[] => {
      const cells: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') {
            current += '"';
            i++;
          } else if (ch === '"') {
            inQuotes = false;
          } else {
            current += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === ",") {
            cells.push(current.trim());
            current = "";
          } else {
            current += ch;
          }
        }
      }
      cells.push(current.trim());
      return cells;
    };

    const headerCells = parseLine(lines[0]);
    // Normalize header names: lowercase, strip non-alphanumeric
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const headers = headerCells.map(normalize);

    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cells = parseLine(lines[i]);
      if (cells.every((c) => c === "")) continue;
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = cells[idx] ?? "";
      });
      rows.push(row);
    }
    return { rows, rawHeaders: headerCells };
  }, []);

  const mapCSVRowToPayload = useCallback((row: Record<string, string>, rawHeaders: string[]) => {
    const get = (...keys: string[]) => {
      for (const k of keys) {
        const normalized = k.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (row[normalized] !== undefined && row[normalized] !== "") return row[normalized];
      }
      return "";
    };

    // Detect per-location columns
    const locNameSet = new Set<string>();
    for (const h of rawHeaders) {
      const match = h.match(/^(?:Available for sale|In stock|Low stock|Optimal stock|Price)\s*\[(.+)\]$/i);
      if (match) locNameSet.add(match[1]);
    }

    const locationData: Array<{
      locationName: string;
      availableForSale: boolean;
      price: string | null;
      inStock: number;
      lowStock: number;
      optimalStock: number;
    }> = [];

    for (const locName of locNameSet) {
      const findVal = (prefix: string) => {
        const target = `${prefix}${locName}`.toLowerCase().replace(/[^a-z0-9]/g, "");
        for (const [k, v] of Object.entries(row)) {
          if (k.replace(/[^a-z0-9]/g, "") === target) return v;
        }
        return "";
      };

      locationData.push({
        locationName: locName,
        availableForSale: findVal("availableforsale").toUpperCase() === "Y",
        price: findVal("price") || null,
        inStock: parseInt(findVal("instock")) || 0,
        lowStock: parseInt(findVal("lowstock")) || 0,
        optimalStock: parseInt(findVal("optimalstock")) || 0,
      });
    }

    return {
      name: get("name"),
      sku: get("sku"),
      handle: get("handle"),
      barcode: get("barcode"),
      oemNumber: get("oemnumber", "oem number"),
      family: get("family"),
      category: get("category"),
      subcategory: get("subcategory", "sub-category"),
      brand: get("brand"),
      unitPrice: get("defaultprice", "default price", "sellprice", "unitprice"),
      costPrice: get("cost", "costprice", "cost price"),
      description: get("description"),
      isVariablePrice: ["yes", "y", "true", "1"].includes(get("variableprice", "variable price").toLowerCase()),
      trackStock: !["no", "n", "false", "0"].includes(get("trackstock", "track stock").toLowerCase()),
      unitsPerCase: parseInt(get("unitspercase", "units per case")) || undefined,
      packagingUnit: get("packagingunit", "packaging unit") || undefined,
      locations: locationData.length > 0 ? locationData : undefined,
    };
  }, []);

  const handleImportFileUpload = useCallback(async (file: File) => {
    setImportFile(file);
    setImportLoading(true);
    try {
      const text = await file.text();
      const { rows: parsed, rawHeaders } = parseImportCSV(text);
      if (parsed.length === 0) {
        setImportPreview([{ row: 0, sku: "", name: "", action: "error", error: "No data rows found", raw: {} }]);
        setImportStats({ created: 0, updated: 0, errors: 1 });
        setImportStep("preview");
        return;
      }
      const payload = parsed.map((r) => mapCSVRowToPayload(r, rawHeaders));
      const resp = await apiFetch<{
        dryRun: boolean;
        created: number;
        updated: number;
        errors: Array<{ row: number; sku: string; error: string }>;
        results: Array<{ row: number; sku: string; name: string; action: "create" | "update" }>;
      }>("/products/import", {
        method: "POST",
        token,
        locationId: apiLocationId,
        body: JSON.stringify({ dryRun: true, rows: payload }),
      });

      const preview: typeof importPreview = [];
      for (const r of resp.results) {
        preview.push({ row: r.row, sku: r.sku, name: r.name, action: r.action, raw: parsed[r.row] ?? {} });
      }
      for (const e of resp.errors) {
        preview.push({ row: e.row, sku: e.sku, name: parsed[e.row]?.name ?? "", action: "error", error: e.error, raw: parsed[e.row] ?? {} });
      }
      preview.sort((a, b) => a.row - b.row);
      setImportPreview(preview);
      setImportStats({ created: resp.created, updated: resp.updated, errors: resp.errors.length });
      setImportStep("preview");
    } catch (err) {
      setImportPreview([{ row: 0, sku: "", name: "", action: "error", error: err instanceof Error ? err.message : "Import failed", raw: {} }]);
      setImportStats({ created: 0, updated: 0, errors: 1 });
      setImportStep("preview");
    } finally {
      setImportLoading(false);
    }
  }, [parseImportCSV, mapCSVRowToPayload, token, apiLocationId]);

  const handleImportExecute = useCallback(async () => {
    if (!importFile) return;
    setImportLoading(true);
    try {
      const text = await importFile.text();
      const { rows: parsed, rawHeaders } = parseImportCSV(text);
      const payload = parsed.map((r) => mapCSVRowToPayload(r, rawHeaders));
      const resp = await apiFetch<{
        dryRun: boolean;
        created: number;
        updated: number;
        errors: Array<{ row: number; sku: string; error: string }>;
        results: Array<{ row: number; sku: string; name: string; action: "create" | "update" }>;
      }>("/products/import", {
        method: "POST",
        token,
        locationId: apiLocationId,
        body: JSON.stringify({ dryRun: false, rows: payload }),
      });
      setImportStats({ created: resp.created, updated: resp.updated, errors: resp.errors.length });
      setImportStep("done");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      setImportStats((prev) => prev ? { ...prev, errors: prev.errors + 1 } : { created: 0, updated: 0, errors: 1 });
    } finally {
      setImportLoading(false);
    }
  }, [importFile, parseImportCSV, mapCSVRowToPayload, token, apiLocationId, queryClient]);

  const resetImport = useCallback(() => {
    setImportFile(null);
    setImportPreview([]);
    setImportStats(null);
    setImportLoading(false);
    setImportStep("upload");
    if (importFileRef.current) importFileRef.current.value = "";
  }, []);

  /* Bulk selection — parent checkbox selects all variants */
  const selectableIds = useMemo(() => products.map((p) => p.id), [products]);
  const allOnPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  /** Toggle a standalone (non-parent) item */
  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Toggle a parent item — selects/deselects parent + ALL its variant IDs */
  const toggleParentSelection = useCallback((parentId: string, variantIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
        variantIds.forEach((vid) => next.delete(vid));
      } else {
        next.add(parentId);
        variantIds.forEach((vid) => next.add(vid));
      }
      return next;
    });
  }, []);

  /** Toggle an individual variant — updates parent state automatically */
  const toggleVariantSelection = useCallback((variantId: string, parentId: string, allVariantIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) {
        next.delete(variantId);
        const anyStillSelected = allVariantIds.some((vid) => vid !== variantId && next.has(vid));
        if (!anyStillSelected) next.delete(parentId);
      } else {
        next.add(variantId);
        const allNowSelected = allVariantIds.every((vid) => vid === variantId || next.has(vid));
        if (allNowSelected) next.add(parentId);
      }
      return next;
    });
  }, []);

  /** Get check state for a parent row: true | false | "indeterminate" */
  const getParentCheckState = useCallback((parentId: string, variantIds: string[]): boolean | "indeterminate" => {
    const parentSelected = selectedIds.has(parentId);
    const allVariantsSelected = variantIds.length > 0 && variantIds.every((id) => selectedIds.has(id));
    const someVariantsSelected = variantIds.some((id) => selectedIds.has(id));
    if (parentSelected && allVariantsSelected) return true;
    if (someVariantsSelected || parentSelected) return "indeterminate";
    return false;
  }, [selectedIds]);

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (allOnPageSelected) {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.delete(id));
        return next;
      } else {
        const next = new Set(prev);
        selectableIds.forEach((id) => next.add(id));
        return next;
      }
    });
  }, [allOnPageSelected, selectableIds]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  /* Escape key cascade */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showTransferModal) setShowTransferModal(false);
        else if (showAdjustModal) setShowAdjustModal(false);
        else if (selectedProductId) setSelectedProductId(null);
        else if (selectedIds.size > 0) clearSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedProductId, showTransferModal, showAdjustModal, selectedIds.size, clearSelection]);

  /* Confirm + delete mutation */
  const confirm = useConfirm();
  const deleteMut = useDeleteProduct(token, apiLocationId);

  const handleBulkDelete = useCallback(async () => {
    const count = selectedIds.size;
    if (count === 0) return;

    // Separate parents from standalone/variants
    const parentIds = Array.from(selectedIds).filter((id) => {
      const product = products.find((p) => p.id === id);
      return product?.isParent;
    });

    // Skip variants whose parent is already being deleted (cascade handles them)
    const nonParentIds = Array.from(selectedIds).filter((id) => {
      const product = products.find((p) => p.id === id);
      if (product?.isParent) return false;
      // Check if this is a variant whose parent is also selected
      if (product?.parentProductId && parentIds.includes(product.parentProductId)) return false;
      return true;
    });

    const message = parentIds.length > 0
      ? `Delete ${count} selected item${count > 1 ? "s" : ""}? This includes ${parentIds.length} parent item${parentIds.length > 1 ? "s" : ""} with all their variants. This cannot be undone.`
      : `Delete ${count} item${count > 1 ? "s" : ""}? Items with sales history will be deactivated instead.`;

    const ok = await confirm({
      title: "Delete Items",
      message,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    // Delete parents first (cascade deletes their variants)
    for (const id of parentIds) {
      await deleteMut.mutateAsync(id).catch(() => {});
    }
    // Delete remaining non-parent items
    for (const id of nonParentIds) {
      await deleteMut.mutateAsync(id).catch(() => {});
    }
    setSelectedIds(new Set());
  }, [selectedIds, products, confirm, deleteMut]);

  /* Bulk update (category, brand, family, subcategory) */
  const handleBulkUpdate = useCallback(async (updates: Record<string, string>) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const fieldName = Object.keys(updates)[0]?.replace("Id", "") ?? "field";
    const confirmed = window.confirm(
      `Update ${fieldName} for ${ids.length} item${ids.length !== 1 ? "s" : ""}?`
    );
    if (!confirmed) return;

    try {
      await apiFetch("/products/bulk-update", {
        method: "PATCH",
        token,
        locationId: apiLocationId,
        body: JSON.stringify({ productIds: ids, updates }),
      });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setSelectedIds(new Set());
    } catch (err: any) {
      alert(err.message || "Bulk update failed");
    }
  }, [selectedIds, token, apiLocationId, queryClient]);

  /* Single item delete (from row actions menu) */
  const handleDeleteSingle = useCallback(async (productId: string, productName: string, isParent?: boolean) => {
    const message = isParent
      ? `Delete "${productName}" and ALL its variants? This cannot be undone.`
      : `Delete "${productName}"? This cannot be undone.`;
    const ok = await confirm({
      title: isParent ? "Delete Parent + Variants" : "Delete Item",
      message,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    await deleteMut.mutateAsync(productId).catch(() => {});
  }, [confirm, deleteMut]);

  /* Selected product for drawer */
  const selectedProduct = selectedProductId
    ? products.find((p) => p.id === selectedProductId) ?? null
    : null;

  /* Column count for colSpan calculations (arrow + checkbox + name + stock + cat + brand + sell [+ cost + margin] + actions) */
  const colCount = showFinancials ? 10 : 8;

  return (
    <div className="flex h-full flex-col">
      {/* -- Page Header -- */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-lg font-semibold leading-tight">Item List</h2>
            <p className="text-[12px] text-muted-foreground">
              {totalItems > 0
                ? `${totalItems.toLocaleString()} items at current location`
                : isLoading
                  ? "Loading inventory\u2026"
                  : "No items found"}
            </p>
          </div>
          {isFetching && !isLoading && (
            <Loader2 size={14} className="animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode((v) => v === "flat" ? "nested" : "flat")}
            title={viewMode === "nested" ? "Switch to flat list" : "Switch to grouped view"}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors",
              viewMode === "nested"
                ? "border-primary/30 bg-primary/[0.06] text-primary hover:bg-primary/[0.1]"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            <Layers size={13} />
            {viewMode === "nested" ? "List" : "Group"}
          </button>
          <button onClick={() => { resetImport(); setShowImportModal(true); }} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-muted">
            <Upload size={13} />
            Import
          </button>
          <button onClick={handleExport} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors hover:bg-muted">
            <Download size={13} />
            Export
          </button>
          <button
            onClick={() => setShowQuickAdd(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            <Plus size={13} strokeWidth={2.5} />
            Add Item
          </button>
        </div>
      </div>

      {/* -- Filter Bar -- */}
      <div className="mb-2 flex items-center gap-2">
        <select
          value={familyFilter}
          onChange={(e) => {
            setFamilyFilter(e.target.value);
            setCategoryFilter("");
            setSubCategoryFilter("");
          }}
          className="h-8 rounded-lg border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        >
          <option value="">All Families</option>
          {families.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setSubCategoryFilter("");
          }}
          className="h-8 rounded-lg border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        >
          <option value="">All Categories</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <SearchableSelect
          value={subCategoryFilter}
          onChange={setSubCategoryFilter}
          options={filteredSubcategories.map((sc) => ({ value: sc.id, label: sc.name }))}
          placeholder="All Sub-categories"
        />

        <select
          value={stockStatusFilter}
          onChange={(e) => setStockStatusFilter(e.target.value)}
          className="h-8 rounded-lg border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        >
          <option value="">All Stock</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>

        <select
          value={brandFilter}
          onChange={(e) => { setBrandFilter(e.target.value); setPage(1); }}
          className="h-8 rounded-lg border border-border bg-background px-2.5 pr-7 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
        >
          <option value="">All Brands</option>
          {brandsList.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <div className="relative flex-1">
          <Search
            size={13}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items..."
            className="h-8 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-[12px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/50 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* -- Active Filter Indicator -- */}
      {hasActiveFilters && (
        <div className="mb-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="tabular-nums">
            {totalItems.toLocaleString()} result{totalItems !== 1 ? "s" : ""}
          </span>
          <span className="text-border">&middot;</span>
          <button
            onClick={clearAllFilters}
            className="font-medium text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* -- Bulk Action Bar -- */}
      {selectedIds.size > 0 && (
        <div className="mb-1.5 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
          <span className="text-[12px] font-medium text-foreground">
            {selectedIds.size} selected
          </span>
          <div className="h-3.5 w-px bg-border" />
          <button
            onClick={handleBulkDelete}
            disabled={deleteMut.isPending}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Trash2 size={12} />
            {deleteMut.isPending ? "Deleting\u2026" : "Delete"}
          </button>
          <button onClick={handleExportSelected} className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors">
            <Download size={12} />
            Export
          </button>
          <button className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-muted transition-colors">
            <ArrowUpDown size={12} />
            Adjust
          </button>
          <div className="h-3.5 w-px bg-border" />
          <BulkDropdown
            label="Category"
            options={filteredCategories.map(c => ({ id: c.id, name: c.name }))}
            onSelect={(id) => handleBulkUpdate({ categoryId: id })}
          />
          <BulkDropdown
            label="Brand"
            options={brandsList.map(b => ({ id: b.id, name: b.name }))}
            onSelect={(id) => handleBulkUpdate({ brandId: id })}
          />
          <BulkDropdown
            label="Family"
            options={families.map(f => ({ id: f.id, name: f.name }))}
            onSelect={(id) => handleBulkUpdate({ familyId: id })}
          />
          <BulkDropdown
            label="Subcategory"
            options={filteredSubcategories.map(s => ({ id: s.id, name: s.name }))}
            onSelect={(id) => handleBulkUpdate({ subcategoryId: id })}
          />
          <div className="flex-1" />
          <button
            onClick={clearSelection}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* -- Data Table -- */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading inventory&hellip;</span>
          </div>
        </div>
      ) : products.length === 0 ? (
        <EmptyState query={searchQuery} hasFilters={hasActiveFilters} onClearFilters={clearAllFilters} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
          <div className="flex-1 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[700px] text-[12px]">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 backdrop-blur-sm">
                <tr>
                  <th scope="col" className="w-8" />{/* arrow column */}
                  <th scope="col" className="w-9 px-2 py-[7px] text-center">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAll}
                      className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
                    />
                  </th>
                  <th scope="col" className="min-w-[200px] px-3 py-[7px] text-left">
                    <SortableHeader label="Item Name" field="name" activeField={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th scope="col" className="w-[70px] px-2 py-[7px] text-right">
                    <SortableHeader label="Stock" field="stockLevel" activeField={sortBy} activeDir={sortDir} onSort={handleSort} align="right" />
                  </th>
                  <th scope="col" className="w-[130px] px-3 py-[7px] text-left">
                    <SortableHeader label="Category" field="categoryName" activeField={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th scope="col" className="w-[110px] px-3 py-[7px] text-left">
                    <SortableHeader label="Brand" field="brandName" activeField={sortBy} activeDir={sortDir} onSort={handleSort} />
                  </th>
                  <th scope="col" className="w-[85px] px-3 py-[7px] text-right">
                    <SortableHeader label="Sell" field="unitPrice" activeField={sortBy} activeDir={sortDir} onSort={handleSort} align="right" />
                  </th>
                  {showFinancials && (
                    <>
                      <th scope="col" className="w-[75px] px-3 py-[7px] text-right">
                        <SortableHeader label="Cost" field="costPrice" activeField={sortBy} activeDir={sortDir} onSort={handleSort} align="right" />
                      </th>
                      <th scope="col" className="w-[65px] px-3 py-[7px] text-right">
                        <SortableHeader label="Margin" field="margin" activeField={sortBy} activeDir={sortDir} onSort={handleSort} align="right" />
                      </th>
                    </>
                  )}
                  <th scope="col" className="w-[40px] px-1 py-[7px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {effectiveViewMode === "nested" ? (
                  <DrillDownView
                    token={token}
                    locationId={apiLocationId}
                    stockStatus={stockStatusFilter || undefined}
                    showFinancials={showFinancials}
                    onSelectProduct={setSelectedProductId}
                    familyFilter={familyFilter || undefined}
                    categoryFilter={categoryFilter || undefined}
                    brandFilter={brandFilter || undefined}
                    colCount={colCount}
                    allLocations={isAllLocations}
                  />
                ) : (
                  products.map((p) => (
                    <FlatProductRow
                      key={p.id}
                      product={p}
                      showFinancials={showFinancials}
                      isSelected={selectedIds.has(p.id)}
                      selectedIds={selectedIds}
                      onToggleSelect={() => toggleOne(p.id)}
                      onToggleParentSelect={toggleParentSelection}
                      onToggleVariantSelect={toggleVariantSelection}
                      getParentCheckState={getParentCheckState}
                      onSelectProduct={() => setSelectedProductId(p.id)}
                      isParentExpanded={expandedParents.has(p.id)}
                      onToggleParent={() => setExpandedParents((prev) => { const next = new Set(prev); if (next.has(p.id)) next.delete(p.id); else next.add(p.id); return next; })}
                      colCount={colCount}
                      onDeleteSingle={handleDeleteSingle}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* -- Pagination Footer (flat mode only; drill-down has its own per-make pagination) -- */}
          {effectiveViewMode !== "nested" && (
            <div className="flex shrink-0 items-center justify-between border-t border-border bg-muted/40 px-3 py-1.5">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                Showing{" "}
                {((page - 1) * pageSize + 1).toLocaleString()}&ndash;{Math.min(page * pageSize, totalItems).toLocaleString()}{" "}
                of {totalItems.toLocaleString()}
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Rows</span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-6 rounded border border-border bg-background px-1.5 text-[11px] tabular-nums text-foreground outline-none"
                  >
                    {PAGE_SIZES.map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <span className="min-w-[4.5rem] text-center text-[11px] tabular-nums text-muted-foreground">
                    {page.toLocaleString()} / {totalPages.toLocaleString()}
                  </span>
                  <button
                    disabled={!hasMore}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* -- Detail Drawer -- */}
      {selectedProduct && (
        <DetailDrawer
          product={selectedProduct}
          showFinancials={showFinancials}
          onClose={() => setSelectedProductId(null)}
          onTransfer={() => setShowTransferModal(true)}
          onAdjust={() => setShowAdjustModal(true)}
        />
      )}

      {showTransferModal && <TransferModal onClose={() => setShowTransferModal(false)} />}
      {showAdjustModal && selectedProductId && !isAllLocations && (
        <AdjustModal productId={selectedProductId} locationId={apiLocationId} token={token} onClose={() => setShowAdjustModal(false)} />
      )}

      {showQuickAdd && (
        <QuickAddDrawer
          token={token}
          locationId={apiLocationId}
          userRole={user?.role ?? ""}
          isAllLocations={isAllLocations}
          onClose={() => setShowQuickAdd(false)}
        />
      )}

      {/* -- Import Modal -- */}
      {showImportModal && (
        <ModalShell title="Import Items" onClose={() => setShowImportModal(false)} wide>
          {importStep === "upload" && (
            <div className="space-y-4">
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
              >
                <Download size={14} />
                Download CSV Template
              </button>

              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files[0]; if (f) handleImportFileUpload(f); }}
                onClick={() => importFileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-8 text-center transition-colors hover:border-primary/40 hover:bg-muted/50"
              >
                <FileUp size={28} className="text-muted-foreground" />
                <p className="text-[13px] font-medium text-foreground">
                  {importLoading ? "Processing..." : "Drop CSV file here or click to browse"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {importFile ? importFile.name : "Accepts .csv files"}
                </p>
                {importLoading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
              </div>
              <input
                ref={importFileRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFileUpload(f); }}
              />

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <strong>Note:</strong> Items are matched by SKU. Rows with an existing SKU will update that item; rows without a matching SKU create new items.
              </div>
            </div>
          )}

          {importStep === "preview" && (
            <div className="space-y-4">
              {importStats && (
                <div className="flex items-center gap-2">
                  {importStats.created > 0 && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                      {importStats.created} new
                    </span>
                  )}
                  {importStats.updated > 0 && (
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {importStats.updated} updates
                    </span>
                  )}
                  {importStats.errors > 0 && (
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                      {importStats.errors} errors
                    </span>
                  )}
                </div>
              )}

              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <table className="w-full text-[11px]">
                  <thead className="sticky top-0 border-b border-border bg-muted/90">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">SKU</th>
                      <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Sell</th>
                      <th className="px-2 py-1.5 text-right font-medium text-muted-foreground">Cost</th>
                      <th className="px-2 py-1.5 text-center font-medium text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {importPreview.map((item, idx) => (
                      <tr key={idx} className={item.action === "error" ? "bg-red-50 dark:bg-red-950/20" : ""}>
                        <td className="max-w-[180px] truncate px-2 py-1.5 text-foreground">{item.name || item.raw?.name || "-"}</td>
                        <td className="px-2 py-1.5 font-mono text-muted-foreground">{item.sku || "-"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{item.raw?.sellprice || item.raw?.unitprice || "-"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{item.raw?.costprice || item.raw?.cost || "-"}</td>
                        <td className="px-2 py-1.5 text-center">
                          {item.action === "create" && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">New</span>
                          )}
                          {item.action === "update" && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">Update</span>
                          )}
                          {item.action === "error" && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300" title={item.error}>Error</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { resetImport(); }}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportExecute}
                  disabled={importLoading || (importStats?.created === 0 && importStats?.updated === 0)}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
                >
                  {importLoading && <Loader2 size={13} className="animate-spin" />}
                  Import {importStats ? importStats.created + importStats.updated : 0} Items
                </button>
              </div>
            </div>
          )}

          {importStep === "done" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <p className="text-[14px] font-semibold text-foreground">Import Complete</p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {importStats?.created ?? 0} created, {importStats?.updated ?? 0} updated
                  {(importStats?.errors ?? 0) > 0 && `, ${importStats!.errors} errors`}
                </p>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"
              >
                Done
              </button>
            </div>
          )}
        </ModalShell>
      )}
    </div>
  );
}
