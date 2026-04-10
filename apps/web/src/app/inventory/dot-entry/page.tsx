"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Circle, CheckCircle2, Search, X, Loader2, Trash2, Copy, AlertTriangle, Printer } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { useLocations } from "@/hooks/use-locations";

/* ── DOT Helpers ── */

function parseDot(code: string): { valid: boolean; week?: number; year?: number; date?: Date; label?: string; status?: string } {
  if (!/^\d{4}$/.test(code)) return { valid: false };
  const week = parseInt(code.substring(0, 2));
  const yearShort = parseInt(code.substring(2, 4));
  const year = yearShort + 2000;
  if (week < 1 || week > 52) return { valid: false };
  if (year > new Date().getFullYear()) return { valid: false };

  const jan1 = new Date(year, 0, 1);
  const date = new Date(jan1.getTime() + (week - 1) * 7 * 86400000);

  const now = new Date();
  const months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  const years = Math.floor(months / 12);
  const rem = months % 12;

  const monthName = date.toLocaleString("en-US", { month: "short" });
  const label = `${monthName} ${year}` + (years > 0 ? ` (${years}y ${rem}m)` : ` (${rem}m)`);

  let status = "ok";
  if (months >= 72) status = "expired";
  else if (months >= 60) status = "warning";
  else if (months >= 36) status = "aging";

  return { valid: true, week, year, date, label, status };
}

const STATUS_COLORS: Record<string, string> = {
  ok: "text-emerald-600",
  aging: "text-amber-500",
  warning: "text-orange-500",
  expired: "text-red-500",
};

/* ── Types ── */

interface TireProduct {
  productId: string;
  productName: string;
  sku: string;
  stockAtLocation: number;
  taggedCount: number;
  untaggedCount: number;
}

interface DotBatch {
  id: string;
  dotCode: string;
  quantity: number;
  manufactureDate: string | null;
}

/* ── Page ── */

export default function DotEntryPage() {
  const { token, locationId: defaultLocationId, apiLocationId } = useAuth();
  const qc = useQueryClient();
  const [selectedLocation, setSelectedLocation] = useState(defaultLocationId === "ALL" ? "" : defaultLocationId);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [filter, setFilter] = useState<"all" | "untagged" | "tagged">("all");

  const locationsQuery = useLocations(token);
  const locations = useMemo(() => (locationsQuery.data?.data ?? []).filter(l => l.isActive), [locationsQuery.data]);

  const tiresQuery = useQuery<{ products: TireProduct[]; summary: { totalTires: number; taggedTires: number; untaggedTires: number } }>({
    queryKey: ["dot-entry", selectedLocation],
    queryFn: () => apiFetch(`/inventory/dot-batches/entry?locationId=${selectedLocation}`, { token, locationId: apiLocationId }),
    enabled: !!token && !!selectedLocation,
  });

  const products = tiresQuery.data?.products ?? [];
  const summary = tiresQuery.data?.summary;

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const first = p.productName.split(/\s+/)[0];
      if (first) set.add(first.toUpperCase());
    }
    return [...set].sort();
  }, [products]);

  const filtered = useMemo(() => {
    let result = products;
    if (search.length >= 2) {
      const q = search.toLowerCase();
      result = result.filter(p => p.productName.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    }
    if (brandFilter) {
      result = result.filter(p => p.productName.toUpperCase().startsWith(brandFilter + " "));
    }
    if (filter === "untagged") result = result.filter(p => p.untaggedCount > 0);
    if (filter === "tagged") result = result.filter(p => p.taggedCount > 0 && p.untaggedCount === 0);
    return result;
  }, [products, search, brandFilter, filter]);

  const pct = summary && summary.totalTires > 0 ? Math.round((summary.taggedTires / summary.totalTires) * 100) : 0;

  const locationName = locations.find(l => l.id === selectedLocation)?.name ?? "";

  const handlePrintChecklist = async () => {
    if (!token || !selectedLocation || filtered.length === 0) return;
    // Fetch DOT batches for all filtered products
    const batchMap = new Map<string, DotBatch[]>();
    await Promise.all(filtered.map(async (p) => {
      try {
        const res = await apiFetch<{ data: DotBatch[] }>(`/inventory/dot-batches/entry/${p.productId}?locationId=${selectedLocation}`, { token, locationId: apiLocationId });
        batchMap.set(p.productId, res.data ?? []);
      } catch { /* skip */ }
    }));

    const date = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
    const brandLabel = brandFilter ? ` \u2014 ${brandFilter}` : "";

    const rows = filtered.map((p, i) => {
      const batches = batchMap.get(p.productId) ?? [];
      // Build DOT cells: tagged ones show code, untagged show blanks
      const dotCells: string[] = [];
      for (const b of batches) {
        for (let q = 0; q < b.quantity; q++) dotCells.push(b.dotCode);
      }
      const untagged = Math.max(0, p.stockAtLocation - dotCells.length);
      for (let u = 0; u < untagged; u++) dotCells.push("");

      const dotsHtml = dotCells.map(d =>
        d ? `<span style="font-family:monospace;font-weight:bold;font-size:11px;border:1px solid #999;padding:2px 6px;border-radius:3px;background:#f0f0f0">${d}</span>`
          : `<span style="display:inline-block;width:40px;border-bottom:1.5px solid #333;margin:0 3px">&nbsp;</span>`
      ).join(" ");

      return `<tr>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:center;font-size:11px">${i + 1}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;font-size:11px;font-weight:600">${p.productName}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;font-size:10px;font-family:monospace">${p.sku}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:center;font-size:11px">${p.stockAtLocation}</td>
        <td style="padding:4px 8px;border:1px solid #ccc;font-size:11px;white-space:nowrap">${dotsHtml}</td>
      </tr>`;
    }).join("\n");

    const html = `<!DOCTYPE html><html><head><title>DOT Checklist</title>
<style>
  @page { size: landscape; margin: 10mm; }
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 10px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  h2 { font-size: 12px; font-weight: normal; color: #666; margin: 0 0 12px; }
  table { border-collapse: collapse; width: 100%; }
  th { padding: 5px 6px; border: 1px solid #999; background: #e5e5e5; font-size: 10px; text-transform: uppercase; text-align: left; }
  @media print { body { padding: 0; } }
</style></head><body onload="window.print()">
<h1>DOT Code Checklist \u2014 ${locationName}${brandLabel}</h1>
<h2>${date} \u2022 ${filtered.length} products \u2022 ${filtered.reduce((s, p) => s + p.stockAtLocation, 0)} tires</h2>
<table>
<thead><tr><th>#</th><th>Product</th><th>SKU</th><th>Stock</th><th>DOT Codes (fill in blanks)</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[18px] font-semibold tracking-tight text-foreground">DOT Code Entry</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Enter DOT manufacture codes for existing tire inventory</p>

        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Location:</span>
            <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}
              className="h-8 rounded-lg border border-border bg-background px-3 text-[12px] font-medium outline-none">
              <option value="">Select location...</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {summary && (
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Progress:</span>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                  <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="font-semibold tabular-nums text-foreground">{summary.taggedTires} / {summary.totalTires} tires tagged ({pct}%)</span>
              </div>
            </div>
          )}
          {selectedLocation && filtered.length > 0 && (
            <button onClick={handlePrintChecklist}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
              <Printer size={13} /> Print Checklist
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {selectedLocation && (
        <div className="mb-3 flex items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tires..."
              className="h-8 w-full rounded-lg border border-border bg-background pl-9 pr-8 text-[12px] outline-none focus:border-primary/40" />
            {search && <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"><X size={12} /></button>}
          </div>
          <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
            className="h-8 rounded-lg border border-border bg-background px-3 text-[12px] font-medium outline-none">
            <option value="">All Brands</option>
            {brands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <select value={filter} onChange={e => setFilter(e.target.value as any)}
            className="h-8 rounded-lg border border-border bg-background px-3 text-[12px] font-medium outline-none">
            <option value="all">All</option>
            <option value="untagged">Untagged Only</option>
            <option value="tagged">Tagged Only</option>
          </select>
        </div>
      )}

      {/* Product list */}
      {!selectedLocation ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Circle size={28} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">Select a location to start</p>
          <p className="mt-1 text-xs text-muted-foreground">Choose a store to see its tire inventory</p>
        </div>
      ) : tiresQuery.isLoading ? (
        <div className="flex items-center justify-center py-20"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Circle size={28} className="text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground">{search ? "No matching tires" : "No tires with stock"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(product => (
            <TireProductRow
              key={product.productId}
              product={product}
              locationId={selectedLocation}
              headerLocationId={apiLocationId}
              token={token}
              onChanged={() => qc.invalidateQueries({ queryKey: ["dot-entry"] })}
            />
          ))}
        </div>
      )}

      {/* Tip */}
      {selectedLocation && filtered.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <strong>Tip:</strong> DOT code is on the tire sidewall near the bead. Look for "DOT" followed by characters — the <strong>last 4 digits</strong> are the date code. Example: DOT XXXXXX <strong>2423</strong> = Week 24, 2023
        </div>
      )}
    </div>
  );
}

/* ── Tire Product Row ── */

function TireProductRow({ product, locationId, headerLocationId, token, onChanged }: {
  product: TireProduct; locationId: string; headerLocationId: string; token: string; onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(product.untaggedCount > 0);
  const [newDot, setNewDot] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const batchesQuery = useQuery<{ data: DotBatch[] }>({
    queryKey: ["dot-batches", product.productId, locationId],
    queryFn: () => apiFetch(`/inventory/dot-batches/entry/${product.productId}?locationId=${locationId}`, { token, locationId: headerLocationId }),
    enabled: expanded,
  });

  const batches = batchesQuery.data?.data ?? [];
  const taggedQty = batches.reduce((s, b) => s + b.quantity, 0);
  const untagged = Math.max(0, product.stockAtLocation - taggedQty);
  const isComplete = untagged === 0;

  const saveMut = useMutation({
    mutationFn: (data: { dotCode: string; quantity: number }) =>
      apiFetch("/inventory/dot-batches/entry", { token, locationId, method: "POST", body: JSON.stringify({ productId: product.productId, locationId, ...data }) }),
    onSuccess: () => { batchesQuery.refetch(); onChanged(); setNewDot(""); inputRef.current?.focus(); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiFetch(`/inventory/dot-batches/entry/${id}`, { token, locationId, method: "DELETE" }),
    onSuccess: () => { batchesQuery.refetch(); onChanged(); },
  });

  const handleDotInput = (value: string) => {
    const clean = value.replace(/\D/g, "").slice(0, 4);
    setNewDot(clean);
    if (clean.length === 4) {
      const p = parseDot(clean);
      if (p.valid) saveMut.mutate({ dotCode: clean, quantity: 1 });
    }
  };

  const handleApplyToAll = () => {
    if (!newDot || newDot.length !== 4 || untagged <= 0) return;
    const p = parseDot(newDot);
    if (p.valid) saveMut.mutate({ dotCode: newDot, quantity: untagged });
  };

  return (
    <div className={cn("rounded-xl border bg-background transition-colors", isComplete ? "border-emerald-200" : "border-border")}>
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {isComplete ? <CheckCircle2 size={16} className="text-emerald-500 shrink-0" /> : <Circle size={16} className="text-muted-foreground shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{product.productName}</p>
          <p className="text-[10px] font-mono text-muted-foreground">{product.sku}</p>
        </div>
        <span className="text-xs text-muted-foreground">Stock: {product.stockAtLocation}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
          isComplete ? "bg-emerald-500/10 text-emerald-600" : untagged === product.stockAtLocation ? "bg-muted text-muted-foreground" : "bg-amber-500/10 text-amber-600")}>
          {taggedQty}/{product.stockAtLocation}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {/* Existing batches */}
          {batches.length > 0 && (
            <div className="space-y-1">
              {batches.map(b => {
                const p = parseDot(b.dotCode);
                return (
                  <div key={b.id} className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-foreground w-12">{b.dotCode}</span>
                    <span className="text-[10px] text-muted-foreground">{"\u00D7"}{b.quantity}</span>
                    {p.valid && <span className={cn("text-[10px]", STATUS_COLORS[p.status!])}>{p.label}</span>}
                    <div className="flex-1" />
                    <button onClick={() => deleteMut.mutate(b.id)} className="rounded p-0.5 text-muted-foreground hover:text-red-500"><Trash2 size={11} /></button>
                  </div>
                );
              })}
            </div>
          )}

          {/* New entry */}
          {untagged > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <input
                ref={inputRef}
                type="text"
                value={newDot}
                onChange={e => handleDotInput(e.target.value)}
                placeholder="WWYY"
                maxLength={4}
                className="w-16 rounded border border-border bg-background px-2 py-1 text-center text-xs font-mono font-bold focus:border-primary focus:outline-none"
                autoFocus
              />
              {newDot.length === 4 && (() => {
                const p = parseDot(newDot);
                if (!p.valid) return <span className="text-[10px] text-red-500 flex items-center gap-1"><AlertTriangle size={10} /> Invalid</span>;
                return <span className={cn("text-[10px]", STATUS_COLORS[p.status!])}>{p.label}</span>;
              })()}
              {untagged > 1 && newDot.length === 4 && parseDot(newDot).valid && (
                <button onClick={handleApplyToAll}
                  className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground hover:bg-muted/80">
                  <Copy size={10} /> Apply to all {untagged} empty
                </button>
              )}
              <div className="flex-1" />
              <span className="text-[10px] text-muted-foreground">{untagged} untagged</span>
            </div>
          )}

          {saveMut.isPending && <span className="text-[10px] text-muted-foreground">Saving...</span>}
        </div>
      )}
    </div>
  );
}
