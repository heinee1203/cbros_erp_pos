"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import {
  Search,
  Printer,
  Trash2,
  Plus,
  Minus,
  X,
  Barcode,
  Package,
  Tag,
  DollarSign,
  FileText,
  ArrowLeft,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PODetail, POLine } from "@/hooks/use-po-query";
import JsBarcode from "jsbarcode";
import { cn } from "@/lib/utils";
import { useAuth } from "../../auth-context";
import { apiFetch } from "@/lib/api";
import type { ProductRow } from "@/hooks/use-products";
import { generateCostCode } from "@apex/types";

/* ─────────────────────────────────────────────
 * Label Templates
 * ───────────────────────────────────────────── */
interface LabelTemplate {
  id: string;
  name: string;
  icon: typeof Barcode;
  description: string;
  showName: boolean;
  showSku: boolean;
  showPrice: boolean;
  showEmployeeInfo: boolean;
  widthMm: number;
  heightMm: number;
}

const TEMPLATES: LabelTemplate[] = [
  {
    id: "barcode-only",
    name: "Barcode Only",
    icon: Barcode,
    description: "Barcode image with digits",
    showName: false,
    showSku: false,
    showPrice: false,
    showEmployeeInfo: false,
    widthMm: 50,
    heightMm: 25,
  },
  {
    id: "barcode-name",
    name: "Barcode + Name",
    icon: Tag,
    description: "Product name above barcode",
    showName: true,
    showSku: false,
    showPrice: false,
    showEmployeeInfo: false,
    widthMm: 50,
    heightMm: 30,
  },
  {
    id: "barcode-sku",
    name: "Barcode + SKU",
    icon: Package,
    description: "SKU code above barcode",
    showName: false,
    showSku: true,
    showPrice: false,
    showEmployeeInfo: false,
    widthMm: 50,
    heightMm: 30,
  },
  {
    id: "barcode-price",
    name: "Barcode + Price",
    icon: DollarSign,
    description: "Barcode with sell price below",
    showName: false,
    showSku: false,
    showPrice: true,
    showEmployeeInfo: false,
    widthMm: 50,
    heightMm: 30,
  },
  {
    id: "barcode-name-price",
    name: "Name + Barcode + Price",
    icon: FileText,
    description: "Full label: name, barcode, price",
    showName: true,
    showSku: false,
    showPrice: true,
    showEmployeeInfo: false,
    widthMm: 50,
    heightMm: 35,
  },
  {
    id: "employee-label",
    name: "Employee Label",
    icon: ShieldCheck,
    description: "Internal: cost code, supplier, date",
    showName: true,
    showSku: false,
    showPrice: false,
    showEmployeeInfo: true,
    widthMm: 50,
    heightMm: 40,
  },
];

/* ─────────────────────────────────────────────
 * Label Sizes
 * ───────────────────────────────────────────── */
interface LabelSize {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
}

const LABEL_SIZES: LabelSize[] = [
  { id: "50x30", label: "50 × 30 mm", widthMm: 50, heightMm: 30 },
  { id: "50x40", label: "50 × 40 mm", widthMm: 50, heightMm: 40 },
  { id: "100x70", label: "100 × 70 mm", widthMm: 100, heightMm: 70 },
];

/* ─────────────────────────────────────────────
 * Queue Item
 * ───────────────────────────────────────────── */
interface QueueItem {
  product: ProductRow;
  quantity: number;
  /** Employee-only fields — populated from PO data */
  supplierMnemonic?: string | null;
  mnemonicCostCode?: string | null;
  dateEncoded?: string; // YYYY-MM-DD
}

/* ─────────────────────────────────────────────
 * Main Page
 * ───────────────────────────────────────────── */
export default function BarcodePrintingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          Loading...
        </div>
      }
    >
      <BarcodePrintingContent />
    </Suspense>
  );
}

function BarcodePrintingContent() {
  const { token, locationId } = useAuth();

  // ── State ──
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [templateId, setTemplateId] = useState("barcode-name-price");
  const [labelSizeId, setLabelSizeId] = useState("50x30");
  const [printerType, setPrinterType] = useState<"sheet" | "label">("sheet");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // ── PO pre-population ──
  const searchParams = useSearchParams();
  const poNo = searchParams.get("poNo");
  const [poLoading, setPOLoading] = useState(false);
  const [poBanner, setPOBanner] = useState<string | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);

  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const labelSize = LABEL_SIZES.find((s) => s.id === labelSizeId) ?? LABEL_SIZES[0];
  const isLargeLabel = labelSize.widthMm >= 100;
  const totalLabels = queue.reduce((sum, item) => sum + item.quantity, 0);

  // ── Search (debounced 300ms) ──
  const doSearch = useCallback(
    async (q: string) => {
      if (!token || !locationId || q.length < 2) {
        setSearchResults([]);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsSearching(true);
      try {
        const res = await apiFetch<{ data: ProductRow[] }>(
          `/products/search?q=${encodeURIComponent(q)}`,
          { token, locationId, signal: controller.signal },
        );
        if (!controller.signal.aborted) {
          setSearchResults(res.data);
          setShowResults(true);
        }
      } catch {
        // Aborted or network error — ignore
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    },
    [token, locationId],
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => doSearch(value), 300);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Auto-populate queue from PO ──
  useEffect(() => {
    if (!poNo || !token || !locationId) return;
    let cancelled = false;
    setPOLoading(true);

    (async () => {
      try {
        const po = await apiFetch<PODetail>(
          `/procurement/purchase-orders/by-number/${encodeURIComponent(poNo)}`,
          { token, locationId },
        );
        if (cancelled) return;

        const today = new Date().toISOString().slice(0, 10);
        const items: QueueItem[] = po.lines
          .filter((line: POLine) => line.barcode)
          .map((line: POLine) => ({
            product: {
              id: line.productId,
              name: line.productName,
              sku: line.sku,
              mnemonicSku: line.mnemonicSku,
              category: line.category,
              unitPrice: line.unitPrice,
              costPrice: line.unitCost,
              barcode: line.barcode,
              stockLevel: 0,
              reorderPoint: 0,
              familyId: null,
              familyName: null,
            } as ProductRow,
            quantity: line.orderedQty,
            supplierMnemonic: po.supplier?.mnemonicCode ?? null,
            mnemonicCostCode: line.mnemonicCostCode || (() => {
              try { return generateCostCode(line.unitCost); } catch { return null; }
            })(),
            dateEncoded: today,
          }));

        setQueue(items);
        const skipped = po.lines.length - items.length;
        setPOBanner(
          skipped > 0
            ? `Loaded ${items.length} item${items.length !== 1 ? "s" : ""} from ${poNo} (${skipped} skipped — no barcode)`
            : `Loaded ${items.length} item${items.length !== 1 ? "s" : ""} from ${poNo}`,
        );
      } catch {
        setPOBanner(`Failed to load PO ${poNo}`);
      } finally {
        if (!cancelled) setPOLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [poNo, token, locationId]);

  // ── Queue operations ──
  const addToQueue = (product: ProductRow) => {
    setQueue((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }
      let costCode: string | null = null;
      try { costCode = generateCostCode(product.costPrice); } catch { /* ignore */ }
      return [...prev, {
        product,
        quantity: 1,
        mnemonicCostCode: costCode,
        dateEncoded: new Date().toISOString().slice(0, 10),
      }];
    });
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (qty < 1) return;
    if (qty > 999) return;
    setQueue((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: qty } : item,
      ),
    );
  };

  const removeFromQueue = (productId: string) => {
    setQueue((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearQueue = () => setQueue([]);

  // ── Print ──
  const handlePrint = () => {
    if (queue.length === 0) return;

    // Inject dynamic @page size for label printers
    if (printerType === "label") {
      const id = "__label-printer-page-style";
      let style = document.getElementById(id) as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement("style");
        style.id = id;
        document.head.appendChild(style);
      }
      style.textContent = `@page { size: ${labelSize.widthMm}mm ${labelSize.heightMm}mm; margin: 1mm; }`;
    } else {
      const existing = document.getElementById("__label-printer-page-style");
      if (existing) existing.remove();
    }

    window.print();
  };

  return (
    <>
      <div className="flex flex-1 flex-col print:hidden">
        {/* Page Header */}
        <div className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/inventory"
              className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                Barcode Printing
              </h1>
              <p className="text-[12px] text-muted-foreground">
                Search items, build a print queue, and print barcode labels
              </p>
            </div>
          </div>
          <button
            onClick={handlePrint}
            disabled={queue.length === 0}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Printer size={15} />
            Print {totalLabels > 0 ? `${totalLabels} Label${totalLabels !== 1 ? "s" : ""}` : "Labels"}
          </button>
        </div>

        {/* Two-column Layout */}
        <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
          {/* ── Left Panel: Search + Queue ── */}
          <div className="flex flex-1 flex-col border-b lg:border-b-0 lg:border-r border-border">
            {/* PO Loading / Banner */}
            {poLoading && (
              <div className="flex items-center justify-center border-b border-border bg-muted/30 px-5 py-3 gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                <span className="text-[13px] text-muted-foreground">
                  Loading items from {poNo}…
                </span>
              </div>
            )}
            {poBanner && !poLoading && (
              <div className="flex items-center justify-between border-b border-border bg-primary/5 px-5 py-2">
                <span className="text-[12px] text-primary font-medium">
                  {poBanner}
                </span>
                <button
                  onClick={() => setPOBanner(null)}
                  className="rounded p-0.5 text-primary/60 hover:text-primary transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* Search */}
            <div className="border-b border-border px-5 py-3" ref={searchRef}>
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  placeholder="Search by name, SKU, or barcode…"
                  className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
                  </div>
                )}

                {/* Search Results Dropdown */}
                {showResults && searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-[320px] overflow-y-auto rounded-lg border border-border bg-background shadow-xl">
                    {searchResults.map((product) => {
                      const inQueue = queue.some((q) => q.product.id === product.id);
                      return (
                        <button
                          key={product.id}
                          onClick={() => addToQueue(product)}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-[13px] font-medium text-foreground">
                              {product.name}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="font-mono">{product.sku}</span>
                              {product.barcode && (
                                <>
                                  <span className="text-border">·</span>
                                  <span className="font-mono">{product.barcode}</span>
                                </>
                              )}
                              <span className="text-border">·</span>
                              <span>{product.stockLevel} in stock</span>
                            </div>
                          </div>
                          {inQueue ? (
                            <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              In Queue
                            </span>
                          ) : (
                            <Plus size={14} className="shrink-0 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {showResults && searchResults.length === 0 && searchQuery.length >= 2 && !isSearching && (
                  <div className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-border bg-background p-4 text-center shadow-xl">
                    <p className="text-[13px] text-muted-foreground">
                      No products found
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Queue Table */}
            <div className="flex-1 overflow-y-auto">
              {queue.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="mb-3 rounded-xl bg-muted p-4">
                    <Barcode size={28} className="text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Print queue is empty
                  </p>
                  <p className="mt-1 max-w-[260px] text-[12px] text-muted-foreground/70">
                    Search for products above and click to add them to the print queue
                  </p>
                </div>
              ) : (
                <div>
                  {/* Queue Header */}
                  <div className="flex items-center justify-between border-b border-border bg-muted/30 px-5 py-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Print Queue · {queue.length} item{queue.length !== 1 ? "s" : ""} · {totalLabels} label{totalLabels !== 1 ? "s" : ""}
                    </span>
                    <button
                      onClick={clearQueue}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-destructive/70 transition-colors hover:bg-destructive/5 hover:text-destructive"
                    >
                      <Trash2 size={12} />
                      Clear All
                    </button>
                  </div>

                  {/* Queue Items */}
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-border bg-muted/20">
                        <th scope="col" className="px-5 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          #
                        </th>
                        <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Product
                        </th>
                        <th scope="col" className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Barcode
                        </th>
                        <th scope="col" className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Qty
                        </th>
                        <th scope="col" className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {queue.map((item, idx) => (
                        <tr
                          key={item.product.id}
                          className="border-b border-border last:border-0 hover:bg-accent/30 transition-colors"
                        >
                          <td className="px-5 py-2 text-muted-foreground tabular-nums">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium text-foreground truncate max-w-[240px]">
                              {item.product.name}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-mono">
                              {item.product.sku}
                            </p>
                          </td>
                          <td className="px-3 py-2 font-mono text-muted-foreground">
                            {item.product.barcode ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() =>
                                  updateQuantity(
                                    item.product.id,
                                    item.quantity - 1,
                                  )
                                }
                                disabled={item.quantity <= 1}
                                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                              >
                                <Minus size={13} />
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={999}
                                value={item.quantity}
                                onChange={(e) =>
                                  updateQuantity(
                                    item.product.id,
                                    parseInt(e.target.value, 10) || 1,
                                  )
                                }
                                className="h-7 w-12 rounded border border-border bg-background text-center text-[12px] font-medium tabular-nums outline-none focus:border-primary/40"
                              />
                              <button
                                onClick={() =>
                                  updateQuantity(
                                    item.product.id,
                                    item.quantity + 1,
                                  )
                                }
                                disabled={item.quantity >= 999}
                                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
                              >
                                <Plus size={13} />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => removeFromQueue(item.product.id)}
                              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            >
                              <X size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── Right Panel: Templates + Preview ── */}
          <div className="flex w-full lg:w-[380px] shrink-0 flex-col bg-muted/20">
            {/* Template Selector */}
            <div className="border-b border-border px-5 py-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Label Template
              </h3>
              <div className="space-y-1">
                {TEMPLATES.map((t) => {
                  const Icon = t.icon;
                  const isActive = t.id === templateId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTemplateId(t.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all",
                        isActive
                          ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                          : "text-foreground hover:bg-accent/60",
                      )}
                    >
                      <Icon
                        size={14}
                        className={cn(
                          "shrink-0",
                          isActive
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium truncate">
                          {t.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {t.description}
                        </p>
                      </div>
                      {isActive && (
                        <div className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Label Size Selector */}
            <div className="border-b border-border px-5 py-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Label Size
              </h3>
              <div className="flex gap-1.5">
                {LABEL_SIZES.map((s) => {
                  const isActive = s.id === labelSizeId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setLabelSizeId(s.id)}
                      className={cn(
                        "flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-medium transition-all",
                        isActive
                          ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Printer Type */}
            <div className="border-b border-border px-5 py-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Printer Type
              </h3>
              <div className="flex gap-1.5">
                {([
                  { id: "sheet" as const, label: "Sheet Printer" },
                  { id: "label" as const, label: "Label Printer" },
                ]).map((p) => {
                  const isActive = p.id === printerType;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPrinterType(p.id)}
                      className={cn(
                        "flex-1 rounded-lg px-2 py-1.5 text-center text-[11px] font-medium transition-all",
                        isActive
                          ? "bg-primary/10 text-primary ring-1 ring-primary/20"
                          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              {printerType === "label" && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  One label per page — for Zebra ZD230 and similar thermal printers
                </p>
              )}
            </div>

            {/* Live Preview */}
            <div className="flex-1 px-5 py-4">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Preview
              </h3>
              <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-white p-6 shadow-sm">
                {queue.length > 0 && queue[0].product.barcode ? (
                  <LabelPreview
                    product={queue[0].product}
                    template={template}
                    isLargeLabel={isLargeLabel}
                    supplierMnemonic={queue[0].supplierMnemonic}
                    mnemonicCostCode={queue[0].mnemonicCostCode}
                    dateEncoded={queue[0].dateEncoded}
                  />
                ) : (
                  <div className="text-center py-8">
                    <Barcode
                      size={32}
                      className="mx-auto mb-2 text-muted-foreground/30"
                    />
                    <p className="text-[12px] text-muted-foreground">
                      {queue.length === 0
                        ? "Add items to see preview"
                        : "No barcode assigned"}
                    </p>
                  </div>
                )}
              </div>
              {queue.length > 0 && queue[0].product.barcode && (
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  Previewing: {queue[0].product.name}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Print Area (hidden on screen, visible only when printing) ── */}
      <div id="print-area" className="hidden print:block">
        {printerType === "label" ? (
          /* Label Printer mode: one label per page (for Zebra ZD230, etc.) */
          <div>
            {queue.flatMap((item) =>
              Array.from({ length: item.quantity }, (_, i) => (
                <div
                  key={`${item.product.id}-${i}`}
                  className="flex items-center justify-center"
                  style={{
                    width: `${labelSize.widthMm}mm`,
                    height: `${labelSize.heightMm}mm`,
                    pageBreakAfter: "always",
                    overflow: "hidden",
                  }}
                >
                  {item.product.barcode ? (
                    <PrintLabel
                      product={item.product}
                      template={template}
                      isLargeLabel={isLargeLabel}
                      supplierMnemonic={item.supplierMnemonic}
                      mnemonicCostCode={item.mnemonicCostCode}
                      dateEncoded={item.dateEncoded}
                    />
                  ) : (
                    <span className="text-[8px] text-gray-400">No barcode</span>
                  )}
                </div>
              )),
            )}
          </div>
        ) : (
          /* Sheet Printer mode: grid layout on regular paper */
          <div
            className="grid gap-0"
            style={{
              gridTemplateColumns: `repeat(${isLargeLabel ? 2 : 3}, 1fr)`,
            }}
          >
            {queue.flatMap((item) =>
              Array.from({ length: item.quantity }, (_, i) => (
                <div
                  key={`${item.product.id}-${i}`}
                  className="flex items-center justify-center border border-gray-200 p-2"
                  style={{
                    width: `${labelSize.widthMm}mm`,
                    height: `${labelSize.heightMm}mm`,
                    pageBreakInside: "avoid",
                  }}
                >
                  {item.product.barcode ? (
                    <PrintLabel
                      product={item.product}
                      template={template}
                      isLargeLabel={isLargeLabel}
                      supplierMnemonic={item.supplierMnemonic}
                      mnemonicCostCode={item.mnemonicCostCode}
                      dateEncoded={item.dateEncoded}
                    />
                  ) : (
                    <span className="text-[8px] text-gray-400">No barcode</span>
                  )}
                </div>
              )),
            )}
          </div>
        )}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────
 * Label Preview (on-screen)
 * ───────────────────────────────────────────── */
function LabelPreview({
  product,
  template,
  isLargeLabel,
  supplierMnemonic,
  mnemonicCostCode,
  dateEncoded,
}: {
  product: ProductRow;
  template: LabelTemplate;
  isLargeLabel: boolean;
  supplierMnemonic?: string | null;
  mnemonicCostCode?: string | null;
  dateEncoded?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && product.barcode) {
      try {
        JsBarcode(svgRef.current, product.barcode, {
          format: "EAN13",
          width: isLargeLabel ? 2.2 : 1.5,
          height: isLargeLabel ? 55 : template.showEmployeeInfo ? 32 : 40,
          displayValue: true,
          fontSize: isLargeLabel ? 14 : 11,
          margin: 0,
          textMargin: 2,
          font: "monospace",
        });
      } catch {
        // Invalid barcode format — render nothing
      }
    }
  }, [product.barcode, template.showEmployeeInfo, isLargeLabel]);

  const price = parseFloat(product.unitPrice) || 0;
  const displayDate = dateEncoded || new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col items-center gap-1">
      {template.showName && (
        <p className={cn(
          "truncate text-center font-semibold text-gray-900 leading-tight",
          isLargeLabel ? "max-w-[280px] text-[14px]" : "max-w-[160px] text-[11px]",
        )}>
          {product.name}
        </p>
      )}
      {template.showSku && (
        <p className={cn("font-mono text-gray-600", isLargeLabel ? "text-[13px]" : "text-[10px]")}>{product.sku}</p>
      )}
      <svg ref={svgRef} />
      {template.showPrice && price > 0 && (
        <p className={cn("font-bold text-gray-900", isLargeLabel ? "text-[16px]" : "text-[12px]")}>
          ₱{price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      )}
      {template.showEmployeeInfo && (
        <div className="mt-0.5 flex flex-col items-center gap-0.5">
          <p className={cn("font-mono font-bold tracking-wide text-gray-700", isLargeLabel ? "text-[13px]" : "text-[10px]")} title="Mnemonic Code (Cost + Supplier)">
            {(mnemonicCostCode || "") + (supplierMnemonic || "") || "————"}
          </p>
          <p className={cn("text-gray-400 font-mono", isLargeLabel ? "text-[11px]" : "text-[9px]")} title="Date Encoded">
            {displayDate}
          </p>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * Print Label (in print area)
 * ───────────────────────────────────────────── */
function PrintLabel({
  product,
  template,
  isLargeLabel,
  supplierMnemonic,
  mnemonicCostCode,
  dateEncoded,
}: {
  product: ProductRow;
  template: LabelTemplate;
  isLargeLabel: boolean;
  supplierMnemonic?: string | null;
  mnemonicCostCode?: string | null;
  dateEncoded?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && product.barcode) {
      try {
        JsBarcode(svgRef.current, product.barcode, {
          format: "EAN13",
          width: isLargeLabel ? 2 : 1.2,
          height: isLargeLabel ? 45 : template.showEmployeeInfo ? 22 : 30,
          displayValue: true,
          fontSize: isLargeLabel ? 13 : 9,
          margin: 0,
          textMargin: 1,
          font: "monospace",
        });
      } catch {
        // Invalid barcode
      }
    }
  }, [product.barcode, template.showEmployeeInfo, isLargeLabel]);

  const price = parseFloat(product.unitPrice) || 0;
  const displayDate = dateEncoded || new Date().toISOString().slice(0, 10);

  return (
    <div className={cn("flex flex-col items-center text-black", isLargeLabel ? "gap-1" : "gap-0.5")}>
      {template.showName && (
        <p className={cn(
          "max-w-full truncate text-center font-semibold leading-tight",
          isLargeLabel ? "text-[14px]" : "text-[8px]",
        )}>
          {product.name}
        </p>
      )}
      {template.showSku && (
        <p className={cn("font-mono", isLargeLabel ? "text-[11px]" : "text-[7px]")}>{product.sku}</p>
      )}
      <svg ref={svgRef} />
      {template.showPrice && price > 0 && (
        <p className={cn("font-bold", isLargeLabel ? "text-[14px]" : "text-[9px]")}>
          ₱{price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      )}
      {template.showEmployeeInfo && (
        <div className="flex flex-col items-center">
          <p className={cn("font-mono font-bold tracking-wide", isLargeLabel ? "text-[12px]" : "text-[7px]")}>
            {(mnemonicCostCode || "") + (supplierMnemonic || "") || "————"}
          </p>
          <p className={cn("text-gray-500 font-mono", isLargeLabel ? "text-[10px]" : "text-[6px]")}>
            {displayDate}
          </p>
        </div>
      )}
    </div>
  );
}
