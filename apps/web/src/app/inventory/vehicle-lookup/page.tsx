"use client";

import { useState, useMemo } from "react";
import { Car, Search, ChevronDown, ChevronRight, Package, ArrowRight, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, ALL_LOCATIONS } from "@/app/auth-context";
import { useVehicleMakes, useVehicleModels, useVehicleEngines, useVehicleSearch } from "@/hooks/use-vehicles";
import { mergeVehicleMakes } from "@/lib/vehicle-makes";
import { cn } from "@/lib/utils";
import type { ProductRow } from "@/hooks/use-products";

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */

function formatPrice(amount: number): string {
  return amount.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function StockPill({ stockLevel, reorderPoint }: { stockLevel: number; reorderPoint: number }) {
  return (
    <span
      className={cn(
        "inline-flex min-w-[36px] items-center justify-end rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums",
        stockLevel === 0
          ? "bg-red-50 text-red-700"
          : stockLevel <= reorderPoint
            ? "bg-amber-50 text-amber-700"
            : "text-foreground",
      )}
    >
      {stockLevel.toLocaleString()}
    </span>
  );
}

/* ─────────────────────────────────────────────
 * Collapsible Section
 * ───────────────────────────────────────────── */

function CollapsibleSection({
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        {open ? (
          <ChevronDown size={16} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={16} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
          {badge}
        </span>
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Sub-Category Collapsible (indented, lighter)
 * ───────────────────────────────────────────── */

function SubCategorySection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-border/50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 pl-8 pr-4 py-1.5 text-left hover:bg-accent/30 transition-colors"
      >
        {open ? (
          <ChevronDown size={14} className="text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted-foreground shrink-0" />
        )}
        <span className="text-[13px] font-medium text-foreground">{title}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
          {count} {count === 1 ? "part" : "parts"}
        </span>
      </button>
      {open && children}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Items Table (reusable for loose items and sub-category items)
 * ───────────────────────────────────────────── */

function ItemsTable({
  items,
  onRowClick,
  indent = 0,
}: {
  items: ProductRow[];
  onRowClick: (id: string) => void;
  indent?: number;
}) {
  // indent 0 = category-level loose items (16px), 1 = sub-category items (48px)
  const paddingLeft = indent === 0 ? 16 : 48;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-border/50 bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="py-1.5 pr-3 text-left min-w-[200px]" style={{ paddingLeft }}>Item Name</th>
            <th className="px-3 py-1.5 text-left w-[100px]">Brand</th>
            <th className="px-3 py-1.5 text-right w-[70px]">Stock</th>
            <th className="px-3 py-1.5 text-right w-[85px]">Sell</th>
            <th className="px-3 py-1.5 text-right w-[75px]">Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/30">
          {items.map((item) => (
            <tr
              key={item.id}
              className="hover:bg-accent/50 cursor-pointer transition-colors"
              onClick={() => onRowClick(item.id)}
            >
              <td className="py-1.5 pr-3 font-medium text-foreground min-w-[200px]" style={{ paddingLeft }}>{item.name}</td>
              <td className="px-3 py-1.5 text-muted-foreground w-[100px]">
                {item.brandName || "\u2014"}
              </td>
              <td className="px-3 py-1.5 text-right w-[70px]">
                <StockPill stockLevel={item.stockLevel} reorderPoint={item.reorderPoint} />
              </td>
              <td className="px-3 py-1.5 text-right font-medium tabular-nums w-[85px]">
                {parseFloat(item.unitPrice) > 0 ? `\u20B1${formatPrice(parseFloat(item.unitPrice))}` : "\u2014"}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground w-[75px]">
                {parseFloat(item.costPrice) > 0 ? `\u20B1${formatPrice(parseFloat(item.costPrice))}` : "\u2014"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Main Page
 * ───────────────────────────────────────────── */

export default function VehicleLookupPage() {
  const { token, locationId } = useAuth();
  const apiLocationId = locationId === ALL_LOCATIONS ? "ALL" : (locationId ?? "ALL");
  const router = useRouter();

  // ── Cascading search state ──
  const [selectedMake, setSelectedMake] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedYear, setSelectedYear] = useState("");
  const [selectedEngine, setSelectedEngine] = useState("");
  const [selectedOem, setSelectedOem] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [searchParams, setSearchParams] = useState<{ make?: string; model?: string; year?: string; engine?: string; oem?: string } | null>(null);

  // ── Make dropdown filter ──
  const [makeFilter, setMakeFilter] = useState("");

  // ── Fetch makes ──
  const { data: makesData } = useVehicleMakes(token ?? "", apiLocationId);
  const allMakes = useMemo(
    () => mergeVehicleMakes(makesData?.data ?? []),
    [makesData],
  );
  const filteredMakes = useMemo(
    () =>
      makeFilter
        ? allMakes.filter((m) => m.toLowerCase().includes(makeFilter.toLowerCase()))
        : allMakes,
    [allMakes, makeFilter],
  );

  // ── Fetch models when make is selected ──
  const { data: modelsData } = useVehicleModels(token ?? "", apiLocationId, selectedMake);
  const models = modelsData?.data ?? [];

  // ── Fetch engine suggestions ──
  const { data: enginesData } = useVehicleEngines(token ?? "", apiLocationId, selectedMake || undefined);
  const engines = enginesData?.data ?? [];

  // ── Search results ──
  const hasAnyFilter = !!(searchParams?.make || searchParams?.model || searchParams?.year || searchParams?.engine || searchParams?.oem);
  const searchQuery = useVehicleSearch(
    token ?? "",
    apiLocationId,
    searchParams ?? {},
    { enabled: !!searchParams && hasAnyFilter },
  );

  const results = searchQuery.data?.data ?? [];

  // ── Result filters (client-side) ──
  const [filterFamily, setFilterFamily] = useState("");
  const [filterCategory, setFilterCategory] = useState("");

  // Extract unique families & categories from results for filter options
  const resultFamilies = useMemo(() => {
    const set = new Map<string, string>();
    for (const item of results) {
      const name = item.familyName || "Other";
      set.set(name, name);
    }
    return Array.from(set.values()).sort();
  }, [results]);

  const resultCategories = useMemo(() => {
    const set = new Map<string, string>();
    for (const item of results) {
      const name = item.subCategoryName || item.subcategoryName || "";
      if (name) set.set(name, name);
    }
    return Array.from(set.values()).sort();
  }, [results]);

  // Filtered results
  const filteredResults = useMemo(() => {
    let filtered = results;
    if (filterFamily) {
      filtered = filtered.filter((r) => (r.familyName || "Other") === filterFamily);
    }
    if (filterCategory) {
      filtered = filtered.filter((r) => (r.subCategoryName || r.subcategoryName) === filterCategory);
    }
    return filtered;
  }, [results, filterFamily, filterCategory]);

  // ── Group filtered results by Category → Sub-Category ──
  interface SubCategoryGroup {
    name: string;
    items: ProductRow[];
  }
  interface CategoryGroup {
    name: string;
    totalCount: number;
    looseItems: ProductRow[]; // items with no sub-category
    subCategories: SubCategoryGroup[];
  }
  const grouped = useMemo((): CategoryGroup[] => {
    if (!filteredResults.length) return [];
    const catMap = new Map<string, { looseItems: ProductRow[]; subMap: Map<string, ProductRow[]> }>();
    for (const item of filteredResults) {
      const catName = item.subCategoryName || item.familyName || "Other";
      const subName = item.subcategoryName || null;
      if (!catMap.has(catName)) catMap.set(catName, { looseItems: [], subMap: new Map() });
      const entry = catMap.get(catName)!;
      if (subName) {
        if (!entry.subMap.has(subName)) entry.subMap.set(subName, []);
        entry.subMap.get(subName)!.push(item);
      } else {
        entry.looseItems.push(item);
      }
    }
    return Array.from(catMap.entries())
      .map(([name, { looseItems, subMap }]) => {
        const subCategories = Array.from(subMap.entries())
          .map(([subName, items]) => ({ name: subName, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const totalCount = looseItems.length + subCategories.reduce((s, g) => s + g.items.length, 0);
        return { name, totalCount, looseItems: looseItems.sort((a, b) => a.name.localeCompare(b.name)), subCategories };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredResults]);

  // ── Summary counts ──
  const totalCount = filteredResults.length;
  const inStockCount = filteredResults.filter((r) => r.stockLevel > 0).length;
  const outOfStockCount = totalCount - inStockCount;

  // ── Handlers ──
  const handleMakeChange = (make: string) => {
    setSelectedMake(make);
    setSelectedModel("");
    setSelectedYear("");
    setSelectedEngine("");
    setHasSearched(false);
    setSearchParams(null);
    setMakeFilter("");
    setFilterFamily("");
    setFilterCategory("");
  };

  const handleModelChange = (model: string) => {
    setSelectedModel(model);
    setSelectedYear("");
    setHasSearched(false);
    setSearchParams(null);
  };

  const canSearch = !!(selectedMake || selectedModel || selectedYear || selectedEngine || selectedOem);

  const handleSearch = () => {
    if (!canSearch) return;
    setHasSearched(true);
    setSearchParams({
      make: selectedMake || undefined,
      model: selectedModel || undefined,
      year: selectedYear || undefined,
      engine: selectedEngine || undefined,
      oem: selectedOem || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSearch) handleSearch();
  };

  // ── Current year for input max ──
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Car size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Vehicle Lookup</h1>
            <p className="text-[13px] text-muted-foreground">
              Find all compatible parts for a specific vehicle
            </p>
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        {/* Make */}
        <div className="flex flex-col gap-1.5 min-w-[180px]">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Make
          </label>
          <div className="relative">
            <input
              type="text"
              list="makes-list"
              placeholder="Select make..."
              value={selectedMake || makeFilter}
              onChange={(e) => {
                const val = e.target.value;
                if (allMakes.includes(val)) {
                  handleMakeChange(val);
                } else {
                  setMakeFilter(val);
                  setSelectedMake("");
                }
              }}
              onBlur={() => {
                // If typed text matches a make, select it
                if (makeFilter && allMakes.some((m) => m.toLowerCase() === makeFilter.toLowerCase())) {
                  const matched = allMakes.find((m) => m.toLowerCase() === makeFilter.toLowerCase())!;
                  handleMakeChange(matched);
                }
              }}
              onKeyDown={handleKeyDown}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <datalist id="makes-list">
              {filteredMakes.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>

        {/* Model */}
        <div className="flex flex-col gap-1.5 min-w-[180px]">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Model
          </label>
          <input
            type="text"
            list="models-list"
            placeholder="Type model..."
            value={selectedModel}
            onChange={(e) => handleModelChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <datalist id="models-list">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>

        {/* Year */}
        <div className="flex flex-col gap-1.5 w-[100px]">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Year
          </label>
          <input
            type="number"
            placeholder="Year"
            value={selectedYear}
            onChange={(e) => {
              setSelectedYear(e.target.value);
              setHasSearched(false);
              setSearchParams(null);
            }}
            onKeyDown={handleKeyDown}
            min={1990}
            max={currentYear + 1}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring tabular-nums"
          />
        </div>

        {/* Engine */}
        <div className="flex flex-col gap-1.5 min-w-[140px]">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Engine
          </label>
          <input
            type="text"
            list="engine-suggestions"
            placeholder="e.g. 4D56, 4G63"
            value={selectedEngine}
            onChange={(e) => {
              setSelectedEngine(e.target.value);
              setHasSearched(false);
              setSearchParams(null);
            }}
            onKeyDown={handleKeyDown}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <datalist id="engine-suggestions">
            {engines.map((eng) => (
              <option key={eng} value={eng} />
            ))}
          </datalist>
        </div>

        {/* OEM Number */}
        <div className="flex flex-col gap-1.5 min-w-[140px]">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            OEM Number
          </label>
          <input
            type="text"
            placeholder="e.g. MB295982"
            value={selectedOem}
            onChange={(e) => {
              setSelectedOem(e.target.value);
              setHasSearched(false);
              setSearchParams(null);
            }}
            onKeyDown={handleKeyDown}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm font-mono outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Search button */}
        <button
          type="button"
          onClick={handleSearch}
          disabled={!canSearch}
          className="flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          <Search size={14} />
          Search
        </button>

        {/* Clear */}
        {hasSearched && (
          <button
            type="button"
            onClick={() => {
              setSelectedMake("");
              setSelectedModel("");
              setSelectedYear("");
              setSelectedEngine("");
              setSelectedOem("");
              setHasSearched(false);
              setSearchParams(null);
              setMakeFilter("");
              setFilterFamily("");
              setFilterCategory("");
            }}
            className="flex h-9 items-center gap-1 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Summary bar */}
      {hasSearched && !searchQuery.isLoading && results.length > 0 && (
        <div className="flex items-center gap-4 rounded-lg bg-muted/30 px-4 py-3 text-sm">
          <span className="font-semibold">{totalCount} compatible parts</span>
          <span className="text-muted-foreground">
            for {[selectedMake, selectedModel, selectedYear].filter(Boolean).join(" ")}{selectedEngine ? ` (${selectedEngine})` : ""}
          </span>
          <span className="text-muted-foreground">&middot;</span>
          <span className="text-muted-foreground">{inStockCount} in stock</span>
          <span className="text-muted-foreground">&middot;</span>
          <span className="text-muted-foreground">{outOfStockCount} out of stock</span>
        </div>
      )}

      {/* Result filters */}
      {hasSearched && !searchQuery.isLoading && results.length > 0 && (resultFamilies.length > 1 || resultCategories.length > 1) && (
        <div className="flex flex-wrap items-center gap-2">
          {resultFamilies.length > 1 && (
            <select
              value={filterFamily}
              onChange={(e) => setFilterFamily(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-[12px] outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Families</option>
              {resultFamilies.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          )}
          {resultCategories.length > 1 && (
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2.5 text-[12px] outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">All Categories</option>
              {resultCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {(filterFamily || filterCategory) && (
            <button
              type="button"
              onClick={() => { setFilterFamily(""); setFilterCategory(""); }}
              className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X size={12} />
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Loading */}
      {searchQuery.isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Searching compatible parts...
          </div>
        </div>
      )}

      {/* Empty state: no search yet */}
      {!hasSearched && !searchQuery.isLoading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Car size={24} className="text-muted-foreground" />
          </div>
          <h2 className="mt-5 text-base font-semibold text-foreground">
            Search for compatible parts
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Enter any combination of make, model, year, or engine code to find matching parts.
          </p>
        </div>
      )}

      {/* Empty state: no results */}
      {hasSearched && !searchQuery.isLoading && filteredResults.length === 0 && results.length > 0 && (filterFamily || filterCategory) && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">
            No parts match the selected filters. <button type="button" onClick={() => { setFilterFamily(""); setFilterCategory(""); }} className="text-primary hover:underline font-medium">Clear filters</button>
          </p>
        </div>
      )}
      {hasSearched && !searchQuery.isLoading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Package size={24} className="text-muted-foreground" />
          </div>
          <h2 className="mt-5 text-base font-semibold text-foreground">
            No compatible parts found
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            No parts match {[selectedMake, selectedModel, selectedYear].filter(Boolean).join(" ")}{selectedEngine ? ` (${selectedEngine})` : ""}.
            Try broadening your search, or check that vehicle fitment data has been added to your items.
          </p>
          <Link
            href="/inventory"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            Browse All Items
            <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* Results grouped by Category → Sub-Category */}
      {hasSearched && !searchQuery.isLoading && grouped.length > 0 && (
        <div className="flex flex-col gap-3">
          {grouped.map((cat) => (
            <CollapsibleSection
              key={cat.name}
              title={cat.name}
              badge={`${cat.totalCount} ${cat.totalCount === 1 ? "part" : "parts"}`}
              defaultOpen
            >
              <div className="flex flex-col">
                {/* Loose items (no sub-category) sit directly under category */}
                {cat.looseItems.length > 0 && (
                  <ItemsTable items={cat.looseItems} onRowClick={(id) => router.push(`/inventory/${id}/edit`)} indent={0} />
                )}
                {/* Sub-category groups */}
                {cat.subCategories.map((sub) => (
                  <SubCategorySection key={sub.name} title={sub.name} count={sub.items.length} defaultOpen>
                    <ItemsTable items={sub.items} onRowClick={(id) => router.push(`/inventory/${id}/edit`)} indent={1} />
                  </SubCategorySection>
                ))}
              </div>
            </CollapsibleSection>
          ))}
        </div>
      )}
    </div>
  );
}
