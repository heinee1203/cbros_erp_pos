import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Download, Loader2, Upload, X } from "lucide-react";

import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BulkApplyResponse, BulkPreviewResponse } from "../types";
import { fmtCurrency, fmtPct } from "../utils";

export function BulkUpdateTab() {
  const { token, apiLocationId: locationId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<BulkPreviewResponse | null>(null);
  const [editedSellPrices, setEditedSellPrices] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkApplyResponse | null>(null);

  const handleDownloadTemplate = useCallback(() => {
    const csv = "SKU,New Cost,New Sell Price\nSAMPLE-001,100.00,150.00\nSAMPLE-002,200.00,299.99\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pricing-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const parseCSV = useCallback((text: string): { sku: string; newCost: number; newSell: number }[] => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    return lines
      .slice(1)
      .map((line) => {
        const parts = line.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
        return {
          sku: parts[0] ?? "",
          newCost: parseFloat(parts[1] ?? "0") || 0,
          newSell: parseFloat(parts[2] ?? "0") || 0,
        };
      })
      .filter((row) => row.sku);
  }, []);

  const handleFileSelect = useCallback(
    async (file: File) => {
      setError(null);
      setResult(null);
      setLoading(true);
      try {
        const text = await file.text();
        const rows = parseCSV(text);
        if (rows.length === 0) {
          setError("CSV is empty or has no data rows");
          setLoading(false);
          return;
        }
        const resp = await apiFetch<BulkPreviewResponse>("/inventory/pricing/bulk-preview", {
          method: "POST",
          token: token!,
          locationId,
          body: JSON.stringify({ rows }),
        });
        setPreview(resp);
        setEditedSellPrices({});
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to preview pricing changes");
      } finally {
        setLoading(false);
      }
    },
    [token, locationId, parseCSV],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const file = event.dataTransfer.files[0];
      if (file && (file.name.endsWith(".csv") || file.type === "text/csv")) {
        handleFileSelect(file);
      } else {
        setError("Please upload a CSV file");
      }
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleApply = useCallback(async () => {
    if (!preview) return;
    setLoading(true);
    setError(null);
    try {
      const rows = preview.rows.map((row) => ({
        sku: row.sku,
        newCost: row.newCost,
        newSell: editedSellPrices[row.sku] ?? row.newSell,
      }));
      const resp = await apiFetch<BulkApplyResponse>("/inventory/pricing/bulk-apply", {
        method: "POST",
        token: token!,
        locationId,
        body: JSON.stringify({ rows }),
      });
      setResult(resp);
      setPreview(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to apply pricing changes");
    } finally {
      setLoading(false);
    }
  }, [preview, editedSellPrices, token, locationId]);

  const handleReset = useCallback(() => {
    setPreview(null);
    setEditedSellPrices({});
    setError(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const previewRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.map((row) => {
      const overrideSell = editedSellPrices[row.sku];
      if (overrideSell !== undefined) {
        const projectedMargin = overrideSell > 0 ? ((overrideSell - row.newCost) / overrideSell) * 100 : 0;
        return { ...row, newSell: overrideSell, projectedMargin, marginAlert: projectedMargin < 15 };
      }
      return row;
    });
  }, [preview, editedSellPrices]);

  return (
    <div className="space-y-6 p-6">
      {!preview && !result && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Upload a CSV with SKU, New Cost, and New Sell Price columns to preview pricing changes.
            </p>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              <Download size={14} />
              Download Template
            </button>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-12 transition",
              loading
                ? "pointer-events-none border-primary/40 bg-primary/5"
                : "border-border bg-muted/30 hover:border-muted-foreground/40 hover:bg-muted/50",
            )}
          >
            {loading ? (
              <>
                <Loader2 size={32} className="animate-spin text-primary" />
                <p className="text-sm text-primary">Processing CSV...</p>
              </>
            ) : (
              <>
                <Upload size={32} className="text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Drop your pricing CSV here, or click to browse
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Supports .csv files</p>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
              className="hidden"
            />
          </div>
        </>
      )}

      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-destructive" />
          <div className="flex-1 text-sm text-destructive">{error}</div>
          <button onClick={() => setError(null)} className="text-destructive hover:text-destructive/80">
            <X size={14} />
          </button>
        </div>
      )}

      {preview && previewRows.length > 0 && (
        <div className="space-y-4">
          {preview.errors.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
              <p className="text-sm font-medium text-destructive">
                {preview.errors.length} row{preview.errors.length !== 1 ? "s" : ""} had errors and were skipped
              </p>
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                {preview.errors.map((previewError, index) => (
                  <p key={index} className="text-xs text-destructive/70">
                    Row {previewError.row}: {previewError.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-sm font-medium text-foreground">
                Preview ({previewRows.length} items)
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  disabled={loading}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Apply Changes
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">SKU</th>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 text-right font-medium">Current Cost</th>
                    <th className="px-4 py-2 text-right font-medium">New Cost</th>
                    <th className="px-4 py-2 text-right font-medium">Current Sell</th>
                    <th className="px-4 py-2 text-right font-medium">New Sell</th>
                    <th className="px-4 py-2 text-right font-medium">Current Margin</th>
                    <th className="px-4 py-2 text-right font-medium">Projected Margin</th>
                    <th className="px-4 py-2 text-center font-medium">Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.sku} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{row.sku}</td>
                      <td className="px-4 py-2 text-foreground">{row.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtCurrency(row.currentCost)}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-foreground">
                        {fmtCurrency(row.newCost)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtCurrency(row.currentSell)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editedSellPrices[row.sku] ?? row.newSell}
                          onChange={(event) =>
                            setEditedSellPrices((current) => ({
                              ...current,
                              [row.sku]: parseFloat(event.target.value) || 0,
                            }))
                          }
                          className="w-24 rounded-md border border-border bg-background px-2 py-1 text-right text-xs tabular-nums text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                        />
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                        {fmtPct(row.currentMargin)}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2 text-right font-medium tabular-nums",
                          row.projectedMargin < 15 ? "text-red-500" : "text-foreground",
                        )}
                      >
                        {fmtPct(row.projectedMargin)}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {row.marginAlert && <AlertTriangle size={14} className="inline-block text-red-500" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-border bg-muted/30 p-8">
          <div className="mx-auto max-w-md space-y-6 text-center">
            <div className="flex justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                <Check size={32} className="text-emerald-500" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Changes Applied</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {result.costsUpdated} cost{result.costsUpdated !== 1 ? "s" : ""} updated,{" "}
                {result.pricesUpdated} price{result.pricesUpdated !== 1 ? "s" : ""} updated
              </p>
            </div>
            <button
              onClick={handleReset}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Upload Another File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
