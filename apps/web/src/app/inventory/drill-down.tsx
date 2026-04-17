"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { Layers, Tag, Car, ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useGroupedCounts,
  type FamilyCountRow,
  type CategoryCountRow,
  type BrandCountRow,
  type MakeCountRow,
} from "@/hooks/use-grouped-counts";
import { useProducts, type ProductRow } from "@/hooks/use-products";

/* ─────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────── */

const NONE = "__none__";

function formatPrice(amount: number): string {
  return amount.toLocaleString("en-PH", { minimumFractionDigits: 2 });
}

function getMarginPercent(sell: number, cost: number): string {
  if (sell === 0) return "—";
  return `${(((sell - cost) / sell) * 100).toFixed(1)}%`;
}

function displayName(id: string | null, fallback: string): string {
  if (!id || id === NONE) return fallback;
  return id; // the API returns actual name strings in the name field
}

function sortNullLast<T extends { id?: string | null; name?: string; make?: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aNull = (a.id === null || a.id === NONE || a.make === NONE);
    const bNull = (b.id === null || b.id === NONE || b.make === NONE);
    if (aNull && !bNull) return 1;
    if (!aNull && bNull) return -1;
    return 0;
  });
}

/* ─────────────────────────────────────────────
 * Props
 * ───────────────────────────────────────────── */

interface DrillDownViewProps {
  token: string;
  locationId: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  familyFilter?: string;
  categoryFilter?: string;
  brandFilter?: string;
  colCount: number;
  allLocations?: boolean;
}

/* ─────────────────────────────────────────────
 * Loading row
 * ───────────────────────────────────────────── */

function LoadingRow({ colCount }: { colCount: number }) {
  return (
    <tr>
      <td className="w-9" />
      <td colSpan={colCount - 1} className="py-6">
        <div className="flex items-center justify-center">
          <Loader2 size={16} className="animate-spin text-muted-foreground" />
        </div>
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────
 * ItemsTable (Level 5 — deepest)
 * ───────────────────────────────────────────── */

interface ItemsTableProps {
  token: string;
  locationId: string;
  familyId?: string;
  categoryId?: string;
  brandId?: string;
  vehicleMake?: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  colCount: number;
  allLocations?: boolean;
}

function ItemsTable({
  token,
  locationId,
  familyId,
  categoryId,
  brandId,
  vehicleMake,
  stockStatus,
  showFinancials,
  onSelectProduct,
  colCount,
  allLocations,
}: ItemsTableProps) {
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading } = useProducts(token, locationId, {
    familyId: familyId,
    categoryId: categoryId,
    brandId: brandId,
    vehicleMake,
    stockStatus,
    page,
    limit,
    allLocations,
  });

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const startIdx = (page - 1) * limit + 1;
  const endIdx = Math.min(page * limit, total);

  const gridCols = showFinancials
    ? "grid-cols-[1fr_70px_80px_75px_65px]"
    : "grid-cols-[1fr_70px_80px]";

  if (isLoading) return <LoadingRow colCount={colCount} />;

  return (
    <>
      {/* Sub-header */}
      <tr className="border-b border-border/40">
        <td className="w-9" />
        <td colSpan={colCount - 1} className="py-[3px]">
          <div className={cn("grid items-center gap-1", gridCols)} style={{ paddingLeft: "96px" }}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</span>
            <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Stock</span>
            <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sell</span>
            {showFinancials && (
              <>
                <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</span>
                <span className="text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Margin</span>
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Product rows */}
      {products.map((p) => {
        const sell = parseFloat(p.unitPrice) || 0;
        const cost = parseFloat(p.costPrice) || 0;
        const margin = getMarginPercent(sell, cost);

        return (
          <tr
            key={p.id}
            onClick={() => onSelectProduct(p.id)}
            className="cursor-pointer hover:bg-accent/70 transition-colors"
          >
            <td className="w-9" />
            <td colSpan={colCount - 1} className="py-[4px]">
              <div className={cn("grid items-center gap-1", gridCols)} style={{ paddingLeft: "96px" }}>
                <span className="truncate text-[11px] font-medium text-foreground">{p.name}</span>
                <span className="flex justify-end">
                  <span className={cn(
                    "inline-flex min-w-[36px] items-center justify-end rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                    p.stockLevel === 0
                      ? "bg-red-50 text-red-700"
                      : p.stockLevel <= p.reorderPoint
                        ? "bg-amber-50 text-amber-700"
                        : "text-foreground",
                  )}>
                    {p.stockLevel.toLocaleString()}
                  </span>
                </span>
                <span className="text-right text-[11px] font-medium tabular-nums">{formatPrice(sell)}</span>
                {showFinancials && (
                  <>
                    <span className="text-right text-[10px] text-muted-foreground tabular-nums">
                      {cost > 0 ? formatPrice(cost) : "—"}
                    </span>
                    <span className="text-right text-[10px] font-medium tabular-nums">{margin}</span>
                  </>
                )}
              </div>
            </td>
          </tr>
        );
      })}

      {products.length === 0 && (
        <tr>
          <td className="w-9" />
          <td colSpan={colCount - 1} className="py-4 text-center text-[11px] text-muted-foreground">
            No products found
          </td>
        </tr>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <tr className="border-t border-border/30">
          <td className="w-9" />
          <td colSpan={colCount - 1} className="py-[5px]">
            <div className="flex items-center justify-end gap-3 pr-2" style={{ paddingLeft: "96px" }}>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                Showing {startIdx}–{endIdx} of {total}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); setPage((p) => Math.max(1, p - 1)); }}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={11} /> Prev
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setPage((p) => Math.min(totalPages, p + 1)); }}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight size={11} />
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
 * MakeRows (Level 4)
 * ───────────────────────────────────────────── */

interface MakeRowsProps {
  token: string;
  locationId: string;
  familyId: string;
  categoryId: string;
  brandId: string;
  brandKey: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  colCount: number;
  expandedMakes: Set<string>;
  onToggleMake: (key: string) => void;
  allLocations?: boolean;
}

function MakeRows({
  token,
  locationId,
  familyId,
  categoryId,
  brandId,
  brandKey,
  stockStatus,
  showFinancials,
  onSelectProduct,
  colCount,
  expandedMakes,
  onToggleMake,
  allLocations,
}: MakeRowsProps) {
  const { data, isLoading } = useGroupedCounts<MakeCountRow>(
    token,
    locationId,
    "vehicleMake",
    {
      familyId,
      categoryId,
      brandId,
      stockStatus,
      allLocations,
    },
    { enabled: true },
  );

  const rows = useMemo(() => {
    if (!data?.data) return [];
    return [...data.data].sort((a, b) => {
      const aNull = a.make === NONE || a.make === "";
      const bNull = b.make === NONE || b.make === "";
      if (aNull && !bNull) return 1;
      if (!aNull && bNull) return -1;
      return 0;
    });
  }, [data]);

  if (isLoading) return <LoadingRow colCount={colCount} />;

  return (
    <>
      {rows.map((row) => {
        const makeKey = `${brandKey}:${row.make || NONE}`;
        const isExpanded = expandedMakes.has(makeKey);
        const name = (!row.make || row.make === NONE) ? "Universal / No Make" : row.make;

        return (
          <MakeRowWithItems
            key={makeKey}
            makeKey={makeKey}
            name={name}
            itemCount={row.itemCount}
            isExpanded={isExpanded}
            onToggle={() => onToggleMake(makeKey)}
            token={token}
            locationId={locationId}
            familyId={familyId}
            categoryId={categoryId}
            brandId={brandId}
            vehicleMake={row.make || undefined}
            stockStatus={stockStatus}
            showFinancials={showFinancials}
            onSelectProduct={onSelectProduct}
            colCount={colCount}
            allLocations={allLocations}
          />
        );
      })}
    </>
  );
}

interface MakeRowWithItemsProps {
  makeKey: string;
  name: string;
  itemCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  token: string;
  locationId: string;
  familyId?: string;
  categoryId?: string;
  brandId?: string;
  vehicleMake?: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  colCount: number;
  allLocations?: boolean;
}

function MakeRowWithItems({
  name,
  itemCount,
  isExpanded,
  onToggle,
  token,
  locationId,
  familyId,
  categoryId,
  brandId,
  vehicleMake,
  stockStatus,
  showFinancials,
  onSelectProduct,
  colCount,
  allLocations,
}: MakeRowWithItemsProps) {
  return (
    <>
      <tr onClick={onToggle} className={cn("cursor-pointer transition-colors duration-75", "hover:bg-accent/50")}>
        <td className="w-9 px-2 py-[6px]" />
        <td colSpan={colCount - 1} className="px-3 py-[6px]">
          <div className="flex items-center gap-2" style={{ paddingLeft: "84px" }}>
            <ChevronRight
              size={13}
              className={cn(
                "shrink-0 text-muted-foreground transition-transform duration-150",
                isExpanded && "rotate-90",
              )}
            />
            <Car size={11} className="shrink-0 text-muted-foreground" />
            <span className="text-[12px]">{name}</span>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {itemCount} items
            </span>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <ItemsTable
          token={token}
          locationId={locationId}
          familyId={familyId}
          categoryId={categoryId}
          brandId={brandId}
          vehicleMake={vehicleMake}
          stockStatus={stockStatus}
          showFinancials={showFinancials}
          onSelectProduct={onSelectProduct}
          colCount={colCount}
          allLocations={allLocations}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
 * BrandRows (Level 3)
 * ───────────────────────────────────────────── */

interface BrandRowsProps {
  token: string;
  locationId: string;
  familyId: string;
  categoryId: string;
  catKey: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  colCount: number;
  expandedBrands: Set<string>;
  expandedMakes: Set<string>;
  onToggleBrand: (key: string) => void;
  onToggleMake: (key: string) => void;
  allLocations?: boolean;
}

function BrandRows({
  token,
  locationId,
  familyId,
  categoryId,
  catKey,
  stockStatus,
  showFinancials,
  onSelectProduct,
  colCount,
  expandedBrands,
  expandedMakes,
  onToggleBrand,
  onToggleMake,
  allLocations,
}: BrandRowsProps) {
  const { data, isLoading } = useGroupedCounts<BrandCountRow>(
    token,
    locationId,
    "brand",
    {
      familyId,
      categoryId,
      stockStatus,
      allLocations,
    },
    { enabled: true },
  );

  const rows = useMemo(() => sortNullLast(data?.data ?? []), [data]);

  if (isLoading) return <LoadingRow colCount={colCount} />;

  return (
    <>
      {rows.map((row) => {
        const brandId = row.id ?? NONE;
        const brandKey = `${catKey}:${brandId}`;
        const isExpanded = expandedBrands.has(brandKey);
        const name = row.id ? row.name : "No Brand";

        return (
          <BrandRowWithChildren
            key={brandKey}
            brandKey={brandKey}
            name={name}
            itemCount={row.itemCount}
            makeCount={row.makeCount}
            isExpanded={isExpanded}
            onToggle={() => onToggleBrand(brandKey)}
            token={token}
            locationId={locationId}
            familyId={familyId}
            categoryId={categoryId}
            brandId={brandId}
            stockStatus={stockStatus}
            showFinancials={showFinancials}
            onSelectProduct={onSelectProduct}
            colCount={colCount}
            expandedMakes={expandedMakes}
            onToggleMake={onToggleMake}
            allLocations={allLocations}
          />
        );
      })}
    </>
  );
}

interface BrandRowWithChildrenProps {
  brandKey: string;
  name: string;
  itemCount: number;
  makeCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  token: string;
  locationId: string;
  familyId: string;
  categoryId: string;
  brandId: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  colCount: number;
  expandedMakes: Set<string>;
  onToggleMake: (key: string) => void;
  allLocations?: boolean;
}

function BrandRowWithChildren({
  brandKey,
  name,
  itemCount,
  makeCount,
  isExpanded,
  onToggle,
  token,
  locationId,
  familyId,
  categoryId,
  brandId,
  stockStatus,
  showFinancials,
  onSelectProduct,
  colCount,
  expandedMakes,
  onToggleMake,
  allLocations,
}: BrandRowWithChildrenProps) {
  return (
    <>
      <tr onClick={onToggle} className={cn("cursor-pointer transition-colors duration-75", "bg-muted/10 hover:bg-muted/20")}>
        <td className="w-9 px-2 py-[6px]" />
        <td colSpan={colCount - 1} className="px-3 py-[6px]">
          <div className="flex items-center gap-2" style={{ paddingLeft: "60px" }}>
            <ChevronRight
              size={13}
              className={cn(
                "shrink-0 text-muted-foreground transition-transform duration-150",
                isExpanded && "rotate-90",
              )}
            />
            <Tag size={11} className="shrink-0 text-muted-foreground" />
            <span className="text-[12px]">{name}</span>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {itemCount} items &middot; {makeCount} makes
            </span>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <MakeRows
          token={token}
          locationId={locationId}
          familyId={familyId}
          categoryId={categoryId}
          brandId={brandId}
          brandKey={brandKey}
          stockStatus={stockStatus}
          showFinancials={showFinancials}
          onSelectProduct={onSelectProduct}
          colCount={colCount}
          expandedMakes={expandedMakes}
          onToggleMake={onToggleMake}
          allLocations={allLocations}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
 * CategoryRows (Level 2)
 * ───────────────────────────────────────────── */

interface CategoryRowsProps {
  token: string;
  locationId: string;
  familyId: string;
  familyKey: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  colCount: number;
  expandedCategories: Set<string>;
  expandedBrands: Set<string>;
  expandedMakes: Set<string>;
  onToggleCategory: (key: string) => void;
  onToggleBrand: (key: string) => void;
  onToggleMake: (key: string) => void;
  allLocations?: boolean;
}

function CategoryRows({
  token,
  locationId,
  familyId,
  familyKey,
  stockStatus,
  showFinancials,
  onSelectProduct,
  colCount,
  expandedCategories,
  expandedBrands,
  expandedMakes,
  onToggleCategory,
  onToggleBrand,
  onToggleMake,
  allLocations,
}: CategoryRowsProps) {
  const { data, isLoading } = useGroupedCounts<CategoryCountRow>(
    token,
    locationId,
    "category",
    {
      familyId,
      stockStatus,
      allLocations,
    },
    { enabled: true },
  );

  const rows = useMemo(() => sortNullLast(data?.data ?? []), [data]);

  if (isLoading) return <LoadingRow colCount={colCount} />;

  return (
    <>
      {rows.map((row) => {
        const catId = row.id ?? NONE;
        const catKey = `${familyKey}:${catId}`;
        const isExpanded = expandedCategories.has(catKey);
        const name = row.id ? row.name : "No Category";

        return (
          <CategoryRowWithChildren
            key={catKey}
            catKey={catKey}
            name={name}
            color={row.color}
            itemCount={row.itemCount}
            brandCount={row.brandCount}
            isExpanded={isExpanded}
            onToggle={() => onToggleCategory(catKey)}
            token={token}
            locationId={locationId}
            familyId={familyId}
            categoryId={catId}
            stockStatus={stockStatus}
            showFinancials={showFinancials}
            onSelectProduct={onSelectProduct}
            colCount={colCount}
            expandedBrands={expandedBrands}
            expandedMakes={expandedMakes}
            onToggleBrand={onToggleBrand}
            onToggleMake={onToggleMake}
            allLocations={allLocations}
          />
        );
      })}
    </>
  );
}

interface CategoryRowWithChildrenProps {
  catKey: string;
  name: string;
  color: string | null;
  itemCount: number;
  brandCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  token: string;
  locationId: string;
  familyId: string;
  categoryId: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  colCount: number;
  expandedBrands: Set<string>;
  expandedMakes: Set<string>;
  onToggleBrand: (key: string) => void;
  onToggleMake: (key: string) => void;
  allLocations?: boolean;
}

function CategoryRowWithChildren({
  catKey,
  name,
  color,
  itemCount,
  brandCount,
  isExpanded,
  onToggle,
  token,
  locationId,
  familyId,
  categoryId,
  stockStatus,
  showFinancials,
  onSelectProduct,
  colCount,
  expandedBrands,
  expandedMakes,
  onToggleBrand,
  onToggleMake,
  allLocations,
}: CategoryRowWithChildrenProps) {
  return (
    <>
      <tr onClick={onToggle} className={cn("cursor-pointer transition-colors duration-75", "hover:bg-accent/50")}>
        <td className="w-9 px-2 py-[6px]" />
        <td colSpan={colCount - 1} className="px-3 py-[6px]">
          <div className="flex items-center gap-2" style={{ paddingLeft: "36px" }}>
            <ChevronRight
              size={13}
              className={cn(
                "shrink-0 text-muted-foreground transition-transform duration-150",
                isExpanded && "rotate-90",
              )}
            />
            {color ? (
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
            ) : (
              <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-muted-foreground/30" />
            )}
            <span className="text-[12px] font-medium">{name}</span>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {itemCount} items &middot; {brandCount} brands
            </span>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <BrandRows
          token={token}
          locationId={locationId}
          familyId={familyId}
          categoryId={categoryId}
          catKey={catKey}
          stockStatus={stockStatus}
          showFinancials={showFinancials}
          onSelectProduct={onSelectProduct}
          colCount={colCount}
          expandedBrands={expandedBrands}
          expandedMakes={expandedMakes}
          onToggleBrand={onToggleBrand}
          onToggleMake={onToggleMake}
          allLocations={allLocations}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
 * FamilyRow (Level 1)
 * ───────────────────────────────────────────── */

interface FamilyRowProps {
  familyKey: string;
  name: string;
  itemCount: number;
  categoryCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  token: string;
  locationId: string;
  familyId: string;
  stockStatus?: string;
  showFinancials: boolean;
  onSelectProduct: (id: string) => void;
  colCount: number;
  expandedCategories: Set<string>;
  expandedBrands: Set<string>;
  expandedMakes: Set<string>;
  onToggleCategory: (key: string) => void;
  onToggleBrand: (key: string) => void;
  onToggleMake: (key: string) => void;
  allLocations?: boolean;
}

function FamilyRow({
  familyKey,
  name,
  itemCount,
  categoryCount,
  isExpanded,
  onToggle,
  token,
  locationId,
  familyId,
  stockStatus,
  showFinancials,
  onSelectProduct,
  colCount,
  expandedCategories,
  expandedBrands,
  expandedMakes,
  onToggleCategory,
  onToggleBrand,
  onToggleMake,
  allLocations,
}: FamilyRowProps) {
  return (
    <>
      <tr onClick={onToggle} className={cn("cursor-pointer transition-colors duration-75", "bg-muted/30 hover:bg-muted/50")}>
        <td className="w-9 px-2 py-[6px]" />
        <td colSpan={colCount - 1} className="px-3 py-[6px]">
          <div className="flex items-center gap-2" style={{ paddingLeft: "12px" }}>
            <ChevronRight
              size={13}
              className={cn(
                "shrink-0 text-muted-foreground transition-transform duration-150",
                isExpanded && "rotate-90",
              )}
            />
            <Layers size={12} className="shrink-0 text-muted-foreground" />
            <span className="text-[13px] font-semibold">{name}</span>
            <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">
              {itemCount} items &middot; {categoryCount} categories
            </span>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <CategoryRows
          token={token}
          locationId={locationId}
          familyId={familyId}
          familyKey={familyKey}
          stockStatus={stockStatus}
          showFinancials={showFinancials}
          onSelectProduct={onSelectProduct}
          colCount={colCount}
          expandedCategories={expandedCategories}
          expandedBrands={expandedBrands}
          expandedMakes={expandedMakes}
          onToggleCategory={onToggleCategory}
          onToggleBrand={onToggleBrand}
          onToggleMake={onToggleMake}
          allLocations={allLocations}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
 * DrillDownView (orchestrator — exported)
 * ───────────────────────────────────────────── */

export function DrillDownView({
  token,
  locationId,
  stockStatus,
  showFinancials,
  onSelectProduct,
  familyFilter,
  categoryFilter,
  brandFilter,
  colCount,
  allLocations,
}: DrillDownViewProps) {
  const [expandedFamilies, setExpandedFamilies] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedBrands, setExpandedBrands] = useState<Set<string>>(new Set());
  const [expandedMakes, setExpandedMakes] = useState<Set<string>>(new Set());

  // Auto-expand from filters
  useEffect(() => {
    if (familyFilter) {
      setExpandedFamilies((prev) => {
        const next = new Set(prev);
        next.add(familyFilter);
        return next;
      });
    }
  }, [familyFilter]);

  // Toggle helpers with cascading collapse
  const toggleFamily = useCallback((key: string) => {
    setExpandedFamilies((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Cascade: collapse all children
        setExpandedCategories((s) => {
          const n = new Set<string>();
          s.forEach((k) => { if (!k.startsWith(key + ":")) n.add(k); });
          return n;
        });
        setExpandedBrands((s) => {
          const n = new Set<string>();
          s.forEach((k) => { if (!k.startsWith(key + ":")) n.add(k); });
          return n;
        });
        setExpandedMakes((s) => {
          const n = new Set<string>();
          s.forEach((k) => { if (!k.startsWith(key + ":")) n.add(k); });
          return n;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleCategory = useCallback((key: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Cascade
        setExpandedBrands((s) => {
          const n = new Set<string>();
          s.forEach((k) => { if (!k.startsWith(key + ":")) n.add(k); });
          return n;
        });
        setExpandedMakes((s) => {
          const n = new Set<string>();
          s.forEach((k) => { if (!k.startsWith(key + ":")) n.add(k); });
          return n;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleBrand = useCallback((key: string) => {
    setExpandedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        // Cascade
        setExpandedMakes((s) => {
          const n = new Set<string>();
          s.forEach((k) => { if (!k.startsWith(key + ":")) n.add(k); });
          return n;
        });
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleMake = useCallback((key: string) => {
    setExpandedMakes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Fetch top-level families
  const { data: familyData, isLoading } = useGroupedCounts<FamilyCountRow>(
    token,
    locationId,
    "family",
    { stockStatus, allLocations },
  );

  const families = useMemo(() => sortNullLast(familyData?.data ?? []), [familyData]);

  // Filter families when a family filter is active
  const visibleFamilies = useMemo(
    () => familyFilter ? families.filter((fam) => fam.id === familyFilter) : families,
    [families, familyFilter],
  );

  if (isLoading) return <LoadingRow colCount={colCount} />;

  return (
    <>
      {visibleFamilies.map((fam) => {
        const familyId = fam.id ?? NONE;
        const familyKey = familyId;
        const isExpanded = expandedFamilies.has(familyKey);
        const name = fam.id ? fam.name : "No Family";

        return (
          <FamilyRow
            key={familyKey}
            familyKey={familyKey}
            name={name}
            itemCount={fam.itemCount}
            categoryCount={fam.categoryCount}
            isExpanded={isExpanded}
            onToggle={() => toggleFamily(familyKey)}
            token={token}
            locationId={locationId}
            familyId={familyId}
            stockStatus={stockStatus}
            showFinancials={showFinancials}
            onSelectProduct={onSelectProduct}
            colCount={colCount}
            expandedCategories={expandedCategories}
            expandedBrands={expandedBrands}
            expandedMakes={expandedMakes}
            onToggleCategory={toggleCategory}
            onToggleBrand={toggleBrand}
            onToggleMake={toggleMake}
            allLocations={allLocations}
          />
        );
      })}
      {visibleFamilies.length === 0 && (
        <tr>
          <td className="w-9" />
          <td colSpan={colCount - 1} className="py-8 text-center text-sm text-muted-foreground">
            No product families found
          </td>
        </tr>
      )}
    </>
  );
}
