"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, FileText, CheckCircle, AlertTriangle, Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type Step = "upload" | "parsing" | "preview" | "progress" | "results";

interface ReceiptsPreview {
  previewToken: string;
  totalRows: number;
  dateRange: { from: string; to: string };
  stores: string[];
  receiptCount: number;
  salesCount: number;
  refundCount: number;
  voidedCount: number;
  skuMatchRate: string;
  unmatchedSkus: { sku: string; item: string; count: number }[];
  locationMapping: { csvName: string; apexLocationId: string | null; apexLocationName: string | null; autoMatched: boolean; saved: boolean }[];
  preview: { date: string; receipt: string; item: string; sku: string; qty: number; net: number; store: string; type: string }[];
}

interface ImportResult {
  created: number;
  skipped: number;
  priceBackfilled?: number;
  errors: number;
  errorLog: { row: number; message: string }[];
}

export default function ImportSalesHistoryPage() {
  const { token, locationId, loading: authLoading, locations } = useAuth();
  const [step, setStep] = useState<Step>("upload");
  const [preview, setPreview] = useState<ReceiptsPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Options
  const [skipVoided, setSkipVoided] = useState(true);
  const [skipCustomerCount, setSkipCustomerCount] = useState(true);
  const [skipZeroQty, setSkipZeroQty] = useState(true);

  // Location mapping overrides
  const [locOverrides, setLocOverrides] = useState<Record<string, string>>({});

  // Progress
  const [progress, setProgress] = useState({ processed: 0, total: 0, percent: 0, created: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload handler ──
  const handleFile = useCallback(async (file: File) => {
    if (!token || !locationId) return;
    setStep("parsing");
    setError(null);
    try {
      const csvText = await file.text();
      const res = await apiFetch<ReceiptsPreview>("/inventory/import/receipts-preview", {
        token,
        locationId,
        method: "POST",
        body: { csvText },
      });
      setPreview(res);
      // Init location overrides from preview
      const overrides: Record<string, string> = {};
      for (const lm of res.locationMapping) {
        if (lm.apexLocationId) overrides[lm.csvName] = lm.apexLocationId;
      }
      setLocOverrides(overrides);
      setStep("preview");
    } catch (err: any) {
      setError(err.message || "Failed to parse CSV");
      setStep("upload");
    }
  }, [token, locationId]);

  // ── Execute import ──
  const handleImport = useCallback(async () => {
    if (!token || !locationId || !preview) return;
    setStep("progress");
    setProgress({ processed: 0, total: preview.totalRows, percent: 0, created: 0 });

    try {
      const res = await apiFetch<ImportResult>("/inventory/import/receipts-execute", {
        token,
        locationId,
        method: "POST",
        body: {
          previewToken: preview.previewToken,
          locationMapping: locOverrides,
          skipVoided,
          skipCustomerCount,
          skipZeroQty,
        },
      });
      setResult(res);
      setStep("results");
    } catch (err: any) {
      setError(err.message || "Import failed");
      setStep("preview");
    }
  }, [token, locationId, preview, locOverrides, skipVoided, skipCustomerCount, skipZeroQty]);

  // ── Polling for progress ──
  useEffect(() => {
    if (step !== "progress" || !preview?.previewToken || !token || !locationId) return;
    const interval = setInterval(async () => {
      try {
        const pg = await apiFetch<any>(`/inventory/import/progress/${preview.previewToken}`, { token, locationId });
        if (pg) {
          setProgress({ processed: pg.processed, total: pg.total, percent: pg.percent, created: pg.created });
          if (pg.status === "completed") clearInterval(interval);
        }
      } catch {}
    }, 1000);
    return () => clearInterval(interval);
  }, [step, preview, token, locationId]);

  // ── Backfill orphaned sales ──
  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<{ linked: number } | null>(null);
  const handleBackfill = async () => {
    if (!token || !locationId) return;
    setBackfilling(true);
    try {
      const res = await apiFetch<{ linked: number }>("/inventory/import/backfill-orphaned-sales", { token, locationId, method: "POST" });
      setBackfillResult(res);
    } catch {}
    setBackfilling(false);
  };

  if (authLoading) return <div className="flex items-center justify-center py-20 text-sm text-muted-foreground">Loading…</div>;

  const fieldClass = "rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";
  const allLocations = locations || [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/inventory" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"><ArrowLeft size={16} /></Link>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Import Center</h1>
          <p className="text-sm text-muted-foreground">Import data from Loyverse CSV exports</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-4 border-b border-border">
        <Link href="/inventory/import" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent">
          Item Catalog
        </Link>
        <Link href="/inventory/import-sales" className="px-3 py-2 text-sm font-medium border-b-2 border-primary text-primary">
          Sales Receipts
        </Link>
        <Link href="/inventory/import/history" className="px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground border-b-2 border-transparent">
          Inventory Movements
        </Link>
      </div>

      <p className="text-sm text-muted-foreground">Import sales history from Loyverse → Reports → Receipts by Item → Export</p>

      {error && (
        <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {/* ── STEP: UPLOAD ── */}
      {step === "upload" && (
        <div
          className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/20 py-16 text-center hover:border-primary/50 cursor-pointer"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <Upload className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium">Drop Loyverse Receipts CSV here</p>
          <p className="mt-1 text-xs text-muted-foreground">or click to browse — Loyverse → Reports → Receipts by Item → Export</p>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>
      )}

      {/* ── STEP: PARSING ── */}
      {step === "parsing" && (
        <div className="flex flex-1 flex-col items-center justify-center py-16">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Parsing receipts CSV…</p>
        </div>
      )}

      {/* ── STEP: PREVIEW ── */}
      {step === "preview" && preview && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-2xl font-bold tabular-nums">{preview.totalRows.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Total Rows</div>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-2xl font-bold tabular-nums text-primary">{preview.salesCount.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Sales</div>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-2xl font-bold tabular-nums text-warning">{preview.refundCount.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Refunds</div>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <div className="text-2xl font-bold tabular-nums text-muted-foreground">{preview.voidedCount.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Voided (skip)</div>
            </div>
          </div>

          {/* Date range + SKU match */}
          <div className="rounded-lg border border-border bg-background p-4 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-muted-foreground">Date Range:</span> {preview.dateRange.from} — {preview.dateRange.to}</div>
              <div><span className="text-muted-foreground">Receipts:</span> {preview.receiptCount.toLocaleString()}</div>
              <div><span className="text-muted-foreground">SKU Match Rate:</span> <span className="font-medium">{preview.skuMatchRate}</span></div>
              <div><span className="text-muted-foreground">Stores:</span> {preview.stores.join(", ")}</div>
            </div>
          </div>

          {/* Unmatched SKUs */}
          {preview.unmatchedSkus.length > 0 && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <div className="mb-2 text-sm font-medium text-warning">⚠ {preview.unmatchedSkus.length} unmatched SKUs (imported without product link)</div>
              <div className="max-h-[120px] overflow-y-auto space-y-1">
                {preview.unmatchedSkus.slice(0, 20).map((u) => (
                  <div key={u.sku} className="text-xs text-muted-foreground">
                    {u.sku} — {u.item} ({u.count} rows)
                  </div>
                ))}
                {preview.unmatchedSkus.length > 20 && <div className="text-xs text-muted-foreground">…and {preview.unmatchedSkus.length - 20} more</div>}
              </div>
            </div>
          )}

          {/* Location mapping */}
          <div className="rounded-lg border border-border bg-background p-4">
            <h3 className="mb-2 text-sm font-semibold">Location Mapping</h3>
            <div className="space-y-2">
              {preview.locationMapping.map((lm) => (
                <div key={lm.csvName} className="flex items-center gap-3 text-sm">
                  <span className="w-40 font-mono">{lm.csvName}</span>
                  <span className="text-muted-foreground">→</span>
                  <select
                    value={locOverrides[lm.csvName] || ""}
                    onChange={(e) => setLocOverrides((prev) => ({ ...prev, [lm.csvName]: e.target.value }))}
                    className={cn(fieldClass, "flex-1")}
                  >
                    <option value="">Select location…</option>
                    {allLocations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  {lm.saved && <span className="text-xs text-green-600">✓ saved</span>}
                  {lm.autoMatched && !lm.saved && <span className="text-xs text-green-600">✓ auto</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={skipVoided} onChange={(e) => setSkipVoided(e.target.checked)} />
              Skip voided receipts
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={skipCustomerCount} onChange={(e) => setSkipCustomerCount(e.target.checked)} />
              Skip "CUSTOMER COUNT" rows
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={skipZeroQty} onChange={(e) => setSkipZeroQty(e.target.checked)} />
              Skip zero-quantity rows
            </label>
          </div>

          {/* Preview table */}
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Date</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Receipt</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Type</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Item</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">SKU</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase text-muted-foreground">Qty</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase text-muted-foreground">Store</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.slice(0, 30).map((r, i) => (
                  <tr key={i} className={`border-b border-border ${i % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.date}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.receipt}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${r.type === "Sale" ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-sm">{r.item}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.sku}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.qty}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.store}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.preview.length > 30 && (
              <div className="bg-muted/30 px-3 py-2 text-center text-xs text-muted-foreground">
                Showing 30 of {preview.totalRows.toLocaleString()} rows
              </div>
            )}
          </div>

          {/* Import button */}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setStep("upload"); setPreview(null); }} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
            <button onClick={handleImport} className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Import {preview.salesCount + preview.refundCount} Sales Records
            </button>
          </div>
        </div>
      )}

      {/* ── STEP: PROGRESS ── */}
      {step === "progress" && (
        <div className="flex flex-1 flex-col items-center justify-center py-16">
          <Loader2 className="mb-3 h-8 w-8 animate-spin text-primary" />
          <p className="text-lg font-semibold">{progress.percent}%</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {progress.processed.toLocaleString()} / {progress.total.toLocaleString()} rows processed
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{progress.created.toLocaleString()} records created</p>
          <div className="mt-4 h-2 w-64 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </div>
      )}

      {/* ── STEP: RESULTS ── */}
      {step === "results" && result && (
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-success/30 bg-success/5 p-6 text-center">
            <CheckCircle className="mx-auto mb-2 h-10 w-10 text-success" />
            <h2 className="text-lg font-semibold">Import Complete</h2>
            <div className="mt-3 grid grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-2xl font-bold text-success">{result.created.toLocaleString()}</div>
                <div className="text-muted-foreground">Created</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">{(result.priceBackfilled ?? 0).toLocaleString()}</div>
                <div className="text-muted-foreground">Prices Updated</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-muted-foreground">{result.skipped.toLocaleString()}</div>
                <div className="text-muted-foreground">Skipped</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-destructive">{result.errors}</div>
                <div className="text-muted-foreground">Errors</div>
              </div>
            </div>
          </div>

          {/* Backfill + Refresh */}
          <div className="flex gap-3">
            <button onClick={handleBackfill} disabled={backfilling} className="flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50">
              {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Link Orphaned Sales
            </button>
            {backfillResult && <span className="self-center text-sm text-success">{backfillResult.linked} records linked</span>}
          </div>

          {/* Errors */}
          {result.errorLog.length > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
              <h3 className="mb-2 text-sm font-medium text-destructive">{result.errors} Errors</h3>
              <div className="max-h-[200px] overflow-y-auto space-y-1">
                {result.errorLog.map((e, i) => (
                  <div key={i} className="text-xs text-muted-foreground">Row {e.row}: {e.message}</div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={() => { setStep("upload"); setPreview(null); setResult(null); }} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
              Import Another File
            </button>
            <Link href="/procurement/stock-monitor" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Refresh Stock Metrics
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
