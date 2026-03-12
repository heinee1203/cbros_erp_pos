"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Scale,
  Plus,
  Search,
  X,
  ChevronDown,
  ArrowUpCircle,
  ArrowDownCircle,
  Package,
  AlertTriangle,
  ClipboardList,
  Loader2,
  ChevronsDown,
  ExternalLink,
} from "lucide-react";
import {
  AdjustmentReasonCode,
  POSITIVE_ONLY_REASON_CODES,
  NEGATIVE_ONLY_REASON_CODES,
  RESTRICTED_REASON_CODES,
} from "@apex/types";
import { useAdjustmentMutation } from "@/hooks/use-adjustment-mutation";
import type { AdjustmentMutationStatus } from "@/hooks/use-adjustment-mutation";
import { useAuth } from "@/app/auth-context";
import type { LocationInfo } from "@/app/auth-context";
import { useStockJournal, type JournalEntry } from "@/hooks/use-stock-journal";
import { useProductSearch, type ProductSearchResult } from "@/hooks/use-product-search";

/* ═══════════════════════════════════════════════════════
 * CONSTANTS
 * ═══════════════════════════════════════════════════════ */

const REASON_CODE_LABELS: Record<string, string> = {
  COUNT_GAIN: "Count Gain",
  FOUND_STOCK: "Found Stock",
  OPENING_BALANCE: "Opening Balance",
  COUNT_LOSS: "Count Loss",
  DAMAGE_IN_TRANSIT: "Damage — Transit",
  DAMAGE_WAREHOUSE: "Damage — Warehouse",
  DAMAGE_SHOWROOM: "Damage — Showroom",
  WARRANTY_WRITE_OFF: "Warranty Write-Off",
  SHRINKAGE_MISSING: "Shrinkage / Missing",
  OBSOLETE_WRITE_OFF: "Obsolete Write-Off",
  TRANSFER_SHORTAGE_CONFIRMED: "Transfer Shortage",
  DATA_CORRECTION: "Data Correction",
};

const ALL_REASON_CODES = Object.keys(REASON_CODE_LABELS);

/* ═══════════════════════════════════════════════════════
 * PERMISSION STUB
 * ═══════════════════════════════════════════════════════ */

const canCreate = true; // TODO: derive from user role (ADMIN, MANAGER, WAREHOUSE_STAFF)

/* ═══════════════════════════════════════════════════════
 * MAIN PAGE COMPONENT
 * ═══════════════════════════════════════════════════════ */

export default function StockAdjustmentsPage() {
  const { token, locationId, locations, loading: authLoading } = useAuth();

  // ── Filter state ──
  const [allLocations, setAllLocations] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<"all" | "IN" | "OUT">("all");
  const [reasonFilter, setReasonFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // ── Drawer state ──
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Debounce search input ──
  const searchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef[0]) clearTimeout(searchTimeoutRef[0]);
    searchTimeoutRef[1](
      setTimeout(() => setDebouncedSearch(value), 300),
    );
  };

  // ── Real data via shared hook (scoped to ADJUSTMENT) ──
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error,
  } = useStockJournal(token, locationId, {
    allLocations,
    referenceType: "ADJUSTMENT",
    search: debouncedSearch || undefined,
    direction: directionFilter !== "all" ? directionFilter : undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    reasonCode: reasonFilter !== "all" ? reasonFilter : undefined,
  });

  // Flatten all pages into a single array
  const entries = useMemo(
    () => data?.pages.flatMap((page) => page.data) ?? [],
    [data],
  );

  const totalCount = entries.length;

  const hasActiveFilters =
    directionFilter !== "all" ||
    reasonFilter !== "all" ||
    searchQuery !== "" ||
    dateFrom !== "" ||
    dateTo !== "";

  const clearFilters = () => {
    setDirectionFilter("all");
    setReasonFilter("all");
    setSearchQuery("");
    setDebouncedSearch("");
    setDateFrom("");
    setDateTo("");
  };

  // ── Auth loading ──
  if (authLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Page Header ── */}
      <div className="border-b border-border bg-background px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Scale size={18} className="text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Stock Adjustments</h1>
              <p className="text-xs text-muted-foreground">
                Record and audit inventory corrections across all locations
              </p>
            </div>
          </div>
          {canCreate && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              <Plus size={16} />
              New Adjustment
            </button>
          )}
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Toggle */}
          <button
            onClick={() => setAllLocations(!allLocations)}
            className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
              allLocations
                ? "border-primary/30 bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            }`}
          >
            {allLocations ? "All Locations" : "Current Location"}
          </button>

          {/* Direction */}
          <FilterSelect
            value={directionFilter}
            onChange={(v) => setDirectionFilter(v as "all" | "IN" | "OUT")}
            options={[
              { value: "all", label: "All Directions" },
              { value: "IN", label: "Additions" },
              { value: "OUT", label: "Deductions" },
            ]}
          />

          {/* Reason Code */}
          <FilterSelect
            value={reasonFilter}
            onChange={setReasonFilter}
            options={[
              { value: "all", label: "All Reasons" },
              ...ALL_REASON_CODES.map((code) => ({
                value: code,
                label: REASON_CODE_LABELS[code] ?? code,
              })),
            ]}
          />

          {/* Date From */}
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 [&::-webkit-calendar-picker-indicator]:opacity-50"
            title="From date"
          />

          {/* Date To */}
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 [&::-webkit-calendar-picker-indicator]:opacity-50"
            title="To date"
          />

          {/* Search */}
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search product, SKU..."
              className="h-8 w-56 rounded-md border border-border bg-background pl-8 pr-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20"
            />
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Adjustment History Table ── */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-destructive">Failed to load adjustments</p>
            <p className="text-xs text-muted-foreground">
              {(error as any)?.message ?? "Check API connection"}
            </p>
          </div>
        ) : entries.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} />
        ) : (
          <div className={`transition-opacity ${isFetchingNextPage ? "opacity-60" : ""}`}>
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Date / Time</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Product</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">SKU</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Location</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Direction</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Qty</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Reason</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Notes</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Actor</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium">Reference</th>
                <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-medium text-right">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <AdjustmentRow key={entry.id} entry={entry} />
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-border bg-background px-6 py-2.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {totalCount} adjustment{totalCount !== 1 ? "s" : ""} loaded
            {hasActiveFilters ? " (filtered)" : ""}
            {hasNextPage ? " — more available" : ""}
          </span>
          <div className="flex items-center gap-3">
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
              >
                {isFetchingNextPage ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ChevronsDown size={12} />
                )}
                Load More
              </button>
            )}
            <span className="flex items-center gap-1 rounded bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
              Live data — GET /inventory/journal
            </span>
          </div>
        </div>
      </div>

      {/* ── New Adjustment Drawer ── */}
      {drawerOpen && (
        <NewAdjustmentDrawer
          token={token}
          locationId={locationId}
          locations={locations}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * TABLE ROW COMPONENT
 * ═══════════════════════════════════════════════════════ */

function AdjustmentRow({ entry }: { entry: JournalEntry }) {
  const dateObj = new Date(entry.effectiveAt);
  const dateStr = dateObj.toLocaleDateString("en-PH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = dateObj.toLocaleTimeString("en-PH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const isDeduction = entry.changeQuantity < 0;
  const refShort = entry.referenceId.slice(0, 8);

  return (
    <tr className="group transition-colors hover:bg-muted/30">
      {/* Date / Time */}
      <td className="whitespace-nowrap px-4 py-2.5">
        <div className="text-sm text-foreground">{dateStr}</div>
        <div className="text-[11px] text-muted-foreground">{timeStr}</div>
      </td>

      {/* Product */}
      <td className="max-w-[200px] truncate px-4 py-2.5 text-sm text-foreground" title={entry.productName}>
        {entry.productName}
      </td>

      {/* SKU */}
      <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
        {entry.productSku}
      </td>

      {/* Location */}
      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
        {entry.locationName}
      </td>

      {/* Direction Badge */}
      <td className="whitespace-nowrap px-4 py-2.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            isDeduction
              ? "bg-destructive/10 text-destructive"
              : "bg-success/10 text-success"
          }`}
        >
          {isDeduction ? (
            <ArrowDownCircle size={11} />
          ) : (
            <ArrowUpCircle size={11} />
          )}
          {isDeduction ? "Remove" : "Add"}
        </span>
      </td>

      {/* Quantity */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
        <span
          className={`text-sm font-medium ${
            isDeduction ? "text-destructive" : "text-success"
          }`}
        >
          {isDeduction ? "−" : "+"}
          {Math.abs(entry.changeQuantity)}
        </span>
      </td>

      {/* Reason Badge */}
      <td className="whitespace-nowrap px-4 py-2.5">
        <span className="inline-flex rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {entry.reasonCode
            ? (REASON_CODE_LABELS[entry.reasonCode] ?? entry.reasonCode)
            : "—"}
        </span>
      </td>

      {/* Notes */}
      <td className="max-w-[180px] truncate px-4 py-2.5 text-xs text-muted-foreground" title={entry.notes ?? ""}>
        {entry.notes ?? "—"}
      </td>

      {/* Actor */}
      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-foreground">
        {entry.actorName ?? entry.actorType}
      </td>

      {/* Reference */}
      <td className="whitespace-nowrap px-4 py-2.5">
        <span
          className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground"
          title={entry.referenceId}
        >
          {refShort}…
          <ExternalLink size={10} className="opacity-0 transition-opacity group-hover:opacity-60" />
        </span>
      </td>

      {/* Balance After */}
      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-sm text-foreground">
        {entry.balanceAfter}
      </td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
 * FILTER SELECT COMPONENT
 * ═══════════════════════════════════════════════════════ */

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-md border border-border bg-background pl-2.5 pr-7 text-xs text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * EMPTY STATE
 * ═══════════════════════════════════════════════════════ */

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <ClipboardList size={24} className="text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">
          {hasFilters ? "No adjustments match your filters" : "No adjustments recorded"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {hasFilters
            ? "Try broadening your search criteria or clearing filters."
            : "Stock adjustments will appear here as they are recorded."}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
 * NEW ADJUSTMENT DRAWER
 * Product search uses GET /products/search (trigram fuzzy).
 * Location select uses locations from auth context.
 * The mutation calls POST /inventory/adjustments.
 * ═══════════════════════════════════════════════════════ */

function NewAdjustmentDrawer({
  token,
  locationId,
  locations,
  onClose,
}: {
  token: string;
  locationId: string;
  locations: LocationInfo[];
  onClose: () => void;
}) {
  // ── Form state ──
  const [selectedLocation, setSelectedLocation] = useState(locationId);
  const [productSearch, setProductSearch] = useState("");
  const [debouncedProductSearch, setDebouncedProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchResult | null>(null);
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [direction, setDirection] = useState<"IN" | "OUT" | "">("");
  const [quantity, setQuantity] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");

  // ── Debounce product search ──
  const productSearchTimeoutRef = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleProductSearch = (v: string) => {
    setProductSearch(v);
    if (productSearchTimeoutRef[0]) clearTimeout(productSearchTimeoutRef[0]);
    productSearchTimeoutRef[1](setTimeout(() => setDebouncedProductSearch(v), 300));
  };

  // ── Mutation hook — wired with real auth token ──
  const { submit, status, statusMessage, isSubmitting, reset } = useAdjustmentMutation(
    token,
    selectedLocation,
  );

  // ── Product search (real API via trigram fuzzy search) ──
  const productSearchQuery = useProductSearch(token, selectedLocation, debouncedProductSearch);
  const productResults = productSearchQuery.data?.data ?? [];

  // ── Reason codes based on direction ──
  const availableReasonCodes = useMemo(() => {
    if (direction === "IN")
      return [...POSITIVE_ONLY_REASON_CODES, AdjustmentReasonCode.DATA_CORRECTION];
    if (direction === "OUT")
      return [...NEGATIVE_ONLY_REASON_CODES, AdjustmentReasonCode.DATA_CORRECTION];
    return [];
  }, [direction]);

  // Reset reason when direction changes
  useEffect(() => {
    setReasonCode("");
  }, [direction]);

  // ── Validation ──
  const notesRequired =
    direction === "OUT" ||
    RESTRICTED_REASON_CODES.includes(reasonCode as AdjustmentReasonCode);

  const quantityNum = Number(quantity);
  const isValid =
    selectedProduct !== null &&
    direction !== "" &&
    quantityNum >= 1 &&
    reasonCode !== "" &&
    (!notesRequired || notes.trim().length > 0);

  // Over-stock warning for deductions
  const available = selectedProduct?.stockLevel ?? 0;
  const showOverstockWarning =
    direction === "OUT" && selectedProduct && quantityNum > available;

  // ── Submit handler ──
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!isValid || isSubmitting || !selectedProduct) return;
      submit({
        productId: selectedProduct.id,
        locationId: selectedLocation,
        quantity: quantityNum,
        direction: direction as "IN" | "OUT",
        reasonCode: reasonCode as AdjustmentReasonCode,
        notes: notes.trim() || undefined,
      });
    },
    [isValid, isSubmitting, selectedProduct, selectedLocation, quantityNum, direction, reasonCode, notes, submit],
  );

  // ── Auto-close on success ──
  useEffect(() => {
    if (status === "success" || status === "already_processed") {
      const timer = setTimeout(() => {
        reset();
        onClose();
      }, 1_500);
      return () => clearTimeout(timer);
    }
  }, [status, reset, onClose]);

  // ── Select product handler ──
  const selectProduct = (product: ProductSearchResult) => {
    setSelectedProduct(product);
    setProductSearch(product.name);
    setShowProductDropdown(false);
  };

  // ── Clear product ──
  const clearProduct = () => {
    setSelectedProduct(null);
    setProductSearch("");
    setDebouncedProductSearch("");
    setDirection("");
    setReasonCode("");
    setQuantity("");
    setNotes("");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-foreground/20 backdrop-blur-[2px]"
        onClick={isSubmitting ? undefined : onClose}
      />

      {/* Drawer Panel */}
      <div className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-md flex-col border-l border-border bg-background shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
              <Scale size={16} className="text-muted-foreground" />
            </div>
            <h2 className="text-sm font-semibold text-foreground">New Adjustment</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <X size={16} />
          </button>
        </div>

        {/* Drawer Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-y-auto">
          <div className="flex-1 space-y-5 px-5 py-5">
            {/* Location */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Location
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                disabled={isSubmitting}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Product Search */}
            <div className="relative">
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Product <span className="text-destructive">*</span>
              </label>
              {selectedProduct ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {selectedProduct.name}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      {selectedProduct.sku}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearProduct}
                    disabled={isSubmitting}
                    className="ml-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    />
                    <input
                      type="text"
                      value={productSearch}
                      onChange={(e) => {
                        handleProductSearch(e.target.value);
                        setShowProductDropdown(true);
                      }}
                      onFocus={() => setShowProductDropdown(true)}
                      placeholder="Search by name, SKU, or mnemonic..."
                      disabled={isSubmitting}
                      className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                    />
                  </div>
                  {showProductDropdown && productResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                      {productResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectProduct(p)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-muted/50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground">{p.name}</p>
                            <p className="text-[11px] font-mono text-muted-foreground">
                              {p.sku}
                            </p>
                          </div>
                          <span className="ml-2 shrink-0 text-xs text-muted-foreground">
                            {p.stockLevel} on hand
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showProductDropdown && debouncedProductSearch.trim().length >= 2 && productResults.length === 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-lg border border-border bg-background px-3 py-3 text-center shadow-lg">
                      {productSearchQuery.isLoading ? (
                        <Loader2 size={14} className="mx-auto animate-spin text-muted-foreground" />
                      ) : (
                        <p className="text-xs text-muted-foreground">No products found</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Stock Context Card */}
            {selectedProduct && (
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Package size={12} className="text-muted-foreground" />
                  <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Current Stock
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {selectedProduct.stockLevel}
                    </p>
                    <p className="text-xs text-muted-foreground">On Hand</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-foreground">
                      {selectedProduct.reorderPoint}
                    </p>
                    <p className="text-xs text-muted-foreground">Reorder Point</p>
                  </div>
                </div>
              </div>
            )}

            {/* Direction Toggle */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Adjustment Type <span className="text-destructive">*</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDirection("IN")}
                  disabled={isSubmitting}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    direction === "IN"
                      ? "border-success bg-success/10 text-success"
                      : "border-border text-foreground hover:bg-accent"
                  } disabled:opacity-50`}
                >
                  <ArrowUpCircle size={15} />
                  Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setDirection("OUT")}
                  disabled={isSubmitting}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    direction === "OUT"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-border text-foreground hover:bg-accent"
                  } disabled:opacity-50`}
                >
                  <ArrowDownCircle size={15} />
                  Remove Stock
                </button>
              </div>
            </div>

            {/* Quantity */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Quantity <span className="text-destructive">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter adjustment quantity"
                disabled={isSubmitting}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
              />
              {showOverstockWarning && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-warning">
                  <AlertTriangle size={11} />
                  Quantity exceeds available stock ({available} available)
                </p>
              )}
            </div>

            {/* Reason Code */}
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Reason <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <select
                  value={reasonCode}
                  onChange={(e) => setReasonCode(e.target.value)}
                  disabled={isSubmitting || direction === ""}
                  className="w-full appearance-none rounded-md border border-border bg-background px-3 py-2 pr-8 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
                >
                  <option value="">
                    {direction === "" ? "Select direction first..." : "Select reason..."}
                  </option>
                  {availableReasonCodes.map((code) => (
                    <option key={code} value={code}>
                      {REASON_CODE_LABELS[code] ?? code}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Notes{" "}
                  {notesRequired ? (
                    <span className="text-destructive">* required</span>
                  ) : (
                    <span className="text-muted-foreground/60">(optional)</span>
                  )}
                </label>
                <span className="text-[10px] tabular-nums text-muted-foreground/60">
                  {notes.length}/500
                </span>
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                placeholder={
                  notesRequired
                    ? "Describe the reason for this adjustment..."
                    : "Optional adjustment notes..."
                }
                rows={3}
                disabled={isSubmitting}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary/20 disabled:opacity-50"
              />
            </div>

            {/* Mutation Status Banner */}
            {statusMessage && (
              <MutationStatusBanner status={status} message={statusMessage} />
            )}
          </div>

          {/* Drawer Footer */}
          <div className="border-t border-border px-5 py-4">
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!isValid || isSubmitting}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  direction === "OUT"
                    ? "bg-destructive text-white hover:bg-destructive/90"
                    : "bg-foreground text-background hover:bg-foreground/90"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Spinner />
                    Processing...
                  </>
                ) : direction === "OUT" ? (
                  "Confirm Removal"
                ) : (
                  "Confirm Adjustment"
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 rounded-md border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
 * SHARED UI COMPONENTS
 * ═══════════════════════════════════════════════════════ */

function MutationStatusBanner({
  status,
  message,
}: {
  status: AdjustmentMutationStatus;
  message: string;
}) {
  const styles: Record<string, string> = {
    submitting: "bg-primary/5 border-primary/20 text-primary",
    success: "bg-success/10 border-success/20 text-success",
    already_processed: "bg-warning/10 border-warning/20 text-warning",
    contention_retry: "bg-warning/10 border-warning/20 text-warning",
    needs_reconcile: "bg-destructive/10 border-destructive/20 text-destructive",
    error: "bg-destructive/10 border-destructive/20 text-destructive",
  };
  const icons: Record<string, string> = {
    submitting: "⏳",
    success: "✓",
    already_processed: "↻",
    contention_retry: "⟳",
    needs_reconcile: "⚠",
    error: "✕",
  };
  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs font-medium ${
        styles[status] ?? ""
      }`}
    >
      <span className="shrink-0 text-sm">{icons[status] ?? ""}</span>
      <span>{message}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
