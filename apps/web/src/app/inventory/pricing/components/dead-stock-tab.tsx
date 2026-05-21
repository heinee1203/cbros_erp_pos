import { useCallback, useMemo, useState } from "react";
import { Check, ChevronsDown, Loader2, Search, X } from "lucide-react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DeadStockPage } from "../types";
import { fmtCurrency } from "../utils";

export function DeadStockTab() {
  const { token, apiLocationId: locationId } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery<DeadStockPage>({
    queryKey: ["dead-stock-clearance"],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("status", "DEAD_STOCK");
      params.set("limit", "100");
      if (pageParam) params.set("cursor", pageParam as string);
      return apiFetch<DeadStockPage>(`/inventory/stock-monitor?${params.toString()}`, { token: token!, locationId });
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: !!token,
  });

  const rawRows = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

  const uniqueBrands = useMemo(
    () => [...new Set(rawRows.map((row) => row.brandName).filter(Boolean))].sort() as string[],
    [rawRows],
  );
  const uniqueCategories = useMemo(
    () => [...new Set(rawRows.map((row) => row.categoryName).filter(Boolean))].sort() as string[],
    [rawRows],
  );

  const enrichedRows = useMemo(() => {
    let filtered = rawRows;
    if (search.length >= 2) {
      const query = search.toLowerCase();
      filtered = filtered.filter(
        (row) => row.productName.toLowerCase().includes(query) || row.productSku.toLowerCase().includes(query),
      );
    }
    if (brandFilter) filtered = filtered.filter((row) => row.brandName === brandFilter);
    if (categoryFilter) filtered = filtered.filter((row) => row.categoryName === categoryFilter);

    return filtered
      .map((row) => {
        const cost = Number(row.costPrice) || 0;
        const days = Number(row.daysSinceLastSale) || 9999;
        let clearancePrice: number;
        if (days > 365) clearancePrice = Math.round(cost * 0.5);
        else if (days > 180) clearancePrice = Math.round(cost);
        else if (days > 90) clearancePrice = Math.round(cost * 1.1);
        else clearancePrice = Math.round(cost * 1.2);
        const stock = Number(row.totalStock) || 0;
        const recovery = clearancePrice * stock;
        const capitalTied = cost * stock;
        return { ...row, cost, days, clearancePrice, stock, recovery, capitalTied };
      })
      .sort((a, b) => b.days - a.days);
  }, [rawRows, search, brandFilter, categoryFilter]);

  const capitalTied = enrichedRows.reduce((sum, row) => sum + row.capitalTied, 0);
  const potentialRecovery = enrichedRows.reduce((sum, row) => sum + row.recovery, 0);
  const oldestDays = enrichedRows.length > 0 ? enrichedRows[0].days : 0;

  const applyMut = useMutation({
    mutationFn: async ({ productId, price }: { productId: string; price: number }) =>
      apiFetch(`/products/${productId}`, {
        token: token!,
        locationId,
        method: "PATCH",
        body: JSON.stringify({ unitPrice: String(price) }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dead-stock-clearance"] });
      setEditingId(null);
    },
  });

  const handleApplySelected = useCallback(async () => {
    for (const row of enrichedRows.filter((candidate) => selected.has(candidate.productId))) {
      await applyMut.mutateAsync({ productId: row.productId, price: row.clearancePrice });
    }
    setSelected(new Set());
  }, [enrichedRows, selected, applyMut]);

  const toggleSelect = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((current) =>
      current.size === enrichedRows.length ? new Set() : new Set(enrichedRows.map((row) => row.productId)),
    );
  };

  function fmtLastSold(days: number | null): { text: string; color: string } {
    if (!days || days >= 9999) return { text: "Never", color: "text-red-500" };
    if (days > 365) return { text: `${Math.round(days / 30)}mo ago`, color: "text-red-500" };
    if (days > 180) return { text: `${Math.round(days / 30)}mo ago`, color: "text-red-400" };
    if (days > 90) return { text: `${days}d ago`, color: "text-amber-500" };
    return { text: `${days}d ago`, color: "text-muted-foreground" };
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-4 gap-3 border-b border-border bg-background/50 px-6 py-4">
        {[
          { label: "Dead Items", value: enrichedRows.length.toLocaleString() },
          { label: "Capital Tied Up", value: "\u20B1" + fmtCurrency(capitalTied) },
          { label: "Potential Recovery", value: "\u20B1" + fmtCurrency(potentialRecovery) },
          { label: "Oldest Item", value: oldestDays > 0 ? `${oldestDays} days` : "\u2014" },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border border-border bg-background p-3">
            <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{card.label}</div>
            <div className="mt-1 text-lg font-bold tabular-nums text-foreground">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="space-y-2 border-b border-border bg-background/50 px-6 py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[150px] flex-1">
            <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search..."
              className="h-7 w-full rounded border border-border bg-background pl-8 pr-6 text-[11px] outline-none focus:border-primary/40"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X size={10} />
              </button>
            )}
          </div>
          <select
            value={brandFilter}
            onChange={(event) => setBrandFilter(event.target.value)}
            className="h-7 rounded border border-border bg-background px-2 text-[11px] outline-none"
          >
            <option value="">All Brands</option>
            {uniqueBrands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-7 rounded border border-border bg-background px-2 text-[11px] outline-none"
          >
            <option value="">All Categories</option>
            {uniqueCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        {selected.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium">{selected.size} selected</span>
            <button
              onClick={handleApplySelected}
              disabled={applyMut.isPending}
              className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {applyMut.isPending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
              Apply Clearance Prices
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">Failed to load dead stock</div>
        ) : enrichedRows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <Check size={32} className="text-emerald-500" />
            <p className="text-sm font-medium">No dead stock found</p>
            <p className="text-xs text-muted-foreground">All items have recent sales activity</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5">
                  <input
                    type="checkbox"
                    checked={selected.size === enrichedRows.length && enrichedRows.length > 0}
                    onChange={toggleAll}
                    className="accent-primary"
                  />
                </th>
                <th className="px-3 py-1.5 font-medium">Product</th>
                <th className="px-3 py-1.5 font-medium">Brand</th>
                <th className="px-3 py-1.5 font-medium">Category</th>
                <th className="px-3 py-1.5 text-right font-medium">Stock</th>
                <th className="px-3 py-1.5 text-right font-medium">Cost</th>
                <th className="px-3 py-1.5 text-right font-medium">Sell Price</th>
                <th className="px-3 py-1.5 text-right font-medium">Last Sold</th>
                <th className="px-3 py-1.5 text-right font-medium">Clearance</th>
                <th className="px-3 py-1.5 text-right font-medium">Recovery</th>
                <th className="px-3 py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enrichedRows.map((row, idx) => {
                const sold = fmtLastSold(row.days);
                const isEditing = editingId === row.productId;
                return (
                  <tr key={row.id ?? idx} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(row.productId)}
                        onChange={() => toggleSelect(row.productId)}
                        className="accent-primary"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-foreground">{row.productName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">SKU: {row.productSku}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{row.brandName ?? "\u2014"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                      {row.categoryName ?? "\u2014"}
                    </td>
                    <td
                      className={cn(
                        "whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums",
                        row.stock > 10 ? "font-semibold text-red-500" : "",
                      )}
                    >
                      {row.stock.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums">
                      {"\u20B1"}{fmtCurrency(row.cost)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editPrice}
                          autoFocus
                          onChange={(event) => setEditPrice(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && editPrice) {
                              applyMut.mutate({ productId: row.productId, price: Number(editPrice) });
                            }
                            if (event.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => setEditingId(null)}
                          className="w-24 rounded border border-primary bg-background px-1.5 py-0.5 text-right text-xs outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(row.productId);
                            setEditPrice(String(Number(row.avgSellingPrice) || 0));
                          }}
                          className="tabular-nums hover:text-emerald-600 hover:underline"
                        >
                          {"\u20B1"}{fmtCurrency(row.avgSellingPrice)}
                        </button>
                      )}
                    </td>
                    <td className={cn("whitespace-nowrap px-3 py-2 text-right text-xs font-medium", sold.color)}>
                      {sold.text}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums">
                      <button
                        onClick={() => {
                          setEditingId(row.productId);
                          setEditPrice(String(row.clearancePrice));
                        }}
                        className="text-amber-600 hover:underline"
                      >
                        {"\u20B1"}{row.clearancePrice.toLocaleString()}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium tabular-nums text-emerald-600">
                      {"\u20B1"}{row.recovery.toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => applyMut.mutate({ productId: row.productId, price: row.clearancePrice })}
                        disabled={applyMut.isPending}
                        className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20 disabled:opacity-50"
                      >
                        Apply
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="border-t border-border bg-background px-6 py-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{enrichedRows.length} dead stock items</span>
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex items-center gap-1 rounded bg-muted px-3 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
            >
              {isFetchingNextPage ? <Loader2 size={12} className="animate-spin" /> : <ChevronsDown size={12} />}
              Load More
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
