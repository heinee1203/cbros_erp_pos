"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Search, Upload, Download, Trash2, Loader2,
  CheckCircle2, XCircle, AlertTriangle, Package,
} from "lucide-react";
import { useAuth } from "@/app/auth-context";
import { useLocations, type LocationRow } from "@/hooks/use-locations";
import { apiFetch } from "@/lib/api";

interface TransferLine {
  localId: string;
  productId: string;
  productName: string;
  sku: string;
  availableStock: number;
  transferQty: number;
  unitsPerCase: number;
  packagingUnit: string | null;
  entryUnit: "piece" | "case";
  fromPo?: string; // PO number this item was imported from
}

interface CSVPreviewRow {
  sku: string;
  qty: number;
  productId?: string;
  productName?: string;
  availableStock?: number;
  unitsPerCase?: number;
  packagingUnit?: string | null;
  status: "ready" | "insufficient" | "not_found";
  message?: string;
}

// ── PO import types ──

interface POItem {
  productId: string;
  productName: string;
  sku: string;
  mnemonicSku: string;
  receivedQty: number;
  orderedQty: number;
  unitCost: number;
}

interface POListEntry {
  id: string;
  poNo: string;
  status: string;
  supplierName: string;
  createdAt: string;
  lineCount: number;
  totalReceivedQty: number;
  items: POItem[];
}

export default function NewTransferPage() {
  const router = useRouter();
  const searchParams = useSearchParams() ?? new URLSearchParams();
  const queryClient = useQueryClient();
  const { token, locationId: authLocationId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const locationsQuery = useLocations(token);
  const allLocations = useMemo(() => {
    return (locationsQuery.data?.data ?? []).filter(
      (l: LocationRow) => l.isActive && l.type !== "TRANSIT_BUFFER"
    );
  }, [locationsQuery.data]);

  // ── URL param pre-fill ──
  const paramSourceLocationId = searchParams.get("sourceLocationId") ?? "";
  const paramFromPoId = searchParams.get("fromPoId") ?? "";

  const [sourceLocationId, setSourceLocationId] = useState(paramSourceLocationId);
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const searchResults = useQuery<{ data: any[] }>({
    queryKey: ["transfer-product-search", debouncedSearch, sourceLocationId],
    queryFn: () =>
      apiFetch<{ data: any[] }>(
        `/products?search=${encodeURIComponent(debouncedSearch)}&limit=10`,
        { token, locationId: sourceLocationId }
      ),
    enabled: debouncedSearch.length >= 2 && !!sourceLocationId,
    staleTime: 10_000,
  });

  const [csvPreview, setCsvPreview] = useState<CSVPreviewRow[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [csvLoading, setCsvLoading] = useState(false);

  // ── PO import modal ──
  const [showPoImport, setShowPoImport] = useState(false);

  const totalItems = lines.length;
  const totalUnits = lines.reduce((sum, l) => {
    return sum + (l.entryUnit === "case" ? l.transferQty * l.unitsPerCase : l.transferQty);
  }, 0);
  const canSave =
    !!sourceLocationId &&
    !!destinationLocationId &&
    sourceLocationId !== destinationLocationId &&
    lines.length > 0 &&
    lines.every((l) => {
      if (l.transferQty <= 0) return false;
      const piecesQty = l.entryUnit === "case" ? l.transferQty * l.unitsPerCase : l.transferQty;
      return piecesQty <= l.availableStock;
    });

  // ── Auto-import from PO URL params ──
  const [autoImportDone, setAutoImportDone] = useState(false);
  useEffect(() => {
    if (autoImportDone || !paramFromPoId || !sourceLocationId || !token) return;
    setAutoImportDone(true);

    (async () => {
      try {
        const po = await apiFetch<any>(
          `/procurement/purchase-orders/${paramFromPoId}`,
          { token, locationId: authLocationId }
        );
        if (!po) return;

        const newLines: TransferLine[] = [];
        const poItems = po.lines ?? po.items ?? [];
        for (const item of poItems) {
          const receivedQty = item.receivedAcceptedQty ?? item.receivedQty ?? 0;
          if (receivedQty <= 0) continue;
          if (lines.some((l) => l.productId === item.productId)) continue;
          newLines.push({
            localId: crypto.randomUUID(),
            productId: item.productId,
            productName: item.productName ?? item.name ?? "",
            sku: item.sku ?? "",
            availableStock: receivedQty,
            transferQty: receivedQty,
            unitsPerCase: 1,
            packagingUnit: null,
            entryUnit: "piece",
            fromPo: po.poNo,
          });
        }

        if (newLines.length > 0) {
          setLines((prev) => [...prev, ...newLines]);
          if (po.notes) {
            setNotes(`Transfer from ${po.poNo}: ${po.notes}`);
          } else {
            setNotes(`Transfer from ${po.poNo}`);
          }
        }
      } catch {
        // silently fail — user can still add items manually
      }
    })();
  }, [autoImportDone, paramFromPoId, sourceLocationId, token, authLocationId, lines]);

  const addLine = useCallback(
    (product: any) => {
      if (lines.some((l) => l.productId === product.id)) return;
      const upc = product.unitsPerCase ?? 1;
      setLines((prev) => [
        ...prev,
        {
          localId: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          availableStock: product.stockLevel ?? 0,
          transferQty: Math.min(1, product.stockLevel ?? 0),
          unitsPerCase: upc,
          packagingUnit: product.packagingUnit ?? null,
          entryUnit: upc > 1 ? "case" as const : "piece" as const,
        },
      ]);
      setSearchQuery("");
      setShowResults(false);
    },
    [lines]
  );

  const addLinesFromPO = useCallback(
    (poNo: string, items: Array<{ productId: string; productName: string; sku: string; qty: number }>) => {
      setLines((prev) => {
        const updated = [...prev];
        for (const item of items) {
          const existing = updated.find((l) => l.productId === item.productId);
          if (existing) {
            // Merge: add qty to existing line
            existing.transferQty += item.qty;
            if (!existing.fromPo) existing.fromPo = poNo;
          } else {
            updated.push({
              localId: crypto.randomUUID(),
              productId: item.productId,
              productName: item.productName,
              sku: item.sku,
              availableStock: item.qty, // PO import: received qty is the available qty
              transferQty: item.qty,
              unitsPerCase: 1,
              packagingUnit: null,
              entryUnit: "piece",
              fromPo: poNo,
            });
          }
        }
        return updated;
      });
    },
    []
  );

  const updateLine = useCallback(
    (localId: string, field: keyof TransferLine, value: any) => {
      setLines((prev) =>
        prev.map((l) => (l.localId === localId ? { ...l, [field]: value } : l))
      );
    },
    []
  );

  const removeLine = useCallback((localId: string) => {
    setLines((prev) => prev.filter((l) => l.localId !== localId));
  }, []);

  const handleSave = useCallback(
    async (mode: "DRAFT" | "SUBMIT") => {
      if (!canSave) return;
      setIsSaving(true);
      try {
        const result = await apiFetch<any>("/transfers", {
          method: "POST",
          body: JSON.stringify({
            sourceLocationId,
            destinationLocationId,
            notes: notes.trim() || undefined,
            items: lines.map((l) => ({
              productId: l.productId,
              requestedQty: l.entryUnit === "case"
                ? l.transferQty * l.unitsPerCase
                : l.transferQty,
            })),
          }),
          token,
          locationId: authLocationId,
        });

        const transfer = result?.transfer ?? result;

        if (mode === "SUBMIT" && transfer?.id) {
          await apiFetch(`/transfers/${transfer.id}/approve`, {
            method: "POST",
            body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
            token,
            locationId: authLocationId,
          });
        }

        queryClient.invalidateQueries({ queryKey: ["transfers"] });
        router.push(
          `/procurement/transfer-orders/${transfer.transferNo ?? transfer.transfer_no}`
        );
      } catch (err: any) {
        alert(err.message || "Failed to create transfer");
      } finally {
        setIsSaving(false);
      }
    },
    [canSave, sourceLocationId, destinationLocationId, notes, lines, token, authLocationId, queryClient, router]
  );

  const handleDownloadTemplate = useCallback(() => {
    const csv = "\uFEFFSKU,Transfer Qty\nSDG-30003,10\nAN-468WK,1\nDB-1390,5\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "apex-transfer-import-template.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleCSVUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!sourceLocationId) {
        alert("Select a source location first");
        return;
      }
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      setCsvLoading(true);
      try {
        const text = await file.text();
        const rowLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (rowLines.length < 2) {
          alert("CSV must have a header row and at least one data row");
          return;
        }

        const dataRows = rowLines.slice(1);
        const preview: CSVPreviewRow[] = [];

        for (const row of dataRows) {
          const cells = row.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
          const sku = cells[0] || "";
          const qty = parseInt(cells[1]) || 0;
          if (!sku) continue;

          try {
            const resp = await apiFetch<{ data: any[] }>(
              `/products?search=${encodeURIComponent(sku)}&limit=5`,
              { token, locationId: sourceLocationId }
            );
            const match = resp.data?.find(
              (p: any) => p.sku === sku || p.barcode === sku || p.mnemonicSku === sku
            );

            if (!match) {
              preview.push({ sku, qty, status: "not_found", message: "SKU not found" });
            } else if ((match.stockLevel ?? 0) < qty) {
              preview.push({
                sku, qty, productId: match.id, productName: match.name,
                availableStock: match.stockLevel ?? 0,
                unitsPerCase: match.unitsPerCase ?? 1,
                packagingUnit: match.packagingUnit ?? null,
                status: "insufficient",
                message: `Only ${match.stockLevel ?? 0} available`,
              });
            } else {
              preview.push({
                sku, qty, productId: match.id, productName: match.name,
                availableStock: match.stockLevel ?? 0,
                unitsPerCase: match.unitsPerCase ?? 1,
                packagingUnit: match.packagingUnit ?? null,
                status: "ready",
              });
            }
          } catch {
            preview.push({ sku, qty, status: "not_found", message: "Lookup failed" });
          }
        }

        setCsvPreview(preview);
        setShowCsvPreview(true);
      } finally {
        setCsvLoading(false);
      }
    },
    [sourceLocationId, token]
  );

  const importReadyItems = useCallback(() => {
    const ready = csvPreview.filter((r) => r.status === "ready" && r.productId);
    for (const r of ready) {
      if (lines.some((l) => l.productId === r.productId)) continue;
      setLines((prev) => [
        ...prev,
        {
          localId: crypto.randomUUID(),
          productId: r.productId!,
          productName: r.productName!,
          sku: r.sku,
          availableStock: r.availableStock!,
          transferQty: r.qty,
          unitsPerCase: r.unitsPerCase ?? 1,
          packagingUnit: r.packagingUnit ?? null,
          entryUnit: "piece" as const,
        },
      ]);
    }
    setShowCsvPreview(false);
    setCsvPreview([]);
  }, [csvPreview, lines]);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <Link href="/procurement/transfer-orders" className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft size={12} /> Back to Transfer Orders
        </Link>
        <h2 className="text-lg font-semibold">New Transfer Order</h2>
        <p className="text-sm text-muted-foreground">Move stock between locations</p>
      </div>

      <div className="mb-6 rounded-xl border border-border bg-background p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transfer Details</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">From *</label>
            <select value={sourceLocationId} onChange={(e) => { setSourceLocationId(e.target.value); setLines([]); }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">Select source…</option>
              {allLocations.map((l) => (
                <option key={l.id} value={l.id} disabled={l.id === destinationLocationId}>{l.name} ({l.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">To *</label>
            <select value={destinationLocationId} onChange={(e) => setDestinationLocationId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">Select destination…</option>
              {allLocations.map((l) => (
                <option key={l.id} value={l.id} disabled={l.id === sourceLocationId}>{l.name} ({l.code})</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Reason for transfer, special instructions…"
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="mb-6 flex-1 rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transfer Items</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPoImport(true)}
              disabled={!sourceLocationId}
              className="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
            >
              <Package size={12} /> Import from PO
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={!sourceLocationId || csvLoading}
              className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">
              {csvLoading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Import CSV
            </button>
            <button onClick={handleDownloadTemplate} className="text-xs text-primary hover:underline">
              <Download size={12} className="mr-1 inline" /> Template
            </button>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
          </div>
        </div>

        <div className="relative border-b border-border px-4 py-3">
          <Search size={14} className="absolute left-7 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            placeholder={sourceLocationId ? "Search products at source location…" : "Select source location first"}
            disabled={!sourceLocationId}
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary disabled:opacity-50" />
          {showResults && debouncedSearch.length >= 2 && searchResults.data?.data && searchResults.data.data.length > 0 && (
            <div className="absolute left-4 right-4 z-20 mt-1 max-h-[240px] overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
              {searchResults.data.data.map((p: any) => (
                <button key={p.id} onClick={() => addLine(p)}
                  disabled={lines.some((l) => l.productId === p.id)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-40">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.sku}</div>
                  </div>
                  <div className="text-right">
                    {(p.stockLevel ?? 0) > 0 ? (
                      <span className="text-xs font-medium text-green-600">{p.stockLevel} available</span>
                    ) : (
                      <span className="text-xs font-medium text-red-500">Out of stock</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {sourceLocationId ? "Search for products, import a CSV, or import from a Purchase Order" : "Select a source location to start adding items"}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left w-8">#</th>
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-right">Available</th>
                <th className="px-3 py-2 text-right">Transfer Qty</th>
                <th className="px-3 py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={line.localId} className="border-b border-border">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{line.productName}</div>
                    {line.fromPo && (
                      <span className="mt-0.5 inline-flex items-center rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        from {line.fromPo}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{line.sku}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={line.availableStock > 0 ? "text-green-600" : "text-red-500"}>{line.availableStock}</span>
                    {line.unitsPerCase > 1 && (
                      <span className="text-[10px] text-muted-foreground ml-1">
                        ({Math.floor(line.availableStock / line.unitsPerCase)} {line.packagingUnit || "cs"})
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {line.unitsPerCase > 1 && (
                        <select
                          value={line.entryUnit}
                          onChange={(e) => updateLine(line.localId, "entryUnit", e.target.value)}
                          className="w-auto rounded border border-border px-1 py-0.5 text-xs"
                        >
                          <option value="piece">pc</option>
                          <option value="case">{line.packagingUnit || "cs"}</option>
                        </select>
                      )}
                      <input type="number" min={1}
                        max={line.entryUnit === "case"
                          ? Math.floor(line.availableStock / line.unitsPerCase)
                          : line.availableStock}
                        value={line.transferQty}
                        onChange={(e) => {
                          const maxQty = line.entryUnit === "case"
                            ? Math.floor(line.availableStock / line.unitsPerCase)
                            : line.availableStock;
                          const qty = Math.min(Math.max(parseInt(e.target.value) || 0, 0), maxQty);
                          updateLine(line.localId, "transferQty", qty);
                        }}
                        className="w-[70px] rounded border border-border px-2 py-1 text-right text-sm" />
                    </div>
                    {line.entryUnit === "case" && line.unitsPerCase > 1 && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 text-right">
                        = {line.transferQty * line.unitsPerCase} pcs
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => removeLine(line.localId)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {lines.length > 0 && (
          <div className="border-t border-border bg-muted/30 px-4 py-2 text-right text-xs text-muted-foreground">
            {totalItems} item{totalItems !== 1 ? "s" : ""} · {totalUnits} unit{totalUnits !== 1 ? "s" : ""}
          </div>
        )}
      </div>

      {/* ── CSV Preview Modal ── */}
      {showCsvPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-2xl rounded-xl bg-background p-6 shadow-xl">
            <h3 className="mb-1 text-base font-semibold">Import Transfer Items</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Source: {allLocations.find((l) => l.id === sourceLocationId)?.name}
            </p>
            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-right">Available</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((r, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-3 py-2 text-sm">{r.productName || "—"}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-3 py-2 text-right text-xs">{r.availableStock ?? "—"}</td>
                      <td className="px-3 py-2 text-right text-xs">{r.qty}</td>
                      <td className="px-3 py-2 text-center">
                        {r.status === "ready" && <CheckCircle2 size={14} className="inline text-green-600" />}
                        {r.status === "insufficient" && (
                          <span className="inline-flex items-center gap-1 text-xs text-orange-600">
                            <AlertTriangle size={12} /> {r.message}
                          </span>
                        )}
                        {r.status === "not_found" && (
                          <span className="inline-flex items-center gap-1 text-xs text-red-500">
                            <XCircle size={12} /> {r.message}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {csvPreview.filter((r) => r.status === "ready").length} ready ·{" "}
                {csvPreview.filter((r) => r.status === "not_found").length} not found ·{" "}
                {csvPreview.filter((r) => r.status === "insufficient").length} insufficient
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowCsvPreview(false); setCsvPreview([]); }}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">Cancel</button>
                <button onClick={importReadyItems}
                  disabled={csvPreview.filter((r) => r.status === "ready").length === 0}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  Import {csvPreview.filter((r) => r.status === "ready").length} Ready Items
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Import from PO Modal ── */}
      {showPoImport && sourceLocationId && (
        <ImportFromPOModal
          token={token}
          locationId={authLocationId}
          sourceLocationId={sourceLocationId}
          sourceLocationName={allLocations.find((l) => l.id === sourceLocationId)?.name ?? ""}
          existingProductIds={new Set(lines.map((l) => l.productId))}
          onImport={addLinesFromPO}
          onClose={() => setShowPoImport(false)}
        />
      )}

      <div className="sticky bottom-0 flex items-center justify-between border-t border-border bg-background px-6 py-4">
        <button onClick={() => router.push("/procurement/transfer-orders")}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
        <div className="flex items-center gap-3">
          <button onClick={() => handleSave("DRAFT")} disabled={!canSave || isSaving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
            {isSaving ? <Loader2 size={14} className="inline animate-spin mr-1" /> : null} Save as Draft
          </button>
          <button onClick={() => handleSave("SUBMIT")} disabled={!canSave || isSaving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {isSaving ? <Loader2 size={14} className="inline animate-spin mr-1" /> : null} Save & Submit for Approval
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
 * IMPORT FROM PO MODAL
 *
 * Two-step: select a PO, then pick items + quantities.
 * ══════════════════════════════════════════════════════════ */

function ImportFromPOModal({
  token,
  locationId,
  sourceLocationId,
  sourceLocationName,
  existingProductIds,
  onImport,
  onClose,
}: {
  token: string;
  locationId: string;
  sourceLocationId: string;
  sourceLocationName: string;
  existingProductIds: Set<string>;
  onImport: (poNo: string, items: Array<{ productId: string; productName: string; sku: string; qty: number }>) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedPoId, setSelectedPoId] = useState<string | null>(null);

  // Item selection state
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  const [itemQtys, setItemQtys] = useState<Record<string, number>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const posQuery = useQuery<{ data: POListEntry[] }>({
    queryKey: ["po-received-at", sourceLocationId, debouncedSearch],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      params.set("limit", "20");
      return apiFetch<{ data: POListEntry[] }>(
        `/procurement/purchase-orders/received-at/${sourceLocationId}?${params}`,
        { token, locationId },
      );
    },
    enabled: !!sourceLocationId && !!token,
    staleTime: 15_000,
  });

  const pos = posQuery.data?.data ?? [];
  const selectedPo = pos.find((p) => p.id === selectedPoId) ?? null;

  // When a PO is selected, initialize all items as checked with full received qty
  useEffect(() => {
    if (!selectedPo) return;
    const checked: Record<string, boolean> = {};
    const qtys: Record<string, number> = {};
    for (const item of selectedPo.items) {
      checked[item.productId] = !existingProductIds.has(item.productId);
      qtys[item.productId] = item.receivedQty;
    }
    setCheckedItems(checked);
    setItemQtys(qtys);
  }, [selectedPoId, selectedPo, existingProductIds]);

  const selectedCount = selectedPo
    ? selectedPo.items.filter((it) => checkedItems[it.productId]).length
    : 0;
  const selectedUnits = selectedPo
    ? selectedPo.items
        .filter((it) => checkedItems[it.productId])
        .reduce((sum, it) => sum + (itemQtys[it.productId] ?? 0), 0)
    : 0;

  const handleAdd = () => {
    if (!selectedPo) return;
    const items = selectedPo.items
      .filter((it) => checkedItems[it.productId] && (itemQtys[it.productId] ?? 0) > 0)
      .map((it) => ({
        productId: it.productId,
        productName: it.productName,
        sku: it.sku,
        qty: itemQtys[it.productId] ?? it.receivedQty,
      }));
    if (items.length > 0) {
      onImport(selectedPo.poNo, items);
    }
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-[3px]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
        <div
          className="w-full max-w-2xl rounded-xl border border-border bg-background p-6 shadow-2xl animate-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold">Import Items from Purchase Order</h3>
              <p className="text-xs text-muted-foreground">
                Source: {sourceLocationName}
              </p>
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* PO search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search PO number…"
              className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </div>

          {/* PO list */}
          <div className="mb-4 max-h-[180px] overflow-y-auto rounded-lg border border-border">
            {posQuery.isLoading ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 size={14} className="mr-2 animate-spin" /> Loading POs…
              </div>
            ) : pos.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No received POs found at this location
              </div>
            ) : (
              pos.map((po) => (
                <button
                  key={po.id}
                  onClick={() => setSelectedPoId(po.id === selectedPoId ? null : po.id)}
                  className={`flex w-full items-center justify-between border-b border-border px-3 py-1.5 text-left text-sm transition-colors last:border-b-0 ${
                    po.id === selectedPoId
                      ? "bg-primary/5 border-l-2 border-l-primary"
                      : "hover:bg-accent"
                  }`}
                >
                  <div>
                    <span className="font-mono font-semibold text-primary">{po.poNo}</span>
                    <span className="ml-2 text-muted-foreground">{po.supplierName}</span>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{new Date(po.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                    <div>{po.totalReceivedQty} units received</div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Selected PO items */}
          {selectedPo && (
            <>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {selectedPo.poNo} — Received Items
              </div>
              <div className="max-h-[220px] overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="w-8 px-2 py-1.5" />
                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                      <th className="px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">SKU</th>
                      <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Received</th>
                      <th className="px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Transfer Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPo.items.map((item) => {
                      const isChecked = checkedItems[item.productId] ?? false;
                      const alreadyAdded = existingProductIds.has(item.productId);
                      return (
                        <tr
                          key={item.productId}
                          className={`border-b border-border ${!isChecked ? "opacity-50" : ""}`}
                        >
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) =>
                                setCheckedItems((prev) => ({ ...prev, [item.productId]: e.target.checked }))
                              }
                              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/20"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="text-xs truncate max-w-[200px]">{item.productName}</div>
                            {alreadyAdded && (
                              <span className="text-[10px] text-warning">already in list — qty will merge</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{item.sku}</td>
                          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{item.receivedQty}</td>
                          <td className="px-3 py-1.5 text-right">
                            <input
                              type="number"
                              min={0}
                              max={item.receivedQty}
                              value={itemQtys[item.productId] ?? 0}
                              onChange={(e) => {
                                const val = Math.min(
                                  Math.max(0, parseInt(e.target.value) || 0),
                                  item.receivedQty,
                                );
                                setItemQtys((prev) => ({ ...prev, [item.productId]: val }));
                                if (val > 0 && !checkedItems[item.productId]) {
                                  setCheckedItems((prev) => ({ ...prev, [item.productId]: true }));
                                }
                              }}
                              disabled={!isChecked}
                              className="w-16 rounded border border-border bg-background px-2 py-0.5 text-right text-xs tabular-nums outline-none focus:border-primary disabled:opacity-40"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-2 text-xs text-muted-foreground">
                {selectedCount} of {selectedPo.items.length} items selected, {selectedUnits} units
              </div>
            </>
          )}

          {/* Actions */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!selectedPo || selectedCount === 0}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add to Transfer
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
