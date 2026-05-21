"use client";

import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { ProductRow, SortDir, SortField } from "@/hooks/use-products";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/ui/layout";
import { DrillDownView } from "../drill-down";
import { PAGE_SIZES } from "../lib/inventory-utils";
import { EmptyState } from "./empty-state";
import { FlatProductRow, SortableHeader } from "./inventory-table";

interface InventoryTableShellProps {
  products: ProductRow[];
  isLoading: boolean;
  searchQuery: string;
  hasActiveFilters: boolean;
  selectedIds: Set<string>;
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>;
  showFinancials: boolean;
  effectiveViewMode: "flat" | "nested";
  sortBy: SortField;
  sortDir: SortDir;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasMore: boolean;
  token: string;
  apiLocationId: string;
  stockStatusFilter: string;
  familyFilter: string;
  categoryFilter: string;
  brandFilter: string;
  isAllLocations: boolean;
  canEdit: boolean;
  onSort: (field: SortField) => void;
  onPageChange: Dispatch<SetStateAction<number>>;
  onPageSizeChange: (size: number) => void;
  onSelectProduct: (productId: string) => void;
  onDeleteSingle: (productId: string, productName: string, isParent?: boolean) => void;
  onClearFilters: () => void;
}

export function InventoryTableShell({
  products,
  isLoading,
  searchQuery,
  hasActiveFilters,
  selectedIds,
  setSelectedIds,
  showFinancials,
  effectiveViewMode,
  sortBy,
  sortDir,
  page,
  pageSize,
  totalItems,
  totalPages,
  hasMore,
  token,
  apiLocationId,
  stockStatusFilter,
  familyFilter,
  categoryFilter,
  brandFilter,
  isAllLocations,
  canEdit,
  onSort,
  onPageChange,
  onPageSizeChange,
  onSelectProduct,
  onDeleteSingle,
  onClearFilters,
}: InventoryTableShellProps) {
  const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
  const colCount = showFinancials ? 11 : 9;
  const selectableIds = useMemo(() => products.map((product) => product.id), [products]);
  const allOnPageSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setSelectedIds]);

  const toggleParentSelection = useCallback((parentId: string, variantIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) {
        next.delete(parentId);
        variantIds.forEach((variantId) => next.delete(variantId));
      } else {
        next.add(parentId);
        variantIds.forEach((variantId) => next.add(variantId));
      }
      return next;
    });
  }, [setSelectedIds]);

  const toggleVariantSelection = useCallback((variantId: string, parentId: string, allVariantIds: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) {
        next.delete(variantId);
        const anyStillSelected = allVariantIds.some((id) => id !== variantId && next.has(id));
        if (!anyStillSelected) next.delete(parentId);
      } else {
        next.add(variantId);
        const allNowSelected = allVariantIds.every((id) => id === variantId || next.has(id));
        if (allNowSelected) next.add(parentId);
      }
      return next;
    });
  }, [setSelectedIds]);

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
      }

      const next = new Set(prev);
      selectableIds.forEach((id) => next.add(id));
      return next;
    });
  }, [allOnPageSelected, selectableIds, setSelectedIds]);

  const toggleParentExpansion = useCallback((productId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div className="surface-card flex min-h-[32rem] items-center justify-center rounded-2xl">
        <LoadingState label="Loading inventory..." />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <EmptyState
        query={searchQuery}
        hasFilters={hasActiveFilters}
        onClearFilters={onClearFilters}
      />
    );
  }

  return (
    <div className={cn("surface-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl", selectedIds.size > 0 && "mb-14")}>
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[700px] text-[12px]">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/90 backdrop-blur-sm">
            <tr>
              <th scope="col" className="w-8" />
              <th scope="col" className="w-9 px-2 py-[7px] text-center">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-border accent-primary"
                />
              </th>
              <th scope="col" className="min-w-[200px] px-3 py-[7px] text-left">
                <SortableHeader label="Item Name" field="name" activeField={sortBy} activeDir={sortDir} onSort={onSort} />
              </th>
              <th scope="col" className="w-[70px] px-2 py-[7px] text-right">
                <SortableHeader label="Stock" field="stockLevel" activeField={sortBy} activeDir={sortDir} onSort={onSort} align="right" />
              </th>
              <th scope="col" className="w-[85px] px-3 py-[7px] text-right">
                <SortableHeader label="Sell" field="unitPrice" activeField={sortBy} activeDir={sortDir} onSort={onSort} align="right" />
              </th>
              <th scope="col" className="w-[110px] px-3 py-[7px] text-left">
                <SortableHeader label="Brand" field="brandName" activeField={sortBy} activeDir={sortDir} onSort={onSort} />
              </th>
              <th scope="col" className="w-[130px] px-3 py-[7px] text-left">
                <SortableHeader label="Category" field="categoryName" activeField={sortBy} activeDir={sortDir} onSort={onSort} />
              </th>
              <th scope="col" className="w-[120px] px-3 py-[7px] text-left">
                <SortableHeader label="Sub-category" field="subcategoryName" activeField={sortBy} activeDir={sortDir} onSort={onSort} />
              </th>
              {showFinancials && (
                <>
                  <th scope="col" className="w-[75px] px-3 py-[7px] text-right">
                    <SortableHeader label="Cost" field="costPrice" activeField={sortBy} activeDir={sortDir} onSort={onSort} align="right" />
                  </th>
                  <th scope="col" className="w-[65px] px-3 py-[7px] text-right">
                    <SortableHeader label="Margin" field="margin" activeField={sortBy} activeDir={sortDir} onSort={onSort} align="right" />
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
                onSelectProduct={onSelectProduct}
                familyFilter={familyFilter || undefined}
                categoryFilter={categoryFilter || undefined}
                brandFilter={brandFilter || undefined}
                colCount={colCount}
                allLocations={isAllLocations}
              />
            ) : (
              products.map((product) => (
                <FlatProductRow
                  key={product.id}
                  product={product}
                  showFinancials={showFinancials}
                  isSelected={selectedIds.has(product.id)}
                  selectedIds={selectedIds}
                  onToggleSelect={() => toggleOne(product.id)}
                  onToggleParentSelect={toggleParentSelection}
                  onToggleVariantSelect={toggleVariantSelection}
                  getParentCheckState={getParentCheckState}
                  onSelectProduct={() => onSelectProduct(product.id)}
                  isParentExpanded={expandedParents.has(product.id)}
                  onToggleParent={() => toggleParentExpansion(product.id)}
                  colCount={colCount}
                  onDeleteSingle={onDeleteSingle}
                  canEdit={canEdit}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {effectiveViewMode !== "nested" && (
        <div className="flex shrink-0 items-center justify-between border-t border-border/70 bg-background/70 px-3 py-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            Showing{" "}
            {((page - 1) * pageSize + 1).toLocaleString()}&ndash;{Math.min(page * pageSize, totalItems).toLocaleString()}{" "}
            of {totalItems.toLocaleString()}
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Rows</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
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
                onClick={() => onPageChange((currentPage) => Math.max(1, currentPage - 1))}
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <span className="min-w-[4.5rem] text-center text-[11px] tabular-nums text-muted-foreground">
                {page.toLocaleString()} / {totalPages.toLocaleString()}
              </span>
              <button
                disabled={!hasMore}
                onClick={() => onPageChange((currentPage) => currentPage + 1)}
                className="rounded border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
