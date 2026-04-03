"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronRight,
  Loader2,
  Layers,
  Trash2,
  Pencil,
  MoreVertical,
  Eye,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth, ALL_LOCATIONS } from "@/app/auth-context";
import { useVariants, type VariantRow } from "@/hooks/use-variants";
import { cn } from "@/lib/utils";
import { getMarginPercent, formatPrice } from "../lib/inventory-utils";
import type { ProductRow, SortField, SortDir } from "@/hooks/use-products";

/* ─────────────────────────────────────────────
 * Sortable Column Header
 * ───────────────────────────────────────────── */
export function SortableHeader({
  label,
  field,
  activeField,
  activeDir,
  onSort,
  align = "left",
}: {
  label: string;
  field: SortField;
  activeField: SortField;
  activeDir: SortDir;
  onSort: (field: SortField) => void;
  align?: "left" | "right";
}) {
  const isActive = field === activeField;

  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        "group inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors select-none",
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        align === "right" && "flex-row-reverse",
      )}
    >
      {label}
      <span className="inline-flex w-3 justify-center">
        {isActive ? (
          activeDir === "asc" ? (
            <ChevronUp size={11} className="text-primary" strokeWidth={2.5} />
          ) : (
            <ChevronDown size={11} className="text-primary" strokeWidth={2.5} />
          )
        ) : (
          <ChevronsUpDown
            size={11}
            className="text-muted-foreground/30 group-hover:text-muted-foreground/60"
          />
        )}
      </span>
    </button>
  );
}

/* ─────────────────────────────────────────────
 * Stock Pill
 * ───────────────────────────────────────────── */
export function StockPill({ stockLevel, reorderPoint }: { stockLevel: number; reorderPoint: number }) {
  // Clamp: prevent "-0" or negative display — physical stock can't be negative
  const display = stockLevel <= 0 ? 0 : stockLevel;
  return (
    <span className={cn(
      "inline-flex min-w-[36px] items-center justify-end rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums",
      display === 0
        ? "bg-red-50 text-red-700"
        : display <= reorderPoint
          ? "bg-amber-50 text-amber-700"
          : "text-foreground",
    )}>
      {display.toLocaleString()}
    </span>
  );
}

/* ─────────────────────────────────────────────
 * Stock Popover — click stock number to see per-location breakdown
 * ───────────────────────────────────────────── */
interface ProductLocationRow {
  inventoryId: string | null;
  locationId: string;
  locationName: string;
  locationType: string;
  stockLevel: number;
  reservedLevel: number;
  reorderPoint: number;
  optimalStock: number;
  availableForSale: boolean;
}

export function StockPopover({
  productId,
  stockLevel,
  reorderPoint,
  unitsPerCase = 1,
  packagingUnit,
}: {
  productId: string;
  stockLevel: number;
  reorderPoint: number;
  unitsPerCase?: number;
  packagingUnit?: string | null;
}) {
  const upc = unitsPerCase > 1 ? unitsPerCase : 0;
  const pkgUnit = packagingUnit || "case";
  const hasPkg = upc > 1;
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { token, apiLocationId, locationId } = useAuth();
  const isAllLocations = locationId === ALL_LOCATIONS;

  const { data, isLoading } = useQuery<{ data: ProductLocationRow[] }>({
    queryKey: ["stock-locations", productId],
    queryFn: () =>
      apiFetch(`/inventory/stock-levels/product/${productId}/locations`, {
        token,
        locationId: apiLocationId,
      }),
    enabled: open,
    staleTime: 30_000,
  });

  // Sort by stockLevel descending
  const locations = useMemo(() => {
    if (!data?.data) return [];
    return [...data.data].sort((a, b) => b.stockLevel - a.stockLevel);
  }, [data]);

  const total = useMemo(
    () => Math.max(0, locations.reduce((sum, loc) => sum + Math.max(0, loc.stockLevel), 0)),
    [locations],
  );

  // Outside-click dismiss (check both portal content and trigger button)
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        ref={triggerRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const goUp = spaceBelow < 300;
            setOpenUpward(goUp);
            setPopoverPos({
              top: goUp ? rect.top : rect.bottom + 4,
              left: rect.right - 224, // 224px = w-56
            });
          }
          setOpen(!open);
        }}
        className="group"
        title="Click to see per-location stock"
      >
        <span className={cn(
          "inline-flex min-w-[36px] items-center justify-end rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums cursor-pointer transition-all",
          (stockLevel <= 0)
            ? "bg-red-50 text-red-700 group-hover:bg-red-100"
            : stockLevel <= reorderPoint
              ? "bg-amber-50 text-amber-700 group-hover:bg-amber-100"
              : "text-foreground group-hover:bg-muted",
        )}>
          {(stockLevel <= 0 ? 0 : stockLevel).toLocaleString()}
        </span>
      </button>

      {open && createPortal(
        <div
          className="fixed z-[9999] w-56 rounded-lg border border-border bg-background shadow-lg animate-in fade-in duration-100"
          style={{
            top: openUpward ? undefined : popoverPos.top,
            bottom: openUpward ? window.innerHeight - popoverPos.top + 4 : undefined,
            left: Math.max(8, popoverPos.left),
          }}
          ref={ref}
        >
          <div className="border-b border-border px-3 py-2">
            <span className="text-[11px] font-semibold text-foreground">Stock by Location</span>
            {hasPkg && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                1 {pkgUnit} = {upc} pieces
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 size={14} className="animate-spin text-muted-foreground" />
            </div>
          ) : locations.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11px] text-muted-foreground">
              No locations found
            </div>
          ) : (
            <div className="py-1">
              {locations.map((loc) => {
                const isCurrent = !isAllLocations && loc.locationId === apiLocationId;
                return (
                  <div
                    key={loc.locationId}
                    className={cn(
                      "flex items-center justify-between px-3 py-1.5",
                      isCurrent && "bg-primary/[0.05]",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          loc.stockLevel > 0 ? "bg-emerald-500" : "bg-red-400",
                        )}
                      />
                      <span className={cn(
                        "truncate text-[11px]",
                        isCurrent ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}>
                        {loc.locationName}
                        {isCurrent && <span className="ml-1 text-[9px] text-primary">(current)</span>}
                      </span>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      {(() => {
                        const s = Math.max(0, loc.stockLevel);
                        if (hasPkg && s >= upc) {
                          const cases = Math.floor(s / upc);
                          const loose = s % upc;
                          return (
                            <>
                              <span className="text-[11px] font-semibold tabular-nums text-foreground">
                                {s.toLocaleString()}
                              </span>
                              <span className="text-[9px] text-muted-foreground ml-1">
                                ({cases}{loose > 0 ? `.${loose}` : ""} {pkgUnit}{cases !== 1 ? "s" : ""})
                              </span>
                            </>
                          );
                        }
                        return (
                          <span className={cn(
                            "text-[11px] font-semibold tabular-nums",
                            s === 0 ? "text-red-600" : "text-foreground",
                          )}>
                            {s.toLocaleString()}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {!isLoading && locations.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-1.5">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total</span>
              <div className="text-right">
                <span className="text-[11px] font-bold tabular-nums text-foreground">
                  {total.toLocaleString()}
                </span>
                {hasPkg && total >= upc && (() => {
                  const cases = Math.floor(total / upc);
                  const loose = total % upc;
                  return (
                    <span className="text-[9px] text-muted-foreground ml-1">
                      ({cases}{loose > 0 ? `.${loose}` : ""} {pkgUnit}{cases !== 1 ? "s" : ""})
                    </span>
                  );
                })()}
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Per-Row Actions Menu
 * ───────────────────────────────────────────── */
export function RowActions({
  productId,
  productName,
  isParent,
  onView,
  onDelete,
}: {
  productId: string;
  productName: string;
  isParent?: boolean;
  onView: () => void;
  onDelete: (id: string, name: string, isParent?: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            setOpenUpward(spaceBelow < 160);
          }
          setOpen(!open);
        }}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div className={cn(
          "absolute right-0 z-20 w-40 rounded-lg border border-border bg-background py-1 shadow-lg",
          openUpward ? "bottom-full mb-1" : "top-full mt-1",
        )}>
          <button
            onClick={(e) => { e.stopPropagation(); onView(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent"
          >
            <Eye size={13} /> View Details
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/inventory/${productId}/edit`); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent"
          >
            <Pencil size={13} /> Edit Item
          </button>
          <div className="my-1 border-t border-border" />
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(productId, productName, isParent); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-left text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={13} /> Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Parent-aware Checkbox — shows indeterminate
 * ───────────────────────────────────────────── */
export function ParentAwareCheckbox({
  isParent,
  isSelected,
  parentId,
  getParentCheckState,
  onToggleSelect,
  onToggleParentSelect,
}: {
  isParent: boolean;
  isSelected: boolean;
  parentId: string;
  getParentCheckState: (parentId: string, variantIds: string[]) => boolean | "indeterminate";
  onToggleSelect: () => void;
  onToggleParentSelect: (parentId: string, variantIds: string[]) => void;
}) {
  const { token, locationId } = useAuth();
  const { data } = useVariants(token, locationId, isParent ? parentId : undefined);
  const variantIds = useMemo(() => (data?.data ?? []).map((v) => v.id), [data]);

  const checkboxRef = useRef<HTMLInputElement>(null);
  const checkState = isParent ? getParentCheckState(parentId, variantIds) : isSelected;

  useEffect(() => {
    if (checkboxRef.current && isParent) {
      checkboxRef.current.indeterminate = checkState === "indeterminate";
    }
  }, [checkState, isParent]);

  return (
    <input
      ref={checkboxRef}
      type="checkbox"
      checked={checkState === true}
      onChange={() => {
        if (isParent) {
          onToggleParentSelect(parentId, variantIds);
        } else {
          onToggleSelect();
        }
      }}
      className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
    />
  );
}

/* ─────────────────────────────────────────────
 * Flat Product Row (standalone or ungrouped mode)
 * ───────────────────────────────────────────── */
export function FlatProductRow({
  product: p,
  showFinancials,
  isSelected,
  selectedIds,
  onToggleSelect,
  onToggleParentSelect,
  onToggleVariantSelect,
  getParentCheckState,
  onSelectProduct,
  isParentExpanded,
  onToggleParent,
  colCount,
  onDeleteSingle,
}: {
  product: ProductRow;
  showFinancials: boolean;
  isSelected: boolean;
  selectedIds: Set<string>;
  onToggleSelect: () => void;
  onToggleParentSelect: (parentId: string, variantIds: string[]) => void;
  onToggleVariantSelect: (variantId: string, parentId: string, allVariantIds: string[]) => void;
  getParentCheckState: (parentId: string, variantIds: string[]) => boolean | "indeterminate";
  onSelectProduct: () => void;
  isParentExpanded: boolean;
  onToggleParent: () => void;
  colCount: number;
  onDeleteSingle: (id: string, name: string, isParent?: boolean) => void;
}) {
  const sell = parseFloat(p.unitPrice) || 0;
  const cost = parseFloat(p.costPrice) || 0;
  const margin = getMarginPercent(sell, cost);
  const { token, locationId } = useAuth();

  return (
    <>
      <tr
        onClick={onSelectProduct}
        className={cn(
          "cursor-pointer transition-colors duration-75",
          p.isParent && "bg-muted/30 hover:bg-muted/50",
          !p.isParent && isSelected && "bg-primary/[0.05]",
          !p.isParent && !isSelected && p.stockLevel <= 0 && p.discontinued && "bg-gray-100 hover:bg-gray-200/70",
          !p.isParent && !isSelected && p.stockLevel <= 0 && !p.discontinued && p.specialOrder && "bg-blue-50 hover:bg-blue-100/70",
          !p.isParent && !isSelected && p.stockLevel <= 0 && !p.discontinued && !p.specialOrder && "bg-red-50 hover:bg-red-100/70",
          !p.isParent && !isSelected && p.stockLevel > 0 && "hover:bg-accent/70",
        )}
      >
        {/* Arrow (expand/collapse) — only for parent items */}
        <td className="w-8 px-1 py-[5px] text-center">
          {p.isParent && (
            <button
              onClick={(e) => { e.stopPropagation(); onToggleParent(); }}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronRight
                size={14}
                className={cn(
                  "transition-transform duration-150",
                  isParentExpanded && "rotate-90",
                )}
              />
            </button>
          )}
        </td>
        {/* Checkbox */}
        <td className="w-9 px-2 py-[5px] text-center" onClick={(e) => e.stopPropagation()}>
          <ParentAwareCheckbox
            isParent={p.isParent ?? false}
            isSelected={isSelected}
            parentId={p.id}
            getParentCheckState={getParentCheckState}
            onToggleSelect={onToggleSelect}
            onToggleParentSelect={onToggleParentSelect}
          />
        </td>
        {/* Item Name */}
        <td className="px-3 py-[5px]">
          <div className="flex items-center gap-1.5">
            <span className={cn("block truncate text-[12px] leading-snug text-foreground", p.isParent ? "font-semibold" : "font-medium")}>
              {p.name}
            </span>
            {p.specialOrder && (
              <span className="shrink-0 rounded bg-blue-100 px-1.5 py-px text-[10px] font-medium text-blue-700">SO</span>
            )}
            {p.discontinued && (
              <span className="shrink-0 rounded bg-gray-200 px-1.5 py-px text-[10px] font-medium text-gray-600">DC</span>
            )}
            {p.isSerialized && !(p as any).isTire && (
              <span className="shrink-0 rounded bg-violet-100 px-1.5 py-px text-[10px] font-medium text-violet-700">SN</span>
            )}
            {(p as any).isTire && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700">DOT</span>
            )}
            {p.isParent && (
              <span className="inline-flex items-center gap-1 shrink-0 rounded-full bg-violet-50 px-1.5 py-px text-[10px] font-medium text-violet-600">
                <Layers size={9} />
                variants
              </span>
            )}
          </div>
        </td>
        {/* Stock */}
        <td className="px-2 py-[5px] text-right">
          <StockPopover productId={p.id} stockLevel={p.stockLevel} reorderPoint={p.reorderPoint} unitsPerCase={p.unitsPerCase} packagingUnit={p.packagingUnit} />
        </td>
        {/* Sell */}
        <td className="px-3 py-[5px] text-right font-medium tabular-nums text-foreground">
          {p.isParent ? (
            <span className="inline-block rounded px-1.5 py-px text-[10px] font-medium leading-normal bg-violet-50/80 text-violet-600">Variable</span>
          ) : p.isVariablePrice ? (
            <span className="inline-block rounded px-1.5 py-px text-[10px] font-medium leading-normal bg-amber-50/80 text-amber-600">Variable</span>
          ) : (
            formatPrice(sell)
          )}
        </td>
        {/* Brand */}
        <td className="px-3 py-[5px]">
          {p.brandName ? (
            <span className="text-[12px] text-muted-foreground truncate block max-w-[100px]" title={p.brandName}>{p.brandName}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">{"\u2014"}</span>
          )}
        </td>
        {/* Category */}
        <td className="px-3 py-[5px]">
          {p.subCategoryName ? (
            <span className="text-[12px] text-muted-foreground truncate block max-w-[120px]" title={p.subCategoryName}>{p.subCategoryName}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">{"\u2014"}</span>
          )}
        </td>
        {/* Sub-category */}
        <td className="px-3 py-[5px]">
          {p.subcategoryName ? (
            <span className="text-[12px] text-muted-foreground truncate block max-w-[110px]" title={p.subcategoryName}>{p.subcategoryName}</span>
          ) : (
            <span className="text-[11px] text-muted-foreground/40">{"\u2014"}</span>
          )}
        </td>
        {/* Cost & Margin */}
        {showFinancials && (
          <>
            <td className="px-3 py-[5px] text-right tabular-nums text-muted-foreground">
              {p.isParent ? <span className="text-muted-foreground/40">{"\u2014"}</span> : cost > 0 ? formatPrice(cost) : "\u2014"}
            </td>
            <td className={cn(
              "px-3 py-[5px] text-right font-medium tabular-nums",
              !p.isParent && margin.value > 0 && margin.value < 20
                ? "text-destructive"
                : "text-muted-foreground",
            )}>
              {p.isParent ? <span className="text-muted-foreground/40">{"\u2014"}</span> : margin.display}
            </td>
          </>
        )}
        {/* Actions */}
        <td className="px-1 py-[5px] text-center" onClick={(e) => e.stopPropagation()}>
          <RowActions
            productId={p.id}
            productName={p.name}
            isParent={p.isParent ?? false}
            onView={onSelectProduct}
            onDelete={onDeleteSingle}
          />
        </td>
      </tr>
      {p.isParent && isParentExpanded && (
        <VariantSubRows
          parentId={p.id}
          token={token}
          locationId={locationId}
          showFinancials={showFinancials}
          colCount={colCount}
          selectedIds={selectedIds}
          onToggleVariantSelect={onToggleVariantSelect}
          onSelectProduct={onSelectProduct}
        />
      )}
    </>
  );
}

/* ─────────────────────────────────────────────
 * Variant Sub-Rows (expanded under parent)
 * ───────────────────────────────────────────── */
export function VariantSubRows({
  parentId,
  token,
  locationId,
  showFinancials,
  colCount,
  selectedIds,
  onToggleVariantSelect,
  onSelectProduct,
}: {
  parentId: string;
  token: string;
  locationId: string;
  showFinancials: boolean;
  colCount: number;
  selectedIds: Set<string>;
  onToggleVariantSelect: (variantId: string, parentId: string, allVariantIds: string[]) => void;
  onSelectProduct: () => void;
}) {
  const { data, isLoading } = useVariants(token, locationId, parentId);
  const variants = data?.data ?? [];

  if (isLoading) {
    return (
      <tr>
        <td colSpan={colCount} className="py-3 text-center">
          <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 size={12} className="animate-spin" /> Loading variants...
          </div>
        </td>
      </tr>
    );
  }

  if (variants.length === 0) {
    return (
      <tr>
        <td colSpan={colCount} className="py-3 text-center text-[11px] text-muted-foreground">
          No variants created yet
        </td>
      </tr>
    );
  }

  const allVariantIds = variants.map((v) => v.id);

  return (
    <>
      {variants.map((v) => {
        const sell = parseFloat(v.unitPrice) || 0;
        const cost = parseFloat(v.costPrice) || 0;
        const margin = getMarginPercent(sell, cost);
        const isVariantSelected = selectedIds.has(v.id);

        return (
          <tr
            key={v.id}
            onClick={onSelectProduct}
            className={cn(
              "cursor-pointer border-l-2 border-l-primary/20 transition-colors duration-75",
              isVariantSelected ? "bg-primary/[0.05]" : v.stockLevel <= 0 ? (v.discontinued ? "bg-gray-100 hover:bg-gray-200/70" : v.specialOrder ? "bg-blue-50 hover:bg-blue-100/70" : "bg-red-50 hover:bg-red-100/70") : "bg-background hover:bg-accent/50",
            )}
          >
            {/* Arrow (empty for variant rows) */}
            <td className="w-8" />
            {/* Checkbox */}
            <td className="w-9 px-2 py-[4px] text-center" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={isVariantSelected}
                onChange={() => onToggleVariantSelect(v.id, parentId, allVariantIds)}
                className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
              />
            </td>
            {/* Name + option tags */}
            <td className="py-[4px] pl-8 pr-3">
              <div className="flex flex-col gap-0.5">
                <span className="block truncate text-[12px] font-medium leading-snug text-foreground">
                  {v.name || v.sku}
                </span>
                {v.options.length > 0 && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {v.options.map((o, idx) => (
                      <span key={idx} className="inline-flex items-center rounded-md bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
                        {o.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </td>
            {/* Stock */}
            <td className="px-2 py-[4px] text-right">
              <StockPopover productId={v.id} stockLevel={v.stockLevel} reorderPoint={0} />
            </td>
            {/* Sell */}
            <td className="px-3 py-[4px] text-right font-medium tabular-nums text-foreground">
              {v.isVariablePrice ? (
                <span className="inline-block rounded px-1.5 py-px text-[10px] font-medium leading-normal bg-amber-50/80 text-amber-600">Variable</span>
              ) : (
                formatPrice(sell)
              )}
            </td>
            {/* Brand (empty for variants) */}
            <td className="px-3 py-[4px]" />
            {/* Category (empty for variants) */}
            <td className="px-3 py-[4px]" />
            {/* Sub-category (empty for variants) */}
            <td className="px-3 py-[4px]" />
            {showFinancials && (
              <>
                <td className="px-3 py-[4px] text-right tabular-nums text-muted-foreground">
                  {cost > 0 ? formatPrice(cost) : "\u2014"}
                </td>
                <td className={cn(
                  "px-3 py-[4px] text-right font-medium tabular-nums",
                  margin.value > 0 && margin.value < 20 ? "text-destructive" : "text-muted-foreground",
                )}>
                  {margin.display}
                </td>
              </>
            )}
            {/* Actions (empty for variants) */}
            <td className="px-1 py-[4px]" />
          </tr>
        );
      })}
    </>
  );
}
