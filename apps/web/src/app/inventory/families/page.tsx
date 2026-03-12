"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Layers, Search, ArrowUpDown, Plus, Hash, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/app/auth-context";
import { useProductFamilies } from "@/hooks/use-products";

type SortKey = "name" | "productCount";
type SortDir = "asc" | "desc";

export default function FamiliesPage() {
  const { token, locationId } = useAuth();
  const familiesQuery = useProductFamilies(token, locationId);
  const families = familiesQuery.data?.data ?? [];

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const filtered = useMemo(() => {
    let result = families;
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q) || f.slug.includes(q));
    }
    result = [...result].sort((a, b) => {
      const aVal = a[sortKey]; const bVal = b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
    return result;
  }, [families, search, sortKey, sortDir]);

  const totalProducts = families.reduce((sum, f) => sum + (f.productCount ?? 0), 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  if (familiesQuery.isLoading) {
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col">
        <div className="mb-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Layers size={16} className="text-primary" /></div>
            <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Product Families</h1>
          </div>
          <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Group related products by brand or product line for catalog organization.</p>
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col">
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/[0.06]"><Layers size={16} className="text-primary" /></div>
              <h1 className="text-[18px] font-semibold tracking-tight text-foreground">Product Families</h1>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">Group related products by brand or product line for catalog organization.</p>
          </div>
          <button className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 active:scale-[0.98]"><Plus size={14} strokeWidth={2.5} />Create Family</button>
        </div>
        <div className="mt-4 flex gap-5">
          <div className="flex items-center gap-2 text-[13px]"><div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Layers size={11} className="text-muted-foreground" /></div><span className="text-muted-foreground">Families</span><span className="font-semibold tabular-nums text-foreground">{families.length}</span></div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-[13px]"><div className="flex h-5 w-5 items-center justify-center rounded bg-muted"><Hash size={11} className="text-muted-foreground" /></div><span className="text-muted-foreground">Total SKUs Grouped</span><span className="font-semibold tabular-nums text-foreground">{totalProducts}</span></div>
        </div>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search families by name or slug..." className="h-9 w-full rounded-lg border border-border bg-background pr-3 text-[13px] text-foreground shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] outline-none placeholder:text-muted-foreground/60 transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/[0.08]" style={{ paddingLeft: "2.125rem" }} />
        </div>
        <button onClick={() => toggleSort("name")} className={cn("flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors", sortKey === "name" ? "border-primary/20 bg-primary/[0.04] text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
          <ArrowUpDown size={12} />Name{sortKey === "name" && <span className="text-[10px] text-muted-foreground">{sortDir === "asc" ? "A-Z" : "Z-A"}</span>}
        </button>
        <button onClick={() => toggleSort("productCount")} className={cn("flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-medium shadow-[0_1px_2px_0_rgba(0,0,0,0.04)] transition-colors", sortKey === "productCount" ? "border-primary/20 bg-primary/[0.04] text-foreground" : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground")}>
          <ArrowUpDown size={12} />Products{sortKey === "productCount" && <span className="text-[10px] text-muted-foreground">{sortDir === "asc" ? "Low" : "High"}</span>}
        </button>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-background shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
        <div className="flex items-center border-b border-border bg-muted/40 px-4 py-2">
          <div className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Family</div>
          <div className="w-28 text-right text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Products</div>
        </div>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"><Search size={16} className="text-muted-foreground" /></div>
            <p className="mt-3 text-[13px] font-medium text-foreground">No families found</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Try adjusting your search query</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((f) => (
              <Link key={f.slug} href={`/inventory/families/${f.slug}`} className="group flex w-full items-center px-4 py-3 text-left transition-colors duration-100 hover:bg-accent/60 active:bg-accent">
                <div className="flex flex-1 items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/80 transition-colors group-hover:bg-muted"><Tag size={14} className="text-muted-foreground" /></div>
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium leading-tight text-foreground truncate">{f.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] leading-tight text-muted-foreground truncate">{f.slug}</div>
                  </div>
                </div>
                <div className="w-28 text-right"><span className="inline-flex items-center justify-center rounded-md bg-primary/[0.06] px-2.5 py-1 text-[12px] font-semibold tabular-nums text-foreground">{f.productCount}</span></div>
              </Link>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-2">
          <span className="text-[11px] text-muted-foreground">Showing {filtered.length} of {families.length} families</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{totalProducts} products grouped</span>
        </div>
      </div>
    </div>
  );
}
