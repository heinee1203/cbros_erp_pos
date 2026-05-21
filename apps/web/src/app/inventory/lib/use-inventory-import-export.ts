"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import type { SortDir, SortField } from "@/hooks/use-products";

interface ExportProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  oemNumber: string | null;
  description: string | null;
  unitPrice: string;
  costPrice?: string;
  isVariablePrice: boolean;
  isParent: boolean;
  isActive: boolean;
  parentProductId: string | null;
  parentName: string | null;
  unitsPerCase: number;
  packagingUnit: string | null;
  sellingUnit: string | null;
  handle: string;
  familyName: string | null;
  categoryName: string | null;
  subcategoryName: string | null;
  brandName: string | null;
  supplierName: string | null;
  isSerialized: boolean;
  isTire: boolean;
  specialOrder: boolean;
  discontinued: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  optionEntries: Array<{ typeName: string; value: string }>;
  locations?: Array<{
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

export interface ImportPreviewRow {
  row: number;
  sku: string;
  name: string;
  action: "create" | "update" | "error";
  error?: string;
  raw: Record<string, string>;
}

export interface ImportStats {
  created: number;
  updated: number;
  errors: number;
}

interface UseInventoryImportExportOptions {
  token: string | null;
  apiLocationId: string | null;
  selectedIds: Set<string>;
  sortBy: SortField;
  sortDir: SortDir;
  debouncedSearch: string;
  familyFilter: string;
  categoryFilter: string;
  subCategoryFilter: string;
  brandFilter: string;
}

function sanitizeText(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF\u00AD]/g, "");
}

function escapeCSVCell(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function generateHandle(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100);
}

function buildCSV(items: ExportProduct[], locs: Array<{ id: string; name: string }>): string {
  const staticHeaders = [
    "Handle", "Name", "SKU", "Barcode", "OEM Number",
    "Family", "Category", "Sub-category", "Brand",
    "Default Price", "Cost", "Variable Price", "Track Stock", "Description",
    "Units per Case", "Packaging Unit",
    "Option 1 name", "Option 1 value",
    "Option 2 name", "Option 2 value",
    "Option 3 name", "Option 3 value",
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
    const displayName = item.parentProductId
      ? sanitizeText(item.parentName ?? item.name)
      : sanitizeText(item.name);
    const handle = sanitizeText(item.handle) || generateHandle(displayName);
    const opt1Name = item.optionEntries?.[0]?.typeName ?? "";
    const opt1Value = item.optionEntries?.[0]?.value ?? (item.parentProductId ? item.name : "");
    const opt2Name = item.optionEntries?.[1]?.typeName ?? "";
    const opt2Value = item.optionEntries?.[1]?.value ?? "";
    const opt3Name = item.optionEntries?.[2]?.typeName ?? "";
    const opt3Value = item.optionEntries?.[2]?.value ?? "";

    const staticCells = [
      handle,
      displayName,
      item.sku ?? "",
      item.barcode ?? "",
      item.oemNumber ?? "",
      item.familyName ?? "",
      sanitizeText(item.categoryName ?? ""),
      item.subcategoryName ?? "",
      item.brandName ?? "",
      item.unitPrice ?? "0.00",
      item.costPrice ?? "0.00",
      item.isVariablePrice ? "Y" : "N",
      "Y",
      sanitizeText(item.description ?? ""),
      String(item.unitsPerCase ?? 1),
      item.packagingUnit ?? "",
      opt1Name,
      opt1Value,
      opt2Name,
      opt2Value,
      opt3Name,
      opt3Value,
    ];

    const locationCells = locs.flatMap((loc) => {
      const inv = (item.locations ?? []).find((l) => l.locationId === loc.id);
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
}

function downloadCSV(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseImportCSV(text: string): { rows: Record<string, string>[]; rawHeaders: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { rows: [], rawHeaders: [] };

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
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headerCells = parseLine(lines[0]);
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
}

function mapCSVRowToPayload(row: Record<string, string>, rawHeaders: string[]) {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const normalized = k.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (row[normalized] !== undefined && row[normalized] !== "") return row[normalized];
    }
    return "";
  };

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
}

export function useInventoryImportExport({
  token,
  apiLocationId,
  selectedIds,
  sortBy,
  sortDir,
  debouncedSearch,
  familyFilter,
  categoryFilter,
  subCategoryFilter,
  brandFilter,
}: UseInventoryImportExportOptions) {
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreviewRow[]>([]);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importStep, setImportStep] = useState<"upload" | "preview" | "done">("upload");
  const importFileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const handleExport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      params.set("includeStock", "true");
      params.set("includeCost", "true");
      if (debouncedSearch && debouncedSearch.length >= 2) params.set("search", debouncedSearch);
      if (familyFilter) params.set("familyId", familyFilter);
      if (categoryFilter) params.set("categoryId", categoryFilter);
      if (subCategoryFilter) params.set("subcategoryId", subCategoryFilter);
      if (brandFilter) params.set("brandId", brandFilter);

      const resp = await apiFetch<ExportResponse>(
        `/products/export?${params.toString()}`,
        { token: token ?? undefined, locationId: apiLocationId ?? undefined },
      );

      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(buildCSV(resp.data, resp.locations), `items-export-${date}.csv`);
    } catch {
      // Silent fail; user can retry.
    }
  }, [sortBy, sortDir, debouncedSearch, familyFilter, categoryFilter, subCategoryFilter, brandFilter, token, apiLocationId]);

  const handleExportSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      const params = new URLSearchParams();
      params.set("includeStock", "true");
      params.set("includeCost", "true");
      const resp = await apiFetch<ExportResponse>(
        `/products/export?${params.toString()}`,
        { token: token ?? undefined, locationId: apiLocationId ?? undefined },
      );
      const selected = resp.data.filter((p) => selectedIds.has(p.id));
      const date = new Date().toISOString().slice(0, 10);
      downloadCSV(buildCSV(selected, resp.locations), `items-export-${date}-selected.csv`);
    } catch {
      // Silent fail; user can retry.
    }
  }, [selectedIds, token, apiLocationId]);

  const handleDownloadTemplate = useCallback(() => {
    const headers = [
      "Handle", "SKU", "Name", "Category", "Description", "Sold by weight",
      "Option 1 name", "Option 1 value", "Option 2 name", "Option 2 value",
      "Option 3 name", "Option 3 value", "Default price", "Cost", "Barcode",
    ];

    const sampleRow = [
      "l-wrench",
      "10032",
      "GTX L WRENCH",
      "Tools",
      "Sample item - delete this row",
      "N",
      "SIZE",
      "# 17",
      "",
      "",
      "",
      "",
      "85.00",
      "",
      "2001570881301",
    ];

    const csv = "\uFEFF" + headers.map(escapeCSVCell).join(",") + "\n" + sampleRow.map(escapeCSVCell).join(",") + "\n";
    downloadCSV(csv, "apex-item-import-template.csv");
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
        token: token ?? undefined,
        locationId: apiLocationId ?? undefined,
        body: JSON.stringify({ dryRun: true, rows: payload }),
      });

      const preview: ImportPreviewRow[] = [];
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
  }, [token, apiLocationId]);

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
        token: token ?? undefined,
        locationId: apiLocationId ?? undefined,
        body: JSON.stringify({ dryRun: false, rows: payload }),
      });
      setImportStats({ created: resp.created, updated: resp.updated, errors: resp.errors.length });
      setImportStep("done");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch {
      setImportStats((prev) => prev ? { ...prev, errors: prev.errors + 1 } : { created: 0, updated: 0, errors: 1 });
    } finally {
      setImportLoading(false);
    }
  }, [importFile, token, apiLocationId, queryClient]);

  const resetImport = useCallback(() => {
    setImportFile(null);
    setImportPreview([]);
    setImportStats(null);
    setImportLoading(false);
    setImportStep("upload");
    if (importFileRef.current) importFileRef.current.value = "";
  }, []);

  return {
    importFile,
    importPreview,
    importStats,
    importLoading,
    importStep,
    importFileRef,
    handleExport,
    handleExportSelected,
    handleDownloadTemplate,
    handleImportFileUpload,
    handleImportExecute,
    resetImport,
  };
}

export type InventoryImportExportController = ReturnType<typeof useInventoryImportExport>;
