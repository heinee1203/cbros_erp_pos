"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Search, Upload, Download, Trash2, Loader2,
  CheckCircle2, XCircle, AlertTriangle,
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

export default function NewTransferPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { token, locationId: authLocationId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const locationsQuery = useLocations(token);
  const allLocations = useMemo(() => {
    return (locationsQuery.data?.data ?? []).filter(
      (l: LocationRow) => l.isActive && l.type !== "TRANSIT_BUFFER"
    );
  }, [locationsQuery.data]);

  const [sourceLocationId, setSourceLocationId] = useState("");
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

        if (mode === "SUBMIT" && result?.id) {
          await apiFetch(`/transfers/${result.id}/approve`, {
            method: "POST",
            body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
            token,
            locationId: authLocationId,
          });
        }

        queryClient.invalidateQueries({ queryKey: ["transfers"] });
        router.push(
          `/procurement/transfer-orders/${result.transferNo ?? result.transfer_no}`
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
              <option value="">Select source...</option>
              {allLocations.map((l) => (
                <option key={l.id} value={l.id} disabled={l.id === destinationLocationId}>{l.name} ({l.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">To *</label>
            <select value={destinationLocationId} onChange={(e) => setDestinationLocationId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">Select destination...</option>
              {allLocations.map((l) => (
                <option key={l.id} value={l.id} disabled={l.id === sourceLocationId}>{l.name} ({l.code})</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Reason for transfer, special instructions..."
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="mb-6 flex-1 rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transfer Items</h3>
          <div className="flex items-center gap-2">
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
            placeholder={sourceLocationId ? "Search products at source location..." : "Select source location first"}
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
            {sourceLocationId ? "Search for products above or import a CSV file" : "Select a source location to start adding items"}
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
                  <td className="px-3 py-2 font-medium">{line.productName}</td>
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
