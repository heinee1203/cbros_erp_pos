"use client";

import { useState, useRef, useCallback, useEffect, Suspense } from "react";
import {
  Search,
  Printer,
  Trash2,
  Plus,
  Minus,
  X,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { PODetail, POLine } from "@/hooks/use-po-query";
import { cn } from "@/lib/utils";
import { getProductDisplayName } from "@/lib/format";
import { useAuth } from "../../auth-context";
import { apiFetch } from "@/lib/api";
import type { ProductRow } from "@/hooks/use-products";
import {
  buildShelfLabel,
  encodeCostMnemonic,
  LABEL_50x30,
  LABEL_50x40,
  LABEL_100x70,
  type ZplLabelConfig,
} from "@apex/types";

/* ── Label Size Options ── */
const LABEL_SIZES: { id: string; label: string; config: ZplLabelConfig }[] = [
  { id: "50x30", label: "50\u00D730mm", config: LABEL_50x30 },
  { id: "50x40", label: "50\u00D740mm", config: LABEL_50x40 },
  { id: "100x70", label: "100\u00D770mm", config: LABEL_100x70 },
];

/* ── Queue Item ── */
interface QueueItem {
  product: ProductRow;
  quantity: number;
  supplierCode: string;
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

/* ── Page ── */
export default function BarcodePrintingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>}>
      <BarcodePrintingContent />
    </Suspense>
  );
}

function BarcodePrintingContent() {
  const { token, locationId } = useAuth();

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedSize, setSelectedSize] = useState("50x30");
  const [defaultSupplierCode, setDefaultSupplierCode] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductRow[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [printStatus, setPrintStatus] = useState<"idle" | "sending" | "ok" | "fail">("idle");
  const [statusMsg, setStatusMsg] = useState("");

  const searchParams = useSearchParams();
  const poNo = searchParams.get("poNo");
  const [poLoading, setPOLoading] = useState(false);
  const [poBanner, setPOBanner] = useState<string | null>(null);

  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController>(undefined);

  const labelConfig = LABEL_SIZES.find((s) => s.id === selectedSize)?.config ?? LABEL_50x30;
  const totalLabels = queue.reduce((sum, item) => sum + item.quantity, 0);

  /* ── Search ── */
  const doSearch = useCallback(
    async (q: string) => {
      if (!token || !locationId || q.length < 2) { setSearchResults([]); return; }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSearching(true);
      try {
        const res = await apiFetch<{ data: ProductRow[] }>(`/products/search?q=${encodeURIComponent(q)}`, { token, locationId, signal: controller.signal });
        if (!controller.signal.aborted) { setSearchResults(res.data); setShowResults(true); }
      } catch { /* aborted */ } finally { if (!controller.signal.aborted) setIsSearching(false); }
    },
    [token, locationId],
  );

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.length < 2) { setSearchResults([]); setShowResults(false); return; }
    searchTimerRef.current = setTimeout(() => doSearch(value), 300);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  /* ── PO auto-populate ── */
  useEffect(() => {
    if (!poNo || !token || !locationId) return;
    let cancelled = false;
    setPOLoading(true);
    (async () => {
      try {
        const po = await apiFetch<PODetail>(`/procurement/purchase-orders/by-number/${encodeURIComponent(poNo)}`, { token, locationId });
        if (cancelled) return;
        const supplierAbbr = po.supplier?.mnemonicCode?.slice(0, 2)?.toUpperCase() ?? "";
        setDefaultSupplierCode(supplierAbbr);
        const items: QueueItem[] = po.lines.filter((line: POLine) => line.barcode).map((line: POLine) => ({
          product: { id: line.productId, name: line.productName, sku: line.sku, mnemonicSku: line.mnemonicSku, category: line.category, unitPrice: line.unitPrice, costPrice: line.unitCost, barcode: line.barcode, stockLevel: 0, reorderPoint: 0, familyId: null, familyName: null } as ProductRow,
          quantity: line.orderedQty,
          supplierCode: supplierAbbr,
        }));
        setQueue(items);
        const skipped = po.lines.length - items.length;
        setPOBanner(skipped > 0 ? `Loaded ${items.length} item${items.length !== 1 ? "s" : ""} from ${poNo} (${skipped} skipped)` : `Loaded ${items.length} item${items.length !== 1 ? "s" : ""} from ${poNo}`);
      } catch { setPOBanner(`Failed to load PO ${poNo}`); } finally { if (!cancelled) setPOLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [poNo, token, locationId]);

  /* ── Queue ops ── */
  const addToQueue = (product: ProductRow) => {
    setQueue((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) return prev.map((item) => item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      return [...prev, { product, quantity: 1, supplierCode: defaultSupplierCode || deriveSupplierCode(product.brandName) }];
    });
    setSearchQuery(""); setSearchResults([]); setShowResults(false);
  };

  const updateQuantity = (productId: string, qty: number) => { if (qty < 1 || qty > 999) return; setQueue((prev) => prev.map((item) => (item.product.id === productId ? { ...item, quantity: qty } : item))); };
  const updateSupplierCode = (productId: string, code: string) => { setQueue((prev) => prev.map((item) => item.product.id === productId ? { ...item, supplierCode: code.toUpperCase().slice(0, 4) } : item)); };
  const removeFromQueue = (productId: string) => { setQueue((prev) => prev.filter((item) => item.product.id !== productId)); };
  const clearQueue = () => setQueue([]);

  /* ── Print ── */
  const handlePrint = async () => {
    if (queue.length === 0 || !token || !locationId) return;
    setPrintStatus("sending");
    setStatusMsg(`Sending ${totalLabels} label${totalLabels !== 1 ? "s" : ""}\u2026`);
    try {
      const zplLabels = queue.map((item) => {
        const displayName = getProductDisplayName(item.product);
        const labelData = { itemName: displayName, barcodeData: item.product.barcode ?? item.product.sku ?? "", costPrice: parseFloat(item.product.costPrice) || 0, supplierCode: item.supplierCode, quantity: item.quantity };
        const zpl = buildShelfLabel(labelData, labelConfig);
        return zpl;
      });
      const fullZpl = zplLabels.join("\n");
      let printed = false;
      try {
        const printers = await apiFetch<Array<{ Name: string; DriverName: string }>>("/printing/system-printers", { token, locationId });
        const zebra = printers.find((p) => p.Name?.includes("ZDesigner") || p.Name?.includes("ZD230") || p.DriverName?.includes("ZDesigner"));
        if (zebra) { await apiFetch<{ success: boolean }>("/printing/system-print", { token, locationId, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ printerName: zebra.Name, zpl: fullZpl }) }); printed = true; }
      } catch { /* system print unavailable */ }
      if (!printed) {
        try {
          const cfgRes = await apiFetch<{ data: Array<{ id: string; isDefault: boolean; connectionType: string; ipAddress: string | null; port: number | null }> }>("/printing/printers", { token, locationId });
          const dflt = cfgRes.data.find((p) => p.isDefault) ?? cfgRes.data[0];
          if (dflt?.connectionType === "tcp" && dflt.ipAddress) { await apiFetch("/printing/zpl", { token, locationId, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ zpl: fullZpl, printerIp: dflt.ipAddress, port: dflt.port ?? 9100 }) }); printed = true; }
        } catch { /* TCP failed */ }
      }
      if (!printed) { const w = window.open("", "_blank"); if (w) { w.document.write(`<html><head><title>ZPL Labels</title><style>body{font-family:monospace;white-space:pre-wrap;font-size:12px;margin:20px}</style></head><body>${fullZpl.replace(/</g, "&lt;")}</body></html>`); w.document.close(); } }
      setPrintStatus("ok"); setStatusMsg(`Sent ${totalLabels} label${totalLabels !== 1 ? "s" : ""}`);
    } catch (err: unknown) { setPrintStatus("fail"); setStatusMsg(err instanceof Error ? err.message : "Print failed"); }
    setTimeout(() => { setPrintStatus("idle"); setStatusMsg(""); }, 4000);
  };

  /* ── Render ── */
  return (
    <div className="flex flex-1 flex-col">
      {/* Row 1: Header */}
      <div className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/inventory" className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"><ArrowLeft className="h-5 w-5" /></Link>
          <h1 className="text-xl font-bold text-foreground">Barcode Printing</h1>
        </div>
        <button onClick={handlePrint} disabled={queue.length === 0 || printStatus === "sending"}
          className={cn("flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors", printStatus === "ok" ? "bg-green-600 text-white" : printStatus === "fail" ? "bg-red-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50")}>
          <Printer className="h-4 w-4" />
          {printStatus === "sending" ? "Sending\u2026" : printStatus === "ok" ? "Sent!" : printStatus === "fail" ? "Failed" : `Print ${totalLabels} Label${totalLabels !== 1 ? "s" : ""}`}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 px-6 py-4 space-y-4">
        {statusMsg && (<div className={cn("rounded-lg px-4 py-2 text-sm font-medium", printStatus === "ok" ? "bg-green-50 text-green-700 border border-green-200" : printStatus === "fail" ? "bg-red-50 text-red-700 border border-red-200" : "bg-blue-50 text-blue-700 border border-blue-200")}>{statusMsg}</div>)}
        {poBanner && (<div className="rounded-lg bg-blue-50 px-4 py-2 text-sm text-blue-700 border border-blue-200 flex items-center justify-between"><span>{poLoading ? "Loading PO\u2026" : poBanner}</span><button onClick={() => setPOBanner(null)} className="ml-2 text-blue-500 hover:text-blue-700"><X className="h-4 w-4" /></button></div>)}

        {/* Row 2: Search */}
        <div ref={searchRef} className="relative" style={{ zIndex: 50 }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search by name, SKU, or barcode\u2026" value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)} onFocus={() => searchResults.length > 0 && setShowResults(true)}
              className="w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
            {isSearching && <div className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />}
          </div>
          {showResults && searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1 rounded-lg border border-border bg-background shadow-xl max-h-80 overflow-auto" style={{ zIndex: 50 }}>
              {searchResults.map((product) => {
                const inQueue = queue.some((q) => q.product.id === product.id);
                return (
                  <button key={product.id} onClick={() => addToQueue(product)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent border-b border-border/50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{getProductDisplayName(product)}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono">{product.sku}</span>
                        {product.barcode && (<><span>&middot;</span><span className="font-mono">{product.barcode}</span></>)}
                        {product.costPrice && parseFloat(product.costPrice) > 0 && (<><span>&middot;</span><span className="font-mono text-primary/70">{costCodePreview(parseFloat(product.costPrice), defaultSupplierCode || deriveSupplierCode(product.brandName))}</span></>)}
                      </div>
                    </div>
                    {inQueue && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">In Queue</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Row 3: Label Size + Supplier */}
        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 px-4 py-2.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label Size</span>
          <div className="flex items-center gap-1.5">
            {LABEL_SIZES.map((size) => (
              <button key={size.id} onClick={() => setSelectedSize(size.id)}
                className={cn("rounded-md px-3 py-1.5 text-xs font-semibold transition-colors", selectedSize === size.id ? "bg-primary text-primary-foreground shadow-sm" : "bg-background text-muted-foreground border border-border hover:bg-accent hover:text-foreground")}>
                {size.label}
              </button>
            ))}
          </div>
          <div className="h-5 w-px bg-border" />
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supplier</span>
          <input type="text" value={defaultSupplierCode} onChange={(e) => setDefaultSupplierCode(e.target.value.toUpperCase().slice(0, 4))} maxLength={4} placeholder="e.g. AZ"
            className="w-16 rounded border border-border bg-background px-2 py-1 text-center text-xs font-mono uppercase focus:border-primary focus:outline-none" />
        </div>

        {/* Row 4: Queue */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Print Queue</h2>
            {queue.length > 0 && <span className="text-xs text-muted-foreground">&middot; {queue.length} item{queue.length !== 1 ? "s" : ""} &middot; {totalLabels} label{totalLabels !== 1 ? "s" : ""}</span>}
          </div>
          {queue.length > 0 && <button onClick={clearQueue} className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 transition-colors"><Trash2 className="h-3 w-3" /> Clear All</button>}
        </div>

        {queue.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Search for products above to add them to the print queue.</div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2 text-left w-8">#</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left w-36">Barcode</th><th className="px-3 py-2 text-center w-24">Cost Code</th><th className="px-3 py-2 text-center w-16">Sup</th><th className="px-3 py-2 text-center w-28">Qty</th><th className="px-3 py-2 text-center w-8" />
              </tr></thead>
              <tbody>
                {queue.map((item, idx) => {
                  const preview = costCodePreview(parseFloat(item.product.costPrice) || 0, item.supplierCode);
                  return (
                    <tr key={item.product.id} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2"><p className="font-medium text-foreground truncate max-w-[300px]">{getProductDisplayName(item.product)}</p><p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p></td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{item.product.barcode || <span className="italic text-muted-foreground/50">none</span>}</td>
                      <td className="px-3 py-2 text-center"><span className="font-mono text-xs font-semibold text-primary">{preview || "\u2014"}</span></td>
                      <td className="px-3 py-2 text-center"><input type="text" value={item.supplierCode} onChange={(e) => updateSupplierCode(item.product.id, e.target.value)} maxLength={4} className="w-12 rounded border border-border bg-background px-1 py-0.5 text-center text-xs font-mono uppercase focus:border-primary focus:outline-none" /></td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} disabled={item.quantity <= 1} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"><Minus className="h-3 w-3" /></button>
                          <input type="number" min={1} max={999} value={item.quantity} onChange={(e) => updateQuantity(item.product.id, parseInt(e.target.value) || 1)} className="w-12 rounded border border-border bg-background px-1 py-0.5 text-center text-xs font-mono focus:border-primary focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} disabled={item.quantity >= 999} className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 transition-colors"><Plus className="h-3 w-3" /></button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center"><button onClick={() => removeFromQueue(item.product.id)} className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-500 transition-colors"><X className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
