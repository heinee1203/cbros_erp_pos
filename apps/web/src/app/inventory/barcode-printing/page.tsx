"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import {
  ArrowLeft,
  Barcode,
  BoxSelect,
  Copy,
  FileCode2,
  Layers,
  Minus,
  Plus,
  Printer,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PODetail, POLine } from "@/hooks/use-po-query";
import type { ProductRow } from "@/hooks/use-products";
import { apiFetch } from "@/lib/api";
import { getProductDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { openZplPreview, sendZplPrintJob } from "@/lib/zpl-print";
import { useAuth } from "../../auth-context";
import {
  buildShelfLabel,
  buildShelfLabelPreviewModel,
  encodeCostMnemonic,
  SHELF_LABEL_PRESETS,
  type ShelfLabelData,
  type ShelfLabelPreviewModel,
  type ShelfLabelPreviewObject,
  type ShelfLabelSizeId,
  type ZplLabelConfig,
} from "@apex/types";

type PrintStatus = "idle" | "sending" | "ok" | "fail";

interface QueueItem {
  product: ProductRow;
  quantity: number;
  supplierCode: string;
}

const SAMPLE_LABEL_DATA: ShelfLabelData = {
  itemName: "ITEM NAME 1 ITEM NAME 2 ITEM NAME 3",
  detailText: "VARIANT NAME",
  sku: "SKU-001",
  barcodeData: "9793108995149",
  costPrice: 36,
  supplierCode: "PR",
  quantity: 1,
};

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
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const poNo = searchParams.get("poNo");

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [activeObjectId, setActiveObjectId] = useState<ShelfLabelPreviewObject["id"]>("barcode");
  const [selectedSize, setSelectedSize] = useState<ShelfLabelSizeId>("50x30");
  const [defaultSupplierCode, setDefaultSupplierCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [printStatus, setPrintStatus] = useState<PrintStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [poLoading, setPOLoading] = useState(false);
  const [poBanner, setPOBanner] = useState<string | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const selectedPreset = SHELF_LABEL_PRESETS.find((size) => size.id === selectedSize) ?? SHELF_LABEL_PRESETS[0];
  const labelConfig = selectedPreset.config;
  const totalLabels = queue.reduce((sum, item) => sum + item.quantity, 0);
  const activeItem = useMemo(
    () => queue.find((item) => item.product.id === activeProductId) ?? queue[0] ?? null,
    [activeProductId, queue],
  );
  const activeLabelData = useMemo(
    () => (activeItem ? buildLabelData(activeItem, 1) : SAMPLE_LABEL_DATA),
    [activeItem],
  );
  const activePreviewModel = useMemo(
    () => buildShelfLabelPreviewModel(activeLabelData, labelConfig),
    [activeLabelData, labelConfig],
  );
  const activeZpl = useMemo(
    () => buildShelfLabel(activeLabelData, { ...labelConfig, quantity: 1 }),
    [activeLabelData, labelConfig],
  );

  const doSearch = useCallback(
    async (query: string) => {
      if (!token || !locationId || query.length < 2) {
        setSearchResults([]);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);

      try {
        const res = await apiFetch<{ data: ProductRow[] }>(
          `/products/search?q=${encodeURIComponent(query)}`,
          { token, locationId, signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          setSearchResults(res.data);
          setShowResults(true);
        }
      } catch {
        // Search is debounce-driven; aborted requests are expected.
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    },
    [locationId, token],
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (value.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    searchTimerRef.current = setTimeout(() => doSearch(value), 250);
  };

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

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

        const supplierAbbr = po.supplier?.mnemonicCode?.slice(0, 2)?.toUpperCase() ?? "";
        const items: QueueItem[] = po.lines
          .filter((line: POLine) => line.barcode)
          .map((line: POLine) => ({
            product: poLineToProductRow(line),
            quantity: line.orderedQty,
            supplierCode: supplierAbbr,
          }));
        const skipped = po.lines.length - items.length;

        setDefaultSupplierCode(supplierAbbr);
        setQueue(items);
        setActiveProductId(items[0]?.product.id ?? null);
        setPOBanner(
          skipped > 0
            ? `Loaded ${items.length} item${items.length !== 1 ? "s" : ""} from ${poNo} (${skipped} skipped)`
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
  }, [locationId, poNo, token]);

  const addToQueue = (product: ProductRow) => {
    setQueue((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(999, item.quantity + 1) }
            : item,
        );
      }

      return [
        ...prev,
        {
          product,
          quantity: 1,
          supplierCode: defaultSupplierCode || deriveSupplierCode(product.brandName),
        },
      ];
    });
    setActiveProductId(product.id);
    setSearchQuery("");
    setSearchResults([]);
    setShowResults(false);
  };

  const updateQuantity = (productId: string, qty: number) => {
    if (!Number.isFinite(qty) || qty < 1 || qty > 999) return;
    setQueue((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity: Math.floor(qty) } : item,
      ),
    );
  };

  const updateSupplierCode = (productId: string, code: string) => {
    setQueue((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, supplierCode: code.toUpperCase().slice(0, 4) }
          : item,
      ),
    );
  };

  const removeFromQueue = (productId: string) => {
    setQueue((prev) => prev.filter((item) => item.product.id !== productId));
    setActiveProductId((current) => (current === productId ? null : current));
  };

  const clearQueue = () => {
    setQueue([]);
    setActiveProductId(null);
  };

  const handlePrint = async () => {
    if (queue.length === 0 || !token || !locationId) return;

    setPrintStatus("sending");
    setStatusMsg(`Sending ${totalLabels} label${totalLabels !== 1 ? "s" : ""}...`);

    try {
      const fullZpl = buildPrintJob(queue, labelConfig);
      const result = await sendZplPrintJob({ token, locationId, zpl: fullZpl });

      if (!result.printed) {
        openZplPreview(fullZpl);
        setStatusMsg("No Zebra printer was reachable. Raw ZPL opened in a new tab.");
      } else {
        setStatusMsg(
          `Sent ${totalLabels} label${totalLabels !== 1 ? "s" : ""}${
            result.printerName ? ` to ${result.printerName}` : ""
          }.`,
        );
      }

      setPrintStatus("ok");
    } catch (error) {
      setPrintStatus("fail");
      setStatusMsg(error instanceof Error ? error.message : "Print failed");
    }

    setTimeout(() => {
      setPrintStatus("idle");
      setStatusMsg("");
    }, 4500);
  };

  const handleCopyZpl = async () => {
    try {
      await navigator.clipboard.writeText(activeZpl);
      setStatusMsg("ZPL copied.");
      setTimeout(() => setStatusMsg(""), 2000);
    } catch {
      setStatusMsg("Clipboard is not available.");
      setTimeout(() => setStatusMsg(""), 2500);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/inventory"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-foreground">Barcode Label Designer</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{selectedPreset.label}</span>
              <span className="text-border">/</span>
              <span>ZPL</span>
              <span className="text-border">/</span>
              <span>{totalLabels} queued</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openZplPreview(buildPrintJob(queue.length ? queue : [sampleQueueItem()], labelConfig))}
            className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <FileCode2 className="h-4 w-4" />
            ZPL
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={queue.length === 0 || printStatus === "sending"}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50",
              printStatus === "ok"
                ? "bg-green-600 text-white"
                : printStatus === "fail"
                  ? "bg-red-600 text-white"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <Printer className="h-4 w-4" />
            {printStatus === "sending"
              ? "Sending..."
              : printStatus === "ok"
                ? "Sent"
                : printStatus === "fail"
                  ? "Failed"
                  : `Print ${totalLabels} Label${totalLabels !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={cn(
            "mx-6 mt-4 rounded-lg border px-4 py-2 text-sm font-medium",
            printStatus === "ok"
              ? "border-green-200 bg-green-50 text-green-700"
              : printStatus === "fail"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-blue-200 bg-blue-50 text-blue-700",
          )}
        >
          {statusMsg}
        </div>
      )}

      {poBanner && (
        <div className="mx-6 mt-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          <span>{poLoading ? "Loading PO..." : poBanner}</span>
          <button
            type="button"
            onClick={() => setPOBanner(null)}
            className="ml-3 text-blue-500 hover:text-blue-700"
            title="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-6 xl:grid-cols-[340px_minmax(0,1fr)_340px]">
        <aside className="flex min-h-0 flex-col rounded-lg border border-border bg-background">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Search className="h-4 w-4" />
              Products
            </div>
          </div>

          <div className="space-y-3 p-4">
            <div ref={searchRef} className="relative" style={{ zIndex: 50 }}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Name, SKU, or barcode"
                  value={searchQuery}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowResults(true)}
                  className="w-full rounded-lg border border-border bg-background py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                )}
              </div>

              {showResults && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 max-h-80 overflow-auto rounded-lg border border-border bg-background shadow-xl">
                  {searchResults.map((product) => {
                    const inQueue = queue.some((item) => item.product.id === product.id);
                    return (
                      <button
                        type="button"
                        key={product.id}
                        onClick={() => addToQueue(product)}
                        className="flex w-full items-center gap-3 border-b border-border/50 px-3 py-2 text-left transition-colors last:border-0 hover:bg-accent"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <Barcode className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {getProductDisplayName(product)}
                          </span>
                          <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="truncate font-mono">{product.sku}</span>
                            {product.barcode && <span className="truncate font-mono">{product.barcode}</span>}
                          </span>
                        </span>
                        {inQueue && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                            Added
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1.5 rounded-lg border border-border bg-muted/30 p-1.5">
              {SHELF_LABEL_PRESETS.map((size) => (
                <button
                  type="button"
                  key={size.id}
                  onClick={() => setSelectedSize(size.id)}
                  className={cn(
                    "rounded-md px-2 py-2 text-xs font-semibold transition-colors",
                    selectedSize === size.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  {size.label}
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">
                Supplier
              </span>
              <input
                type="text"
                value={defaultSupplierCode}
                onChange={(event) => setDefaultSupplierCode(event.target.value.toUpperCase().slice(0, 4))}
                maxLength={4}
                placeholder="AZ"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono uppercase text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
          </div>

          <div className="flex items-center justify-between border-y border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Layers className="h-4 w-4" />
              Queue
            </div>
            {queue.length > 0 && (
              <button
                type="button"
                onClick={clearQueue}
                className="flex items-center gap-1 text-xs font-medium text-red-500 transition-colors hover:text-red-700"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-3">
            {queue.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
                No queued labels
              </div>
            ) : (
              <div className="space-y-2">
                {queue.map((item, index) => (
                  <QueueRow
                    key={item.product.id}
                    index={index}
                    item={item}
                    active={activeItem?.product.id === item.product.id}
                    onActivate={() => setActiveProductId(item.product.id)}
                    onQuantityChange={(quantity) => updateQuantity(item.product.id, quantity)}
                    onSupplierChange={(code) => updateSupplierCode(item.product.id, code)}
                    onRemove={() => removeFromQueue(item.product.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 rounded-lg border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <BoxSelect className="h-4 w-4" />
              Designer
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              {activePreviewModel.widthMm} x {activePreviewModel.heightMm}mm / {activePreviewModel.dpmm}dpmm
            </div>
          </div>

          <DesignerWorkspace
            activeObjectId={activeObjectId}
            model={activePreviewModel}
            onObjectSelect={setActiveObjectId}
          />
        </main>

        <aside className="flex min-h-0 flex-col rounded-lg border border-border bg-background">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
            <Settings2 className="h-4 w-4" />
            Inspector
          </div>

          <div className="space-y-4 p-4">
            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Active Item
              </div>
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="truncate text-sm font-semibold text-foreground">
                  {activeItem ? getProductDisplayName(activeItem.product) : "Sample label"}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{activeItem?.product.sku ?? SAMPLE_LABEL_DATA.sku}</span>
                  <span className="font-mono">{activeItem?.product.barcode ?? SAMPLE_LABEL_DATA.barcodeData}</span>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                Objects
              </div>
              <div className="space-y-2">
                {activePreviewModel.objects.map((object) => (
                  <button
                    type="button"
                    key={object.id}
                    onClick={() => setActiveObjectId(object.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
                      activeObjectId === object.id
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border bg-background text-foreground hover:bg-accent",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {object.kind === "barcode" ? (
                        <Barcode className="h-4 w-4" />
                      ) : (
                        <BoxSelect className="h-4 w-4" />
                      )}
                      {object.label}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {Math.round(object.xMm)},{Math.round(object.yMm)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 border-t border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase text-muted-foreground">ZPL</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleCopyZpl}
                  className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Copy ZPL"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openZplPreview(activeZpl)}
                  className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="Open ZPL"
                >
                  <FileCode2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <textarea
              readOnly
              value={activeZpl}
              className="h-full min-h-72 w-full resize-none rounded-lg border border-border bg-zinc-950 p-3 font-mono text-xs leading-5 text-zinc-100 focus:outline-none"
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

function QueueRow({
  active,
  index,
  item,
  onActivate,
  onQuantityChange,
  onRemove,
  onSupplierChange,
}: {
  active: boolean;
  index: number;
  item: QueueItem;
  onActivate: () => void;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  onSupplierChange: (code: string) => void;
}) {
  const costPreview = costCodePreview(parseNumeric(item.product.costPrice), item.supplierCode);

  return (
    <button
      type="button"
      onClick={onActivate}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        active ? "border-primary bg-primary/[0.04]" : "border-border bg-background hover:bg-accent/60",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-xs font-bold text-muted-foreground">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">
            {getProductDisplayName(item.product)}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate font-mono">{item.product.sku}</span>
            {item.product.barcode && <span className="truncate font-mono">{item.product.barcode}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
          title="Remove"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid grid-cols-[1fr_92px] gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onQuantityChange(item.quantity - 1);
            }}
            disabled={item.quantity <= 1}
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="Decrease"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <input
            type="number"
            min={1}
            max={999}
            value={item.quantity}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onQuantityChange(parseInt(event.target.value, 10) || 1)}
            className="h-8 w-14 rounded-md border border-border bg-background px-2 text-center font-mono text-xs focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onQuantityChange(item.quantity + 1);
            }}
            disabled={item.quantity >= 999}
            className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="Increase"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {costPreview && (
            <span className="ml-auto truncate font-mono text-[11px] font-semibold text-primary">
              {costPreview}
            </span>
          )}
        </div>

        <input
          type="text"
          value={item.supplierCode}
          maxLength={4}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => onSupplierChange(event.target.value)}
          className="h-8 rounded-md border border-border bg-background px-2 text-center font-mono text-xs uppercase focus:border-primary focus:outline-none"
        />
      </div>
    </button>
  );
}

function DesignerWorkspace({
  activeObjectId,
  model,
  onObjectSelect,
}: {
  activeObjectId: ShelfLabelPreviewObject["id"];
  model: ShelfLabelPreviewModel;
  onObjectSelect: (objectId: ShelfLabelPreviewObject["id"]) => void;
}) {
  const canvasWidth = model.sizeId === "100x70" ? 760 : 560;

  return (
    <div className="grid h-[calc(100vh-210px)] min-h-[520px] grid-cols-[34px_1fr] grid-rows-[30px_1fr] overflow-hidden bg-zinc-200">
      <div className="border-b border-r border-zinc-300 bg-zinc-100" />
      <HorizontalRuler widthMm={model.widthMm} />
      <VerticalRuler heightMm={model.heightMm} />
      <div className="overflow-auto bg-[linear-gradient(45deg,#d9d9dc_25%,transparent_25%),linear-gradient(-45deg,#d9d9dc_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#d9d9dc_75%),linear-gradient(-45deg,transparent_75%,#d9d9dc_75%)] bg-[length:28px_28px] bg-[position:0_0,0_14px,14px_-14px,-14px_0]">
        <div className="flex min-h-full items-center justify-center p-8">
          <div
            className="relative max-w-full"
            style={{ width: canvasWidth, aspectRatio: `${model.widthMm}/${model.heightMm}` }}
          >
            <div
              className="relative h-full w-full overflow-hidden rounded-md border border-zinc-800 bg-white shadow-[0_16px_40px_rgba(0,0,0,0.28)]"
              style={{
                containerType: "inline-size",
                backgroundImage:
                  "linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)",
                backgroundSize: `${100 / model.widthMm}% ${100 / model.heightMm}%`,
              }}
            >
              {model.objects.map((object) => (
                <PreviewObject
                  key={object.id}
                  active={object.id === activeObjectId}
                  model={model}
                  object={object}
                  onSelect={() => onObjectSelect(object.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HorizontalRuler({ widthMm }: { widthMm: number }) {
  const marks = buildRulerMarks(widthMm);

  return (
    <div className="relative border-b border-zinc-300 bg-zinc-100 text-[10px] text-zinc-600">
      {marks.map((mark) => (
        <span
          key={mark}
          className="absolute top-0 h-full border-l border-zinc-500 pl-1"
          style={{ left: `${(mark / widthMm) * 100}%` }}
        >
          {mark}
        </span>
      ))}
    </div>
  );
}

function VerticalRuler({ heightMm }: { heightMm: number }) {
  const marks = buildRulerMarks(heightMm);

  return (
    <div className="relative border-r border-zinc-300 bg-zinc-100 text-[10px] text-zinc-600">
      {marks.map((mark) => (
        <span
          key={mark}
          className="absolute left-0 w-full border-t border-zinc-500 pt-1 text-center"
          style={{ top: `${(mark / heightMm) * 100}%`, writingMode: "vertical-rl" }}
        >
          {mark}
        </span>
      ))}
    </div>
  );
}

function PreviewObject({
  active,
  model,
  object,
  onSelect,
}: {
  active: boolean;
  model: ShelfLabelPreviewModel;
  object: ShelfLabelPreviewObject;
  onSelect: () => void;
}) {
  const baseStyle = {
    left: `${(object.xMm / model.widthMm) * 100}%`,
    top: `${(object.yMm / model.heightMm) * 100}%`,
    width: `${(object.widthMm / model.widthMm) * 100}%`,
    height: `${(object.heightMm / model.heightMm) * 100}%`,
  };

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group absolute text-left outline-none",
        active && "ring-2 ring-purple-500 ring-offset-0",
      )}
      style={baseStyle}
      title={object.label}
    >
      <span
        className={cn(
          "absolute -left-1 -top-1 z-10 h-2 w-2 border border-purple-700 bg-white",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />
      <span
        className={cn(
          "absolute -right-1 -top-1 z-10 h-2 w-2 border border-purple-700 bg-white",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />
      <span
        className={cn(
          "absolute -bottom-1 -left-1 z-10 h-2 w-2 border border-purple-700 bg-white",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />
      <span
        className={cn(
          "absolute -bottom-1 -right-1 z-10 h-2 w-2 border border-purple-700 bg-white",
          active ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />

      {object.kind === "barcode" ? (
        <BarcodePreview object={object} />
      ) : (
        <span
          className={cn(
            "block h-full w-full overflow-hidden leading-none text-black",
            object.weight === "bold" && "font-black",
          )}
          style={{
            display: "-webkit-box",
            fontSize: `${(object.fontHeight / model.dpmm / model.widthMm) * 100}cqw`,
            textAlign: alignToCss(object.alignment),
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: object.maxLines ?? 1,
          }}
        >
          {object.text}
        </span>
      )}
    </button>
  );
}

function BarcodePreview({
  object,
}: {
  object: Extract<ShelfLabelPreviewObject, { kind: "barcode" }>;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !object.data) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const baseOptions = {
      displayValue: object.showText,
      font: "Arial",
      fontOptions: "bold",
      fontSize: 16,
      height: object.heightDots,
      margin: 0,
      textMargin: 2,
      width: object.moduleWidth,
    };

    try {
      JsBarcode(svg, object.data, {
        ...baseOptions,
        format: toJsBarcodeFormat(object.format),
      });
    } catch {
      try {
        JsBarcode(svg, object.data, { ...baseOptions, format: "CODE128" });
      } catch {
        // Leave an empty SVG if the barcode library cannot encode the value.
      }
    }
  }, [object.data, object.format, object.heightDots, object.moduleWidth, object.showText]);

  return <svg ref={svgRef} className="h-full w-full overflow-visible" preserveAspectRatio="xMidYMid meet" />;
}

function buildPrintJob(queue: QueueItem[], config: ZplLabelConfig): string {
  return queue.map((item) => buildShelfLabel(buildLabelData(item), config)).join("\n");
}

function buildLabelData(item: QueueItem, quantity = item.quantity): ShelfLabelData {
  const product = item.product;
  const detailText = [product.brandName, product.sku || product.mnemonicSku].filter(Boolean).join(" / ");

  return {
    itemName: getProductDisplayName(product),
    barcodeData: product.barcode?.trim() || product.sku || product.mnemonicSku || product.id.slice(-10),
    costPrice: parseNumeric(product.costPrice),
    detailText,
    quantity,
    sku: product.sku || product.mnemonicSku,
    supplierCode: item.supplierCode || undefined,
  };
}

function sampleQueueItem(): QueueItem {
  return {
    product: {
      id: "sample",
      name: SAMPLE_LABEL_DATA.itemName,
      sku: SAMPLE_LABEL_DATA.sku ?? "SKU-001",
      mnemonicSku: "SKU-001",
      category: "Sample",
      unitPrice: "0.00",
      costPrice: String(SAMPLE_LABEL_DATA.costPrice ?? 0),
      barcode: SAMPLE_LABEL_DATA.barcodeData,
      isVariablePrice: false,
      vehicleModel: null,
      stockLevel: 0,
      reorderPoint: 0,
      familyId: null,
      familyName: null,
      subCategoryId: null,
      subCategoryName: null,
      subcategoryId: null,
      subcategoryName: null,
      brandId: null,
      brandName: SAMPLE_LABEL_DATA.detailText ?? null,
      parentProductId: null,
      isParent: false,
      oemNumber: null,
      unitsPerCase: 1,
      packagingUnit: null,
      primarySupplierId: null,
      reorderEnabled: false,
      customReorderPoint: null,
      isSerialized: false,
      isTire: false,
      specialOrder: false,
      discontinued: false,
    },
    quantity: 1,
    supplierCode: SAMPLE_LABEL_DATA.supplierCode ?? "",
  };
}

function poLineToProductRow(line: POLine): ProductRow {
  return {
    id: line.productId,
    name: line.productName,
    sku: line.sku ?? "",
    mnemonicSku: line.mnemonicSku ?? "",
    category: line.category ?? "",
    unitPrice: String(line.unitPrice ?? "0.00"),
    costPrice: String(line.unitCost ?? "0.00"),
    barcode: line.barcode ?? null,
    isVariablePrice: false,
    vehicleModel: null,
    stockLevel: 0,
    reorderPoint: 0,
    familyId: null,
    familyName: null,
    subCategoryId: null,
    subCategoryName: null,
    subcategoryId: null,
    subcategoryName: null,
    brandId: null,
    brandName: null,
    parentProductId: null,
    isParent: false,
    oemNumber: null,
    unitsPerCase: 1,
    packagingUnit: null,
    primarySupplierId: null,
    reorderEnabled: false,
    customReorderPoint: null,
    isSerialized: false,
    isTire: false,
    specialOrder: false,
    discontinued: false,
  };
}

function deriveSupplierCode(brandName: string | null | undefined): string {
  if (!brandName) return "";
  const consonants = brandName.replace(/[aeiou\s]/gi, "");
  if (consonants.length >= 2) return consonants.slice(0, 2).toUpperCase();
  return brandName.slice(0, 2).toUpperCase();
}

function costCodePreview(costPrice: number, supplierCode: string): string {
  const mnemonic = encodeCostMnemonic(costPrice);
  if (!mnemonic) return "";
  return supplierCode ? `${mnemonic}${supplierCode}` : mnemonic;
}

function parseNumeric(value: string | number | null | undefined): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildRulerMarks(sizeMm: number): number[] {
  const marks: number[] = [];
  for (let mark = 0; mark <= sizeMm; mark += 10) {
    marks.push(mark);
  }
  if (marks[marks.length - 1] !== sizeMm) marks.push(sizeMm);
  return marks;
}

function alignToCss(alignment?: "L" | "C" | "R" | "J") {
  if (alignment === "C") return "center";
  if (alignment === "R") return "right";
  if (alignment === "J") return "justify";
  return "left";
}

function toJsBarcodeFormat(format: "ean13" | "upca" | "code128"): string {
  if (format === "ean13") return "EAN13";
  if (format === "upca") return "UPC";
  return "CODE128";
}
