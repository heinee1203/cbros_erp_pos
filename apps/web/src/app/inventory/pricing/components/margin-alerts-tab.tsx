import { useMemo, useState } from "react";
import { Check, ChevronsDown, Loader2 } from "lucide-react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/app/auth-context";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MarginAlertPage } from "../types";
import { fmtCurrency, fmtPct } from "../utils";

type SortField = "marginPct" | "costPrice" | "sellPrice" | "stock";

export function MarginAlertsTab() {
  const { token, apiLocationId: locationId } = useAuth();
  const qc = useQueryClient();
  const [threshold, setThreshold] = useState(15);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [sortBy, setSortBy] = useState<SortField>("marginPct");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
  } = useInfiniteQuery<MarginAlertPage>({
    queryKey: ["margin-alerts", threshold, inStockOnly],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set("threshold", String(threshold));
      params.set("limit", "100");
      params.set("inStockOnly", String(inStockOnly));
      if (pageParam) params.set("cursor", pageParam as string);
      return apiFetch<MarginAlertPage>(
        `/inventory/pricing/margin-alerts?${params.toString()}`,
        { token: token!, locationId },
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    enabled: !!token,
  });

  const rawRows = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

  const uniqueCategories = useMemo(
    () => [...new Set(rawRows.map((row) => row.categoryName).filter(Boolean))].sort() as string[],
    [rawRows],
  );
  const uniqueBrands = useMemo(
    () => [...new Set(rawRows.map((row) => row.brandName).filter(Boolean))].sort() as string[],
    [rawRows],
  );

  const rows = useMemo(() => {
    let filtered = rawRows;
    if (categoryFilter) filtered = filtered.filter((row) => row.categoryName === categoryFilter);
    if (brandFilter) filtered = filtered.filter((row) => row.brandName === brandFilter);
    return [...filtered].sort((a, b) => {
      const va = Number(a[sortBy]) || 0;
      const vb = Number(b[sortBy]) || 0;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [rawRows, categoryFilter, brandFilter, sortBy, sortDir]);

  const losingMoney = rows.filter((row) => Number(row.marginPct) < 0).length;
  const totalGap = rows.reduce((sum, row) => {
    const cost = Number(row.costPrice) || 0;
    const stock = Number(row.stock) || 0;
    const suggested = cost > 0 ? cost / (1 - threshold / 100) : 0;
    const current = Number(row.sellPrice) || 0;
    return sum + Math.max(0, (suggested - current) * stock);
  }, 0);

  const saveMut = useMutation({
    mutationFn: async ({ id, price }: { id: string; price: string }) => {
      await apiFetch(`/products/${id}`, {
        token: token!,
        locationId,
        method: "PATCH",
        body: JSON.stringify({ unitPrice: price }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["margin-alerts"] });
      setEditingId(null);
    },
  });

  const handleSort = (field: SortField) => {
    if (field === sortBy) setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortDir(field === "marginPct" ? "asc" : "desc");
    }
  };

  function SortTh({ label, field, align = "right" }: { label: string; field: SortField; align?: string }) {
    const active = sortBy === field;
    return (
      <th
        onClick={() => handleSort(field)}
        className={cn(
          "cursor-pointer select-none whitespace-nowrap px-4 py-1.5 font-medium transition-colors hover:text-foreground",
          align === "right" ? "text-right" : "text-left",
          active && "text-foreground",
        )}
      >
        {label} {active && (sortDir === "asc" ? "\u25B2" : "\u25BC")}
      </th>
    );
  }

  function marginCellClass(pct: number): string {
    if (pct < -25) return "bg-red-600 text-white font-bold";
    if (pct < 0) return "bg-red-100 text-red-700 font-semibold";
    if (pct < 5) return "bg-amber-100 text-amber-700 font-semibold";
    return "bg-yellow-50 text-yellow-700 font-semibold";
  }

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border bg-background/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-muted-foreground">Threshold:</label>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(event) => setThreshold(parseInt(event.target.value) || 0)}
              className="h-8 w-20 rounded-md border border-border bg-background px-2.5 text-xs tabular-nums text-foreground outline-none focus:border-primary"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(event) => setInStockOnly(event.target.checked)}
              className="h-3.5 w-3.5 rounded accent-primary"
            />
            In-stock only
          </label>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-medium outline-none"
          >
            <option value="">All Categories</option>
            {uniqueCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select
            value={brandFilter}
            onChange={(event) => setBrandFilter(event.target.value)}
            className="h-8 rounded-md border border-border bg-background px-2 text-[11px] font-medium outline-none"
          >
            <option value="">All Brands</option>
            {uniqueBrands.map((brand) => (
              <option key={brand} value={brand}>
                {brand}
              </option>
            ))}
          </select>
        </div>
        {rows.length > 0 && (
          <div className="flex items-center gap-4 text-xs">
            <span className="font-medium text-amber-600">{"\u26A0\uFE0F"} {rows.length} items below {threshold}%</span>
            <span className="font-medium text-red-500">{"\uD83D\uDD34"} {losingMoney} losing money</span>
            <span className="text-muted-foreground">
              {"\uD83D\uDCB0"} Revenue gap: {"\u20B1"}{Math.round(totalGap).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex h-64 items-center justify-center text-sm text-destructive">Failed to load margin alerts</div>
        ) : rows.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
            <Check size={32} className="text-emerald-500" />
            <p className="text-sm font-medium text-foreground">All margins look healthy</p>
            <p className="text-xs text-muted-foreground">No items with margins below {threshold}%</p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-1.5 font-medium">Product</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">Brand</th>
                <th className="whitespace-nowrap px-4 py-1.5 font-medium">Category</th>
                <SortTh label="Stock" field="stock" />
                <SortTh label="Cost" field="costPrice" />
                <SortTh label="Sell Price" field="sellPrice" />
                <SortTh label="Margin" field="marginPct" />
                <th className="whitespace-nowrap px-4 py-1.5 text-right font-medium">Suggested</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row, idx) => {
                const cost = Number(row.costPrice) || 0;
                const sell = Number(row.sellPrice) || 0;
                const margin = Number(row.marginPct) || 0;
                const suggested = cost > 0 ? Math.ceil(cost / (1 - threshold / 100)) : 0;
                const isEditing = editingId === (row.id ?? idx);
                return (
                  <tr key={row.id ?? idx} className="hover:bg-muted/30">
                    <td className="px-4 py-1.5">
                      <div className="text-sm font-medium text-foreground">{row.productName}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">SKU: {row.sku}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-xs text-foreground">{row.brandName ?? "\u2014"}</td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-xs text-muted-foreground">
                      {row.categoryName ?? "\u2014"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right text-xs tabular-nums text-foreground">
                      {(Number(row.stock) || 0).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right text-sm tabular-nums">
                      {"\u20B1"}{fmtCurrency(cost)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right text-sm tabular-nums">
                      {isEditing ? (
                        <input
                          type="number"
                          value={editPrice}
                          autoFocus
                          onChange={(event) => setEditPrice(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" && editPrice) {
                              saveMut.mutate({ id: row.id ?? row.productId, price: editPrice });
                            }
                            if (event.key === "Escape") setEditingId(null);
                          }}
                          onBlur={() => {
                            if (editPrice && editPrice !== String(sell)) {
                              saveMut.mutate({ id: row.id ?? row.productId, price: editPrice });
                            } else {
                              setEditingId(null);
                            }
                          }}
                          className="w-28 rounded border border-primary bg-background px-2 py-1 text-right text-xs tabular-nums outline-none"
                        />
                      ) : (
                        <button
                          onClick={() => {
                            setEditingId(row.id ?? String(idx));
                            setEditPrice(String(sell));
                          }}
                          className="cursor-pointer tabular-nums text-foreground transition-colors hover:text-emerald-600 hover:underline"
                        >
                          {"\u20B1"}{fmtCurrency(sell)}
                        </button>
                      )}
                    </td>
                    <td className={cn("whitespace-nowrap rounded-md px-4 py-2 text-right text-xs tabular-nums", marginCellClass(margin))}>
                      {fmtPct(margin)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-1.5 text-right text-xs tabular-nums text-muted-foreground">
                      {suggested > 0 ? (
                        <button
                          onClick={() => {
                            setEditingId(row.id ?? String(idx));
                            setEditPrice(String(suggested));
                          }}
                          className="cursor-pointer transition-colors hover:text-emerald-600 hover:underline"
                        >
                          {"\u20B1"}{suggested.toLocaleString()}
                        </button>
                      ) : (
                        "\u2014"
                      )}
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
          <span>
            {rows.length} item{rows.length !== 1 ? "s" : ""} below {threshold}% margin
          </span>
          {hasNextPage && (
            <button
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="flex items-center gap-1.5 rounded-md bg-muted px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {isFetchingNextPage ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <ChevronsDown size={12} />
              )}
              Load More
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
