"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Package, ArrowLeft, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ─── Types ─── */
interface SerialResult {
  id: string;
  serialNumber: string;
  productId: string;
  productName: string;
  sku: string;
  status: "IN_STOCK" | "SOLD" | "RETURNED" | "DEFECTIVE" | "RTV";
  locationId: string | null;
  locationName: string | null;
  receivedAt: string | null;
  receivedSource: string | null;
  soldAt: string | null;
  saleId: string | null;
  saleNumber: string | null;
  customerName: string | null;
}

/* ─── Status Badge ─── */
const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  IN_STOCK:  { bg: "bg-emerald-500/15", text: "text-emerald-600" },
  SOLD:      { bg: "bg-blue-500/15",    text: "text-blue-600" },
  RETURNED:  { bg: "bg-purple-500/15",  text: "text-purple-600" },
  DEFECTIVE: { bg: "bg-red-500/15",     text: "text-red-600" },
  RTV:       { bg: "bg-amber-500/15",   text: "text-amber-600" },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", style.bg, style.text)}>
      {status.replace("_", " ")}
    </span>
  );
}

/* ─── Page ─── */
export default function SerialLookupPage() {
  const { token, locationId } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["serial-lookup", debouncedSearch],
    queryFn: () =>
      apiFetch<{ data: SerialResult[] }>(
        `/inventory/serials?search=${encodeURIComponent(debouncedSearch)}`,
        { token, locationId },
      ),
    enabled: !!token && debouncedSearch.length >= 2,
    staleTime: 30_000,
  });

  const results = data?.data ?? [];
  const showResults = debouncedSearch.length >= 2;
  const [returnModal, setReturnModal] = useState<SerialResult | null>(null);
  const openReturnModal = (serial: SerialResult) => setReturnModal(serial);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/inventory"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Serial Number Lookup</h1>
          <p className="text-[12px] text-muted-foreground">
            Search by serial number to find item status, location, and history.
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Enter serial number..."
          autoFocus
          className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-4 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
        />
        {isFetching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        )}
      </div>

      {/* Results */}
      {!showResults && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package size={40} className="mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            Type at least 2 characters to search serial numbers
          </p>
        </div>
      )}

      {showResults && !isLoading && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Search size={40} className="mb-3 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No serial numbers found matching &ldquo;{debouncedSearch}&rdquo;
          </p>
        </div>
      )}

      {showResults && results.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Serial Number
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Product
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    DOT
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Location
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Received
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Sold
                  </th>
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Customer
                  </th>
                  <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {results.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/20">
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs font-medium">
                      {r.serialNumber}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/inventory/${r.productId}/edit`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {r.productName}
                      </Link>
                      {r.sku && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          {r.sku}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs">
                      {(r as any).dotCode ? (
                        <span className="font-mono font-medium">
                          {(r as any).dotCode}
                          {(r as any).manufactureDate && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              ({new Date((r as any).manufactureDate).toLocaleDateString("en-PH", { month: "short", year: "numeric" })})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {r.locationName ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {r.receivedAt
                        ? new Date(r.receivedAt).toLocaleDateString()
                        : "—"}
                      {r.receivedSource && (
                        <span className="ml-1 text-[10px]">({r.receivedSource})</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {r.saleId && r.saleNumber ? (
                        <Link
                          href={`/sales/receipts/${r.saleId}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.saleNumber}
                        </Link>
                      ) : r.soldAt ? (
                        new Date(r.soldAt).toLocaleDateString()
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                      {r.customerName ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {r.status === "IN_STOCK" && (
                        <button
                          onClick={() => openReturnModal(r)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:underline"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Return to Supplier
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Return to Supplier Modal */}
      {returnModal && (
        <ReturnToSupplierModal
          serial={returnModal}
          token={token!}
          locationId={locationId}
          onClose={() => setReturnModal(null)}
        />
      )}
    </div>
  );
}

// ── Return to Supplier Modal ──

const RETURN_CONDITIONS = [
  { value: "DEFECTIVE", label: "Defective" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "EXPIRED", label: "Expired" },
  { value: "OTHER", label: "Other" },
];

function ReturnToSupplierModal({
  serial,
  token,
  locationId,
  onClose,
}: {
  serial: SerialResult;
  token: string;
  locationId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [condition, setCondition] = useState("DEFECTIVE");
  const [notes, setNotes] = useState("");
  const [draftRtv, setDraftRtv] = useState<any>(null);
  const [useExisting, setUseExisting] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ rtvNumber: string; rtvId: string } | null>(null);

  useEffect(() => {
    apiFetch<{ data: any[] }>("/suppliers", { token, locationId })
      .then((res) => setSuppliers(res.data ?? []))
      .catch(() => {});
  }, [token, locationId]);

  useEffect(() => {
    if (!supplierId) { setDraftRtv(null); return; }
    apiFetch<{ draft: any }>(
      `/procurement/supplier-returns/draft-for-supplier?supplierId=${supplierId}`,
      { token, locationId },
    )
      .then((res) => { setDraftRtv(res.draft); setUseExisting(!!res.draft); })
      .catch(() => setDraftRtv(null));
  }, [supplierId, token, locationId]);

  const handleSubmit = async () => {
    if (!supplierId) return;
    setSaving(true);
    try {
      if (useExisting && draftRtv) {
        const res = await apiFetch<{ rtvNumber: string }>(`/procurement/supplier-returns/${draftRtv.id}/add-line`, {
          token, locationId, method: "POST",
          body: { productId: serial.productId, quantity: 1, costPrice: "0.00", condition, notes: notes || null },
        });
        setSuccess({ rtvNumber: res.rtvNumber, rtvId: draftRtv.id });
      } else {
        const res = await apiFetch<{ id: string; rtvNumber: string }>("/procurement/supplier-returns", {
          token, locationId, method: "POST",
          body: {
            supplierId,
            reason: condition === "DEFECTIVE" ? "DEFECTIVE" : condition === "DAMAGED" ? "DAMAGED_ON_DELIVERY" : "OTHER",
            notes: notes || null,
            idempotencyKey: `rtv-quick-${serial.id}-${Date.now()}`,
            lines: [{ productId: serial.productId, quantity: 1, costPrice: "0.00", condition, notes: notes || null }],
          },
        });
        setSuccess({ rtvNumber: res.rtvNumber, rtvId: res.id });
      }
    } catch (err: any) {
      alert(err.message || "Failed to create return");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {success ? (
          <div className="text-center">
            <div className="mb-3 text-2xl">✅</div>
            <h3 className="text-base font-semibold">Added to {success.rtvNumber}</h3>
            <p className="mt-1 text-sm text-muted-foreground">Item queued for supplier return</p>
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Close</button>
              <button
                onClick={() => router.push(`/procurement/supplier-returns/${success.rtvId}`)}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                View RTV
              </button>
            </div>
          </div>
        ) : (
          <>
            <h3 className="mb-1 text-base font-semibold">Return to Supplier</h3>
            <p className="mb-4 text-sm text-muted-foreground">{serial.productName} — S/N: {serial.serialNumber}</p>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Supplier *</label>
                <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={fieldClass}>
                  <option value="">Select supplier…</option>
                  {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Condition *</label>
                <select value={condition} onChange={(e) => setCondition(e.target.value)} className={fieldClass}>
                  {RETURN_CONDITIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Notes</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for return…" className={fieldClass} />
              </div>
              {draftRtv && (
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={useExisting} onChange={() => setUseExisting(true)} />
                    Add to existing DRAFT ({draftRtv.rtvNumber} — {draftRtv.lineCount} items)
                  </label>
                  <label className="mt-1 flex items-center gap-2">
                    <input type="radio" checked={!useExisting} onChange={() => setUseExisting(false)} />
                    Create new DRAFT RTV
                  </label>
                </div>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">Cancel</button>
              <button onClick={handleSubmit} disabled={!supplierId || saving} className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {saving ? "Adding…" : "Add to Return"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
